use std::sync::Mutex;

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::{Bar, MAType, QuantEngine, Signal, Side};

fn to_bar(input: &BarInput) -> Bar {
    Bar {
        timestamp: input.timestamp,
        open: input.open,
        high: input.high,
        low: input.low,
        close: input.close,
        volume: input.volume,
    }
}

fn parse_ma_type(ma_type: &str) -> napi::Result<MAType> {
    match ma_type.to_uppercase().as_str() {
        "SMA" => Ok(MAType::SMA),
        "EMA" => Ok(MAType::EMA),
        "WMA" => Ok(MAType::WMA),
        other => Err(Error::from_reason(format!("Unknown MA type: {}", other))),
    }
}

fn signal_to_output(signal: &Signal) -> SignalOutput {
    SignalOutput {
        side: match signal.side {
            Side::Buy => "BUY",
            Side::Sell => "SELL",
            Side::Hold => "HOLD",
        }
        .to_string(),
        strength: signal.strength,
        reason: signal.reason.clone(),
        timestamp: signal.timestamp,
    }
}

#[napi(object)]
pub struct BarInput {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[napi(object)]
pub struct SignalOutput {
    pub side: String,
    pub strength: f64,
    pub reason: String,
    pub timestamp: i64,
}

#[napi]
pub struct Engine {
    inner: Mutex<QuantEngine>,
}

#[napi]
impl Engine {
    #[napi(constructor)]
    pub fn new(capacity: u32) -> Self {
        Self {
            inner: Mutex::new(QuantEngine::new(capacity as usize)),
        }
    }

    /// 添加简单 MA 指标，ma_type: SMA/EMA/WMA
    #[napi]
    pub fn add_ma(&self, name: String, period: u32, ma_type: String) -> napi::Result<()> {
        let mut engine = self.inner.lock().unwrap();
        let ty = parse_ma_type(&ma_type)?;
        engine.add_ma(name, period as usize, ty);
        Ok(())
    }

    /// 追加一根 K 线并返回可能的信号
    #[napi]
    pub fn append_bar(&self, bar: BarInput) -> napi::Result<Vec<SignalOutput>> {
        let mut engine = self.inner.lock().unwrap();
        let signals: Vec<SignalOutput> = engine
            .append_bar(&to_bar(&bar))
            .iter()
            .map(signal_to_output)
            .collect();
        Ok(signals)
    }

    /// 更新最后一根 K 线
    #[napi]
    pub fn update_last_bar(&self, bar: BarInput) -> napi::Result<()> {
        let mut engine = self.inner.lock().unwrap();
        engine.update_last_bar(&to_bar(&bar));
        Ok(())
    }

    /// 批量加载历史数据
    #[napi]
    pub fn load_history(&self, bars: Vec<BarInput>) -> napi::Result<()> {
        let mut engine = self.inner.lock().unwrap();
        let rust_bars: Vec<Bar> = bars.iter().map(to_bar).collect();
        engine.load_history(&rust_bars);
        Ok(())
    }

    /// 获取指标数值
    #[napi]
    pub fn indicator_value(&self, name: String) -> Option<f64> {
        let engine = self.inner.lock().unwrap();
        engine.indicator_value(&name)
    }

    /// 检查指标是否就绪
    #[napi]
    pub fn indicator_ready(&self, name: String) -> bool {
        let engine = self.inner.lock().unwrap();
        engine.indicator_ready(&name)
    }

    /// 重置引擎
    #[napi]
    pub fn reset(&self) {
        let mut engine = self.inner.lock().unwrap();
        engine.reset();
    }
}
