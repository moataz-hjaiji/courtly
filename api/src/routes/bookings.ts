import { Router } from 'express';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { AppError, pgCode } from '../errors.js';
import { currentUser, requireAuth } from '../auth.js';
import { findCourt } from './courts.js';
import { atHour, dayParam, HOUR_MS } from '../time.js';
import { publishAvailabilityChange } from '../events.js';

const CANCELLATION_CUTOFF_HOURS = 2;

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

export const BOOKING_COLUMNS = `b.id, b.court_id AS "courtId", c.name AS "courtName", c.sport, b.user_id AS "userId",
  b.start_at AS "startAt", b.end_at AS "endAt", b.price_cents AS "priceCents", b.status,
  b.created_at AS "createdAt", b.cancelled_at AS "cancelledAt"`;

const createBody = z.object({
  courtId: z.number().int().positive(),
  date: dayParam,
  startHour: z.number().int().min(0).max(23),
  hours: z.union([z.literal(1), z.literal(2)]),
});

bookingsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const { courtId, date, startHour, hours } = createBody.parse(req.body);
  const startAt = atHour(date, startHour);

  // The court row is locked FOR SHARE until COMMIT, so an admin deactivating it or changing its hours
  // either finishes first (and we see the new values) or waits until this booking is in.
  const tx = await pool.connect();
  let booking: unknown;
  try {
    await tx.query('BEGIN');
    const court = await findCourt(courtId, false, tx);
    if (startHour < court.openHour || startHour + hours > court.closeHour) {
      throw new AppError(
        422,
        'OUTSIDE_OPENING_HOURS',
        `${court.name} is open ${court.openHour}:00–${court.closeHour}:00; a ${hours}h booking at ${startHour}:00 does not fit`,
      );
    }
    if (startAt.getTime() <= Date.now()) throw new AppError(422, 'BOOKING_IN_PAST', 'Cannot book a slot that has already started');

    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO bookings (court_id, user_id, start_at, end_at, price_cents)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [court.id, user.id, startAt, atHour(date, startHour + hours), court.hourlyPriceCents * hours],
    );
    // Read back before COMMIT: once committed, nothing after it can fail and report a saved booking as an error.
    booking = await findBooking(rows[0]!.id, tx);
    await tx.query('COMMIT');
    tx.release();
  } catch (err) {
    // If ROLLBACK fails the connection is broken: release(true) destroys it instead of returning it to the pool.
    const broken = await tx.query('ROLLBACK').then(() => false, () => true);
    tx.release(broken);
    // 23P01 = exclusion_violation from bookings_no_overlap: someone holds an overlapping confirmed booking.
    if (pgCode(err) === '23P01') throw new AppError(409, 'SLOT_TAKEN', 'This slot was just booked by someone else');
    throw err;
  }
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

  // All rules live in one statement, so the check and the change happen atomically
  // (no gap for the 2h boundary to pass, no double cancel).
  const { rows } = await pool.query<{ court_id: number; start_at: Date }>(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'confirmed' AND start_at >= $3
     RETURNING court_id, start_at`,
    [id, userId, cutoff],
  );
  if (rows[0]) {
    publishAvailabilityChange(rows[0].court_id, rows[0].start_at);
    res.json(await findBooking(id));
    return;
  }

  // Nothing updated: look the booking up only to explain why.
  const found = await pool.query<{ user_id: number; status: string }>('SELECT user_id, status FROM bookings WHERE id = $1', [id]);
  const b = found.rows[0];
  // Someone else's booking is reported as missing so ids can't be probed.
  if (!b || b.user_id !== userId) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  if (b.status === 'cancelled') throw new AppError(409, 'ALREADY_CANCELLED', 'Booking is already cancelled');
  throw new AppError(
    422,
    'CANCELLATION_WINDOW_CLOSED',
    `Bookings can only be cancelled up to ${CANCELLATION_CUTOFF_HOURS} hours before they start`,
  );
});

async function findBooking(id: number, db: Pick<PoolClient, 'query'> = pool) {
  const { rows } = await db.query(`SELECT ${BOOKING_COLUMNS} FROM bookings b JOIN courts c ON c.id = b.court_id WHERE b.id = $1`, [id]);
  return rows[0];
}
