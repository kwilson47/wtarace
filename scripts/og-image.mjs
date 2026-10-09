// Renders scripts/og-image.html to public/og.png (the 1200×630 link-preview image).
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('./og-image.html', import.meta.url).href);
await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
await browser.close();
