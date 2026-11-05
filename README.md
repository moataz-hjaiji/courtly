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
docker compose --profile test run --rm api-test   # backend: 47 tests against a real Postgres
docker compose --profile test run --rm web-test   # frontend: 64 tests in jsdom
```

- **Backend** (Vitest + supertest) runs against a real Postgres database (`courtly_test`), because the
  double-booking and race tests only prove something against the real constraint and locks.
  Locally: `docker compose up -d db && cd api && npm ci && npm test`.
- **Frontend** (Vitest + Testing Library + jsdom) renders each page against a small fake API
  ([web/src/test/fakes.ts](web/src/test/fakes.ts)) with a fixed clock, and clicks through it like a user: booking
  1h/2h, joining and leaving the waitlist, live updates, cancel errors, admin revenue, court forms, role-based tabs.
  The slot-grid rules are pure functions ([web/src/utils/grid.ts](web/src/utils/grid.ts)) with their own unit tests.
  Locally: `cd web && npm ci && npm test`.

### Frontend structure

```
web/src/
  api/         client.ts (fetch wrapper, token, ApiError) · types.ts (API shapes)
  utils/       format.ts (money, hours, UTC dates) · calendar.ts (month grid) · grid.ts (pure rules: book / waitlist / 2h / labels)
  hooks/       useAvailability.ts (slots + my waitlist, refreshed by the live event stream)
  components/  Logo, Badge, Alert, PageHeader, Empty, DayPicker, MonthCalendar, SlotGrid, BookingSummary,
               BookingTable, WaitlistTable, CourtForm
  pages/       Login, BookCourt, MyBookings, AdminCourts, AdminDay (state + layout only)
  test/        setup.ts (fixed clock, fake EventSource) · fakes.ts (fake API + test data)
```

Tests sit next to the code they test (`grid.test.ts` beside `grid.ts`).

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
| Deactivating cancels future bookings | Same `PATCH`, in one transaction: future confirmed bookings → `cancelled` with `cancel_reason = 'court_deactivated'`, waitlist entries → `cancelled`. Past and running bookings stay. The admin confirms first (UI shows the count). |
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

**Question:** do the two busiest read queries, availability and the admin day view, stay fast with a lot of data?
**Answer:** yes. With 131,000 bookings, a typical request takes **under 1 ms** (availability) and **2 ms** (day view).

#### Run it yourself

```bash
docker compose up -d db
docker compose --profile test run --rm api-test npm run perf
```

It takes about 15 seconds. It uses its own database, `courtly_perf`, so the demo data in `courtly` is not touched.

#### Test setup

| | |
|---|---|
| Date of run | 5 November 2026 |
| Machine | Apple M3 Pro laptop, Docker 29.7 |
| Database | PostgreSQL 17.11 (`postgres:17-alpine`) |
| API | Node 24 (`node:24-alpine`), Express 5, in the same container as the measuring script |

#### Dataset

| | |
|---|---|
| Bookings | **131,058** (118,359 confirmed, 12,699 cancelled) |
| Courts | 20 (open 08:00–23:00) |
| Users | 100 |
| Time span | 731 days: one year back and one year ahead |
| Fill rate | 60% of all slots booked |
| Time to seed | 4.4 seconds (one `INSERT … SELECT` with `generate_series`) |

#### Results

Each endpoint was called **500 times** with a random court and a random day, after 20 warm-up calls.

| Endpoint | Typical (p50) | Slow end (p95) | Slowest (max) | Time inside Postgres | Same query with indexes off |
|---|---|---|---|---|---|
| `GET /courts/:id/availability` | **0.7 ms** | 1.5 ms | 8.1 ms | 0.03 ms | 17.3 ms |
| `GET /admin/bookings?date=` (≈190 rows) | **2.0 ms** | 3.2 ms | 53.9 ms | 0.26 ms | 6.5 ms |

How to read the columns:
- **p50**: half of the requests were faster than this. This is the normal experience.
- **p95**: 95 of 100 requests were faster than this.
- **max**: the single slowest request. The 54 ms outlier is a one-off pause outside the database (Postgres itself
  needs 0.26 ms for that query); 95% of requests finished within 3.2 ms.
- **Time inside Postgres**: `Execution Time` from `EXPLAIN ANALYZE` on the exact SQL the endpoint sent.
- **Indexes off**: the same SQL with `enable_indexscan` and `enable_bitmapscan` turned off, so Postgres has to read
  the whole table. This shows what the indexes are worth.

All latencies are end to end through the HTTP server: JWT check, zod validation, the query and the JSON response.

#### Why it stays fast

- **Availability** reads one court on one day. Postgres uses the GiST index that the `bookings_no_overlap` constraint
  already created (`Bitmap Index Scan on bookings_no_overlap`). It reads about 10 rows, not 131,000. The constraint
  that prevents double bookings is also the index that makes this query fast; no extra index was needed.
- **Admin day view** uses `bookings_start_idx` on `start_at` to find the day's bookings, then joins the court and user
  by primary key.
- Cost depends on **bookings per day**, not on total history. Another year of bookings does not slow these queries
  down. Without the indexes the queries are already **25–600× slower**, and that gap grows with every booking.

<details>
<summary>Full output of the run, including both query plans</summary>

```text
seeded 131,058 bookings (118,359 confirmed), 20 courts, 100 users in 4.4s

HTTP latency (in-process server, end to end incl. auth, JSON):
GET /courts/:id/availability         500 requests   p50 0.7 ms   p95 1.5 ms   max 8.1 ms
GET /admin/bookings (day view)       500 requests   p50 2.0 ms   p95 3.2 ms   max 53.9 ms

Availability query plan  (/courts/1/availability?date=2026-11-05)
  Bitmap Heap Scan on bookings  (cost=4.88..202.03 rows=59 width=20) (actual time=0.020..0.023 rows=7 loops=1)
    Recheck Cond: ((court_id = 1) AND (tstzrange(start_at, end_at, '[)'::text) && '["2026-11-05 08:00:00+00","2026-11-05 23:00:00+00")'::tstzrange) AND (status = 'confirmed'::booking_status))
    Heap Blocks: exact=7
    Buffers: shared hit=11
    ->  Bitmap Index Scan on bookings_no_overlap  (cost=0.00..4.87 rows=59 width=0) (actual time=0.018..0.018 rows=7 loops=1)
          Index Cond: ((court_id = 1) AND (tstzrange(start_at, end_at, '[)'::text) && '["2026-11-05 08:00:00+00","2026-11-05 23:00:00+00")'::tstzrange))
          Buffers: shared hit=4
  Planning Time: 0.023 ms
  Execution Time: 0.028 ms
  Without indexes (sequential scan of all bookings): Execution Time: 17.281 ms

Admin day-view query plan  (/admin/bookings?date=2026-11-05)
  Sort  (cost=525.53..525.99 rows=183 width=89) (actual time=0.208..0.213 rows=193 loops=1)
    Sort Key: b.start_at, c.name
    Sort Method: quicksort  Memory: 47kB
    ->  Hash Join  (cost=10.87..518.65 rows=183 width=89) (actual time=0.064..0.138 rows=193 loops=1)
          Hash Cond: (b.user_id = u.id)
          ->  Hash Join  (cost=7.62..514.90 rows=183 width=66) (actual time=0.033..0.089 rows=193 loops=1)
                Hash Cond: (b.court_id = c.id)
                ->  Bitmap Heap Scan on bookings b  (cost=6.17..512.87 rows=183 width=52) (actual time=0.017..0.039 rows=193 loops=1)
                      Recheck Cond: ((start_at >= '2026-11-05 00:00:00+00'::timestamp with time zone) AND (start_at < '2026-11-06 00:00:00+00'::timestamp with time zone))
                      ->  Bitmap Index Scan on bookings_start_idx  (cost=0.00..6.12 rows=183 width=0) (actual time=0.013..0.013 rows=193 loops=1)
                            Index Cond: ((start_at >= '2026-11-05 00:00:00+00'::timestamp with time zone) AND (start_at < '2026-11-06 00:00:00+00'::timestamp with time zone))
                ->  Hash  (cost=1.20..1.20 rows=20 width=18) (actual time=0.009..0.009 rows=20 loops=1)
                      ->  Seq Scan on courts c  (cost=0.00..1.20 rows=20 width=18) (actual time=0.002..0.003 rows=20 loops=1)
          ->  Hash  (cost=2.00..2.00 rows=100 width=27) (actual time=0.027..0.027 rows=100 loops=1)
                ->  Seq Scan on users u  (cost=0.00..2.00 rows=100 width=27) (actual time=0.004..0.010 rows=100 loops=1)
  Planning Time: 0.160 ms
  Execution Time: 0.259 ms
  Without indexes (sequential scan of all bookings): Execution Time: 6.496 ms
```

(Buffer lines trimmed from the day-view plan for readability.)
</details>

## What I would do next

1. **Facility time zone.** Everything runs in UTC now. Add a `timezone` setting and convert opening hours and "today"
   with a time-zone library, testing a daylight-saving day where a day has 23 or 25 hours.
2. **Shortening a court's hours.** Deactivating already cancels future bookings, but making opening hours shorter
   still leaves bookings outside the new hours. Show them to the admin and cancel them the same way, and notify the
   players (email) in both cases.
3. **Safer sessions.** Move the JWT from `localStorage` to an `httpOnly` cookie with a refresh token, add rate
   limiting on `/auth/login`, and refuse to start in production without a real `JWT_SECRET`.
4. **Real-time across instances** with Postgres `LISTEN/NOTIFY`, and on the booking page a "live" indicator that
   reloads after a reconnect.
5. **End-to-end test.** One Playwright run against `docker compose up` (login → book → cancel → waitlist promotion
   across two browsers), on top of the unit and page tests.
6. **Waitlist notifications.** Promotion happens silently today; send an email or push message, and let people
   choose to be asked first (with a time limit) instead of being booked automatically.
7. **API polish.** Pagination for "my bookings", an OpenAPI spec generated from the zod schemas, and an admin cancel
   with a reason.
