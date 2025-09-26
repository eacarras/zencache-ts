
export interface CacheStats {
  items: number;
  totalSizeBytes: number;
  hits: number;
  misses: number;
  evictions: number;
  capacityBytes: number;
  policy: string;
  startedAt: number;
  lfuEnabled: boolean;
}

export type Primitive = string | number | boolean | null;
export type Storable = Primitive | object;

export interface CacheOptions {
  capacityBytes: number;
  sweepIntervalMs?: number;
  enableTinyLFU?: boolean;
}

export interface SetOptions {
  ttlMs?: number;
  sizeOverrideBytes?: number;
}

export interface Cache {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T, opts?: SetOptions): boolean;
  del(key: string): boolean;
  has(key: string): boolean;
  clear(): void;
  stats(): CacheStats;
  ttlRemainingMs(key: string): number | undefined;
  stop(): void;
}

import { DoublyLinkedLRU, LruNode } from './lru.js';
import { TTLMinHeap } from './ttlheap.js';
import { approximateSizeOf } from './sizeof.js';
import { TinyLFU } from './tinylfu.js';

type Entry<T = unknown> = {
  key: string;
  value: T;
  size: number;
  expiresAt?: number;
  lruNode: LruNode<string>;
  heapIndex?: number;
};

export class CacheCore implements Cache {
  private map = new Map<string, Entry>();
  private lru = new DoublyLinkedLRU<string>();
  private ttl = new TTLMinHeap<string>();
  private _totalSize = 0;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private readonly capacity: number;
  private readonly startedAt = Date.now();
  private sweeper?: NodeJS.Timeout;
  private readonly sweepInterval: number;
  private readonly lfu?: TinyLFU;

  constructor(opts: CacheOptions) {
    this.capacity = opts.capacityBytes;
    this.sweepInterval = opts.sweepIntervalMs ?? 100;
    this.sweeper = setInterval(() => this.sweepExpired(), this.sweepInterval).unref?.();
    this.lfu = opts.enableTinyLFU ? new TinyLFU() : undefined;
  }

  stop(): void { if (this.sweeper) clearInterval(this.sweeper); }

  private now(): number { return Date.now(); }

  get<T = unknown>(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) { this._misses++; return undefined; }
    if (e.expiresAt !== undefined && e.expiresAt <= this.now()) {
      this._misses++;
      this.deleteEntry(e, true);
      return undefined;
    }
    this.lru.moveToFront(e.lruNode);
    this._hits++;
    this.lfu?.increment(key);
    return e.value as T;
  }

  has(key: string): boolean {
    const e = this.map.get(key);
    if (!e) return false;
    if (e.expiresAt !== undefined && e.expiresAt <= this.now()) {
      this.deleteEntry(e, true);
      return false;
    }
    return true;
  }

  set<T = unknown>(key: string, value: T, opts?: SetOptions): boolean {
    const existing = this.map.get(key);
    const size = opts?.sizeOverrideBytes ?? approximateSizeOf(value);
    const expiresAt = opts?.ttlMs ? (this.now() + opts.ttlMs) : undefined;

    if (existing) {
      this._totalSize -= existing.size;
      existing.value = value;
      existing.size = size;
      existing.expiresAt = expiresAt;
      this._totalSize += size;
      this.lru.moveToFront(existing.lruNode);
      this.updateTtl(existing, expiresAt);
      this.lfu?.increment(key);
      this.enforceCapacity();
      return true;
    }

    if (this.lfu && (this._totalSize + size) > this.capacity) {
      const victimKey = this.lru.peekTailKey();
      if (victimKey) {
        const cand = this.lfu.estimate(key);
        const vict = this.lfu.estimate(victimKey);
        if (cand < vict) { this.lfu.increment(key); return false; }
      }
    }

    const node = this.lru.insertFront(key);
    const entry: Entry<T> = { key, value, size, expiresAt, lruNode: node };
    this.map.set(key, entry);
    this._totalSize += size;
    this.addTtl(entry, expiresAt);
    this.lfu?.increment(key);
    this.enforceCapacity();
    return true;
  }

  del(key: string): boolean {
    const e = this.map.get(key);
    if (!e) return false;
    this.deleteEntry(e, false);
    return true;
  }

  clear(): void {
    this.map.clear();
    this.lru.clear();
    this.ttl.clear();
    this._totalSize = 0;
  }

  ttlRemainingMs(key: string): number | undefined {
    const e = this.map.get(key);
    if (!e || e.expiresAt === undefined) return undefined;
    const rem = e.expiresAt - this.now();
    return rem > 0 ? rem : 0;
  }

  stats(): CacheStats {
    return {
      items: this.map.size,
      totalSizeBytes: this._totalSize,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      capacityBytes: this.capacity,
      policy: 'LRU',
      startedAt: this.startedAt,
      lfuEnabled: !!this.lfu,
    };
  }

  private enforceCapacity(): void {
    while (this._totalSize > this.capacity) {
      const tail = this.lru.popTail();
      if (!tail) break;
      const e = this.map.get(tail.key);
      if (!e) continue;
      this.deleteEntry(e, false);
      this._evictions++;
    }
  }

  private addTtl(e: Entry, expiresAt?: number) {
    if (expiresAt === undefined) return;
    e.heapIndex = this.ttl.push({ key: e.key, expiresAt });
  }

  private updateTtl(e: Entry, expiresAt?: number) {
    if (e.heapIndex !== undefined) {
      this.ttl.removeAt(e.heapIndex);
      e.heapIndex = undefined;
    }
    this.addTtl(e, expiresAt);
  }

  private sweepExpired(): void {
    const now = this.now();
    while (true) {
      const top = this.ttl.peek();
      if (!top || top.expiresAt > now) break;
      const { key } = this.ttl.pop()!;
      const e = this.map.get(key);
      if (!e) continue;
      if (e.expiresAt !== undefined && e.expiresAt <= now) {
        this.deleteEntry(e, true);
      }
    }
  }

  private deleteEntry(e: Entry, _expired: boolean): void {
    this.map.delete(e.key);
    this.lru.removeNode(e.lruNode);
    if (e.heapIndex !== undefined) this.ttl.removeAt(e.heapIndex);
    this._totalSize -= e.size;
  }
}
