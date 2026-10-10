import { expect, test } from '@playwright/test';

test('the site nav reaches every tournament and player from any page', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Site' });
  await expect(nav.getByRole('link', { name: 'Standings' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Tournaments' }).click();
  await expect(page).toHaveURL(/\/tournaments\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tournaments: 2026 race');
  await page.getByRole('region', { name: 'Completed' }).getByRole('link', { name: 'Toronto' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toronto 2026');

  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Players' }).click();
  await expect(page).toHaveURL(/\/players\/$/);
  await page.getByRole('searchbox', { name: 'Find a player' }).fill('swiatek');
  await page.getByRole('link', { name: 'Iga Swiatek' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Iga Swiatek');
});
