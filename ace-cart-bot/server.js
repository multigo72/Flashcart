// Tiny zero-dependency server: serves the web UI and streams a cart run over
// Server-Sent Events so progress shows up live in the browser.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { addItemsToCart, stopActiveRun, SCREENSHOT_DIR } from './src/cart.js';
import { DEFAULT_ITEMS, DEFAULT_ZIP } from './src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8090;

const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- UI ---
  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      const html = await readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
      return send(res, 200, 'text/html', html);
    } catch {
      return send(res, 500, 'text/plain', 'index.html missing');
    }
  }

  // --- runtime screenshots ---
  if (url.pathname.startsWith('/screenshots/')) {
    const file = path.join(SCREENSHOT_DIR, path.basename(url.pathname));
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    return createReadStream(file).on('error', () => res.end()).pipe(res);
  }

  // --- abort the active run ---
  if (url.pathname === '/stop') {
    const stopped = await stopActiveRun();
    return send(res, 200, 'application/json', JSON.stringify({ stopped }));
  }

  // --- run a cart job, streaming progress as SSE ---
  if (url.pathname === '/run') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // stop nginx/proxies (incl. the preview panel) buffering SSE
    });
    res.write(': connected\n\n'); // flush headers immediately so the client knows we're live

    // Heartbeat comments keep the connection from being buffered/closed during
    // long waits (e.g. while you solve a Cloudflare challenge). EventSource
    // ignores any line starting with ":".
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 12000);
    const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const finish = () => {
      clearInterval(heartbeat);
      res.end();
    };

    let items;
    try {
      items = JSON.parse(url.searchParams.get('items') || '[]');
    } catch {
      items = [];
    }
    items = (items || []).map((s) => String(s).trim()).filter(Boolean);
    const zip = url.searchParams.get('zip') || DEFAULT_ZIP;
    const headless = url.searchParams.get('headless') === 'true';

    if (items.length === 0) {
      emit('progress', { message: 'No items provided.', level: 'error' });
      emit('done', { ok: false });
      return finish();
    }

    addItemsToCart({ items, zip, headless, onProgress: (e) => emit('progress', e) })
      .then((result) => {
        emit('done', { ok: true, ...result });
        finish();
      })
      .catch((e) => {
        emit('progress', { message: `Failed: ${e.message}`, level: 'error' });
        emit('done', { ok: false });
        finish();
      });

    req.on('close', () => clearInterval(heartbeat));
    return;
  }

  return send(res, 404, 'text/plain', 'Not found');
});

server.listen(PORT, () => {
  console.log(`\n  FlashCart UI → http://localhost:${PORT}`);
  console.log(`  Defaults: zip ${DEFAULT_ZIP}, items ${DEFAULT_ITEMS.map((i) => `"${i}"`).join(', ')}\n`);
});
