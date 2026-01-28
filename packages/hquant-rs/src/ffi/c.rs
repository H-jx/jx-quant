use crate::backtest::{BacktestParams, FuturesBacktest};
use crate::engine::HQuant;
use crate::indicator::{IndicatorId, IndicatorSpec, IndicatorValue};
use crate::{Bar, Field, Signal};

#[repr(C)]
pub struct HqColumnF64 {
    pub ptr: *const f64,
    pub capacity: usize,
    pub len: usize,
    pub head: usize,
}

#[repr(C)]
pub struct HqColumnI64 {
    pub ptr: *const i64,
    pub capacity: usize,
    pub len: usize,
    pub head: usize,
}

#[no_mangle]
pub extern "C" fn hquant_new(capacity: usize) -> *mut HQuant {
    Box::into_raw(Box::new(HQuant::new(capacity)))
}

#[no_mangle]
pub unsafe extern "C" fn hquant_free(ptr: *mut HQuant) {
    if !ptr.is_null() {
        drop(Box::from_raw(ptr));
    }
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_rsi(ptr: *mut HQuant, period: usize) -> u32 {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.add_indicator(IndicatorSpec::Rsi { period }).0
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_ema_close(ptr: *mut HQuant, period: usize) -> u32 {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.add_indicator(IndicatorSpec::Ema {
        field: Field::Close,
        period,
    })
    .0
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_sma_close(ptr: *mut HQuant, period: usize) -> u32 {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.add_indicator(IndicatorSpec::Sma {
        field: Field::Close,
        period,
    })
    .0
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_stddev_close(ptr: *mut HQuant, period: usize) -> u32 {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.add_indicator(IndicatorSpec::StdDev {
        field: Field::Close,
        period,
    })
    .0
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_boll(ptr: *mut HQuant, period: usize, k: f64) -> u32 {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.add_indicator(IndicatorSpec::Boll {
        period,
        k_bits: k.to_bits(),
    })
    .0
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_macd(
    ptr: *mut HQuant,
    fast: usize,
    slow: usize,
    signal: usize,
) -> u32 {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.add_indicator(IndicatorSpec::Macd { fast, slow, signal })
        .0
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_strategy(
    ptr: *mut HQuant,
    name_utf8: *const u8,
    name_len: usize,
    dsl_utf8: *const u8,
    dsl_len: usize,
) -> u32 {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    if name_utf8.is_null() || dsl_utf8.is_null() {
        return 0;
    }
    let name = core::str::from_utf8_unchecked(core::slice::from_raw_parts(name_utf8, name_len));
    let dsl = core::str::from_utf8_unchecked(core::slice::from_raw_parts(dsl_utf8, dsl_len));
    hq.add_strategy(name, dsl).unwrap_or(0)
}

#[no_mangle]
pub unsafe extern "C" fn hquant_push_bar(ptr: *mut HQuant, bar: Bar) {
    if ptr.is_null() {
        return;
    }
    let hq = &mut *ptr;
    hq.push_kline(bar);
}

#[no_mangle]
pub unsafe extern "C" fn hquant_update_last_bar(ptr: *mut HQuant, bar: Bar) {
    if ptr.is_null() {
        return;
    }
    let hq = &mut *ptr;
    hq.update_last(bar);
}

#[no_mangle]
pub unsafe extern "C" fn hquant_len(ptr: *mut HQuant) -> usize {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.len()
}

#[no_mangle]
pub unsafe extern "C" fn hquant_capacity(ptr: *mut HQuant) -> usize {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.capacity()
}

#[no_mangle]
pub unsafe extern "C" fn hquant_close_column(ptr: *mut HQuant) -> HqColumnF64 {
    if ptr.is_null() {
        return HqColumnF64 {
            ptr: core::ptr::null(),
            capacity: 0,
            len: 0,
            head: 0,
        };
    }
    let hq = &mut *ptr;
    let (p, cap, len, head) = hq.bars().close().raw_parts();
    HqColumnF64 {
        ptr: p,
        capacity: cap,
        len,
        head,
    }
}

#[no_mangle]
pub unsafe extern "C" fn hquant_open_column(ptr: *mut HQuant) -> HqColumnF64 {
    if ptr.is_null() {
        return HqColumnF64 {
            ptr: core::ptr::null(),
            capacity: 0,
            len: 0,
            head: 0,
        };
    }
    let hq = &mut *ptr;
    let (p, cap, len, head) = hq.bars().open().raw_parts();
    HqColumnF64 {
        ptr: p,
        capacity: cap,
        len,
        head,
    }
}

#[no_mangle]
pub unsafe extern "C" fn hquant_high_column(ptr: *mut HQuant) -> HqColumnF64 {
    if ptr.is_null() {
        return HqColumnF64 {
            ptr: core::ptr::null(),
            capacity: 0,
            len: 0,
            head: 0,
        };
    }
    let hq = &mut *ptr;
    let (p, cap, len, head) = hq.bars().high().raw_parts();
    HqColumnF64 {
        ptr: p,
        capacity: cap,
        len,
        head,
    }
}

#[no_mangle]
pub unsafe extern "C" fn hquant_low_column(ptr: *mut HQuant) -> HqColumnF64 {
    if ptr.is_null() {
        return HqColumnF64 {
            ptr: core::ptr::null(),
            capacity: 0,
            len: 0,
            head: 0,
        };
    }
    let hq = &mut *ptr;
    let (p, cap, len, head) = hq.bars().low().raw_parts();
    HqColumnF64 {
        ptr: p,
        capacity: cap,
        len,
        head,
    }
}

#[no_mangle]
pub unsafe extern "C" fn hquant_volume_column(ptr: *mut HQuant) -> HqColumnF64 {
    if ptr.is_null() {
        return HqColumnF64 {
            ptr: core::ptr::null(),
            capacity: 0,
            len: 0,
            head: 0,
        };
    }
    let hq = &mut *ptr;
    let (p, cap, len, head) = hq.bars().volume().raw_parts();
    HqColumnF64 {
        ptr: p,
        capacity: cap,
        len,
        head,
    }
}

#[no_mangle]
pub unsafe extern "C" fn hquant_buy_volume_column(ptr: *mut HQuant) -> HqColumnF64 {
    if ptr.is_null() {
        return HqColumnF64 {
            ptr: core::ptr::null(),
            capacity: 0,
            len: 0,
            head: 0,
        };
    }
    let hq = &mut *ptr;
    let (p, cap, len, head) = hq.bars().buy_volume().raw_parts();
    HqColumnF64 {
        ptr: p,
        capacity: cap,
        len,
        head,
    }
}

#[no_mangle]
pub unsafe extern "C" fn hquant_timestamp_column(ptr: *mut HQuant) -> HqColumnI64 {
    if ptr.is_null() {
        return HqColumnI64 {
            ptr: core::ptr::null(),
            capacity: 0,
            len: 0,
            head: 0,
        };
    }
    let hq = &mut *ptr;
    let (p, cap, len, head) = hq.bars().timestamp().raw_parts();
    HqColumnI64 {
        ptr: p,
        capacity: cap,
        len,
        head,
    }
}

#[no_mangle]
pub unsafe extern "C" fn hquant_indicator_last(ptr: *mut HQuant, id: u32) -> IndicatorValue {
    if ptr.is_null() {
        return IndicatorValue::scalar(f64::NAN);
    }
    let hq = &mut *ptr;
    hq.indicator_last(IndicatorId(id))
        .unwrap_or(IndicatorValue::scalar(f64::NAN))
}

#[no_mangle]
pub unsafe extern "C" fn hquant_signals_len(ptr: *mut HQuant) -> usize {
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    hq.signals_len()
}

/// Drains up to `cap` signals into `out` and returns the count written.
#[no_mangle]
pub unsafe extern "C" fn hquant_poll_signals(ptr: *mut HQuant, out: *mut Signal, cap: usize) -> usize {
    if out.is_null() || cap == 0 {
        return 0;
    }
    if ptr.is_null() {
        return 0;
    }
    let hq = &mut *ptr;
    // Safety: caller promises `out` points to `cap` writable `Signal`s.
    let out_slice = core::slice::from_raw_parts_mut(out, cap);
    hq.poll_signals_into(out_slice)
}

// ===== Backtest C ABI =====

#[no_mangle]
pub extern "C" fn hq_backtest_new(params: BacktestParams) -> *mut FuturesBacktest {
    Box::into_raw(Box::new(FuturesBacktest::new(params)))
}

#[no_mangle]
pub unsafe extern "C" fn hq_backtest_free(ptr: *mut FuturesBacktest) {
    if !ptr.is_null() {
        drop(Box::from_raw(ptr));
    }
}

#[no_mangle]
pub unsafe extern "C" fn hq_backtest_apply_signal(
    ptr: *mut FuturesBacktest,
    action: crate::Action,
    price: f64,
    margin: f64,
) {
    if ptr.is_null() {
        return;
    }
    let bt = &mut *ptr;
    bt.apply_signal(action, price, margin);
}

#[no_mangle]
pub unsafe extern "C" fn hq_backtest_on_price(ptr: *mut FuturesBacktest, price: f64) {
    if ptr.is_null() {
        return;
    }
    let bt = &mut *ptr;
    bt.on_price(price);
}

#[no_mangle]
pub unsafe extern "C" fn hq_backtest_result(
    ptr: *mut FuturesBacktest,
    price: f64,
) -> crate::backtest::BacktestResult {
    if ptr.is_null() {
        return crate::backtest::BacktestResult {
            equity: f64::NAN,
            profit: f64::NAN,
            profit_rate: f64::NAN,
            max_drawdown_rate: f64::NAN,
            liquidated: true,
        };
    }
    let bt = &mut *ptr;
    bt.result(price)
}
