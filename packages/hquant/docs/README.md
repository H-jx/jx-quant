# hquant - 量化交易指标与策略框架

## 概述

hquant 是一个 TypeScript 量化交易框架，专为高效的实时数据流处理和技术分析而设计。框架提供了滑动窗口计算、事件驱动的策略执行、以及高性能循环缓冲区实现。

**版本**: 0.1.10
**许可证**: GPL-3.0-or-later

## 特性

- 🚀 **事件驱动** - 基于 EventEmitter，信号自动触发回调
- 📊 **流式处理** - 支持实时数据流，逐条数据进来即计算
- 💾 **内存高效** - 使用 TypedArray 和循环缓冲，固定内存占用
- 📈 **多指标** - 内置 7+ 技术指标，易于扩展
- 🎯 **策略框架** - 灵活的策略函数，可访问所有指标状态
- 🔄 **回测支持** - 包含现货和期货两套回测引擎
- 🧵 **Worker 兼容** - SharedObjectRingBuffer 支持主线程与 Worker 零拷贝共享
- 📝 **TypeScript** - 完整的类型定义，开发友好

## 安装

```bash
npm install hquant
# 或
pnpm add hquant
```

## 快速开始

```typescript
import { Quant, MA, BOLL, RSI } from 'hquant';

// 1. 创建框架实例
const quant = new Quant({ maxHistoryLength: 240 });

// 2. 添加指标
quant.addIndicator('ma20', new MA({ period: 20 }));
quant.addIndicator('ma60', new MA({ period: 60 }));
quant.addIndicator('boll', new BOLL({ period: 14, stdDevFactor: 2 }));
quant.addIndicator('rsi', new RSI({ period: 14 }));

// 3. 添加策略
quant.addStrategy('rsiStrategy', (indicators, bar) => {
  const rsi = indicators.get('rsi').getValue();
  if (rsi < 30) return 'BUY';
  if (rsi > 70) return 'SELL';
  return null;
});

// 4. 注册信号回调
quant.onSignal('rsiStrategy', (signal, bar) => {
  console.log(`RSI 信号: ${signal} 在价格 ${bar.close}`);
});

quant.onSignal('all', (signals, bar) => {
  console.log('所有信号:', signals);
});

// 5. 处理数据流
quant.addData({
  open: 100,
  close: 105,
  low: 99,
  high: 106,
  volume: 1000,
  timestamp: Date.now()
});

// 6. 获取指标值
const ma20 = quant.getIndicator('ma20').getValue();
const boll = quant.getIndicator('boll').getValue();

// 7. 获取历史数据
const history = quant.history.toArray();

// 8. 清理资源
quant.destroy();
```

## 目录结构

```
hquant/
├── src/
│   ├── index.ts                  # 主入口
│   ├── interface.ts              # 类型定义
│   ├── util.ts                   # 工具函数
│   ├── Quant.ts                  # 核心量化框架
│   ├── Backtest.ts               # 现货回测引擎
│   ├── FuturesBacktest.ts        # 期货回测引擎
│   ├── common/                   # 通用数据结构
│   │   ├── CircularQueue.ts      # 循环队列
│   │   ├── AverageQueue.ts       # 平均值队列
│   │   ├── TypedRingBuffer.ts    # TypedArray 循环缓冲区
│   │   ├── SharedObjectRingBuffer.ts  # 共享内存对象缓冲区
│   │   ├── RingDataFrame.ts      # 循环 DataFrame
│   │   └── GoldenRatioCalculator.ts   # 黄金比例计算器
│   └── indicator/                # 技术指标
│       ├── ma.ts                 # 移动平均线
│       ├── rsi.ts                # 相对强弱指数
│       ├── boll.ts               # 布林带
│       ├── atr.ts                # 真实波幅
│       ├── macd.ts               # MACD 指标
│       └── vri.ts                # 量比指标
├── lib/                          # 编译输出目录
└── __test__/                     # 测试文件
```

## 核心模块

详细文档请查看：

- [Quant 核心框架](./quant.md)
- [技术指标](./indicators.md)
- [数据结构](./data-structures.md)
- [回测引擎](./backtest.md)
- [API 参考](./api-reference.md)
