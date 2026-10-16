import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, callLLM, bundleToMarkdown } from '../src/core.js';
import { runFactGuard, parseClaimTrace, scoreClaims, sourceFacts, bundleFields, NEMOTRON_MODELS, FACT_GUARD_SAMPLE, claimTraceSchema } from '../src/fact-guard.js';

const input = { product_name: 'Test Cup', product_info: 'Capacity: 500 ml.\nMaterial: steel.', language: 'English' };
const fakeKey = 'TEST_ONLY_NEBIUS_PLACEHOLDER';
const usage = { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 };
const response = (content, model, extra = {}) => ({ ok: true, status: 200,
  text: async () => JSON.stringify({ model, choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }], usage, ...extra }) });

function content(headline = 'Test Cup') {
  return {
    pdp: { headline, subheadline: 'Capacity: 500 ml.', bullets: Array(5).fill('Material: steel.'), description: Array(3).fill('Capacity: 500 ml.'),
      faq: Array.from({ length: 3 }, () => ({ question: 'What is the material?', answer: 'Material: steel.' })) },
    ads: { headlines: Array(3).fill('Test Cup'), bodies: Array(2).fill('Material: steel.'), keywords: ['#Cup', '#Steel', '#500ml'] },
    shorts: { hook: 'Test Cup', scenes: ['0-3s', '3-12s', '12-23s', '23-35s'].map(time => ({ time, visual: 'Show the cup.', voiceover: 'Material: steel.', caption: 'Test Cup' })), cta: 'Test Cup' },
    thumbnails: Array.from({ length: 3 }, () => ({ text: 'Test Cup', angle: 'Show the cup.' })),
    listingCheck: ['high', 'medium', 'low'].map(priority => ({ priority, issue: 'Confirm listing details.', fix: 'Review the supplied facts.' })),
  };
}

function reviewer(fields, facts, risky = false) {
  return { claims: fields.map(field => ({ ...field, factual: facts.some(f => f.text === field.claim) || (risky && field.path === 'pdp.headline'),
    status: risky && field.path === 'pdp.headline' ? 'risky' : 'supported',
    sources: facts.filter(f => f.text === field.claim).map(f => ({ id: f.id, quote: f.text })),
    reason: risky && field.path === 'pdp.headline' ? 'No evidence for this guarantee.' : 'Exact seller fact.',
  })) };
}

test('Nebius provider uses official default endpoint, exact model and detailed usage', async () => {
  assert.equal(PROVIDERS.nebius.baseUrl, 'https://api.tokenfactory.nebius.com/v1/');
  assert.equal(PROVIDERS.nebius.model, NEMOTRON_MODELS.lightning);
  let captured;
  const result = await callLLM({ provider: 'nebius', apiKey: fakeKey, system: 'System', user: 'Product', detailed: true,
    maxTokens: 1234, fetchImpl: async (url, request) => { captured = { url, request }; return response({ ok: true }, NEMOTRON_MODELS.lightning); } });
  assert.equal(captured.url, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
  assert.equal(captured.request.headers.Authorization, `Bearer ${fakeKey}`);
  assert.equal(captured.request.redirect, 'error');
  assert.deepEqual(JSON.parse(captured.request.body), { model: NEMOTRON_MODELS.lightning,
    messages: [{ role: 'system', content: 'System' }, { role: 'user', content: 'Product' }], max_tokens: 1234, temperature: 0.6,
    response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false } });
  assert.deepEqual(result, { text: '{"ok":true}', model: NEMOTRON_MODELS.lightning, usage });
});

test('provider rejects reasoning-only and truncated responses, and accepts text content parts', async () => {
  const call = choice => callLLM({ provider: 'nebius', apiKey: fakeKey,
    fetchImpl: async () => response({}, NEMOTRON_MODELS.lightning, { choices: [choice] }) });
  for (const field of ['reasoning', 'reasoning_content']) {
    await assert.rejects(call({ message: { content: null, [field]: '{"ok":true}' }, finish_reason: 'stop' }), /returned no text/);
  }
  await assert.rejects(call({ message: { content: '{"ok":' }, finish_reason: 'length' }), /truncated/);
  assert.equal(await call({ message: { content: [
    { type: 'text', text: '{"ok":' }, { type: 'image_url', image_url: 'ignored' }, { type: 'text', text: 'true}' },
  ] }, finish_reason: 'stop' }), '{"ok":\ntrue}');
});

test('provider timeout covers response reading and caller cancellation reaches fetch', async () => {
  const waitForAbort = signal => new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  let timeoutSignal;
  await assert.rejects(callLLM({ provider: 'nebius', apiKey: fakeKey, timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => {
      timeoutSignal = signal;
      return { ok: true, text: () => waitForAbort(signal) };
    } }), /timed out or was cancelled/);
  assert.equal(timeoutSignal.aborted, true);
  const controller = new AbortController();
  let fetchSignal;
  const pending = callLLM({ provider: 'nebius', apiKey: fakeKey, signal: controller.signal,
    fetchImpl: (_url, { signal }) => { fetchSignal = signal; return waitForAbort(signal); } });
  controller.abort();
  await assert.rejects(pending, /timed out or was cancelled/);
  assert.equal(fetchSignal.aborted, true);
});

test('live pipeline drafts, verifies, revises and verifies with efficient model routing', async () => {
  const calls = [], progress = [];
  const result = await runFactGuard(input, { apiKey: fakeKey, onProgress: event => progress.push(event),
    fetchImpl: async (url, request) => {
      const body = JSON.parse(request.body); calls.push(body);
      const payload = JSON.parse(body.messages[1].content);
      if (body.model === NEMOTRON_MODELS.super) return response(reviewer(payload.fields, payload.facts, calls.length === 2), body.model);
      return response(content(calls.length === 1 ? 'Capacity: 600 ml.' : 'Test Cup'), body.model);
    } });
  const guard = result.factGuard;
  assert.deepEqual(calls.map(c => c.model), [NEMOTRON_MODELS.lightning, NEMOTRON_MODELS.super, NEMOTRON_MODELS.lightning, NEMOTRON_MODELS.super]);
  assert.deepEqual(guard.steps.map(s => [s.step, s.round]), [['draft', 0], ['verify', 0], ['revise', 1], ['verify', 1]]);
  const revision = JSON.parse(calls[2].messages[1].content);
  assert.equal(revision.review.length, 1);
  assert.equal(revision.review[0].status, 'risky');
  assert.deepEqual(revision.facts, sourceFacts(input));
  assert.equal(guard.before.pdp.headline, 'Capacity: 600 ml.');
  assert.deepEqual(guard.changes, [{ path: 'pdp.headline', before: 'Capacity: 600 ml.', after: 'Test Cup' }]);
  assert.equal(guard.mode, 'live'); assert.equal(guard.trustScore, 100); assert.equal(guard.needsReview, false);
  assert.equal(guard.history.length, 2); assert.equal(guard.totals.totalTokens, 500); assert.equal(guard.totals.usageComplete, true);
  assert.equal(progress.length, 8);
  for (const step of guard.steps) { assert.equal(step.usageEstimated, false); assert.ok(step.latencyMs >= 0); assert.deepEqual(step.usage, usage); }
});

test('pipeline clamps requested revisions to two and leaves unresolved claims visible', async () => {
  let calls = 0;
  const result = await runFactGuard(input, { apiKey: fakeKey, maxRounds: 99, fetchImpl: async (_url, request) => {
    calls++;
    const body = JSON.parse(request.body), payload = JSON.parse(body.messages[1].content);
    return response(body.model === NEMOTRON_MODELS.super ? reviewer(payload.fields, payload.facts, true) : content(), body.model);
  } });
  assert.equal(calls, 6);
  assert.deepEqual(result.factGuard.steps.map(s => s.step), ['draft', 'verify', 'revise', 'verify', 'revise', 'verify']);
  assert.deepEqual(result.factGuard.history.map(r => r.round), [0, 1, 2]);
  assert.equal(result.factGuard.needsReview, true); assert.ok(result.factGuard.trustScore < 100);
});

test('supported first draft stops early; missing provider usage is reported honestly', async () => {
  let calls = 0;
  const result = await runFactGuard(input, { apiKey: fakeKey, fetchImpl: async (_url, request) => {
    calls++;
    const body = JSON.parse(request.body), payload = JSON.parse(body.messages[1].content);
    return response(body.model === NEMOTRON_MODELS.super ? reviewer(payload.fields, payload.facts) : content(), body.model, { usage: null });
  } });
  assert.equal(calls, 2); assert.equal(result.factGuard.needsReview, false);
  assert.equal(result.factGuard.totals.usageComplete, false); assert.equal(result.factGuard.totals.totalTokens, 0);
  assert.deepEqual(result.factGuard.changes, []);
});

test('live provider errors and malformed verification reject without demo fallback', async () => {
  for (const failure of ['upstream', 'invalid-verifier']) {
    let calls = 0;
    await assert.rejects(runFactGuard(input, { apiKey: fakeKey, fetchImpl: async (_url, request) => {
      calls++;
      const body = JSON.parse(request.body);
      if (failure === 'upstream') return { ok: false, status: 401, text: async () => JSON.stringify({ error: { message: `Rejected ${fakeKey}` } }) };
      return response(body.model === NEMOTRON_MODELS.super ? { invalid: [] } : content(), body.model);
    } }), error => {
      assert.doesNotMatch(error.message, new RegExp(fakeKey));
      assert.match(error.message, failure === 'upstream' ? /401/ : /claims array/);
      return true;
    });
    assert.equal(calls, failure === 'upstream' ? 1 : 2);
  }
});

test('trace parsing fails closed for missing, duplicate, mismatched and invalid source reviews', () => {
  const facts = [{ id: 'F1', text: 'Capacity: 500 ml.' }];
  const field = { path: 'pdp.headline', claim: 'Capacity: 500 ml.' };
  const good = { ...field, factual: true, status: 'supported', sources: [{ id: 'F1', quote: '500 ml' }], reason: 'Seller supplied the capacity.' };
  const cases = [[], [good, good], [good, good, good], [{ ...good, claim: 'Different copy' }],
    [{ ...good, status: 'certain' }], [{ ...good, reason: '' }], [{ ...good, sources: [] }],
    [{ ...good, sources: [{ id: 'F999', quote: '500 ml' }] }],
    [{ ...good, sources: [{ id: 'F1', quote: '5,000 ml' }] }],
    [{ ...good, sources: [...good.sources, { id: 'F2', quote: 'invented' }] }]];
  for (const claims of cases) {
    const parsed = parseClaimTrace(JSON.stringify({ claims }), facts, [field]);
    assert.equal(parsed[0].status, 'unsupported', JSON.stringify(claims));
    assert.equal(parsed[0].factual, true); assert.deepEqual(parsed[0].sources, []);
    assert.deepEqual(scoreClaims(parsed), { trustScore: 0, needsReview: true });
  }
  const valid = parseClaimTrace('```json\n' + JSON.stringify({ claims: [good] }) + '\n```', facts, [field]);
  assert.equal(valid[0].status, 'supported'); assert.deepEqual(valid[0].sources, good.sources);
});

test('placeholder and zero factual claims cannot earn a reassuring trust score', () => {
  for (const claim of ['[needs info]', '[확인 필요]']) {
    const field = { path: 'pdp.headline', claim };
    const parsed = parseClaimTrace(JSON.stringify({ claims: [{ ...field, factual: false, status: 'supported', sources: [], reason: 'Creative copy.' }] }), [], [field]);
    assert.equal(parsed[0].status, 'unsupported'); assert.equal(parsed[0].factual, true);
  }
  assert.deepEqual(scoreClaims([]), { trustScore: 0, needsReview: true });
  assert.deepEqual(scoreClaims([{ factual: false, status: 'supported' }]), { trustScore: 0, needsReview: true });
  assert.deepEqual(scoreClaims([{ factual: true, status: 'supported' }, { factual: true, status: 'risky' }, { factual: false, status: 'supported' }]), { trustScore: 50, needsReview: true });
});

test('offline demo is clearly labeled and Markdown preserves trace plus routing evidence', async () => {
  const bundle = await runFactGuard(FACT_GUARD_SAMPLE, { fetchImpl: () => { throw new Error('Offline fixture must not use network.'); } });
  assert.equal(bundle.factGuard.mode, 'demo'); assert.match(bundle.factGuard.notice, /No model was called/);
  assert.ok(bundle.factGuard.steps.every(s => s.usageEstimated));
  assert.equal(bundle.factGuard.before.pdp.subheadline, 'Guaranteed to cure fatigue in 24 hours.');
  assert.equal(bundle.pdp.subheadline, 'Capacity: 500 ml.');
  assert.equal(bundle.factGuard.history[0].claims.find(c => c.path === 'pdp.subheadline').status, 'risky');
  assert.equal(bundle.factGuard.trustScore, 100);
  const markdown = bundleToMarkdown(bundle, FACT_GUARD_SAMPLE);
  assert.match(markdown, /Mode: demo/); assert.match(markdown, /\| Claim \| Status \| Source fact \|/);
  assert.match(markdown, /F1: Capacity: 500 ml\./); assert.match(markdown, /fixture estimate; no inference/);
  assert.ok(markdown.includes(NEMOTRON_MODELS.lightning)); assert.ok(markdown.includes(NEMOTRON_MODELS.super));
  const escaped = structuredClone(bundle);
  escaped.factGuard.claims = [{ factual: true, claim: 'A | B\nC', status: 'supported', sources: [{ id: 'F1', quote: 'A | B\nC' }] }];
  assert.ok(bundleToMarkdown(escaped).includes('A \\| B C'));
});

test('source fact limit rejects oversized fact lists before model access', async () => {
  await assert.rejects(runFactGuard({ ...input, product_info: Array.from({ length: 65 }, (_, i) => `Fact ${i}`).join('\n') }, { apiKey: fakeKey,
    fetchImpl: () => { throw new Error('Must validate before network.'); } }), /up to 64 source facts/);
});

test('Fact Guard repairs an incomplete draft once before auditing and counts both live calls', async () => {
  const calls = [];
  const result = await runFactGuard(input, { apiKey: fakeKey, maxRounds: 0, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body), payload = JSON.parse(body.messages[1].content); calls.push(body);
    if (calls.length === 1) return response({ pdp: content().pdp }, body.model);
    return response(payload.fields ? reviewer(payload.fields, payload.facts) : content(), body.model);
  } });
  assert.deepEqual(calls.map(c => c.model), [NEMOTRON_MODELS.lightning, NEMOTRON_MODELS.super, NEMOTRON_MODELS.super]);
  assert.equal(result.ads.headlines.length, 3); assert.equal(result.pdp.faq.length, 3);
  assert.deepEqual(result.factGuard.steps.map(s => s.step), ['draft', 'draft', 'verify']);
  assert.equal(result.factGuard.totals.totalTokens, 375);
  assert.equal(result.factGuard.needsReview, false);
  assert.equal(calls[0].response_format.type, 'json_schema');
});

test('Fact Guard rejects repeated incomplete drafts instead of manufacturing placeholders', async () => {
  let calls = 0;
  await assert.rejects(runFactGuard(input, { apiKey: fakeKey, fetchImpl: async () => {
    calls++; return response({ pdp: content().pdp }, NEMOTRON_MODELS.lightning);
  } }), /Invalid content bundle at ads/);
  assert.equal(calls, 2);
});

test('live Fact Guard repairs caveat leakage before auditing and preserves exact accepted model JSON', async () => {
  let drafts = 0;
  const raw = JSON.stringify(content(), null, 2);
  const result = await runFactGuard(input, { apiKey: fakeKey, maxRounds: 0, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body), payload = JSON.parse(body.messages[1].content);
    if (payload.fields) return response(reviewer(payload.fields, payload.facts), body.model);
    drafts++;
    if (drafts === 1) {
      const b = content(); b.pdp.faq[0] = { question: 'Is it leakproof?', answer: 'Leak resistance is not confirmed.' };
      return response(b, body.model);
    }
    assert.match(body.messages[0].content, /unknown-attribute leakage/);
    return { ok: true, text: async () => JSON.stringify({ model: body.model, choices: [{ message: { content: raw }, finish_reason: 'stop' }], usage }) };
  } });
  assert.equal(drafts, 2);
  assert.equal(result.factGuard.rawOutput.text, raw);
  assert.equal(result.factGuard.rawOutput.model, NEMOTRON_MODELS.super);
  assert.deepEqual(result.pdp, JSON.parse(raw).pdp);
  assert.deepEqual(result.factGuard.steps.map(s => s.step), ['draft', 'draft', 'verify']);
});

test('repeated headline rubric failures stop after one repair and never reach the verifier', async () => {
  let calls = 0;
  await assert.rejects(runFactGuard(input, { apiKey: fakeKey, fetchImpl: async (_url, init) => {
    calls++; return response(content('a'.repeat(41)), JSON.parse(init.body).model);
  } }), /headline length/);
  assert.equal(calls, 2);
});

test('verifier schema requires one explained review per field before semantic citation checks', () => {
  const fields = [{ path: 'pdp.headline', claim: 'Your desk companion' }];
  const schema = claimTraceSchema(fields, [{ id: 'F0', text: 'Cup' }]);
  const claims = schema.properties.claims;
  assert.equal(claims.minItems, 1); assert.equal(claims.maxItems, 1);
  assert.equal(claims.items.properties.reason.minLength, 1);
  assert.deepEqual(claims.items.properties.path.enum, ['pdp.headline']);
  assert.ok(claims.items.required.includes('sources'));
});
