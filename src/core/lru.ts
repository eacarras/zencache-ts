
export interface LruNode<K=string> {
  key: K;
  prev?: LruNode<K>;
  next?: LruNode<K>;
}

export class DoublyLinkedLRU<K=string> {
  private _head?: LruNode<K>;
  private _tail?: LruNode<K>;
  private _size = 0;

  get size() { return this._size; }

  insertFront(key: K): LruNode<K> {
    const node: LruNode<K> = { key };
    if (!this._head) {
      this._head = this._tail = node;
    } else {
      node.next = this._head;
      this._head.prev = node;
      this._head = node;
    }
    this._size++;
    return node;
  }

  moveToFront(node: LruNode<K>): void {
    if (this._head === node) return;
    this.removeNode(node);
    node.prev = undefined;
    node.next = this._head;
    if (this._head) this._head.prev = node;
    this._head = node;
    if (!this._tail) this._tail = node;
    this._size++;
  }

  popTail(): LruNode<K> | undefined {
    if (!this._tail) return undefined;
    const node = this._tail;
    this.removeNode(node);
    return node;
  }

  peekTailKey(): K | undefined {
    return this._tail?.key;
  }

  removeNode(node: LruNode<K>): void {
    this._size--;
    if (node.prev) node.prev.next = node.next; else this._head = node.next;
    if (node.next) node.next.prev = node.prev; else this._tail = node.prev;
    node.prev = undefined; node.next = undefined;
  }

  clear(): void {
    this._head = this._tail = undefined;
    this._size = 0;
  }
}
