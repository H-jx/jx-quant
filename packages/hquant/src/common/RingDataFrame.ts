
// 高性能 DataFrame 实现，支持列式存储和批量操作，基于 TypedRingBuffer
import { TypedRingBuffer } from './TypedRingBuffer';
import { CircularQueue } from './CircularQueue';

export type DataFrameSchema = { [key: string]: 'float' | 'int' | 'string' };
export type DataFrameRow = { [key: string]: number | string };

export class RingDataFrame<T extends DataFrameRow = DataFrameRow> {
  private columns: Map<string, TypedRingBuffer | CircularQueue<string>>;
  private capacity: number;

  constructor(schema: DataFrameSchema, capacity: number) {
    this.columns = new Map();
    this.capacity = capacity;
    for (const key in schema) {
      if (schema[key] === 'string') {
        this.columns.set(key, new CircularQueue<string>(capacity));
      } else {
        this.columns.set(key, new TypedRingBuffer(schema[key] as 'float' | 'int', capacity));
      }
    }
  }

  append(row: T) {
    for (const key of this.columns.keys()) {
      const col = this.columns.get(key)!;
      const value = row[key];
      if (col instanceof CircularQueue) {
        col.push(typeof value === 'string' ? value : String(value ?? ''));
      } else {
        col.push(typeof value === 'number' ? value : NaN);
      }
    }
    // 检查长度是否超限
    if (this.length > this.capacity) throw new Error('DataFrame is full');
  }

  getCol(name: string): TypedRingBuffer | CircularQueue<any> | undefined {
    return this.columns.get(name);
  }

  getRow(index: number): T {
    if (index < 0 || index >= this.length) throw new Error('Index out of bounds');
    const row: any = {};
    for (const [key, col] of this.columns) {
      row[key] = col.get(index);
    }
    return row as T;
  }

  get length(): number {
    // 取第一个列的长度（所有列长度一致）
    const firstCol = this.columns.values().next().value;
    if (!firstCol) return 0;
    return firstCol.size();
  }
  /**
   * 更新指定index的元素
   */
  update(index: number, row: T) {
    if (index < 0 || index >= this.length) throw new Error('Index out of bounds');
    for (const key of this.columns.keys()) {
      const col = this.columns.get(key)!;
      const value = row[key];
      if (col instanceof CircularQueue) {
        col.update(index, typeof value === 'string' ? value : String(value ?? ''));
      } else {
        col.update(index, typeof value === 'number' ? value : NaN);
      }
    }
  }
  toArray(): T[] {
    const arr: T[] = [];
    for (let i = 0; i < this.length; i++) {
      arr.push(this.getRow(i));
    }
    return arr;
  }

  clear() {
    for (const [, col] of this.columns) {
      col.clear();
    }
  }
}
