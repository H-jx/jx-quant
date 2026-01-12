pub mod ma;
pub mod rsi;
pub mod macd;
pub mod atr;
pub mod boll;
pub mod vri;
pub mod dynamic;

pub use ma::{MA, MAType};
pub use rsi::RSI;
pub use macd::MACD;
pub use atr::ATR;
pub use boll::BOLL;
pub use vri::VRI;
pub use dynamic::{DynamicIndicator, DynamicIndicatorFn, vwap, obv, mfi, williams_r, cci, roc};

use crate::kline::Bar;

/// 指标结果
#[derive(Debug, Clone, Default)]
pub struct IndicatorValue {
    pub value: f64,
    pub timestamp: i64,
    /// 额外数据（如 BOLL 的上下轨、MACD 的信号线等）
    pub extra: Option<Vec<f64>>,
}

impl IndicatorValue {
    pub fn new(value: f64, timestamp: i64) -> Self {
        Self {
            value,
            timestamp,
            extra: None,
        }
    }

    pub fn with_extra(value: f64, timestamp: i64, extra: Vec<f64>) -> Self {
        Self {
            value,
            timestamp,
            extra: Some(extra),
        }
    }
}

/// 指标 trait
pub trait Indicator: Send + Sync {
    /// 指标名称
    fn name(&self) -> &str;

    /// 所需的最小数据点数量
    fn min_periods(&self) -> usize;

    /// 追加新数据点并计算
    fn push(&mut self, bar: &Bar);

    /// 更新最后一个数据点
    fn update_last(&mut self, bar: &Bar);

    /// 获取当前值
    fn value(&self) -> Option<f64>;

    /// 获取完整结果（包含额外数据）
    fn result(&self) -> Option<IndicatorValue>;

    /// 是否已有足够数据计算
    fn is_ready(&self) -> bool;

    /// 获取历史值
    fn get(&self, index: usize) -> Option<f64>;

    /// 获取倒数第n个值（1为最新）
    fn get_from_end(&self, n: usize) -> Option<f64>;

    /// 历史值数量
    fn len(&self) -> usize;

    /// 重置指标状态
    fn reset(&mut self);
}

/// 指标输入类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PriceType {
    Open,
    High,
    Low,
    Close,
    Volume,
    /// (High + Low + Close) / 3
    Typical,
    /// (High + Low) / 2
    Median,
    /// (Open + High + Low + Close) / 4
    Average,
}

impl PriceType {
    pub fn extract(&self, bar: &Bar) -> f64 {
        match self {
            PriceType::Open => bar.open,
            PriceType::High => bar.high,
            PriceType::Low => bar.low,
            PriceType::Close => bar.close,
            PriceType::Volume => bar.volume,
            PriceType::Typical => (bar.high + bar.low + bar.close) / 3.0,
            PriceType::Median => (bar.high + bar.low) / 2.0,
            PriceType::Average => (bar.open + bar.high + bar.low + bar.close) / 4.0,
        }
    }
}
