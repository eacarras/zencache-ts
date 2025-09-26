
import http from 'node:http';
import { Cache } from '../core/cache.js';
import { metrics } from '../utils/metrics.js';

/** Start a minimal HTTP server exposing the cache. */
export function startHttpServer(cache: Cache, port: number) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const method = req.method || 'GET';

      if (url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true })); return;
      }

      if (url.pathname === '/v1/stats') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(cache.stats())); return;
      }

      if (url.pathname === '/metrics') {
        const s = cache.stats();
        const counters =
`# HELP zencache_hits_total Total cache hits
# TYPE zencache_hits_total counter
zencache_hits_total ${s.hits}
# HELP zencache_misses_total Total cache misses
# TYPE zencache_misses_total counter
zencache_misses_total ${s.misses}
# HELP zencache_evictions_total Total evictions due to capacity
# TYPE zencache_evictions_total counter
zencache_evictions_total ${s.evictions}
# HELP zencache_items Current live items
# TYPE zencache_items gauge
zencache_items ${s.items}
# HELP zencache_size_bytes Approximate total size in bytes
# TYPE zencache_size_bytes gauge
zencache_size_bytes ${s.totalSizeBytes}
# HELP zencache_capacity_bytes Configured capacity in bytes
# TYPE zencache_capacity_bytes gauge
zencache_capacity_bytes ${s.capacityBytes}
# HELP zencache_started_at_seconds Process start time in seconds
# TYPE zencache_started_at_seconds gauge
zencache_started_at_seconds ${Math.floor(s.startedAt / 1000)}
# HELP zencache_lfu_enabled Whether TinyLFU admission is enabled (1=yes,0=no)
# TYPE zencache_lfu_enabled gauge
zencache_lfu_enabled ${s.lfuEnabled ? 1 : 0}
# HELP zencache_up Always 1 if process is alive
# TYPE zencache_up gauge
zencache_up 1
`;
        const hist = metrics.httpDurations.export() + metrics.respDurations.export();
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
        res.end(counters + hist); return;
      }

      // /v1/cache/:key
      if (url.pathname.startsWith('/v1/cache/')) {
        const key = decodeURIComponent(url.pathname.substring('/v1/cache/'.length));
        if (!key) { res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'key required' })); return; }

        if (method === 'GET') {
          const t0 = process.hrtime.bigint();
          const v = cache.get(key);
          if (v === undefined) { res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not found' })); metrics.httpDurations.observe(Number(process.hrtime.bigint() - t0)/1e9, { op: 'GET' }); return; }
          const rem = cache.ttlRemainingMs(key);
          if (rem !== undefined) res.setHeader('X-TTL-Remaining', String(rem));
          res.setHeader('X-Cache-Hit', 'true');
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(v));
          metrics.httpDurations.observe(Number(process.hrtime.bigint() - t0)/1e9, { op: 'GET' });
          return;
        }

        if (method === 'PUT' || method === 'POST') {
          const t0 = process.hrtime.bigint();
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

          const existed = cache.has(key);
          const admitted = cache.set(key, value, { ttlMs: ttl });

          if (!admitted) {
            res.writeHead(507, { 'content-type': 'application/json; charset=utf-8', 'X-Cache-Admitted': 'false' });
            res.end(JSON.stringify({ ok: false, admitted: false, reason: 'admission-rejected' }));
            metrics.httpDurations.observe(Number(process.hrtime.bigint() - t0)/1e9, { op: 'PUT' });
            return;
          }

          if (!existed) {
            res.writeHead(201, { 'Location': `/v1/cache/${encodeURIComponent(key)}`, 'X-Cache-Admitted': 'true' });
          } else {
            res.writeHead(204, { 'X-Cache-Admitted': 'true' });
          }
          res.end();
          metrics.httpDurations.observe(Number(process.hrtime.bigint() - t0)/1e9, { op: 'PUT' });
          return;
        }

        if (method === 'DELETE') {
          const t0 = process.hrtime.bigint();
          const ok = cache.del(key);
          if (!ok) { res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not found' })); metrics.httpDurations.observe(Number(process.hrtime.bigint() - t0)/1e9, { op: 'DELETE' }); return; }
          res.writeHead(204); res.end();
          metrics.httpDurations.observe(Number(process.hrtime.bigint() - t0)/1e9, { op: 'DELETE' });
          return;
        }
      }

      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not found' }));
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'internal', detail: String(err?.message ?? err) }));
    }
  });

  server.listen(port, () => {
    console.log(`[zencache] HTTP listening on :${port}`);
  });

  return server;
}
