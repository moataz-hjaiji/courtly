import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://courtly:courtly@localhost:5433/courtly',
});

/** Runs fn in a transaction: COMMIT on success, ROLLBACK on any error (which is re-thrown). */
export async function withTx<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  let result: T;
  try {
    await tx.query('BEGIN');
    result = await fn(tx);
    await tx.query('COMMIT');
  } catch (err) {
    // If ROLLBACK fails the connection is broken: release(true) destroys it instead of returning it to the pool.
    const broken = await tx.query('ROLLBACK').then(() => false, () => true);
    tx.release(broken);
    throw err;
  }
  tx.release();
  return result;
}
