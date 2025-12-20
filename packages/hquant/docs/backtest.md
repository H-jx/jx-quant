# 回测引擎

## 概述

hquant 提供了两种回测引擎：
- `Backtest` - 现货交易回测
- `FuturesBacktest` - 期货/合约交易回测

## Backtest - 现货回测

用于模拟现货交易的回测引擎。

### 交易费率

- 挂单费 (Maker): 0.044%
- 吃单费 (Taker): 0.044%

### 构造参数

```typescript
interface Options {
  balance: number;      // 初始余额 (USDT)
  volume: number;       // 初始持仓量
  tradeVolume?: number | ((price: number) => number);  // 每次交易量
}
```

### 数据格式

```typescript
interface Data {
  close: number;        // 收盘价
  signal?: Signal;      // 交易信号 ('BUY' | 'SELL' | null)
  timestamp?: number;   // 时间戳
  tradeVolume?: number; // 本次交易量（可选）
}
```

### 交易记录

```typescript
interface Trade {
  timestamp?: number;
  time?: string;
  price: number;
  volume: number;
  action: Signal;
  profit?: number;
}
```

### 回测结果

```typescript
interface BacktestResult {
  maxDrawdownRate: number;  // 最大回撤率
  profit: number;           // 总收益
  profitRate: number;       // 收益率
  buyCount: number;         // 买入次数
  sellCount: number;        // 卖出次数
}
```

### API

```typescript
class Backtest {
  constructor(options: Options);

  // 模拟单次交易
  mockTrade(data: Data & { tradeVolume?: number }): void;

  // 批量运行回测
  run(data: Data[]): BacktestResult;

  // 获取收益
  getProfit(): [profit: number, profitRate: number];

  // 获取详细结果
  getResult(): BacktestResult;

  // 获取所有交易记录
  getTrades(): Trade[];

  // 重置状态
  reset(): void;

  // 销毁实例
  destroy(): void;
}
```

### 使用示例

```typescript
import { Quant, MA, RSI, Backtest } from 'hquant';

// 准备历史数据
const historicalData = [
  { open: 100, close: 101, high: 102, low: 99, volume: 1000, timestamp: 1000 },
  { open: 101, close: 103, high: 104, low: 100, volume: 1200, timestamp: 2000 },
  // ... 更多数据
];

// 创建量化框架
const quant = new Quant();
quant.addIndicator('ma20', new MA({ period: 20 }));
quant.addIndicator('ma60', new MA({ period: 60 }));
quant.addIndicator('rsi', new RSI({ period: 14 }));

// 添加策略
quant.addStrategy('maStrategy', (indicators, bar) => {
  const ma20 = indicators.get('ma20').getValue();
  const ma60 = indicators.get('ma60').getValue();
  const rsi = indicators.get('rsi').getValue();

  if (ma20 > ma60 && rsi < 40) return 'BUY';
  if (ma20 < ma60 && rsi > 60) return 'SELL';
  return null;
});

// 创建回测引擎
const backtest = new Backtest({
  balance: 10000,   // 初始 10000 USDT
  volume: 0,        // 初始无持仓
  tradeVolume: 100  // 每次交易 100 单位
});

// 收集带信号的数据
const dataWithSignals = [];
quant.onSignal('maStrategy', (signal, bar) => {
  dataWithSignals.push({
    close: bar.close,
    signal,
    timestamp: bar.timestamp
  });
});

// 运行指标计算
historicalData.forEach(kline => quant.addData(kline));

// 运行回测
const result = backtest.run(dataWithSignals);

console.log('回测结果:');
console.log(`总收益: ${result.profit.toFixed(2)} USDT`);
console.log(`收益率: ${(result.profitRate * 100).toFixed(2)}%`);
console.log(`最大回撤: ${(result.maxDrawdownRate * 100).toFixed(2)}%`);
console.log(`买入次数: ${result.buyCount}`);
console.log(`卖出次数: ${result.sellCount}`);

// 查看交易记录
const trades = backtest.getTrades();
trades.forEach(trade => {
  console.log(`${trade.action} @ ${trade.price}, 数量: ${trade.volume}, 收益: ${trade.profit || 0}`);
});
```

### 动态交易量

可以根据价格动态计算交易量：

```typescript
const backtest = new Backtest({
  balance: 10000,
  volume: 0,
  tradeVolume: (price) => {
    // 每次使用 10% 资金交易
    return (10000 * 0.1) / price;
  }
});
```

---

## FuturesBacktest - 期货回测

用于模拟期货/合约交易的回测引擎。

### 数据格式

```typescript
// 账户余额
interface FuturesBalance {
  asset: string;              // 资产名称
  balance: numberInString;    // 总余额
  crossUnPnl: numberInString; // 未实现盈亏
  availableBalance: numberInString; // 可用余额
}

// 持仓信息
interface FuturesPosition {
  entryPrice: numberInString;     // 入场价格
  leverage?: numberInString;      // 杠杆倍数
  initialMargin?: numberInString; // 初始保证金
  liquidationPrice?: numberInString; // 清算价格
  markPrice: numberInString;      // 标记价格
  positionAmt: numberInString;    // 持仓数量
  positionSide: PositionSide;     // 持仓方向 ('LONG' | 'SHORT' | 'BOTH')
  symbol: string;                 // 交易对
  notional?: numberInString;      // 名义价值
  unRealizedProfit?: numberInString; // 未实现盈亏
}
```

### 回测结果

```typescript
interface FuturesBacktestResult {
  currentAsset: number;     // 当前资产
  profit: number;           // 总收益
  profitRate: number;       // 收益率
  maxDrawdownRate: number;  // 最大回撤率
  buyCount: number;         // 开仓次数
  sellCount: number;        // 平仓次数
}
```

### 使用示例

```typescript
import { FuturesBacktest } from 'hquant';

// 创建期货回测引擎
const backtest = new FuturesBacktest({
  initialBalance: 10000,
  leverage: 10,  // 10倍杠杆
});

// 运行回测
const result = backtest.run(futuresDataWithSignals);

console.log('期货回测结果:');
console.log(`当前资产: ${result.currentAsset.toFixed(2)} USDT`);
console.log(`总收益: ${result.profit.toFixed(2)} USDT`);
console.log(`收益率: ${(result.profitRate * 100).toFixed(2)}%`);
console.log(`最大回撤: ${(result.maxDrawdownRate * 100).toFixed(2)}%`);
```

---

## 完整回测示例

```typescript
import { Quant, MA, RSI, BOLL, ATR, Backtest } from 'hquant';
import historicalData from './btc_1h_2023.json';

// 1. 创建量化框架
const quant = new Quant({ maxHistoryLength: 500 });

// 2. 添加指标
quant.addIndicator('ma20', new MA({ period: 20 }));
quant.addIndicator('ma60', new MA({ period: 60 }));
quant.addIndicator('rsi', new RSI({ period: 14 }));
quant.addIndicator('boll', new BOLL({ period: 20, stdDevFactor: 2 }));
quant.addIndicator('atr', new ATR({ period: 14 }));

// 3. 添加复合策略
quant.addStrategy('composite', (indicators, bar) => {
  const ma20 = indicators.get('ma20').getValue();
  const ma60 = indicators.get('ma60').getValue();
  const rsi = indicators.get('rsi').getValue();
  const boll = indicators.get('boll').getValue();

  if (!ma20 || !ma60 || !rsi || !boll) return null;

  // 买入条件：趋势向上 + RSI 超卖 + 价格接近下轨
  const buyCondition =
    ma20 > ma60 &&
    rsi < 35 &&
    bar.close < boll.mid;

  // 卖出条件：趋势向下 + RSI 超买 + 价格接近上轨
  const sellCondition =
    ma20 < ma60 &&
    rsi > 65 &&
    bar.close > boll.mid;

  if (buyCondition) return 'BUY';
  if (sellCondition) return 'SELL';
  return null;
});

// 4. 收集信号
const signals = [];
quant.onSignal('composite', (signal, bar) => {
  if (signal) {
    signals.push({
      close: bar.close,
      signal,
      timestamp: bar.timestamp
    });
  }
});

// 5. 运行策略
console.log(`加载 ${historicalData.length} 条历史数据...`);
historicalData.forEach((kline, i) => {
  quant.addData(kline);
  if (i % 1000 === 0) {
    console.log(`处理进度: ${((i / historicalData.length) * 100).toFixed(1)}%`);
  }
});

console.log(`产生 ${signals.length} 个交易信号`);

// 6. 运行回测
const backtest = new Backtest({
  balance: 10000,
  volume: 0,
  tradeVolume: (price) => (10000 * 0.2) / price  // 每次使用 20% 资金
});

const result = backtest.run(signals);

// 7. 输出结果
console.log('\n========== 回测报告 ==========');
console.log(`初始资金: 10000 USDT`);
console.log(`最终收益: ${result.profit.toFixed(2)} USDT`);
console.log(`收益率: ${(result.profitRate * 100).toFixed(2)}%`);
console.log(`最大回撤: ${(result.maxDrawdownRate * 100).toFixed(2)}%`);
console.log(`买入次数: ${result.buyCount}`);
console.log(`卖出次数: ${result.sellCount}`);
console.log(`胜率: 待计算`);
console.log('================================\n');

// 8. 输出前 10 笔交易
const trades = backtest.getTrades();
console.log('前 10 笔交易:');
trades.slice(0, 10).forEach((trade, i) => {
  const time = trade.time || new Date(trade.timestamp).toISOString();
  console.log(`${i + 1}. [${time}] ${trade.action} @ ${trade.price.toFixed(2)}, 数量: ${trade.volume.toFixed(4)}`);
});

// 9. 清理
backtest.destroy();
quant.destroy();
```

---

## 回测注意事项

1. **手续费** - 回测已包含 0.044% 的交易手续费
2. **滑点** - 当前版本未模拟滑点，实际交易可能有差异
3. **资金管理** - 建议使用动态交易量函数进行风险控制
4. **最大回撤** - 关注最大回撤率，避免过度拟合
5. **样本外测试** - 建议使用部分数据训练，剩余数据验证
