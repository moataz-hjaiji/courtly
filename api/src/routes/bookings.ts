import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { AppError, pgCode } from '../errors.js';
import { currentUser, requireAuth } from '../auth.js';
import { findCourt } from './courts.js';
import { atHour, dayParam, HOUR_MS } from '../time.js';

export const CANCELLATION_CUTOFF_HOURS = 2;

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
  const court = await findCourt(courtId, false);

  if (startHour < court.openHour || startHour + hours > court.closeHour) {
    throw new AppError(
      422,
      'OUTSIDE_OPENING_HOURS',
      `${court.name} is open ${court.openHour}:00–${court.closeHour}:00; a ${hours}h booking at ${startHour}:00 does not fit`,
    );
  }
  const startAt = atHour(date, startHour);
  if (startAt.getTime() <= Date.now()) throw new AppError(422, 'BOOKING_IN_PAST', 'Cannot book a slot that has already started');

  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO bookings (court_id, user_id, start_at, end_at, price_cents)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [court.id, user.id, startAt, atHour(date, startHour + hours), court.hourlyPriceCents * hours],
    );
    const booking = await findBooking(rows[0]!.id);
    res.status(201).json(booking);
  } catch (err) {
    // 23P01 = exclusion_violation from bookings_no_overlap: someone holds an overlapping confirmed booking.
    if (pgCode(err) === '23P01') throw new AppError(409, 'SLOT_TAKEN', 'This slot was just booked by someone else');
    throw err;
  }
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
  const { rows } = await pool.query<{ user_id: number; start_at: Date; status: string }>(
    'SELECT user_id, start_at, status FROM bookings WHERE id = $1',
    [id],
  );
  const b = rows[0];
  // Someone else's booking is reported as missing so ids can't be probed.
  if (!b || b.user_id !== currentUser(req).id) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  if (b.status === 'cancelled') throw new AppError(409, 'ALREADY_CANCELLED', 'Booking is already cancelled');
  if (b.start_at.getTime() - Date.now() < CANCELLATION_CUTOFF_HOURS * HOUR_MS) {
    throw new AppError(
      422,
      'CANCELLATION_WINDOW_CLOSED',
      `Bookings can only be cancelled up to ${CANCELLATION_CUTOFF_HOURS} hours before they start`,
    );
  }
  // status guard makes a double-click / concurrent cancel a no-op instead of a second update.
  const updated = await pool.query(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = $1 AND status = 'confirmed'",
    [id],
  );
  if (!updated.rowCount) throw new AppError(409, 'ALREADY_CANCELLED', 'Booking is already cancelled');
  res.json(await findBooking(id));
});

async function findBooking(id: number) {
  const { rows } = await pool.query(`SELECT ${BOOKING_COLUMNS} FROM bookings b JOIN courts c ON c.id = b.court_id WHERE b.id = $1`, [id]);
  return rows[0];
}
