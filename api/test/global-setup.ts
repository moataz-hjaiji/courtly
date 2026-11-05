import pg from 'pg';
import { migrate } from '../src/migrate.js';

// DATABASE_URL is set in vitest.config.ts, the single place the test DB is configured.
export default async function () {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(pool);
  await pool.end();
}
