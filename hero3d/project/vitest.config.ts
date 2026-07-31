import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Unit tests only. The Playwright specs under tests/e2e are run by
  // `npm run test:e2e` and must not be collected here.
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
