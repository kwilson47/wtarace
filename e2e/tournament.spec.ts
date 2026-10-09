import { expect, test } from '@playwright/test';

test('a player page links to a tournament page, which links back to players', async ({ page }) => {
  await page.goto('/players/iga-swiatek/');
  await page.getByRole('link', { name: 'Toronto' }).first().click();
  await expect(page).toHaveURL(/\/tournaments\/toronto-2026\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toronto 2026');
  await expect(page.getByText(/^Champion: Iga Swiatek/)).toBeVisible();
  await page.getByRole('region', { name: 'Our players' }).getByRole('link', { name: 'Elena Rybakina' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Elena Rybakina');
});

test('the scenario editor links to the selected tournament page', async ({ page }) => {
  await page.goto('/');
  const href = await page.getByRole('link', { name: 'Tournament page →' }).getAttribute('href');
  await page.getByRole('link', { name: 'Tournament page →' }).click();
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/\//g, '\\/')}$`));
  await expect(page.getByRole('region', { name: 'Draw' })).toBeVisible();
});
