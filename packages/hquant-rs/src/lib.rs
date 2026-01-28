//! High-performance quant core (ring-buffer SoA bars + incremental indicators).
//!
//! This crate intentionally keeps dependencies at zero to make FFI and embedding easier.

mod types;
pub use types::*;

pub mod circular;
pub mod kline_buffer;
pub mod period;
pub mod aggregator;

pub mod indicator;
pub mod strategy;

pub mod engine;
pub mod multi;
pub mod backtest;

pub mod ffi;
