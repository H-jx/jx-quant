# HQuant（Rust 版）

高性能量化交易核心库，面向策略研发与回测需求。特点：

- 固定容量环形缓冲区与列式存储，减少分配，缓存友好
- 完整指标集（MA/RSI/MACD/ATR/BOLL/VRI 以及 VWAP/OBV/MFI/Williams %R/CCI/ROC）
- 多周期聚合器，支持从细粒度到粗粒度的 K 线合成
- 策略系统支持闭包式策略、内置 MA 交叉 / RSI / BOLL 策略
- 现货与合约回测引擎，包含手续费、滑点、爆仓模拟与基础统计

## 目录结构

- `src/lib.rs`：框架入口与 `QuantEngine`
- `src/kline.rs`：K 线结构与序列管理
- `src/common/`：环形缓冲区实现
- `src/indicators/`：指标实现与动态指标支持
- `src/aggregator/`：多周期聚合器
- `src/strategy/`：策略接口与内置策略
- `src/backtest/`：回测引擎与统计

## 快速开始

在自己的 `Cargo.toml` 中引用本地路径：

```toml
hquant = { path = "packages/hquant-rust" }
```

示例：加载数据、添加指标和策略并运行回测。

```rust
use hquant::{
    QuantEngine, Bar, MAType, TimeFrame,
    BacktestConfig, Signal, strategy::FnStrategy,
};

fn main() {
    // 初始化
    let mut engine = QuantEngine::new(1_000);
    engine.add_ma("ma_fast", 5, MAType::SMA);
    engine.add_ma("ma_slow", 20, MAType::SMA);
    engine.setup_aggregator(TimeFrame::M15, &[TimeFrame::H1, TimeFrame::H4], 200);
    engine.setup_backtest(BacktestConfig::spot(10_000.0));

    // 添加策略（示例：MA 交叉 + 强度计算）
    engine.add_strategy(Box::new(FnStrategy::new("ma_cross", |ctx| {
        let fast = ctx.indicators.value("ma_fast")?;
        let slow = ctx.indicators.value("ma_slow")?;
        if fast > slow * 1.01 {
            Some(Signal::buy(0.8, "ma_cross_up", ctx.bar.timestamp))
        } else if fast < slow * 0.99 {
            Some(Signal::sell(0.8, "ma_cross_down", ctx.bar.timestamp))
        } else {
            None
        }
    })));

    // 追加 K 线数据
    let bars: Vec<Bar> = (0..200)
        .map(|i| {
            Bar::new(
                i * 15 * 60_000,
                100.0 + i as f64,
                102.0 + i as f64,
                98.0 + i as f64,
                101.0 + i as f64,
                1_000.0 + i as f64 * 10.0,
            )
        })
        .collect();
    engine.load_history(&bars);

    // 获取指标、聚合与回测结果
    println!("MA fast: {:?}", engine.indicator_value("ma_fast"));
    if let Some(agg) = engine.aggregator() {
        println!("H1 bars: {}", agg.output(TimeFrame::H1).unwrap().len());
    }
    if let Some(stats) = engine.backtest_result() {
        println!("Total trades: {}", stats.total_trades);
        println!("Return: {:.2}%", stats.return_pct);
        println!("Max drawdown: {:.2}%", stats.max_drawdown_pct);
    }
}
```

## 指标与策略

- 指标：`MA`（SMA/EMA/WMA）、`RSI`、`MACD`、`ATR`、`BOLL`、`VRI`，以及内置 `vwap`/`obv`/`mfi`/`williams_r`/`cci`/`roc` 等动态指标。
- 策略：实现 `Strategy` trait 或使用 `FnStrategy` 闭包；可复用内置 `MACrossStrategy`、`RSIStrategy`、`BOLLStrategy`。

## 构建与测试

```bash
cargo build
cargo test
```

## 开发提示

- `QuantEngine::append_bar` 用于流式追加新 K 线；`update_last_bar` 便于实时行情校正。
- 多周期聚合器仅接受基础周期的 K 线输入，并自动维护目标周期输出。
- 回测支持现货与合约（含杠杆、滑点、手续费、爆仓模拟）；通过 `BacktestConfig` 配置资金、杠杆与费率。

## 扩展新指标

1) 新建文件：在 `src/indicators/` 下实现 `Indicator` trait（参考 `ma.rs`/`rsi.rs`）。最低要求方法：`name`、`min_periods`、`push`、`update_last`、`value`/`result`、`is_ready`、`get`/`get_from_end`、`len`、`reset`。计算结果可用 `IndicatorValue::new` 或 `with_extra` 包装。
2) 注册模块：在 `src/indicators/mod.rs` 中 `pub mod your_indicator;`，并 `pub use` 导出类型。
3) 可选引擎封装：在 `src/lib.rs` 添加 `add_xxx` 便捷方法：

```rust
// src/lib.rs
pub fn add_my_indicator(&mut self, name: impl Into<String>, period: usize) {
    self.add_indicator(name, Box::new(MyIndicator::new(period, self.klines.capacity())));
}
```

4) 使用：创建 `QuantEngine`，调用 `add_my_indicator`，通过 `indicator_value("my_indicator")` 或 `indicator_result` 读取。

> 如果指标逻辑简单、仅需访问完整 K 线，可直接用 `DynamicIndicator`：`engine.add_dynamic_indicator("custom", min_periods, |klines| { /* 返回 Some(f64) */ });`
