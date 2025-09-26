
import { CacheCore } from '../src/core/cache.js';

function hrMs([s, ns]: [number, number]) { return s * 1000 + ns / 1e6; }

const N = 200_000;
const cache = new CacheCore({ capacityBytes: 512 * 1024 * 1024, enableTinyLFU: true });

const start = process.hrtime();
for (let i = 0; i < N; i++) cache.set('k' + i, i);
let t = hrMs(process.hrtime(start));
console.log(`SET ${N} items in ${t.toFixed(2)} ms -> ${(N / (t/1000)).toFixed(0)} ops/sec`);

const start2 = process.hrtime();
let sum = 0;
for (let i = 0; i < N; i++) sum += (cache.get('k' + i) as number) ?? 0;
t = hrMs(process.hrtime(start2));
console.log(`GET ${N} items in ${t.toFixed(2)} ms -> ${(N / (t/1000)).toFixed(0)} ops/sec (sum=${sum})`);
