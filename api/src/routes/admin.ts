import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { atHour, dayParam } from '../time.js';
import { BOOKING_COLUMNS } from './bookings.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

/** All bookings starting on a day, across every court (incl. inactive), plus expected revenue. */
adminRouter.get('/bookings', async (req, res) => {
  const { date } = z.object({ date: dayParam }).parse(req.query);
  const { rows } = await pool.query<{ status: string; priceCents: number }>(
    `SELECT ${BOOKING_COLUMNS}, u.name AS "userName", u.email AS "userEmail"
     FROM bookings b JOIN courts c ON c.id = b.court_id JOIN users u ON u.id = b.user_id
     WHERE b.start_at >= $1 AND b.start_at < $2
     ORDER BY b.start_at, c.name`,
    [date, atHour(date, 24)],
  );
  // Cancelled bookings are listed for visibility but earn nothing.
  const totalRevenueCents = rows.filter((b) => b.status === 'confirmed').reduce((sum, b) => sum + b.priceCents, 0);
  res.json({ date: req.query.date, bookings: rows, totalRevenueCents });
});
