/**
 * 支持 TypedArray 的高性能循环队列
 * 支持 float 和 int 类型
 */
export class TypedRingBuffer {
  private buffer: Float64Array | Int32Array;
  private capacity: number;
  private front: number = 0;
  private rear: number = 0;
  private _length: number = 0;

  constructor(type: 'float' | 'int', capacity: number) {
    this.capacity = capacity;
    this.buffer = type === 'float' ? new Float64Array(capacity) : new Int32Array(capacity);
  }

  push(value: number): boolean {
    if (this._length === this.capacity) {
      // 队列满，覆盖最旧数据
      this.front = (this.front + 1) % this.capacity;
      this._length--;
    }
    this.buffer[this.rear] = value;
    this.rear = (this.rear + 1) % this.capacity;
    this._length++;
    return true;
  }

  shift(): number | undefined {
    if (this._length === 0) return undefined;
    const value = this.buffer[this.front];
    this.front = (this.front + 1) % this.capacity;
    this._length--;
    return value;
  }

  pop(): number | undefined {
    if (this._length === 0) return undefined;
    this.rear = (this.rear - 1 + this.capacity) % this.capacity;
    const value = this.buffer[this.rear];
    this._length--;
    return value;
  }

  update(index: number, value: number): boolean {
    if (index < 0 || index >= this._length) return false;
    const i = (this.front + index) % this.capacity;
    this.buffer[i] = value;
    return true;
  }

  get(index: number): number {
    if (index < 0 || index >= this._length) return NaN;
    const i = (this.front + index) % this.capacity;
    return this.buffer[i] === undefined ? NaN : this.buffer[i];
  }

  getLast() {
    return this.get(this._length - 1);
  }

  get length(): number {
    return this._length;
  }
  size(): number {
    return this._length;
  }

  clear(): void {
    if (this.buffer instanceof Float64Array) {
      this.buffer = new Float64Array(this.capacity);
    } else {
      this.buffer = new Int32Array(this.capacity);
    }
    this.front = 0;
    this.rear = 0;
    this._length = 0;
  }

  /**
   * 迭代器支持
   */
  *[Symbol.iterator](): IterableIterator<number> {
    for (let i = 0; i < this._length; i++) {
      const item = this.get(i);
      if (item) yield item;
    }
  }
}
