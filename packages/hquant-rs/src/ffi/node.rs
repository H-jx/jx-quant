//! Node.js addon (napi-rs).
//!
//! Build with: `cargo build --release --features ffi-node`

use crate::backtest::{BacktestParams as CoreBacktestParams, FuturesBacktest as CoreFuturesBacktest};
use crate::engine::HQuant as CoreHQuant;
use crate::indicator::IndicatorSpec;
use crate::multi::MultiHQuant as CoreMultiHQuant;
use crate::period::Period;
use crate::{Action as CoreAction, Bar as CoreBar, Field};
use napi::bindgen_prelude::*;
use napi::JsArrayBuffer;
use napi_derive::napi;
use std::sync::{Arc, Mutex};

#[napi(object)]
pub struct Bar {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub buy_volume: Option<f64>,
}

impl From<Bar> for CoreBar {
    fn from(b: Bar) -> Self {
        CoreBar::new(
            b.timestamp,
            b.open,
            b.high,
            b.low,
            b.close,
            b.volume,
            b.buy_volume.unwrap_or(0.0),
        )
    }
}

#[napi(object)]
pub struct Signal {
    pub strategy_id: u32,
    pub action: String,
    pub timestamp: i64,
}

fn action_to_str(a: CoreAction) -> &'static str {
    match a {
        CoreAction::Buy => "BUY",
        CoreAction::Sell => "SELL",
        CoreAction::Hold => "HOLD",
    }
}

#[napi(object)]
pub struct IndicatorValue {
    pub kind: u8,
    pub a: f64,
    pub b: f64,
    pub c: f64,
}

#[napi(object)]
pub struct BacktestParams {
    pub initial_margin: f64,
    pub leverage: f64,
    pub contract_size: f64,
    pub maker_fee_rate: f64,
    pub taker_fee_rate: f64,
    pub maintenance_margin_rate: f64,
}

#[napi(object)]
pub struct BacktestResult {
    pub equity: f64,
    pub profit: f64,
    pub profit_rate: f64,
    pub max_drawdown_rate: f64,
    pub liquidated: bool,
}

#[napi(object)]
pub struct ColumnF64 {
    /// External ArrayBuffer over the backing ring buffer (length == capacity).
    pub buffer: JsArrayBuffer,
    pub capacity: u32,
    pub len: u32,
    pub head: u32,
}

// Keeps the core object alive as long as JS holds the ArrayBuffer.
#[allow(dead_code)]
struct KeepAlive<T>(Arc<Mutex<T>>);

#[napi]
pub struct HQuant {
    inner: Arc<Mutex<CoreHQuant>>,
}

#[napi]
impl HQuant {
    #[napi(constructor)]
    pub fn new(capacity: u32) -> Self {
        Self {
            inner: Arc::new(Mutex::new(CoreHQuant::new(capacity as usize))),
        }
    }

    #[napi]
    pub fn add_rsi(&self, period: u32) -> Result<u32> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        Ok(hq
            .add_indicator(IndicatorSpec::Rsi {
                period: period as usize,
            })
            .0)
    }

    #[napi]
    pub fn add_ema_close(&self, period: u32) -> Result<u32> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        Ok(hq
            .add_indicator(IndicatorSpec::Ema {
                field: Field::Close,
                period: period as usize,
            })
            .0)
    }

    #[napi]
    pub fn add_strategy(&self, name: String, dsl: String) -> Result<u32> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        hq.add_strategy(&name, &dsl)
            .map_err(|e| Error::from_reason(format!("{e:?}")))
    }

    #[napi]
    pub fn push_bar(&self, bar: Bar) -> Result<()> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        hq.push_kline(bar.into());
        Ok(())
    }

    #[napi]
    pub fn update_last_bar(&self, bar: Bar) -> Result<()> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        hq.update_last(bar.into());
        Ok(())
    }

    #[napi]
    pub fn indicator_last(&self, id: u32) -> Result<IndicatorValue> {
        let hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        let v = hq
            .indicator_last(crate::indicator::IndicatorId(id))
            .unwrap_or(crate::indicator::IndicatorValue::scalar(f64::NAN));
        Ok(IndicatorValue {
            kind: v.kind as u8,
            a: v.a,
            b: v.b,
            c: v.c,
        })
    }

    #[napi]
    pub fn poll_signals(&self) -> Result<Vec<Signal>> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        let sigs = hq.poll_signals();
        Ok(sigs
            .into_iter()
            .map(|s| Signal {
                strategy_id: s.strategy_id,
                action: action_to_str(s.action).to_string(),
                timestamp: s.timestamp,
            })
            .collect())
    }

    #[napi]
    pub fn len(&self) -> Result<u32> {
        let hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        Ok(hq.len() as u32)
    }

    #[napi]
    pub fn capacity(&self) -> Result<u32> {
        let hq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        Ok(hq.capacity() as u32)
    }

    #[napi]
    pub fn close_column(&self, env: Env) -> Result<ColumnF64> {
        self.f64_column(env, |hq| hq.bars().close().raw_parts())
    }

    #[napi]
    pub fn open_column(&self, env: Env) -> Result<ColumnF64> {
        self.f64_column(env, |hq| hq.bars().open().raw_parts())
    }

    #[napi]
    pub fn high_column(&self, env: Env) -> Result<ColumnF64> {
        self.f64_column(env, |hq| hq.bars().high().raw_parts())
    }

    #[napi]
    pub fn low_column(&self, env: Env) -> Result<ColumnF64> {
        self.f64_column(env, |hq| hq.bars().low().raw_parts())
    }

    #[napi]
    pub fn volume_column(&self, env: Env) -> Result<ColumnF64> {
        self.f64_column(env, |hq| hq.bars().volume().raw_parts())
    }

    #[napi]
    pub fn buy_volume_column(&self, env: Env) -> Result<ColumnF64> {
        self.f64_column(env, |hq| hq.bars().buy_volume().raw_parts())
    }

    fn f64_column<F>(&self, env: Env, f: F) -> Result<ColumnF64>
    where
        F: FnOnce(&CoreHQuant) -> (*const f64, usize, usize, usize),
    {
        let keep = KeepAlive(self.inner.clone());
        let (ptr, cap, len, head) = {
            let hq = self
                .inner
                .lock()
                .map_err(|_| Error::from_reason("lock poisoned"))?;
            f(&hq)
        };

        // SAFETY: backing buffer is fixed-capacity Vec<f64> inside the core object.
        // KeepAlive ensures core stays alive while JS holds the external ArrayBuffer.
        let byte_len = cap * std::mem::size_of::<f64>();
        let data = ptr as *mut u8;
        let ab = unsafe {
            env.create_arraybuffer_with_borrowed_data(data, byte_len, keep, |_keep, _env| {})
        }?
        .value;

        Ok(ColumnF64 {
            buffer: ab,
            capacity: cap as u32,
            len: len as u32,
            head: head as u32,
        })
    }
}

fn parse_action_str(s: &str) -> Option<CoreAction> {
    match s.to_ascii_uppercase().as_str() {
        "BUY" => Some(CoreAction::Buy),
        "SELL" => Some(CoreAction::Sell),
        "HOLD" => Some(CoreAction::Hold),
        _ => None,
    }
}

#[napi]
pub struct FuturesBacktest {
    inner: Mutex<CoreFuturesBacktest>,
}

#[napi]
impl FuturesBacktest {
    #[napi(constructor)]
    pub fn new(params: BacktestParams) -> Result<Self> {
        let p = CoreBacktestParams {
            initial_margin: params.initial_margin,
            leverage: params.leverage,
            contract_size: params.contract_size,
            maker_fee_rate: params.maker_fee_rate,
            taker_fee_rate: params.taker_fee_rate,
            maintenance_margin_rate: params.maintenance_margin_rate,
        };
        if !p.is_valid() {
            return Err(Error::from_reason("invalid backtest params"));
        }
        Ok(Self {
            inner: Mutex::new(CoreFuturesBacktest::new(p)),
        })
    }

    #[napi]
    pub fn apply_signal(&self, action: String, price: f64, margin: f64) -> Result<()> {
        let a = parse_action_str(&action).ok_or_else(|| Error::from_reason("invalid action"))?;
        let mut bt = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        bt.apply_signal(a, price, margin);
        Ok(())
    }

    #[napi]
    pub fn on_price(&self, price: f64) -> Result<()> {
        let mut bt = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        bt.on_price(price);
        Ok(())
    }

    #[napi]
    pub fn result(&self, price: f64) -> Result<BacktestResult> {
        let bt = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        let r = bt.result(price);
        Ok(BacktestResult {
            equity: r.equity,
            profit: r.profit,
            profit_rate: r.profit_rate,
            max_drawdown_rate: r.max_drawdown_rate,
            liquidated: r.liquidated,
        })
    }
}

#[napi]
pub struct MultiHQuant {
    inner: Arc<Mutex<CoreMultiHQuant>>,
}

#[napi]
impl MultiHQuant {
    #[napi(constructor)]
    pub fn new(capacity: u32, periods: Vec<String>) -> Result<Self> {
        let mut ps = Vec::with_capacity(periods.len());
        for s in periods {
            let p = Period::parse(&s).map_err(|e| Error::from_reason(e.to_string()))?;
            ps.push(p);
        }
        Ok(Self {
            inner: Arc::new(Mutex::new(CoreMultiHQuant::new(capacity as usize, ps))),
        })
    }

    #[napi]
    pub fn feed_bar(&self, bar: Bar) -> Result<()> {
        let mut mq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        mq.feed_bar(bar.into());
        Ok(())
    }

    #[napi]
    pub fn flush(&self) -> Result<()> {
        let mut mq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        mq.flush();
        Ok(())
    }

    #[napi]
    pub fn add_multi_strategy(&self, name: String, dsl: String) -> Result<u32> {
        let mut mq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        mq.add_multi_strategy(&name, &dsl)
            .map_err(|e| Error::from_reason(format!("{e:?}")))
    }

    #[napi]
    pub fn poll_signals(&self) -> Result<Vec<Signal>> {
        let mut mq = self
            .inner
            .lock()
            .map_err(|_| Error::from_reason("lock poisoned"))?;
        Ok(mq
            .poll_signals()
            .into_iter()
            .map(|s| Signal {
                strategy_id: s.strategy_id,
                action: action_to_str(s.action).to_string(),
                timestamp: s.timestamp,
            })
            .collect())
    }
}

