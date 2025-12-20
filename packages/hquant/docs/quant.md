# Quant 核心框架

## 概述

`Quant` 是 hquant 的核心类，负责管理指标、策略、历史数据和交易信号。它采用事件驱动架构，支持实时数据流处理。

## 创建实例

```typescript
import { Quant } from 'hquant';

const quant = new Quant({
  maxHistoryLength: 240  // 最大历史数据长度，默认 240
});
```

## 类定义

```typescript
class Quant<CustomData extends Kline = Kline> {
  // 历史数据队列
  history: CircularQueue<CustomData>;

  // 当前处理的数据
  currentData?: CustomData;

  constructor({ maxHistoryLength?: number });
}
```

## API 方法

### 指标管理

#### addIndicator(name, indicator)

添加一个技术指标。

```typescript
import { MA, RSI, BOLL } from 'hquant';

quant.addIndicator('ma20', new MA({ period: 20 }));
quant.addIndicator('rsi', new RSI({ period: 14 }));
quant.addIndicator('boll', new BOLL({ period: 20, stdDevFactor: 2 }));
```

#### removeIndicator(name)

移除指定名称的指标。

```typescript
quant.removeIndicator('ma20');
```

#### getIndicator(name)

获取指定名称的指标实例。

```typescript
const ma = quant.getIndicator('ma20');
const value = ma.getValue();
```

#### getIndicators()

获取所有指标的 Map。

```typescript
const indicators = quant.getIndicators();
indicators.forEach((indicator, name) => {
  console.log(`${name}: ${indicator.getValue()}`);
});
```

### 策略管理

#### addStrategy(name, strategy)

添加一个交易策略。策略函数接收指标 Map 和当前 K 线数据，返回交易信号。

```typescript
quant.addStrategy('goldenCross', (indicators, bar) => {
  const ma20 = indicators.get('ma20').getValue();
  const ma60 = indicators.get('ma60').getValue();

  if (ma20 > ma60) return 'BUY';
  if (ma20 < ma60) return 'SELL';
  return null;
});
```

#### removeStrategy(name)

移除指定名称的策略。

```typescript
quant.removeStrategy('goldenCross');
```

#### getStrategies()

获取所有策略的 Map。

```typescript
const strategies = quant.getStrategies();
```

### 数据处理

#### addData(data)

添加新的 K 线数据。这会触发所有指标的计算和所有策略的执行。

```typescript
quant.addData({
  open: 100,
  close: 105,
  low: 99,
  high: 106,
  volume: 1000,
  timestamp: Date.now()
});
```

#### updateLastData(data)

更新最后一条 K 线数据。用于实时更新当前未完成的 K 线。

```typescript
quant.updateLastData({
  open: 100,
  close: 106,  // 价格更新
  low: 99,
  high: 107,   // 新高
  volume: 1100,
  timestamp: Date.now()
});
```

### 信号事件

#### onSignal(name, callback)

注册信号回调函数。

```typescript
// 监听特定策略的信号
quant.onSignal('goldenCross', (signal, bar) => {
  if (signal === 'BUY') {
    console.log(`买入信号 @ ${bar.close}`);
  } else if (signal === 'SELL') {
    console.log(`卖出信号 @ ${bar.close}`);
  }
});

// 监听所有策略的信号
quant.onSignal('all', (signals, bar) => {
  // signals 是一个 Map<string, Signal>
  signals.forEach((signal, strategyName) => {
    if (signal) {
      console.log(`${strategyName}: ${signal}`);
    }
  });
});
```

#### getSignal(name)

获取指定策略的当前信号。

```typescript
const signal = quant.getSignal('goldenCross');
```

#### triggerSignal(name, signal)

手动触发信号事件。

```typescript
quant.triggerSignal('custom', 'BUY');
```

### 生命周期

#### destroy()

销毁实例，清理所有资源。

```typescript
quant.destroy();
```

### 静态方法

#### Quant.transformData(data)

将 KlineIn 格式转换为标准 Kline 格式。支持字符串数字自动转换。

```typescript
const rawData = [
  { open: '100.5', close: '105.2', low: '99.1', high: '106.3', volume: '1000', timestamp: 1234567890 }
];

const klines = Quant.transformData(rawData);
// [{ open: 100.5, close: 105.2, low: 99.1, high: 106.3, volume: 1000, timestamp: 1234567890 }]
```

## 工作流程

```
用户数据 (Kline)
    ↓
Quant.addData(data)
    ↓
    ├─→ 更新所有指标
    │   ├─→ MA.add() → 计算移动平均
    │   ├─→ RSI.add() → 计算相对强弱
    │   ├─→ BOLL.add() → 计算布林带
    │   └─→ ... 其他指标
    ↓
    └─→ 执行所有策略
        ├─→ Strategy(indicators) → 返回 Signal
        ↓
        └─→ 触发信号事件
            ├─→ emit(strategyName, signal, data)
            └─→ emit('all', allSignals, data)
```

## 自定义数据类型

支持扩展 K 线数据类型：

```typescript
interface MyKline extends Kline {
  customField: number;
  anotherField: string;
}

const quant = new Quant<MyKline>({ maxHistoryLength: 100 });

quant.addData({
  open: 100,
  close: 105,
  low: 99,
  high: 106,
  volume: 1000,
  timestamp: Date.now(),
  customField: 42,
  anotherField: 'hello'
});
```

## 完整示例

```typescript
import { Quant, MA, RSI, BOLL } from 'hquant';

// 创建实例
const quant = new Quant({ maxHistoryLength: 500 });

// 添加指标
quant.addIndicator('ma20', new MA({ period: 20 }));
quant.addIndicator('ma60', new MA({ period: 60 }));
quant.addIndicator('rsi', new RSI({ period: 14 }));
quant.addIndicator('boll', new BOLL({ period: 20, stdDevFactor: 2 }));

// 添加策略
quant.addStrategy('combined', (indicators, bar) => {
  const ma20 = indicators.get('ma20').getValue();
  const ma60 = indicators.get('ma60').getValue();
  const rsi = indicators.get('rsi').getValue();
  const boll = indicators.get('boll').getValue();

  // 多条件组合策略
  if (ma20 > ma60 && rsi < 30 && bar.close < boll.low) {
    return 'BUY';
  }
  if (ma20 < ma60 && rsi > 70 && bar.close > boll.up) {
    return 'SELL';
  }
  return null;
});

// 监听信号
quant.onSignal('combined', (signal, bar) => {
  if (signal) {
    console.log(`交易信号: ${signal} @ ${bar.close}`);
  }
});

// 模拟数据流
const mockDataStream = async () => {
  for (let i = 0; i < 1000; i++) {
    const price = 100 + Math.random() * 10;
    quant.addData({
      open: price,
      close: price + (Math.random() - 0.5) * 2,
      low: price - Math.random() * 2,
      high: price + Math.random() * 2,
      volume: Math.floor(Math.random() * 10000),
      timestamp: Date.now() + i * 60000
    });

    // 每100条数据输出一次指标状态
    if (i % 100 === 0) {
      console.log(`MA20: ${quant.getIndicator('ma20').getValue()}`);
      console.log(`RSI: ${quant.getIndicator('rsi').getValue()}`);
    }
  }
};

mockDataStream().then(() => {
  console.log(`历史数据条数: ${quant.history.size()}`);
  quant.destroy();
});
```
