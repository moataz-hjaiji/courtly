import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://courtly:courtly@localhost:5433/courtly_test',
      JWT_SECRET: 'test-secret',
    },
    globalSetup: './test/global-setup.ts',
    // All tests share one database, so run files one at a time.
    fileParallelism: false,
  },
});
