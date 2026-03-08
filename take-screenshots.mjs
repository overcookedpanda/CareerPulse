import { chromium } from 'playwright';

const BASE = 'http://localhost:8085';
const OUT = 'app/static/screenshots';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

// Set dark theme
await page.goto(BASE);
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('jf_theme', 'dark');
});
await page.waitForTimeout(500);

// 1. Dashboard
await page.goto(`${BASE}/#/stats`);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/dashboard.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
console.log('✓ dashboard');

// 2. Job feed
await page.goto(`${BASE}/#/`);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/feed.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
console.log('✓ feed');

// 3. Job detail - click first job if available
const firstCard = await page.$('.job-card');
if (firstCard) {
  await firstCard.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/job-detail.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
  console.log('✓ job-detail');

  // Scroll down to see more of the detail
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/job-detail-lower.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
  console.log('✓ job-detail-lower');
}

// 4. Settings
await page.goto(`${BASE}/#/settings`);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/settings.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
console.log('✓ settings');

// Scroll settings to show ATS / analysis
await page.evaluate(() => window.scrollBy(0, 600));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/settings-analysis.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
console.log('✓ settings-analysis');

// 5. Keyboard shortcuts modal
await page.goto(`${BASE}/#/`);
await page.waitForTimeout(1000);
await page.keyboard.press('?');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/shortcuts.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
console.log('✓ shortcuts');

// 6. Light mode feed for contrast
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'light');
});
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/feed-light.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
console.log('✓ feed-light');

await browser.close();
console.log('\nDone! Screenshots saved to', OUT);
