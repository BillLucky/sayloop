import { test, expect } from '@playwright/test';
import { goToView, openAuthorSettings } from './helpers.js';

const user = {
  id: 'synthetic-user',
  username: 'learner',
  display_name: '学习者',
  goal: 600,
  admin: true,
  leaderboard: false,
};
const voices = [
  { id: 'am_fenrir', name: 'Fenrir', language: 'a', gender: 'male', note: '男声试听' },
  { id: 'af_heart', name: 'Heart', language: 'a', gender: 'female', note: '女声试听' },
];
const chinese = '我们想多留两周完成质量验证。';
const dialogue = {
  title: '讨论交付',
  role_a: '采购方',
  role_b: '供应商',
  turns: [
    { speaker: 'A', text: 'Can we review the schedule?', translation: '我们可以确认一下时间吗？' },
    { speaker: 'B', text: 'We need two more weeks.', translation: '我们需要再多两周。' },
  ],
};

test.beforeEach(async ({ page }) => {
  let signedIn = false;
  const materials = [],
    revisions = [],
    feedback = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const body = method === 'POST' || method === 'PATCH' ? route.request().postDataJSON() : null;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: signedIn ? user : null } });
    if (path === '/api/auth/login') {
      signedIn = true;
      return route.fulfill({ json: { user } });
    }
    if (path === '/api/auth/logout') {
      signedIn = false;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/voices')
      return route.fulfill({
        json: { languages: { a: 'American English', z: 'Mandarin Chinese' }, voices },
      });
    if (path === '/api/health') return route.fulfill({ json: { ffmpeg: true } });
    if (path === '/api/generations') return route.fulfill({ json: [] });
    if (path === '/api/feedback' && method === 'POST') {
      feedback.push(body);
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    if (path === '/api/feedback') return route.fulfill({ json: feedback });
    if (path === '/api/materials' && method === 'POST') {
      const material = {
        ...body,
        id: String(materials.length + 1).padStart(32, 'a'),
        words: body.text.split(/\s+/).length,
        owned: true,
        visibility: 'private',
        created_at: new Date().toISOString(),
      };
      materials.unshift(material);
      return route.fulfill({ status: 201, json: material });
    }
    if (path === '/api/materials') return route.fulfill({ json: materials });
    if (path.startsWith('/api/materials/') && method === 'PATCH') {
      const material = materials.find((item) => item.id === path.split('/').pop());
      Object.assign(material, body);
      return route.fulfill({ json: material });
    }
    if (path === '/api/compositions' && method === 'POST') {
      const result = {
        title: '交付计划',
        chinese: body.mode === 'polish' ? chinese : '',
        variants:
          body.mode === 'variants'
            ? [{ label: '简短表达', text: 'We would like two more weeks for quality checks.' }]
            : [],
        dialogues: body.mode === 'scenario' ? [dialogue] : [],
        notes: '保留真实事实，确认后再入库。',
      };
      const item = {
        id: String(revisions.length + 1).padStart(32, 'b'),
        input: body,
        result,
        status: 'completed',
        progress: 100,
        created_at: new Date().toISOString(),
        providers: ['Synthetic fixture'],
      };
      revisions.unshift(item);
      return route.fulfill({ status: 202, json: item });
    }
    if (path === '/api/compositions') return route.fulfill({ json: revisions });
    if (path.startsWith('/api/compositions/'))
      return route.fulfill({ json: revisions.find((item) => item.id === path.split('/').pop()) });
    if (path === '/api/study/stats')
      return route.fulfill({
        json: {
          today: 120,
          total: 720,
          streak: 2,
          goal: 600,
          days: [{ day: '2026-01-01', seconds: 120 }],
          milestones: [{ minutes: 10, achieved: true }],
          recent: [],
          leaderboard: [],
        },
      });
    if (path === '/api/auth/profile') return route.fulfill({ json: { ok: true } });
    if (path === '/api/auth/invite')
      return route.fulfill({ json: { code: 'synthetic-invite', expires_in: 86400 } });
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  await page.goto('/#authoring');
  await page.locator('#login-name').fill('learner');
  await page.locator('#login-password').fill('synthetic-password');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-screen')).toBeHidden();
});

test('polish, edit, generate expressions, and save without losing versions', async ({ page }) => {
  await page.locator('#author-source').fill('交付需要多两周，保证质量。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#result-chinese')).toHaveValue(chinese);
  await page.locator('#result-chinese').fill(chinese + '原有价格不变。');
  await page.locator('.result-card .result-more > summary').click();
  await page.locator('[data-expression-settings]').click();
  await expect(page.locator('#author-source')).toHaveValue(chinese + '原有价格不变。');
  await page.locator('#author-style').selectOption('new_york');
  await page.locator('#author-submit').click();
  await expect(page.locator('#variant-0')).toContainText('quality checks');
  await page.locator('[data-save-variant="0"]').click();
  await expect(page.locator('#view-studio')).toBeVisible();
  await expect(page.locator('#editor')).toHaveValue(
    'We would like two more weeks for quality checks.'
  );
  await goToView(page, 'library');
  await expect(page.locator('.material-tags')).toContainText('new_york');
  await page.locator('#search').fill('new_york');
  await expect(page.locator('.material-card')).toHaveCount(1);
  await page.locator('[data-material-menu]').first().click();
  await page.locator('[data-manage]').click();
  await page.locator('#meta-tags').fill('交付, 商务');
  await page.locator('#meta-favorite').check();
  await page.locator('#metadata-form button[type="submit"], #metadata-form .primary').click();
  await expect(page.locator('#metadata-dialog')).toBeHidden();
  await page.locator('#search').fill('交付');
  await expect(page.locator('.material-card')).toHaveCount(1);
  await goToView(page, 'authoring');
  await expect(page.locator('#revision-select option')).toHaveCount(3);
});

test('scenario roles retain editable translations and separate voices', async ({
  page,
}, testInfo) => {
  await page.locator('[data-author-mode="scenario"]').click();
  await page.locator('#author-source').fill('演练合同交付谈判，双方分别是采购方和供应商。');
  await openAuthorSettings(page);
  await page.locator('#author-count').fill('1');
  await page.locator('#author-submit').click();
  await expect(page.locator('#turn-0-0')).toHaveValue(dialogue.turns[0].text);
  await page.locator('#turn-0-1').fill('We need another two weeks, please.');
  await page.screenshot({
    path: `data/validation/2026-11-16/dialogue-fixture-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.locator('[data-save-dialogue="0"]').click();
  await expect(page.locator('#voice-b-row')).toBeVisible();
  await expect(page.locator('#voice-b')).toHaveValue('af_heart');
  await expect(page.locator('#editor')).toHaveAttribute('readonly', '');
  await expect(page.locator('#editor')).toHaveValue(
    'Can we review the schedule?\n\nWe need another two weeks, please.'
  );
  await page.locator('#edit-dialogue').click();
  await expect(page.locator('#turn-0-1')).toHaveValue('We need another two weeks, please.');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
});

test('progress, invitation, and female voice filters work', async ({ page }, testInfo) => {
  await goToView(page, 'progress');
  await expect(page.locator('#progress-summary')).toContainText('12');
  await page.locator('#daily-goal').fill('15');
  await page.locator('#profile-form .button').click();
  await expect(page.locator('#toast')).toContainText('学习目标已保存');
  await page.locator('#create-invite').click();
  await expect(page.locator('#invite-result')).toContainText('synthetic-invite');
  await page.screenshot({
    path: `data/validation/2026-11-16/progress-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await goToView(page, 'voices');
  await page.locator('#voice-gender').selectOption('female');
  await expect(page.locator('.voice-card')).toHaveCount(1);
  await expect(page.locator('.voice-card')).toContainText('Heart');
});

test('logout removes account drafts and protects the workspace', async ({ page }, testInfo) => {
  await page.locator('#author-source').fill('Synthetic private draft');
  if (testInfo.project.name === 'mobile') {
    await page.locator('#more-tools').click();
    await page.locator('#mobile-logout').click();
  } else await page.locator('#logout').click();
  await expect(page.locator('#auth-screen')).toBeVisible();
  await expect(page.locator('.main-shell')).toBeHidden();
  expect(
    await page.evaluate(() => localStorage.getItem('sayloop-authoring-synthetic-user'))
  ).toBeNull();
});

test('dialogue settings survive title edits and reload without losing role voices', async ({
  page,
}) => {
  await page.locator('[data-author-mode="scenario"]').click();
  await page.locator('#author-source').fill('供应商与采购方的交付谈判');
  await openAuthorSettings(page);
  await page.locator('#author-count').fill('1');
  await page.locator('#author-submit').click();
  await page.locator('[data-save-dialogue="0"]').click();
  await page.locator('#voice-b').selectOption('am_fenrir');
  await page.locator('#material-title').fill('交付谈判 · 修改标题');
  const saved = page.waitForRequest(
    (request) => request.url().endsWith('/api/materials') && request.method() === 'POST'
  );
  await page.locator('#save-material').click();
  expect((await saved).postDataJSON().turns).toEqual(dialogue.turns);
  await page.reload();
  await expect(page.locator('#view-studio')).toBeVisible();
  await expect(page.locator('#editor')).toHaveAttribute('readonly', '');
  await expect(page.locator('#voice-label')).toContainText('采购方');
  await expect(page.locator('#voice-b-row')).toBeVisible();
  await expect(page.locator('#voice-b')).toHaveValue('am_fenrir');
  await expect(page.locator('#material-title')).toHaveValue('交付谈判 · 修改标题');
});

test('authoring starts compact and the primary phone action fits above navigation', async ({
  page,
}, testInfo) => {
  await expect(page.locator('#author-context')).toBeHidden();
  await expect(page.locator('#author-instructions')).toBeHidden();
  await expect(page.locator('#author-expression-options')).toBeHidden();
  await expect(page.locator('#author-output')).toBeHidden();
  await expect(page.locator('#author-submit')).toHaveText('润色中文');
  if (testInfo.project.name === 'mobile') {
    const button = await page.locator('#author-submit').boundingBox();
    const navigation = await page.locator('.mobile-navigation').boundingBox();
    expect(button.y).toBeGreaterThan(0);
    expect(button.y + button.height).toBeLessThan(navigation.y);
  }
  await page.screenshot({
    path: `data/validation/ui-0.4.2/author-start-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test('confirmed Chinese generates expressions directly with the edited meaning', async ({
  page,
}) => {
  await page.locator('#author-source').fill('交付需要多两周。');
  await page.locator('#author-submit').click();
  await page.locator('#result-chinese').fill('我们希望延后两周，完成质量验证。');
  const submitted = page.waitForRequest(
    (request) => request.url().endsWith('/api/compositions') && request.method() === 'POST'
  );
  await page.locator('[data-use-chinese]').click();
  const body = (await submitted).postDataJSON();
  expect(body.mode).toBe('variants');
  expect(body.source).toBe('我们希望延后两周，完成质量验证。');
  expect(body.parent_id).toHaveLength(32);
  await expect(page.locator('#variant-0')).toBeVisible();
  await expect(page.locator('#revision-select option')).toHaveCount(3);
});

test('pending submission prevents duplicate requests and recovers after completion', async ({
  page,
}) => {
  let posts = 0;
  let complete = false;
  const item = {
    id: 'c'.repeat(32),
    input: {
      mode: 'polish',
      source: '需要确认交付时间。',
      language: 'a',
      style: 'spoken',
      person: 'first',
      count: 3,
      turns: 6,
      context: '',
      instructions: '',
    },
    created_at: '2026-01-01T00:00:00Z',
    status: 'running',
    progress: 0,
  };
  await page.route('**/api/compositions', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [item] });
    posts += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ status: 202, json: item });
  });
  await page.route('**/api/compositions/*', (route) =>
    route.fulfill({
      json: complete
        ? {
            ...item,
            status: 'completed',
            result: { title: '确认计划', chinese, variants: [], dialogues: [], notes: '' },
          }
        : item,
    })
  );
  await page.locator('#author-source').fill(item.input.source);
  await page.evaluate(() => {
    document.querySelector('#author-form').requestSubmit();
    document.querySelector('#author-form').requestSubmit();
  });
  await expect(page.locator('#author-submit')).toBeDisabled();
  await expect(page.locator('#author-submit')).toHaveText('正在生成…');
  await page.evaluate(() => document.querySelector('#author-form').requestSubmit());
  expect(posts).toBe(1);
  complete = true;
  await expect(page.locator('#result-chinese')).toHaveValue(chinese, { timeout: 6000 });
  await expect(page.locator('#author-submit')).toBeEnabled();
  expect(posts).toBe(1);
});

test('a failed request keeps the source and offers an inline retry', async ({ page }) => {
  let rejected = false;
  await page.route('**/api/compositions', async (route) => {
    if (route.request().method() !== 'POST' || rejected) return route.fallback();
    rejected = true;
    await route.fulfill({ status: 503, json: { detail: '模型暂不可用，请稍后重试。' } });
  });
  await page.locator('#author-source').fill('请确认下周的时间。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#author-error')).toHaveText('模型暂不可用，请稍后重试。');
  await expect(page.locator('#author-source')).toHaveValue('请确认下周的时间。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#result-chinese')).toHaveValue(chinese);
  await expect(page.locator('#author-error')).toBeHidden();
});

test('corrupted or unavailable browser draft storage does not break authoring', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('sayloop-authoring-synthetic-user', '{invalid')
  );
  await page.reload();
  await expect(page.locator('#author-submit')).toBeVisible();
  await expect(page.locator('#author-draft-status')).toContainText('无法恢复');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('sayloop-authoring-'))
        throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await page.locator('#author-source').fill('草稿存储不可用时也可以提交。');
  await expect(page.locator('#author-draft-status')).toContainText('无法保存');
  await page.locator('#author-submit').click();
  await expect(page.locator('#result-chinese')).toHaveValue(chinese);
});

test('refining opens optional instructions and keeps the current result intact', async ({
  page,
}) => {
  await page.locator('#author-source').fill('需要更清楚的中文。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#result-chinese')).toHaveValue(chinese);
  await page.locator('[data-refine-result]').click();
  await expect(page.locator('#author-settings')).toHaveAttribute('open', '');
  await expect(page.locator('#author-instructions')).toBeFocused();
  await expect(page.locator('#result-chinese')).toHaveValue(chinese);
});

test('editing an existing dialogue without authoring history survives a reload', async ({
  page,
}) => {
  await page.evaluate(async () => {
    await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Existing dialogue',
        language: 'a',
        text: 'Hello. Welcome.',
        role_a: '旅客',
        role_b: '工作人员',
        turns: [
          { speaker: 'A', text: 'Hello.', translation: '你好。' },
          { speaker: 'B', text: 'Welcome.', translation: '欢迎。' },
        ],
      }),
    });
  });
  await page.reload();
  await goToView(page, 'library');
  await page.locator('[data-open]').first().click();
  await page.locator('#edit-dialogue').click();
  await expect(page.locator('#turn-0-0')).toBeVisible();
  await page.locator('#turn-0-0').fill('Good morning.');
  await page.reload();
  await expect(page.locator('#turn-0-0')).toHaveValue('Good morning.');
  await expect(page.locator('#role-a-0')).toHaveValue('旅客');
  const saved = page.waitForRequest(
    (request) => request.url().endsWith('/api/materials') && request.method() === 'POST'
  );
  await page.locator('[data-save-dialogue="0"]').click();
  expect((await saved).postDataJSON().tags.every((tag) => typeof tag === 'string')).toBe(true);
  await expect(page.locator('#view-studio')).toBeVisible();
});

test('dialogue batches fold and hidden edits are included when saving', async ({ page }) => {
  const item = {
    id: 'd'.repeat(32),
    input: {
      mode: 'scenario',
      source: '旅行对话。',
      language: 'a',
      style: 'spoken',
      person: 'first',
      count: 3,
      turns: 2,
      context: '',
      instructions: '',
    },
    created_at: '2026-01-01T00:00:00Z',
    status: 'completed',
    result: {
      title: '旅行对话',
      chinese: '',
      variants: [],
      dialogues: [0, 1, 2].map((index) => ({ ...dialogue, title: `旅行对话 ${index + 1}` })),
      notes: '',
    },
  };
  await page.route('**/api/compositions', (route) =>
    route.fulfill({
      status: route.request().method() === 'POST' ? 202 : 200,
      json: route.request().method() === 'POST' ? item : [item],
    })
  );
  await page.route('**/api/compositions/*', (route) => route.fulfill({ json: item }));
  await page.locator('[data-author-mode="scenario"]').click();
  await page.locator('#author-source').fill(item.input.source);
  await page.locator('#author-submit').click();
  await expect(page.locator('.dialogue-result')).toHaveCount(3);
  await expect(page.locator('.dialogue-result').nth(0)).toHaveAttribute('open', '');
  await expect(page.locator('.dialogue-result').nth(2)).not.toHaveAttribute('open', '');
  await page.locator('.dialogue-result').nth(2).locator('summary').click();
  await page.locator('#turn-2-0').fill('Could we change the time?');
  const saved = page.waitForRequest(
    (request) => request.url().endsWith('/api/materials') && request.method() === 'POST'
  );
  await page.locator('[data-save-dialogue="2"]').click();
  expect((await saved).postDataJSON().turns[0].text).toBe('Could we change the time?');
});

test('authoring stays usable at narrow phone and tablet widths', async ({ page }, testInfo) => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('[data-author-mode="variants"]').click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true);
    const size = await page.locator('#author-submit').boundingBox();
    expect(size.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `data/validation/ui-0.4.2/author-${width}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
});

const pendingRevision = () => ({
  id: 'e'.repeat(32),
  input: {
    mode: 'polish',
    source: '已经提交的原文。',
    style: 'spoken',
    language: 'a',
    person: 'first',
    context: '',
    instructions: '',
    count: 3,
    turns: 6,
  },
  status: 'running',
  progress: 0,
  created_at: '2026-01-01T00:00:00Z',
});
const finishedRevision = (item) => ({
  ...item,
  status: 'completed',
  result: { title: '原版本', chinese: '旧请求的结果。', variants: [], dialogues: [], notes: '' },
});

test('an accepted request stays pending when status reads fail without creating another job', async ({
  page,
}) => {
  const item = pendingRevision();
  let posts = 0;
  await page.route('**/api/compositions', (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      return route.fulfill({ status: 202, json: item });
    }
    return route.fulfill({ json: [item] });
  });
  await page.route('**/api/compositions/*', (route) =>
    route.fulfill({ status: 503, json: { detail: '暂时无法读取' } })
  );
  await page.locator('#author-source').fill(item.input.source);
  await page.locator('#author-submit').click();
  await expect(page.locator('#author-status')).toContainText('正在重连', { timeout: 6000 });
  await page.evaluate(() => document.querySelector('#author-form').requestSubmit());
  await expect(page.locator('#author-submit')).toBeDisabled();
  expect(posts).toBe(1);
});

test('late polling cannot replace a new idea or recreate the previous selection', async ({
  page,
}) => {
  const item = pendingRevision();
  let release;
  await page.route('**/api/compositions', (route) =>
    route.fulfill({
      status: route.request().method() === 'POST' ? 202 : 200,
      json: route.request().method() === 'POST' ? item : [item],
    })
  );
  await page.route('**/api/compositions/*', async (route) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: finishedRevision(item) });
  });
  await page.locator('#author-source').fill(item.input.source);
  await page.locator('#author-submit').click();
  await expect.poll(() => Boolean(release), { timeout: 6000 }).toBe(true);
  await page.locator('#new-composition').click();
  await page.locator('#author-source').fill('这是新的想法。');
  release();
  await page.waitForTimeout(350);
  await expect(page.locator('#author-source')).toHaveValue('这是新的想法。');
  await expect(page.locator('#result-chinese')).toHaveCount(0);
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('sayloop-authoring-synthetic-user'))
  );
  expect(draft.current).toBeUndefined();
});

test('late history responses cannot overwrite a more recent selection and its edits', async ({
  page,
}) => {
  await page.locator('#author-source').fill('第一个版本。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#result-chinese')).toBeVisible();
  await page.locator('#author-source').fill('第二个版本。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#revision-select option')).toHaveCount(3);
  const ids = await page
    .locator('#revision-select option')
    .evaluateAll((elements) => elements.map((e) => e.value).filter(Boolean));
  let release;
  await page.route(`**/api/compositions/${ids[1]}`, async (route) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fallback();
  });
  await page.locator('#author-history > summary').click();
  await page.locator('#revision-select').selectOption(ids[1]);
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.locator('#revision-select').selectOption(ids[0]);
  await page.locator('#result-chinese').fill('第二版的最新修改。');
  release();
  await page.waitForTimeout(350);
  await expect(page.locator('#result-chinese')).toHaveValue('第二版的最新修改。');
  await expect(page.locator('#revision-select')).toHaveValue(ids[0]);
});

test('submission briefly locks editable fields until the server accepts their snapshot', async ({
  page,
}) => {
  let release;
  const item = pendingRevision();
  await page.route('**/api/compositions', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fulfill({ status: 202, json: finishedRevision(item) });
  });
  await page.locator('#author-source').fill(item.input.source);
  await page.locator('#author-submit').click();
  await expect(page.locator('#author-source')).toBeDisabled();
  await expect(page.locator('[data-author-mode="scenario"]')).toBeDisabled();
  release();
  await expect(page.locator('#author-source')).toBeEnabled();
  await expect(page.locator('#author-source')).toHaveValue(item.input.source);
});

test('a network retry after reload uses the same per-request id', async ({ page }) => {
  const keys = [];
  const item = pendingRevision();
  await page.route('**/api/compositions', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    keys.push(route.request().postDataJSON().request_id);
    if (keys.length === 1) return route.abort('failed');
    return route.fulfill({ status: 202, json: finishedRevision(item) });
  });
  await page.locator('#author-source').fill(item.input.source);
  await page.locator('#author-submit').click();
  await expect(page.locator('#author-error')).toBeVisible();
  await page.reload();
  await page.locator('#author-submit').click();
  await expect(page.locator('#result-chinese')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[a-f0-9]{32}$/);
  expect(keys[1]).toBe(keys[0]);
});

test('logout still clears drafts when device audio storage rejects cleanup', async ({
  page,
}, testInfo) => {
  await page.locator('#author-source').fill('用于验证退出清理的合成草稿。');
  await expect(page.locator('#author-draft-status')).toContainText('已保存');
  await page.evaluate(() => {
    indexedDB.open = () => {
      throw new DOMException('Denied', 'SecurityError');
    };
  });
  if (testInfo.project.name === 'mobile') {
    await page.locator('#more-tools').click();
    await page.locator('#mobile-logout').click();
  } else await page.locator('#logout').click();
  await expect(page.locator('#auth-screen')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('sayloop-authoring-synthetic-user'))
  ).toBeNull();
  await expect(page.locator('#auth-error')).toContainText('缓存');
});

test('changing a password clears drafts even when device storage refuses cleanup', async ({
  page,
}) => {
  await page.locator('#author-source').fill('用于验证改密清理的合成草稿。');
  await expect(page.locator('#author-draft-status')).toContainText('已保存');
  await page.route('**/api/auth/password', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: null } }));
  await page.evaluate(() => {
    indexedDB.open = () => {
      throw new DOMException('Denied', 'SecurityError');
    };
  });
  await goToView(page, 'progress');
  await page.locator('#current-password').fill('synthetic-current-password');
  await page.locator('#new-password').fill('synthetic-new-password');
  await page.locator('#password-form button').click();
  await expect(page.locator('#auth-screen')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('sayloop-authoring-synthetic-user'))
  ).toBeNull();
  await expect(page.locator('#auth-error')).toContainText('缓存');
});

test('an older 401 cannot reload before logout finishes clearing drafts', async ({
  page,
}, testInfo) => {
  await page.locator('#author-source').fill('用于验证退出响应竞态的合成草稿。');
  await expect(page.locator('#author-draft-status')).toContainText('已保存');
  let releaseRead, releaseLogout;
  await page.route('**/api/generations', async (route) => {
    await new Promise((resolve) => {
      releaseRead = resolve;
    });
    return route.fulfill({ status: 401, json: { detail: 'Synthetic expired session' } });
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => Boolean(releaseRead)).toBe(true);
  await page.route('**/api/auth/logout', async (route) => {
    await new Promise((resolve) => {
      releaseLogout = resolve;
    });
    await page.route('**/api/auth/me', (request) => request.fulfill({ json: { user: null } }));
    return route.fulfill({ json: { ok: true } });
  });
  if (testInfo.project.name === 'mobile') {
    await page.locator('#more-tools').click();
    await page.locator('#mobile-logout').click();
  } else await page.locator('#logout').click();
  await expect.poll(() => Boolean(releaseLogout)).toBe(true);
  releaseRead();
  await page.waitForTimeout(200);
  await expect(page.locator('#auth-screen')).toBeHidden();
  releaseLogout();
  await expect(page.locator('#auth-screen')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('sayloop-authoring-synthetic-user'))
  ).toBeNull();
});

test('a failed logout restores controls only for the same authenticated account', async ({
  page,
}, testInfo) => {
  await page.locator('#author-source').fill('用于验证退出失败恢复的合成草稿。');
  await expect(page.locator('#author-draft-status')).toContainText('已保存');
  await page.route('**/api/auth/logout', (route) => route.abort('failed'));
  const logout = async () => {
    if (testInfo.project.name === 'mobile') {
      if (!(await page.locator('#more-menu').evaluate((menu) => menu.open))) {
        await page.locator('#more-tools').click();
      }
      await page.locator('#mobile-logout').click();
    } else await page.locator('#logout').click();
  };
  await logout();
  await expect(page.locator('#toast')).toContainText('退出未完成');
  await expect(page.locator('#author-source')).toHaveValue('用于验证退出失败恢复的合成草稿。');
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        user: { ...user, id: 'synthetic-other-account', display_name: '另一个学习者' },
      },
    })
  );
  await logout();
  await expect(page.locator('#profile-name')).toHaveText('另一个学习者');
  expect(
    await page.evaluate(() => localStorage.getItem('sayloop-authoring-synthetic-user'))
  ).toBeNull();
});

test('logout cancels a pending device download in another tab', async ({ page }, testInfo) => {
  const peer = await page.context().newPage();
  await peer.goto('/favicon.svg');
  let release;
  await peer.route('**/api/audio/session-retirement.wav', async (route) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fulfill({ contentType: 'audio/wav', body: Buffer.from('synthetic audio') });
  });
  await peer.evaluate(async () => {
    const cache = await import('/audio-cache.js');
    cache.setAudioUser('synthetic-user');
    window.saving = cache.saveAudio('/api/audio/session-retirement.wav').then(
      () => 'completed',
      (error) => error.name
    );
    window.cache = cache;
  });
  await expect.poll(() => Boolean(release)).toBe(true);
  if (testInfo.project.name === 'mobile') {
    await page.locator('#more-tools').click();
    await page.locator('#mobile-logout').click();
  } else await page.locator('#logout').click();
  await expect(page.locator('#auth-screen')).toBeVisible();
  await expect
    .poll(() =>
      peer.evaluate(async () => {
        try {
          await window.cache.cachedAudio('/api/audio/session-retirement.wav');
          return false;
        } catch (error) {
          return error.name === 'AbortError';
        }
      })
    )
    .toBe(true);
  release();
  expect(await peer.evaluate(() => window.saving)).toBe('AbortError');
  expect(
    await peer.evaluate(async () => {
      window.cache.setAudioUser('synthetic-user');
      return Boolean(await window.cache.cachedAudio('/api/audio/session-retirement.wav'));
    })
  ).toBe(false);
  await peer.close();
});

test('history loading protects the current editor until replacement is ready', async ({ page }) => {
  await page.locator('#author-source').fill('第一个版本。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#result-chinese')).toBeVisible();
  await page.locator('#author-source').fill('第二个版本。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#revision-select option')).toHaveCount(3);
  const ids = await page
    .locator('#revision-select option')
    .evaluateAll((elements) => elements.map((e) => e.value).filter(Boolean));
  let release;
  await page.route(`**/api/compositions/${ids[1]}`, async (route) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fallback();
  });
  await page.locator('#author-history > summary').click();
  await page.locator('#revision-select').selectOption(ids[1]);
  await expect(page.locator('#author-source')).toBeDisabled();
  await expect(page.locator('#author-result')).toHaveAttribute('inert', '');
  release();
  await expect(page.locator('#author-result')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#author-source')).toBeEnabled();
  await expect(page.locator('#revision-select')).toHaveValue(ids[1]);
});

test('a delayed material save cannot navigate away from a newer result edit', async ({ page }) => {
  await page.locator('#author-source').fill('一段用于合成测试的想法。');
  await page.locator('#author-submit').click();
  await expect(page.locator('#result-chinese')).toBeVisible();
  await page.locator('[data-use-chinese]').click();
  await expect(page.locator('#variant-0')).toBeVisible();
  let release;
  await page.route('**/api/materials', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((resolve) => {
      release = resolve;
    });
    return route.fallback();
  });
  await page.locator('[data-save-variant="0"]').click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.locator('#variant-0').fill('A newer edit that must remain visible.');
  release();
  await page.waitForTimeout(250);
  await expect(page.locator('#view-authoring')).toBeVisible();
  await expect(page.locator('#variant-0')).toHaveValue('A newer edit that must remain visible.');
});
