// Typescript实现一个CircularQueue
// 支持的操作：推数据，取数据，跟新数据，清空数据，获取数据个数
// 要注意 rear < front和 rear >= front的情况，因为是循环队列，所以推数据时要考虑队列满的情况，此时要更新front


export class CircularQueue<T> {
  private readonly maxSize: number;
  private queue: Array<T>;
  front = 0;
  rear = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.queue = new Array<T>(maxSize);
  }

  push(item: T): boolean {
    if (this.rear == this.front && this.queue[this.front] !== undefined) {
      // 队列已满，需要将 front 后移一个位置
      this.front = (this.front + 1) % this.maxSize;
    }
    this.queue[this.rear] = item;
    // 注意，会提前计算出rear的值，所以在判断队列满的时候，rear已经是下一个位置了
    this.rear = (this.rear + 1) % this.maxSize;
    return true;
  }
  shift(): T | undefined {
    if (this.size() == 0) {
      return undefined;
    }
    const item = this.queue[this.front];
    this.front = (this.front + 1) % this.maxSize;
    return item;
  }

  pop(): T | undefined {
    if (this.size() == 0) {
      return undefined;
    }
    const item = this.queue[this.rear - 1];
    this.rear = (this.rear - 1) % this.maxSize;
    return item;
  }

  update(index: number, item: T): boolean {
    if (index < 0 || index >= this.maxSize) {
      return false;
    }
    const i = (this.front + index) % this.maxSize;
    this.queue[i] = item;
    return true;
  }

  clear(): void {
    this.queue = new Array<T>(this.maxSize);
    this.front = 0;
    this.rear = 0;
  }

  size(): number {
    if (this.queue[0] === undefined) {
      return 0
    }
    return this.front >= this.rear ? this.maxSize - this.front + this.rear : this.rear - this.front;
  }
  get(index: number): T {
    const i = (this.front + index) % this.maxSize;
    return this.queue[i];
  }
  getLast(): T{
    return this.get(this.size() - 1);
  }
  toArray(): T[] {
    const res: T[] = [];
    let size = this.size();
    let i = this.front;
    while (size > 0 && this.queue[i] !== undefined) {
      res.push(this.queue[i]);
      i = (i + 1) % this.maxSize;
      size--;
    }
    return res;
  }
}