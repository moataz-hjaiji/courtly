import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { as, daysFromNow, insertBooking, pool, resetDb, tokens } from './helpers.js';

const alice = as(tokens.alice);
const bob = as(tokens.bob);
const date = daysFromNow(7);
const book = (who: ReturnType<typeof as>, startHour: number, hours = 1, courtId = 1, day = date) =>
  who.post('/bookings', { courtId, date: day, startHour, hours });

beforeEach(resetDb);
afterEach(() => vi.useRealTimers());
afterAll(() => pool.end());

describe('double-booking prevention', () => {
  it('lets exactly one of many simultaneous requests for the same slot win', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => book(i % 2 ? alice : bob, 10)));
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(19);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('SLOT_TAKEN');
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM bookings WHERE status = 'confirmed'");
    expect(rows[0].n).toBe(1);
  });

  it('rejects a 1h booking inside an existing 2h booking, and the reverse, even concurrently', async () => {
    const [twoHours, oneHour] = await Promise.all([book(alice, 14, 2), book(bob, 15, 1)]);
    expect([twoHours.status, oneHour.status].sort()).toEqual([201, 409]);
  });

  it('allows back-to-back bookings (end is exclusive)', async () => {
    expect((await book(alice, 10)).status).toBe(201);
    expect((await book(bob, 11)).status).toBe(201);
  });

  it('frees the slot again once the booking is cancelled', async () => {
    const first = await book(alice, 10);
    expect((await alice.post(`/bookings/${first.body.id}/cancel`)).status).toBe(200);
    expect((await book(bob, 10)).status).toBe(201);
  });

  it('is enforced by the database itself, not only by the API', async () => {
    const start = new Date(`${date}T10:00:00Z`);
    await insertBooking(2, start, 2);
    await expect(insertBooking(3, new Date(`${date}T11:00:00Z`))).rejects.toMatchObject({ code: '23P01' });
  });
});

describe('opening hours', () => {
  it('accepts the first and last slot of the day', async () => {
    expect((await book(alice, 8)).status).toBe(201);
    expect((await book(alice, 21, 2)).status).toBe(201); // 21:00-23:00, ends exactly at close
  });

  it.each([
    ['before opening', 7, 1],
    ['starting at closing time', 23, 1],
    ['running past closing time', 22, 2],
  ])('rejects a booking %s', async (_label, startHour, hours) => {
    const res = await book(alice, startHour, hours);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_OPENING_HOURS');
  });

  it('only lists slots within opening hours in availability', async () => {
    await book(alice, 10, 2);
    const res = await alice.get(`/courts/1/availability?date=${date}`);
    expect(res.status).toBe(200);
    expect(res.body.slots.map((s: { hour: number }) => s.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    const taken = res.body.slots.filter((s: { status: string }) => s.status === 'taken').map((s: { hour: number }) => s.hour);
    expect(taken).toEqual([10, 11]);
    expect(res.body.slots.filter((s: { mine: boolean }) => s.mine).map((s: { hour: number }) => s.hour)).toEqual([10, 11]);
    const bobView = await bob.get(`/courts/1/availability?date=${date}`);
    expect(bobView.body.slots.some((s: { mine: boolean }) => s.mine)).toBe(false);
  });
});

describe('booking validation', () => {
  it('rejects bookings in the past', async () => {
    const res = await book(alice, 10, 1, 1, daysFromNow(-1));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BOOKING_IN_PAST');
  });

  it('rejects durations other than 1 or 2 hours', async () => {
    expect((await book(alice, 10, 3)).status).toBe(400);
  });

  it('does not book a court that an admin is deactivating at the same moment', async () => {
    const admin = await pool.connect();
    try {
      await admin.query('BEGIN');
      await admin.query('UPDATE courts SET is_active = false WHERE id = 1'); // holds the row lock, not committed yet
      const pending = book(alice, 10).then((r) => r); // .then starts the request
      // Wait until the booking is actually blocked on the court row lock.
      await expect.poll(async () => {
        const { rows } = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()");
        return rows[0].n;
      }).toBe(1);
      await admin.query('COMMIT');
      const res = await pending;
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('COURT_NOT_FOUND');
    } finally {
      admin.release();
    }
  });

  it('rejects bookings on an inactive court', async () => {
    const res = await book(alice, 10, 1, 2);
    expect(res.status).toBe(404);
  });

  it('snapshots the price so later price changes do not alter it', async () => {
    const res = await book(alice, 10, 2);
    expect(res.body.priceCents).toBe(6000);
    await as(tokens.admin).patch('/courts/1', { hourlyPriceCents: 9999 });
    const mine = await alice.get('/bookings/mine');
    expect(mine.body.upcoming[0].priceCents).toBe(6000);
  });
});

describe('cancellation window', () => {
  const HOUR = 60 * 60 * 1000;
  const TWO_HOURS = 2 * HOUR;
  // A few hours ahead, not days: faking the clock further would expire the test JWTs (8h).
  const start = new Date(Math.ceil(Date.now() / HOUR) * HOUR + 3 * HOUR);

  it('allows cancelling exactly 2 hours before start', async () => {
    const id = await insertBooking(2, start);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start.getTime() - TWO_HOURS);
    const res = await alice.post(`/bookings/${id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('rejects cancelling less than 2 hours before start, with a clear error', async () => {
    const id = await insertBooking(2, start);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start.getTime() - TWO_HOURS + 1);
    const res = await alice.post(`/bookings/${id}/cancel`);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'CANCELLATION_WINDOW_CLOSED' });
    expect(res.body.error.message).toMatch(/2 hours/);
  });

  it("does not let a user cancel someone else's booking", async () => {
    const id = await insertBooking(2, start);
    expect((await bob.post(`/bookings/${id}/cancel`)).status).toBe(404);
  });

  it('cancels only once when the same booking is cancelled twice at the same instant', async () => {
    const id = await insertBooking(2, start);
    const codes = (await Promise.all([alice.post(`/bookings/${id}/cancel`), alice.post(`/bookings/${id}/cancel`)])).map((r) => r.status);
    expect(codes.sort()).toEqual([200, 409]);
  });

  it('rejects cancelling twice', async () => {
    const id = await insertBooking(2, start);
    await alice.post(`/bookings/${id}/cancel`);
    const res = await alice.post(`/bookings/${id}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_CANCELLED');
  });
});

describe('my bookings', () => {
  it('splits upcoming and past, only for the caller', async () => {
    await insertBooking(2, new Date(`${daysFromNow(-3)}T10:00:00Z`));
    await book(alice, 10);
    await book(bob, 12);
    const res = await alice.get('/bookings/mine');
    expect(res.body.upcoming).toHaveLength(1);
    expect(res.body.past).toHaveLength(1);
    expect([...res.body.upcoming, ...res.body.past].every((b: { userId: number }) => b.userId === 2)).toBe(true);
  });
});
