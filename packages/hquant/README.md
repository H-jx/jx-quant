
# hquant

TypeScript 量化指标与策略框架，支持高效滑动窗口、事件驱动、策略回测等。

## 特性
- 技术指标、交易策略、信号回调全流程支持
- 高性能 CircularQueue 实现，适合实时数据流
- 支持自定义数据结构和多种指标

## 安装
```bash
pnpm add hquant
```

## 快速开始

### 1. 创建 Quant 实例
```ts
import { Quant } from "hquant";
const quant = new Quant({ maxHistoryLength: 240 });
```

### 2. 添加技术指标
```ts
import { MA } from "hquant/lib/indicator/ma";
import { BOLL } from "hquant/lib/indicator/boll";
import { RSI } from "hquant/lib/indicator/rsi";

quant.addIndicator('ma60', new MA({ period: 60 }));
quant.addIndicator('boll', new BOLL({ period: 14, stdDevFactor: 2 }));
quant.addIndicator('rsi', new RSI({ period: 14 }));
```

### 3. 添加交易策略
```ts
quant.addStrategy('rsi', (indicators, bar) => {
  const rsi = indicators.get('rsi').getValue();
  if (rsi < 30) return 'BUY';
  if (rsi > 70) return 'SELL';
});
```

### 4. 注册信号回调
```ts
quant.onSignal('rsi', (signal, bar) => {
  console.log(`RSI信号: ${signal}`);
});
quant.onSignal('all', (signals, bar) => {
  console.log(`全部信号:`, signals);
});
```

### 5. 添加/更新数据
```ts
quant.addData({
  open: 100,
  close: 105,
  low: 99,
  high: 106,
  volume: 1000,
  timestamp: Date.now()
});
// 更新最后一条数据
quant.updateLastData({ ... });
```

### 6. 获取指标和信号
```ts
const ma = quant.getIndicator('ma60').getValue();
const rsiSignal = quant.getSignal('rsi');
```

### 7. 获取历史数据
```ts
const history = quant.history.toArray();
```

### 8. 移除指标/策略
```ts
quant.removeIndicator('ma60');
quant.removeStrategy('rsi');
```

### 9. 销毁 Quant 实例
```ts
quant.destroy();
```

## 进阶用法
- ### ObjectRingBuffer 内存共享示例（主线程与 Worker 间零拷贝）

```ts
import { SharedObjectRingBuffer } from "hquant/lib/common/ObjectRingBuffer";

// 1. 主线程创建共享队列
const buf = new SharedObjectRingBuffer(
  { price: Float64Array, amount: Float64Array },
  1000
);
buf.push({ price: 1.23, amount: 100 });
buf.push({ price: 1.25, amount: 120 });

// 2. 导出元数据，传递给 Worker
const meta = buf.exportMeta();
worker.postMessage(meta, [meta.sab, meta.controlBuffer]); // 共享内存，无拷贝

// 3. Worker 内重建队列，直接访问主线程数据
// Worker.js
import { SharedObjectRingBuffer } from "hquant/lib/common/ObjectRingBuffer";
self.onmessage = (e) => {
  const meta = e.data;
  const buf = SharedObjectRingBuffer.importMeta(meta);
  // 直接读取主线程写入的数据
  console.log(buf.get(0)); // { price: 1.23, amount: 100 }
  buf.push({ price: 1.30, amount: 150 }); // 也可写入，主线程可见
};
```


## 目录结构说明
- `src/indicator/`：内置技术指标（MA、BOLL、RSI、ATR等）
- `src/common/`：高性能数据结构（CircularQueue、ObjectRingBuffer等）
- `src/Quant.ts`：核心量化框架

## 贡献与反馈
如有问题或建议，欢迎提交 issue 或 PR。