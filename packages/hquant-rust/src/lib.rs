//! hquant-core: 高性能量化交易指标计算库
//!
//! 支持 FFI 调用 (Go, Node.js)

pub mod common;
pub mod kline;
pub mod indicators;
pub mod ffi;

pub use common::RingBuffer;
pub use kline::{Kline, KlineFrame};
pub use indicators::{Indicator, MA, BOLL, RSI, MACD, ATR, VRI};
