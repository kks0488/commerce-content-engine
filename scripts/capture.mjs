// Run on pilot, where Playwright/Chromium are installed. No project dependency needed.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/capture.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8346;
const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root,
  env: { ...process.env, PORT: String(port), NEBIUS_API_KEY: '', LLM_API_KEY: '' }, stdio: 'pipe' });
let browser;
const errors = [];
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { if (code) reject(new Error(`Server exited ${code}`)); });
  });
  await mkdir(new URL('../media/', import.meta.url), { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'light',
    recordVideo: { dir: `${root}/media`, size: { width: 1920, height: 1080 } } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/?fact-guard`);
  await page.waitForFunction(() => document.querySelector('#connection-fields').hidden);
  await page.screenshot({ path: `${root}/media/01-fact-guard-start.png` });
  await page.locator('#demo').click();
  await page.locator('.guard-verdict strong').waitFor();
  assert.equal((await page.locator('.guard-verdict strong').innerText()).replace(/\s/g, ''), '100/100');
  assert.equal(await page.locator('.pipeline-steps article').count(), 4);
  assert.equal(await page.locator('.claim-diff').count(), 2);
  assert.match(await page.locator('#output-kind').innerText(), /DEMO/);
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/fact-guard') && r.request().method() === 'POST');
  await page.locator('#generate').click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const bundle = await response.json();
  assert.equal(bundle.factGuard.mode, 'demo'); assert.equal(bundle.factGuard.needsReview, false);
  assert.equal(bundle.factGuard.history[0].claims.filter(c => c.status !== 'supported').length, 2);
  await page.waitForFunction(() => document.querySelector('#generate').disabled === false);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.workspace').offsetTop - 16));
  await page.screenshot({ path: `${root}/media/02-fact-guard-result.png` });
  await page.locator('.claim-diff').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${root}/media/03-claim-revisions.png` });
  await page.getByText('Final fact trace', { exact: false }).evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${root}/media/04-fact-trace.png` });
  // Generated tabs/export continue working after a guard run.
  await page.locator('#tab-pdp').click(); assert.ok(await page.locator('.big-headline').isVisible());
  await page.locator('#tab-margin').click(); assert.match(await page.locator('#panel-margin').innerText(), /12.16/);
  const downloadPromise = page.waitForEvent('download'); await page.locator('#download').click();
  assert.equal((await downloadPromise).suggestedFilename(), 'commerce-bundle.md');
  await page.locator('#tab-factGuard').click();
  await page.locator('#locale').click(); assert.match(await page.locator('#tab-factGuard').innerText(), /사실 확인/);
  await page.locator('#locale').click();
  // Original static Pages path: block the API so BYO-key/sample behavior is exercised.
  const original = await context.newPage();
  original.on('pageerror', error => errors.push(error.message));
  await original.route('**/api/fact-guard', route => route.fulfill({ status: 404, body: 'Not found' }));
  await original.goto(`http://127.0.0.1:${port}/`);
  assert.equal(await original.locator('#fact-guard').isChecked(), false);
  await original.locator('#demo').click();
  assert.match(await original.locator('.big-headline').innerText(), /내 하루/);
  await original.locator('#provider').selectOption('nebius');
  assert.equal(await original.locator('#model').inputValue(), 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B');
  await original.locator('#fact-guard').check();
  assert.equal(await original.locator('#provider').isDisabled(), true);
  await original.locator('#fact-guard').uncheck();
  assert.equal(await original.locator('#provider').isDisabled(), false);
  await original.close();
  await context.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const mp = await mobile.newPage();
  mp.on('pageerror', error => errors.push(error.message));
  await mp.goto(`http://127.0.0.1:${port}/?fact-guard`);
  await mp.waitForFunction(() => document.querySelector('#connection-fields').hidden);
  await mp.locator('#demo').click(); await mp.locator('.guard-verdict').waitFor();
  await mp.locator('.guard-verdict').scrollIntoViewIfNeeded();
  assert.equal(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal page overflow');
  await mp.screenshot({ path: `${root}/media/05-mobile-fact-guard.png` });
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: 'Chromium', viewport: '1920x1080', mode: 'offline fixtures',
    checks: ['hosted POST flow', 'two caught claims', 'four routed steps', 'fact trace', 'margin', 'Markdown download', 'Korean UI', 'static sample regression', 'Nebius provider', '390px dark layout'],
    pageErrors: errors, captures: 'media/01-05*.png', video: 'media/*.webm (not committed)' }, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
}
