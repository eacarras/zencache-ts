
import { CacheCore } from './core/cache.js';
import { startHttpServer } from './server/http.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const CAPACITY_BYTES = parseInt(process.env.CAPACITY_BYTES || String(128 * 1024 * 1024), 10);
const SWEEP_INTERVAL_MS = parseInt(process.env.SWEEP_INTERVAL_MS || '100', 10);

const cache = new CacheCore({ capacityBytes: CAPACITY_BYTES, sweepIntervalMs: SWEEP_INTERVAL_MS });
startHttpServer(cache, PORT);

process.on('SIGINT', () => { cache.stop(); process.exit(0); });
process.on('SIGTERM', () => { cache.stop(); process.exit(0); });
