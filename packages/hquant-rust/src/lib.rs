//! HQuant - 高性能量化交易框架
//!
//! 特性:
//! - 高性能环形缓冲区，避免动态内存分配
//! - SoA (Struct of Arrays) 列式存储，缓存友好
//! - 完整的技术指标库 (MA/RSI/MACD/ATR/BOLL/VRI)
//! - 多周期聚合器 (15m/4h/1d)
//! - 灵活的策略系统
//! - 现货/合约回测引擎（支持爆仓模拟）

pub mod common;
pub mod kline;
pub mod indicators;
pub mod aggregator;
pub mod strategy;
pub mod backtest;

pub use common::{RingBuffer, F64RingBuffer};
pub use kline::{Bar, KlineSeries};
pub use indicators::{
    Indicator, IndicatorValue, PriceType,
    MA, MAType, RSI, MACD, ATR, BOLL, VRI,
    DynamicIndicator, vwap, obv, mfi, williams_r, cci, roc,
};
pub use aggregator::{TimeFrame, Aggregator, MultiTimeFrameAggregator};
pub use strategy::{Signal, Side, Strategy, StrategyContext, IndicatorSnapshot};
pub use backtest::{
    BacktestEngine, BacktestConfig, BacktestStats,
    MarketType, Position, PositionSide, Trade,
};

use std::collections::HashMap;

/// 量化引擎 - 核心入口
pub struct QuantEngine {
    /// K线数据
    klines: KlineSeries,
    /// 指标集合
    indicators: HashMap<String, Box<dyn Indicator>>,
    /// 策略集合
    strategies: Vec<Box<dyn Strategy>>,
    /// 多周期聚合器
    aggregator: Option<MultiTimeFrameAggregator>,
    /// 回测引擎
    backtest: Option<BacktestEngine>,
}

impl QuantEngine {
    /// 创建新的量化引擎
    pub fn new(capacity: usize) -> Self {
        Self {
            klines: KlineSeries::new(capacity),
            indicators: HashMap::new(),
            strategies: Vec::new(),
            aggregator: None,
            backtest: None,
        }
    }

    /// 添加指标
    pub fn add_indicator(&mut self, name: impl Into<String>, indicator: Box<dyn Indicator>) {
        self.indicators.insert(name.into(), indicator);
    }

    /// 添加 MA 指标
    pub fn add_ma(&mut self, name: impl Into<String>, period: usize, ma_type: MAType) {
        self.add_indicator(name, Box::new(MA::new(period, ma_type)));
    }

    /// 添加 RSI 指标
    pub fn add_rsi(&mut self, name: impl Into<String>, period: usize) {
        self.add_indicator(name, Box::new(RSI::new(period)));
    }

    /// 添加 MACD 指标
    pub fn add_macd(&mut self, name: impl Into<String>, fast: usize, slow: usize, signal: usize) {
        self.add_indicator(name, Box::new(MACD::new(fast, slow, signal)));
    }

    /// 添加 ATR 指标
    pub fn add_atr(&mut self, name: impl Into<String>, period: usize) {
        self.add_indicator(name, Box::new(ATR::new(period)));
    }

    /// 添加 BOLL 指标
    pub fn add_boll(&mut self, name: impl Into<String>, period: usize, std_dev_factor: f64) {
        self.add_indicator(name, Box::new(BOLL::new(period, std_dev_factor)));
    }

    /// 添加 VRI 指标
    pub fn add_vri(&mut self, name: impl Into<String>, period: usize) {
        self.add_indicator(name, Box::new(VRI::new(period)));
    }

    /// 添加动态指标（运行时自定义计算函数）
    ///
    /// # 示例
    /// ```ignore
    /// engine.add_dynamic_indicator("vwap", 1, |klines| {
    ///     // 自定义计算逻辑
    ///     Some(calculated_value)
    /// });
    /// ```
    pub fn add_dynamic_indicator<F>(
        &mut self,
        name: impl Into<String>,
        min_periods: usize,
        calc_fn: F,
    ) where
        F: Fn(&KlineSeries) -> Option<f64> + Send + Sync + 'static,
    {
        let name_str = name.into();
        let capacity = self.klines.capacity();
        self.add_indicator(
            name_str.clone(),
            Box::new(DynamicIndicator::new(name_str, min_periods, capacity, calc_fn)),
        );
    }

    /// 添加预定义的 VWAP 指标
    pub fn add_vwap(&mut self, name: impl Into<String>) {
        let capacity = self.klines.capacity();
        self.add_indicator(name, Box::new(vwap(capacity)));
    }

    /// 添加预定义的 OBV 指标
    pub fn add_obv(&mut self, name: impl Into<String>) {
        let capacity = self.klines.capacity();
        self.add_indicator(name, Box::new(obv(capacity)));
    }

    /// 添加预定义的 MFI 指标
    pub fn add_mfi(&mut self, name: impl Into<String>, period: usize) {
        let capacity = self.klines.capacity();
        self.add_indicator(name, Box::new(mfi(period, capacity)));
    }

    /// 添加预定义的 Williams %R 指标
    pub fn add_williams_r(&mut self, name: impl Into<String>, period: usize) {
        let capacity = self.klines.capacity();
        self.add_indicator(name, Box::new(williams_r(period, capacity)));
    }

    /// 添加预定义的 CCI 指标
    pub fn add_cci(&mut self, name: impl Into<String>, period: usize) {
        let capacity = self.klines.capacity();
        self.add_indicator(name, Box::new(cci(period, capacity)));
    }

    /// 添加预定义的 ROC 指标
    pub fn add_roc(&mut self, name: impl Into<String>, period: usize) {
        let capacity = self.klines.capacity();
        self.add_indicator(name, Box::new(roc(period, capacity)));
    }

    /// 添加策略
    pub fn add_strategy(&mut self, strategy: Box<dyn Strategy>) {
        self.strategies.push(strategy);
    }

    /// 设置多周期聚合
    pub fn setup_aggregator(&mut self, base_tf: TimeFrame, target_tfs: &[TimeFrame], capacity: usize) {
        self.aggregator = Some(MultiTimeFrameAggregator::new(base_tf, target_tfs, capacity));
    }

    /// 设置回测引擎
    pub fn setup_backtest(&mut self, config: BacktestConfig) {
        self.backtest = Some(BacktestEngine::new(config));
    }

    /// 追加K线数据
    pub fn append_bar(&mut self, bar: &Bar) -> Vec<Signal> {
        // 更新K线
        self.klines.append(bar);

        // 更新所有指标
        for indicator in self.indicators.values_mut() {
            indicator.push(bar);
        }

        // 更新聚合器
        if let Some(agg) = &mut self.aggregator {
            agg.push(bar);
        }

        // 评估策略
        let signals = self.evaluate_strategies(bar);

        // 回测处理
        if let Some(bt) = &mut self.backtest {
            for signal in &signals {
                bt.process_signal(signal, bar);
            }
        }

        signals
    }

    /// 更新最后一根K线（实时数据）
    pub fn update_last_bar(&mut self, bar: &Bar) {
        self.klines.update_last(bar);

        for indicator in self.indicators.values_mut() {
            indicator.update_last(bar);
        }

        if let Some(agg) = &mut self.aggregator {
            agg.update_last(bar);
        }
    }

    /// 批量加载历史数据
    pub fn load_history(&mut self, bars: &[Bar]) -> Vec<Signal> {
        let mut all_signals = Vec::new();
        for bar in bars {
            let signals = self.append_bar(bar);
            all_signals.extend(signals);
        }
        all_signals
    }

    /// 评估所有策略
    fn evaluate_strategies(&self, bar: &Bar) -> Vec<Signal> {
        let snapshot = IndicatorSnapshot::new(&self.indicators);
        let ctx = StrategyContext {
            bar,
            indicators: snapshot,
        };

        self.strategies
            .iter()
            .filter_map(|s| s.evaluate(&ctx))
            .collect()
    }

    /// 获取指标值
    pub fn indicator_value(&self, name: &str) -> Option<f64> {
        self.indicators.get(name).and_then(|i| i.value())
    }

    /// 获取指标结果
    pub fn indicator_result(&self, name: &str) -> Option<IndicatorValue> {
        self.indicators.get(name).and_then(|i| i.result())
    }

    /// 检查指标是否就绪
    pub fn indicator_ready(&self, name: &str) -> bool {
        self.indicators.get(name).map(|i| i.is_ready()).unwrap_or(false)
    }

    /// 获取K线序列
    pub fn klines(&self) -> &KlineSeries {
        &self.klines
    }

    /// 获取最后一根K线
    pub fn last_bar(&self) -> Option<Bar> {
        self.klines.last()
    }

    /// 获取聚合器
    pub fn aggregator(&self) -> Option<&MultiTimeFrameAggregator> {
        self.aggregator.as_ref()
    }

    /// 获取回测结果
    pub fn backtest_result(&mut self) -> Option<&BacktestStats> {
        self.backtest.as_mut().map(|bt| bt.result())
    }

    /// 获取回测交易记录
    pub fn backtest_trades(&self) -> Option<&[Trade]> {
        self.backtest.as_ref().map(|bt| bt.trades())
    }

    /// 获取回测权益曲线
    pub fn backtest_equity_curve(&self) -> Option<&[f64]> {
        self.backtest.as_ref().map(|bt| bt.equity_curve())
    }

    /// 重置引擎
    pub fn reset(&mut self) {
        self.klines.clear();
        for indicator in self.indicators.values_mut() {
            indicator.reset();
        }
        if let Some(agg) = &mut self.aggregator {
            agg.reset();
        }
        if let Some(bt) = &mut self.backtest {
            bt.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_bars() -> Vec<Bar> {
        (0..100)
            .map(|i| {
                let base = 100.0 + (i as f64 * 0.1).sin() * 10.0;
                Bar::new(
                    i * 15 * 60_000, // 15分钟间隔
                    base,
                    base + 2.0,
                    base - 2.0,
                    base + 1.0,
                    1000.0 + i as f64 * 10.0,
                )
            })
            .collect()
    }

    #[test]
    fn test_quant_engine_basic() {
        let mut engine = QuantEngine::new(1000);

        // 添加指标
        engine.add_ma("ma20", 20, MAType::SMA);
        engine.add_rsi("rsi14", 14);
        engine.add_macd("macd", 12, 26, 9);

        // 加载数据
        let bars = create_test_bars();
        engine.load_history(&bars);

        // 检查指标
        assert!(engine.indicator_ready("ma20"));
        assert!(engine.indicator_ready("rsi14"));
        assert!(engine.indicator_value("ma20").is_some());
    }

    #[test]
    fn test_quant_engine_with_aggregator() {
        let mut engine = QuantEngine::new(1000);

        // 设置聚合器
        engine.setup_aggregator(TimeFrame::M15, &[TimeFrame::H1, TimeFrame::H4], 100);

        let bars = create_test_bars();
        engine.load_history(&bars);

        // 检查聚合结果
        let agg = engine.aggregator().unwrap();
        assert!(agg.output(TimeFrame::H1).unwrap().len() > 0);
    }

    #[test]
    fn test_quant_engine_backtest() {
        let mut engine = QuantEngine::new(1000);

        // 添加指标
        engine.add_ma("ma_fast", 5, MAType::SMA);
        engine.add_ma("ma_slow", 20, MAType::SMA);

        // 设置回测
        engine.setup_backtest(BacktestConfig::spot(10000.0));

        // 添加简单策略
        use crate::strategy::FnStrategy;
        engine.add_strategy(Box::new(FnStrategy::new("simple", |ctx| {
            let fast = ctx.indicators.value("ma_fast")?;
            let slow = ctx.indicators.value("ma_slow")?;

            if fast > slow * 1.02 {
                Some(Signal::buy(0.8, "ma_cross_up", ctx.bar.timestamp))
            } else if fast < slow * 0.98 {
                Some(Signal::sell(0.8, "ma_cross_down", ctx.bar.timestamp))
            } else {
                None
            }
        })));

        // 运行回测
        let bars = create_test_bars();
        engine.load_history(&bars);

        // 获取结果
        let stats = engine.backtest_result().unwrap();
        println!("Total trades: {}", stats.total_trades);
        println!("Total PnL: {:.2}", stats.total_pnl);
        println!("Max Drawdown: {:.2}%", stats.max_drawdown_pct);
    }

    #[test]
    fn test_quant_engine_realtime_update() {
        let mut engine = QuantEngine::new(100);
        engine.add_ma("ma5", 5, MAType::SMA);

        // 加载初始数据
        for i in 0..10 {
            let bar = Bar::new(i * 1000, 100.0, 101.0, 99.0, 100.0, 1000.0);
            engine.append_bar(&bar);
        }

        let initial_ma = engine.indicator_value("ma5").unwrap();

        // 模拟实时更新
        let updated_bar = Bar::new(9000, 100.0, 110.0, 99.0, 108.0, 1000.0);
        engine.update_last_bar(&updated_bar);

        let updated_ma = engine.indicator_value("ma5").unwrap();
        assert!(updated_ma > initial_ma);
    }

    #[test]
    fn test_quant_engine_all_indicators() {
        let mut engine = QuantEngine::new(500);

        // 添加所有指标
        engine.add_ma("sma20", 20, MAType::SMA);
        engine.add_ma("ema20", 20, MAType::EMA);
        engine.add_ma("wma20", 20, MAType::WMA);
        engine.add_rsi("rsi14", 14);
        engine.add_macd("macd", 12, 26, 9);
        engine.add_atr("atr14", 14);
        engine.add_boll("boll20", 20, 2.0);
        engine.add_vri("vri14", 14);

        // 加载足够的数据
        let bars: Vec<Bar> = (0..100)
            .map(|i| {
                Bar::new(
                    i * 1000,
                    100.0 + i as f64,
                    105.0 + i as f64,
                    98.0 + i as f64,
                    102.0 + i as f64,
                    1000.0 + i as f64 * 100.0,
                )
            })
            .collect();

        engine.load_history(&bars);

        // 验证所有指标都有值
        assert!(engine.indicator_ready("sma20"));
        assert!(engine.indicator_ready("ema20"));
        assert!(engine.indicator_ready("wma20"));
        assert!(engine.indicator_ready("rsi14"));
        assert!(engine.indicator_ready("macd"));
        assert!(engine.indicator_ready("atr14"));
        assert!(engine.indicator_ready("boll20"));
        assert!(engine.indicator_ready("vri14"));
    }

    #[test]
    fn test_futures_backtest() {
        let mut engine = QuantEngine::new(1000);

        engine.add_rsi("rsi14", 14);

        // 合约回测配置
        let config = BacktestConfig {
            market_type: MarketType::Futures,
            initial_capital: 10000.0,
            leverage: 10.0,
            maker_fee: 0.0002,
            taker_fee: 0.0004,
            slippage: 0.0001,
            position_size_pct: 0.2,
        };
        engine.setup_backtest(config);

        // RSI 策略
        use crate::strategy::RSIStrategy;
        engine.add_strategy(Box::new(RSIStrategy::default_params("rsi14")));

        // 创建波动数据
        let bars: Vec<Bar> = (0..200)
            .map(|i| {
                let phase = (i as f64 * 0.1).sin();
                let base = 100.0 + phase * 20.0;
                Bar::new(
                    i * 1000,
                    base,
                    base + 3.0,
                    base - 3.0,
                    base + phase * 2.0,
                    1000.0,
                )
            })
            .collect();

        engine.load_history(&bars);

        let stats = engine.backtest_result().unwrap();
        println!("Futures backtest:");
        println!("  Total trades: {}", stats.total_trades);
        println!("  Win rate: {:.1}%", stats.win_rate * 100.0);
        println!("  Return: {:.2}%", stats.return_pct);
        println!("  Liquidations: {}", stats.liquidations);
    }
}
