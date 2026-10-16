import { PROVIDERS, normalizeInput, generateBundle, bundleToMarkdown, SAMPLE_PRODUCT, DEMO_BUNDLE } from './src/core.js';

import { runFactGuard, NEMOTRON_MODELS, FACT_GUARD_SAMPLE } from './src/fact-guard.js';

// All interface copy lives here; generated product copy keeps its chosen output language.
const UI = {
  en: {
    factGuard: 'Fact Guard', guardEnable: 'Verify every claim before you publish', verifier: 'Verification model',
    guardLocal: 'Use your Nebius key for live inference. Without a key, Fact Guard replays offline fixtures.',
    guardHosted: 'Hosted demo · no personal key needed. Your facts go to this server; live inference uses its server-side key.',
    guardRun: 'Draft + verify with Nemotron ↗', guardDemo: 'Try Fact Guard demo (no key)',
    guardHero: 'Good copy.\nClaims you can trace.', guardIntro: 'Turn seller facts into launch content. Catch invented claims, revise them, and see the evidence behind every line.',
    guardEyebrow: 'FACT-GUARDED COMMERCE · NEMOTRON ON NEBIUS', guardAwait: 'Running draft → verify → revise. The final trace appears when verification finishes.',
    guardScore: 'Trust score', guardScoreNote: 'Share of reviewed factual fields with valid citations. AI assessment of seller-supplied facts; review before publishing.',
    guardSteps: 'Efficient routing', guardTrace: 'Final fact trace', guardDiff: 'Before / after', guardInitial: 'What the verifier caught',
    guardClean: 'All reviewed factual fields have source citations.', guardReview: 'Unresolved claims remain. Seller review required.',
    guardNoResult: 'Enable Fact Guard and run the pipeline to see claim verification, source facts and revisions.',
    guardClaim: 'Claim / content field', guardStatus: 'Status', guardSource: 'Source fact', guardCreative: 'Creative text / instructions (not scored)',

    local: 'Your key. Your content.', eyebrow: 'FROM PRODUCT FACTS TO YOUR NEXT LAUNCH', hero: 'One product.\nA whole lot of possibility.',
    intro: 'Paste the facts. Get a detail page, ads, a video script, and more — in one run.', byok: 'Bring your own API key', noInstall: 'No install. No subscription.',
    inputTitle: 'Your product, in context', connection: 'Connect your AI', provider: 'Provider', model: 'Model', baseUrl: 'Base URL', baseHelp: 'OpenAI, OpenRouter, or your local Ollama /v1 endpoint.',
    apiKey: 'API key', forget: 'Forget key', keyNote: 'Stored only in this browser (localStorage), sent only to the provider you chose. A custom base URL receives your key.',
    facts: 'Start with the facts', name: 'Product name *', info: 'Product information *', nameHint: 'e.g. Moru Daily Tumbler', infoHint: 'Materials, features, dimensions, verified benefits, delivery terms…', pasteHelp: 'Paste facts here. Product URL fetching is available in the CLI.',
    direction: 'Set the direction', language: 'Output language', tone: 'Tone', friendly: 'Friendly', premium: 'Premium', playful: 'Playful', expert: 'Expert', channel: 'Target channel', customer: 'Target customer (optional)', customerHint: 'Who is this for?', forbidden: 'Forbidden claims (optional)', forbiddenHint: 'e.g. medical claims, unverified certifications',
    economics: 'Know your numbers', moneyHelp: 'Optional · use the same currency. Calculated locally, never by AI. Fees default to 0%.', price: 'Selling price', cost: 'Product cost', fee: 'Fee %', shipping: 'Shipping', adCost: 'Ads / unit',
    generate: 'Generate bundle ↗', demo: 'Try demo (no key)', guardrail: 'Grounded in your input. Missing facts are flagged for you to verify.', outputTitle: 'Your content workspace', ready: 'Ready when you are', copyAll: 'Copy all as Markdown', download: 'Download .md',
    emptyTitle: 'Your next launch starts here.', emptyText: 'One product becomes six useful views.\nTry the sample to see it come together.', footer: 'Made for small teams with big ideas.',
    pdp: 'Product page', ads: 'Ads', shorts: 'Shorts script', thumbnails: 'Thumbnails', listingCheck: 'Listing check', margin: 'Margin', copy: 'Copy', copied: 'Copied to clipboard.', copyError: 'Clipboard unavailable. Use Download .md.', forgotten: 'Saved key forgotten for this endpoint.', storageError: 'Browser storage is unavailable. Your key will only be kept for this page session.',
    loading: 'Writing your bundle… This can take a minute.', sample: 'Sample output · Korean fictional product', generated: 'Generated output', done: 'Your bundle is ready. Review claims before publishing.',
    headline: 'The first impression', bullets: 'Five reasons to look closer', description: 'The product story', faq: 'Questions, answered', headlines: 'Ad headlines', bodies: 'Primary text', keywords: 'Hashtags / keywords', hook: 'Hook · first 3 seconds', cta: 'Call to action', visual: 'Visual', voiceover: 'Voiceover', caption: 'Caption', high: 'High', medium: 'Medium', low: 'Low', fix: 'Suggested fix',
    unitProfit: 'Unit profit', marginPct: 'Margin', breakEvenRoas: 'Break-even ROAS', profitBeforeAds: 'Profit before ads', platformFee: 'Platform fee', unavailable: 'Unavailable', noMargin: 'Add selling price and product cost to calculate your margin.', formula: 'Profit = price − cost − fee − shipping − ads. Break-even ROAS = price / profit before ads. Amounts use your input currency.',
    lowMargin: 'Margin is below 15%. Review costs before scaling ads.', noProfit: 'Zero or negative unit profit.', noRoas: 'Break-even ROAS is unavailable when profit before ads is zero or negative.', switchLanguage: '한국어로 전환', tabsLabel: 'Content sections',
  },
  ko: {
    factGuard: '사실 확인', guardEnable: '게시 전에 모든 주장 확인하기', verifier: '검증 모델',
    guardLocal: 'Nebius 키를 입력하면 실제 모델을 사용합니다. 키가 없으면 샘플로 흐름을 보여 드려요.',
    guardHosted: '개인 키 없이 체험하세요. 상품 정보는 서버로 전송되며, 실제 생성에는 서버의 키를 사용합니다.',
    guardRun: '작성하고 사실 확인하기 ↗', guardDemo: '키 없이 사실 확인 체험',
    guardHero: '판매 문구에도,\n확인할 수 있는 근거를.', guardIntro: '상품 정보로 콘텐츠를 만들고, 근거 없는 표현을 고친 뒤 문장마다 출처를 확인하세요.',
    guardEyebrow: '상품 문구 사실 확인 · NEMOTRON ON NEBIUS', guardAwait: '작성 → 검증 → 수정 중이에요. 끝나면 확인 결과를 보여 드립니다.',
    guardScore: '근거 확인 점수', guardScoreNote: '검토한 상품 설명 중 유효한 출처가 있는 비율입니다. 입력 정보에 대한 AI의 판단이므로 게시 전에 확인해 주세요.',
    guardSteps: '단계별 모델 사용', guardTrace: '최종 근거 표', guardDiff: '수정 전 / 후', guardInitial: '처음에 발견한 문제',
    guardClean: '검토한 상품 설명에 모두 출처가 있어요.', guardReview: '확인하지 못한 표현이 남아 있어요. 판매자가 검토해 주세요.',
    guardNoResult: '사실 확인을 켜고 실행하면 근거와 수정 내역을 볼 수 있어요.',
    guardClaim: '문구 / 항목', guardStatus: '판정', guardSource: '입력한 근거', guardCreative: '홍보 표현 / 안내 (점수 제외)',

    local: '내 키로 만드는 내 콘텐츠', eyebrow: '상품 정보에서 판매 콘텐츠까지', hero: '상품 하나로,\n가능성은 더 넓게.', intro: '상품 정보를 붙여 넣으세요. 상세페이지, 광고, 영상 대본까지 한 번에 만듭니다.', byok: '내 API 키로 사용', noInstall: '설치 없이, 구독 없이.',
    inputTitle: '어떤 상품인가요?', connection: 'AI 연결', provider: 'AI 서비스', model: '모델', baseUrl: 'API 주소', baseHelp: 'OpenAI, OpenRouter 또는 로컬 Ollama /v1 주소를 입력하세요.', apiKey: 'API 키', forget: '키 지우기', keyNote: '키는 이 브라우저(localStorage)에만 저장되며 선택한 서비스로만 전송됩니다. 별도 API 주소를 입력하면 해당 주소로 전송됩니다.',
    facts: '상품 정보', name: '상품명 *', info: '상품 설명 *', nameHint: '예: 모루 데일리 텀블러', infoHint: '소재, 특징, 크기, 확인된 성능, 배송 조건 등을 적어 주세요.', pasteHelp: '상품 정보를 붙여 넣으세요. URL 가져오기는 CLI에서 지원합니다.', direction: '콘텐츠 방향', language: '출력 언어', tone: '말투', friendly: '친근하게', premium: '고급스럽게', playful: '재치 있게', expert: '전문적으로', channel: '판매 채널', customer: '대상 고객 (선택)', customerHint: '누구를 위한 상품인가요?', forbidden: '금지할 표현 (선택)', forbiddenHint: '예: 의료 효능, 확인되지 않은 인증',
    economics: '판매 수익 계산', moneyHelp: '선택 입력 · 금액의 통화를 맞춰 주세요. AI 대신 직접 계산하며 수수료 기본값은 0%입니다.', price: '판매가', cost: '원가', fee: '수수료 %', shipping: '배송비', adCost: '건당 광고비', generate: '콘텐츠 만들기 ↗', demo: '키 없이 샘플 보기', guardrail: '입력한 사실을 바탕으로 작성하며, 빠진 정보는 확인이 필요하다고 표시합니다.', outputTitle: '콘텐츠 작업 공간', ready: '상품 정보를 기다리고 있어요', copyAll: '전체 마크다운 복사', download: '.md 다운로드', emptyTitle: '다음 판매의 시작을 이곳에서.', emptyText: '상품 하나를 여섯 가지 콘텐츠로.\n샘플로 먼저 확인해 보세요.', footer: '작은 팀의 큰 아이디어를 위해.',
    pdp: '상세페이지', ads: '광고', shorts: '숏폼 대본', thumbnails: '썸네일', listingCheck: '상품 점검', margin: '수익', copy: '복사', copied: '복사했어요.', copyError: '복사할 수 없습니다. .md 다운로드를 이용해 주세요.', forgotten: '이 연결에 저장된 키를 지웠어요.', storageError: '브라우저 저장소를 사용할 수 없어 이 페이지에서만 키를 보관합니다.', loading: '콘텐츠를 만들고 있어요… 1분 정도 걸릴 수 있습니다.', sample: '샘플 결과 · 한국어 가상 상품', generated: '생성 결과', done: '콘텐츠가 준비됐어요. 게시 전에 내용을 확인해 주세요.',
    headline: '첫인상을 만드는 문장', bullets: '다섯 가지 핵심 특징', description: '상품 이야기', faq: '궁금한 점을 풀어 드려요', headlines: '광고 제목', bodies: '광고 본문', keywords: '해시태그 / 키워드', hook: '첫 3초 후킹', cta: '행동 유도 문구', visual: '화면', voiceover: '내레이션', caption: '자막', high: '높음', medium: '보통', low: '낮음', fix: '개선 방법', unitProfit: '건당 이익', marginPct: '이익률', breakEvenRoas: '손익분기 ROAS', profitBeforeAds: '광고비 차감 전 이익', platformFee: '판매 수수료', unavailable: '계산 불가', noMargin: '판매가와 원가를 입력하면 수익을 계산할 수 있어요.', formula: '이익 = 판매가 − 원가 − 수수료 − 배송비 − 광고비. 손익분기 ROAS = 판매가 / 광고비 차감 전 이익. 금액은 입력한 통화를 따릅니다.', lowMargin: '이익률이 15% 미만입니다. 광고를 늘리기 전에 비용을 확인해 주세요.', noProfit: '건당 이익이 0 이하입니다.', noRoas: '광고비 차감 전 이익이 0 이하이면 손익분기 ROAS를 계산할 수 없습니다.', switchLanguage: 'Switch to English', tabsLabel: '콘텐츠 항목',
  },
};
const $ = selector => document.querySelector(selector);
const form = $('#product-form');
let locale = 'en', bundle = null, snapshot = null, active = 'pdp', busy = false, hosted = false, hostedMode = 'demo';
let guardEnabled = new URLSearchParams(location.search).has('fact-guard') || location.hostname.includes('nemotron');
const sections = ['pdp', 'ads', 'shorts', 'thumbnails', 'listingCheck', 'margin', 'factGuard'];
const t = key => UI[locale][key] || key;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p = value => `<p>${escape(value)}</p>`;
const ul = values => `<ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>`;
function storageKey() { return `cce:key:${$('#provider').value}:${$('#provider').value === 'openai' ? $('#baseUrl').value.trim().replace(/\/$/, '') : ''}`; }
const sessionKeys = new Map();
function saveKey() {
  const slot = storageKey(), key = $('#apiKey').value;
  sessionKeys.set(slot, key);
  try { if (key) localStorage.setItem(slot, key); else localStorage.removeItem(slot); }
  catch { $('#status').textContent = t('storageError'); }
}
function loadKey() {
  let key = sessionKeys.get(storageKey()) || '';
  try { key = localStorage.getItem(storageKey()) || key; } catch { /* Session-only fallback. */ }
  $('#apiKey').value = key;
}
function updateProvider() {
  $('#model').value = PROVIDERS[$('#provider').value].model;
  $('#base-row').hidden = $('#provider').value !== 'openai';
  loadKey();
}
$('#provider').addEventListener('change', updateProvider);
$('#baseUrl').addEventListener('change', loadKey);
$('#apiKey').addEventListener('input', saveKey);
$('#forget').addEventListener('click', () => { $('#apiKey').value = ''; saveKey(); $('#status').textContent = t('forgotten'); });

function applyLocale() {
  document.documentElement.lang = locale;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-placeholder]').forEach(el => { el.placeholder = t(el.dataset.placeholder); });
  $('#locale').textContent = locale === 'en' ? '한국어' : 'English';
  $('#locale').setAttribute('aria-label', t('switchLanguage'));
  $('#tabs').setAttribute('aria-label', t('tabsLabel'));
  $('#status').textContent = busy ? t('loading') : '';
  updateGuard(); render();
}
$('#locale').addEventListener('click', () => { locale = locale === 'en' ? 'ko' : 'en'; applyLocale(); });

let copies = [];
function card(title, html, text) {
  const index = copies.push(text) - 1;
  return `<article class="content-card"><div class="card-top"><h3>${escape(title)}</h3><button type="button" data-copy="${index}">${escape(t('copy'))}</button></div>${html}</article>`;
}
const numeric = value => Number.isFinite(value) ? Number(value.toFixed(2)).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US') : t('unavailable');
function render() {
  $('#tabs').innerHTML = sections.map(key => `<button type="button" id="tab-${key}" role="tab" aria-selected="${active === key}" aria-controls="panel-${key}" tabindex="${active === key ? 0 : -1}" data-tab="${key}">${escape(t(key))}</button>`).join('');
  $('#empty').hidden = !!bundle;
  $('#copy-all').disabled = $('#download').disabled = !bundle || busy;
  $('#output-kind').textContent = bundle?.factGuard ? `${bundle.factGuard.mode.toUpperCase()} · Nemotron Fact Guard` : bundle ? t(bundle.sample ? 'sample' : 'generated') : t('ready');
  if (!bundle) { $('#results').innerHTML = ''; return; }
  copies = [];
  const b = bundle;
  const panels = {
    factGuard: () => renderGuard(b.factGuard),
    pdp: () => card(t('headline'), `<h4 class="big-headline">${escape(b.pdp.headline)}</h4>${p(b.pdp.subheadline)}`, `${b.pdp.headline}\n${b.pdp.subheadline}`)
      + card(t('bullets'), ul(b.pdp.bullets), b.pdp.bullets.join('\n'))
      + card(t('description'), b.pdp.description.map(p).join(''), b.pdp.description.join('\n\n'))
      + card(t('faq'), b.pdp.faq.map(v => `<h4>${escape(v.question)}</h4>${p(v.answer)}`).join(''), b.pdp.faq.map(v => `${v.question}\n${v.answer}`).join('\n\n')),
    ads: () => card(t('headlines'), ul(b.ads.headlines), b.ads.headlines.join('\n')) + b.ads.bodies.map((v, i) => card(`${t('bodies')} ${i + 1}`, p(v), v)).join('') + card(t('keywords'), p(b.ads.keywords.join(' · ')), b.ads.keywords.join(' ')),
    shorts: () => card(t('hook'), p(b.shorts.hook), b.shorts.hook) + b.shorts.scenes.map(v => card(v.time, ['visual', 'voiceover', 'caption'].map(k => `<div class="scene-row"><span>${escape(t(k))}</span>${p(v[k])}</div>`).join(''), `${v.time}\n${['visual', 'voiceover', 'caption'].map(k => `${t(k)}: ${v[k]}`).join('\n')}`)).join('') + card(t('cta'), p(b.shorts.cta), b.shorts.cta),
    thumbnails: () => b.thumbnails.map((v, i) => card(`${t('thumbnails')} ${i + 1}`, `<div class="thumbnail-preview">${escape(v.text)}</div>${p(v.angle)}`, `${v.text}\n${v.angle}`)).join(''),
    listingCheck: () => b.listingCheck.map(v => card(t(v.priority), `<span class="priority ${v.priority}">${escape(t(v.priority))}</span><h4>${escape(v.issue)}</h4>${p(`${t('fix')}: ${v.fix}`)}`, `${t(v.priority)}: ${v.issue}\n${v.fix}`)).join(''),
    margin: () => {
      const m = b.margin;
      if (!m) return card(t('margin'), p(t('noMargin')), t('noMargin'));
      const values = [['unitProfit', m.unitProfit], ['marginPct', m.marginPct, '%'], ['breakEvenRoas', m.breakEvenRoas, '×'], ['price', m.price], ['cost', m.cost], ['fee', m.feePct, '%'], ['platformFee', m.fee], ['shipping', m.shipping], ['adCost', m.adCost], ['profitBeforeAds', m.profitBeforeAds]];
      const warnings = [m.marginPct < 15 && t('lowMargin'), m.unitProfit <= 0 && t('noProfit'), m.profitBeforeAds <= 0 && t('noRoas')].filter(Boolean);
      return card(t('margin'), `<div class="metrics">${values.map(([key, value, suffix]) => `<div><span>${escape(t(key))}</span><strong>${escape(numeric(value))}${value !== null ? suffix || '' : ''}</strong></div>`).join('')}</div>${p(t('formula'))}${warnings.map(v => `<p class="warning">${escape(v)}</p>`).join('')}`, values.map(([key, value, suffix]) => `${t(key)}: ${numeric(value)}${value !== null ? suffix || '' : ''}`).concat(t('formula'), warnings).join('\n'));
    },
  };
  $('#results').innerHTML = sections.map(key => `<div id="panel-${key}" role="tabpanel" aria-labelledby="tab-${key}" tabindex="0" ${active !== key ? 'hidden' : ''}>${panels[key]()}</div>`).join('');
}
$('#tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');
  if (button) { active = button.dataset.tab; render(); $(`#tab-${active}`).focus(); }
});
$('#tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = sections.indexOf(active);
  active = sections[event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length];
  render(); $(`#tab-${active}`).focus();
});
async function copy(text) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select();
      const ok = document.execCommand('copy'); area.remove(); if (!ok) throw new Error();
    }
    $('#status').textContent = t('copied');
  } catch { $('#status').textContent = t('copyError'); }
}
$('#results').addEventListener('click', event => { const button = event.target.closest('[data-copy]'); if (button) copy(copies[Number(button.dataset.copy)]); });
$('#copy-all').addEventListener('click', () => { if (bundle) copy(bundleToMarkdown(bundle, snapshot)); });
$('#download').addEventListener('click', () => {
  if (!bundle) return;
  const url = URL.createObjectURL(new Blob([bundleToMarkdown(bundle, snapshot)], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'commerce-bundle.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function setBusy(value) {
  busy = value;
  form.querySelectorAll('fieldset, button').forEach(el => { el.disabled = value; });
  if (!value) updateGuard();
  $('.output-panel').setAttribute('aria-busy', String(value));
  $('#status').textContent = value ? t('loading') : '';
  render();
}
$('#demo').addEventListener('click', async () => {
  if (guardEnabled) {
    $('#error').hidden = true; setBusy(true);
    try {
      for (const [key, value] of Object.entries(FACT_GUARD_SAMPLE)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
      snapshot = { ...FACT_GUARD_SAMPLE };
      bundle = await runFactGuard(snapshot, { demo: true, onProgress: guardProgress });
      active = 'factGuard'; setBusy(false); $('#guard-progress').hidden = true;
    } catch (error) { setBusy(false); $('#error').textContent = error.message; $('#error').hidden = false; }
    return;
  }
  $('#error').hidden = true;
  for (const [key, value] of Object.entries(SAMPLE_PRODUCT)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
  snapshot = { ...SAMPLE_PRODUCT }; bundle = structuredClone(DEMO_BUNDLE); active = 'pdp'; render(); $('#status').textContent = '';
});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  $('#error').hidden = true;
  try {
    const raw = Object.fromEntries(new FormData(form));
    const input = normalizeInput(raw); saveKey(); setBusy(true);
    let result;
    if (guardEnabled) {
      guardProgress({ state: 'running' });
      if (hosted) {
        const response = await fetch('/api/fact-guard', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input), signal: AbortSignal.timeout(295000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Fact Guard request failed.');
        result = data;
      } else result = await runFactGuard(input, { apiKey: raw.apiKey, draftModel: raw.model,
        verifyModel: NEMOTRON_MODELS[$('#verifier').value], onProgress: guardProgress });
    } else result = await generateBundle(input, { provider: raw.provider, apiKey: raw.apiKey, model: raw.model, baseUrl: raw.baseUrl });
    bundle = result; snapshot = input; active = guardEnabled ? 'factGuard' : 'pdp';
    $('#guard-progress').hidden = true;
    setBusy(false); $('#status').textContent = t('done');
  } catch (error) {
    setBusy(false); $('#guard-progress').hidden = true; $('#error').textContent = error.message; $('#error').hidden = false;
  }
});
function guardProgress(event) {
  $('#guard-progress').hidden = false;
  $('#guard-progress').textContent = event.step ? `${event.step.toUpperCase()} · ${event.model} · ${event.state}` : t('guardAwait');
}
function updateGuard() {
  $('#fact-guard').checked = guardEnabled;
  document.body.classList.toggle('fact-guard-mode', guardEnabled);
  $('#connection-fields').hidden = guardEnabled && hosted;
  $('#verifier').disabled = hosted || busy;
  $('#provider').disabled = guardEnabled;
  $('#guard-connection').textContent = t(hosted ? 'guardHosted' : 'guardLocal') + (hosted ? ` ${hostedMode.toUpperCase()}` : '');
  $('#generate').textContent = t(guardEnabled ? 'guardRun' : 'generate');
  $('#demo').textContent = t(guardEnabled ? 'guardDemo' : 'demo');
  if (guardEnabled) {
    $('.hero h1').textContent = t('guardHero'); $('.hero > p').textContent = t('guardIntro');
    $('.hero .eyebrow').textContent = t('guardEyebrow');
    if (!hosted && $('#provider').value !== 'nebius') { $('#provider').value = 'nebius'; updateProvider(); }
  } else {
    $('.hero h1').textContent = t('hero'); $('.hero > p').textContent = t('intro'); $('.hero .eyebrow').textContent = t('eyebrow');
  }
}
$('#fact-guard').addEventListener('change', () => { guardEnabled = $('#fact-guard').checked; updateGuard(); });
function renderGuard(g) {
  if (!g) return card('Fact Guard', p(t('guardNoResult')), t('guardNoResult'));
  const factual = g.claims.filter(c => c.factual);
  const table = claims => `<div class="trace-scroll"><table class="trace-table"><thead><tr><th>${escape(t('guardClaim'))}</th><th>${escape(t('guardStatus'))}</th><th>${escape(t('guardSource'))}</th></tr></thead><tbody>${claims.map(c => `<tr><td>${escape(c.claim)}<small>${escape(c.path)}</small></td><td><span class="claim-status ${escape(c.status)}">${escape(c.status)}</span><small>${escape(c.reason)}</small></td><td>${c.sources.length ? c.sources.map(s => `<span class="fact-id">${escape(s.id)}</span> ${escape(s.quote)}`).join('<br>') : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  const initial = g.history[0].claims.filter(c => c.status !== 'supported');
  return `<div class="guard-verdict"><div><span>${escape(t('guardScore'))}</span><strong>${g.trustScore}<small>/100</small></strong></div><div><span class="mode-pill">${g.mode === 'demo' ? 'DEMO · OFFLINE FIXTURES' : 'Live · Nebius Token Factory'}</span><h3>${escape(t(g.needsReview ? 'guardReview' : 'guardClean'))}</h3><p>${escape(t('guardScoreNote'))}</p></div></div>
    <p class="guard-notice">${escape(g.notice)}</p>
    <h3 class="guard-section-title">${escape(t('guardSteps'))}</h3><div class="pipeline-steps">${g.steps.map(s => `<article><span class="pipeline-step">${escape(s.step)} <small>R${s.round}</small></span><strong title="${escape(s.model)}">${escape(s.model.split('/').at(-1))}</strong><small class="actual-model">${escape(s.model)}</small><span>${s.latencyMs} ms · ${s.usage?.total_tokens ?? '—'} tokens${s.usageEstimated ? ' (est.)' : ''}</span></article>`).join('')}</div>
    <p class="routing-total">${g.totals.totalTokens.toLocaleString()} ${g.mode === 'demo' ? 'estimated fixture' : 'reported'} tokens · ${g.totals.latencyMs} ms ${g.mode === 'demo' ? 'local replay' : 'model requests'}${g.totals.usageComplete ? '' : ' · usage incomplete'}. Each step records the model that actually ran.</p>
    <h3 class="guard-section-title">${escape(t('guardDiff'))}</h3>${g.changes.length ? g.changes.map(c => `<div class="claim-diff"><small>${escape(c.path)}</small><del>${escape(c.before)}</del><ins>${escape(c.after)}</ins></div>`).join('') : p('No revisions made.')}
    ${initial.length ? `<details class="guard-initial" open><summary>${escape(t('guardInitial'))} · ${initial.length}</summary>${table(initial)}</details>` : ''}
    <h3 class="guard-section-title">${escape(t('guardTrace'))} <span>${factual.length} fields</span></h3>${table(factual)}
    <details class="guard-initial"><summary>${escape(t('guardCreative'))} · ${g.claims.length - factual.length}</summary>${table(g.claims.filter(c => !c.factual))}</details>
    <details class="guard-initial"><summary>Seller source facts · ${g.facts.length}</summary>${g.facts.map(f => p(`${f.id} · ${f.text}`)).join('')}</details>`;
}
loadKey(); applyLocale();
// Static GitHub Pages keeps BYO-key mode. Only a valid same-origin API enables hosted mode.
fetch('/api/fact-guard', { signal: AbortSignal.timeout(3000) }).then(r => r.ok ? r.json() : null).then(data => {
  if (data && ['demo', 'live'].includes(data.mode) && data.models) {
    hosted = true; hostedMode = data.mode; guardEnabled = true;
    $('#verifier').value = data.models.verify === NEMOTRON_MODELS.ultra ? 'ultra' : 'super';
    updateGuard();
  }
}).catch(() => {});
