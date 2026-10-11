import { expect, test } from '@playwright/test';

test('race over time: from the standings, add a player, switch to positions, and share', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Race over time →' }).click();
  await expect(page).toHaveURL(/\/race-history\/$/);
  await expect(page.locator('path.series')).toHaveCount(10);
  await page.getByRole('checkbox', { name: 'Elena Rybakina' }).uncheck();
  await expect(page.locator('path.series')).toHaveCount(9);
  await page.getByRole('radio', { name: 'Position' }).check();
  await expect(page).toHaveURL(/view=rank/);
  await page.reload();
  await expect(page.locator('path.series')).toHaveCount(9);
  await expect(page.getByRole('radio', { name: 'Position' })).toBeChecked();
});
