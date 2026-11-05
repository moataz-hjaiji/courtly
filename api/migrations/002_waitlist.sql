CREATE TYPE waitlist_status AS ENUM ('waiting', 'promoted', 'left');

-- A user waiting for a court/time range that is currently booked by someone else.
CREATE TABLE waitlist_entries (
  id         SERIAL PRIMARY KEY,
  court_id   INTEGER NOT NULL REFERENCES courts(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  status     waitlist_status NOT NULL DEFAULT 'waiting',
  booking_id INTEGER REFERENCES bookings(id), -- the booking created when this entry was promoted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at - start_at IN (interval '1 hour', interval '2 hours')),
  CHECK (date_trunc('hour', start_at) = start_at),
  CHECK ((status = 'promoted') = (booking_id IS NOT NULL))
);

-- One active entry per user and slot; the queue order is created_at.
CREATE UNIQUE INDEX waitlist_one_per_user ON waitlist_entries (user_id, court_id, start_at, end_at) WHERE status = 'waiting';
CREATE INDEX waitlist_queue_idx ON waitlist_entries (court_id, start_at, created_at) WHERE status = 'waiting';
