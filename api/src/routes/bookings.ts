import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool, withTx } from '../db.js';
import { AppError, pgCode } from '../errors.js';
import { currentUser, requireAuth } from '../auth.js';
import { findCourt } from './courts.js';
import { checkSlotRules, slotBody } from '../slots.js';
import { promoteWaitlist } from './waitlist.js';
import { atHour, HOUR_MS } from '../time.js';
import { publishAvailabilityChange } from '../events.js';

const CANCELLATION_CUTOFF_HOURS = 2;

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

export const BOOKING_COLUMNS = `b.id, b.court_id AS "courtId", c.name AS "courtName", c.sport, b.user_id AS "userId",
  b.start_at AS "startAt", b.end_at AS "endAt", b.price_cents AS "priceCents", b.status,
  b.created_at AS "createdAt", b.cancelled_at AS "cancelledAt", b.cancel_reason AS "cancelReason"`;


bookingsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const { courtId, date, startHour, hours } = slotBody.parse(req.body);
  const startAt = atHour(date, startHour);

  // The court row is locked FOR SHARE until COMMIT, so an admin deactivating it or changing its hours
  // either finishes first (and we see the new values) or waits until this booking is in.
  const booking = await withTx(async (tx) => {
    const court = await findCourt(courtId, false, tx);
    checkSlotRules(court, startHour, hours, startAt);
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO bookings (court_id, user_id, start_at, end_at, price_cents)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [court.id, user.id, startAt, atHour(date, startHour + hours), court.hourlyPriceCents * hours],
    );
    // Read back inside the transaction: once committed, nothing after it can fail and report a saved booking as an error.
    return findBooking(rows[0]!.id, tx);
  }).catch((err) => {
    // 23P01 = exclusion_violation from bookings_no_overlap: someone holds an overlapping confirmed booking.
    if (pgCode(err) === '23P01') throw new AppError(409, 'SLOT_TAKEN', 'This slot was just booked by someone else');
    throw err;
  });
  publishAvailabilityChange(courtId, startAt);
  res.status(201).json(booking);
});

/** The caller's bookings, split at "now" by start time. Cancelled ones are included with their status. */
bookingsRouter.get('/mine', async (req, res) => {
  const { rows } = await pool.query<{ startAt: Date }>(
    `SELECT ${BOOKING_COLUMNS} FROM bookings b JOIN courts c ON c.id = b.court_id
     WHERE b.user_id = $1 ORDER BY b.start_at`,
    [currentUser(req).id],
  );
  const now = Date.now();
  res.json({
    upcoming: rows.filter((b) => b.startAt.getTime() > now),
    past: rows.filter((b) => b.startAt.getTime() <= now).reverse(),
  });
});

bookingsRouter.post('/:id/cancel', async (req, res) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
  const userId = currentUser(req).id;
  const cutoff = new Date(Date.now() + CANCELLATION_CUTOFF_HOURS * HOUR_MS);

  // All rules sit in the UPDATE's WHERE, so checking and changing happen at the same instant
  // (no gap for the 2h limit to pass, no double cancel). Waitlist promotion runs in the same transaction,
  // so nobody else can grab the freed slot before the next person in line gets it.
  const cancelled = await withTx(async (tx) => {
    const { rows } = await tx.query<{ court_id: number; start_at: Date; end_at: Date }>(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'confirmed' AND start_at >= $3
       RETURNING court_id, start_at, end_at`,
      [id, userId, cutoff],
    );
    const b = rows[0];
    if (!b) return null;
    await promoteWaitlist(tx, b.court_id, b.start_at, b.end_at);
    return { courtId: b.court_id, startAt: b.start_at, booking: await findBooking(id, tx) };
  });

  if (cancelled) {
    publishAvailabilityChange(cancelled.courtId, cancelled.startAt);
    res.json(cancelled.booking);
    return;
  }
  throw await whyNotCancellable(id, userId);
});

/** Nothing was cancelled: look the booking up only to explain why. */
async function whyNotCancellable(id: number, userId: number): Promise<AppError> {
  const { rows } = await pool.query<{ user_id: number; status: string }>('SELECT user_id, status FROM bookings WHERE id = $1', [id]);
  const b = rows[0];
  // Someone else's booking is reported as missing so ids can't be probed.
  if (!b || b.user_id !== userId) return new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  if (b.status === 'cancelled') return new AppError(409, 'ALREADY_CANCELLED', 'Booking is already cancelled');
  return new AppError(
    422,
    'CANCELLATION_WINDOW_CLOSED',
    `Bookings can only be cancelled up to ${CANCELLATION_CUTOFF_HOURS} hours before they start`,
  );
}

async function findBooking(id: number, db: Pick<PoolClient, 'query'> = pool) {
  const { rows } = await db.query(`SELECT ${BOOKING_COLUMNS} FROM bookings b JOIN courts c ON c.id = b.court_id WHERE b.id = $1`, [id]);
  return rows[0];
}
