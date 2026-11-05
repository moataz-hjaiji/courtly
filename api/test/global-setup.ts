import pg from 'pg';
import { migrate } from '../src/migrate.js';

export default async function () {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? 'postgres://courtly:courtly@localhost:5433/courtly_test' });
  await migrate(pool);
  await pool.end();
}
