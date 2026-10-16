import { runFactGuard, NEMOTRON_MODELS } from '../src/fact-guard.js';
import { runTournament } from '../src/tournament.js';

export const MAX_BYTES = 16000;
export const RATE_LIMIT = 5;
const WINDOW_MS = 600000;
// Deliberately simple per-instance protection. This is not a distributed billing quota.
export function createHandler({ env = process.env, run = runFactGuard, now = Date.now, tournament = false } = {}) {
  const buckets = new Map();
  let active = 0;
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (code, data) => res.status(code).json(data);
    if (req.method === 'GET') return reply(200, { mode: env.NEBIUS_API_KEY || env.LLM_API_KEY ? 'live' : 'demo',
      models: { draft: (!tournament && env.NEBIUS_COPY_MODEL) || env.NEBIUS_DRAFT_MODEL || env.LLM_MODEL || NEMOTRON_MODELS.lightning,
        verify: env.NEBIUS_VERIFY_MODEL || NEMOTRON_MODELS.super,
        ...(tournament ? { judge: env.NEBIUS_JUDGE_MODEL || NEMOTRON_MODELS.super } : {}) },
      ...(tournament ? { concurrency: 6, maxActive: 2, maxCount: 32 } : {}) });
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return reply(405, { error: 'Use POST to run Fact Guard.' }); }
    // Vercel overwrites x-real-ip at its edge. Local adapter uses socket address.
    const ip = String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
    const timestamp = now();
    for (const [key, bucket] of buckets) if (timestamp >= bucket.reset) buckets.delete(key);
    let bucket = buckets.get(ip);
    if (!bucket) {
      if (buckets.size >= 5000) return reply(429, { error: 'Demo is busy. Please try later.' });
      bucket = { count: 0, reset: timestamp + WINDOW_MS }; buckets.set(ip, bucket);
    }
    if (++bucket.count > RATE_LIMIT) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.reset - timestamp) / 1000)));
      return reply(429, { error: 'Limit: five runs per ten minutes. Please try later.' });
    }
    if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { error: 'Send application/json.' });
    if (Number(req.headers['content-length']) > MAX_BYTES) return reply(413, { error: 'Input must be at most 16 KB.' });
    let body = req.body;
    try {
      if (body == null) {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > MAX_BYTES) return reply(413, { error: 'Input must be at most 16 KB.' });
          chunks.push(buffer);
        }
        body = Buffer.concat(chunks).toString('utf8');
      }
      if (Buffer.isBuffer(body)) body = body.toString('utf8');
      if (typeof body === 'string') {
        if (Buffer.byteLength(body) > MAX_BYTES) return reply(413, { error: 'Input must be at most 16 KB.' });
        body = JSON.parse(body);
      }
      if (Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES) return reply(413, { error: 'Input must be at most 16 KB.' });
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Send a product object.' });
      const allowed = ['product_name', 'product_info', 'language', 'channel', 'tone', 'target_customer', 'forbidden_claims', 'price', 'cost', 'feePct', 'shipping', 'adCost'];
      const input = Object.fromEntries(allowed.filter(k => Object.hasOwn(body, k)).map(k => [k, body[k]]));
      if (typeof input.product_name !== 'string' || input.product_name.length > 160 ||
        typeof input.product_info !== 'string' || input.product_info.length > 8000 ||
        ['target_customer', 'forbidden_claims', 'channel'].some(k => input[k] != null && (typeof input[k] !== 'string' || input[k].length > 1200))) {
        return reply(400, { error: 'Use a product name up to 160 characters and facts up to 8,000 characters; other text up to 1,200.' });
      }
      if (tournament && body.count !== undefined && (!Number.isInteger(body.count) || body.count < 2 || body.count > 32)) return reply(400, { error: 'Variant count must be an integer from 2 to 32.' });
      const apiKey = env.NEBIUS_API_KEY || env.LLM_API_KEY;
      // The client cannot choose a URL, model, key or round budget on the hosted route.
      const options = { apiKey, provider: 'nebius', baseUrl: env.LLM_BASE_URL,
        draftModel: (!tournament && env.NEBIUS_COPY_MODEL) || env.NEBIUS_DRAFT_MODEL || env.LLM_MODEL || NEMOTRON_MODELS.lightning,
        verifyModel: env.NEBIUS_VERIFY_MODEL || NEMOTRON_MODELS.super, deadlineMs: 280000, maxRounds: tournament ? 2 : 1 };
      // Clients may lower the ceiling; every upstream request including repairs counts.
      const ceiling = tournament ? 48 : 6;
      const cap = Number(req.headers['x-cce-max-calls'] ?? ceiling);
      if (!Number.isInteger(cap) || cap < 2 || cap > ceiling) return reply(400, { error: `Model-call ceiling must be an integer from 2 to ${ceiling}.` });
      options.maxCalls = cap;
      if (tournament) Object.assign(options, { count: body.count ?? 16, concurrency: 6,
        judgeModel: env.NEBIUS_JUDGE_MODEL || NEMOTRON_MODELS.super });
      if (tournament && active >= 2) { res.setHeader('Retry-After', '15'); return reply(429, { error: 'Two tournaments are already running. Try again shortly.' }); }
      let bundle, streaming = false;
      const controller = new AbortController();
      const completed = [];
      const rawAttempts = [], contentErrors = [];
      let attemptedCalls = 0;
      if (!tournament) {
        options.onRawOutput = output => rawAttempts.push(output);
        options.onContentError = errors => contentErrors.push(...errors);
      }
      options.onProgress = event => {
        if (event.state === 'running') attemptedCalls++;
        if (event.state === 'complete' && event.usage) completed.push(event);
        if (streaming && !res.destroyed) res.write(JSON.stringify(event) + '\n');
      };
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      options.signal = controller.signal;
      res.on?.('close', disconnected);
      if (tournament) {
        active++;
        if (String(req.headers.accept || '').includes('application/x-ndjson') && typeof res.write === 'function') {
          streaming = true;
          res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders?.();
        }
      }
      try { bundle = await run(input, options); }
      catch (error) {
        if (error.errors || /up to 64 source facts/.test(error.message)) {
          if (streaming) {
            res.write(JSON.stringify({ type: 'error', error: 'Invalid product input. Check required fields, language, tone and the 64-fact limit.' }) + '\n');
            return res.end();
          }
          return reply(400, { error: error.message });
        }
        // Never start fixture work after a disconnect, or reflect upstream private text.
        if (controller.signal.aborted || !apiKey) {
          const failure = { error: 'Request stopped before completion. No result was confirmed.' };
          if (streaming) { res.write(JSON.stringify({ type: 'error', ...failure }) + '\n'); return res.end(); }
          return reply(502, failure);
        }
        const notice = 'LIVE REQUEST FAILED · Showing offline deterministic fixtures. This result is DEMO, not live inference. Completed live calls may still incur tokens.';
        const fallback = { from: 'live', attemptedCalls, completedSteps: completed.slice(), rawAttempts: rawAttempts.slice(), contentErrors: contentErrors.slice(),
          failureKind: /budget|call ceiling/i.test(error.message) ? 'call_budget' : /timed out/i.test(error.message) ? 'timeout' : contentErrors.length ? 'copy_validation' : 'provider_or_schema',
          reportedTokensBeforeFailure: completed.reduce((n, s) => n + (s.usage.total_tokens || 0), 0), usageComplete: false };
        const annotate = result => { const report = tournament ? result : result.factGuard;
          if (report.fallback) return result;
          report.notice = `${notice} ${report.notice}`; report.fallback = fallback; return result; };
        if (streaming) res.write(JSON.stringify({ type: 'fallback', notice }) + '\n');
        bundle = annotate(await (tournament ? runTournament : runFactGuard)(input, { ...options,
          apiKey: undefined, demo: true, onRawOutput: undefined, onContentError: undefined, onProgress: streaming ? event => {
            if (event.type === 'result') annotate(event.result);
            if (!res.destroyed) res.write(JSON.stringify(event) + '\n');
          } : undefined }));
      }
      finally { if (tournament) active--; res.removeListener?.('close', disconnected); }
      if (streaming) return res.end();
      return reply(200, bundle);
    } catch { return reply(400, { error: 'Invalid JSON input.' }); }
  };
}
export default createHandler();
