//! Node.js N-API 绑定
//!
//! 使用 napi-rs 将 Rust 核心暴露给 Node.js

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;

use hquant_core::indicators::{Indicator, MA, BOLL, RSI, MACD, ATR, VRI};
use hquant_core::kline::{Kline, KlineFrame};

#[napi(object)]
pub struct JsKline {
  pub open: f64,
  pub close: f64,
  pub high: f64,
  pub low: f64,
  pub volume: f64,
  pub timestamp: i64,
}

impl From<&JsKline> for Kline {
  fn from(k: &JsKline) -> Self {
    Kline {
      open: k.open,
      close: k.close,
      high: k.high,
      low: k.low,
      volume: k.volume,
      timestamp: k.timestamp,
      buy: None,
      sell: None,
    }
  }
}

#[napi(object)]
pub struct JsBollResult {
  pub up: f64,
  pub mid: f64,
  pub low: f64,
}

#[napi(object)]
pub struct JsMacdResult {
  pub macd: f64,
  pub signal: f64,
  pub histogram: f64,
}

/// HQuant 量化指标计算引擎
#[napi]
pub struct HQuant {
  frame: KlineFrame,
  indicators: HashMap<String, Box<dyn Indicator + Send>>,
}

#[napi]
impl HQuant {
  /// 创建 HQuant 实例
  #[napi(constructor)]
  pub fn new(capacity: i32) -> Self {
    Self {
      frame: KlineFrame::new(capacity as usize),
      indicators: HashMap::new(),
    }
  }

  /// 添加 MA 指标
  #[napi]
  pub fn add_ma(&mut self, name: String, period: i32, max_history: Option<i32>) {
    let max_history = max_history.unwrap_or(120) as usize;
    let ma = MA::with_close(period as usize, max_history);
    self.indicators.insert(name, Box::new(ma));
  }

  /// 添加 BOLL 指标
  #[napi]
  pub fn add_boll(&mut self, name: String, period: i32, std_factor: f64, max_history: Option<i32>) {
    let max_history = max_history.unwrap_or(120) as usize;
    let boll = BOLL::new(period as usize, std_factor, max_history);
    self.indicators.insert(name, Box::new(boll));
  }

  /// 添加 RSI 指标
  #[napi]
  pub fn add_rsi(&mut self, name: String, period: i32, max_history: Option<i32>) {
    let max_history = max_history.unwrap_or(120) as usize;
    let rsi = RSI::new(period as usize, max_history);
    self.indicators.insert(name, Box::new(rsi));
  }

  /// 添加 MACD 指标
  #[napi]
  pub fn add_macd(
    &mut self,
    name: String,
    short_period: i32,
    long_period: i32,
    signal_period: i32,
    max_history: Option<i32>,
  ) {
    let max_history = max_history.unwrap_or(120) as usize;
    let macd = MACD::new(
      short_period as usize,
      long_period as usize,
      signal_period as usize,
      max_history,
    );
    self.indicators.insert(name, Box::new(macd));
  }

  /// 添加 ATR 指标
  #[napi]
  pub fn add_atr(&mut self, name: String, period: i32, max_history: Option<i32>) {
    let max_history = max_history.unwrap_or(120) as usize;
    let atr = ATR::new(period as usize, max_history);
    self.indicators.insert(name, Box::new(atr));
  }

  /// 添加 VRI 指标
  #[napi]
  pub fn add_vri(&mut self, name: String, period: i32, max_history: Option<i32>) {
    let max_history = max_history.unwrap_or(120) as usize;
    let vri = VRI::new(period as usize, max_history);
    self.indicators.insert(name, Box::new(vri));
  }

  /// 添加一根 K 线
  #[napi]
  pub fn add_kline(&mut self, kline: JsKline) {
    let k: Kline = (&kline).into();
    self.frame.push(&k);
    for indicator in self.indicators.values_mut() {
      indicator.add(&k);
    }
  }

  /// 更新最后一根 K 线
  #[napi]
  pub fn update_last(&mut self, kline: JsKline) {
    let k: Kline = (&kline).into();
    self.frame.update_last(&k);
    for indicator in self.indicators.values_mut() {
      indicator.update_last(&k);
    }
  }

  /// 从 JSON 导入
  #[napi]
  pub fn import_json(&mut self, json: String) -> Result<()> {
    match KlineFrame::from_json_flexible(&json, self.frame.capacity()) {
      Ok(frame) => {
        for i in 0..frame.len() as i32 {
          if let Some(kline) = frame.get(i) {
            for indicator in self.indicators.values_mut() {
              indicator.add(&kline);
            }
          }
        }
        self.frame = frame;
        Ok(())
      }
      Err(e) => Err(Error::from_reason(format!("JSON parse error: {}", e))),
    }
  }

  /// 从二进制导入
  #[napi]
  pub fn import_binary(&mut self, buffer: Buffer) -> Result<()> {
    match KlineFrame::from_binary(&buffer) {
      Ok(frame) => {
        for i in 0..frame.len() as i32 {
          if let Some(kline) = frame.get(i) {
            for indicator in self.indicators.values_mut() {
              indicator.add(&kline);
            }
          }
        }
        self.frame = frame;
        Ok(())
      }
      Err(e) => Err(Error::from_reason(format!("Binary parse error: {}", e))),
    }
  }

  /// 获取 MA 值
  #[napi]
  pub fn get_ma(&self, name: String, index: Option<i32>) -> f64 {
    let index = index.unwrap_or(-1);
    self
      .indicators
      .get(&name)
      .map(|ind| ind.get_value(index))
      .unwrap_or(f64::NAN)
  }

  /// 获取 RSI 值
  #[napi]
  pub fn get_rsi(&self, name: String, index: Option<i32>) -> f64 {
    self.get_ma(name, index)
  }

  /// 获取 ATR 值
  #[napi]
  pub fn get_atr(&self, name: String, index: Option<i32>) -> f64 {
    self.get_ma(name, index)
  }

  /// 获取 VRI 值
  #[napi]
  pub fn get_vri(&self, name: String, index: Option<i32>) -> f64 {
    self.get_ma(name, index)
  }

  /// 获取 K 线数量
  #[napi]
  pub fn kline_count(&self) -> i32 {
    self.frame.len() as i32
  }

  /// 获取指标历史长度
  #[napi]
  pub fn indicator_len(&self, name: String) -> i32 {
    self
      .indicators
      .get(&name)
      .map(|ind| ind.len() as i32)
      .unwrap_or(0)
  }

  /// 导出为二进制
  #[napi]
  pub fn export_binary(&self) -> Buffer {
    Buffer::from(self.frame.to_binary())
  }
}
