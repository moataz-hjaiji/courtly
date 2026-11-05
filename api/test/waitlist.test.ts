import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { as, daysFromNow, lockWaits, pool, resetDb, tokens } from './helpers.js';

// users: 1 admin, 2 alice, 3 bob (admins can book like anyone). Court 1 open 8-23.
const admin = as(tokens.admin);
const alice = as(tokens.alice);
const bob = as(tokens.bob);
const date = daysFromNow(7);
const slot = (startHour: number, hours = 1, courtId = 1, day = date) => ({ courtId, date: day, startHour, hours });

const bookingsOf = async (userId: number) =>
  (await pool.query("SELECT start_at, end_at FROM bookings WHERE user_id = $1 AND status = 'confirmed' ORDER BY start_at", [userId])).rows;

beforeEach(resetDb);
afterAll(() => pool.end());

describe('joining the waitlist', () => {
  it('queues users in order on a taken slot', async () => {
    await alice.post('/bookings', slot(10)).expect(201);
    const first = await bob.post('/waitlist', slot(10));
    const second = await admin.post('/waitlist', slot(10));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: 'waiting', position: 1 });
    expect(second.body).toMatchObject({ status: 'waiting', position: 2 });
  });

  it.each([
    ['a free slot', async () => {}, bob, 409, 'SLOT_AVAILABLE'],
    ['your own booking', async () => { await bob.post('/bookings', slot(10)).expect(201); }, bob, 409, 'ALREADY_BOOKED'],
    ['the same slot twice', async () => { await alice.post('/bookings', slot(10)); await bob.post('/waitlist', slot(10)); }, bob, 409, 'ALREADY_ON_WAITLIST'],
  ])('rejects joining for %s', async (_label, setup, who, status, code) => {
    await setup();
    const res = await who.post('/waitlist', slot(10));
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it('does not queue someone behind a booking that is being cancelled at that moment', async () => {
    const booking = await alice.post('/bookings', slot(10));
    const cancel = await pool.connect();
    try {
      await cancel.query('BEGIN');
      await cancel.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [booking.body.id]); // not committed yet
      const join = bob.post('/waitlist', slot(10)).then((r) => r); // .then starts the request
      await expect.poll(lockWaits).toBe(1); // the join is waiting for the cancellation
      await cancel.query('COMMIT');
      const res = await join;
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SLOT_AVAILABLE');
    } finally {
      cancel.release();
    }
  });

  it('applies the same opening-hours and past rules as booking', async () => {
    expect((await bob.post('/waitlist', slot(22, 2))).body.error.code).toBe('OUTSIDE_OPENING_HOURS');
    expect((await bob.post('/waitlist', slot(10, 1, 1, daysFromNow(-1)))).body.error.code).toBe('BOOKING_IN_PAST');
  });
});

describe('auto-promotion on cancellation', () => {
  it('gives the freed slot to the first person waiting', async () => {
    const booking = await alice.post('/bookings', slot(10));
    await bob.post('/waitlist', slot(10));
    await admin.post('/waitlist', slot(10));

    await alice.post(`/bookings/${booking.body.id}/cancel`).expect(200);

    expect(await bookingsOf(3)).toHaveLength(1); // bob got it
    const mine = await bob.get('/waitlist/mine');
    expect(mine.body[0]).toMatchObject({ status: 'promoted' });
    expect(mine.body[0].bookingId).toEqual(expect.any(Number));
    const adminEntry = (await admin.get('/waitlist/mine')).body[0];
    expect(adminEntry).toMatchObject({ status: 'waiting', position: 1 }); // moved up
  });

  it('skips someone whose range still does not fit and promotes the next one', async () => {
    const tenToEleven = await alice.post('/bookings', slot(10));
    await bob.post('/bookings', slot(11)).expect(201);
    await admin.post('/waitlist', slot(10, 2)).expect(201); // first in line, wants 10-12, but bob keeps 11-12
    await bob.post('/waitlist', slot(10)).expect(201); // second in line, wants 10-11

    await alice.post(`/bookings/${tenToEleven.body.id}/cancel`).expect(200);

    expect(await bookingsOf(1)).toHaveLength(0);
    expect(await bookingsOf(3)).toHaveLength(2); // 10-11 (promoted) and 11-12
    expect((await admin.get('/waitlist/mine')).body[0]).toMatchObject({ status: 'waiting' });
  });

  it('promotes a 2h waiter exactly once when both hours are cancelled at the same moment', async () => {
    const first = await alice.post('/bookings', slot(10));
    const second = await bob.post('/bookings', slot(11));
    await admin.post('/waitlist', slot(10, 2)).expect(201);

    const results = await Promise.all([
      alice.post(`/bookings/${first.body.id}/cancel`),
      bob.post(`/bookings/${second.body.id}/cancel`),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const got = await bookingsOf(1);
    expect(got).toHaveLength(1);
    expect(got[0].end_at.getTime() - got[0].start_at.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it('does not promote someone who left the waitlist', async () => {
    const booking = await alice.post('/bookings', slot(10));
    const entry = await bob.post('/waitlist', slot(10));
    await bob.post(`/waitlist/${entry.body.id}/leave`).expect(200);
    expect((await bob.post(`/waitlist/${entry.body.id}/leave`)).status).toBe(404);

    await alice.post(`/bookings/${booking.body.id}/cancel`).expect(200);
    expect(await bookingsOf(3)).toHaveLength(0);
  });

  it("does not let a user leave someone else's entry", async () => {
    await alice.post('/bookings', slot(10));
    const entry = await bob.post('/waitlist', slot(10));
    expect((await admin.post(`/waitlist/${entry.body.id}/leave`)).status).toBe(404);
  });
});
