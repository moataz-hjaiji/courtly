import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

/** Seeds demo data once; skipped if any user exists so restarts keep your changes. */
export async function seed(pool: Pool): Promise<void> {
  const { rowCount } = await pool.query('SELECT 1 FROM users LIMIT 1');
  if (rowCount) {
    console.log('seed skipped (data exists)');
    return;
  }
  const hash = await bcrypt.hash('password123', 10);
  const users = await pool.query<{ id: number }>(
    `INSERT INTO users (email, name, password_hash, role) VALUES
       ('admin@courtly.test', 'Ada Admin', $1, 'admin'),
       ('alice@courtly.test', 'Alice', $1, 'user'),
       ('bob@courtly.test',   'Bob',   $1, 'user')
     RETURNING id`,
    [hash],
  );
  const courts = await pool.query<{ id: number; hourly_price_cents: number }>(
    `INSERT INTO courts (name, sport, hourly_price_cents, open_hour, close_hour, is_active) VALUES
       ('Padel 1',       'padel',  3000, 8, 23, true),
       ('Padel 2',       'padel',  3000, 8, 23, true),
       ('Tennis Center', 'tennis', 2500, 7, 22, true),
       ('Old Squash',    'squash', 1500, 9, 21, false)
     RETURNING id, hourly_price_cents`,
  );
  const [, alice, bob] = users.rows.map((u) => u.id);
  const [p1, p2, t1] = courts.rows;

  // Bookings relative to today (UTC) so the demo always has something to show.
  const day = (offset: number, hour: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const plan: { court: typeof p1; user: number; offset: number; hour: number; hours: 1 | 2 }[] = [
    { court: p1, user: alice!, offset: 1, hour: 18, hours: 2 },
    { court: p1, user: bob!, offset: 1, hour: 20, hours: 1 },
    { court: p2, user: bob!, offset: 1, hour: 10, hours: 1 },
    { court: t1, user: alice!, offset: 2, hour: 9, hours: 2 },
    { court: p2, user: alice!, offset: 3, hour: 19, hours: 1 },
    { court: t1, user: bob!, offset: -2, hour: 17, hours: 1 },
    { court: p1, user: alice!, offset: -5, hour: 12, hours: 2 },
  ];
  for (const b of plan) {
    await pool.query(
      `INSERT INTO bookings (court_id, user_id, start_at, end_at, price_cents) VALUES ($1, $2, $3, $4, $5)`,
      [b.court!.id, b.user, day(b.offset, b.hour), day(b.offset, b.hour + b.hours), b.court!.hourly_price_cents * b.hours],
    );
  }
  console.log(`seeded ${users.rowCount} users, ${courts.rowCount} courts, ${plan.length} bookings`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pool } = await import('./db.js');
  await seed(pool);
  await pool.end();
}
