import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, as, daysFromNow, insertBooking, pool, resetDb, tokens } from './helpers.js';

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

describe('admin courts', () => {
  const admin = as(tokens.admin);

  it('creates a court and validates opening hours', async () => {
    const ok = await admin.post('/courts', { name: 'Padel 9', sport: 'padel', hourlyPriceCents: 3500, openHour: 8, closeHour: 24 });
    expect(ok.status).toBe(201);
    const bad = await admin.post('/courts', { name: 'Bad', sport: 'padel', hourlyPriceCents: 3500, openHour: 20, closeHour: 8 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_OPENING_HOURS');
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
