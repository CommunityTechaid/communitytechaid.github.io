import { defineConfig, devices } from '@playwright/test';

const isLive = !!process.env.BASE_URL;

export default defineConfig({
  testDir: './tests',
  // GeoJSON is 3.4 MB — give each test enough time for it to load
  timeout: 45_000,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // When no BASE_URL is set, spin up a local server automatically
  webServer: isLive ? undefined : {
    command: 'npx serve . -l 3000 --no-clipboard',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
