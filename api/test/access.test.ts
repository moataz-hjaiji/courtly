import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, as, daysFromNow, insertBooking, lockWaits, pool, resetDb, tokens } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('role separation is enforced by the API', () => {
  it('rejects requests without a token', async () => {
    expect((await request(app).get('/courts')).status).toBe(401);
  });

  it('rejects a token signed with another secret (e.g. a forged admin role)', async () => {
    const forged = jwt.sign({ sub: '2', role: 'admin' }, 'not-the-secret');
    expect((await as(forged).get('/admin/bookings?date=2030-01-01')).status).toBe(401);
  });

  it('forbids users from managing courts and from the admin view', async () => {
    const alice = as(tokens.alice);
    expect((await alice.post('/courts', { name: 'X', sport: 'padel', hourlyPriceCents: 1, openHour: 8, closeHour: 9 })).status).toBe(403);
    expect((await alice.patch('/courts/1', { isActive: false })).status).toBe(403);
    expect((await alice.get(`/admin/bookings?date=${daysFromNow(1)}`)).status).toBe(403);
  });

  it('hides inactive courts from users but not from admins', async () => {
    expect((await as(tokens.alice).get('/courts')).body).toHaveLength(1);
    expect((await as(tokens.admin).get('/courts')).body).toHaveLength(2);
  });
});

describe('error handling', () => {
  it('answers malformed JSON with 400, not 500', async () => {
    const res = await request(app).post('/auth/login').set('content-type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('admin courts', () => {
  const admin = as(tokens.admin);

  it('creates a court and validates opening hours', async () => {
    const ok = await admin.post('/courts', { name: 'Padel 9', sport: 'padel', hourlyPriceCents: 3500, openHour: 8, closeHour: 24 });
    expect(ok.status).toBe(201);
    const bad = await admin.post('/courts', { name: 'Bad', sport: 'padel', hourlyPriceCents: 3500, openHour: 20, closeHour: 8 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_OPENING_HOURS');
  });

  it('deactivating cancels future bookings and waitlist entries, but keeps past and running ones', async () => {
    const HOUR = 60 * 60 * 1000;
    const thisHour = new Date(Math.floor(Date.now() / HOUR) * HOUR);
    const past = await insertBooking(2, new Date(`${daysFromNow(-1)}T10:00:00Z`));
    const running = await insertBooking(2, thisHour); // started this hour, still going
    const future = await insertBooking(3, new Date(`${daysFromNow(2)}T10:00:00Z`));
    await as(tokens.alice).post('/waitlist', { courtId: 1, date: daysFromNow(2), startHour: 10, hours: 1 }).expect(201);

    const res = await admin.patch('/courts/1', { isActive: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isActive: false, cancelledBookings: 1 });

    const status = async (id: number) =>
      (await pool.query('SELECT status, cancel_reason FROM bookings WHERE id = $1', [id])).rows[0];
    expect(await status(past)).toEqual({ status: 'confirmed', cancel_reason: null });
    expect(await status(running)).toEqual({ status: 'confirmed', cancel_reason: null });
    expect(await status(future)).toEqual({ status: 'cancelled', cancel_reason: 'court_deactivated' });
    const waitlist = (await as(tokens.alice).get('/waitlist/mine')).body;
    expect(waitlist[0].status).toBe('cancelled');
    // ...and nobody was promoted into the freed slot of a closed court
    expect((await pool.query("SELECT count(*)::int AS n FROM bookings WHERE user_id = 2 AND start_at > now() AND status = 'confirmed'")).rows[0].n).toBe(0);
  });

  it('shows players why their booking was cancelled', async () => {
    await insertBooking(3, new Date(`${daysFromNow(2)}T10:00:00Z`));
    await admin.patch('/courts/1', { isActive: false }).expect(200);
    const mine = (await as(tokens.bob).get('/bookings/mine')).body;
    expect(mine.upcoming[0]).toMatchObject({ status: 'cancelled', cancelReason: 'court_deactivated' });
  });

  it('tells admins how many future bookings each court has', async () => {
    await insertBooking(2, new Date(`${daysFromNow(2)}T10:00:00Z`));
    await insertBooking(2, new Date(`${daysFromNow(-2)}T10:00:00Z`)); // past: not counted
    const courts = (await admin.get('/courts')).body;
    expect(courts.find((c: { id: number }) => c.id === 1).futureBookings).toBe(1);
    expect((await as(tokens.alice).get('/courts')).body[0].futureBookings).toBeUndefined();
  });

  it('also cancels a booking that was being made at the moment of deactivation', async () => {
    const booker = await pool.connect();
    try {
      // Same locking as POST /bookings: hold the court FOR SHARE and insert, but don't commit yet.
      await booker.query('BEGIN');
      await booker.query('SELECT 1 FROM courts WHERE id = 1 FOR SHARE');
      await booker.query(
        "INSERT INTO bookings (court_id, user_id, start_at, end_at, price_cents) VALUES (1, 2, $1, $1::timestamptz + interval '1 hour', 3000)",
        [new Date(`${daysFromNow(3)}T10:00:00Z`)],
      );
      const deactivate = admin.patch('/courts/1', { isActive: false }).then((r) => r);
      await expect.poll(lockWaits).toBe(1); // the deactivation waits for the booking
      await booker.query('COMMIT');
      expect((await deactivate).body.cancelledBookings).toBe(1);
    } finally {
      booker.release();
    }
  });

  it('deactivates a court without deleting its bookings', async () => {
    await insertBooking(2, new Date(`${daysFromNow(-1)}T10:00:00Z`));
    const res = await admin.patch('/courts/1', { isActive: false });
    expect(res.body.isActive).toBe(false);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM bookings WHERE court_id = 1');
    expect(rows[0].n).toBe(1);
  });
});

describe('admin day view', () => {
  it('lists all bookings of the day across courts with revenue excluding cancellations', async () => {
    const day = daysFromNow(5);
    await insertBooking(2, new Date(`${day}T10:00:00Z`), 2); // 6000
    await insertBooking(3, new Date(`${day}T14:00:00Z`), 1, 2); // 3000, inactive court still counts
    const cancelled = await insertBooking(3, new Date(`${day}T18:00:00Z`));
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [cancelled]);
    await insertBooking(2, new Date(`${daysFromNow(6)}T10:00:00Z`)); // other day

    const res = await as(tokens.admin).get(`/admin/bookings?date=${day}`);
    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(3);
    expect(res.body.totalRevenueCents).toBe(9000);
  });
});
