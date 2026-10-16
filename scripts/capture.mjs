// Run on pilot, where Playwright/Chromium are installed. No project dependency needed.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/capture.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { FACT_GUARD_SAMPLE, NEMOTRON_MODELS } from '../src/fact-guard.js';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 8346);
const live = process.env.CAPTURE_LIVE === '1';
const server = process.env.CAPTURE_URL ? null : spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root,
  env: { ...process.env, PORT: String(port), NEBIUS_API_KEY: live ? process.env.NEBIUS_API_KEY : '', LLM_API_KEY: live ? process.env.LLM_API_KEY : '' }, stdio: 'pipe' });
let browser;
const errors = [];
try {
  if (server) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { if (code) reject(new Error(`Server exited ${code}`)); });
  });
  await mkdir(new URL('../media/', import.meta.url), { recursive: true });
  if (live) { await captureLive(); } else {
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
  assert.equal(await original.locator('#model').inputValue(), 'nvidia/Nemotron-3_5-Lightning');
  await original.locator('#fact-guard').check();
  assert.equal(await original.locator('#provider').isDisabled(), true);
  await original.locator('#fact-guard').uncheck();
  assert.equal(await original.locator('#provider').isDisabled(), false);
  await original.close();
  await context.close();
  // Fact Guard v2: record the real streamed tournament and its paced fixture animation.
  const tournamentContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark',
    recordVideo: { dir: '/tmp/nebius-tournament-recording', size: { width: 1920, height: 1080 } } });
  const arena = await tournamentContext.newPage();
  arena.on('pageerror', error => errors.push(error.message));
  await arena.goto(`http://127.0.0.1:${port}/?tournament`);
  await arena.getByText('DEMO / OFFLINE FIXTURES', { exact: true }).waitFor();
  assert.equal(await arena.locator('.variant-tile').count(), 16);
  await arena.screenshot({ path: `${root}/media/06-tournament-ready.png` });
  await arena.locator('#arena-run').click();
  await arena.locator('.variant-tile.drafted').first().waitFor();
  await arena.screenshot({ path: `${root}/media/07-tournament-generating.png` });
  await arena.locator('.variant-tile.eliminated').first().waitFor();
  await arena.screenshot({ path: `${root}/media/08-tournament-fact-gate.png` });
  await arena.locator('.variant-tile.winner').waitFor();
  await arena.waitForFunction(() => !document.querySelector('#arena-run').disabled);
  assert.equal(await arena.locator('.variant-tile.eliminated').count(), 4);
  assert.equal(await arena.locator('.bracket-round').count(), 4);
  assert.equal(await arena.locator('.variant-tile.winner').count(), 1);
  assert.match(await arena.locator('#arena-notice').innerText(), /No model called/);
  assert.match(await arena.locator('#arena-metrics').innerText(), /11 big-model duels/);
  assert.equal(await arena.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await arena.screenshot({ path: `${root}/media/09-tournament-bracket.png` });
  await arena.locator('.winner-banner').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await arena.screenshot({ path: `${root}/media/10-tournament-winner-trace.png` });
  assert.equal(await arena.locator('#arena-winner .arena-trace > div').count(), 14);
  // Select a rejected tile and expose the exact failed claim/reason.
  await arena.locator('[data-variant="V04"]').click();
  assert.match(await arena.locator('#arena-detail').innerText(), /Medical guarantee/);
  await arena.locator('#arena-count').selectOption('32');
  assert.equal(await arena.locator('.variant-tile').count(), 32);
  await arena.locator('#arena-count').selectOption('16');
  const video = arena.video();
  await tournamentContext.close();
  await video.saveAs(`${root}/media/tournament-1920x1080.webm`);
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const mp = await mobile.newPage();
  mp.on('pageerror', error => errors.push(error.message));
  await mp.goto(`http://127.0.0.1:${port}/?fact-guard`);
  await mp.waitForFunction(() => document.querySelector('#connection-fields').hidden);
  await mp.locator('#demo').click(); await mp.locator('.guard-verdict').waitFor();
  await mp.locator('.guard-verdict').scrollIntoViewIfNeeded();
  assert.equal(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal page overflow');
  await mp.screenshot({ path: `${root}/media/05-mobile-fact-guard.png` });
  await mp.goto(`http://127.0.0.1:${port}/?tournament`);
  await mp.getByText('DEMO / OFFLINE FIXTURES', { exact: true }).waitFor();
  await mp.emulateMedia({ reducedMotion: 'reduce' });
  // Reload so the reduced-motion preference applies to the animation controller.
  await mp.reload();
  await mp.locator('#arena-run').click();
  await mp.locator('.variant-tile.winner').waitFor();
  assert.equal(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No tournament mobile horizontal page overflow');
  await mp.locator('#arena-grid').scrollIntoViewIfNeeded();
  await mp.screenshot({ path: `${root}/media/11-mobile-tournament.png` });
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: 'Chromium', viewport: '1920x1080', mode: 'offline fixtures',
    checks: ['hosted POST flow', 'two caught claims', 'four routed steps', 'fact trace', 'margin', 'Markdown download', 'Korean UI', 'static sample regression', 'Nebius provider', '390px dark layout', 'streamed 16-variant tournament', 'four unsafe variants rejected', '11 persona duels', 'winner trace', '32-tile layout', 'reduced-motion mobile tournament'],
    pageErrors: errors, captures: 'media/01-11*.png', video: 'media/*.webm (not committed)' }, null, 2));
  }
} finally {
  await browser?.close();
  if (server) {
    server.kill('SIGTERM');
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
  }
}


// One real request per workflow. Never replay a fixture while recording live evidence.
async function captureLive() {
  const base = process.env.CAPTURE_URL || `http://127.0.0.1:${port}`;
  const label = process.env.CAPTURE_LABEL || 'pilot';
  assert.match(label, /^[a-z-]+$/);
  const date = new Date().toISOString();
  const summaries = [];
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: `/tmp/nebius-live-${label}`, size: { width: 1920, height: 1080 } } });
  // Clone the real fetch response: Chromium's DevTools response.text() can lose
  // consumed streaming bodies. The app still reads the original response normally.
  await context.addInitScript(() => {
    window.__captureResponses = {};
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (args[1]?.method === 'POST' && String(args[0]).startsWith('/api/')) {
        const path = String(args[0]);
        response.clone().text().then(text => { window.__captureResponses[path] = { status: response.status, text }; });
      }
      return response;
    };
  });
  if (process.env.CAPTURE_WORKFLOW !== 'tournament') {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  const shot = name => page.screenshot({ path: `${root}/media/live-${label}-${name}.png` });
  await page.goto(`${base}/?fact-guard`);
  await page.waitForFunction(() => document.querySelector('#connection-fields').hidden);
  const status = await (await context.request.get(`${base}/api/fact-guard`)).json();
  assert.equal(status.mode, 'live');
  assert.equal(status.models.draft, NEMOTRON_MODELS.lightning);
  assert.equal(status.models.verify, NEMOTRON_MODELS.super);
  for (const [key, value] of Object.entries(FACT_GUARD_SAMPLE)) {
    const field = page.locator(`#product-form [name="${key}"]`);
    if (!await field.count()) continue;
    if (await field.evaluate(el => el.tagName === 'SELECT')) await field.selectOption(String(value));
    else await field.fill(String(value));
  }
  await shot('01-fact-guard-ready');
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/fact-guard') && r.request().method() === 'POST', { timeout: 295000 });
  console.log(`${label}: starting LIVE Fact Guard`);
  await page.locator('#generate').click();
  await shot('02-fact-guard-running');
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const bundle = await response.json(), guard = bundle.factGuard;
  assert.equal(guard.mode, 'live', guard.notice); assert.equal(guard.fallback, undefined);
  assert.ok(guard.totals.totalTokens > 0); assert.equal(guard.totals.usageComplete, true);
  assert.ok(guard.steps.every(s => !s.usageEstimated && s.usage.total_tokens > 0));
  await page.locator('.guard-verdict').waitFor();
  await page.locator('.guard-verdict').scrollIntoViewIfNeeded();
  assert.match(await page.locator('.mode-pill').innerText(), /Live · Nebius Token Factory/);
  await shot('03-fact-guard-result');
  await page.locator('.pipeline-steps').scrollIntoViewIfNeeded();
  await shot('04-fact-guard-models');
  await page.locator('.trace-table').last().scrollIntoViewIfNeeded();
  await shot('05-fact-guard-trace');
  summaries.push({ environment: label, workflow: 'fact-guard', measuredAt: date, baseUrl: base, mode: guard.mode,
    totals: guard.totals, steps: guard.steps, trustScore: guard.trustScore, needsReview: guard.needsReview,
    changedFields: guard.changes.length });
  await saveMeasurements(summaries);
  console.log(JSON.stringify(summaries.at(-1)));
  const factVideo = page.video(); await page.close();
  await factVideo.saveAs(`${root}/media/live-${label}-fact-guard-1920x1080.webm`);
  }
  const arena = await context.newPage();
  arena.on('pageerror', error => errors.push(error.message));
  await arena.goto(`${base}/?tournament`);
  await arena.getByText('Live · Nebius Token Factory', { exact: true }).waitFor();
  assert.equal(await arena.locator('#arena-count').inputValue(), '16');
  await arena.screenshot({ path: `${root}/media/live-${label}-06-tournament-ready.png` });
  const tournamentResponsePromise = arena.waitForResponse(r => r.url().endsWith('/api/tournament') && r.request().method() === 'POST', { timeout: 295000 });
  console.log(`${label}: starting LIVE 16-variant tournament`);
  await arena.locator('#arena-run').click();
  await arena.waitForFunction(() => document.querySelector('.variant-tile.drafted'), { timeout: 60000 });
  await arena.screenshot({ path: `${root}/media/live-${label}-07-tournament-generating.png` });
  const tournamentResponse = await tournamentResponsePromise;
  assert.equal(tournamentResponse.status(), 200);
  await arena.waitForFunction(() => window.__captureResponses['/api/tournament'], null, { timeout: 295000 });
  const captured = await arena.evaluate(() => window.__captureResponses['/api/tournament']);
  const events = captured.text.trim().split('\n').map(line => JSON.parse(line));
  const result = events.find(e => e.type === 'result')?.result;
  assert.ok(result, 'Tournament must emit a final result');
  if (result.mode !== 'live') console.log(JSON.stringify({ environment: label, workflow: 'tournament', fallback: result.fallback, notice: result.notice }));
  assert.equal(result.mode, 'live', result.notice); assert.equal(result.fallback, undefined);
  assert.equal(result.count, 16); assert.ok(result.winner?.eligible, 'A live verified winner must exist');
  assert.ok(result.totals.totalTokens > 0); assert.equal(result.totals.usageComplete, true);
  assert.ok(result.steps.every(s => !s.usageEstimated && s.usage.total_tokens > 0));
  await arena.locator('.variant-tile.winner').waitFor({ timeout: 15000 });
  await arena.waitForFunction(() => !document.querySelector('#arena-run').disabled);
  assert.match(await arena.locator('#arena-mode').innerText(), /Live · Nebius Token Factory/);
  await arena.screenshot({ path: `${root}/media/live-${label}-08-tournament-bracket.png` });
  await arena.locator('#arena-metrics').scrollIntoViewIfNeeded();
  await arena.screenshot({ path: `${root}/media/live-${label}-09-tournament-metrics.png` });
  await arena.locator('.winner-banner').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await arena.screenshot({ path: `${root}/media/live-${label}-10-tournament-winner.png` });
  assert.equal(await arena.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  summaries.push({ environment: label, workflow: 'tournament', measuredAt: date, baseUrl: base, mode: result.mode,
    count: result.count, concurrency: result.concurrency, totals: result.totals, stages: result.stages,
    models: [...new Set(result.steps.map(s => s.model))], reasoningTokens: result.steps.reduce((n, s) => n + (s.usage.completion_tokens_details?.reasoning_tokens || 0), 0),
    winner: result.winner.id, survivors: result.variants.filter(v => v.eligible).length });
  console.log(JSON.stringify(summaries.at(-1)));
  const arenaVideo = arena.video(); await arena.close();
  await arenaVideo.saveAs(`${root}/media/live-${label}-tournament-1920x1080.webm`);
  await context.close();
  assert.deepEqual(errors, []);
  await saveMeasurements(summaries);
  console.log(JSON.stringify({ liveVerified: true, environment: label, pageErrors: errors, screenshots: '1920x1080', workflows: summaries.length }));
}

async function saveMeasurements(summaries) {
  let measurements = [];
  try { measurements = JSON.parse(await readFile(`${root}/media/live-measurements.json`, 'utf8')); } catch {}
  measurements = measurements.filter(m => !summaries.some(s => s.environment === m.environment && s.workflow === m.workflow)).concat(summaries);
  await writeFile(`${root}/media/live-measurements.json`, JSON.stringify(measurements, null, 2) + '\n');
}
