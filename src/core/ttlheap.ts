
/**
 * Min-heap keyed by expiresAt (epoch ms), used by the TTL sweeper.
 * push/pop O(log n), peek O(1). Also supports removeAt(index).
 */
type HeapItem<K=string> = { key: K; expiresAt: number };

export class TTLMinHeap<K=string> {
  private a: HeapItem<K>[] = [];

  size(): number { return this.a.length; }
  clear(): void { this.a.length = 0; }

  /** Returns the smallest (earliest) item without removing it. */
  peek(): HeapItem<K> | undefined { return this.a[0]; }

  /** Adds an item and returns its current index in the heap array. */
  push(item: HeapItem<K>): number {
    const idx = this.a.push(item) - 1;
    this.bubbleUp(idx);
    for (let i = this.a.length - 1; i >= 0; i--) {
      if (this.a[i] === item) return i;
    }
    return -1;
  }

  /** Removes and returns the smallest (earliest) item. */
  pop(): HeapItem<K> | undefined {
    const n = this.a.length;
    if (n === 0) return undefined;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (n > 1) {
      this.a[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  /** Removes the item at a specific index (if valid). */
  removeAt(index: number): HeapItem<K> | undefined {
    if (index < 0 || index >= this.a.length) return undefined;
    const last = this.a.pop()!;
    if (index === this.a.length) return last; // removed the last element
    const removed = this.a[index];
    this.a[index] = last;
    if (!this.bubbleDown(index)) this.bubbleUp(index);
    return removed;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.a[p].expiresAt <= this.a[i].expiresAt) break;
      [this.a[p], this[i]] = [this.a[i], this.a[p]]; // will fix below
    }
  }

  private bubbleDown(i: number): boolean {
    const n = this.a.length;
    let moved = false;
    while (true) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.a[l].expiresAt < this.a[smallest].expiresAt) smallest = l;
      if (r < n && this.a[r].expiresAt < this.a[smallest].expiresAt) smallest = r;
      if (smallest === i) break;
      [this.a[i], this.a[smallest]] = [this.a[smallest], this.a[i]];
      i = smallest;
      moved = true;
    }
    return moved;
  }
}
