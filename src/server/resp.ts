
import net from 'node:net';
import { Cache } from '../core/cache.js';
import { metrics } from '../utils/metrics.js';

/**
 * Minimal RESP (Redis-like) TCP adapter implementing a tiny subset:
 * PING, GET, SET key value [PX ms], DEL, EXISTS, TTL, PTTL, QUIT, INFO.
 * Values are treated as strings.
 */
export function startRespServer(cache: Cache, port: number) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const result = parseRESP(buffer);
        if (!result) break; // need more data
        const { value, rest } = result;
        buffer = rest;
        handleCommand(cache, socket, value);
      }
    });
    socket.on('error', () => {});
  });

  server.listen(port, () => {
    console.log(`[zencache] RESP listening on :${port}`);
  });

  return server;
}

type RespVal = string | number | null | RespVal[];

function parseRESP(buf: Buffer): { value: RespVal, rest: Buffer } | null {
  if (buf.length === 0) return null;
  if (buf[0] !== 0x2a) return null; // expect array
  let idx = 1;
  const nl = buf.indexOf(0x0a, idx);
  if (nl < 0) return null;
  const n = parseInt(buf.slice(idx, nl-1).toString(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  idx = nl + 1;
  const arr: RespVal[] = [];
  for (let i = 0; i < n; i++) {
    if (idx >= buf.length || buf[idx] !== 0x24) return null; // $
    idx++;
    const nl2 = buf.indexOf(0x0a, idx);
    if (nl2 < 0) return null;
    const len = parseInt(buf.slice(idx, nl2-1).toString(), 10);
    idx = nl2 + 1;
    if (len === -1) { arr.push(null); continue; }
    if (idx + len + 2 > buf.length) return null;
    const data = buf.slice(idx, idx + len);
    idx += len;
    if (!(buf[idx] === 13 && buf[idx+1] === 10)) return null;
    idx += 2;
    arr.push(data.toString());
  }
  return { value: arr, rest: buf.subarray(idx) };
}

function respSimple(s: string) { return `+${s}\r\n`; }
function respError(s: string) { return `-${s}\r\n`; }
function respInteger(n: number) { return `:${Math.trunc(n)}\r\n`; }
function respBulk(s: string | null) {
  if (s === null) return `$-1\r\n`;
  const b = Buffer.from(s, 'utf8');
  return `$${b.length}\r\n${b.toString()}\r\n`;
}

function handleCommand(cache: Cache, socket: net.Socket, msg: RespVal) {
  if (!Array.isArray(msg) || msg.length === 0) {
    socket.write(respError('ERR invalid command')); return;
  }
  const cmd = String(msg[0] ?? '').toUpperCase();

  if (cmd === 'PING') { const __t0 = process.hrtime.bigint(); socket.write(respSimple('PONG')); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'PING' });

  if (cmd === 'GET') { const __t0 = process.hrtime.bigint();
    const key = String(msg[1] ?? '');
    if (!key) { socket.write(respError('ERR wrong number of arguments for GET')); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });
    const v = cache.get<string>(key);
    socket.write(respBulk(v === undefined ? null : String(v)));
    return;
  }

  if (cmd === 'SET') { const __t0 = process.hrtime.bigint();
    const key = String(msg[1] ?? '');
    const val = String(msg[2] ?? '');
    if (!key || (msg.length < 3)) { socket.write(respError('ERR wrong number of arguments for SET')); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });
    let ttlMs: number | undefined;
    if (typeof msg[3] === 'string' && String(msg[3]).toUpperCase() === 'PX') {
      ttlMs = parseInt(String(msg[4] ?? ''), 10);
      if (!Number.isFinite(ttlMs)) ttlMs = undefined;
    }
    cache.set<string>(key, val, { ttlMs });
    socket.write(respSimple('OK')); return;
  }

  if (cmd === 'DEL') { const __t0 = process.hrtime.bigint();
    const key = String(msg[1] ?? '');
    if (!key) { socket.write(respError('ERR wrong number of arguments for DEL')); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });
    const ok = cache.del(key);
    socket.write(respInteger(ok ? 1 : 0)); return;
  }

  if (cmd === 'EXISTS') { const __t0 = process.hrtime.bigint();
    const key = String(msg[1] ?? '');
    if (!key) { socket.write(respError('ERR wrong number of arguments for EXISTS')); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });
    socket.write(respInteger(cache.has(key) ? 1 : 0)); return;
  }

  if (cmd === 'TTL' || cmd === 'PTTL') { const __t0 = process.hrtime.bigint();
    const key = String(msg[1] ?? '');
    if (!key) { socket.write(respError('ERR wrong number of arguments')); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });
    if (!cache.has(key)) { socket.write(respInteger(-2)); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });
    const rem = cache.ttlRemainingMs(key);
    if (rem === undefined) { socket.write(respInteger(-1)); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });
    socket.write(respInteger(cmd === 'TTL' ? Math.floor(rem/1000) : rem)); return;
  }

  if (cmd === 'INFO') { const __t0 = process.hrtime.bigint();
    const s = cache.stats();
    const info = [
      '# Server',
      'zencache:1',
      '# Stats',
      `hits:${s.hits}`,
      `misses:${s.misses}`,
      `evictions:${s.evictions}`,
      `items:${s.items}`,
      `size_bytes:${s.totalSizeBytes}`,
      `capacity_bytes:${s.capacityBytes}`,
      `lfu_enabled:${s.lfuEnabled ? 1 : 0}`,
    ].join('\r\n');
    socket.write(respBulk(info)); return;
  }

  if (cmd === 'QUIT') { socket.end(respSimple('OK')); return; }
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'INFO' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'TTL/PTTL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'EXISTS' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'DEL' });
    metrics.respDurations.observe(Number(process.hrtime.bigint() - __t0)/1e9, { cmd: 'GET' });

  socket.write(respError('ERR unknown command'));
}
