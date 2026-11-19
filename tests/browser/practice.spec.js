import { test, expect } from '@playwright/test';
import { goToView, openPracticeTools } from './helpers.js';

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
      '/api/auth/me': {
        user: {
          id: 'fixture-user',
          display_name: 'Synthetic learner',
          goal: 600,
          admin: true,
          leaderboard: false,
        },
      },
      '/api/compositions': [],
      '/api/study/sessions': { id: 'a'.repeat(32) },
      '/api/study/events': { ok: true },
      '/api/voices': {
        languages: { a: 'American English' },
        voices: [
          {
            id: 'am_fenrir',
            name: 'Fenrir',
            language: 'a',
            gender: 'male',
            note: '适合全文配音，也可以和 Michael、Puck 比较试听',
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
  await expect(page.locator('#sentence-status')).toContainText('轮到你说', { timeout: 6000 });
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
    await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-label', '展开侧栏');
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
  await goToView(page, 'library');
  await expect(page.locator('.card-title')).toHaveText(job.title);
  if (testInfo.project.name === 'desktop') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'data/validation/library-0.2.0.jpg', quality: 85 });
  }
  await page.locator('[data-open="example"]').click();
  await expect(page.locator('#editor')).toHaveValue(job.text);
  await expect(page.locator('#voice')).toHaveValue('am_fenrir');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  if (testInfo.project.name === 'desktop') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'data/validation/studio-0.2.0.jpg', quality: 85 });
  }
});

test('saved audio survives reload and plays/seeks without audio network requests', async ({
  page,
}, testInfo) => {
  await openPracticeTools(page);
  await page.locator('#save-device').click();
  await expect(page.locator('#save-device')).toHaveText('已保存到此设备 ✓');
  await page.screenshot({
    path: `data/validation/cache-${testInfo.project.name}-0.3.0.png`,
    fullPage: true,
  });
  let requests = 0;
  await page.route('**/api/audio/**', (route) => {
    requests++;
    return route.abort();
  });
  await page.reload();
  await page.locator('#practice-recording').selectOption('synthetic');
  await expect(page.locator('#audio')).toHaveAttribute('src', /^blob:/);
  await page.locator('.passage').nth(12).click();
  await expect
    .poll(() => page.locator('#audio').evaluate((el) => el.currentTime))
    .toBeGreaterThan(24);
  expect(requests).toBe(0);
  await openPracticeTools(page);
  await page.locator('#remove-device').click();
  await expect(page.locator('#save-device')).toHaveText('保存到此设备');
  await page.reload();
  await page.locator('#practice-recording').selectOption('synthetic');
  await expect(page.locator('#audio')).toHaveAttribute('src', job.audio_url);
});

test('a failed device download is retryable and never marked saved', async ({ page }) => {
  await page.route('**/api/audio/**', (route) => route.fulfill({ status: 503 }));
  await openPracticeTools(page);
  await page.locator('#save-device').click();
  await expect(page.locator('#toast')).toContainText('无法保存');
  await expect(page.locator('#save-device')).toBeEnabled();
  await expect(page.locator('#save-device')).toHaveText('保存到此设备');
  await expect(page.locator('#remove-device')).toBeHidden();
});

test('unavailable device storage leaves online playback usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new Error('Storage unavailable');
      },
    });
  });
  await page.reload();
  await page.locator('#practice-recording').selectOption('synthetic');
  await expect(page.locator('#save-device')).toBeDisabled();
  await expect(page.locator('#device-status')).toContainText('设备存储不可用');
  await page.locator('.passage').first().click();
  await expect
    .poll(() => page.locator('#audio').evaluate((el) => el.currentTime))
    .toBeGreaterThan(0.1);
});

test('device audio is account-scoped and legacy versions migrate without downloads', async ({
  page,
}) => {
  await openPracticeTools(page);
  await page.locator('#save-device').click();
  await expect(page.locator('#save-device')).toHaveText('已保存到此设备 ✓');
  const result = await page.evaluate(async () => {
    const cache = await import('/audio-cache.js');
    cache.setAudioUser('another-learner');
    const hiddenFromOtherAccount = !(await cache.cachedAudio('/api/audio/synthetic.wav'));
    cache.setAudioUser('fixture-user');
    const retainedForOwner = !!(await cache.cachedAudio('/api/audio/synthetic.wav'));
    const legacy = '/api/audio/synthetic.mp3?v=old-version';
    const current = '/api/audio/synthetic.mp3?v=account-v1-old-version';
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('sayloop-device-audio', 1);
      open.onsuccess = () => {
        const db = open.result,
          tx = db.transaction('audio', 'readwrite');
        tx.objectStore('audio').put(new Blob(['synthetic audio'], { type: 'audio/mpeg' }), legacy);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const adopted = await cache.adoptLegacyAudio(current);
    const moved = !!(await cache.cachedAudio(current));
    await cache.clearUserAudio();
    let revoked = false;
    try {
      await cache.cachedAudio(current);
    } catch (error) {
      revoked = error.name === 'AbortError';
    }
    cache.setAudioUser('fixture-user');
    const cleared = !(await cache.cachedAudio(current));
    return {
      hiddenFromOtherAccount,
      retainedForOwner,
      adopted: adopted.size > 0,
      moved,
      revoked,
      cleared,
    };
  });
  expect(result).toEqual({
    hiddenFromOtherAccount: true,
    retainedForOwner: true,
    adopted: true,
    moved: true,
    revoked: true,
    cleared: true,
  });
});

test('compact navigation, sheets, and player stay clear at phone and tablet widths', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await goToView(page, 'library');
  await expect(page.locator('#view-library')).toBeVisible();
  await expect(page.locator('.library-heading h1')).toHaveText('语料库');
  await expect(page.locator('.material-card .card-bottom button')).toHaveCount(2);
  await expect(page.locator('.filter-details')).not.toHaveAttribute('open', '');
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1024 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true);
    if (width < 700) {
      await expect(page.locator('.sidebar')).toBeHidden();
      await expect(page.locator('.mobile-tab')).toHaveCount(3);
      const cardWidth = await page
        .locator('.material-card')
        .first()
        .evaluate((card) => card.getBoundingClientRect().width);
      expect(cardWidth).toBeGreaterThanOrEqual(width - 48);
      const labelHeights = await page
        .locator('.mobile-tab > span')
        .evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().height));
      expect(Math.max(...labelHeights)).toBeLessThan(18);
      expect(
        (await page.locator('.mobile-tab').allTextContents()).map((text) => text.trim())
      ).toEqual(['语料', '创作', '练习']);
      const geometry = await page.evaluate(() => ({
        player: document.querySelector('.player').getBoundingClientRect().bottom,
        nav: document.querySelector('#mobile-navigation').getBoundingClientRect().top,
      }));
      expect(geometry.player).toBeLessThanOrEqual(geometry.nav + 1);
      await page.locator('#more-tools').click();
      await expect(page.locator('#more-menu')).toBeVisible();
      await expect(page.locator('#more-menu button[data-view]')).toHaveCount(3);
      await page.keyboard.press('Escape');
      await expect(page.locator('#more-menu')).toBeHidden();
      await expect(page.locator('#more-tools')).toBeFocused();
    }
    await page.screenshot({
      path: `data/validation/ui-0.4.1/library-${testInfo.project.name}-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize(
    testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 }
  );
  await page.screenshot({
    path: `data/validation/ui-0.4.1/library-final-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.locator('#player-options').click();
  await page.locator('#hide-player').click();
  await expect(page.locator('.player')).toBeHidden();
  await page.screenshot({
    path: `data/validation/ui-0.4.1/library-clean-${testInfo.project.name}.jpg`,
    quality: 85,
  });
  await page.locator('.card-bottom [data-practice]').click();
  await expect(page.locator('.player')).toBeVisible();
  await goToView(page, 'library');
  if (testInfo.project.name === 'mobile') {
    await page.locator('#more-tools').click();
    await page.screenshot({ path: 'data/validation/ui-0.4.1/more-mobile.png' });
    await page.keyboard.press('Escape');
  }
  await page.locator('#library-tools').click();
  await expect(page.locator('#library-menu')).toBeVisible();
  await page.locator('#library-menu [data-close-sheet]').click();
  await page.locator('[data-material-menu]').click();
  await expect(page.locator('#material-menu')).toBeVisible();
  await page.locator('#material-menu [data-open]').click();
  await expect(page.locator('#material-menu')).toBeHidden();
  await expect(page.locator('#view-studio')).toBeVisible();
  await page.screenshot({
    path: `data/validation/ui-0.4.1/studio-final-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.locator('#player-options').click();
  await page.locator('#playback-rate').selectOption('1.25');
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.playbackRate))
    .toBe(1.25);
  const paused = await page.locator('#audio').evaluate((audio) => audio.paused);
  await page.locator('#repeat').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#repeat')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('#audio').evaluate((audio) => audio.paused)).toBe(paused);
  await page.locator('#playback-menu [data-close-sheet]').click();
  await goToView(page, 'practice');
  await page.screenshot({
    path: `data/validation/ui-0.4.1/practice-final-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.locator('#enter-focus').click();
  await expect(page.locator('#mobile-navigation')).toBeHidden();
  await page.keyboard.press('Escape');
  if (testInfo.project.name === 'mobile')
    await expect(page.locator('#mobile-navigation')).toBeVisible();
  expect(errors).toEqual([]);
});

test('hidden tabs stop metadata polling and reconnect immediately on return', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/generations', (route) => {
    calls++;
    return route.fulfill({
      json: [
        job,
        {
          id: 'queued-fixture',
          title: 'Synthetic pending audio',
          voice: 'af_heart',
          kind: 'preview',
          speed: 1,
          status: 'running',
          progress: 20,
        },
      ],
    });
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => calls).toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const before = calls;
  await page.waitForTimeout(4200);
  expect(calls).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => calls).toBeGreaterThan(before);
});
