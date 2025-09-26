/** Roughly estimate the byte size of a JS value for capacity accounting. */
export function approximateSizeOf(value: unknown): number {
  try {
    if (typeof value === 'string') return Buffer.byteLength(value, 'utf8');
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 1;
    if (value === null || value === undefined) return 0;
    const s = JSON.stringify(value);
    return Buffer.byteLength(s ?? '', 'utf8');
  } catch {
    return 64;
  }
}
