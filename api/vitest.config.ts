import { defineConfig } from 'vitest/config';

// The one place the test DB is configured. Set on process.env so both globalSetup (this process)
// and the test workers (which inherit it) use it.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://courtly:courtly@localhost:5433/courtly_test';

export default defineConfig({
  test: {
    env: { JWT_SECRET: 'test-secret' },
    globalSetup: './test/global-setup.ts',
    // All tests share one database, so run files one at a time.
    fileParallelism: false,
  },
});
