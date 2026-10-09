import { expect, test } from '@playwright/test';

test('the table links to a player profile with her season, which links back into the scenario builder', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('tbody button.name').first();
  const name = (await first.textContent())!.trim();
  await first.click();
  await page.getByRole('link', { name: 'Player Profile' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  await expect(page).toHaveTitle(`${name}: 2026 season results`);
  await expect(page.getByRole('region', { name: 'Season summary' })).toBeVisible();
  await expect(page.locator('section.tournament').first()).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[2]!;
  await page.getByRole('link', { name: `Explore scenarios for ${name}` }).click();
  await expect(page.getByRole('combobox', { name: 'Player', exact: true })).toHaveValue(id);
});

test('an opponent who is tracked links to her own page', async ({ page }) => {
  await page.goto('/players/iga-swiatek/');
  const link = page.locator('section.tournament td.opponent a').first();
  const opponent = (await link.textContent())!.trim();
  await link.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(opponent);
});
