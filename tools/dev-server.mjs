// Lokaler Testserver: liefert die App aus und beantwortet /api/lk wie Vercel (Daten im Arbeitsspeicher).
// Start: LK_MEMORY=1 node tools/dev-server.mjs 8130
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.LK_MEMORY = process.env.LK_MEMORY || '1';
const root = normalize(join(fileURLToPath(import.meta.url), '../..'));
const { default: api } = await import('../api/lk.mjs');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' };
const port = Number(process.argv[2] || 8130);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/lk') return api(req, res);
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`dev server on http://localhost:${port}`));
