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

## Stack choices

<!-- ✍️ Write in your own words: React vs Next, Express vs Nest, Postgres — 2–3 sentences each, with the trade-off. -->

## How double bookings are prevented

<!-- ✍️ Write in your own words: the mechanism and where it lives (api/migrations/001_init.sql, api/src/routes/bookings.ts). -->

## Bonus: real-time availability

<!-- ✍️ Write in your own words: SSE, why the stream is public, the single-instance limit. -->

## What I would do next

<!-- ✍️ Write in your own words, be specific. -->
