/// 策略系统
/// 支持声明式策略定义和信号生成

use std::collections::HashMap;
use crate::kline::Bar;
use crate::indicators::{Indicator, IndicatorValue};

/// 交易方向
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Buy,
    Sell,
    Hold,
}

/// 交易信号
#[derive(Debug, Clone)]
pub struct Signal {
    pub side: Side,
    pub strength: f64,  // 信号强度 0.0 - 1.0
    pub reason: String,
    pub timestamp: i64,
}

impl Signal {
    pub fn buy(strength: f64, reason: impl Into<String>, timestamp: i64) -> Self {
        Self {
            side: Side::Buy,
            strength: strength.clamp(0.0, 1.0),
            reason: reason.into(),
            timestamp,
        }
    }

    pub fn sell(strength: f64, reason: impl Into<String>, timestamp: i64) -> Self {
        Self {
            side: Side::Sell,
            strength: strength.clamp(0.0, 1.0),
            reason: reason.into(),
            timestamp,
        }
    }

    pub fn hold(timestamp: i64) -> Self {
        Self {
            side: Side::Hold,
            strength: 0.0,
            reason: String::new(),
            timestamp,
        }
    }
}

/// 指标快照（用于策略计算）
pub struct IndicatorSnapshot<'a> {
    indicators: &'a HashMap<String, Box<dyn Indicator>>,
}

impl<'a> IndicatorSnapshot<'a> {
    pub fn new(indicators: &'a HashMap<String, Box<dyn Indicator>>) -> Self {
        Self { indicators }
    }

    pub fn get(&self, name: &str) -> Option<&dyn Indicator> {
        self.indicators.get(name).map(|i| i.as_ref())
    }

    pub fn value(&self, name: &str) -> Option<f64> {
        self.get(name).and_then(|i| i.value())
    }

    pub fn result(&self, name: &str) -> Option<IndicatorValue> {
        self.get(name).and_then(|i| i.result())
    }

    pub fn is_ready(&self, name: &str) -> bool {
        self.get(name).map(|i| i.is_ready()).unwrap_or(false)
    }
}

/// 策略上下文
pub struct StrategyContext<'a> {
    pub bar: &'a Bar,
    pub indicators: IndicatorSnapshot<'a>,
}

/// 策略 trait
pub trait Strategy: Send + Sync {
    fn name(&self) -> &str;
    fn evaluate(&self, ctx: &StrategyContext) -> Option<Signal>;
}

/// 基于闭包的策略实现
pub struct FnStrategy<F>
where
    F: Fn(&StrategyContext) -> Option<Signal> + Send + Sync,
{
    name: String,
    func: F,
}

impl<F> FnStrategy<F>
where
    F: Fn(&StrategyContext) -> Option<Signal> + Send + Sync,
{
    pub fn new(name: impl Into<String>, func: F) -> Self {
        Self {
            name: name.into(),
            func,
        }
    }
}

impl<F> Strategy for FnStrategy<F>
where
    F: Fn(&StrategyContext) -> Option<Signal> + Send + Sync,
{
    fn name(&self) -> &str {
        &self.name
    }

    fn evaluate(&self, ctx: &StrategyContext) -> Option<Signal> {
        (self.func)(ctx)
    }
}

/// MA 交叉策略
pub struct MACrossStrategy {
    fast_ma: String,
    slow_ma: String,
    prev_fast: Option<f64>,
    prev_slow: Option<f64>,
}

impl MACrossStrategy {
    pub fn new(fast_ma: impl Into<String>, slow_ma: impl Into<String>) -> Self {
        Self {
            fast_ma: fast_ma.into(),
            slow_ma: slow_ma.into(),
            prev_fast: None,
            prev_slow: None,
        }
    }
}

impl Strategy for MACrossStrategy {
    fn name(&self) -> &str {
        "ma_cross"
    }

    fn evaluate(&self, ctx: &StrategyContext) -> Option<Signal> {
        let fast = ctx.indicators.value(&self.fast_ma)?;
        let slow = ctx.indicators.value(&self.slow_ma)?;

        let signal = if let (Some(pf), Some(ps)) = (self.prev_fast, self.prev_slow) {
            if pf <= ps && fast > slow {
                // 金叉
                Some(Signal::buy(0.8, "ma_golden_cross", ctx.bar.timestamp))
            } else if pf >= ps && fast < slow {
                // 死叉
                Some(Signal::sell(0.8, "ma_death_cross", ctx.bar.timestamp))
            } else {
                None
            }
        } else {
            None
        };

        signal
    }
}

/// RSI 超买超卖策略
pub struct RSIStrategy {
    rsi_name: String,
    overbought: f64,
    oversold: f64,
}

impl RSIStrategy {
    pub fn new(rsi_name: impl Into<String>, overbought: f64, oversold: f64) -> Self {
        Self {
            rsi_name: rsi_name.into(),
            overbought,
            oversold,
        }
    }

    pub fn default_params(rsi_name: impl Into<String>) -> Self {
        Self::new(rsi_name, 70.0, 30.0)
    }
}

impl Strategy for RSIStrategy {
    fn name(&self) -> &str {
        "rsi_strategy"
    }

    fn evaluate(&self, ctx: &StrategyContext) -> Option<Signal> {
        let rsi = ctx.indicators.value(&self.rsi_name)?;

        if rsi < self.oversold {
            Some(Signal::buy(
                (self.oversold - rsi) / self.oversold,
                "rsi_oversold",
                ctx.bar.timestamp,
            ))
        } else if rsi > self.overbought {
            Some(Signal::sell(
                (rsi - self.overbought) / (100.0 - self.overbought),
                "rsi_overbought",
                ctx.bar.timestamp,
            ))
        } else {
            None
        }
    }
}

/// BOLL 突破策略
pub struct BOLLStrategy {
    boll_name: String,
}

impl BOLLStrategy {
    pub fn new(boll_name: impl Into<String>) -> Self {
        Self {
            boll_name: boll_name.into(),
        }
    }
}

impl Strategy for BOLLStrategy {
    fn name(&self) -> &str {
        "boll_strategy"
    }

    fn evaluate(&self, ctx: &StrategyContext) -> Option<Signal> {
        let result = ctx.indicators.result(&self.boll_name)?;
        let extra = result.extra?;
        if extra.len() < 2 {
            return None;
        }

        let _middle = result.value;
        let upper = extra[0];
        let lower = extra[1];
        let price = ctx.bar.close;

        if price <= lower {
            // 触及下轨，买入信号
            let strength = (lower - price) / (upper - lower).abs().max(0.001);
            Some(Signal::buy(strength.min(1.0), "boll_lower_touch", ctx.bar.timestamp))
        } else if price >= upper {
            // 触及上轨，卖出信号
            let strength = (price - upper) / (upper - lower).abs().max(0.001);
            Some(Signal::sell(strength.min(1.0), "boll_upper_touch", ctx.bar.timestamp))
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signal_creation() {
        let buy = Signal::buy(0.8, "test_buy", 1000);
        assert_eq!(buy.side, Side::Buy);
        assert_eq!(buy.strength, 0.8);

        let sell = Signal::sell(1.5, "test_sell", 2000); // 超过1.0会被clamp
        assert_eq!(sell.side, Side::Sell);
        assert_eq!(sell.strength, 1.0);

        let hold = Signal::hold(3000);
        assert_eq!(hold.side, Side::Hold);
    }

    #[test]
    fn test_fn_strategy() {
        let strategy = FnStrategy::new("test", |ctx: &StrategyContext| {
            if ctx.bar.close > 100.0 {
                Some(Signal::buy(0.5, "price_above_100", ctx.bar.timestamp))
            } else {
                None
            }
        });

        assert_eq!(strategy.name(), "test");
    }
}
