import { expect, test } from '@playwright/test';

test("the standings show each player's chance to qualify", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Chance' })).toBeVisible();
  const first = page.locator('[data-testid^="row-"]').first();
  await expect(first.getByTestId('chance')).toHaveText(/^(Q|>99%|<1%|\d{1,2}%)$/);
  await first.getByRole('button').first().click();
  await expect(page.getByText(/^Chance to qualify: /)).toBeVisible();
});
