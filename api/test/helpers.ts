import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { signToken } from '../src/auth.js';

export const app = createApp();
export { pool };

export const tokens = {
  admin: signToken({ id: 1, role: 'admin' }),
  alice: signToken({ id: 2, role: 'user' }),
  bob: signToken({ id: 3, role: 'user' }),
};

/** Fresh fixed data: users 1-3, court 1 (open 8-23, 30.00/h), court 2 inactive. */
export async function resetDb() {
  await pool.query('TRUNCATE bookings, courts, users RESTART IDENTITY CASCADE');
  await pool.query(`INSERT INTO users (email, name, password_hash, role) VALUES
    ('admin@t', 'Admin', 'x', 'admin'), ('alice@t', 'Alice', 'x', 'user'), ('bob@t', 'Bob', 'x', 'user')`);
  await pool.query(`INSERT INTO courts (name, sport, hourly_price_cents, open_hour, close_hour, is_active) VALUES
    ('Padel 1', 'padel', 3000, 8, 23, true), ('Closed', 'tennis', 2000, 8, 23, false)`);
}

/** YYYY-MM-DD n days from now (UTC). */
export function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const as = (token: string) => ({
  get: (url: string) => request(app).get(url).set('authorization', `Bearer ${token}`),
  post: (url: string, body?: object) => request(app).post(url).set('authorization', `Bearer ${token}`).send(body),
  patch: (url: string, body?: object) => request(app).patch(url).set('authorization', `Bearer ${token}`).send(body),
});

/** Inserts a booking directly (bypassing API rules), e.g. to set up one that starts soon or in the past. */
export async function insertBooking(userId: number, startAt: Date, hours = 1, courtId = 1): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO bookings (court_id, user_id, start_at, end_at, price_cents)
     VALUES ($1, $2, $3, $3::timestamptz + make_interval(hours => $4), 3000 * $4) RETURNING id`,
    [courtId, userId, startAt, hours],
  );
  return rows[0]!.id;
}
