// Local/pilot adapter for the exact serverless handler; no dependencies or dotenv loading.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import handler from '../api/fact-guard.js';
const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => res.end(JSON.stringify(data));
  const path = new URL(req.url, 'http://local').pathname;
  if (path === '/api/fact-guard') { res.setHeader('Content-Type', 'application/json'); return handler(req, res); }
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method not allowed'); }
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!['index.html', 'app.js', 'styles.css'].includes(file) && !/^((src\/[\w-]+\.js)|(assets\/[\w.-]+\.png))$/.test(file)) {
    res.statusCode = 404; return res.end('Not found');
  }
  try { res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.end(await readFile(resolve(root, file))); }
  catch { res.statusCode = 404; res.end('Not found'); }
});
const port = Number(process.env.PORT || 8080);
server.listen(port, '127.0.0.1', () => console.log(`Fact Guard demo: http://127.0.0.1:${port}/?fact-guard`));
