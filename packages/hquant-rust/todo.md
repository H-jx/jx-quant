# 量化框架技术方案

## 设计目标
- 在 Rust/TypeScript 混合环境下提供统一的量化能力，兼顾高频实时数据和聚合策略。
- 通过可复用的工具函数及数据结构，简化策略编写并提高可观测性。
- 保证数据一致性（SoA + RingBuffer）以及实时更新最后一个周期的能力以支持 websocket/kline feed。

## 核心能力
1. **指标库（Indicators）**：提供 `atr`、`boll`、`ma`、`macd`、`rsi`、`vri` 等指标；指标内部维护环形缓存，支持批量（历史）与追加（单点）更新。
2. **信号机制**：每个策略通过 `SignalBuilder` 定义多指标组合逻辑；输入为最新的 K 线与指标快照，通过 `Result<Signal, SignalError>` 返回结果。
3. **实时更新能力**：支持对最后一个周期的更新（`update_last_bar`），确保在 websocket 推送 K 线未完成时仍能给出指标/信号结果；底层用 timestamp + flag 判别是否属于当前未封闭的 bar。
4. **周期聚合**：内置 5m、15m、4h、1d 聚合策略；提供从任意 timestamp 计算窗口起止（比如 `period_bounds(period: Period, ts: i64)`），并支持从更细粒度数据上滚动汇总。
5. **最低周期与校验**：确保所有指标在 5m 数据上初始化，聚合周期必须是最低周期的整数倍；在运行时自动调整输入节奏以避免数据不一致。

## 数据模型
- `KLinePoint { open, high, low, close, volume, timestamp, cnt }`（可选成交笔数）
- `KLineWindow { bars: RingBuffer<KLinePoint>, last_updated: i64, period: Period }`
- `IndicatorProfile { name, lookback, requires: Vec<String>, state: Any }`（策略在初始化时注册相关指标）

## 架构层次
1. **数据层（Data Feed）**
   - 接收原始 5m（或更高频）K 线。
   - 提供 `feed.append(point)`、`feed.update(point)`，内部维护多周期聚合器。
2. **聚合层（Aggregator）**
   - 将基础周期数据累加至 15m/4h/1d，支持 ONESHOT（当前 K 线）与 FINAL（封闭 K 线）两种输出事件。
   - 聚合规则：以 5m 为基础单位，按 timestamp 归属分组，使用 SoA 结构更新 `opens/closes` 等数组。
3. **指标层（Indicator Engine）**
   - 每个指标实现 `Indicator` trait/接口，包含 `update(&mut self, value: &KLinePoint)`, `value(&self) -> f64`。
   - 支持一次性填充历史 `feed.fill(history)`，并在实时阶段仅传入 `update_last_bar` 或 `append_bar`。
4. **策略层（Quant Strategy）**
   - `StrategyContext` 提供 `current_bar`, `indicator(name)`, `signal_logger` 等。
   - 策略通过 `Quant#add_strategy(name, options, ctx => { ... })` 注册。
5. **信号分发**
   - `SignalBus` 按策略将 `Signal { name, side, reason, timestamp }` 广播给订阅者（比如仓位管理、日志、webhook）。

## 工具方法
- `period_bounds(period, timestamp)` → `(start_ts, end_ts)`
- `align_to_base(period, ts)` → `ts` 对齐到 5m 基准
- `aggregate<K>(period, points)` → 聚合函数，用逗号 `max(high)`、`min(low)`、`sum(volume)` 等规则
- `is_bar_complete(period, current_ts, bar_ts)` 判断当前时间是否已经超出周期，决定是否封闭 bar
- `parse_symbol(symbol)` 返回 `{ base, quote, market_type }`

## 实时使用示例
```ts
const quant = new Quant({ basePeriod: '5m', maxHistory: 500 });
quant.addStrategy('trend-15m', ({ indicators, bar }) => {
  const fastMA = indicators.get('ma-fast').value();
  const slowMA = indicators.get('ma-slow').value();
  if (fastMA > slowMA && bar.close > indicators.get('atr').value()) {
    return { side: 'BUY', reason: 'golden-cross' };
  }
  return null;
});

feed.on('kline', (point, isFinal) => {
  if (isFinal) quant.appendBar(point); else quant.updateLastBar(point);
});
```

## 验证与测试
- 使用 `backtest` 模块通过静态 csv 数据验证聚合/指标结果一致性（`expected.ma` vs `computed.ma`）。
- 引入 `property-based testing` 检查 `aggregate` 在不同比例周期输入下的 idempotence。
- 增加 `integration` 测试：模拟 WebSocket 更新最后一个 bar，确保信号仍旧准确。

## 下一步
1. 明确 `Indicator` trait 的具体方法及状态序列化格式。
2. 在 `hquant` + `hquant-rust` 之间协商接口，决定哪些逻辑放在 Rust（如指标运算）中。
3. 为 5m/15m/4h/1d 构建独立的 `RingDataFrame`，并评估是否可复用现有 `SharedObjectRingBuffer`。设计一个量化框架、工具方法

核心功能
1. 内置indicators(atr,boll,ma,macd,rsi,vri)
2. 支持信号触发
3. 支持实时信号（可以udpate，更新最后一个周期的数据）
4. 支持 聚合周期(15m,4h,1d)，获取周期时间等工具方法
5. 最低周期(5m)

数据
[{open, close, high, low, volume, timestamp}, {open, close, high, low, ...}, ...]


用法案例：
