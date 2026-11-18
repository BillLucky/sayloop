import { defineConfig } from '@playwright/test';

const testPort = Number(process.env.SAYLOOP_TEST_PORT || 18771);
if (!Number.isInteger(testPort) || testPort < 1 || testPort > 65535) {
  throw new Error('SAYLOOP_TEST_PORT must be an available local port.');
}

process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `python3 -m http.server ${testPort} --bind 127.0.0.1 --directory web`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: false,
  },
});
