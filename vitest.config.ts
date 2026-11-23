import { defineConfig } from 'vitest/config';

// Unit and engine tests run offline in Node. Browser behaviour is covered by Playwright (tests/e2e).
export default defineConfig({
  test: {
    root: '.',
    include: ['tests/unit/**/*.test.ts', 'tests/engine/**/*.test.ts'],
    environment: 'node',
  },
});
