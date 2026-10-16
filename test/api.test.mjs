import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHandler, MAX_BYTES, RATE_LIMIT } from '../api/fact-guard.js';
import { NEMOTRON_MODELS } from '../src/fact-guard.js';

const product = { product_name: 'Test Cup', product_info: 'Capacity: 500 ml.', language: 'English' };
const fakeKey = 'TEST_ONLY_SERVER_PLACEHOLDER';

async function invoke(handler, { method = 'POST', body = product, headers = { 'content-type': 'application/json' }, ip = '192.0.2.1', chunks } = {}) {
  const req = Object.assign(Readable.from(chunks || []), { method, headers, socket: { remoteAddress: ip } });
  if (!chunks) req.body = body;
  const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  await handler(req, res);
  return res;
}

test('status automatically reports demo/live mode without revealing credentials', async () => {
  for (const env of [{}, { NEBIUS_API_KEY: fakeKey }, { LLM_API_KEY: fakeKey }]) {
    const result = await invoke(createHandler({ env, run: () => { throw new Error('GET must not run models.'); } }), { method: 'GET' });
    assert.equal(result.statusCode, 200); assert.equal(result.body.mode, Object.keys(env).length ? 'live' : 'demo');
    assert.deepEqual(result.body.models, { draft: NEMOTRON_MODELS.lightning, verify: NEMOTRON_MODELS.super });
    assert.equal(result.headers['cache-control'], 'no-store'); assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.ok(!JSON.stringify(result.body).includes(fakeKey));
  }
});

test('server uses environment routing and ignores all client credentials, models and budgets', async () => {
  let captured;
  const handler = createHandler({ env: { NEBIUS_API_KEY: fakeKey, LLM_BASE_URL: 'https://example.invalid/v1/',
    NEBIUS_DRAFT_MODEL: 'server-draft', NEBIUS_VERIFY_MODEL: 'server-verify' },
    run: async (input, options) => { captured = { input, options }; return { factGuard: { mode: options.apiKey ? 'live' : 'demo' } }; } });
  const result = await invoke(handler, { body: { ...product, apiKey: 'CLIENT_IGNORED', baseUrl: 'https://attacker.invalid/',
    provider: 'other', draftModel: 'client-model', verifyModel: 'client-model', maxRounds: 900, demo: true, unexpected: 'value' } });
  assert.equal(result.statusCode, 200); assert.deepEqual(captured.input, product);
  const { onProgress, signal, ...routing } = captured.options;
  assert.equal(typeof onProgress, 'function'); assert.ok(signal instanceof AbortSignal);
  assert.deepEqual(routing, { apiKey: fakeKey, provider: 'nebius', baseUrl: 'https://example.invalid/v1/',
    draftModel: 'server-draft', verifyModel: 'server-verify', deadlineMs: 280000, maxRounds: 1, maxCalls: 6 });
  assert.equal(result.body.factGuard.mode, 'live'); assert.ok(!JSON.stringify(result.body).includes(fakeKey));
});

test('method and media type errors reject before executing pipeline', async () => {
  let calls = 0;
  const handler = createHandler({ env: {}, run: async () => { calls++; return {}; } });
  const method = await invoke(handler, { method: 'DELETE' });
  assert.equal(method.statusCode, 405); assert.equal(method.headers.allow, 'GET, POST');
  for (const type of ['', 'text/plain', 'application/x-www-form-urlencoded', 'application/jsonp', 'application/json-evil']) {
    assert.equal((await invoke(handler, { headers: { 'content-type': type } })).statusCode, 415);
  }
  assert.equal(calls, 0);
  assert.equal((await invoke(createHandler({ env: {}, run: async () => ({ ok: true }) }), { headers: { 'content-type': 'application/json; charset=utf-8' } })).statusCode, 200);
});

test('invalid JSON and non-object JSON payloads return 400 without calling models', async () => {
  for (const body of ['{invalid', 'null', 'true', '[]', null, [], 42]) {
    let called = false;
    const result = await invoke(createHandler({ env: {}, run: async () => { called = true; return {}; } }), { body });
    assert.equal(result.statusCode, 400, String(body)); assert.equal(called, false);
  }
});

test('body cap applies to declared, raw, buffered, parsed and streamed UTF-8 input', async () => {
  const huge = '가'.repeat(MAX_BYTES);
  const cases = [{ headers: { 'content-type': 'application/json', 'content-length': String(MAX_BYTES + 1) } },
    { body: JSON.stringify({ ...product, product_info: huge }) }, { body: Buffer.from(huge) },
    { body: { ...product, product_info: huge } }, { chunks: [Buffer.from('{"x":"'), Buffer.from(huge), Buffer.from('"}')] }];
  for (const request of cases) {
    const result = await invoke(createHandler({ env: {}, run: () => { throw new Error('Oversized request must not run models.'); } }), request);
    assert.equal(result.statusCode, 413);
  }
  const streamed = await invoke(createHandler({ env: {}, run: async input => input }), { chunks: [JSON.stringify(product).slice(0, 10), JSON.stringify(product).slice(10)] });
  assert.equal(streamed.statusCode, 200); assert.deepEqual(streamed.body, product);
});

test('streamed request preserves UTF-8 characters split across network chunks', async () => {
  const localized = { ...product, product_name: '컵', product_info: '재질: 스틸.' };
  const bytes = Buffer.from(JSON.stringify(localized)), offset = bytes.indexOf(Buffer.from('컵'));
  const result = await invoke(createHandler({ env: {}, run: async input => input }), {
    chunks: [bytes.subarray(0, offset + 1), bytes.subarray(offset + 1, offset + 2), bytes.subarray(offset + 2)],
  });
  assert.equal(result.statusCode, 200); assert.deepEqual(result.body, localized);
});

test('product field size and type limits are enforced', async () => {
  const bad = [{ product_name: 'x'.repeat(161) }, { product_info: 'x'.repeat(8001) },
    { product_name: 42 }, { product_info: {} }, { forbidden_claims: 'x'.repeat(1201) },
    { target_customer: [] }, { channel: 'x'.repeat(1201) }];
  for (const change of bad) {
    const result = await invoke(createHandler({ env: {}, run: () => { throw new Error('Invalid request must not run.'); } }), { body: { ...product, ...change } });
    assert.equal(result.statusCode, 400);
  }
});

test('five requests per trusted IP are allowed, other IPs remain independent, and window resets', async () => {
  let now = 1000, calls = 0;
  const handler = createHandler({ env: {}, now: () => now, run: async () => { calls++; return { ok: true }; } });
  const headers = { 'content-type': 'application/json', 'x-real-ip': '192.0.2.11', 'x-forwarded-for': '203.0.113.1' };
  for (let i = 0; i < RATE_LIMIT; i++) assert.equal((await invoke(handler, { headers })).statusCode, 200);
  const limited = await invoke(handler, { headers: { ...headers, 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(limited.statusCode, 429); assert.equal(limited.headers['retry-after'], '600');
  assert.equal(calls, RATE_LIMIT);
  assert.equal((await invoke(handler, { headers: { ...headers, 'x-real-ip': '192.0.2.12' } })).statusCode, 200);
  now += 600000;
  assert.equal((await invoke(handler, { headers })).statusCode, 200);
  assert.equal(calls, RATE_LIMIT + 2);
});

test('server distinguishes input validation from live upstream failure and suppresses private error data', async () => {
  const privateError = new Error(`Provider rejected ${fakeKey} and private seller facts`);
  const upstream = await invoke(createHandler({ env: { NEBIUS_API_KEY: fakeKey }, run: async (_input, options) => { options.onProgress({ state: 'complete', usage: { total_tokens: 123 } }); throw privateError; } }));
  assert.equal(upstream.statusCode, 200);
  assert.equal(upstream.body.factGuard.mode, 'demo');
  assert.match(upstream.body.factGuard.notice, /LIVE REQUEST FAILED.*offline deterministic fixtures/);
  assert.equal(upstream.body.factGuard.fallback.reportedTokensBeforeFailure, 123);
  assert.ok(upstream.body.factGuard.steps.every(s => s.usageEstimated));
  assert.ok(!JSON.stringify(upstream.body).includes(fakeKey)); assert.doesNotMatch(JSON.stringify(upstream.body), /private seller facts/);
  const validationError = Object.assign(new Error('product_info is required.'), { errors: ['product_info is required.'] });
  const validation = await invoke(createHandler({ env: {}, run: async () => { throw validationError; } }));
  assert.equal(validation.statusCode, 400); assert.equal(validation.body.error, validationError.message);
  const factLimit = await invoke(createHandler({ env: {}, run: async () => { throw new Error('Fact Guard accepts up to 64 source facts.'); } }));
  assert.equal(factLimit.statusCode, 400);
});

test('hosted copy model override leaves the tournament draft routing independent', async () => {
  const env = { NEBIUS_API_KEY: 'TEST_ONLY', NEBIUS_DRAFT_MODEL: 'tournament-writer', NEBIUS_COPY_MODEL: 'copy-writer' };
  const copy = await invoke(createHandler({ env }), { method: 'GET' });
  const tournament = await invoke(createHandler({ env, tournament: true }), { method: 'GET' });
  assert.equal(copy.body.models.draft, 'copy-writer');
  assert.equal(tournament.body.models.draft, 'tournament-writer');
});

test('public copy requests can lower but cannot raise the model-call ceiling', async () => {
  let captured;
  const handler = createHandler({ env: {}, run: async (_input, options) => { captured = options; return {}; } });
  const request = { method: 'POST', headers: { 'content-type': 'application/json', 'x-cce-max-calls': '2' }, body: { product_name: 'Cup', product_info: 'Steel.' } };
  assert.equal((await invoke(handler, request)).statusCode, 200);
  assert.equal(captured.maxCalls, 2);
  request.headers['x-cce-max-calls'] = '7';
  assert.equal((await invoke(handler, request)).statusCode, 400);
});
