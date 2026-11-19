export async function goToView(page, view) {
  await page.locator('#auth-screen').waitFor({ state: 'hidden' });
  let button = page.locator(`[data-view="${view}"]:visible`).first();
  if (!(await button.count())) {
    await page.locator('#more-tools').click();
    button = page.locator(`#more-menu [data-view="${view}"]`);
  }
  await button.click();
}

export async function openPracticeTools(page) {
  if (!(await page.locator('#practice-tools').evaluate((element) => element.open)))
    await page.locator('#practice-tools > summary').click();
}

export async function openAuthorSettings(page) {
  if (!(await page.locator('#author-settings').evaluate((element) => element.open))) {
    await page.locator('#author-settings > summary').click();
  }
}
