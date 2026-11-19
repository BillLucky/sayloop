import { expect, test } from '@playwright/test';

const credentials = { username: 'entry-learner', password: 'synthetic-entry-password' };
const user = { id: 'entry-user', display_name: '测试学习者', goal: 600 };

async function installLoginFixture(page, sessionResponse) {
  const logins = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return sessionResponse(route);
    if (path === '/api/auth/login') {
      logins.push({
        method: request.method(),
        type: request.headers()['content-type'],
        body: request.postDataJSON(),
      });
      return route.fulfill({ json: { user } });
    }
    if (path === '/api/voices') {
      return route.fulfill({ json: { languages: { a: 'English' }, voices: [] } });
    }
    if (path === '/api/health') return route.fulfill({ json: { ffmpeg: true } });
    if (['/api/materials', '/api/generations', '/api/compositions'].includes(path)) {
      return route.fulfill({ json: [] });
    }
    throw new Error(`Unexpected fixture request: ${request.method()} ${path}`);
  });
  return logins;
}

// A 204 keeps the document available if a broken form navigates during the check.
async function watchPageSubmissions(page) {
  const submissions = [];
  await page.route(
    (url) => url.pathname === '/',
    (route) => {
      const request = route.request();
      if (request.method() === 'GET' && !new URL(request.url()).search) return route.continue();
      submissions.push(request.method());
      return route.fulfill({ status: 204 });
    }
  );
  return submissions;
}

async function fillCredentials(page) {
  await page.locator('#login-name').fill(credentials.username);
  await page.locator('#login-password').fill(credentials.password);
}

async function tryBeforeReady(page) {
  await fillCredentials(page);
  await page.locator('#auth-submit').click({ force: true });
  await page.locator('#login-password').press('Enter');
}

async function expectRetryAvailable(page) {
  const status = page.locator('#auth-startup');
  await expect(status).toBeVisible();
  await expect(status.getByRole('link')).toBeVisible();
  await expect(page.locator('#auth-submit')).toBeDisabled();
  await expect(page.locator('#auth-switch')).toBeDisabled();
}

test('a slow session check keeps credentials on the page until JSON login is ready', async ({
  page,
}) => {
  const submissions = await watchPageSubmissions(page);
  let finishSessionCheck;
  const logins = await installLoginFixture(page, (route) => {
    finishSessionCheck = () => route.fulfill({ json: { user: null } });
  });
  await page.goto('/');
  await expect.poll(() => Boolean(finishSessionCheck)).toBe(true);
  await tryBeforeReady(page);
  // Password managers can submit a form without activating its disabled button.
  await page.locator('#auth-form').evaluate((form) => form.requestSubmit());
  expect(submissions).toEqual([]);
  expect(logins).toEqual([]);
  await expectRetryAvailable(page);
  await finishSessionCheck();
  await expect(page.locator('#auth-submit')).toBeEnabled();
  await expect(page.locator('#auth-startup')).toBeHidden();
  await page.locator('#login-password').press('Enter');
  await expect(page.locator('#view-library')).toBeVisible();
  expect(logins).toEqual([{ method: 'POST', type: 'application/json', body: credentials }]);
  expect(submissions).toEqual([]);
});

test('a missing application module leaves a safe login recovery link', async ({ page }) => {
  const submissions = await watchPageSubmissions(page);
  await page.route('**/app.js*', (route) => route.abort('failed'));
  await page.goto('/');
  await tryBeforeReady(page);
  expect(submissions).toEqual([]);
  await expectRetryAvailable(page);
  await expect(page.locator('#auth-startup')).toContainText('加载失败');
  await page.unroute('**/app.js*');
  await installLoginFixture(page, (route) => route.fulfill({ json: { user: null } }));
  await page.locator('#auth-startup').getByRole('link').click();
  await expect(page.locator('#auth-submit')).toBeEnabled();
  await expect(page.locator('#auth-startup')).toBeHidden();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('clicking or pressing Enter keeps credentials out of the URL and page submission', async ({
    page,
  }) => {
    const submissions = await watchPageSubmissions(page);
    await page.goto('/');
    await tryBeforeReady(page);
    expect(submissions).toEqual([]);
    expect(new URL(page.url()).search).toBe('');
    await expectRetryAvailable(page);
    await expect(page.locator('#auth-startup')).toContainText('重新加载');
  });
});

test('a failed session lookup can recover through the visible reload link', async ({ page }) => {
  let attempts = 0;
  await installLoginFixture(page, (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, json: { detail: 'Synthetic service unavailable' } })
      : route.fulfill({ json: { user: null } });
  });
  const failed = page.waitForResponse(
    (response) => response.url().endsWith('/api/auth/me') && response.status() === 503
  );
  await page.goto('/');
  await failed;
  await expectRetryAvailable(page);
  await expect(page.locator('#auth-startup')).toContainText('加载失败');
  await page.locator('#auth-startup').getByRole('link').click();
  await expect(page.locator('#auth-submit')).toBeEnabled();
  await expect(page.locator('#auth-startup')).toBeHidden();
  expect(attempts).toBe(2);
});
