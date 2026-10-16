import { PROVIDERS, normalizeInput, generateBundle, bundleToMarkdown, SAMPLE_PRODUCT, DEMO_BUNDLE } from './src/core.js';

// All interface copy lives here; generated product copy keeps its chosen output language.
const UI = {
  en: {
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
let locale = 'en', bundle = null, snapshot = null, active = 'pdp', busy = false;
const sections = ['pdp', 'ads', 'shorts', 'thumbnails', 'listingCheck', 'margin'];
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
  render();
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
  $('#output-kind').textContent = bundle ? t(bundle.sample ? 'sample' : 'generated') : t('ready');
  if (!bundle) { $('#results').innerHTML = ''; return; }
  copies = [];
  const b = bundle;
  const panels = {
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
  $('.output-panel').setAttribute('aria-busy', String(value));
  $('#status').textContent = value ? t('loading') : '';
  render();
}
$('#demo').addEventListener('click', () => {
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
    const result = await generateBundle(input, { provider: raw.provider, apiKey: raw.apiKey, model: raw.model, baseUrl: raw.baseUrl });
    bundle = result; snapshot = input; active = 'pdp';
    setBusy(false); $('#status').textContent = t('done');
  } catch (error) {
    setBusy(false); $('#error').textContent = error.message; $('#error').hidden = false;
  }
});
loadKey(); applyLocale();
