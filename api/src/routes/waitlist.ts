import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool, withTx } from '../db.js';
import { AppError, pgCode } from '../errors.js';
import { currentUser, requireAuth } from '../auth.js';
import { findCourt } from './courts.js';
import { checkSlotRules, fitsOpeningHours, slotBody } from '../slots.js';
import { atHour, HOUR_MS } from '../time.js';

export const waitlistRouter = Router();
waitlistRouter.use(requireAuth);

const ENTRY_COLUMNS = `w.id, w.court_id AS "courtId", c.name AS "courtName", c.sport, w.start_at AS "startAt",
  w.end_at AS "endAt", w.status, w.booking_id AS "bookingId", w.created_at AS "createdAt",
  -- place in the queue: waiting entries on this court overlapping this range, created no later than this one
  CASE WHEN w.status = 'waiting' THEN (
    SELECT count(*)::int FROM waitlist_entries o
    WHERE o.court_id = w.court_id AND o.status = 'waiting'
      AND tstzrange(o.start_at, o.end_at, '[)') && tstzrange(w.start_at, w.end_at, '[)')
      AND (o.created_at, o.id) <= (w.created_at, w.id)
  ) END AS position`;

const findEntry = async (id: number) =>
  (await pool.query(`SELECT ${ENTRY_COLUMNS} FROM waitlist_entries w JOIN courts c ON c.id = w.court_id WHERE w.id = $1`, [id])).rows[0];

/** Join the waitlist for a slot that is currently taken by someone else. */
waitlistRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const { courtId, date, startHour, hours } = slotBody.parse(req.body);
  const startAt = atHour(date, startHour);
  const endAt = atHour(date, startHour + hours);

  const id = await withTx(async (tx) => {
    const court = await findCourt(courtId, false, tx);
    checkSlotRules(court, startHour, hours, startAt);
    // FOR SHARE locks the bookings we're waiting behind. A cancellation in progress makes us wait and then
    // we see the slot is free; a cancellation that starts after us waits for us and then promotes this entry.
    const { rows: blocking } = await tx.query<{ user_id: number }>(
      `SELECT user_id FROM bookings
       WHERE court_id = $1 AND status = 'confirmed' AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
       FOR SHARE`,
      [courtId, startAt, endAt],
    );
    if (blocking.length === 0) throw new AppError(409, 'SLOT_AVAILABLE', 'This slot is free — book it directly');
    if (blocking.some((b) => b.user_id === user.id)) throw new AppError(409, 'ALREADY_BOOKED', 'You already hold a booking in this slot');
    const { rows } = await tx.query<{ id: number }>(
      'INSERT INTO waitlist_entries (court_id, user_id, start_at, end_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [courtId, user.id, startAt, endAt],
    );
    return rows[0]!.id;
  }).catch((err) => {
    if (pgCode(err) === '23505') throw new AppError(409, 'ALREADY_ON_WAITLIST', 'You are already on the waitlist for this slot');
    throw err;
  });
  res.status(201).json(await findEntry(id));
});

waitlistRouter.get('/mine', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${ENTRY_COLUMNS} FROM waitlist_entries w JOIN courts c ON c.id = w.court_id
     WHERE w.user_id = $1 ORDER BY w.start_at, w.created_at`,
    [currentUser(req).id],
  );
  res.json(rows);
});

waitlistRouter.post('/:id/leave', async (req, res) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
  const { rowCount } = await pool.query(
    "UPDATE waitlist_entries SET status = 'left' WHERE id = $1 AND user_id = $2 AND status = 'waiting'",
    [id, currentUser(req).id],
  );
  if (!rowCount) throw new AppError(404, 'WAITLIST_ENTRY_NOT_FOUND', 'No active waitlist entry with this id');
  res.json(await findEntry(id));
});

/**
 * Called inside the cancelling transaction: turns the oldest waiting entries that now fit into bookings.
 * Each promotion is a normal booking insert, so the exclusion constraint still decides what fits. An entry that
 * doesn't fit (e.g. waiting for 2h but only 1h was freed) is skipped and the next one is tried.
 *
 * Each entry is locked inside its own savepoint (FOR UPDATE SKIP LOCKED): two cancellations at once never
 * promote the same entry, and a failed attempt's ROLLBACK TO SAVEPOINT releases the lock straight away,
 * so it can't hide the entry from a concurrent cancellation that could have promoted it.
 */
export async function promoteWaitlist(tx: PoolClient, courtId: number, freedStart: Date, freedEnd: Date): Promise<void> {
  const { rows: candidates } = await tx.query<{
    id: number; user_id: number; start_at: Date; end_at: Date; hourly_price_cents: number; open_hour: number; close_hour: number;
  }>(
    `SELECT w.id, w.user_id, w.start_at, w.end_at, c.hourly_price_cents, c.open_hour, c.close_hour
     FROM waitlist_entries w JOIN courts c ON c.id = w.court_id
     WHERE w.court_id = $1 AND w.status = 'waiting' AND c.is_active AND w.start_at > now()
       AND tstzrange(w.start_at, w.end_at, '[)') && tstzrange($2, $3, '[)')
     ORDER BY w.created_at, w.id`,
    [courtId, freedStart, freedEnd],
  );
  for (const w of candidates) {
    const hours = (w.end_at.getTime() - w.start_at.getTime()) / HOUR_MS;
    // The court's hours may have changed since this person joined: only promote into today's opening hours.
    if (!fitsOpeningHours({ openHour: w.open_hour, closeHour: w.close_hour }, w.start_at.getUTCHours(), hours)) continue;

    await tx.query('SAVEPOINT promote');
    try {
      const { rowCount } = await tx.query(
        "SELECT 1 FROM waitlist_entries WHERE id = $1 AND status = 'waiting' FOR UPDATE SKIP LOCKED",
        [w.id],
      );
      if (!rowCount) {
        await tx.query('ROLLBACK TO SAVEPOINT promote'); // already handled by another transaction
        continue;
      }
      const { rows } = await tx.query<{ id: number }>(
        'INSERT INTO bookings (court_id, user_id, start_at, end_at, price_cents) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [courtId, w.user_id, w.start_at, w.end_at, w.hourly_price_cents * hours],
      );
      await tx.query("UPDATE waitlist_entries SET status = 'promoted', booking_id = $2 WHERE id = $1", [w.id, rows[0]!.id]);
      await tx.query('RELEASE SAVEPOINT promote');
    } catch (err) {
      if (pgCode(err) !== '23P01') throw err;
      await tx.query('ROLLBACK TO SAVEPOINT promote'); // still overlaps another booking: leave it waiting
    }
  }
}
