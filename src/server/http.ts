
import http from 'node:http';
import { Cache } from '../core/cache.js';

export function startHttpServer(cache: Cache, port: number) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const method = req.method || 'GET';
      res.setHeader('content-type', 'application/json; charset=utf-8');

      if (url.pathname === '/health') {
        res.writeHead(200); res.end(JSON.stringify({ ok: true })); return;
      }

      if (url.pathname === '/v1/stats') {
        res.writeHead(200); res.end(JSON.stringify(cache.stats())); return;
      }

      // /v1/cache/:key
      if (url.pathname.startsWith('/v1/cache/')) {
        const key = decodeURIComponent(url.pathname.substring('/v1/cache/'.length));
        if (!key) { res.writeHead(400); res.end(JSON.stringify({ error: 'key required' })); return; }

        if (method === 'GET') {
          const v = cache.get(key);
          if (v === undefined) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
          const rem = cache.ttlRemainingMs(key);
          if (rem !== undefined) res.setHeader('X-TTL-Remaining', String(rem));
          res.setHeader('X-Cache-Hit', 'true');
          // If primitive/string, return directly; otherwise JSON
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(v));
          } else {
            res.writeHead(200);
            res.end(JSON.stringify(v));
          }
          return;
        }

        if (method === 'PUT' || method === 'POST') {
          const ttlMs = url.searchParams.get('ttl');
          const ttl = ttlMs ? parseInt(ttlMs, 10) : undefined;

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          const raw = Buffer.concat(chunks).toString('utf8');
          const ct = (req.headers['content-type'] || '').toLowerCase();
          let value: unknown = raw;
          if (ct.includes('application/json')) {
            try { value = JSON.parse(raw); value = (value as any)?.value ?? value; } catch { value = raw; }
          }
          cache.set(key, value, { ttlMs: ttl });
          res.writeHead(204); res.end(); return;
        }

        if (method === 'DELETE') {
          const ok = cache.del(key);
          if (!ok) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
          res.writeHead(204); res.end(); return;
        }
      }

      res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'internal', detail: String(err?.message ?? err) }));
    }
  });

  server.listen(port, () => {
    console.log(`[zencache] HTTP listening on :${port}`);
  });

  return server;
}
