import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE = 'http://localhost:8085';
const OUT = 'screenshots/launch';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1080, height: 1350 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

// Force dark mode
await page.goto(BASE);
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('jf_theme', 'dark');
});
await page.waitForTimeout(500);

async function shot(name, { fullPage } = {}) {
  const opts = fullPage
    ? { path: `${OUT}/${name}.png`, fullPage: true }
    : { path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: 1080, height: 1350 } };
  await page.screenshot(opts);
  console.log(`✓ ${name}`);
}

// 1. Job feed - hero shot
await page.goto(`${BASE}/#/`);
await page.waitForTimeout(2000);
await shot('01-job-feed');

// 2. Job feed - full scroll
await shot('02-job-feed-full', { fullPage: true });

// 3. Job detail - top (prepared job with high score)
await page.goto(`${BASE}/#/job/1`);
await page.waitForTimeout(2000);
await shot('03-job-detail-top');

// 4. Job detail - scroll to score/match section
await page.evaluate(() => window.scrollBy(0, 500));
await page.waitForTimeout(500);
await shot('04-job-detail-score');

// 5. Job detail - scroll to application/cover letter area
await page.evaluate(() => window.scrollBy(0, 500));
await page.waitForTimeout(500);
await shot('05-job-detail-application');

// 6. Job detail - full page
await page.goto(`${BASE}/#/job/1`);
await page.waitForTimeout(2000);
await shot('06-job-detail-full', { fullPage: true });

// 7. Stats/dashboard
await page.goto(`${BASE}/#/stats`);
await page.waitForTimeout(2000);
await shot('07-stats');

// 8. Stats full page
await shot('08-stats-full', { fullPage: true });

// 9. Settings - AI provider section
await page.goto(`${BASE}/#/settings`);
await page.waitForTimeout(2000);
await shot('09-settings-ai');

// 10. Settings - scroll to profile section
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await shot('10-settings-profile');

// 11. Settings - scroll to resume/ATS analysis
await page.evaluate(() => window.scrollBy(0, 800));
await page.waitForTimeout(500);
await shot('11-settings-resume');

// 12. Settings - scroll further to search terms
await page.evaluate(() => window.scrollBy(0, 600));
await page.waitForTimeout(500);
await shot('12-settings-search');

// 13. Settings full page
await page.goto(`${BASE}/#/settings`);
await page.waitForTimeout(2000);
await shot('13-settings-full', { fullPage: true });

// 14. Keyboard shortcuts modal
await page.goto(`${BASE}/#/`);
await page.waitForTimeout(1500);
await page.keyboard.press('?');
await page.waitForTimeout(500);
await shot('14-keyboard-shortcuts');

// 15. Job feed - second high-scoring job for variety
const jobs = await page.evaluate(async () => {
  const resp = await fetch('/api/jobs?sort=score&limit=5');
  return (await resp.json()).jobs;
});
if (jobs.length > 1) {
  await page.goto(`${BASE}/#/job/${jobs[1].id}`);
  await page.waitForTimeout(2000);
  await shot('15-job-detail-alt');
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(500);
  await shot('16-job-detail-alt-score');
}

// 17. Job feed - another high-scoring detail for variety
if (jobs.length > 2) {
  await page.goto(`${BASE}/#/job/${jobs[2].id}`);
  await page.waitForTimeout(2000);
  await shot('17-job-detail-third');
}

await browser.close();
console.log(`\nDone! ${OUT}/`);
