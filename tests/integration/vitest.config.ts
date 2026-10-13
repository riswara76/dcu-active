import { defineConfig } from 'vitest/config';

// Integration and concurrency tests run against the LOCAL Supabase stack (`npm run db:start`).
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false, // files share one database; run them one after another
  },
});
