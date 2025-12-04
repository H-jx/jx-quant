//! 技术指标模块

mod ma;
mod boll;
mod rsi;
mod macd;
mod atr;
mod vri;

pub use ma::MA;
pub use boll::BOLL;
pub use rsi::RSI;
pub use macd::MACD;
pub use atr::ATR;
pub use vri::VRI;

use crate::Kline;

/// 指标接口
pub trait Indicator {
    /// 添加新数据
    fn add(&mut self, kline: &Kline);

    /// 更新最后一个数据 (不增加)
    fn update_last(&mut self, kline: &Kline);

    /// 获取指标值 (index: -1 = 最新, 0 = 最旧)
    fn get_value(&self, index: i32) -> f64;

    /// 当前历史长度
    fn len(&self) -> usize;

    /// 是否为空
    fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// 多值指标结果
#[derive(Debug, Clone, Copy, Default)]
pub struct BollResult {
    pub up: f64,
    pub mid: f64,
    pub low: f64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct MacdResult {
    pub macd: f64,
    pub signal: f64,
    pub histogram: f64,
}
