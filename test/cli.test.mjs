import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_BUNDLE } from '../src/core.js';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const env = { ...process.env, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', NEBIUS_API_KEY: '', LLM_API_KEY: '', LLM_BASE_URL: '', LLM_MODEL: '' };
const run = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
test('CLI demo emits full JSON with sample label; Markdown is the default', () => {
  const json = run(['--demo', '--format', 'json']);
  assert.equal(json.status, 0, json.stderr); assert.deepEqual(JSON.parse(json.stdout), DEMO_BUNDLE);
  const md = run(['--demo']); assert.equal(md.status, 0); assert.match(md.stdout, /## Product detail page/); assert.match(md.stdout, /## Margin snapshot/); assert.match(md.stdout, /Sample output/);
});
test('CLI help exits 0; missing/invalid arguments exit 2; missing key exits 1', () => {
  assert.equal(run(['--help']).status, 0); assert.match(run(['--help']).stdout, /--base-url/);
  for (const args of [[], ['--oops'], ['--name'], ['--demo', '--format', 'yaml'], ['--demo', '--provider', 'bad'], ['--url', 'file:///tmp/product'], ['--name', 'Cup', '--info', 'Steel', '--cost', '-1']]) assert.equal(run(args).status, 2, args.join(' '));
  const missingKey = run(['--name', 'Cup', '--info', 'Steel']); assert.equal(missingKey.status, 1); assert.match(missingKey.stderr, /API key is required/);
});
test('CLI --out writes UTF-8 output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cce-cli-'));
  try {
    const out = join(directory, 'bundle.md'); const result = run(['--demo', '--out', out]);
    assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.match(await readFile(out, 'utf8'), /모루/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// An actual local HTTP server verifies URL extraction + CLI/provider integration without external calls.
test('CLI fetches URL, merges overrides, generates via compatible API and explains fetch failures', async () => {
  let received, userAgent;
  const server = createServer(async (req, res) => {
    if (req.url === '/product') { userAgent = req.headers['user-agent']; res.end('<meta property="og:title" content="Test cup"><p>Verified steel cup.</p>'); }
    else if (req.url === '/v1/chat/completions') {
      let body = ''; for await (const part of req) body += part;
      received = JSON.parse(body); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(DEMO_BUNDLE) } }] }));
    } else { res.statusCode = 404; res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const asyncRun = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env: { ...env, LLM_API_KEY: 'mock-local-key' } });
    let stdout = '', stderr = ''; child.stdout.on('data', v => { stdout += v; }); child.stderr.on('data', v => { stderr += v; });
    child.on('error', reject); child.on('close', status => resolve({ status, stdout, stderr }));
  });
  try {
    const result = await asyncRun(['--url', `${base}/product`, '--base-url', `${base}/v1`, '--price', '100', '--cost', '40', '--format', 'json']);
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).margin.unitProfit, 60);
    const input = JSON.parse(received.messages[1].content); assert.equal(input.product_name, 'Test cup'); assert.match(input.product_info, /Verified steel cup/); assert.match(userAgent, /Mozilla/);
    const failed = await asyncRun(['--url', `${base}/missing`]); assert.equal(failed.status, 1); assert.match(failed.stderr, /404.*--info/);
    const file = await asyncRun(['--file', fileURLToPath(new URL('../examples/sample-product.json', import.meta.url)), '--base-url', `${base}/v1`, '--lang', 'English', '--format', 'json']);
    assert.equal(file.status, 0, file.stderr); assert.equal(JSON.parse(received.messages[1].content).language, 'English');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

// Fact Guard must be useful without credentials and explicit about its offline evidence.
test('CLI Fact Guard demo and automatic no-key mode expose traces, revisions and model routing', () => {
  for (const args of [
    ['--fact-guard', '--demo'],
    ['--fact-guard', '--name', 'Test Cup', '--info', 'Capacity: 500 ml. Material: steel.', '--lang', 'en'],
  ]) {
    const result = run([...args, '--format', 'json']);
    assert.equal(result.status, 0, result.stderr);
    const b = JSON.parse(result.stdout);
    assert.equal(b.factGuard.mode, 'demo');
    assert.equal(b.factGuard.trustScore, 100);
    assert.equal(b.factGuard.changes.length, 2);
    assert.deepEqual(b.factGuard.steps.map(s => s.step), ['draft', 'verify', 'revise', 'verify']);
    assert.ok(b.factGuard.steps.every(s => s.usageEstimated));
  }
  assert.match(run(['--fact-guard', '--demo']).stdout, /## Fact Guard/);
  assert.equal(run(['--fact-guard', '--demo', '--verifier', 'invalid']).status, 2);
  assert.match(run(['--help']).stdout, /NEBIUS_API_KEY/);
  const ultra = JSON.parse(run(['--fact-guard', '--demo', '--verifier', 'ultra', '--format', 'json']).stdout);
  assert.match(ultra.factGuard.steps[1].model, /Ultra/);
  const missingKey = run(['--provider', 'nebius', '--name', 'Cup', '--info', 'Steel']);
  assert.equal(missingKey.status, 1); assert.match(missingKey.stderr, /API key is required/);
});
