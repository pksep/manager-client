import { defineConfig } from '@playwright/test'
import base from './playwright.config'
const servers = Array.isArray(base.webServer)
  ? base.webServer
  : base.webServer
    ? [base.webServer]
    : []

export default defineConfig({
  ...base,
  testDir: './tests/production',
  outputDir: './test-results/production',
  reporter: 'list',
  webServer: [
    ...servers,
    {
      command: 'bun run preview',
      url: 'http://127.0.0.1:4312/widget.html',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
