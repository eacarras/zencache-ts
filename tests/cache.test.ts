
import { describe, it, expect } from 'vitest';
import { CacheCore } from '../src/core/cache.js';

describe('CacheCore basic', () => {
  it('sets and gets values', () => {
    const c = new CacheCore({ capacityBytes: 1024 * 1024 });
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.has('a')).toBe(true);
    expect(c.stats().items).toBe(1);
  });

  it('evicts LRU on capacity', () => {
    const c = new CacheCore({ capacityBytes: 24 }); // enough for ~3 small numbers (8 bytes each)
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    // Next insert should evict least recently used ('a')
    c.set('d', 4);
    expect(c.get('a')).toBeUndefined();
    expect(c.has('b')).toBe(true);
    expect(c.has('c')).toBe(true);
    expect(c.has('d')).toBe(true);
  });

  it('ttl expires keys', async () => {
    const c = new CacheCore({ capacityBytes: 1024 });
    c.set('x', 'y', { ttlMs: 50 });
    expect(c.get('x')).toBe('y');
    await new Promise(r => setTimeout(r, 80));
    expect(c.get('x')).toBeUndefined();
  });
});
