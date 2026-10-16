import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeInput, buildMessages, parseBundle, computeMargin, extractProductFromHtml, callLLM, generateBundle, bundleToMarkdown, SAMPLE_PRODUCT, DEMO_BUNDLE, withContentRetry, BUNDLE_JSON_SCHEMA, validateCopy } from '../src/core.js';

test('input validation reports readable errors together and preserves zero cost', () => {
  assert.throws(() => normalizeInput({ price: -1, cost: 'oops' }), error => error.errors.length === 4 && /product_name/.test(error.message) && /product_info/.test(error.message));
  const input = normalizeInput({ ...SAMPLE_PRODUCT, cost: 0, language: 'en', feePct: '' });
  assert.equal(input.cost, 0); assert.equal(input.language, 'English'); assert.equal(input.feePct, 0);
  for (const patch of [{ price: 0 }, { feePct: 101 }, { language: 'French' }, { tone: 'fake' }]) assert.throws(() => normalizeInput({ ...SAMPLE_PRODUCT, ...patch }));
});

test('parseBundle handles JSON fences, prose and quoted braces on complete bundles', () => {
  const raw = JSON.stringify({ ...DEMO_BUNDLE, pdp: { ...DEMO_BUNDLE.pdp, headline: 'Hello {world} with "quotes"' } });
  for (const text of [raw, '```json\n' + raw + '\n```', 'Your output:\n' + raw + '\nEnjoy!']) {
    const b = parseBundle(text);
    assert.equal(b.pdp.headline, 'Hello {world} with "quotes"');
    assert.doesNotThrow(() => bundleToMarkdown(b));
  }
});
test('parseBundle rejects partial sections, empty copy, placeholders and broken timelines', () => {
  const copy = () => structuredClone(DEMO_BUNDLE);
  for (const mutate of [b => delete b.ads, b => b.pdp.faq = [], b => b.pdp.bullets.pop(),
    b => b.shorts.scenes = [], b => b.ads.headlines = ['[needs info]'], b => b.pdp.faq[0].answer = '[확인 필요]',
    b => b.shorts.scenes[1].time = '4-12s', b => b.thumbnails[0] = null, b => b.listingCheck[0].priority = 'urgent']) {
    const b = copy(); mutate(b); assert.throws(() => parseBundle(JSON.stringify(b)), /Invalid content bundle/);
  }
  const b = copy(); b.pdp.faq[0].answer = '[확인 필요] 배송비와 반품 가능 기간은 판매자에게 확인해 주세요.';
  assert.doesNotThrow(() => parseBundle(JSON.stringify(b)));
  b.margin = { unitProfit: 999 }; assert.equal(parseBundle(JSON.stringify(b)).margin, null);
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

// Captured from real Nebius Lightning, Korean, finish_reason=stop, reasoning_tokens=0.
// The model nested all siblings under pdp. The old parser silently returned [needs info].
test('recorded real Nemotron response is rejected then repaired once without placeholders', async () => {
  const recorded = {
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": "{\"pdp\": {\"headline\": \"대나무 도마, 주방의 새로운 친구\", \"subheadline\": \"내추럴한 색감과 부드러운 터치로 식탁을 밝게\", \"bullets\": [\"내구성이 뛰어난 대나무 소재로 오랜 사용 가능\", \"모서리가 둥근 디자인으로 안전하게 보관 가능\", \"손세척 후 세워서 건조하면 위생적 관리 가능\", \"30 x 20 x 1.5cm 적당한 크기로 주방 공간 활용도 높음\", \"내추럴 색상이 다양한 주방 인테리어와 잘 어울림\"], \"description\": [\"대나무 도마는 자연스러운 무늬와 따뜻한 느낌을 주는 주방 아이템입니다.\", \"내추럴 색상은 주방의 분위기를 밝고 깨끗하게 연출해 줍니다.\", \"둥근 모서리 디자인은 아이들이 있는 가정에서도 안전하게 사용할 수 있습니다.\", \"적당한 크기로 반찬 준비나 과일 썰기 등 다양한 용도에 적합합니다.\", \"손세척 후 세워서 건조하면 물이 잘 빠져 위생적으로 관리할 수 있습니다.\"], \"faq\": [{\"question\": \"식기세척기에 넣을 수 있나요?\", \"answer\": \"아니요, 식기세척기 사용이 불가합니다. 손세척 후 물기를 제거해 주세요.\"}, {\"question\": \"어떻게 보관해야 하나요?\", \"answer\": \"사용 후 물기를 잘 제거하고 세워서 건조하는 것이 좋습니다.\"}, {\"question\": \"칼자국이 많이 남지 않나요?\", \"answer\": \"대나무 소재는 칼자국이 비교적 적게 남으며, 정기적으로 관리하면 오래 사용하실 수 있습니다.\"}, {\"question\": \"무게는 얼마나 나가나요?\", \"answer\": \"가벼워서 이동하기 편하며, 주방에서 사용하기 부담 없는 무게입니다.\"}, {\"question\": \"색상이 변색되나요?\", \"answer\": \"직사광선을 피하고 그늘에서 보관하면 색상 변형을 최소화할 수 있습니다.\"}], \"ads\": {\"headlines\": [\"친환경 대나무 도마\", \"주방 필수 아이템\", \"내추럴한 주방 인테리어\"], \"bodies\": [\"내추럴한 색감으로 주방을 밝게 만들어보세요.\", \"모서리가 둥라 안전한 대나무 도마, 지금 만나보세요.\"], \"keywords\": [\"대나무 도마\", \"주방용품\", \"내추럴\"]}, \"shorts\": {\"hook\": \"주방의 분위기를 바꿔보세요!\", \"scenes\": [{\"time\": \"0-3s\", \"visual\": \"대나무 도마의 내추럴한 색상과 질감 특근\", \"voiceover\": \"주방에 새로운 친구를 데려오세요!\", \"caption\": \"대나무 도마, 주방의 새로운 친구\"}, {\"time\": \"3-15s\", \"visual\": \"도마 위에 과일과 채소를 썬 모습\", \"voiceover\": \"둥근 모서리로 안전하게, 일상 속 편리함을 더하세요.\", \"caption\": \"안전하고 편리한 주방 타임\"}, {\"time\": \"15-30s\", \"visual\": \"손세척 후 세워서 건조하는 모습\", \"voiceover\": \"손세척 후 세워서 건조하면 위생적 관리 끝!\", \"caption\": \"간편한 관리법 공개\"}], \"cta\": \"지금 바로 만나보세요!\"}, \"thumbnails\": [{\"text\": \"내추럴 도마\", \"angle\": \"정면 정면 촬영\"}, {\"text\": \"둥근 모서리\", \"angle\": \"모서리 클로즈업\"}, {\"text\": \"과일 썰기\", \"angle\": \"도마 위에 과일 올려놓기\"}], \"listingCheck\": [{\"priority\": \"high\", \"issue\": \"가격 정보가 명시되지 않음\", \"fix\": \"상세 페이지에 판매가 18000원 명시\"}, {\"priority\": \"medium\", \"issue\": \"배송 및 반품 조건 누락\", \"fix\": \"배송료, 배송 기간, 반품 가능 여부 안내 추가\"}, {\"priority\": \"low\", \"issue\": \"인증 정보 부재\", \"fix\": \"필요 시 KC 인증 마크 등 표시 권장\"}]}, \"ad_budget_estimate_krw\": 50000, \"ad_budget_period\": \"daily\"}",
        "refusal": null,
        "role": "assistant",
        "annotations": null,
        "audio": null,
        "function_call": null,
        "tool_calls": null,
        "reasoning": null,
        "reasoning_content": null
      },
      "stop_reason": null,
      "token_ids": null
    }
  ],
  "model": "nvidia/Nemotron-3_5-Lightning",
  "object": "chat.completion",
  "moderation": null,
  "service_tier": null,
  "system_fingerprint": null,
  "usage": {
    "completion_tokens": 993,
    "prompt_tokens": 615,
    "total_tokens": 1608,
    "completion_tokens_details": {
      "accepted_prediction_tokens": null,
      "audio_tokens": null,
      "reasoning_tokens": 0,
      "rejected_prediction_tokens": null
    },
    "prompt_tokens_details": null,
    "prompt_cache_hit_tokens": 0,
    "prompt_cache_miss_tokens": 615
  },
  "prompt_logprobs": null,
  "prompt_token_ids": null,
  "kv_transfer_params": null,
  "ec_transfer_params": null
};
  assert.equal(recorded.choices[0].finish_reason, 'stop');
  assert.throws(() => parseBundle(recorded.choices[0].message.content), /Invalid content bundle at ads/);
  let calls = 0;
  const bundle = await generateBundle(SAMPLE_PRODUCT, { provider: 'nebius', apiKey: 'mock', fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); calls++;
    assert.deepEqual(body.response_format.json_schema.schema, BUNDLE_JSON_SCHEMA);
    if (calls === 1) return response(recorded);
    assert.match(body.messages[0].content, /Previous response failed:/);
    assert.equal(body.model, 'nvidia/nemotron-3-super-120b-a12b');
    return response({ choices: [{ message: { content: JSON.stringify(DEMO_BUNDLE) } }] });
  } });
  assert.equal(calls, 2); assert.equal(bundle.ads.headlines.length, 3);
  assert.doesNotMatch(JSON.stringify(bundle), /needs info/);
  let failedCalls = 0;
  await assert.rejects(generateBundle(SAMPLE_PRODUCT, { apiKey: 'mock', fetchImpl: async () => { failedCalls++; return response(recorded); } }), /Invalid/);
  assert.equal(failedCalls, 2);
});
test('compatible Nemotron requests disable thinking and reject truncated or reasoning-only output', async () => {
  for (const [provider, baseUrl] of [['openai', 'https://api.tokenfactory.nebius.com/v1/'], ['nebius', undefined]]) {
    await callLLM({ provider, baseUrl, apiKey: 'mock', model: 'nvidia/Nemotron-3_5-Lightning', fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.max_tokens, 12000); assert.equal(body.chat_template_kwargs.enable_thinking, false);
      assert.equal(body.response_format.type, 'json_object');
      return response({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] });
    } });
  }
  for (const choice of [{ message: { content: '{"pdp":' }, finish_reason: 'length' }, { message: { content: null, reasoning_content: '{}' } }]) {
    await assert.rejects(callLLM({ apiKey: 'mock', fetchImpl: async () => response({ choices: [choice] }) }), /truncated|no text/);
  }
});
test('repair is limited and does not retry auth errors or cancellation', async () => {
  let calls = 0;
  await assert.rejects(withContentRetry(async () => { calls++; throw new Error('nebius HTTP 401: Invalid API key'); }, parseBundle), /401/);
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(withContentRetry(async () => { calls++; }, parseBundle, { signal: controller.signal }));
  assert.equal(calls, 1);
});

test('observed unsupported claims trigger validation', () => {
  assert.throws(() => validateCopy({ ads: { bodies: ['스테인리스라 위생적이고 튼튼해요.'] } }, SAMPLE_PRODUCT), /unsupported benefit/);
});
