import { test, expect } from '@playwright/test';
import { goToView } from './helpers.js';

const user = { id: 'continuity-user', display_name: 'Synthetic learner', admin: true, goal: 600 };
const text = 'We can review the schedule together. Please take your time.';
const voices = [
  { id: 'am_fenrir', name: 'Fenrir', gender: 'male', language: 'a' },
  { id: 'af_heart', name: 'Heart', gender: 'female', language: 'a' },
];
const pcm = Buffer.alloc(44 + 8000 * 48 * 2);
pcm.write('RIFF');
pcm.writeUInt32LE(pcm.length - 8, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(8000, 24);
pcm.writeUInt32LE(16000, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(pcm.length - 44, 40);
let fixture;
const recording = (id, materialId, extra = {}) => ({
  id,
  material_id: materialId,
  title: 'Synthetic 001',
  text,
  voice: 'am_fenrir',
  voice_b: 'am_fenrir',
  kind: 'full',
  speed: 0.95,
  pause: 0.3,
  status: 'completed',
  duration: 48,
  owned: true,
  audio_url: `/api/audio/${id}.wav?v=synthetic`,
  wav_url: `/api/audio/${id}.wav?v=synthetic`,
  segments: Array.from({ length: 24 }, (_, i) => ({
    text: `Sentence ${i + 1}.`,
    start: i * 2,
    end: i * 2 + 2,
  })),
  ...extra,
});

test.beforeEach(async ({ page }) => {
  const materials = Array.from({ length: 60 }, (_, i) => ({
    id: (i + 1).toString(16).padStart(32, '0'),
    title: `Synthetic ${String(i + 1).padStart(3, '0')}`,
    text,
    tags: ['练习'],
    language: 'a',
    owned: true,
    visibility: 'private',
    words: 12,
    created_at: `2026-01-01T00:00:${String(59 - i).padStart(2, '0')}Z`,
  }));
  fixture = {
    materials,
    jobs: [recording('a'.repeat(32), materials[0].id)],
    generationPosts: [],
    materialPosts: [],
    signedIn: true,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      method = request.method();
    const body = ['POST', 'PATCH'].includes(method) ? request.postDataJSON() : null;
    if (path.startsWith('/api/audio/')) {
      const range = request.headers()['range'];
      const start = range ? Number(/bytes=(\d+)/.exec(range)[1]) : 0;
      const end = pcm.length - 1;
      return route.fulfill({
        status: range ? 206 : 200,
        contentType: 'audio/wav',
        headers: range
          ? { 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${pcm.length}` }
          : {},
        body: pcm.subarray(start),
      });
    }
    if (path === '/api/auth/me')
      return route.fulfill({ json: { user: fixture.signedIn ? user : null } });
    if (path === '/api/auth/logout') {
      fixture.signedIn = false;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/voices')
      return route.fulfill({
        json: { languages: { a: 'American English', z: 'Mandarin' }, voices },
      });
    if (path === '/api/health') return route.fulfill({ json: { ffmpeg: true } });
    if (path === '/api/compositions') return route.fulfill({ json: [] });
    if (path === '/api/materials' && method === 'POST') {
      fixture.materialPosts.push(body);
      const item = {
        ...body,
        id: (100 + fixture.materialPosts.length).toString(16).padStart(32, '0'),
        owned: true,
        visibility: 'private',
        words: 12,
        created_at: '2026-02-01T00:00:00Z',
      };
      materials.unshift(item);
      return route.fulfill({ status: 201, json: item });
    }
    if (path === '/api/materials') return route.fulfill({ json: materials });
    if (path === '/api/generations' && method === 'POST') {
      fixture.generationPosts.push(body);
      const id = (200 + fixture.generationPosts.length).toString(16).padStart(32, '0');
      const job = recording(id, body.material_id, { ...body, status: 'queued', owned: true });
      fixture.jobs.unshift(job);
      return route.fulfill({ status: 202, json: job });
    }
    if (path === '/api/generations') return route.fulfill({ json: fixture.jobs });
    if (path.startsWith('/api/generations/'))
      return route.fulfill({ json: fixture.jobs.find((job) => job.id === path.split('/').pop()) });
    if (path === '/api/study/sessions')
      return route.fulfill({ status: 201, json: { id: 'f'.repeat(32) } });
    if (path === '/api/study/events') return route.fulfill({ json: { ok: true } });
    throw new Error(`Unexpected synthetic request: ${method} ${path}`);
  });
});

test('a recording resumes paused at the saved position and can return to its beginning', async ({
  page,
}) => {
  fixture.jobs[0].resume_position = 12;
  await page.goto('/#library');
  await page.locator('[data-practice]').first().click();
  await expect(page.locator('#practice-resume')).toBeVisible();
  await expect(page.locator('#practice-resume-label')).toContainText('0:12');
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime))
    .toBeCloseTo(12, 1);
  expect(await page.locator('#audio').evaluate((audio) => audio.paused)).toBe(true);
  await page.locator('[data-action="restart"]').click();
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime)).toBe(0);
  await expect(page.locator('#practice-resume')).toBeHidden();
});

test('filters with no matches offer a clear path back and multi-term search stays private', async ({
  page,
}) => {
  await page.goto('/#library');
  await page.locator('.filter-details > summary').click();
  await page.locator('#library-language').selectOption('z');
  await expect(page.locator('#material-grid .empty-state')).toContainText('没有找到匹配');
  await page.locator('#material-grid .empty-state [data-clear-library]').click();
  await expect(page.locator('.material-card')).toHaveCount(24);
  await page.locator('#search').fill('  ＳＹＮＴＨＥＴＩＣ　练习 schedule ');
  await expect(page.locator('#library-count')).toHaveText('60');
  expect(new URL(page.url()).search).toBe('');
  await page.locator('#clear-library-filters').click();
  await expect(page.locator('#search')).toHaveValue('');
});

test('returning to the library restores its scroll position without storing the query', async ({
  page,
}) => {
  await page.goto('/#library');
  await expect(page.locator('.material-card')).toHaveCount(24);
  await page.evaluate(() => scrollTo(0, 1200));
  const position = await page.evaluate(() => scrollY);
  expect(position).toBeGreaterThan(500);
  await goToView(page, 'practice');
  await goToView(page, 'library');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
});

test('generation locks a submitted snapshot, then reuses the accepted pending recording', async ({
  page,
}) => {
  await page.goto('/#studio');
  await expect(page.locator('#editor')).toHaveValue(text);
  let release;
  await page.route('**/api/generations', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fallback();
  });
  await page.locator('#preview').click();
  await expect(page.locator('.settings-panel')).toHaveAttribute('inert', '');
  expect(fixture.materialPosts).toHaveLength(0);
  release();
  await expect(page.locator('.settings-panel')).not.toHaveAttribute('inert', '');
  expect(fixture.generationPosts[0].text).toBe(text);
  expect(fixture.generationPosts[0].voice).toBe('am_fenrir');
  await page.locator('#preview').click();
  expect(fixture.generationPosts).toHaveLength(1);
  await expect(page.locator('#preview')).toContainText('生成中');
});

test('existing exact recordings are reused while changing the voice creates different work', async ({
  page,
}) => {
  const preview = recording('b'.repeat(32), fixture.materials[0].id, { kind: 'preview' });
  fixture.jobs.unshift(preview);
  await page.goto('/#studio');
  await expect(page.locator('#preview')).toContainText('已有试听');
  await page.locator('#preview').click();
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.paused)).toBe(false);
  expect(fixture.generationPosts).toHaveLength(0);
  await page.locator('#preview').click();
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.paused)).toBe(true);
  await page.locator('#voice').selectOption('af_heart');
  await page.locator('#preview').click();
  expect(fixture.generationPosts).toHaveLength(1);
  expect(fixture.generationPosts[0].voice).toBe('af_heart');
});

test('opening another material during a delayed save keeps the new editor intact', async ({
  page,
}) => {
  await page.goto('/#studio');
  await page.locator('#editor').fill('A new private snapshot.');
  let release;
  await page.route('**/api/materials', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fallback();
  });
  await page.locator('#save-material').click();
  await expect(page.locator('.editor-panel')).toHaveAttribute('inert', '');
  await goToView(page, 'library');
  await page.locator(`[data-open="${fixture.materials[1].id}"]`).first().click();
  const title = await page.locator('#material-title').inputValue();
  release();
  await expect(page.locator('.editor-panel')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#material-title')).toHaveValue(title);
  await expect(page.locator('#editor')).toHaveValue(text);
});

test('a late different-recording response cannot replace the already-loaded final selection', async ({
  page,
}) => {
  const alpha = fixture.jobs[0],
    beta = recording('c'.repeat(32), fixture.materials[1].id, { title: 'Beta' });
  fixture.jobs.push(beta);
  await page.goto('/#practice');
  await page.locator('#practice-recording').selectOption(alpha.id);
  await expect(page.locator('#player-title')).toHaveText(alpha.title);
  let release;
  await page.route(`**/api/generations/${beta.id}`, async (route) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fallback();
  });
  await page.locator('#practice-recording').selectOption(beta.id);
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.locator('#practice-recording').selectOption(alpha.id);
  release();
  await page.waitForTimeout(250);
  await expect(page.locator('#player-title')).toHaveText(alpha.title);
  await expect(page.locator('#practice-recording')).toHaveValue(alpha.id);
});

test('an older list read cannot erase a newly accepted recording and cause duplicate creation', async ({
  page,
}) => {
  await page.goto('/#studio');
  await expect(page.locator('#view-studio')).toBeVisible();
  let release;
  await page.route('**/api/generations', async (route) => {
    if (route.request().method() !== 'GET' || release) return route.fallback();
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fulfill({ json: [] });
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.locator('#preview').click();
  await expect(page.locator('#preview')).toContainText('生成中');
  release();
  await page.waitForTimeout(250);
  await expect(page.locator('#preview')).toContainText('生成中');
  await page.locator('#preview').click();
  expect(fixture.generationPosts).toHaveLength(1);
});

test('a generation uses the clicked settings even when navigation chooses another voice during saving', async ({
  page,
}) => {
  await page.goto('/#studio');
  await page.locator('#editor').fill('A new snapshot with the original male voice.');
  let release;
  await page.route('**/api/materials', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fallback();
  });
  await page.locator('#preview').click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await goToView(page, 'voices');
  await page.locator('[data-choose-voice="af_heart"]').click();
  release();
  await expect(page.locator('.settings-panel')).not.toHaveAttribute('inert', '');
  expect(fixture.generationPosts[0].voice).toBe('am_fenrir');
  await expect(page.locator('#voice')).toHaveValue('af_heart');
});

test('legacy owned text keeps its original material and a ready full recording opens practice', async ({
  page,
}) => {
  delete fixture.materials[0].visibility;
  await page.goto('/#studio');
  await expect(page.locator('#generate')).toContainText('继续练习');
  await page.locator('#generate').click();
  await expect(page.locator('#view-practice')).toBeVisible();
  expect(fixture.materialPosts).toHaveLength(0);
  expect(fixture.generationPosts).toHaveLength(0);
});

test('returning from a voice sample restarts the selected lesson rather than the sample', async ({
  page,
}) => {
  const lesson = fixture.jobs[0];
  lesson.resume_position = 10;
  const sample = recording('d'.repeat(32), null, { kind: 'preview', title: 'Voice preview' });
  fixture.jobs.unshift(sample);
  await page.goto('/#practice');
  await page.locator('#practice-recording').selectOption(lesson.id);
  await expect(page.locator('#practice-resume')).toBeVisible();
  await goToView(page, 'voices');
  await page.locator(`[data-play="${sample.id}"]`).click();
  await expect(page.locator('#player-title')).toHaveText('Voice preview');
  await goToView(page, 'practice');
  await page.locator('[data-action="restart"]').click();
  await expect(page.locator('#player-title')).toHaveText(lesson.title);
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.readyState >= 1))
    .toBe(true);
  expect(await page.locator('#audio').evaluate((audio) => audio.currentTime)).toBe(0);
  expect(await page.locator('#audio').evaluate((audio) => audio.paused)).toBe(true);
  await expect(page.locator('#practice-recording')).toHaveValue(lesson.id);
});

test('Space continues to pause the audible sample when a different lesson is selected', async ({
  page,
}) => {
  const lesson = fixture.jobs[0],
    sample = recording('e'.repeat(32), null, { kind: 'preview', title: 'Voice preview' });
  fixture.jobs.unshift(sample);
  await page.goto('/#practice');
  await page.locator('#practice-recording').selectOption(lesson.id);
  await expect(page.locator('#player-title')).toHaveText(lesson.title);
  await goToView(page, 'voices');
  await page.locator(`[data-play="${sample.id}"]`).click();
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.paused)).toBe(false);
  await goToView(page, 'practice');
  await page.locator('#view-practice h1').click();
  await page.keyboard.press('Space');
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.paused)).toBe(true);
  await expect(page.locator('#player-title')).toHaveText('Voice preview');
});

test('full-recording audition followed by focus restores its sentence transport', async ({
  page,
}) => {
  const lesson = fixture.jobs[0],
    sample = recording('f'.repeat(32), null, { kind: 'preview', title: 'Voice preview' });
  fixture.jobs.unshift(sample);
  await page.goto('/#practice');
  await page.locator('#practice-recording').selectOption(lesson.id);
  await expect(page.locator('#player-title')).toHaveText(lesson.title);
  await goToView(page, 'voices');
  await page.locator(`[data-play="${sample.id}"]`).click();
  await expect(page.locator('#player-title')).toHaveText('Voice preview');
  await goToView(page, 'library');
  await page.locator(`[data-material-menu="${fixture.materials[0].id}"]`).click();
  await page.locator(`#material-menu [data-play="${lesson.id}"]`).click();
  await expect(page.locator('#player-title')).toHaveText(lesson.title);
  await goToView(page, 'practice');
  await page.locator('#enter-focus').click();
  await expect(page.locator('#focus-stage')).toBeVisible();
  await expect(page.locator('#focus-position')).not.toHaveText('00 / 00');
  await expect(page.locator('#focus-current')).toContainText('Sentence');
});

test('an explicitly opened duplicate copy retains its own recording and study identity', async ({
  page,
}) => {
  const original = fixture.materials[0],
    copyId = fixture.materials[1].id;
  fixture.materials[1] = { ...original, id: copyId };
  const copyRecording = recording('1'.repeat(32), copyId, { title: original.title });
  fixture.jobs.push(copyRecording);
  await page.goto('/#library');
  await page.locator(`[data-open="${copyId}"]`).first().click();
  await expect(page.locator('#generate')).toContainText('继续练习');
  await page.locator('#generate').click();
  await expect(page.locator('#practice-recording')).toHaveValue(copyRecording.id);
  expect(fixture.materialPosts).toHaveLength(0);
  expect(fixture.generationPosts).toHaveLength(0);
});
