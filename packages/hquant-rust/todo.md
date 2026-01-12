# 量化框架技术方案

## 设计目标
- 在 Rust/TypeScript 混合环境下提供统一的量化能力，兼顾高频实时数据和聚合策略。
- 通过可复用的工具函数及数据结构，简化策略编写并提高可观测性。
- 保证数据一致性（SoA + RingBuffer）以及实时更新最后一个周期的能力以支持 websocket/kline feed。

## 核心能力
1. **指标库（Indicators）**：提供 `atr`、`boll`、`ma`、`macd`、`rsi`、`vri` 等指标；指标内部维护环形缓存，支持批量（历史）与追加（单点）更新。
2. **信号机制**：每个策略定义多指标组合逻辑；输入为最新的 K 线与指标快照
3. **实时更新能力**：支持对最后一个周期的更新（`update_last_bar`），确保在 websocket 推送 K 线未完成时仍能给出指标/信号结果；
4. **周期聚合**：内置 15m、4h、1d 聚合策略；提供从任意 timestamp 并支持从更细粒度数据上滚动汇总。
5. **最低周期与校验**：确保所有指标在 15m 数据上初始化，聚合周期必须是最低周期的整数倍；在运行时自动调整输入节奏以避免数据不一致。(也允许4h起步，15m就永远不触发周期计算)
6. **滑动窗口**：所有数据集合都要使用滑动窗口，通过RingBuffer
7. **历史数据回测**: 支持现货和合约回测(模拟爆仓，手续费)
## 数据模型
### 列式（SoA）内存模型

```text
open      : [f64, f64, ...]
high      : [f64, f64, ...]
low       : [f64, f64, ...]
close     : [f64, f64, ...]
volume    : [f64, f64, ...]
timestamp : [i64, i64, ...]

ma60      : [f64, f64, ...]   ← 指标动态新增（看情况可考虑与原始的bar分开，可保障bar的结构是干净不变更的）
rsi14     : [f64, f64, ...]
```

## 其他语言写入数据示例
feed.on("kline", (bar, isFinal) => {
  if (isFinal) quant.appendBar(bar);
  else quant.updateLastBar(bar);
});

for bar in history:
  append_bar(bar)

注册指标（声明式）
quant.addIndicator('ma60', new MA({ period: 60 }));
quant.addIndicator('boll', new BOLL({ period: 14, stdDevFactor: 2 }));
quant.addIndicator('rsi', new RSI({ period: 14 }));

动态指标（运行期）
quant.addDynamicIndicator("vwap", (bars) => {
  return calcVWAP(bars.close, bars.volume);
});


策略层（Strategy API
quant.addStrategy("trend", ({ indicators, bar }) => {
  if (indicators.get("ma_fast").value() >
      indicators.get("ma_slow").value()) {
    return { side: "BUY", reason: "ma_cross" };
  }
});

// 多语言高性通信（）
┌────────────┐     napi-rs      ┌──────────────┐
│  Node.js   │ ──────────────▶ │              │
│            │                 │              │
└────────────┘                 │              │
                               │  Rust Core   │
┌────────────┐     PyO3        │              │
│  Python    │ ──────────────▶ │              │
│            │                 │              │
└────────────┘                 └──────────────┘

