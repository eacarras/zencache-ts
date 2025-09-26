
# zencache-ts

A minimal, production-minded in-memory caching service in **TypeScript** with **LRU** eviction, **TTL** expiration **and optional TinyLFU admission**, exposed via a tiny **HTTP API** (no runtime deps) and a minimal **RESP (Redis-like) TCP adapter**. Internals first; API second—on purpose.

---

## Quick start

```bash
# Node 22+
npm i
npm run dev   # starts HTTP :8080 and RESP :6380 by default
# In another terminal:
curl -X PUT 'http://localhost:8080/v1/cache/hello?ttl=2000' -H 'content-type: application/json' -d '{"value":"world"}' -i
curl 'http://localhost:8080/v1/cache/hello'
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

## HTTP API & Metrics

- `PUT /v1/cache/:key?ttl=ms`
  - Body: JSON `{ "value": any }` or raw text.
  - Headers: `content-type: application/json` for JSON, otherwise treated as string.
  - **201 Created** si la clave no existía (con `Location`), **204 No Content** si se actualiza.
- `GET /v1/cache/:key`
  - 200 con el valor serializado. Headers: `X-TTL-Remaining` si aplica.
- `DELETE /v1/cache/:key`
  - 204 si se eliminó, 404 si no existe.
- `GET /v1/stats`
  - Contadores y metadatos.
- `GET /metrics`
  - Exposición **Prometheus** (OpenMetrics).

---

## RESP (Redis-like) TCP Adapter

- Puerto: `6380` (configurable vía `RESP_PORT`).  
- Comandos: `PING`, `GET key`, `SET key value [PX ms]`, `DEL key`, `EXISTS key`, `TTL key`, `PTTL key`, `QUIT`, `INFO`.  
- Nota: el adaptador RESP maneja **strings**. Para JSON/binario, usa el API HTTP.

---

## Design highlights

- **Core**
  - Storage: `Map<string, Entry>`
  - Eviction: **LRU** (doubly-linked list + hashmap) → O(1).
  - TTL: **min-heap** con sweeper centralizado → O(log n) para expiraciones.
  - Capacity: por **bytes** aproximados.
  - **TinyLFU** (opcional): política de admisión para mejorar el hit-ratio bajo churn.

- **Boundaries limpias**
  - `CacheCore` no conoce HTTP/RESP. Adaptadores son capas delgadas.

- **Tradeoffs**
  - Modelo single-thread de Node; para multi-core: varios workers detrás de un router.
  - Serialización simple (HTTP): JSON o texto. RESP: strings.

---

## Configuración

Env vars:
- `PORT` (default `8080`)
- `RESP_PORT` (default `6380`)
- `CAPACITY_BYTES` (default `134217728` = 128 MiB)
- `SWEEP_INTERVAL_MS` (default `100`)
- `ENABLE_LFU` (default `1`)
- `ENABLE_RESP` (default `1`)

---

## Docker

```bash
docker build -t zencache-ts .
docker run --rm -p 8080:8080 -p 6380:6380 -e CAPACITY_BYTES=268435456 zencache-ts
```

---

## Project layout

```
src/
  core/
    cache.ts           # CacheCore (LRU + TTL + TinyLFU admission opcional)
    lru.ts             # LRU: lista doblemente enlazada
    ttlheap.ts         # Min-heap por expiresAt
    sizeof.ts          # Estimador de bytes
    tinylfu.ts         # Count-Min Sketch + aging
  server/
    http.ts            # HTTP API (incluye /metrics)
    resp.ts            # Adaptador RESP mínimo
  main.ts              # Bootstrap (env, puertos, flags)
scripts/
  bench.ts             # Micro benchmark
tests/
  cache.test.ts        # Pruebas básicas
```

---

## Ideas para extender

- TinyLFU window (W-TinyLFU) / segmented LRU.
- Snapshot/AOF + backpressure.
- `/metrics` con histogramas por operación.
- Sharding y réplica (hash consistente).
- Adaptador RESP más compatible (pipelining robusto).

---

## Why this cache?
- **Deterministic internals**: LRU O(1) + TTL O(log n) con *single sweeper*.
- **Admisión TinyLFU** opcional → mejor hit-ratio en workloads con churn.
- **Byte capacity** realista, no solo conteo de items.
- **Transport-agnostic core** + **HTTP** y **RESP** delgados.
- **Observabilidad** lista: `/metrics` (counters + **histogramas por operación**).

### ASCII map (arquitectura)
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
|  + TinyLFU (admission)               |
+--------------------------------------+
```

### Métricas (Prometheus)
Ejemplo de salida:
```
# HELP zencache_http_seconds HTTP request duration in seconds
# TYPE zencache_http_seconds histogram
zencache_http_seconds_bucket{op="GET",le="0.005"} 4
...
zencache_http_seconds_bucket{op="GET",le="+Inf"} 4
zencache_http_seconds_sum{op="GET"} 0.0032
zencache_http_seconds_count{op="GET"} 4
# HELP zencache_resp_seconds RESP command duration in seconds
# TYPE zencache_resp_seconds histogram
zencache_resp_seconds_bucket{cmd="SET",le="0.005"} 10
...
```
Scrape config de ejemplo:
```yaml
scrape_configs:
  - job_name: 'zencache'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: /metrics
```

### RUN con .env
```bash
cp .env.example .env
# (opcional editar)
npm run dev
```

### Bench rápido
```bash
npm run bench
```
