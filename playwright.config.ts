import { defineConfig } from '@playwright/test'

const hostPort = Number(process.env.MANAGER_TEST_HOST_PORT || '4310')

if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535)
  throw new Error('Некорректный порт изолированной страницы теста')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${hostPort}`,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `bun run dev --port ${hostPort}`,
      url: `http://127.0.0.1:${hostPort}`,
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
