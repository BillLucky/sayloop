import { test, expect } from '@playwright/test';

const user = { id: 'synthetic-user', username: 'learner', display_name: '学习者', goal: 600, admin: true, leaderboard: false };
const voices = [
  { id: 'am_fenrir', name: 'Fenrir', language: 'a', gender: 'male', note: 'Male voice' },
  { id: 'af_heart', name: 'Heart', language: 'a', gender: 'female', note: 'Female voice' },
];
const chinese = '我们想多留两周完成质量验证。';
const dialogue = { title: '讨论交付', role_a: '采购方', role_b: '供应商', turns: [{ speaker: 'A', text: 'Can we review the schedule?', translation: '我们可以确认一下时间吗？' }, { speaker: 'B', text: 'We need two more weeks.', translation: '我们需要再多两周。' }] };

test.beforeEach(async ({ page }) => {
  let signedIn = false;
  const materials = [], revisions = [], feedback = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const body = method === 'POST' || method === 'PATCH' ? route.request().postDataJSON() : null;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: signedIn ? user : null } });
    if (path === '/api/auth/login') { signedIn = true; return route.fulfill({ json: { user } }); }
    if (path === '/api/auth/logout') { signedIn = false; return route.fulfill({ json: { ok: true } }); }
    if (path === '/api/voices') return route.fulfill({ json: { languages: { a: 'American English', z: 'Mandarin Chinese' }, voices } });
    if (path === '/api/health') return route.fulfill({ json: { ffmpeg: true } });
    if (path === '/api/generations') return route.fulfill({ json: [] });
    if (path === '/api/feedback' && method === 'POST') { feedback.push(body); return route.fulfill({ status: 201, json: { ok: true } }); }
    if (path === '/api/feedback') return route.fulfill({ json: feedback });
    if (path === '/api/materials' && method === 'POST') { const material = { ...body, id: String(materials.length + 1).padStart(32, 'a'), words: body.text.split(/\s+/).length, owned: true, visibility: 'private', created_at: new Date().toISOString() }; materials.unshift(material); return route.fulfill({ status: 201, json: material }); }
    if (path === '/api/materials') return route.fulfill({ json: materials });
    if (path.startsWith('/api/materials/') && method === 'PATCH') { const material = materials.find(item => item.id === path.split('/').pop()); Object.assign(material, body); return route.fulfill({ json: material }); }
    if (path === '/api/compositions' && method === 'POST') {
      const result = { title: '交付计划', chinese: body.mode === 'polish' ? chinese : '', variants: body.mode === 'variants' ? [{ label: '简短表达', text: 'We would like two more weeks for quality checks.' }] : [], dialogues: body.mode === 'scenario' ? [dialogue] : [], notes: '保留真实事实，确认后再入库。' };
      const item = { id: String(revisions.length + 1).padStart(32, 'b'), input: body, result, status: 'completed', progress: 100, created_at: new Date().toISOString(), providers: ['Synthetic fixture'] };
      revisions.unshift(item); return route.fulfill({ status: 202, json: item });
    }
    if (path === '/api/compositions') return route.fulfill({ json: revisions });
    if (path.startsWith('/api/compositions/')) return route.fulfill({ json: revisions.find(item => item.id === path.split('/').pop()) });
    if (path === '/api/study/stats') return route.fulfill({ json: { today: 120, total: 720, streak: 2, goal: 600, days: [{ day: '2026-01-01', seconds: 120 }], milestones: [{ minutes: 10, achieved: true }], recent: [], leaderboard: [] } });
    if (path === '/api/auth/profile') return route.fulfill({ json: { ok: true } });
    if (path === '/api/auth/invite') return route.fulfill({ json: { code: 'synthetic-invite', expires_in: 86400 } });
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
  await page.locator('[data-use-chinese]').click();
  await expect(page.locator('#author-source')).toHaveValue(chinese + '原有价格不变。');
  await page.locator('#author-style').selectOption('new_york');
  await page.locator('#author-submit').click();
  await expect(page.locator('#variant-0')).toContainText('quality checks');
  await page.locator('[data-save-variant="0"]').click();
  await expect(page.locator('#view-studio')).toBeVisible();
  await expect(page.locator('#editor')).toHaveValue('We would like two more weeks for quality checks.');
  await page.locator('[data-view="library"]').click();
  await expect(page.locator('.material-tags')).toContainText('new_york');
  await page.locator('#search').fill('new_york');
  await expect(page.locator('.material-card')).toHaveCount(1);
  await page.locator('[data-manage]').click();
  await page.locator('#meta-tags').fill('交付, 商务');
  await page.locator('#meta-favorite').check();
  await page.locator('#metadata-form button[type="submit"], #metadata-form .primary').click();
  await expect(page.locator('#metadata-dialog')).toBeHidden();
  await page.locator('#search').fill('交付');
  await expect(page.locator('.material-card')).toHaveCount(1);
  await page.locator('[data-view="authoring"]').click();
  await expect(page.locator('#revision-select option')).toHaveCount(3);
});

test('scenario roles retain editable translations and separate voices', async ({ page }, testInfo) => {
  await page.locator('[data-author-mode="scenario"]').click();
  await page.locator('#author-source').fill('演练合同交付谈判，双方分别是采购方和供应商。');
  await page.locator('#author-count').fill('1');
  await page.locator('#author-submit').click();
  await expect(page.locator('#turn-0-0')).toHaveValue(dialogue.turns[0].text);
  await page.locator('#turn-0-1').fill('We need another two weeks, please.');
  await page.screenshot({ path: `data/validation/2026-11-16/dialogue-fixture-${testInfo.project.name}.png`, fullPage: true });
  await page.locator('[data-save-dialogue="0"]').click();
  await expect(page.locator('#voice-b-row')).toBeVisible();
  await expect(page.locator('#voice-b')).toHaveValue('af_heart');
  await expect(page.locator('#editor')).toHaveAttribute('readonly', '');
  await expect(page.locator('#editor')).toHaveValue('Can we review the schedule?\n\nWe need another two weeks, please.');
  await page.locator('#edit-dialogue').click();
  await expect(page.locator('#turn-0-1')).toHaveValue('We need another two weeks, please.');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('progress, invitation, and female voice filters work', async ({ page }, testInfo) => {
  await page.locator('[data-view="progress"]').click();
  await expect(page.locator('#progress-summary')).toContainText('12');
  await page.locator('#daily-goal').fill('15');
  await page.locator('#profile-form .button').click();
  await expect(page.locator('#toast')).toContainText('学习目标已保存');
  await page.locator('#create-invite').click();
  await expect(page.locator('#invite-result')).toContainText('synthetic-invite');
  await page.screenshot({ path: `data/validation/2026-11-16/progress-${testInfo.project.name}.png`, fullPage: true });
  await page.locator('[data-view="voices"]').click();
  await page.locator('#voice-gender').selectOption('female');
  await expect(page.locator('.voice-card')).toHaveCount(1);
  await expect(page.locator('.voice-card')).toContainText('Heart');
});

test('logout removes account drafts and protects the workspace', async ({ page }, testInfo) => {
  await page.locator('#author-source').fill('Synthetic private draft');
  if (testInfo.project.name === 'mobile') await page.locator('#mobile-logout').click();
  else await page.locator('#logout').click();
  await expect(page.locator('#auth-screen')).toBeVisible();
  await expect(page.locator('.main-shell')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('sayloop-authoring-synthetic-user'))).toBeNull();
});
