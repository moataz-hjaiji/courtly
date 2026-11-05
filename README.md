# Courtly — sports court booking

## Run it

```bash
git clone <this repo> && cd courtly-procimo
docker compose up
```

- App: http://localhost:8080
- API (through the same origin): http://localhost:8080/api — e.g. `/api/health`
- Postgres: `localhost:5433` (user/password/db: `courtly`)

The API container runs migrations and the seed on start (both idempotent), then serves.

### Seeded accounts (password `password123` for all)

| Email | Role |
|---|---|
| admin@courtly.test | admin |
| alice@courtly.test | user |
| bob@courtly.test | user |

Seeded courts: Padel 1, Padel 2, Tennis Center (active), Old Squash (inactive), plus bookings around today.
All times are UTC.

### Tests

```bash
docker compose --profile test run --rm api-test
```

Runs the API test suite (Vitest + supertest) against a real Postgres database (`courtly_test`).
Locally: `docker compose up -d db && cd api && npm ci && npm test`.

### Without Docker for the apps (dev mode)

```bash
docker compose up -d db
cd api && npm ci && npm run migrate && npm run seed && npm run dev   # :3000 (PORT=... to change)
cd web && npm ci && npm run dev                                       # :5173 (API_URL=http://localhost:<port> if not 3000)
```

## API

All errors are `{ "error": { "code", "message" } }`. 400 invalid input, 401 not logged in, 403 wrong role,
404 not found (or not yours), 409 conflict (slot taken, already cancelled), 422 business rule (opening hours,
past booking, cancellation window).

| Method | Path | Who | |
|---|---|---|---|
| POST | /auth/login | anyone | `{ email, password }` → `{ token, user }` |
| GET | /auth/me | logged in | |
| GET | /courts | logged in | users: active only; admins: all |
| GET | /courts/:id/availability?date=YYYY-MM-DD | logged in | 1h slots: available / taken / past |
| POST | /courts | admin | create |
| PATCH | /courts/:id | admin | edit; `{ isActive: false }` deactivates |
| POST | /bookings | logged in | `{ courtId, date, startHour, hours: 1 \| 2 }` |
| GET | /bookings/mine | logged in | `{ upcoming, past }` |
| POST | /bookings/:id/cancel | owner | until 2h before start |
| GET | /admin/bookings?date=YYYY-MM-DD | admin | day's bookings + `totalRevenueCents` |
| GET | /events | anyone | SSE: `availability` events `{ courtId, date }` |
| POST | /waitlist | logged in | `{ courtId, date, startHour, hours }` — only for a slot booked by someone else |
| GET | /waitlist/mine | logged in | entries with `status` and `position` in line |
| POST | /waitlist/:id/leave | owner | stop waiting |

## Stack choices

**React + Vite, not Next.js.** Everything sits behind a login, so server-side rendering and SEO bring nothing, and the
brief requires a separate backend anyway, which leaves Next's route handlers and server components unused. A plain
Vite SPA is one static bundle that nginx serves next to the API. The trade-off is no SSR and no file-based routing;
with four screens, simple tab state is enough.

**Express, not NestJS.** The API has about a dozen endpoints. In Express every request path is visible in one file:
route → zod validation → SQL → JSON, with no decorators, DI container or module wiring to trace. That makes the code
easy to change during a review. Express 5 also forwards errors from async handlers to the error middleware natively.
The trade-off is that structure is by convention, not enforced; Nest's modules and DI pay off with a larger team or
codebase.

**PostgreSQL with plain SQL (`pg`), no ORM.** The core rule, no overlapping bookings, can be a database invariant in
Postgres thanks to exclusion constraints over time ranges; MySQL and MongoDB have no equivalent. Since the key schema
feature is raw SQL anyway (`EXCLUDE USING gist`, `tstzrange`), an ORM would add a layer without hiding much. The
trade-off is hand-mapping columns (`AS "camelCase"` in the queries) and no generated types for query results.

## Where each rule lives

| Rule | Enforced in |
|---|---|
| No double bookings, also under concurrency | `bookings_no_overlap` exclusion constraint — [api/migrations/001_init.sql](api/migrations/001_init.sql) |
| Booking is 1 or 2 hours, starts on the hour | `CHECK` constraints in the same migration, plus zod in [bookings.ts](api/src/routes/bookings.ts) |
| Within opening hours, not in the past, court active | `checkSlotRules` in [slots.ts](api/src/slots.ts), used by booking and waitlist, with the court row locked |
| Cancel up to 2h before start | One atomic `UPDATE` in `POST /bookings/:id/cancel` |
| Deactivating keeps history | No `DELETE` route; `PATCH { isActive: false }` — [courts.ts](api/src/routes/courts.ts) |
| Price changes don't alter past revenue | `price_cents` is copied onto each booking when it is made |
| Waitlist: auto-promotion on cancellation | `promoteWaitlist` in [waitlist.ts](api/src/routes/waitlist.ts), inside the cancel transaction |
| Roles enforced by the API | `requireAuth` / `requireAdmin` middleware — [auth.ts](api/src/auth.ts) |

## How double bookings are prevented

The guarantee lives in the database, in one constraint on the `bookings` table:

```sql
CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
  court_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status = 'confirmed')
```

It means: no two rows may have the same `court_id` **and** overlapping time ranges (`&&`). Postgres checks it inside
the insert itself, atomically, using a GiST index. When two requests insert overlapping bookings at the same instant,
the second insert waits for the first transaction, then fails with SQLSTATE `23P01`. The API turns that into
`409 SLOT_TAKEN` (see `POST /bookings` in [bookings.ts](api/src/routes/bookings.ts)).

Why this design:
- **Check-then-insert in the app is not enough.** Two requests can both read "slot free" before either one inserts.
  Only the database sees every write in order.
- **Ranges, not one row per slot.** A 2-hour booking 14:00–16:00 automatically conflicts with 15:00–16:00. A unique
  index on `(court_id, start_at)` would miss that overlap. The `[)` bound (end excluded) keeps back-to-back bookings
  (10–11, 11–12) legal.
- **Partial constraint (`WHERE status = 'confirmed'`).** Cancelling a booking frees the slot while the row stays as
  history.
- **It holds whatever writes the data:** several API instances, a script, or someone in `psql`.

The tests prove it: 20 parallel requests for one slot give exactly one `201` and nineteen `409`s, and a direct SQL
insert that bypasses the API is rejected too ([api/test/bookings.test.ts](api/test/bookings.test.ts)).

Two related races are closed the same way, by letting Postgres order things:
- **Booking a court while an admin deactivates it.** The booking transaction reads the court `FOR SHARE`, so the
  admin's update waits for the booking (or the booking waits and then sees the court as inactive). A test holds an
  uncommitted deactivation and checks that the booking blocks, then fails with 404.
- **Cancelling right at the 2-hour limit, or twice at once.** Ownership, status and the time limit are all in the
  `WHERE` clause of a single `UPDATE`, so checking and changing happen together.

## Bonus features

The brief asks candidates to pick **at most one** bonus. This reference solution implements all three (real-time
availability, the waitlist and the performance note) so students can study each one. In a real submission, pick one and finish it well.

### Real-time availability

`GET /api/events` is a Server-Sent Events stream. After a booking is created or cancelled, the API sends
`event: availability` with `{ courtId, date }`. The booking page listens with `EventSource`, and when the change
matches the court and date on screen, it refetches the slots. If someone takes the slot you selected, the selection
disappears.

- **Why SSE, not WebSockets:** updates only flow server → browser. SSE is plain HTTP, reconnects on its own and needs
  no library on either side. nginx only needs `proxy_buffering off`.
- **Why the stream needs no login:** `EventSource` can't send an `Authorization` header, and putting the JWT in the
  URL would leak it into logs. The event holds no personal data, only "court X on day Y changed", and the page reloads
  the slots through the normal authenticated endpoint.
- **Limit:** events go through an in-process `EventEmitter`, so they only reach clients connected to the same API
  instance. With several instances, Postgres `LISTEN/NOTIFY` would fan them out with no new infrastructure.

### Waitlist

When a slot is booked by someone else, a user can click it and **join the waitlist** (for 1 or 2 hours). The same
rules as booking apply: opening hours, not in the past, court active. You can't wait for a free slot (just book it) or
for your own booking. When the booking is cancelled, the oldest waiter whose time now fits **gets the booking
automatically**; *My bookings* shows the entry as promoted and the new booking appears under *Upcoming*.

How it is built ([api/migrations/002_waitlist.sql](api/migrations/002_waitlist.sql),
[api/src/routes/waitlist.ts](api/src/routes/waitlist.ts)):
- **Same transaction as the cancellation.** The freed slot is never visible as free to anyone else before the
  waiter gets it.
- **A promotion is a normal booking insert,** so the exclusion constraint still decides what fits. Someone waiting
  for 10:00–12:00 when only 10:00–11:00 was freed is skipped (the insert fails with `23P01` inside a savepoint), and
  the next person in line is tried.
- **No double promotion under concurrency.** Each entry is locked with `FOR UPDATE SKIP LOCKED` inside its own
  savepoint. Two cancellations at the same moment can't promote the same entry, and a failed attempt releases its lock
  immediately (`ROLLBACK TO SAVEPOINT`), so it can't hide the entry from the other cancellation. A test cancels both
  hours of a 2h waiter's slot at once and checks they get exactly one booking.
- **One active entry per user and slot,** enforced by a partial unique index (`WHERE status = 'waiting'`).
- `position` is computed on read (how many waiting entries on that court overlap yours and are older), so there is
  no stored order to keep in sync.

### Performance note

```bash
docker compose --profile test run --rm api-test npm run perf
```

[api/test/perf.ts](api/test/perf.ts) fills a separate `courtly_perf` database (your demo data is untouched) with
**131,000 bookings**: 20 courts × 731 days (a year back, a year ahead) × 15 hours, 60% of slots booked, 10% of those
cancelled. It then calls the real endpoints 500 times each, with random courts and days, and runs `EXPLAIN ANALYZE` on
the exact SQL they sent.

Results (Docker on an Apple M3 Pro laptop; your numbers will vary a little):

| Endpoint | p50 | p95 | DB execution time | Same query without indexes |
|---|---|---|---|---|
| `GET /courts/:id/availability` | 0.7 ms | 1.5 ms | 0.03 ms | 17 ms |
| `GET /admin/bookings?date=` (day view, ~180 rows) | 2.0 ms | 3.2 ms | 0.26 ms | 6.5 ms |

Latency is end to end through the HTTP server, including JWT check, validation and JSON. Why it stays fast:
- **Availability** reads one court for one day. It uses the GiST index that the `bookings_no_overlap` constraint
  already created (`Bitmap Index Scan on bookings_no_overlap`), so the guarantee against double bookings doubles as
  the index for this query. It touches about 10 rows, not 131,000.
- **Admin day view** uses `bookings_start_idx` on `start_at` for the day's range, then joins courts and users by
  primary key.
- Both cost grows with *bookings per day*, not with total history. Without indexes Postgres has to scan the whole
  table, which is already 25–600× slower at this size and keeps growing with every booking.

## What I would do next

1. **Facility time zone.** Everything runs in UTC now. Add a `timezone` setting and convert opening hours and "today"
   with a time-zone library, testing a daylight-saving day where a day has 23 or 25 hours.
2. **Rules for existing bookings when a court changes.** Deactivating a court or shortening its hours leaves future
   bookings that no longer fit. The admin should see them and choose to keep or cancel them (with a notification).
3. **Safer sessions.** Move the JWT from `localStorage` to an `httpOnly` cookie with a refresh token, add rate
   limiting on `/auth/login`, and refuse to start in production without a real `JWT_SECRET`.
4. **Real-time across instances** with Postgres `LISTEN/NOTIFY`, and on the booking page a "live" indicator that
   reloads after a reconnect.
5. **Frontend tests.** Vitest + Testing Library for the booking flow (select slot → 2h disabled when next slot is
   taken → 409 message), plus one Playwright end-to-end test against `docker compose up`.
6. **Waitlist notifications.** Promotion happens silently today; send an email or push message, and let people
   choose to be asked first (with a time limit) instead of being booked automatically.
7. **API polish.** Pagination for "my bookings", an OpenAPI spec generated from the zod schemas, and an admin cancel
   with a reason.
