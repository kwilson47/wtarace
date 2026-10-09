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

test('picking a winner moves the race impact and carries over to the standings', async ({ page, request }) => {
  // Data-independent: uses the first open event with a match to pick.
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const paths = [...sitemap.matchAll(/finalsrace\.win(\/tournaments\/[a-z0-9-]+\/)/g)].map((m) => m[1]!);
  for (const path of paths) {
    await page.goto(path);
    if ((await page.getByRole('region', { name: 'Race impact' }).count()) === 0) continue;
    const pick = page.locator('.match button.line, .round-list button.pick').first();
    if ((await pick.count()) === 0) continue;
    await pick.click();
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
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
