
# zencache-ts

A production-minded **in-memory cache** in **TypeScript** with **LRU eviction**, **TTL expiration**, optional **TinyLFU admission**, tiny **HTTP API**, and a minimal **RESP (Redis-like) adapter**. It also exposes **Prometheus metrics** including **histograms per operation**.

---

## Quick start

```bash
# Node 22+
npm i
npm run dev   # HTTP :8080, RESP :6380 (LFU OFF por defecto)
# Put & get
curl -i -X PUT 'http://localhost:8080/v1/cache/hello' -H 'content-type: application/json' -d '{"value":"world"}'
curl -i 'http://localhost:8080/v1/cache/hello'
```

Build & run:
```bash
npm run build && npm start
```

Run tests:
```bash
npm test
```

Micro-benchmark (muy simple, 1 proceso):
```bash
npm run bench
```

---

## HTTP API & Metrics

- `PUT /v1/cache/:key?ttl=ms`
  - Body: JSON `{ "value": any }` o texto plano (según `content-type`).
  - **201 Created** si no existía (con `Location`, `X-Cache-Admitted: true`).
  - **204 No Content** si se actualiza (`X-Cache-Admitted: true`).
  - **507 Insufficient Storage** si la admisión TinyLFU rechaza la inserción (`X-Cache-Admitted: false` y body `{"ok":false,"admitted":false,"reason":"admission-rejected"}`).
- `GET /v1/cache/:key` → 200 con valor. Header: `X-TTL-Remaining` si aplica.
- `DELETE /v1/cache/:key` → 204 si existía, 404 si no.
- `GET /v1/stats` → snapshot de contadores.
- `GET /metrics` → Prometheus/OpenMetrics: counters, gauges **y histogramas**:
  - `zencache_hits_total`, `zencache_misses_total`, `zencache_evictions_total`
  - `zencache_items`, `zencache_size_bytes`, `zencache_capacity_bytes`, `zencache_started_at_seconds`, `zencache_lfu_enabled`
  - `zencache_http_seconds{op="GET|PUT|DELETE"}` (histogram)
  - `zencache_resp_seconds{cmd="GET|SET|DEL|EXISTS|TTL/PTTL|PING|INFO"}` (histogram)

### Scrape config (ejemplo)
```yaml
scrape_configs:
  - job_name: 'zencache'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: /metrics
```

---

## RESP (Redis-like) TCP Adapter

- Puerto: `6380` (`RESP_PORT`).
- Comandos: `PING | GET key | SET key value [PX ms] | DEL key | EXISTS key | TTL key | PTTL key | QUIT | INFO`.
- Strings only (para JSON/binario, usa HTTP).
- Si TinyLFU rechaza, `SET` responde `-ERR admission-rejected`.

---

## Why this cache?
- **Deterministic internals**: LRU O(1) + TTL vía min-heap O(log n) con *single sweeper*.
- **TinyLFU (opcional)**: mejor hit-ratio con cargas con churn (admisión probabilística).
- **Capacidad por bytes** (aprox), más realista.
- **Core agnóstico de transporte** + adaptadores delgados (HTTP/RESP).
- **Observabilidad lista**: counters/gauges + **histogramas**.

### Arquitectura (ASCII)
```
+-----------------------+
|       HTTP API        |---- GET/PUT/DEL --> Core
+-----------------------+
|       RESP TCP        |---- PING/GET/SET --> Core
+-----------------------+
            |
            v
+--------------------------------------+
|            CacheCore                 |
|  Map<Key,Entry> + LRU + TTL Heap     |
|  + TinyLFU (admission opcional)      |
+--------------------------------------+
```

---

## Configuración (env vars)

- `PORT` (default `8080`)
- `RESP_PORT` (default `6380`)
- `CAPACITY_BYTES` (default `134217728` = 128 MiB)
- `SWEEP_INTERVAL_MS` (default `100`)
- `ENABLE_LFU` (default `0`)
- `ENABLE_RESP` (default `1`)

### RUN con .env
```bash
cp .env.example .env
npm run dev
```

---

## Project layout
```
src/
  core/
    cache.ts           # LRU + TTL + TinyLFU (admisión)
    lru.ts             # LRU: doubly-linked list
    ttlheap.ts         # Min-heap por expiresAt
    sizeof.ts          # Estimador de bytes
    tinylfu.ts         # Count-Min Sketch + aging
  server/
    http.ts            # HTTP API + /metrics
    resp.ts            # RESP adapter
  utils/
    metrics.ts         # Histograms (Prometheus-style)
  main.ts              # Bootstrap
scripts/
  bench.ts
tests/
  cache.test.ts
```

---

## Ideas para extender
- W-TinyLFU / LRU segmentado.
- AOF/Snapshot + backpressure.
- Histogramas por operación *y* por tamaño/resultado (labels extra).
- Pipelining RESP robusto, MGET/MSET, EX/NX flags…
- Sharding/replicación (hash consistente).
