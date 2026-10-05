import { defineConfig } from 'vitest/config'

// Unit tests only. E2E lives in tests/e2e and runs with `pnpm test:e2e` against a dev server.
// tests/unit/setup.ts opens the plan the tests are written for (examples/monoambiente).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // Most modules touch window/document at import time (store, patterns).
    // Node-only suites opt out with `// @vitest-environment node`.
    environment: 'jsdom',
    setupFiles: ['tests/unit/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
