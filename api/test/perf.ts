/**
 * Performance check: seeds ~130k bookings into a separate `courtly_perf` database, then measures the real
 * availability and admin day-view endpoints (latency over many requests) and prints Postgres query plans.
 *
 *   docker compose --profile test run --rm api-test npm run perf
 *   (or locally: docker compose up -d db && cd api && npm run perf)
 */
import pg from 'pg';
import type { AddressInfo } from 'node:net';

const base = process.env.TEST_DATABASE_URL ?? 'postgres://courtly:courtly@localhost:5433/courtly_test';
const withDb = (name: string) => base.replace(/\/[^/]+$/, `/${name}`);
process.env.DATABASE_URL = withDb('courtly_perf');

const COURTS = 20;
const USERS = 100;
const DAYS_EACH_SIDE = 365; // one year of history + one year ahead
const FILL = 0.6; // share of slots booked

// Create the perf database once (CREATE DATABASE can't run inside a transaction or with IF NOT EXISTS).
const admin = new pg.Client({ connectionString: withDb('postgres') });
await admin.connect();
const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'courtly_perf'");
if (!exists.rowCount) await admin.query('CREATE DATABASE courtly_perf');
await admin.end();

// Imported after DATABASE_URL is set, so the app's pool points at courtly_perf.
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');
const { signToken } = await import('../src/auth.js');

await migrate(pool);
console.log('seeding…');
let t = performance.now();
await pool.query('TRUNCATE waitlist_entries, bookings, courts, users RESTART IDENTITY CASCADE');
await pool.query(
  `INSERT INTO users (email, name, password_hash, role)
   SELECT 'user' || i || '@perf.test', 'User ' || i, 'x', CASE WHEN i = 1 THEN 'admin' ELSE 'user' END::user_role
   FROM generate_series(1, $1) i`,
  [USERS],
);
await pool.query(
  `INSERT INTO courts (name, sport, hourly_price_cents, open_hour, close_hour)
   SELECT 'Court ' || i, (ARRAY['padel', 'tennis', 'squash'])[1 + i % 3], 2000 + (i % 4) * 500, 8, 23
   FROM generate_series(1, $1) i`,
  [COURTS],
);
// One row per (court, day, hour) picked at random: 1h bookings never overlap, ~10% of them cancelled.
await pool.query(
  `INSERT INTO bookings (court_id, user_id, start_at, end_at, price_cents, status, cancelled_at)
   SELECT c.id, 1 + floor(random() * $1)::int, s.ts, s.ts + interval '1 hour', c.hourly_price_cents, st.status,
          CASE WHEN st.status = 'cancelled' THEN s.ts - interval '1 day' END
   FROM courts c
   CROSS JOIN generate_series(date_trunc('day', now()) - make_interval(days => $2),
                              date_trunc('day', now()) + make_interval(days => $2), interval '1 day') d
   CROSS JOIN generate_series(8, 22) h
   CROSS JOIN LATERAL (SELECT d + make_interval(hours => h) AS ts) s
   -- references s.ts so Postgres re-evaluates random() per row instead of once for the whole query
   CROSS JOIN LATERAL (SELECT CASE WHEN random() < 0.1 AND s.ts IS NOT NULL THEN 'cancelled' ELSE 'confirmed' END::booking_status AS status) st
   WHERE random() < $3`,
  [USERS, DAYS_EACH_SIDE, FILL],
);
await pool.query('ANALYZE');
const { rows: [counts] } = await pool.query<{ total: number; confirmed: number }>(
  "SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed FROM bookings",
);
console.log(`seeded ${counts!.total.toLocaleString('en')} bookings (${counts!.confirmed.toLocaleString('en')} confirmed), `
  + `${COURTS} courts, ${USERS} users in ${((performance.now() - t) / 1000).toFixed(1)}s\n`);

// Record every query the endpoints send, so EXPLAIN runs the exact SQL the API uses.
const seen: { text: string; values: unknown[] }[] = [];
const original = pool.query.bind(pool) as (text: string, values?: unknown[]) => Promise<unknown>;
(pool as unknown as { query: typeof original }).query = (text, values) => {
  seen.push({ text, values: values ?? [] });
  return original(text, values);
};

const server = createApp().listen(0);
const url = `http://localhost:${(server.address() as AddressInfo).port}`;
const token = signToken({ id: 1, role: 'admin' });
const get = (path: string) => fetch(url + path, { headers: { authorization: `Bearer ${token}` } });

const randomDay = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Math.floor(Math.random() * 2 * DAYS_EACH_SIDE) - DAYS_EACH_SIDE);
  return d.toISOString().slice(0, 10);
};

async function measure(label: string, makePath: () => string, runs: number) {
  for (let i = 0; i < 20; i++) await (await get(makePath())).arrayBuffer(); // warm-up (JIT, connections, cache)
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const res = await get(makePath());
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const pct = (p: number) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]!.toFixed(1);
  console.log(`${label.padEnd(34)} ${String(runs).padStart(5)} requests   p50 ${pct(50)} ms   p95 ${pct(95)} ms   max ${pct(100)} ms`);
}

console.log('HTTP latency (in-process server, end to end incl. auth, JSON):');
await measure('GET /courts/:id/availability', () => `/courts/${1 + Math.floor(Math.random() * COURTS)}/availability?date=${randomDay()}`, 500);
await measure('GET /admin/bookings (day view)', () => `/admin/bookings?date=${randomDay()}`, 500);

async function explain(label: string, path: string, match: RegExp) {
  seen.length = 0;
  await (await get(path)).arrayBuffer();
  const q = seen.find((s) => match.test(s.text));
  if (!q) throw new Error(`no query matching ${match} for ${path}`);
  const { rows } = await original(`EXPLAIN (ANALYZE, BUFFERS) ${q.text}`, q.values) as { rows: { 'QUERY PLAN': string }[] };
  console.log(`\n${label}  (${path})\n${rows.map((r) => '  ' + r['QUERY PLAN']).join('\n')}`);

  // Same query with index scans disabled, to show what the indexes are worth.
  const client = await pool.connect();
  await client.query('SET enable_indexscan = off; SET enable_bitmapscan = off');
  const noIndex = await client.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE) ${q.text}`, q.values);
  client.release(true); // discard the connection so the settings don't leak into the pool
  const time = noIndex.rows.find((r) => r['QUERY PLAN'].startsWith('Execution Time'))!['QUERY PLAN'];
  console.log(`  Without indexes (sequential scan of all bookings): ${time}`);
}

const day = new Date().toISOString().slice(0, 10);
await explain('Availability query plan', `/courts/1/availability?date=${day}`, /FROM bookings/);
await explain('Admin day-view query plan', `/admin/bookings?date=${day}`, /FROM bookings b JOIN courts/);

server.close();
await pool.end();
