import { runTournament, DIRECTIONS } from './src/tournament.js';
import { FACT_GUARD_SAMPLE } from './src/fact-guard.js';
const $ = s => document.querySelector(s);
const enabled = new URLSearchParams(location.search).has('tournament') || (location.hostname.includes('nemotron') && !new URLSearchParams(location.search).has('fact-guard'));
if (enabled) init();
function init() {
  document.body.classList.add('tournament-page'); $('#tournament').hidden = false;
  document.title = 'Variant Tournament · Fact Guard';
  $('#arena-name').value = FACT_GUARD_SAMPLE.product_name;
  $('#arena-facts').value = FACT_GUARD_SAMPLE.product_info;
  $('#arena-forbidden').value = FACT_GUARD_SAMPLE.forbidden_claims;
  let hosted = false, mode = 'demo', busy = false, lastResult = null, variants = [];
  const states = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay = ms => reduced ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms));
  const money = value => value === null || value === undefined ? 'Unavailable' : `$${value.toFixed(5)}`;
  const modelLabel = model => model?.toLowerCase().includes('nano') ? 'Nano' : model?.toLowerCase().includes('ultra') ? 'Ultra' : model?.toLowerCase().includes('super') ? 'Super' : model || '—';
  const connection = fetch('/api/tournament', { signal: AbortSignal.timeout(4000) }).then(r => r.ok ? r.json() : null).then(data => {
    if (data && ['demo', 'live'].includes(data.mode)) { hosted = true; mode = data.mode; }
  }).catch(() => {}).finally(() => { $('#arena-mode').textContent = mode === 'demo' ? 'DEMO / OFFLINE FIXTURES' : 'LIVE / TOKEN FACTORY'; });
  function grid() {
    const count = Number($('#arena-count').value);
    $('#arena-grid').innerHTML = Array.from({ length: count }, (_, i) => {
      const id = `V${String(i + 1).padStart(2, '0')}`, variant = variants.find(v => v.id === id), state = states.get(id) || 'waiting';
      return `<button type="button" class="variant-tile ${esc(state)}" data-variant="${id}" aria-label="${id}: ${esc(state)}${variant ? `: ${esc(variant.headline)}` : ''}"><span class="tile-top"><b>${id}</b><span>${esc(state === 'winner' ? '★ WINNER' : state.toUpperCase())}</span></span><strong>${esc(variant?.headline || DIRECTIONS[i % 16])}</strong><p>${esc(variant?.hook || 'An idea waiting to happen.')}</p><span class="tile-bottom">${esc(variant ? `${variant.tone} / ${variant.audience}` : 'NEMOTRON NANO')}</span></button>`;
    }).join('');
    $('#arena-grid').classList.toggle('double-field', count > 16);
  }
  function metrics(result) {
    $('#arena-metrics').innerHTML = ['generate', 'verify', 'judge'].map((name, i) => {
      const stage = result?.stages.find(s => s.stage === name), steps = result?.steps.filter(s => s.stage === name) || [];
      return `<div><span>0${i + 1} / ${['PARALLEL GENERATION', 'FACT GUARD GATE', 'SELECTIVE JUDGING'][i]}</span><strong>${stage ? `${stage.tokens.toLocaleString()} tokens` : '—'}</strong><p>${stage ? `${stage.calls} calls · ${(stage.latencyMs / 1000).toFixed(2)}s stage wall · ${money(stage.costUsd)}` : ['Nano explores the creative space', 'Super audits every variant', 'Larger model judges survivors only'][i]}</p><small>${steps.length ? [...new Set(steps.map(s => modelLabel(s.model)))].join(' / ') : ['Nano', 'Super', 'Super / Ultra'][i]}${result?.mode === 'demo' ? ' · estimated tokens / local replay time' : stage && !stage.usageComplete ? ' · usage incomplete' : ''}</small></div>`;
    }).join('') + `<div class="efficiency"><span>THE ROUTING ADVANTAGE</span><strong>${result ? money(result.totals.costUsd) : 'Small → selective'}</strong><p>${result ? `${result.totals.largeJudgeCalls} big-model duels · ${result.totals.avoidedUnsafeJudgeEntries} unsafe entries excluded` : 'Spend reasoning where it matters.'}</p><small>${result ? `${money(result.totals.allLargeCostUsd)} if generation also used the judge model*` : 'Parallel calls reduce waiting, not token spend.'}</small></div>`;
  }
  function reset() {
    variants = []; states.clear(); $('#arena-rounds').innerHTML = '<div class="bracket-empty">Evidence gate first.<span>Every assertion needs a source.<br>No source? No place in the bracket.</span></div>';
    $('#arena-winner').hidden = true; $('#arena-detail').hidden = true; $('#arena-error').hidden = true;
    $('#arena-survivors').textContent = `${$('#arena-count').value} contenders · awaiting launch`; grid(); metrics();
  }
  function detail(variant) {
    const trace = variant.claims || [];
    return `<h3>${esc(variant.id)} · ${esc(variant.headline)}</h3><p>${esc(variant.hook)}</p><div class="winner-beats">${variant.beats.map(b => `<article><b>${b.time}</b><p>${esc(b.visual)}</p><strong>${esc(b.voiceover)}</strong><small>Caption: ${esc(b.caption)}</small></article>`).join('')}</div><h4>Fact trace / every field reviewed</h4><div class="arena-trace">${trace.map(c => `<div><span class="trace-status ${esc(c.status)}">${esc(c.status)}</span><strong>${esc(c.claim)}</strong><p>${esc(c.reason)}</p><small>${esc(c.path)} ${c.sources.map(s => `${esc(s.id)}: “${esc(s.quote)}”`).join(' · ')}</small></div>`).join('')}</div>`;
  }
  async function event(data, paced = false) {
    if (data.type === 'error') throw new Error(data.error);
    if (data.type === 'start') { mode = data.mode; $('#arena-mode').textContent = mode === 'demo' ? 'DEMO / OFFLINE FIXTURES' : 'LIVE / TOKEN FACTORY'; }
    if (data.type === 'stage') {
      const labels = { generate: 'Nano is exploring creative directions', verify: 'Super is checking every assertion', judge: 'Simulated buyer personas are choosing' };
      $('#arena-phase').textContent = `${labels[data.stage]} · ${data.state}`;
    }
    if (data.type === 'step' && data.stage === 'generate' && data.state === 'running') { states.set(data.id, 'generating'); grid(); }
    if (data.type === 'variant') { variants.push(data.variant); states.set(data.variant.id, 'drafted'); grid(); if (paced) await delay(100); }
    if (data.type === 'verified') {
      const index = variants.findIndex(v => v.id === data.variant.id); variants[index] = data.variant;
      states.set(data.variant.id, data.variant.eligible ? 'verified' : 'eliminated'); grid();
      $('#arena-survivors').textContent = `${variants.filter(v => v.eligible).length} verified · ${variants.filter(v => v.eligible === false).length} rejected`;
      if (paced) await delay(160);
    }
    if (data.type === 'round') {
      if (!$('#arena-rounds .bracket-round')) $('#arena-rounds').innerHTML = '';
      $('#arena-rounds').insertAdjacentHTML('beforeend', `<details class="bracket-round" ${data.matches.length < 3 ? 'open' : ''}><summary>ROUND ${data.round}<span>${data.matches.length} ${data.matches.length === 1 ? 'duel' : 'duels'}</span></summary>${data.matches.map(m => `<div class="bracket-match"><span>${esc(m.left)} ${m.right ? `vs ${esc(m.right)}` : '· BYE'}</span><b>↳ ${esc(m.winner)}</b><small>${esc(m.persona)}</small><p>${esc(m.reason)}</p></div>`).join('')}</details>`);
      const winners = new Set(data.matches.map(m => m.winner));
      data.matches.forEach(m => [m.left, m.right].filter(Boolean).forEach(id => states.set(id, winners.has(id) ? 'advancing' : 'out')));
      grid(); $('#arena-survivors').textContent = `${winners.size} advance · round ${data.round}`;
      if (paced || mode === 'live') await delay(900);
    }
    if (data.type === 'result') {
      const result = data.result; lastResult = result; variants = result.variants;
      if (result.winner) states.set(result.winner.id, 'winner');
      grid(); metrics(result);
      $('#arena-phase').textContent = result.winner ? `${result.winner.id} wins · evidence attached` : 'No verified variants survived. No winner selected.';
      $('#arena-survivors').textContent = result.winner ? `★ ${result.winner.id} / tournament champion` : '0 survivors';
      $('#arena-notice').textContent = `${result.notice} *Cost comparison holds token counts constant and reprices Nano generation with the judge model; it is not a measured benchmark. Rates: public catalogue, ${result.pricing.asOf}. Unknown model prices or usage show as unavailable.`;
      $('#arena-winner').hidden = false;
      const lastMatch = result.rounds.at(-1)?.matches.find(m => m.winner === result.winner?.id);
      $('#arena-winner').innerHTML = result.winner ? `<div class="winner-banner"><div><span class="arena-section-label">★ / THE VERIFIED CHAMPION</span><h2>${esc(result.winner.headline)}</h2><p>${esc(lastMatch?.reason || 'The only variant to pass the evidence gate; no duel required.')}</p></div><span class="winner-id">${result.winner.id}</span></div>${detail(result.winner)}` : '<h2>No winner. The guard held.</h2><p>Every creative failed the evidence gate. Refine the facts or restrictions and try again.</p>';
      $('#arena-replay').disabled = false;
    }
  }
  async function replay(result) {
    reset(); await event({ type: 'start', mode: result.mode });
    $('#arena-phase').textContent = 'Paced replay of the completed tournament';
    for (const variant of result.variants) await event({ type: 'variant', variant }, true);
    for (const variant of result.variants) await event({ type: 'verified', variant }, true);
    for (const round of result.rounds) await event({ type: 'round', ...round }, true);
    await event({ type: 'result', result });
  }
  function lock(value) { busy = value; $('#arena-form').querySelectorAll('input,textarea,select,button').forEach(el => { el.disabled = value; }); $('#arena-replay').disabled = value || !lastResult; $('#arena-grid').setAttribute('aria-busy', String(value)); }
  $('#arena-form').addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    await connection; lastResult = null; reset(); lock(true);
    const input = { ...FACT_GUARD_SAMPLE, product_name: $('#arena-name').value, product_info: $('#arena-facts').value, forbidden_claims: $('#arena-forbidden').value, count: Number($('#arena-count').value) };
    try {
      if (!hosted) { const result = await runTournament(input, { demo: true }); await replay(result); }
      else {
        const response = await fetch('/api/tournament', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify(input), signal: AbortSignal.timeout(295000) });
        if (!response.ok) throw new Error((await response.json()).error || 'Tournament request failed.');
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', gotResult = false;
        while (true) {
          const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n'); buffer = lines.pop();
          for (const line of lines.filter(Boolean)) { const data = JSON.parse(line); await event(data, mode === 'demo'); if (data.type === 'result') gotResult = true; }
          if (done) break;
        }
        if (!gotResult) throw new Error('The tournament stream ended before a winner was confirmed. Retry the run.');
      }
    } catch (error) { $('#arena-error').textContent = error.message; $('#arena-error').hidden = false; $('#arena-phase').textContent = 'Tournament stopped · no unverified winner'; }
    finally { lock(false); }
  });
  $('#arena-replay').addEventListener('click', async () => { if (busy || !lastResult) return; lock(true); try { await replay(lastResult); } finally { lock(false); } });
  $('#arena-count').addEventListener('change', () => { lastResult = null; reset(); $('#arena-replay').disabled = true; });
  $('#arena-grid').addEventListener('click', e => { const id = e.target.closest('[data-variant]')?.dataset.variant, variant = variants.find(v => v.id === id); if (!variant) return; $('#arena-detail').hidden = false; $('#arena-detail').open = true; $('#arena-detail > div').innerHTML = detail(variant); $('#arena-detail').scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' }); });
  reset();
}
