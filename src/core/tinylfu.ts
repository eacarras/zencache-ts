
/**
 * TinyLFU con Count-Min Sketch (4x2048) y aging por halving periódico.
 * Estimador probabilístico para decisiones de admisión.
 */
export class TinyLFU {
  private readonly d = 4;
  private readonly w = 2048;
  private readonly mask = this.w - 1;
  private readonly tables: Uint16Array[];
  private ops = 0;
  private readonly ageEvery = 10000;

  constructor() {
    this.tables = Array.from({ length: this.d }, () => new Uint16Array(this.w));
  }

  increment(key: string) {
    const h = this.hashes(key);
    for (let i = 0; i < this.d; i++) {
      const idx = h[i] & this.mask;
      if (this.tables[i][idx] < 0xffff) this.tables[i][idx]++;
    }
    if (++this.ops % this.ageEvery === 0) this.age();
  }

  estimate(key: string): number {
    const h = this.hashes(key);
    let min = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < this.d; i++) {
      const idx = h[i] & this.mask;
      const v = this.tables[i][idx];
      if (v < min) min = v;
    }
    return min === Number.MAX_SAFE_INTEGER ? 0 : min;
  }

  private age() {
    for (let r = 0; r < this.d; r++) {
      const row = this.tables[r];
      for (let i = 0; i < row.length; i++) row[i] = row[i] >>> 1;
    }
  }

  private hashes(key: string): number[] {
    let h1 = 2166136261; let h2 = 33554467; let h3 = 16777619; let h4 = 1013904223;
    for (let i = 0; i < key.length; i++) {
      const c = key.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 16777619) >>> 0;
      h2 ^= (c + 0x9e3779b9); h2 = (h2 * 2246822519) >>> 0;
      h3 ^= (c + 0x85ebca6b); h3 = (h3 * 3266489917) >>> 0;
      h4 ^= (c + 0xc2b2ae35); h4 = (h4 * 668265263) >>> 0;
    }
    return [h1, h2, h3, h4];
  }
}
