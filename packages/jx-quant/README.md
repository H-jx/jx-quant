## Quant

Quant typescript 实现

数组用CircularQueue<T>


#### 示例1：添加 技术指标

```ts
import { BOLL } from "quant/indicator/boll";
import { RSI } from "quant/indicator/rsi";
import { Quant } from "quant";

const quant = new Quant();
quant.addIndicator('boll', new BOLL({ period: 14, stdDevFactor: 2 }));
quant.addIndicator('ma60', new MA({ period: 60 }));
```

#### 示例2：添加 添加交易策略
```ts
quant.addStrategy('rsi', (indicators, history: Bar[]) => {
  const rsi = indicators.get('rsi').getValue();
  if (rsi < 30) {
    return 'BUY';
  } else if (rsi > 70) {
    return 'SELL';
  }
});
```

#### 示例3：注册信号回调函数

```ts
quant.onSignal('rsi', (signal, bar: Bar) => {
  console.log(`Received signal: ${signal}`);
});
quant.onSignal('all', (signal, bar: Bar) => {
  console.log(`Received signal: ${signals}`);
});
```

#### 添加数据

```ts
quant.addData(data:  {
    open: number;
    close: number;
    low: number;
    high: number;
    volume: number;
    sell?: number;
    buy?: number;
    timestamp: number;
})
// 更新数据
quant.updateLastData(data:  {
    open: number;
    close: number;
    low: number;
    high: number;
    volume: number;
    sell?: number;
    buy?: number;
    timestamp: number;
})
```