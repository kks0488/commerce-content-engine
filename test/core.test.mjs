import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeInput, buildMessages, parseBundle, computeMargin, extractProductFromHtml, callLLM, generateBundle, bundleToMarkdown, SAMPLE_PRODUCT, DEMO_BUNDLE } from '../src/core.js';

test('input validation reports readable errors together and preserves zero cost', () => {
  assert.throws(() => normalizeInput({ price: -1, cost: 'oops' }), error => error.errors.length === 4 && /product_name/.test(error.message) && /product_info/.test(error.message));
  const input = normalizeInput({ ...SAMPLE_PRODUCT, cost: 0, language: 'en', feePct: '' });
  assert.equal(input.cost, 0); assert.equal(input.language, 'English'); assert.equal(input.feePct, 0);
  for (const patch of [{ price: 0 }, { feePct: 101 }, { language: 'French' }, { tone: 'fake' }]) assert.throws(() => normalizeInput({ ...SAMPLE_PRODUCT, ...patch }));
});

test('parseBundle handles JSON fences, extra prose, and quoted braces', () => {
  const raw = JSON.stringify({ pdp: { headline: 'Hello {world} with "quotes"' } });
  for (const text of [raw, '```json\n' + raw + '\n```', 'Your output:\n' + raw + '\nEnjoy!']) {
    const b = parseBundle(text);
    assert.equal(b.pdp.headline, 'Hello {world} with "quotes"');
    assert.ok(Array.isArray(b.pdp.faq)); assert.ok(Array.isArray(b.shorts.scenes));
    assert.equal(typeof b.ads.headlines[0], 'string');
    assert.doesNotThrow(() => bundleToMarkdown(b));
  }
});
test('parseBundle defaults malformed nested fields and ignores model margin', () => {
  const b = parseBundle(JSON.stringify({ pdp: { bullets: [null, {}, 'valid'], faq: [null, { question: 'Q' }] }, ads: null, shorts: { scenes: [null, 3, { time: '0-3s' }] }, thumbnails: [null, {}], listingCheck: [{ priority: 'low' }, { priority: 'high' }, { priority: 'invalid' }], margin: { unitProfit: 999 } }));
  assert.deepEqual(b.pdp.bullets, ['valid']); assert.equal(b.pdp.faq[0].answer, '[needs info]');
  assert.equal(b.shorts.scenes[0].visual, '[needs info]'); assert.equal(b.thumbnails[0].text, '[needs info]');
  assert.deepEqual(b.listingCheck.map(v => v.priority), ['high', 'medium', 'low']);
  assert.equal(b.margin, null);
});
test('parseBundle rejects garbage and unrecognized objects clearly', () => {
  for (const text of ['oops', '{}', '[]', '{broken}', '{"error":"No output"}', '{"pdp":null}', null]) assert.throws(() => parseBundle(text), /JSON|bundle|response/);
});

test('margin computes fees, shipping, ads and break-even before ads', () => {
  const m = computeMargin({ price: 100, cost: 40, feePct: 10, shipping: 5, adCost: 15 });
  assert.equal(m.fee, 10); assert.equal(m.profitBeforeAds, 45); assert.equal(m.unitProfit, 30);
  assert.equal(m.marginPct, 30); assert.equal(m.breakEvenRoas, 100 / 45); assert.deepEqual(m.warnings, []);
  assert.equal(computeMargin({ price: 100, cost: 0 }).unitProfit, 100);
});
test('margin missing, low, zero and negative profit are safe and JSON serializable', () => {
  for (const input of [{}, { price: 100 }, { cost: 0 }, { price: '', cost: 1 }, { price: 10, cost: null }]) assert.equal(computeMargin(input), null);
  assert.match(computeMargin({ price: 100, cost: 90 }).warnings[0], /15%/);
  assert.equal(computeMargin({ price: 100, cost: 85 }).warnings.length, 0);
  for (const cost of [100, 120]) {
    const m = computeMargin({ price: 100, cost });
    assert.equal(m.breakEvenRoas, null); assert.ok(m.unitProfit <= 0); assert.ok(m.warnings.length >= 2);
    assert.ok(!JSON.stringify(m).includes('Infinity'));
  }
  const negativeAfterAds = computeMargin({ price: 100, cost: 50, adCost: 60 });
  assert.equal(negativeAfterAds.unitProfit, -10); assert.equal(negativeAfterAds.breakEvenRoas, 2);
  for (const input of [{ price: 0, cost: 1 }, { price: 10, cost: -1 }, { price: 10, cost: 1, feePct: 101 }, { price: Infinity, cost: 1 }]) assert.throws(() => computeMargin(input), /Invalid margin/);
});

test('HTML extraction uses JSON-LD Product within graphs, decodes text, strips scripts/styles', () => {
  const html = `<title>Fallback</title><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'Organization', name: 'Ignore' }, { '@type': ['Thing', 'Product'], name: 'Moru &amp; Cup', description: '<b>Steel</b> cup', brand: { name: 'Moru' }, image: ['/cup.png', { url: '/other.png' }], offers: [{ price: '24000', priceCurrency: 'KRW' }] }] })}</script><style>HIDDENSTYLE</style><script>SECRET()</script><li>Wide <b>opening</b></li><p>Body &#x1F375;</p>`;
  const p = extractProductFromHtml(html, 'https://example.test/item');
  assert.equal(p.title, 'Moru & Cup'); assert.equal(p.description, 'Steel cup'); assert.equal(p.brand, 'Moru');
  assert.equal(p.price, 24000); assert.equal(p.currency, 'KRW'); assert.deepEqual(p.images, ['https://example.test/cup.png', 'https://example.test/other.png']);
  assert.deepEqual(p.bullets, ['Wide opening']); assert.ok(p.rawText.includes('🍵')); assert.doesNotMatch(p.rawText, /SECRET|HIDDENSTYLE|@graph/);
});
test('HTML extraction falls back to OG/meta/title and handles empty/malformed content', () => {
  const p = extractProductFromHtml(`<meta content='OG &quot;name&quot;' property='og:title'><meta name="description" content="Useful"><meta property="og:image" content="/image.jpg"><meta property="product:price:amount" content="1,234"><meta property="product:price:currency" content="USD"><script type="application/ld+json">broken</script>`, 'https://example.test');
  assert.equal(p.title, 'OG "name"'); assert.equal(p.description, 'Useful'); assert.equal(p.price, 1234); assert.equal(p.currency, 'USD');
  assert.equal(extractProductFromHtml('<title>Only a title</title>').title, 'Only a title');
  assert.deepEqual(extractProductFromHtml(''), { title: '', description: '', price: null, currency: '', brand: '', images: [], bullets: [], rawText: '' });
  assert.equal(extractProductFromHtml('<p>' + 'x'.repeat(7000) + '</p>').rawText.length, 6000);
  assert.equal(extractProductFromHtml('<meta property="og:image" content="javascript:alert(1)">').images.length, 0);
});

test('messages specify language, channel, forbidden claims, schema and no-invention rule', () => {
  const { system, user } = buildMessages({ ...SAMPLE_PRODUCT, language: 'Japanese', channel: 'TikTok Shop', forbidden_claims: 'No medical claims' });
  assert.match(system, /Japanese/); assert.match(system, /Never invent certifications, awards, reviews, numbers, or medical\/efficacy claims/);
  assert.match(system, /JSON only/); assert.match(system, /30-45/); assert.match(system, /untrusted/); assert.match(system, /\[needs info\]/);
  assert.match(user, /TikTok Shop/); assert.match(user, /No medical claims/); assert.match(system, /listingCheck/);
  assert.match(buildMessages(SAMPLE_PRODUCT).system, /\[확인 필요\]/);
});

const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
test('OpenAI request has correct endpoint, defaults, headers and messages', async () => {
  const result = await callLLM({ apiKey: 'mock-key', system: 'S', user: 'U', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions'); assert.equal(init.method, 'POST'); assert.equal(init.headers.Authorization, 'Bearer mock-key');
    assert.equal(init.redirect, 'error'); assert.deepEqual(JSON.parse(init.body), { model: 'gpt-5-mini', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }] });
    return response({ choices: [{ message: { content: 'result' } }] });
  } });
  assert.equal(result, 'result');
});
test('OpenAI-compatible endpoint accepts custom base and model', async () => {
  await callLLM({ apiKey: 'mock', baseUrl: 'http://localhost:11434/v1/', model: 'local-model', fetchImpl: async (url, init) => {
    assert.equal(url, 'http://localhost:11434/v1/chat/completions'); assert.equal(JSON.parse(init.body).model, 'local-model');
    return response({ choices: [{ message: { content: '{}' } }] });
  } });
});
test('Anthropic request has required headers, no temperature, and joins only text', async () => {
  const result = await callLLM({ provider: 'anthropic', apiKey: 'mock', system: 'S', user: 'U', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(init.headers['x-api-key'], 'mock');
    assert.equal(init.headers['anthropic-version'], '2023-06-01'); assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
    const body = JSON.parse(init.body);
    assert.deepEqual(body, { model: 'claude-opus-5-5', max_tokens: 16000, system: 'S', messages: [{ role: 'user', content: 'U' }] }); assert.ok(!('temperature' in body));
    return response({ content: [{ type: 'text', text: 'one' }, { type: 'thinking', text: 'ignore' }, { type: 'text', text: 'two' }] });
  } });
  assert.equal(result, 'one\ntwo');
});
test('Gemini request uses header key and JSON output configuration', async () => {
  const result = await callLLM({ provider: 'gemini', apiKey: 'mock', system: 'S', user: 'U', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    assert.equal(init.headers['x-goog-api-key'], 'mock'); assert.ok(!url.includes('mock'));
    assert.deepEqual(JSON.parse(init.body), { systemInstruction: { parts: [{ text: 'S' }] }, contents: [{ role: 'user', parts: [{ text: 'U' }] }], generationConfig: { responseMimeType: 'application/json' } });
    return response({ candidates: [{ content: { parts: [{ text: 'one' }, { text: 'two' }] } }] });
  } }); assert.equal(result, 'one\ntwo');
});
test('provider errors include HTTP status and message without leaking raw or encoded API keys', async () => {
  const key = 'mock/key+secret';
  for (const provider of ['openai', 'anthropic', 'gemini']) {
    await assert.rejects(() => callLLM({ provider, apiKey: key, fetchImpl: async () => response({ error: { message: `Denied ${key} ${encodeURIComponent(key)}` } }, 401) }), error => /HTTP 401.*Denied/.test(error.message) && !error.message.includes(key) && !error.message.includes(encodeURIComponent(key)));
  }
  await assert.rejects(() => callLLM({ apiKey: key, fetchImpl: async () => { throw new Error(`Network ${key}`); } }), error => /Network/.test(error.message) && !error.message.includes(key));
  await assert.rejects(() => callLLM({ apiKey: 'mock', fetchImpl: async () => new Response('Service unavailable', { status: 503 }) }), /503.*Service unavailable/);
  await assert.rejects(() => callLLM({ apiKey: 'mock', fetchImpl: async () => response({}) }), /no text/);
  await assert.rejects(() => callLLM({ provider: 'unknown', apiKey: 'mock' }), /Unknown provider/);
  await assert.rejects(() => callLLM({}), /API key is required/);
});
test('generateBundle overwrites model margin with deterministic computation', async () => {
  const bundle = await generateBundle(SAMPLE_PRODUCT, { apiKey: 'mock', fetchImpl: async () => response({ choices: [{ message: { content: JSON.stringify({ ...DEMO_BUNDLE, margin: { unitProfit: 999 } }) } }] }) });
  assert.equal(bundle.margin.unitProfit, 10000); assert.equal(bundle.sample, undefined);
});
test('Markdown export includes all sections, details, warnings and sample identity', () => {
  const md = bundleToMarkdown(DEMO_BUNDLE, SAMPLE_PRODUCT);
  for (const section of ['Product detail page', 'FAQ', 'Ad copy', 'Headlines', 'Primary text', 'Hashtags / keywords', 'Shorts script', 'Hook:', 'Voiceover:', 'Caption:', 'Call to action:', 'Thumbnail text', 'Listing check', 'Margin snapshot', 'Break-even ROAS', 'Sample output']) assert.ok(md.includes(section), section);
  for (const section of [DEMO_BUNDLE.pdp.headline, DEMO_BUNDLE.shorts.scenes[4].voiceover, DEMO_BUNDLE.listingCheck[0].fix]) assert.ok(md.includes(section));
  assert.match(bundleToMarkdown({ ...DEMO_BUNDLE, margin: null }), /Add selling price and cost/);
  assert.match(bundleToMarkdown({ ...DEMO_BUNDLE, margin: computeMargin({ price: 10, cost: 12 }) }), /below 15%/);
});
test('sample files match exported demo and meet requested content counts', async () => {
  assert.deepEqual(JSON.parse(await readFile(new URL('../examples/sample-product.json', import.meta.url))), SAMPLE_PRODUCT);
  assert.deepEqual(JSON.parse(await readFile(new URL('../examples/sample-bundle.json', import.meta.url))), DEMO_BUNDLE);
  assert.equal(DEMO_BUNDLE.pdp.bullets.length, 5); assert.ok(DEMO_BUNDLE.pdp.description.length >= 3); assert.ok(DEMO_BUNDLE.pdp.faq.length >= 3);
  assert.ok(DEMO_BUNDLE.ads.headlines.length >= 3); assert.ok(DEMO_BUNDLE.ads.bodies.length >= 2); assert.equal(DEMO_BUNDLE.ads.keywords.length, 3);
  assert.ok(DEMO_BUNDLE.thumbnails.every(v => [...v.text].length <= 12)); assert.ok(DEMO_BUNDLE.listingCheck.length >= 3);
  let end = 0;
  for (const scene of DEMO_BUNDLE.shorts.scenes) { const [, from, to] = scene.time.match(/(\d+)-(\d+)s/); assert.equal(Number(from), end); end = Number(to); }
  assert.ok(end >= 30 && end <= 45);
});
