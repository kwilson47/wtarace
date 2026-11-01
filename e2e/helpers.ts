import { expect, type Page } from '@playwright/test';

/** Once the last event before the Finals has been played there is nothing to pick, and the editor says so. */
export async function noTournamentsRemain(page: Page): Promise<boolean> {
  const editor = page.getByRole('region', { name: 'Scenario editor' });
  await expect(editor).toBeVisible();
  return (await editor.getByText('No tournaments remain before the Finals.').count()) > 0;
}
