# API 参考

## 导出总览

```typescript
// 核心类
export { Quant } from './Quant';
export { Backtest } from './Backtest';
export { FuturesBacktest } from './FuturesBacktest';

// 数据结构
export { CircularQueue } from './common/CircularQueue';
export { AverageQueue } from './common/AverageQueue';
export { TypedRingBuffer } from './common/TypedRingBuffer';
export { SharedObjectRingBuffer } from './common/SharedObjectRingBuffer';
export { RingDataFrame } from './common/RingDataFrame';
export { GoldenRatioCalculator } from './common/GoldenRatioCalculator';

// 技术指标
export { MA } from './indicator/ma';
export { RSI } from './indicator/rsi';
export { BOLL } from './indicator/boll';
export { ATR } from './indicator/atr';
export { MACD } from './indicator/macd';
export { VRI } from './indicator/vri';

// 类型和接口
export * from './interface';

// 工具函数
export { keepDecimalFixed, autoToFixed } from './util';
```

---

## 类型定义

### 基础类型

```typescript
// 交易信号
type Signal = 'BUY' | 'SELL' | null | undefined;

// 持仓方向
type PositionSide = 'LONG' | 'SHORT' | 'BOTH';

// 订单方向
type OrderSide = 'BUY' | 'SELL';

// 字符串或数字
type numberInString = number | string;
```

### K 线数据

```typescript
// 标准 K 线格式
interface Kline {
  open: number;       // 开盘价
  close: number;      // 收盘价
  low: number;        // 最低价
  high: number;       // 最高价
  volume: number;     // 成交量
  sell?: number;      // 卖出量（可选）
  buy?: number;       // 买入量（可选）
  timestamp: number;  // 时间戳
}

// K 线输入格式（支持字符串数字）
interface KlineIn {
  open: number | string;
  close: number | string;
  low: number | string;
  high: number | string;
  volume: number | string;
  sell?: number | string;
  buy?: number | string;
  timestamp: number;
}
```

### 指标接口

```typescript
interface Indicator<T extends (Kline | number) = Kline> {
  maxHistoryLength: number;       // 最大历史长度
  _quant?: any;                   // 内部引用（框架使用）
  add(data: T): void;             // 添加数据并计算
  updateLast(data: T): void;      // 更新最后一条数据
  getValue(index?: number): any;  // 获取指标值
}
```

### 策略函数

```typescript
type Strategy<T extends Kline> = (
  indicators: Map<string, Indicator>,
  bar: T
) => Signal;
```

---

## Quant 类

### 构造函数

```typescript
new Quant<CustomData extends Kline = Kline>({
  maxHistoryLength?: number  // 默认 240
})
```

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| history | CircularQueue<CustomData> | 历史数据队列 |
| currentData | CustomData \| undefined | 当前处理的数据 |

### 方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| addIndicator | (name: string, indicator: Indicator) | void | 添加指标 |
| removeIndicator | (name: string) | void | 移除指标 |
| getIndicator | (name: string) | Indicator \| undefined | 获取指标 |
| getIndicators | () | Map<string, Indicator> | 获取所有指标 |
| addStrategy | (name: string, strategy: Strategy) | void | 添加策略 |
| removeStrategy | (name: string) | void | 移除策略 |
| getStrategies | () | Map<string, Strategy> | 获取所有策略 |
| addData | (data: CustomData) | void | 添加数据 |
| updateLastData | (data: CustomData) | void | 更新最后数据 |
| getSignal | (name: string) | Signal | 获取信号 |
| onSignal | (name: string \| 'all', callback: Function) | void | 监听信号 |
| triggerSignal | (name: string, signal: Signal) | void | 触发信号 |
| destroy | () | void | 销毁实例 |

### 静态方法

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| transformData | (data: KlineIn[]) | Kline[] | 数据格式转换 |

---

## 指标类

### MA (移动平均线)

```typescript
new MA({
  period: number,              // 计算周期（必填）
  maxHistoryLength?: number,   // 最大历史长度，默认 120
  key?: string                 // K 线字段，默认 'close'
})
```

| 方法 | 返回值 | 说明 |
|------|--------|------|
| add(data: Kline \| number) | number | 添加数据 |
| updateLast(data: Kline \| number) | number | 更新最后数据 |
| getValue(index?: number) | number | 获取值 |
| getPeriodSum() | number | 获取周期内总和 |

### RSI (相对强弱指数)

```typescript
new RSI({
  period: number  // 计算周期（必填）
})
```

| 方法 | 返回值 | 说明 |
|------|--------|------|
| add(data: Kline) | void | 添加数据 |
| updateLast(data: Kline) | void | 更新最后数据 |
| getValue(index?: number) | number | 获取 RSI 值 (0-100) |

### BOLL (布林带)

```typescript
new BOLL({
  period: number,              // 计算周期（必填）
  stdDevFactor?: number,       // 标准差倍数，默认 2
  maxHistoryLength?: number    // 最大历史长度，默认 120
})
```

| 方法 | 返回值 | 说明 |
|------|--------|------|
| add(data: Kline) | void | 添加数据 |
| updateLast(data: Kline) | void | 更新最后数据 |
| getValue(index?: number) | { up, mid, low } \| undefined | 获取布林带值 |

### ATR (真实波幅)

```typescript
new ATR({
  period: number,              // 计算周期（必填）
  maxHistoryLength?: number    // 最大历史长度，默认 120
})
```

| 方法 | 返回值 | 说明 |
|------|--------|------|
| add(data: Kline) | void | 添加数据 |
| updateLast(data: Kline) | void | 更新最后数据 |
| getValue(index?: number) | number | 获取 ATR 值 |

### MACD

```typescript
new MACD({
  shortTermPeriod?: number,    // 短期周期，默认 12
  longTermPeriod?: number,     // 长期周期，默认 26
  signalLinePeriod?: number,   // 信号线周期，默认 9
  maxHistoryLength?: number    // 最大历史长度，默认 120
})
```

| 方法 | 返回值 | 说明 |
|------|--------|------|
| add(data: Kline) | void | 添加数据 |
| updateLast(data: Kline) | void | 更新最后数据 |
| getValue(index?: number) | { macd, signalLine } | 获取 MACD 值 |

### VRI (量比指标)

```typescript
new VRI({
  period: number  // 计算周期（必填）
})
```

| 方法 | 返回值 | 说明 |
|------|--------|------|
| add(data: Kline) | void | 添加数据 |
| updateLast(data: Kline) | void | 更新最后数据 |
| getValue(index?: number) | number | 获取量比值 |

---

## 数据结构

### CircularQueue<T>

```typescript
new CircularQueue<T>(maxSize: number)
```

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| push | (item: T) | boolean | 添加元素 |
| shift | () | T \| undefined | 移除头部 |
| pop | () | T \| undefined | 移除尾部 |
| update | (index: number, item: T) | boolean | 更新元素 |
| clear | () | void | 清空 |
| size | () | number | 获取大小 |
| get | (index: number) | T | 获取元素 |
| getLast | () | T | 获取最后元素 |

### TypedRingBuffer

```typescript
new TypedRingBuffer(type: 'float' | 'int', capacity: number)
```

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| push | (value: number) | boolean | 添加值 |
| shift | () | number \| undefined | 移除头部 |
| pop | () | number \| undefined | 移除尾部 |
| update | (index: number, value: number) | boolean | 更新值 |
| get | (index: number) | number | 获取值 |
| getLast | () | number | 获取最后值 |
| clear | () | void | 清空 |
| size | () | number | 获取大小 |

### SharedObjectRingBuffer<T>

```typescript
new SharedObjectRingBuffer<T extends Record<string, number>>(
  columnSpec: { [K in keyof T]: 'float' | 'int' },
  capacity: number
)
```

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| push | (item: T) | void | 添加对象 |
| get | (index: number) | T \| undefined | 获取对象 |
| update | (index: number, item: T) | boolean | 更新对象 |
| clear | () | void | 清空 |
| toArray | () | T[] | 转为数组 |
| latest | () | T \| undefined | 获取最新 |
| oldest | () | T \| undefined | 获取最旧 |
| exportMeta | () | SharedBufferMeta | 导出元数据 |

静态方法:
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| importMeta | (meta: SharedBufferMeta) | SharedObjectRingBuffer | 从元数据导入 |
| fromArray | (columnSpec, capacity, arr) | SharedObjectRingBuffer | 从数组创建 |

### RingDataFrame<T>

```typescript
new RingDataFrame<T extends DataFrameRow>(
  schema: { [name: string]: 'float' | 'int' | 'string' | 'date' },
  capacity: number
)
```

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| push | (row: T) | void | 添加行 |
| append | (row: T) | void | 添加行 |
| get | (index: number) | T \| undefined | 获取行 |
| getRow | (index: number) | T \| undefined | 获取行 |
| getCol | (name: string) | TypedRingBuffer \| CircularQueue | 获取列 |
| update | (index: number, row: T) | void | 更新行 |
| clear | () | void | 清空 |

### AverageQueue

```typescript
new AverageQueue(maxLen: number)
```

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| push | (value: number) | void | 添加值 |
| calc | () | number | 计算平均值 |

### GoldenRatioCalculator

```typescript
new GoldenRatioCalculator(ratio?: number)  // 默认 0.618
```

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| calculate | ({ value, min }) | number[] | 计算黄金分割 |

---

## 回测引擎

### Backtest

```typescript
new Backtest({
  balance: number,                                    // 初始余额
  volume: number,                                     // 初始持仓
  tradeVolume?: number | ((price: number) => number)  // 交易量
})
```

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| mockTrade | (data: Data) | void | 模拟交易 |
| run | (data: Data[]) | BacktestResult | 批量回测 |
| getProfit | () | [number, number] | 获取收益 |
| getResult | () | BacktestResult | 获取结果 |
| getTrades | () | Trade[] | 获取交易记录 |
| reset | () | void | 重置 |
| destroy | () | void | 销毁 |

---

## 工具函数

### keepDecimalFixed

保留指定小数位数。

```typescript
function keepDecimalFixed(
  value: number | string,
  digits?: number  // 默认 2
): number
```

### autoToFixed

根据有效小数值自动保留小数位数。

```typescript
function autoToFixed(value: number | string): number
```
