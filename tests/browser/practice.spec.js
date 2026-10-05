import { test, expect } from '@playwright/test';

// Synthetic tone and API fixtures exercise browser layout/media without personal data or models.
const segments = Array.from({ length: 24 }, (_, i) => ({
  text: `Sentence ${i + 1}. A little practice every day makes unfamiliar words feel natural.`,
  start: i * 2,
  end: (i + 1) * 2,
}));
const job = {
  id: 'synthetic',
  title: 'A little more, every day',
  material_id: 'example',
  text: segments.map((s) => s.text).join(' '),
  voice: 'am_fenrir',
  language: 'a',
  kind: 'full',
  status: 'completed',
  duration: 48,
  speed: 1,
  segments,
  audio_url: '/api/audio/synthetic.wav',
  wav_url: '/api/audio/synthetic.wav',
};
function tone() {
  const rate = 8000,
    samples = 48 * rate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(Math.round(200 * Math.sin(i / 10)), 44 + i * 2);
  return buffer;
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/audio/')) {
      const data = tone();
      const range = route.request().headers()['range'];
      if (!range) return route.fulfill({ contentType: 'audio/wav', body: data });
      const [, from, to] = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(from),
        end = to ? Number(to) : data.length - 1;
      return route.fulfill({
        status: 206,
        contentType: 'audio/wav',
        headers: {
          'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${data.length}`,
        },
        body: data.subarray(start, end + 1),
      });
    }
    const responses = {
      '/api/voices': {
        languages: { a: 'American English' },
        voices: [
          {
            id: 'am_fenrir',
            name: 'Fenrir',
            language: 'a',
            gender: 'male',
            note: 'Synthetic test',
          },
        ],
      },
      '/api/materials': [
        { id: 'example', title: job.title, text: job.text, words: 300, language: 'a' },
      ],
      '/api/generations': [job],
      '/api/generations/synthetic': job,
      '/api/health': { ffmpeg: true },
    };
    if (!(path in responses)) throw new Error(`Unexpected API request: ${path}`);
    await route.fulfill({ json: responses[path] });
  });
  await page.goto('/#practice');
  await page.locator('#practice-recording').selectOption('synthetic');
  await expect(page.locator('.passage')).toHaveCount(24);
});

test('Space preserves position, shadow mode advances, and auto-follow crosses screens', async ({
  page,
}) => {
  const audio = page.locator('#audio');
  await page.locator('.passage').first().click();
  await expect.poll(() => audio.evaluate((el) => el.currentTime)).toBeGreaterThan(0.15);
  await page.keyboard.press('Space');
  await expect.poll(() => audio.evaluate((el) => el.paused)).toBe(true);
  const paused = await audio.evaluate((el) => el.currentTime);
  await page.keyboard.press('Space');
  await expect.poll(() => audio.evaluate((el) => el.currentTime)).toBeGreaterThan(paused);
  await page.locator('.mode-buttons [data-mode="shadow"]').click();
  await page.locator('.passage').first().click();
  await expect(page.locator('#sentence-status')).toContainText('Your turn', { timeout: 6000 });
  await page.keyboard.press('Space');
  await expect(page.locator('.passage').nth(1)).toHaveClass(/active/);
  await page.locator('.mode-buttons [data-mode="continuous"]').click();
  await audio.evaluate((el) => {
    el.currentTime = 35;
  });
  await expect(page.locator('.passage').nth(17)).toHaveClass(/active/);
  await expect(page.locator('.passage').nth(17)).toBeInViewport();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test('responsive layout and immersive controls remain usable', async ({ page }, testInfo) => {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  if (testInfo.project.name === 'desktop') {
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-label', 'Expand sidebar');
  }
  await page.locator('#enter-focus').click();
  await expect(page.locator('#focus-stage')).toBeVisible();
  await expect(page.locator('#focus-current')).toContainText('Sentence 1');
  await expect(page.locator('.focus-play')).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await page.screenshot({
    path: `data/validation/${testInfo.project.name}-0.2.0.png`,
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#focus-stage')).toBeHidden();
});
