// 使用 SharedArrayBuffer 封装的高效指标数据集容器
// 仅支持 number 类型，适合高性能场景

export class SharedBufferQueue {
  private buffer: Float64Array;
  private readonly maxSize: number;
  private front = 0;
  private rear = 0;
  private filled = false;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    // 每个 double 占 8 字节
    const sab = new SharedArrayBuffer(maxSize * Float64Array.BYTES_PER_ELEMENT);
    this.buffer = new Float64Array(sab);
  }

  push(item: number): boolean {
    this.buffer[this.rear] = item;
    this.rear = (this.rear + 1) % this.maxSize;
    if (this.filled) {
      this.front = (this.front + 1) % this.maxSize;
    } else if (this.rear === this.front) {
      this.filled = true;
    }
    return true;
  }

  get(index: number): number {
    if (!this.filled && index >= this.rear) throw new RangeError('Index out of range');
    const i = (this.front + index) % this.maxSize;
    return this.buffer[i];
  }

  size(): number {
    return this.filled ? this.maxSize : this.rear;
  }

  clear(): void {
    this.front = 0;
    this.rear = 0;
    this.filled = false;
    this.buffer.fill(0);
  }

  toArray(): number[] {
    const res: number[] = [];
    let size = this.size();
    let i = this.front;
    while (size > 0) {
      res.push(this.buffer[i]);
      i = (i + 1) % this.maxSize;
      size--;
    }
    return res;
  }
}

// 用法示例
// const queue = new SharedBufferQueue(10);
// queue.push(1);
// queue.push(2);
// queue.push(3);
// console.log(queue.get(0)); // 1
// console.log(queue.toArray()); // [1,2,3]
// queue.clear();
// console.log(queue.size()); // 0
