import { expect, test } from '@playwright/test';

test('the table links to a player profile, which links back into the scenario builder', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('tbody button.name').first();
  const name = (await first.textContent())!.trim();
  await first.click();
  await page.getByRole('link', { name: 'Player Profile' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  await expect(page).toHaveTitle(new RegExp(`^${name}: Race to the WTA Finals`));
  const id = new URL(page.url()).pathname.split('/')[2]!;
  await page.getByRole('link', { name: `Explore scenarios for ${name}` }).click();
  await expect(page.getByRole('combobox', { name: 'Player', exact: true })).toHaveValue(id);
});

test('"Try this scenario" opens the homepage with those picks', async ({ page }) => {
  await page.goto('/');
  const names = await page.locator('tbody button.name').allTextContents();
  for (const name of names) {
    await page.goto('/');
    await page.getByRole('button', { name: name.trim() }).click();
    await page.getByRole('link', { name: 'Player Profile' }).click();
    const tries = page.getByRole('link', { name: 'Try this scenario' });
    const hrefs = await tries.evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    const withPicks = hrefs.find((h) => h.startsWith('/?s='));
    if (!withPicks) continue;
    await page.goto(withPicks);
    await expect(page).toHaveURL(new RegExp(`\\${withPicks.replace(/[.?]/g, (c) => `\\${c}`)}$`));
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
    return;
  }
  test.skip(true, 'No open player has an example scenario with picks right now.');
});
