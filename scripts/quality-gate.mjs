// Live acceptance harness. Raw provider text and hosted response bytes are never edited.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runFactGuard, NEMOTRON_MODELS } from '../src/fact-guard.js';
import { normalizeInput, parseBundle, validateCopy } from '../src/core.js';
import { estimateCost } from '../src/tournament.js';

export const products = [
  { id: 'board-ko', product_name: '대나무 도마', language: 'Korean', tone: 'friendly', target_customer: '집에서 한 끼를 준비하는 사람',
    product_info: '소재: 대나무.\n크기: 가로 30cm, 세로 20cm.\n색상: 내추럴, 대나무 결이 보임.\n형태: 모서리가 둥근 직사각형.\n용도: 채소와 과일 손질.\n관리: 손세척 후 세워서 건조. 식기세척기 사용 불가.\n무게, 항균 시험, 인증, 배송·반품 조건: 미제공.' },
  { id: 'cup-ko', product_name: '스테인리스 텀블러', language: 'Korean', tone: 'friendly', target_customer: '책상에서 음료를 마시는 직장인',
    product_info: '소재: 스테인리스.\n용량: 500ml.\n색상: 무광 크림색.\n형태: 넓은 입구, 분리형 뚜껑.\n관리: 손세척 권장.\n보온·보냉 지속 시간, 완전 밀폐 여부, 식기세척기 사용 여부, 인증, 배송·반품 조건: 미확인.' },
  { id: 'shirt-en', product_name: 'Linen shirt', language: 'English', tone: 'friendly', target_customer: 'People dressing for a weekend in town',
    product_info: 'Material: linen.\nColor: oat.\nSizes: S, M, L.\nCut: relaxed fit.\nDetails: long sleeves, button front, chest pocket.\nCare: hand wash cold.\nFabric weight, shrinkage tests, certifications, delivery and return terms: not supplied.' },
];
const output = resolve(process.env.QA_OUTPUT || '/tmp/qa-cce2-raw');
const mode = process.argv[2] || 'production';
const set = process.env.QA_SET || new Date().toISOString().replace(/[:.]/g, '-');
const manifestFile = resolve(output, `${set}-manifest.json`);
await mkdir(output, { recursive: true });
let manifest;
try { manifest = JSON.parse(await readFile(manifestFile, 'utf8')); }
catch { manifest = { set, mode, products, calls: Number(process.env.QA_PRIOR_CALLS || 0), budget: Number(process.env.QA_BUDGET || 120), runs: [] }; }
const save = () => writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
const hash = text => createHash('sha256').update(text).digest('hex');
function rawMarkdown(b, input, header) {
  // Rendering only: every model-written value appears verbatim. No editorial replacements.
  return [header, `# ${input.product_name}`, '## Product page', `**${b.pdp.headline}** — ${b.pdp.subheadline}`,
    ...b.pdp.bullets.map(v => `- ${v}`), ...b.pdp.description,
    ...b.pdp.faq.map(v => `Q: ${v.question} | A: ${v.answer}`),
    '## Ads', `Headlines: ${b.ads.headlines.join(' | ')}`, ...b.ads.bodies.map(v => `- ${v}`), b.ads.keywords.join(' '),
    `## Shorts | Hook: ${b.shorts.hook}`,
    ...b.shorts.scenes.map(v => `${v.time} | Visual: ${v.visual} | Voiceover: ${v.voiceover} | Caption: ${v.caption}`),
    `CTA: ${b.shorts.cta}`, '## Thumbnails', b.thumbnails.map(v => `${v.text} | ${v.angle}`).join(' • '),
    '## Listing check', ...b.listingCheck.map(v => `${v.priority}: ${v.issue} | Fix: ${v.fix}`),
  ].join('\n') + '\n';
}

async function record(id, input, response, responseText, latencyMs) {
  const timestamp = new Date().toISOString();
  const guard = response.factGuard;
  if (!guard || guard.mode !== 'live' || guard.fallback) throw new Error('Expected real live inference without fallback.');
  const models = [...new Set(guard.steps.map(s => s.model))];
  if (models.some(m => /ultra/i.test(m))) throw new Error('Ultra is prohibited for this gate.');
  const raw = guard.rawOutput?.text;
  if (!raw) throw new Error('Hosted response does not preserve raw model text.');
  const stem = resolve(output, `${set}-${id}`);
  await writeFile(stem + '.json', raw);
  await writeFile(stem + '.response.json', responseText);
  await writeFile(stem + '.md', rawMarkdown(JSON.parse(raw), input, `RAW model output, unedited, ${timestamp}, model ids: ${models.join(', ')}`));
  if (models.some(m => !Object.values(NEMOTRON_MODELS).slice(0, 2).includes(m))) throw new Error('This gate requires Nemotron Lightning/Super only.');
  const parsed = validateCopy(parseBundle(raw), normalizeInput(input));
  for (const key of ['pdp', 'ads', 'shorts', 'thumbnails', 'listingCheck']) {
    if (JSON.stringify(parsed[key]) !== JSON.stringify(response[key])) throw new Error(`Copy changed after inference: ${key}`);
  }
  const entry = { id, input, timestamp, models, rawModel: guard.rawOutput.model, rawSha256: hash(raw), responseSha256: hash(responseText),
    liveCalls: guard.steps.length, latencyMs, costUsd: guard.steps.reduce((n, s) => n + (estimateCost(s.model, s.usage) || 0), 0),
    trustScore: guard.trustScore, needsReview: guard.needsReview, steps: guard.steps, automatedRubric: 'PASS', editorialReview: 'PENDING' };
  manifest.runs.push(entry); await save();
  console.log(JSON.stringify({ ...entry, steps: undefined }));
  console.log(JSON.stringify({ headline: parsed.pdp.headline, ads: parsed.ads, hook: parsed.shorts.hook, flagged: guard.claims.filter(c => c.status !== 'supported') }));
}
if (mode === 'benchmark') {
  if (!process.env.NEBIUS_API_KEY) throw new Error('NEBIUS_API_KEY is required.');
  for (const model of (process.env.QA_DRAFT_MODELS ? process.env.QA_DRAFT_MODELS.split(',') : [NEMOTRON_MODELS.lightning, NEMOTRON_MODELS.super])) {
    const started = performance.now();
    try {
    const input = products.find(p => p.id === process.env.QA_PRODUCT) || products[0];
    const result = await runFactGuard(input, { apiKey: process.env.NEBIUS_API_KEY, draftModel: model, maxRounds: Number(process.env.QA_MAX_ROUNDS || 1),
      fetchImpl: async (...args) => {
        if (manifest.calls >= manifest.budget) throw new Error('Live-call budget exhausted.');
        manifest.calls++; await save();
        const response = await fetch(...args);
        await writeFile(resolve(output, `${set}-call${manifest.calls}.response.json`), await response.clone().text());
        return response;
      } });
    await record(`${input.id}-call${manifest.calls}`, input, result, JSON.stringify(result), Math.round(performance.now() - started));
    } catch (error) { console.log(JSON.stringify({ model, benchmarkFailure: error.message, callsSoFar: manifest.calls, latencyMs: Math.round(performance.now() - started) })); }
  }
} else if (mode === 'production') {
  const endpoint = process.env.QA_ENDPOINT || 'https://commerce-content-engine-nemotron.vercel.app/api/fact-guard';
  const round = Number(process.env.QA_ROUND || 1);
  let browser;
  try {
    if (process.env.QA_BROWSER === '1') {
      const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
      browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'] });
    }
    for (const input of products.filter(product => !process.env.QA_PRODUCT || product.id === process.env.QA_PRODUCT)) {
      const id = `round${round}-${input.id}`;
      if (manifest.runs.some(run => run.id === id)) { console.log(`Already captured: ${id}`); continue; }
      // Reserve the maximum up front; a network failure cannot silently lose budget accounting.
      if (manifest.calls + 2 > manifest.budget) throw new Error('Insufficient live-call budget for another hosted request.');
      const reservedCalls = Math.min(Number(process.env.QA_MAX_CALLS || 6), manifest.budget - manifest.calls);
      manifest.calls += reservedCalls; manifest.pendingRequest = { id, started: new Date().toISOString() }; await save();
      const started = performance.now();
      let status, text, retryAfter, page;
      if (browser) {
        page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, extraHTTPHeaders: { 'x-cce-max-calls': String(reservedCalls) },
          ...(process.env.QA_VIDEO === '1' ? { recordVideo: { dir: '/tmp/nebius-gate-video', size: { width: 1920, height: 1080 } } } : {}) });
        await page.goto(new URL('/?fact-guard', endpoint).href);
        await page.waitForFunction(() => document.querySelector('#connection-fields').hidden);
        for (const [key, value] of Object.entries(normalizeInput(input))) {
          const field = page.locator(`#product-form [name="${key}"]`);
          if (!await field.count()) continue;
          if (await field.evaluate(el => el.tagName === 'SELECT')) await field.selectOption(String(value));
          else await field.fill(value == null ? '' : String(value));
        }
        await page.screenshot({ path: resolve('media', `quality-production-${id}-input.png`) });
        const pending = page.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST', { timeout: 295000 });
        await page.locator('#generate').click();
        const response = await pending; status = response.status(); text = await response.text(); retryAfter = response.headers()['retry-after'];
      } else {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cce-max-calls': String(reservedCalls) }, body: JSON.stringify(input), signal: AbortSignal.timeout(295000) });
        status = response.status; text = await response.text(); retryAfter = response.headers.get('retry-after');
      }
      if (status === 429) {
        manifest.calls -= reservedCalls; delete manifest.pendingRequest; await save();
        throw new Error(`Production rate limited. Retry-After: ${retryAfter}`);
      }
      // Always save exact response bytes, including failures, before parsing or checking.
      await writeFile(resolve(output, `${set}-${id}.response.json`), text);
      const data = JSON.parse(text);
      delete manifest.pendingRequest;
      if (status !== 200 || !data.factGuard || data.factGuard.fallback) {
        const attempted = data.factGuard?.fallback?.attemptedCalls;
        if (Number.isInteger(attempted) && attempted >= 0 && attempted <= reservedCalls) manifest.calls += attempted - reservedCalls;
        await save(); throw new Error(`Production generation failed (HTTP ${status}); reserved ${reservedCalls} calls conservatively.`);
      }
      manifest.calls += data.factGuard.steps.length - reservedCalls; await save();
      await record(id, input, data, text, Math.round(performance.now() - started));
      if (page) {
        await page.locator('.guard-verdict').scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve('media', `quality-production-${id}-guard.png`) });
        await page.locator('.pipeline-steps').scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve('media', `quality-production-${id}-routing.png`) });
        if (await page.locator('.claim-diff').count()) {
          await page.locator('.claim-diff').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: resolve('media', `quality-production-${id}-claims.png`) });
        }
        await page.locator('.trace-table').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve('media', `quality-production-${id}-trace.png`) });
        await page.locator('#tab-pdp').click();
        await page.locator('#panel-pdp').scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve('media', `quality-production-${id}.png`) });
        console.log(`Real production UI captured: ${id}`);
        const video = page.video();
        if (video) await page.waitForTimeout(1500);
        await page.close();
        if (video) await video.saveAs(resolve('media', `quality-production-${set}-${id}.webm`));
      }
      if (data.factGuard.needsReview) throw new Error('Factual audit has unresolved claims; gate failed.');
    }
  } finally { await browser?.close(); }
} else throw new Error('Use benchmark or production.');
