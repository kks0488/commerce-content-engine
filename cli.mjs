#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { normalizeInput, extractProductFromHtml, generateBundle, bundleToMarkdown, SAMPLE_PRODUCT, DEMO_BUNDLE, PROVIDERS } from './src/core.js';

import { runFactGuard, FACT_GUARD_SAMPLE, NEMOTRON_MODELS } from './src/fact-guard.js';

const HELP = `commerce-content-engine — one product, a complete content bundle

Usage:
  node cli.mjs --demo [--format json]
  node cli.mjs --name "Product" --info "Verified product facts"
  node cli.mjs --file examples/sample-product.json --out bundle.md
  node cli.mjs --url https://example.com/product --cost 9000

Input:   --url URL  --file product.txt|json  --name TEXT  --info TEXT
AI:      --provider openai|anthropic|gemini|nebius  --model ID  --base-url URL
Content: --lang Korean|English|Japanese (ko|en|ja)  --channel TEXT
         --tone friendly|premium|playful|expert
         --customer TEXT  --forbidden-claims TEXT
Margin:  --price N  --cost N  --fee PERCENT  --shipping N  --ad-cost N
Output:  --format md|json (default md)  --out FILE  --demo  --fact-guard  --verifier super|ultra  --help

API key: OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / NEBIUS_API_KEY, or LLM_API_KEY.
Fact Guard: --fact-guard uses Nano -> Super (or --verifier ultra); no key = offline demo.
LLM_BASE_URL / LLM_MODEL configure a compatible alternative; Nebius is the default for Fact Guard.
OpenAI-compatible endpoints (OpenRouter, Ollama) use --provider openai --base-url.
Use the same currency for all amounts. Fees default to 0%; enter your own fee.
Plain --demo is fixed Korean sample output; Fact Guard fixtures use English template copy.
Exit codes: 0 success, 1 request/file error, 2 invalid arguments.
`;
class ArgumentError extends Error {}
const valueFlags = new Set(['url', 'file', 'name', 'info', 'provider', 'model', 'base-url', 'lang', 'channel', 'tone', 'price', 'cost', 'fee', 'shipping', 'ad-cost', 'format', 'out', 'customer', 'forbidden-claims', 'verifier']);
function parseArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || (!valueFlags.has(key) && !['help', 'demo', 'fact-guard'].includes(key))) throw new ArgumentError(`Unknown argument: ${args[i]}. Use --help.`);
    if (['help', 'demo', 'fact-guard'].includes(key)) flags[key] = true;
    else {
      const value = args[++i];
      if (value === undefined || value.startsWith('--')) throw new ArgumentError(`--${key} needs a value.`);
      flags[key] = value;
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) { process.stdout.write(HELP); return; }
  if (flags.format && !['md', 'json'].includes(flags.format)) throw new ArgumentError('--format must be md or json.');
  if (flags.provider && !PROVIDERS[flags.provider]) throw new ArgumentError('--provider must be openai, anthropic, gemini or nebius.');
  if (flags.verifier && !['super', 'ultra'].includes(flags.verifier)) throw new ArgumentError('--verifier must be super or ultra.');
  let raw = {}, input, bundle;
  if (flags.demo) {
    input = flags['fact-guard'] ? FACT_GUARD_SAMPLE : SAMPLE_PRODUCT;
    bundle = flags['fact-guard'] ? await runFactGuard(input, { demo: true, verifyModel: NEMOTRON_MODELS[flags.verifier || 'super'] }) : DEMO_BUNDLE;
  }
  else {
    if (flags.file) {
      const text = await readFile(flags.file, 'utf8');
      if (flags.file.toLowerCase().endsWith('.json')) {
        try { raw = JSON.parse(text); } catch { throw new ArgumentError('Product file must contain valid JSON.'); }
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ArgumentError('Product JSON must be an object.');
      } else raw = { product_info: text };
    }
    if (flags.url) {
      let url;
      try { url = new URL(flags.url); } catch { throw new ArgumentError('--url must be a valid HTTP(S) URL.'); }
      if (!/^https?:$/.test(url.protocol)) throw new ArgumentError('--url must use HTTP or HTTPS.');
      let product;
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CommerceContentEngine/0.1)' }, signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        product = extractProductFromHtml(await response.text(), response.url || flags.url);
        if (!product.title && !product.description && !product.rawText) throw new Error('No readable product information');
      } catch (error) { throw new Error(`Could not fetch product: ${error.message}. Paste verified facts with --name and --info, or use --file instead.`); }
      raw = { product_name: product.title, product_info: JSON.stringify(product), ...(product.price !== null ? { price: product.price } : {}), ...raw };
    }
    const mapping = { name: 'product_name', info: 'product_info', lang: 'language', channel: 'channel', tone: 'tone', customer: 'target_customer', 'forbidden-claims': 'forbidden_claims', price: 'price', cost: 'cost', fee: 'feePct', shipping: 'shipping', 'ad-cost': 'adCost' };
    for (const [flag, key] of Object.entries(mapping)) if (flags[flag] !== undefined) raw[key] = flags[flag];
    try { input = normalizeInput(raw); } catch (error) { throw new ArgumentError(error.message); }
    const provider = flags.provider || (flags['fact-guard'] ? 'nebius' : 'openai');
    const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`] || process.env.LLM_API_KEY;
    const options = { provider, apiKey, model: flags.model || process.env.LLM_MODEL, baseUrl: flags['base-url'] || process.env.LLM_BASE_URL };
    if (flags['fact-guard']) {
      if (!['nebius', 'openai'].includes(provider)) throw new ArgumentError('Fact Guard requires nebius or an OpenAI-compatible provider.');
      bundle = await runFactGuard(input, { ...options, draftModel: options.model,
        verifyModel: NEMOTRON_MODELS[flags.verifier || 'super'] });
    } else bundle = await generateBundle(input, options);
  }
  const output = flags.format === 'json' ? JSON.stringify(bundle, null, 2) + '\n' : bundleToMarkdown(bundle, input);
  if (flags.out) await writeFile(flags.out, output, 'utf8');
  else process.stdout.write(output);
}
main().catch(error => {
  let message = error.message;
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'NEBIUS_API_KEY', 'LLM_API_KEY']) {
    const key = process.env[name];
    if (key) message = message.split(key).join('[redacted]');
  }
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = error instanceof ArgumentError ? 2 : 1;
});
