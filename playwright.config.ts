import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4310',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'bun run dev',
      url: 'http://127.0.0.1:4310',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'bun run demo/server.ts',
      url: 'http://127.0.0.1:4311/__demo/state',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
})
