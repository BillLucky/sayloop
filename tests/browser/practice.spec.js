import { test, expect } from '@playwright/test';

// Synthetic tone and API fixtures exercise browser layout/media without personal data or models.
const sampleSentences = [
  'The best kind of progress is the kind you can feel.',
  'Start with a few words, and make them your own.',
  'A quiet morning is a good time to listen.',
  'Read the sentence once, then close your eyes.',
  'Notice where the voice slows down and takes a breath.',
  'Try the same rhythm in your own voice.',
  'You do not have to sound perfect to be understood.',
  'Small steps make room for lasting habits.',
  'Choose a story you would enjoy telling a friend.',
  'Use words that belong to your everyday life.',
  'Listen for the shape of the sentence.',
  'Let the difficult words become familiar with time.',
  'Pause whenever you need a moment to think.',
  'Say it again with a little more confidence.',
  'Every repetition gives you something new to notice.',
  'Some days you will practice for only a few minutes.',
  'Those minutes still belong to your progress.',
  'Keep a phrase that makes you want to speak.',
  'Take it with you into your next conversation.',
  'Ask a question and listen to the answer.',
  'Language grows when we use it with curiosity.',
  'There is always another way to tell the story.',
  'Tomorrow you can come back and try again.',
  'For today, a little more is enough.',
];
const segments = sampleSentences.map((text, i) => ({ text, start: i * 2, end: (i + 1) * 2 }));
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
            note: 'Full-length default · compare it with Michael and Puck',
          },
        ],
      },
      '/api/materials': [
        {
          id: 'example',
          title: job.title,
          text: job.text,
          words: job.text.split(/\s+/).length,
          language: 'a',
        },
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
  await expect(page.locator('#focus-current')).toContainText(sampleSentences[0]);
  await expect(page.locator('.focus-play')).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  await page.screenshot({
    path: `data/validation/${testInfo.project.name}-0.2.0.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `data/validation/${testInfo.project.name}-0.2.0.jpg`,
    quality: 85,
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#focus-stage')).toBeHidden();
});

test('synthetic library and studio walkthrough', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop')
    await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('[data-view="library"]').click();
  await expect(page.locator('.card-title')).toHaveText(job.title);
  if (testInfo.project.name === 'desktop')
    await page.screenshot({ path: 'data/validation/library-0.2.0.jpg', quality: 85 });
  await page.locator('[data-open="example"]').click();
  await expect(page.locator('#editor')).toHaveValue(job.text);
  await expect(page.locator('#voice')).toHaveValue('am_fenrir');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  if (testInfo.project.name === 'desktop')
    await page.screenshot({ path: 'data/validation/studio-0.2.0.jpg', quality: 85 });
});

test('saved audio survives reload and plays/seeks without audio network requests', async ({ page }, testInfo) => {
  await page.locator('#save-device').click();
  await expect(page.locator('#save-device')).toHaveText('Saved on this device ✓');
  await page.screenshot({path: `data/validation/cache-${testInfo.project.name}-0.3.0.png`, fullPage: true});
  let requests = 0;
  await page.route('**/api/audio/**', route => { requests++; return route.abort(); });
  await page.reload();
  await page.locator('#practice-recording').selectOption('synthetic');
  await expect(page.locator('#audio')).toHaveAttribute('src', /^blob:/);
  await page.locator('.passage').nth(12).click();
  await expect.poll(() => page.locator('#audio').evaluate(el => el.currentTime)).toBeGreaterThan(24);
  expect(requests).toBe(0);
  await page.locator('#remove-device').click();
  await expect(page.locator('#save-device')).toHaveText('Save on this device');
  await page.reload();
  await page.locator('#practice-recording').selectOption('synthetic');
  await expect(page.locator('#audio')).toHaveAttribute('src', job.audio_url);
});

test('a failed device download is retryable and never marked saved', async ({ page }) => {
  await page.route('**/api/audio/**', route => route.fulfill({ status: 503 }));
  await page.locator('#save-device').click();
  await expect(page.locator('#toast')).toContainText('Unable to save');
  await expect(page.locator('#save-device')).toBeEnabled();
  await expect(page.locator('#save-device')).toHaveText('Save on this device');
  await expect(page.locator('#remove-device')).toBeHidden();
});


test('unavailable device storage leaves online playback usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new Error('Storage unavailable'); } });
  });
  await page.reload();
  await page.locator('#practice-recording').selectOption('synthetic');
  await expect(page.locator('#save-device')).toBeDisabled();
  await expect(page.locator('#device-status')).toContainText('storage unavailable');
  await page.locator('.passage').first().click();
  await expect.poll(() => page.locator('#audio').evaluate(el => el.currentTime)).toBeGreaterThan(0.1);
});
