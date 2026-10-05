const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: 'admin-ui.spec.cjs', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 }, headless: true },
  webServer: { command: 'node scripts/admin-preview.cjs', url: 'http://127.0.0.1:4173/admin', reuseExistingServer: true },
});
