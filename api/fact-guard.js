import { runFactGuard, NEMOTRON_MODELS } from '../src/fact-guard.js';

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
      models: { draft: env.NEBIUS_DRAFT_MODEL || env.LLM_MODEL || NEMOTRON_MODELS.nano,
        verify: env.NEBIUS_VERIFY_MODEL || NEMOTRON_MODELS.super,
        ...(tournament ? { judge: env.NEBIUS_JUDGE_MODEL || NEMOTRON_MODELS.super } : {}) },
      ...(tournament ? { concurrency: 4, maxActive: 2, maxCount: 32 } : {}) });
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
        draftModel: env.NEBIUS_DRAFT_MODEL || env.LLM_MODEL || NEMOTRON_MODELS.nano,
        verifyModel: env.NEBIUS_VERIFY_MODEL || NEMOTRON_MODELS.super, deadlineMs: 280000, maxRounds: 2 };
      if (tournament) Object.assign(options, { count: body.count ?? 16, concurrency: 4,
        judgeModel: env.NEBIUS_JUDGE_MODEL || NEMOTRON_MODELS.super });
      if (tournament && active >= 2) { res.setHeader('Retry-After', '15'); return reply(429, { error: 'Two tournaments are already running. Try again shortly.' }); }
      let bundle, streaming = false;
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      if (tournament) {
        active++; options.signal = controller.signal;
        res.on?.('close', disconnected);
        if (String(req.headers.accept || '').includes('application/x-ndjson') && typeof res.write === 'function') {
          streaming = true;
          res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders?.();
          options.onProgress = event => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); };
        }
      }
      try { bundle = await run(input, options); }
      catch (error) {
        if (streaming) { res.write(JSON.stringify({ type: 'error', error: 'Tournament could not complete. Live failures never fall back to demo.' }) + '\n'); return res.end(); }
        if (error.errors || /up to 64 source facts/.test(error.message)) return reply(400, { error: error.message });
        // No upstream error text is reflected: it could contain secrets or seller inputs.
        return reply(502, { error: 'Fact Guard could not complete. Check server model access or retry with fewer facts. Live failures never fall back to demo.' });
      }
      finally { if (tournament) { active--; res.removeListener?.('close', disconnected); } }
      if (streaming) return res.end();
      return reply(200, bundle);
    } catch { return reply(400, { error: 'Invalid JSON input.' }); }
  };
}
export default createHandler();
