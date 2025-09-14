// SharedObjectRingBuffer.ts

type ColumnSpec<T extends Record<string, number>> = {
  [K in keyof T]: Float64ArrayConstructor | Int32ArrayConstructor;
};

type BufferViews<T extends Record<string, number>> = {
  [K in keyof T]: Float64Array | Int32Array;
};

export class SharedObjectRingBuffer<T extends Record<string, number>> {


  /**
   * 从元数据导入，重建缓冲区（在 Worker 中使用）
   */
  static importMeta<T extends Record<string, number>>(
    meta: ReturnType<SharedObjectRingBuffer<T>["exportMeta"]>
  ): SharedObjectRingBuffer<T> {
    const buf = new SharedObjectRingBuffer<T>(meta.columnSpec, meta.capacity);
    // 直接替换内部状态
    buf.sab = meta.sab;
    buf.controlBuffer = meta.controlBuffer;
    buf.control = new Int32Array(meta.controlBuffer);

    // 重建视图
    let offset = 0;
    for (const key of Object.keys(meta.columnSpec) as (keyof T)[]) {
      const Type = meta.columnSpec[key];
      const byteSize = Type.BYTES_PER_ELEMENT * meta.capacity;
      buf.views[key] = new Type(buf.sab as unknown as ArrayBuffer, offset, meta.capacity) as any;
      offset += byteSize;
    }

    return buf;
  }

  // ========== 工具方法 ==========

  /**
   * 从普通对象数组初始化缓冲区（会截断或填充）
   */
  static fromArray<T extends Record<string, number>>(
    columnSpec: ColumnSpec<T>,
    capacity: number,
    arr: T[]
  ): SharedObjectRingBuffer<T> {
    const buf = new SharedObjectRingBuffer<T>(columnSpec, capacity);
    for (const item of arr.slice(-capacity)) {
      buf.push(item);
    }
    return buf;
  }


  private capacity: number;
  private sab: SharedArrayBuffer;
  private views: BufferViews<T>;
  private columnKeys: (keyof T)[];
  private columnTypes: ColumnSpec<T>;
  private control: Int32Array; // [head, count]
  private controlBuffer: SharedArrayBuffer;

  /**
   * 构造函数
   * @param columnSpec 每列的类型，如 { price: Float64Array, amount: Float64Array }
   * @param capacity 缓冲区容量
   */
  constructor(columnSpec: ColumnSpec<T>, capacity: number) {
    if (capacity <= 0) throw new Error("Capacity must be positive");
    this.capacity = capacity;
    this.controlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    this.control = new Int32Array(this.controlBuffer);
    this.resetControl();


    this.columnTypes = columnSpec;
    this.columnKeys = Object.keys(columnSpec) as (keyof T)[];

    // 计算总字节数：每列 capacity * sizeof(type)
    let totalBytes = 0;
    const columnByteSizes: number[] = [];
    for (const key of this.columnKeys) {
      const Type = columnSpec[key];
      const byteSize = Type.BYTES_PER_ELEMENT * capacity;
      columnByteSizes.push(byteSize);
      totalBytes += byteSize;
    }

    // 创建 SharedArrayBuffer
    this.sab = new SharedArrayBuffer(totalBytes);

    // 创建各列的 TypedArray 视图
    this.views = {} as BufferViews<T>;
    let offset = 0;
    for (let i = 0; i < this.columnKeys.length; i++) {
      const key = this.columnKeys[i];
      const Type = columnSpec[key];
      const byteSize = columnByteSizes[i];
      this.views[key] = new Type(this.sab as unknown as ArrayBuffer, offset, capacity) as any;
      offset += byteSize;
    }
  }

  /**
   * 将逻辑索引转换为实际物理索引
   */
  private getRealIndex(idx: number): number {
    return (this.head - this.count + idx + this.capacity) % this.capacity;
  }

  private resetControl() {
    this.control[0] = 0;
    this.control[1] = 0;
  }
  set head(v: number) { this.control[0] = v; }
  get head() { return this.control[0]; }
  set count(v: number) { this.control[1] = v; }
  get count() { return this.control[1]; }
  // ========== 核心操作 ==========

  /**
   * 推入一个对象，自动覆盖最旧数据（循环）
   */
  push(item: T): void {
    for (const key of this.columnKeys) {
      this.views[key][this.head] = item[key];
    }
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * 获取索引处的数据（0 是最早，length-1 是最新）
   * @param index 从 0 到 length-1
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const actualIndex = this.getRealIndex(index);
    const result = {} as T;
    for (const key of this.columnKeys) {
      result[key] = this.views[key][actualIndex] as any;
    }
    return result;
  }

  /**
   * 更新索引处的数据
   * @param index 从 0 到 length-1
   * @param item 新数据
   */
  update(index: number, item: T): boolean {
    if (index < 0 || index >= this.count) return false;
    const actualIndex = this.getRealIndex(index);
    for (const key of this.columnKeys) {
      this.views[key][actualIndex] = item[key];
    }
    return true;
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /**
   * 当前数据长度
   */
  get length(): number {
    return this.count;
  }

  /**
   * 最大容量
   */
  get maxLength(): number {
    return this.capacity;
  }

  // ========== 导入/导出（Worker 间共享） ==========

  /**
   * 导出元数据，用于在 Worker 中重建
   */
  exportMeta(): {
    sab: SharedArrayBuffer;
    columnSpec: ColumnSpec<T>;
    capacity: number;
    controlBuffer: SharedArrayBuffer;
  } {
    return {
      sab: this.sab,
      columnSpec: this.columnTypes,
      capacity: this.capacity,
      controlBuffer: this.controlBuffer,
    };
  }


  /**
   * 转为普通数组（用于调试或输出）
   */
  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const item = this.get(i);
      if (item !== undefined) result.push(item);
    }
    return result;
  }

  /**
   * 获取最新元素（等价于 get(length - 1)）
   */
  latest(): T | undefined {
    return this.count > 0 ? this.get(this.count - 1) : undefined;
  }

  /**
   * 获取最旧元素（等价于 get(0)）
   */
  oldest(): T | undefined {
    return this.get(0);
  }

  /**
   * 迭代器支持
   */
  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = 0; i < this.count; i++) {
      const item = this.get(i);
      if (item) yield item;
    }
  }
}