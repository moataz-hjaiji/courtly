-- btree_gist lets a GiST exclusion constraint mix "=" on court_id with "&&" on a time range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled');

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courts (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  sport              TEXT NOT NULL,
  hourly_price_cents INTEGER NOT NULL CHECK (hourly_price_cents > 0),
  -- whole hours in facility time (UTC); close_hour = 24 means midnight
  open_hour          SMALLINT NOT NULL CHECK (open_hour BETWEEN 0 AND 23),
  close_hour         SMALLINT NOT NULL CHECK (close_hour BETWEEN 1 AND 24),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (open_hour < close_hour)
);

CREATE TABLE bookings (
  id           SERIAL PRIMARY KEY,
  court_id     INTEGER NOT NULL REFERENCES courts(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  start_at     TIMESTAMPTZ NOT NULL,
  end_at       TIMESTAMPTZ NOT NULL,
  -- price snapshot: editing a court's price must not rewrite past revenue
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  status       booking_status NOT NULL DEFAULT 'confirmed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  CHECK (end_at > start_at),
  CHECK (end_at - start_at IN (interval '1 hour', interval '2 hours')),
  CHECK (date_trunc('hour', start_at) = start_at),
  -- The double-booking guarantee: no two confirmed bookings of one court may overlap.
  -- Enforced by Postgres atomically, so concurrent inserts cannot both succeed.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'confirmed')
);

CREATE INDEX bookings_user_start_idx ON bookings (user_id, start_at);
CREATE INDEX bookings_start_idx ON bookings (start_at);
