
# zencache-ts

A minimal, production‑minded in‑memory caching service in **TypeScript** with **LRU** eviction and **TTL** expiration, exposed via a tiny HTTP API (no runtime deps). Internals first; API second—on purpose.

> Focus areas: deterministic O(1) ops for LRU, centralized TTL min-heap sweeper, byte-based capacity, clean separation between **core cache** and **transport**.

---

## Quick start

```bash
# Node 18+
npm i
npm run dev   # starts on :8080 by default
# In another terminal:
curl -X PUT 'http://localhost:8080/v1/cache/hello?ttl=2000' -H 'content-type: application/json' -d '{"value":"world"}'
curl 'http://localhost:8080/v1/cache/hello'   # -> "world"
sleep 2; curl -i 'http://localhost:8080/v1/cache/hello'   # -> 404 after TTL
```

Build & run:
```bash
npm run build && npm start
```

Run tests:
```bash
npm test
```

Micro-benchmark (very rough, single process/dev only):
```bash
npm run bench
```

---

## HTTP API

- `PUT /v1/cache/:key?ttl=ms`
  - Body: JSON `{ "value": any }` or raw text.
  - Headers: `content-type: application/json` for JSON, otherwise treated as string.
  - 204 No Content on success.

- `GET /v1/cache/:key`
  - 200 with serialized value.
  - Headers: `X-Cache-Hit: true|false`, `X-TTL-Remaining: <ms>` (if applicable).

- `DELETE /v1/cache/:key`
  - 204 No Content if deleted, 404 if not present.

- `GET /v1/stats`
  - Cache stats (items, size bytes, hits, misses, evictions, capacity, policy).

- `GET /health`
  - Basic health check.

---

## Design

- **Core**
  - Storage: `Map<string, Entry>`
  - Eviction: **LRU** via doubly‑linked list + hashmap for O(1) `get`/`set`/promote/evict.
  - TTL: centralized **min‑heap** (binary heap) keyed by `expiresAt` with O(log n) adjusts; sweeper runs on a fixed cadence (default 100ms) popping expired keys.
  - Capacity: byte‑based (approx) using `Buffer.byteLength` of serialized payload. Evict tail until within cap.

- **Clean boundaries**
  - `CacheCore` has no knowledge of HTTP. Transport adapters can be added (TCP/RESP, gRPC, etc.).
  - Observability: `/v1/stats` + counters; easy to export to Prometheus later.

- **Correctness & perf tradeoffs**
  - No per-key timers (scales poorly).
  - Single-threaded Node model—atomic per event loop tick. For multi‑core scale: run multiple workers behind a TCP/HTTP router or embed inside your app.
  - Serialization: JSON or raw string. For binary use base64 in API (or add a content-type in future).

---

## Configuration

Env vars:
- `PORT` (default `8080`)
- `CAPACITY_BYTES` (default `134217728` = 128 MiB)
- `SWEEP_INTERVAL_MS` (default `100`)

---

## Project layout

```
src/
  core/
    cache.ts           # Interfaces and CacheCore implementation
    lru.ts             # Doubly-linked LRU list
    ttlheap.ts         # Min-heap for TTL expiration
    sizeof.ts          # Approx value sizing
  server/
    http.ts            # Minimal HTTP API (no deps)
  main.ts              # Compose and start server
scripts/
  bench.ts             # Micro benchmark
tests/
  cache.test.ts        # Basic correctness tests for LRU + TTL
```

---

## Ideas to extend (time permitting)

- Add **TinyLFU** admission in front of LRU for better hit ratios under churn.
- **Prometheus** `/metrics` endpoint and histograms for op latency.
- Pluggable **persistence** (AOF/snapshot) with backpressure.
- **Sharding**: consistent hashing across workers; add replication.
- **TCP RESP** adapter for redis‑cli compatibility (subset).

---

## License

MIT
