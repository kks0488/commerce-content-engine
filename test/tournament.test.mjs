import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { runTournament, parseVariant, variantFields, estimateCost, mapLimit } from '../src/tournament.js';
import { NEMOTRON_MODELS } from '../src/fact-guard.js';
import * as tournamentApi from '../api/tournament.js';

const product = { product_name: 'Test Cup', product_info: 'Capacity: 500 ml.\nMaterial: steel.', language: 'English' };
const fakeKey = 'TEST_ONLY_TOURNAMENT_PLACEHOLDER';
const usage = { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 };
const models = { draftModel: 'mock-draft', verifyModel: 'mock-verify', judgeModel: 'mock-judge' };
const timeline = ['0-3s', '3-10s', '10-15s'];

function draft(variation = 1) {
  return { headline: product.product_name, hook: `Look closer, edit ${variation}.`,
    beats: timeline.map(time => ({ time, visual: 'Show the cup.', voiceover: 'Capacity: 500 ml.', caption: product.product_name })) };
}

function review(payload) {
  return { claims: payload.fields.map(field => {
    const sources = payload.facts.filter(fact => field.claim.includes(fact.text)).map(fact => ({ id: fact.id, quote: fact.text }));
    return { ...field, factual: sources.length > 0, status: 'supported', sources, reason: sources.length ? 'Exact seller fact.' : 'Creative framing without a product assertion.' };
  }) };
}

function mockModels({ mutateDraft, mutateReview, mutateJudge, extra = {}, delay = 0 } = {}) {
  const calls = []; let active = 0, peak = 0;
  return { calls, get peak() { return peak; }, fetchImpl: async (_url, request) => {
    const body = JSON.parse(request.body), payload = JSON.parse(body.messages[1].content);
    calls.push({ ...body, payload }); active++; peak = Math.max(peak, active);
    try {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      let content;
      if (body.model === models.draftModel || body.model === NEMOTRON_MODELS.lightning) content = mutateDraft?.(draft(payload.variation), payload) ?? draft(payload.variation);
      else if (payload.fields) content = mutateReview?.(review(payload), payload) ?? review(payload);
      else content = mutateJudge?.({ winner: payload.candidates[0].id, reason: `Clearer opening for ${payload.persona.name}.` }, payload)
        ?? { winner: payload.candidates[0].id, reason: `Clearer opening for ${payload.persona.name}.` };
      return completion(content, body.model, extra);
    } finally { active--; }
  } };
}

function completion(content, model, extra = {}) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ model,
    choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }], usage, ...extra }) };
}

async function invoke(handler, { method = 'POST', body = product, headers = { 'content-type': 'application/json' }, ip = '192.0.2.1', chunks } = {}) {
  const req = Object.assign(Readable.from(chunks || []), { method, headers, socket: { remoteAddress: ip } });
  if (!chunks) req.body = body;
  const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  await handler(req, res);
  return res;
}

test('offline tournament defaults to sixteen distinct, traced variants without a network call', async () => {
  const events = [];
  const result = await runTournament(product, { fetchImpl: () => { throw new Error('Demo must stay offline.'); }, onProgress: event => events.push(event) });
  assert.equal(result.mode, 'demo');
  assert.equal(result.variants.length, 16);
  assert.equal(new Set(result.variants.map(variant => variant.id)).size, 16);
  assert.ok(result.winner?.eligible);
  assert.match(result.notice, /fixture|offline/i);
  assert.match(result.notice, /no model|no inference/i);
  assert.ok(result.steps.length > 16);
  assert.ok(result.steps.every(step => step.usageEstimated === true));
  assert.ok(events.length > 0);
  assert.ok(result.variants.some(variant => !variant.eligible), 'Demo must demonstrate Fact Guard elimination.');
  for (const variant of result.variants.filter(variant => !variant.eligible)) {
    assert.ok(variant.eliminationReason);
    for (const round of result.rounds) for (const match of round.matches) {
      assert.notEqual(match.left, variant.id);
      assert.notEqual(match.right, variant.id);
      assert.notEqual(match.winner, variant.id);
    }
  }
  assert.ok(result.winner.claims.some(claim => claim.factual && claim.status === 'supported' && claim.sources.length));
});

test('tournament count is bounded and product validation happens before network access', async () => {
  const maximum = await runTournament(product, { count: 32 });
  assert.equal(maximum.variants.length, 32);
  await assert.rejects(runTournament({}, { apiKey: fakeKey, fetchImpl: () => { throw new Error('No network for invalid input.'); } }), /required/i);
  await assert.rejects(runTournament({ ...product, product_info: Array.from({ length: 65 }, (_, index) => `Fact ${index}`).join('\n') }, {
    apiKey: fakeKey, fetchImpl: () => { throw new Error('No network for invalid input.'); },
  }), /64 source facts/i);
  for (const count of [0, 1, 33, 2.5, '16', null, NaN, Infinity]) {
    if (count === null) continue; // Null uses the documented default.
    await assert.rejects(runTournament(product, { count }), /integer from 2 to 32/);
  }
});

test('mocked live models run in parallel within the chosen bound and produce a full bracket', async () => {
  const mock = mockModels({ delay: 2 });
  const result = await runTournament(product, { apiKey: fakeKey, ...models, count: 8, concurrency: 3, fetchImpl: mock.fetchImpl });
  assert.equal(result.mode, 'live'); assert.equal(result.concurrency, 3);
  assert.equal(mock.peak, 3);
  assert.equal(mock.calls.filter(call => call.model === models.draftModel).length, 8);
  assert.equal(mock.calls.filter(call => call.model === models.verifyModel).length, 8);
  assert.equal(mock.calls.filter(call => call.model === models.judgeModel).length, 7);
  assert.deepEqual(result.rounds.map(round => round.matches.length), [4, 2, 1]);
  assert.equal(result.winner.id, 'V01');
  assert.ok(result.steps.every(step => step.usageEstimated === false));
  assert.equal(result.totals.totalTokens, 23 * usage.total_tokens);
  assert.equal(result.totals.usageComplete, true);
  assert.equal(result.totals.costUsd, null, 'Unknown custom model pricing must remain unavailable.');
  assert.ok(new Set(result.rounds.flatMap(round => round.matches.map(match => match.persona))).size >= 3);
  assert.ok(mock.calls.filter(call => call.model === models.judgeModel).every(call => call.payload.candidates.length === 2));
});

test('runtime concurrency clamps to eight and default is six', async () => {
  for (const [requested, expected] of [[undefined, 6], [99, 8], [-1, 1]]) {
    const mock = mockModels({ delay: 1 });
    const result = await runTournament(product, { apiKey: fakeKey, ...models, count: 8, concurrency: requested, fetchImpl: mock.fetchImpl });
    assert.equal(result.concurrency, expected); assert.equal(mock.peak, expected);
  }
});

test('unsafe variants never enter judgments and odd survivors advance by explicit bye', async () => {
  const mock = mockModels({
    mutateDraft: (value, payload) => payload.variation === 2 ? { ...value, hook: 'Guaranteed medical cure.' } : value,
    mutateReview: (value) => ({ claims: value.claims.map(claim => claim.claim === 'Guaranteed medical cure.' ? {
      ...claim, factual: true, status: 'risky', sources: [], reason: 'Unsupported medical guarantee.',
    } : claim) }),
  });
  const result = await runTournament(product, { apiKey: fakeKey, ...models, count: 4, fetchImpl: mock.fetchImpl });
  assert.equal(result.variants[1].eligible, false); assert.match(result.variants[1].eliminationReason, /medical/);
  assert.equal(result.totals.largeJudgeCalls, 2); assert.equal(result.totals.avoidedUnsafeJudgeEntries, 1);
  assert.ok(result.rounds.some(round => round.matches.some(match => match.bye)));
  assert.ok(mock.calls.filter(call => call.model === models.judgeModel).every(call => call.payload.candidates.every(candidate => candidate.id !== 'V02')));
});

test('missing, duplicate, mismatched or forged claim traces eliminate every variant', async () => {
  const mutations = [
    value => ({ claims: value.claims.slice(1) }),
    value => ({ claims: [...value.claims, value.claims[0]] }),
    value => ({ claims: value.claims.map((claim, index) => index === 0 ? { ...claim, claim: 'Different copy.' } : claim) }),
    value => ({ claims: value.claims.map((claim, index) => index === 0 ? { ...claim, sources: [{ id: 'F999', quote: 'Invented' }] } : claim) }),
    value => ({ claims: value.claims.map(claim => ({ ...claim, factual: false, sources: [] })) }),
  ];
  for (const mutateReview of mutations) {
    const mock = mockModels({ mutateReview });
    const result = await runTournament(product, { apiKey: fakeKey, ...models, count: 2, fetchImpl: mock.fetchImpl });
    assert.equal(result.winner, null); assert.equal(result.rounds.length, 0);
    assert.ok(result.variants.every(variant => !variant.eligible));
    assert.equal(mock.calls.filter(call => call.model === models.judgeModel).length, 0);
  }
});

test('custom offline restrictions fail closed instead of claiming unsupported verification', async () => {
  const result = await runTournament({ ...product, forbidden_claims: 'Never mention the capacity.' }, { count: 4 });
  assert.equal(result.winner, null);
  assert.ok(result.variants.every(variant => !variant.eligible && /custom restrictions/i.test(variant.eliminationReason)));
});

test('upstream failures and malformed drafts, verifiers or judgments never use demo fallback', async () => {
  await assert.rejects(runTournament(product, { apiKey: fakeKey, count: 2, fetchImpl: async () => ({ ok: false, status: 401,
    text: async () => JSON.stringify({ error: { message: `Rejected ${fakeKey}` } }) }) }), error => {
    assert.match(error.message, /401/); assert.ok(!error.message.includes(fakeKey)); return true;
  });
  for (const change of [{ mutateDraft: () => ({ headline: 'Incomplete' }) }, { mutateReview: () => ({ invalid: [] }) },
    { mutateJudge: () => ({ winner: 'V999', reason: 'Outside bracket.' }) }, { mutateJudge: () => ({ winner: 'V01', reason: '' }) }]) {
    const mock = mockModels(change);
    await assert.rejects(runTournament(product, { apiKey: fakeKey, ...models, count: 2, fetchImpl: mock.fetchImpl }), /three 15-second beats|claims array|Invalid pairwise judgment/);
  }
});

test('verbose but valid judgment reasons are bounded without discarding a verified winner', async () => {
  const mock = mockModels({ mutateJudge: value => ({ ...value, reason: 'Clearer factual hook. '.repeat(40) }) });
  const result = await runTournament(product, { apiKey: fakeKey, ...models, count: 2, fetchImpl: mock.fetchImpl });
  assert.equal(result.mode, 'live'); assert.ok(result.winner.eligible);
  assert.equal(result.rounds[0].matches[0].reason.length, 600);
});

test('cost estimates use actual per-model usage and explicitly expose missing usage', async () => {
  const mock = mockModels();
  const result = await runTournament(product, { apiKey: fakeKey, count: 4, fetchImpl: mock.fetchImpl });
  const expected = 4 * estimateCost(NEMOTRON_MODELS.lightning, usage) + 7 * estimateCost(NEMOTRON_MODELS.super, usage);
  assert.ok(Math.abs(result.totals.costUsd - expected) < 1e-12);
  assert.ok(result.totals.allLargeCostUsd > result.totals.costUsd);
  assert.ok(result.totals.estimatedSavingsUsd > 0);
  assert.equal(result.stages.reduce((sum, stage) => sum + stage.tokens, 0), result.totals.totalTokens);
  assert.ok(result.stages.every(stage => stage.latencyMs >= 0 && stage.requestMs >= 0));
  const missing = mockModels({ extra: { usage: null } });
  const unmetered = await runTournament(product, { apiKey: fakeKey, count: 2, fetchImpl: missing.fetchImpl });
  assert.equal(unmetered.totals.usageComplete, false); assert.equal(unmetered.totals.costUsd, null);
  assert.equal(unmetered.totals.totalTokens, 0); assert.equal(unmetered.totals.estimatedSavingsUsd, null);
});

test('variant parser enforces exact 15-second beats and reviews all displayed copy', () => {
  const direction = { angle: 'Details', tone: 'friendly', audience: 'Practical buyer' };
  const parsed = parseVariant(JSON.stringify(draft()), 'V01', direction);
  assert.equal(variantFields(parsed).length, 14);
  assert.ok(variantFields(parsed).some(field => field.path === 'beats.2.visual'));
  for (const bad of [{ ...draft(), headline: '' }, { ...draft(), hook: 'x'.repeat(601) },
    { ...draft(), beats: draft().beats.slice(1) }, { ...draft(), beats: draft().beats.map(beat => ({ ...beat, time: '0-15s' })) }]) {
    assert.throws(() => parseVariant(JSON.stringify(bad), 'V01', direction), /Invalid variant text|three 15-second beats|15-second timeline/);
  }
});

test('aborted requests stop before any model is called and pool errors propagate', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runTournament(product, { apiKey: fakeKey, signal: controller.signal,
    fetchImpl: () => { throw new Error('Must not call models.'); } }), /abort/i);
  await assert.rejects(mapLimit([0, 1, 2], 2, async index => { if (index === 1) throw new Error('worker failure'); return index; }), /worker failure/);
});

test('hosted tournament accepts count while ignoring client models, keys, endpoints and concurrency', async () => {
  let captured;
  const handler = tournamentApi.createHandler({ env: { NEBIUS_API_KEY: fakeKey, LLM_BASE_URL: 'https://example.invalid/v1/',
    NEBIUS_DRAFT_MODEL: models.draftModel, NEBIUS_VERIFY_MODEL: models.verifyModel, NEBIUS_JUDGE_MODEL: models.judgeModel },
    run: async (input, options) => { captured = { input, options }; return { mode: 'live' }; } });
  const result = await invoke(handler, { body: { ...product, count: 32, apiKey: 'CLIENT_IGNORED', baseUrl: 'https://attacker.invalid/',
    draftModel: 'client', verifyModel: 'client', judgeModel: 'client', concurrency: 999, deadlineMs: 9999999, demo: true } });
  assert.equal(result.statusCode, 200); assert.deepEqual(captured.input, product);
  assert.equal(captured.options.apiKey, fakeKey); assert.equal(captured.options.baseUrl, 'https://example.invalid/v1/');
  assert.equal(captured.options.count, 32); assert.equal(captured.options.concurrency, 6); assert.equal(captured.options.deadlineMs, 280000);
  for (const [key, value] of Object.entries(models)) assert.equal(captured.options[key], value);
  assert.ok(captured.options.signal instanceof AbortSignal);
  const status = await invoke(handler, { method: 'GET' });
  assert.equal(status.body.maxCount, 32); assert.equal(status.body.maxActive, tournamentApi.MAX_ACTIVE);
  assert.equal(status.body.models.judge, models.judgeModel); assert.ok(!JSON.stringify(status.body).includes(fakeKey));
});

test('hosted count, schema, method, content type and body size reject before models', async () => {
  const handler = () => tournamentApi.createHandler({ env: {}, run: () => { throw new Error('Must reject before models.'); } });
  for (const count of [1, 33, 2.5, '16', null]) assert.equal((await invoke(handler(), { body: { ...product, count } })).statusCode, 400);
  for (const body of ['{broken', 'null', '[]', { ...product, product_info: {} }]) assert.equal((await invoke(handler(), { body })).statusCode, 400);
  assert.equal((await invoke(handler(), { method: 'DELETE' })).statusCode, 405);
  assert.equal((await invoke(handler(), { headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await invoke(handler(), { body: { ...product, product_info: 'x'.repeat(tournamentApi.MAX_BYTES) } })).statusCode, 413);
});

test('hosted requests are limited per IP and reset after the ten-minute window', async () => {
  let now = 1000, calls = 0;
  const handler = tournamentApi.createHandler({ env: {}, now: () => now, run: async () => { calls++; return {}; } });
  for (let index = 0; index < tournamentApi.RATE_LIMIT; index++) assert.equal((await invoke(handler)).statusCode, 200);
  const rejected = await invoke(handler); assert.equal(rejected.statusCode, 429); assert.equal(rejected.headers['retry-after'], '600');
  assert.equal(calls, tournamentApi.RATE_LIMIT);
  assert.equal((await invoke(handler, { ip: '192.0.2.2' })).statusCode, 200);
  now += 600000; assert.equal((await invoke(handler)).statusCode, 200);
});

test('hosted active bound spans IPs, releases after failures and suppresses upstream secrets', async () => {
  const pending = [];
  const handler = tournamentApi.createHandler({ env: { NEBIUS_API_KEY: fakeKey }, run: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
  const first = invoke(handler, { ip: '192.0.2.11' });
  const second = invoke(handler, { ip: '192.0.2.12' });
  assert.equal(pending.length, tournamentApi.MAX_ACTIVE);
  const busy = await invoke(handler, { ip: '192.0.2.13' });
  assert.equal(busy.statusCode, 429); assert.equal(busy.headers['retry-after'], '15');
  pending[0].reject(new Error(`Private seller facts ${fakeKey}`)); pending[1].resolve({ ok: true });
  const [failed, passed] = await Promise.all([first, second]);
  assert.equal(failed.statusCode, 200); assert.match(failed.body.notice, /LIVE REQUEST FAILED/i);
  assert.equal(failed.body.mode, 'demo'); assert.ok(failed.body.steps.every(s => s.usageEstimated));
  assert.doesNotMatch(JSON.stringify(failed.body), /Private seller facts|TEST_ONLY/); assert.equal(passed.statusCode, 200);
  const resumed = invoke(handler, { ip: '192.0.2.14' });
  assert.equal(pending.length, 3); pending[2].resolve({ ok: true }); assert.equal((await resumed).statusCode, 200);
});

test('NDJSON streams real tournament progress and exactly one final result', async () => {
  const handler = tournamentApi.createHandler({ env: {} });
  const req = Object.assign(Readable.from([]), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
    socket: { remoteAddress: '192.0.2.30' }, body: { ...product, count: 4 } });
  const chunks = [], headers = {};
  const res = Object.assign(new EventEmitter(), { setHeader(name, value) { headers[name.toLowerCase()] = value; },
    flushHeaders() {}, write(chunk) { chunks.push(chunk); }, end() { this.writableEnded = true; } });
  await handler(req, res);
  assert.match(headers['content-type'], /application\/x-ndjson/); assert.equal(headers['cache-control'], 'no-store');
  assert.equal(res.writableEnded, true);
  const events = chunks.join('').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events[0].type, 'start');
  assert.equal(events.filter(event => event.type === 'variant').length, 4);
  assert.equal(events.filter(event => event.type === 'verified').length, 4);
  assert.ok(events.some(event => event.type === 'round'));
  assert.equal(events.filter(event => event.type === 'result').length, 1);
  assert.equal(events.at(-1).result.mode, 'demo'); assert.ok(events.at(-1).result.winner?.eligible);
  assert.equal(res.listenerCount('close'), 0);
});

test('streamed product validation returns an error event without a fixture fallback', async () => {
  const handler = tournamentApi.createHandler({ env: { NEBIUS_API_KEY: fakeKey } });
  const chunks = [];
  const res = Object.assign(new EventEmitter(), { setHeader() {}, flushHeaders() {},
    write(chunk) { chunks.push(chunk); }, end() { this.writableEnded = true; } });
  const req = Object.assign(Readable.from([]), { method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
    socket: { remoteAddress: '192.0.2.45' }, body: { ...product, product_name: '' } });
  await handler(req, res);
  const events = chunks.map(line => JSON.parse(line));
  assert.deepEqual(events.map(e => e.type), ['error']);
  assert.match(events[0].error, /Invalid product input/);
  assert.equal(res.writableEnded, true); assert.equal(res.listenerCount('close'), 0);
});

test('streaming live failure restarts explicit demo fixtures and preserves reported live token lower bound', async () => {
  const handler = tournamentApi.createHandler({ env: { NEBIUS_API_KEY: fakeKey }, run: async (_input, options) => {
    options.onProgress({ type: 'start', mode: 'live', count: 4 });
    options.onProgress({ type: 'step', stage: 'generate', id: 'V01', state: 'complete', usage });
    options.onProgress({ type: 'step', stage: 'generate', id: 'V02', state: 'complete', usage });
    options.onProgress({ type: 'step', stage: 'generate', id: 'V03', state: 'running' });
    throw new Error(`Private upstream seller facts ${fakeKey}`);
  } });
  const req = Object.assign(Readable.from([]), { method: 'POST', body: { ...product, count: 4 },
    headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }, socket: { remoteAddress: '192.0.2.32' } });
  const chunks = [];
  const res = Object.assign(new EventEmitter(), { setHeader() {}, flushHeaders() {}, write(chunk) { chunks.push(chunk); },
    end() { this.writableEnded = true; } });
  await handler(req, res);
  const wire = chunks.join(''), events = wire.trim().split('\n').map(line => JSON.parse(line));
  assert.doesNotMatch(wire, /Private upstream|seller facts|TEST_ONLY/);
  assert.equal(events.filter(event => event.type === 'fallback').length, 1);
  const fallbackIndex = events.findIndex(event => event.type === 'fallback');
  assert.match(events[fallbackIndex].notice, /LIVE REQUEST FAILED.*DEMO/);
  assert.equal(events.slice(fallbackIndex + 1).find(event => event.type === 'start').mode, 'demo');
  assert.equal(events.filter(event => event.type === 'result').length, 1);
  const result = events.at(-1).result;
  assert.equal(result.mode, 'demo'); assert.equal(result.variants.length, 4);
  assert.match(result.notice, /LIVE REQUEST FAILED.*DEMO/);
  assert.deepEqual(result.fallback, { from: 'live', reportedTokensBeforeFailure: 250, usageComplete: false });
  assert.ok(result.steps.every(step => step.usageEstimated));
  assert.equal(res.writableEnded, true); assert.equal(res.listenerCount('close'), 0);
});

test('NDJSON failures stay private and disconnected requests cancel models', async () => {
  let ready, capturedSignal;
  const started = new Promise(resolve => { ready = resolve; });
  const handler = tournamentApi.createHandler({ env: { NEBIUS_API_KEY: fakeKey }, run: async (_input, options) => {
    capturedSignal = options.signal; ready();
    await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error(`Private facts ${fakeKey}`)), { once: true }));
  } });
  const chunks = [];
  const res = Object.assign(new EventEmitter(), { setHeader() {}, flushHeaders() {}, write(chunk) { chunks.push(chunk); },
    end() { this.writableEnded = true; } });
  const req = Object.assign(Readable.from([]), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
    socket: { remoteAddress: '192.0.2.31' }, body: product });
  const running = handler(req, res); await started; res.emit('close'); await running;
  assert.equal(capturedSignal.aborted, true); assert.equal(res.listenerCount('close'), 0);
  const failure = JSON.parse(chunks[0]); assert.equal(failure.type, 'error'); assert.match(failure.error, /stopped before completion/i);
  assert.doesNotMatch(JSON.stringify(failure), /Private facts|TEST_ONLY/);
});
