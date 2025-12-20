# 高性能数据结构

## 概述

hquant 提供了多种高性能数据结构，专为量化交易场景优化，具有固定内存占用和高效的滑动窗口操作特性。

## CircularQueue - 循环队列

通用的循环缓冲队列，支持任意类型数据。

### 特点

- 固定大小，自动覆盖旧数据
- O(1) 时间复杂度的 push/pop 操作
- 支持迭代器
- 适用于历史数据管理

### API

```typescript
class CircularQueue<T> {
  constructor(maxSize: number);

  push(item: T): boolean;           // 添加元素
  shift(): T | undefined;           // 移除头部元素
  pop(): T | undefined;             // 移除尾部元素
  update(index: number, item: T): boolean;  // 更新指定位置
  clear(): void;                    // 清空队列
  size(): number;                   // 当前大小
  get(index: number): T;            // 按索引获取
  getLast(): T;                     // 获取最后一个
  [Symbol.iterator](): IterableIterator<T>; // 迭代器
}
```

### 使用示例

```typescript
import { CircularQueue } from 'hquant';

const queue = new CircularQueue<number>(5);

// 添加元素
queue.push(1);
queue.push(2);
queue.push(3);
queue.push(4);
queue.push(5);
console.log(queue.size()); // 5

// 超过容量时自动覆盖最旧的数据
queue.push(6);
console.log(queue.get(0)); // 2 (1 被覆盖)
console.log(queue.getLast()); // 6

// 遍历
for (const item of queue) {
  console.log(item); // 2, 3, 4, 5, 6
}

// 更新元素
queue.update(0, 20);
console.log(queue.get(0)); // 20
```

---

## TypedRingBuffer - 类型化环形缓冲

基于 TypedArray 的高性能数值缓冲区。

### 特点

- 使用 Float64Array 或 Int32Array
- 极低内存占用
- 高性能数值操作
- 适用于指标计算

### API

```typescript
class TypedRingBuffer {
  constructor(type: 'float' | 'int', capacity: number);

  push(value: number): boolean;
  shift(): number | undefined;
  pop(): number | undefined;
  update(index: number, value: number): boolean;
  get(index: number): number;
  getLast(): number;
  clear(): void;
  size(): number;
  [Symbol.iterator](): IterableIterator<number>;
}
```

### 使用示例

```typescript
import { TypedRingBuffer } from 'hquant';

// 创建浮点数缓冲区
const floatBuffer = new TypedRingBuffer('float', 1000);

// 创建整数缓冲区
const intBuffer = new TypedRingBuffer('int', 1000);

// 添加数据
for (let i = 0; i < 100; i++) {
  floatBuffer.push(Math.random() * 100);
}

// 计算平均值
let sum = 0;
for (const value of floatBuffer) {
  sum += value;
}
const avg = sum / floatBuffer.size();
```

---

## SharedObjectRingBuffer - 共享内存对象缓冲

基于 SharedArrayBuffer 的多线程共享缓冲区。

### 特点

- 主线程与 Worker 之间零拷贝共享
- 支持多列（多字段）对象存储
- 线程安全
- 适用于多线程量化计算

### 列类型

```typescript
type ColumnSpec<T> = {
  [K in keyof T]: 'float' | 'int';
};
```

### API

```typescript
class SharedObjectRingBuffer<T extends Record<string, number>> {
  constructor(columnSpec: ColumnSpec<T>, capacity: number);

  push(item: T): void;
  get(index: number): T | undefined;
  update(index: number, item: T): boolean;
  clear(): void;

  length: number;
  maxLength: number;

  // 导出/导入元数据 (用于传递给 Worker)
  exportMeta(): SharedBufferMeta;
  static importMeta<T>(meta: SharedBufferMeta): SharedObjectRingBuffer<T>;

  // 从数组创建
  static fromArray<T>(
    columnSpec: ColumnSpec<T>,
    capacity: number,
    arr: T[]
  ): SharedObjectRingBuffer<T>;

  toArray(): T[];
  latest(): T | undefined;
  oldest(): T | undefined;
  [Symbol.iterator](): IterableIterator<T>;
}
```

### 使用示例

```typescript
import { SharedObjectRingBuffer } from 'hquant';

// 定义数据结构
interface Kline {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  timestamp: number;
}

// 创建共享缓冲区
const buffer = new SharedObjectRingBuffer<Kline>(
  {
    open: 'float',
    close: 'float',
    high: 'float',
    low: 'float',
    volume: 'float',
    timestamp: 'int'
  },
  1000
);

// 添加数据
buffer.push({
  open: 100,
  close: 105,
  high: 106,
  low: 99,
  volume: 10000,
  timestamp: Date.now()
});

// 获取最新数据
const latest = buffer.latest();
console.log(latest);

// 传递给 Worker
const meta = buffer.exportMeta();
worker.postMessage({ type: 'init', meta });

// Worker 中导入
// const buffer = SharedObjectRingBuffer.importMeta(meta);
```

### 多线程示例

**主线程:**

```typescript
import { SharedObjectRingBuffer } from 'hquant';

const buffer = new SharedObjectRingBuffer<{ value: number }>(
  { value: 'float' },
  1000
);

const worker = new Worker('./worker.js');
worker.postMessage({ type: 'init', meta: buffer.exportMeta() });

// 主线程推送数据
setInterval(() => {
  buffer.push({ value: Math.random() * 100 });
}, 100);
```

**Worker:**

```typescript
import { SharedObjectRingBuffer } from 'hquant';

let buffer;

self.onmessage = (e) => {
  if (e.data.type === 'init') {
    buffer = SharedObjectRingBuffer.importMeta(e.data.meta);
  }
};

// Worker 可以读取主线程推送的数据
setInterval(() => {
  const latest = buffer.latest();
  console.log('Worker 读取:', latest);
}, 500);
```

---

## RingDataFrame - 循环数据框

类似 DataFrame 的列式存储结构。

### 特点

- 列式存储，行式接口
- 支持 float/int/string/date 多种类型
- 高效的列操作
- 适用于结构化数据分析

### 数据类型

```typescript
type DataFrameColumnType = 'float' | 'int' | 'string' | 'date';

type DataFrameSchema = {
  [columnName: string]: DataFrameColumnType;
};
```

### API

```typescript
class RingDataFrame<T extends DataFrameRow> {
  constructor(schema: DataFrameSchema, capacity: number);

  push(row: T): void;
  append(row: T): void;  // 同 push
  get(index: number): T | undefined;
  getRow(index: number): T | undefined;  // 同 get
  getCol(name: string): TypedRingBuffer | CircularQueue<any>;
  update(index: number, row: T): void;
  clear(): void;

  length: number;
  [Symbol.iterator](): IterableIterator<T>;
}
```

### 使用示例

```typescript
import { RingDataFrame } from 'hquant';

// 定义数据结构
interface TradeRecord {
  timestamp: Date;
  symbol: string;
  price: number;
  volume: number;
  side: string;
}

// 创建数据框
const df = new RingDataFrame<TradeRecord>(
  {
    timestamp: 'date',
    symbol: 'string',
    price: 'float',
    volume: 'int',
    side: 'string'
  },
  10000
);

// 添加数据
df.push({
  timestamp: new Date(),
  symbol: 'BTCUSDT',
  price: 50000.5,
  volume: 100,
  side: 'BUY'
});

// 获取行
const row = df.get(0);
console.log(row);

// 获取列
const priceCol = df.getCol('price');
for (const price of priceCol) {
  console.log(price);
}

// 遍历所有行
for (const record of df) {
  console.log(`${record.symbol}: ${record.price}`);
}
```

---

## AverageQueue - 平均值队列

专用于计算移动平均的队列。

### API

```typescript
class AverageQueue {
  constructor(maxLen: number);

  push(value: number): void;
  calc(): number;  // 返回平均值
}
```

### 使用示例

```typescript
import { AverageQueue } from 'hquant';

const avgQueue = new AverageQueue(20);

// 添加数据
for (let i = 0; i < 50; i++) {
  avgQueue.push(Math.random() * 100);
}

// 计算平均值
const average = avgQueue.calc();
console.log(`20 周期平均值: ${average}`);
```

---

## GoldenRatioCalculator - 黄金比例计算器

按黄金比例分割数值的计算器。

### API

```typescript
class GoldenRatioCalculator {
  constructor(ratio?: number);  // 默认 0.618

  calculate({ value, min }: { value: number; min: number }): number[];
}
```

### 使用示例

```typescript
import { GoldenRatioCalculator } from 'hquant';

const calculator = new GoldenRatioCalculator(0.618);

// 计算价格支撑位
const priceRange = { value: 50000, min: 45000 };
const levels = calculator.calculate(priceRange);

console.log('黄金分割位:');
levels.forEach((level, i) => {
  console.log(`Level ${i + 1}: ${level}`);
});
```

---

## 性能对比

| 数据结构 | 内存占用 | 插入速度 | 读取速度 | 适用场景 |
|----------|----------|----------|----------|----------|
| CircularQueue | 中 | 快 | 快 | 通用对象存储 |
| TypedRingBuffer | 低 | 极快 | 极快 | 纯数值计算 |
| SharedObjectRingBuffer | 中 | 快 | 快 | 多线程共享 |
| RingDataFrame | 中 | 快 | 快 | 结构化数据 |
| AverageQueue | 低 | 快 | 快 | 移动平均 |

## 选择指南

1. **存储 K 线历史数据** → `CircularQueue`
2. **存储指标计算结果** → `TypedRingBuffer`
3. **多线程数据共享** → `SharedObjectRingBuffer`
4. **存储交易记录等结构化数据** → `RingDataFrame`
5. **计算移动平均** → `AverageQueue`
