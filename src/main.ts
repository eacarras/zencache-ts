
import { CacheCore } from './core/cache.js';
import { startHttpServer } from './server/http.js';
import { startRespServer } from './server/resp.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const CAPACITY_BYTES = parseInt(process.env.CAPACITY_BYTES || String(128 * 1024 * 1024), 10);
const SWEEP_INTERVAL_MS = parseInt(process.env.SWEEP_INTERVAL_MS || '100', 10);
const ENABLE_LFU = (process.env.ENABLE_LFU || '1') !== '0';
const RESP_PORT = parseInt(process.env.RESP_PORT || '6380', 10);
const ENABLE_RESP = (process.env.ENABLE_RESP || '1') !== '0';

const cache = new CacheCore({
  capacityBytes: CAPACITY_BYTES,
  sweepIntervalMs: SWEEP_INTERVAL_MS,
  enableTinyLFU: ENABLE_LFU,
});

startHttpServer(cache, PORT);
if (ENABLE_RESP) startRespServer(cache, RESP_PORT);

process.on('SIGINT', () => { cache.stop(); process.exit(0); });
process.on('SIGTERM', () => { cache.stop(); process.exit(0); });
