import { expect, test } from '@playwright/test';

test('a player page links to a tournament page, which links back to players', async ({ page }) => {
  await page.goto('/players/iga-swiatek/');
  await page.getByRole('link', { name: 'Toronto' }).first().click();
  await expect(page).toHaveURL(/\/tournaments\/toronto-2026\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toronto 2026');
  await expect(page.getByText(/^Champion: Iga Swiatek/)).toBeVisible();
  await page.getByRole('region', { name: 'Tracked players' }).getByRole('link', { name: 'Elena Rybakina' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Elena Rybakina');
});

test('the scenario editor links to the selected tournament page', async ({ page }) => {
  await page.goto('/');
  const href = await page.getByRole('link', { name: 'Tournament page →' }).getAttribute('href');
  await page.getByRole('link', { name: 'Tournament page →' }).click();
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/\//g, '\\/')}$`));
  await expect(page.getByRole('region', { name: 'Draw' })).toBeVisible();
});

test('picking a winner moves the race impact and carries over to the standings', async ({ page }) => {
  // Data-independent: uses the first live or upcoming event (from the tournaments index) with a match to pick.
  await page.goto('/tournaments/');
  const open = page.getByRole('region', { name: /Live now|Upcoming/ }).getByRole('link');
  const paths = await open.evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  for (const path of paths) {
    await page.goto(path);
    if ((await page.getByRole('region', { name: 'Race impact' }).count()) === 0) continue;
    const pick = page.locator('.match button.line').first();
    if ((await pick.count()) === 0) continue;
    // Picking her can open her next match, so the first pickable button may then be someone else's: check hers.
    const name = (await pick.textContent())!.trim();
    await pick.click();
    await expect(page.locator('[aria-pressed="true"]', { hasText: name }).first()).toBeVisible();
    await expect(page).toHaveURL(/[?&]s=/);
    const s = new URL(page.url()).searchParams.get('s')!;
    await page.getByRole('link', { name: 'Full standings with these picks →' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const carried = new URL(page.url()).searchParams.get('s') ?? '';
    for (const entry of s.split('_')) expect(carried.split('_')).toContain(entry);
    return;
  }
  test.skip(true, 'No open event has a pickable match right now.');
});
