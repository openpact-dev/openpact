import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config. Single project (Chromium only, on the
 * dashboard-ui CI job in slice F). Each test owns its own daemon +
 * dashboard server via the daemon fixture in test/ui/fixtures/daemon.ts,
 * so we don't need a `webServer` block.
 */
export default defineConfig({
  testDir: 'test/ui',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
