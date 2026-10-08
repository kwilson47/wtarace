import { expect, test } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('picks update standings and survive a shared link', async ({ page, context }) => {
  await page.goto('/');
  // The lowest-ranked players are usually eliminated, which the table hides by default; the choice
  // is remembered, so the shared page below shows them too.
  await page.getByRole('checkbox', { name: 'Hide eliminated players' }).uncheck();
  const editor = page.getByRole('region', { name: 'Scenario editor' });
  await editor.getByRole('tab', { name: 'By player' }).click();

  // Choose the lowest-ranked player who still has an editable event.
  const playerSelect = editor.getByRole('combobox', { name: 'Player', exact: true });
  const ids = await playerSelect.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  let chosen: string | undefined;
  for (const id of ids.reverse()) {
    await playerSelect.selectOption(id);
    if ((await editor.locator('.picks select').count()) > 0) {
      chosen = id;
      break;
    }
  }
  expect(chosen, 'some tracked player has an editable remaining event').toBeDefined();

  const projected = page.getByTestId(`row-${chosen}`).getByTestId('projected');
  const before = await projected.textContent();
  await editor.locator('.picks select').first().selectOption({ label: 'Winner' });
  await expect(projected).not.toHaveText(before!);
  await expect(page).toHaveURL(/[?&]s=/);
  const after = await projected.textContent();

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const shared = await context.newPage();
  await shared.goto(link);
  await expect(shared.getByTestId(`row-${chosen}`).getByTestId('projected')).toHaveText(after!);
  const sharedEditor = shared.getByRole('region', { name: 'Scenario editor' });
  await sharedEditor.getByRole('tab', { name: 'By player' }).click();
  await sharedEditor.getByRole('combobox', { name: 'Player', exact: true }).selectOption(chosen!);
  await expect(sharedEditor.locator('.picks select').first()).toHaveValue('W');
});
