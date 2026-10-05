import { defineConfig } from '@playwright/test'

// Browser tests (tests/e2e). They are written for the monoambiente example, so the
// config seeds a throwaway data folder with it as space e2e (tests/e2e/space.mjs)
// and starts its own dev server on it, on a port of its own; set BASE_URL to run
// them against a server you started instead (with that space in it). CHROME_PATH points
// Playwright at an installed Chrome instead of its own Chromium.

const PORT = 5199
/** A server someone already started, or none: the config starts one. */
const external = process.env.BASE_URL
const BASE_URL = external ?? `http://localhost:${PORT}`
// Not under test-results/: Vite's file watcher ignores that folder, and the tests need live reload.
const DATA = 'tests/e2e/.data'
// The tests' helpers (tests/e2e/lib.mjs, space.mjs) read these from the environment.
process.env.BASE_URL = BASE_URL
process.env.FLOORPLAN_DATA ??= DATA

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.mjs',
  outputDir: 'test-results/e2e-output',
  // One browser at a time: the scene is GPU-heavy and the tests time animations.
  workers: 1,
  fullyParallel: false,
  timeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      // WebGL on the GPU where there is one (Metal on a Mac), in software elsewhere.
      args:
        process.platform === 'darwin'
          ? ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu']
          : ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: external
    ? undefined
    : {
        // A fresh copy of the example each run, in place before the server watches it.
        command: `rm -rf ${DATA} && node scripts/import-workspace.ts examples/monoambiente --id e2e && vite --port ${PORT} --strictPort`,
        url: BASE_URL,
        env: { FLOORPLAN_DATA: DATA },
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
