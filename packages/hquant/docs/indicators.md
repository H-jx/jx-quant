# 技术指标

## 概述

hquant 提供了多种常用的技术分析指标，所有指标都实现了统一的 `Indicator` 接口。

## Indicator 接口

```typescript
interface Indicator<T extends (Kline | number) = Kline> {
  maxHistoryLength: number;  // 最大历史长度
  add(data: T): void;        // 添加数据并计算
  updateLast(data: T): void; // 更新最后一条数据
  getValue(index?: number): any; // 获取指标值，index -1 为最新
}
```

## MA - 移动平均线

简单移动平均线 (Simple Moving Average)。

### 构造参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| period | number | 必填 | 计算周期 |
| maxHistoryLength | number | 120 | 最大历史长度 |
| key | string | 'close' | 用于计算的 K 线字段 |

### 使用示例

```typescript
import { MA } from 'hquant';

// 创建 20 周期移动平均
const ma = new MA({ period: 20 });

// 添加数据
ma.add({ open: 100, close: 105, low: 99, high: 106, volume: 1000, timestamp: Date.now() });

// 获取当前值
const value = ma.getValue(); // 最新值
const prev = ma.getValue(-2); // 倒数第二个值

// 获取周期内总和
const sum = ma.getPeriodSum();
```

### 计算公式

```
SMA = Sum(Close, Period) / Period
```

---

## RSI - 相对强弱指数

相对强弱指数 (Relative Strength Index)。

### 构造参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| period | number | 必填 | 计算周期 |

### 使用示例

```typescript
import { RSI } from 'hquant';

const rsi = new RSI({ period: 14 });

// 添加数据
rsi.add(kline);

// 获取 RSI 值 (0-100)
const value = rsi.getValue();

// 超卖区域: RSI < 30
// 超买区域: RSI > 70
if (value < 30) {
  console.log('超卖信号');
} else if (value > 70) {
  console.log('超买信号');
}
```

### 计算公式

```
Change = Close - Open
AvgGain = SMA(PositiveChanges, Period)
AvgLoss = SMA(NegativeChanges, Period)
RS = AvgGain / AvgLoss
RSI = 100 - (100 / (1 + RS))
```

---

## BOLL - 布林带

布林带指标 (Bollinger Bands)。

### 构造参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| period | number | 必填 | 计算周期 |
| stdDevFactor | number | 2 | 标准差倍数 |
| maxHistoryLength | number | 120 | 最大历史长度 |

### 返回值类型

```typescript
interface BOLLResult {
  up: number;   // 上轨
  mid: number;  // 中轨 (移动平均)
  low: number;  // 下轨
}
```

### 使用示例

```typescript
import { BOLL } from 'hquant';

const boll = new BOLL({ period: 20, stdDevFactor: 2 });

// 添加数据
boll.add(kline);

// 获取布林带值
const { up, mid, low } = boll.getValue();

console.log(`上轨: ${up}`);
console.log(`中轨: ${mid}`);
console.log(`下轨: ${low}`);

// 判断价格位置
if (kline.close > up) {
  console.log('价格突破上轨');
} else if (kline.close < low) {
  console.log('价格跌破下轨');
}
```

### 计算公式

```
Mid = SMA(Close, Period)
StdDev = StandardDeviation(Close, Period)
Up = Mid + StdDevFactor × StdDev
Low = Mid - StdDevFactor × StdDev
```

---

## ATR - 真实波幅

平均真实波幅 (Average True Range)。

### 构造参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| period | number | 必填 | 计算周期 |
| maxHistoryLength | number | 120 | 最大历史长度 |

### 使用示例

```typescript
import { ATR } from 'hquant';

const atr = new ATR({ period: 14 });

// 添加数据
atr.add(kline);

// 获取 ATR 值 (波动率百分比)
const volatility = atr.getValue();

console.log(`当前波动率: ${(volatility * 100).toFixed(2)}%`);
```

### 计算公式

```
TrueRange = (Close - PreviousClose) / PreviousClose
ATR = SMA(TrueRange, Period)
```

---

## MACD - 指数平滑移动平均线

MACD 指标 (Moving Average Convergence Divergence)。

### 构造参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| shortTermPeriod | number | 12 | 短期 EMA 周期 |
| longTermPeriod | number | 26 | 长期 EMA 周期 |
| signalLinePeriod | number | 9 | 信号线周期 |
| maxHistoryLength | number | 120 | 最大历史长度 |

### 返回值类型

```typescript
interface MACDResult {
  macd: number;       // MACD 线 (DIF)
  signalLine: number; // 信号线 (DEA)
}
```

### 使用示例

```typescript
import { MACD } from 'hquant';

const macd = new MACD({
  shortTermPeriod: 12,
  longTermPeriod: 26,
  signalLinePeriod: 9
});

// 添加数据
macd.add(kline);

// 获取 MACD 值
const { macd: dif, signalLine: dea } = macd.getValue();
const histogram = dif - dea; // 柱状图

console.log(`DIF: ${dif}`);
console.log(`DEA: ${dea}`);
console.log(`柱状图: ${histogram}`);

// 金叉判断
if (dif > dea) {
  console.log('MACD 金叉');
}
```

### 计算公式

```
MACD Line (DIF) = MA(Close, ShortPeriod) - MA(Close, LongPeriod)
Signal Line (DEA) = MA(MACD Line, SignalPeriod)
Histogram = DIF - DEA
```

---

## VRI - 量比指标

量比指标 (Volume Ratio Index)。

### 构造参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| period | number | 必填 | 计算周期 |

### 使用示例

```typescript
import { VRI } from 'hquant';

const vri = new VRI({ period: 5 });

// 添加数据
vri.add(kline);

// 获取量比值
const ratio = vri.getValue();

// 量比 > 1 表示成交量放大
// 量比 < 1 表示成交量萎缩
if (ratio > 2) {
  console.log('成交量显著放大');
} else if (ratio < 0.5) {
  console.log('成交量显著萎缩');
}
```

### 计算公式

```
VRI = CurrentVolume / AverageVolume(Period)
```

---

## 自定义指标

你可以通过实现 `Indicator` 接口来创建自定义指标：

```typescript
import { Indicator, Kline, CircularQueue } from 'hquant';

class CustomIndicator implements Indicator {
  maxHistoryLength: number;
  private history: CircularQueue<number>;
  private period: number;

  constructor({ period, maxHistoryLength = 120 }) {
    this.period = period;
    this.maxHistoryLength = maxHistoryLength;
    this.history = new CircularQueue(maxHistoryLength);
  }

  add(data: Kline): void {
    // 自定义计算逻辑
    const value = (data.high + data.low + data.close) / 3; // 典型价格
    this.history.push(value);
  }

  updateLast(data: Kline): void {
    const value = (data.high + data.low + data.close) / 3;
    this.history.update(this.history.size() - 1, value);
  }

  getValue(index = -1): number | undefined {
    const size = this.history.size();
    if (size === 0) return undefined;

    const actualIndex = index < 0 ? size + index : index;
    return this.history.get(actualIndex);
  }
}

// 使用自定义指标
const quant = new Quant();
quant.addIndicator('custom', new CustomIndicator({ period: 14 }));
```

---

## 指标组合使用

```typescript
import { Quant, MA, RSI, BOLL, ATR, MACD, VRI } from 'hquant';

const quant = new Quant({ maxHistoryLength: 500 });

// 趋势指标
quant.addIndicator('ma20', new MA({ period: 20 }));
quant.addIndicator('ma60', new MA({ period: 60 }));
quant.addIndicator('macd', new MACD({}));

// 波动指标
quant.addIndicator('boll', new BOLL({ period: 20, stdDevFactor: 2 }));
quant.addIndicator('atr', new ATR({ period: 14 }));

// 动量指标
quant.addIndicator('rsi', new RSI({ period: 14 }));

// 成交量指标
quant.addIndicator('vri', new VRI({ period: 5 }));

// 综合策略
quant.addStrategy('multiIndicator', (indicators, bar) => {
  const ma20 = indicators.get('ma20').getValue();
  const ma60 = indicators.get('ma60').getValue();
  const rsi = indicators.get('rsi').getValue();
  const boll = indicators.get('boll').getValue();
  const vri = indicators.get('vri').getValue();

  // 趋势向上 + 超卖 + 价格在下轨附近 + 放量
  if (ma20 > ma60 && rsi < 30 && bar.close < boll.mid && vri > 1.5) {
    return 'BUY';
  }

  // 趋势向下 + 超买 + 价格在上轨附近
  if (ma20 < ma60 && rsi > 70 && bar.close > boll.mid) {
    return 'SELL';
  }

  return null;
});
```
