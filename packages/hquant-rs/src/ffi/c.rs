use crate::backtest::{BacktestParams, FuturesBacktest};
use crate::engine::HQuant;
use crate::indicator::{IndicatorId, IndicatorSpec, IndicatorValue};
use crate::{Bar, Field, Signal};
use std::panic::{catch_unwind, AssertUnwindSafe};

#[inline]
fn ffi_catch<R>(default: R, f: impl FnOnce() -> R) -> R {
    catch_unwind(AssertUnwindSafe(f)).unwrap_or(default)
}

#[inline]
fn empty_col_f64() -> HqColumnF64 {
    HqColumnF64 {
        ptr: core::ptr::null(),
        capacity: 0,
        len: 0,
        head: 0,
    }
}

#[inline]
fn empty_col_i64() -> HqColumnI64 {
    HqColumnI64 {
        ptr: core::ptr::null(),
        capacity: 0,
        len: 0,
        head: 0,
    }
}

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
    ffi_catch(core::ptr::null_mut(), || {
        if capacity == 0 {
            return core::ptr::null_mut();
        }
        Box::into_raw(Box::new(HQuant::new(capacity)))
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_free(ptr: *mut HQuant) {
    let _ = ffi_catch((), || {
        if !ptr.is_null() {
            drop(Box::from_raw(ptr));
        }
    });
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_rsi(ptr: *mut HQuant, period: usize) -> u32 {
    ffi_catch(0, || {
        if ptr.is_null() || period == 0 {
            return 0;
        }
        let hq = &mut *ptr;
        hq.add_indicator(IndicatorSpec::Rsi { period }).0
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_ema_close(ptr: *mut HQuant, period: usize) -> u32 {
    ffi_catch(0, || {
        if ptr.is_null() || period == 0 {
            return 0;
        }
        let hq = &mut *ptr;
        hq.add_indicator(IndicatorSpec::Ema {
            field: Field::Close,
            period,
        })
        .0
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_sma_close(ptr: *mut HQuant, period: usize) -> u32 {
    ffi_catch(0, || {
        if ptr.is_null() || period == 0 {
            return 0;
        }
        let hq = &mut *ptr;
        hq.add_indicator(IndicatorSpec::Sma {
            field: Field::Close,
            period,
        })
        .0
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_stddev_close(ptr: *mut HQuant, period: usize) -> u32 {
    ffi_catch(0, || {
        if ptr.is_null() || period == 0 {
            return 0;
        }
        let hq = &mut *ptr;
        hq.add_indicator(IndicatorSpec::StdDev {
            field: Field::Close,
            period,
        })
        .0
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_boll(ptr: *mut HQuant, period: usize, k: f64) -> u32 {
    ffi_catch(0, || {
        if ptr.is_null() || period == 0 || !k.is_finite() {
            return 0;
        }
        let hq = &mut *ptr;
        hq.add_indicator(IndicatorSpec::Boll {
            period,
            k_bits: k.to_bits(),
        })
        .0
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_macd(
    ptr: *mut HQuant,
    fast: usize,
    slow: usize,
    signal: usize,
) -> u32 {
    ffi_catch(0, || {
        if ptr.is_null() || fast == 0 || slow == 0 || signal == 0 || fast >= slow {
            return 0;
        }
        let hq = &mut *ptr;
        hq.add_indicator(IndicatorSpec::Macd { fast, slow, signal })
            .0
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_add_strategy(
    ptr: *mut HQuant,
    name_utf8: *const u8,
    name_len: usize,
    dsl_utf8: *const u8,
    dsl_len: usize,
) -> u32 {
    ffi_catch(0, || {
        if ptr.is_null() {
            return 0;
        }
        if (name_len > 0 && name_utf8.is_null()) || (dsl_len > 0 && dsl_utf8.is_null()) {
            return 0;
        }

        // SAFETY: caller promises the buffers are valid for (ptr,len).
        let name_bytes = if name_len == 0 {
            &[][..]
        } else {
            unsafe { core::slice::from_raw_parts(name_utf8, name_len) }
        };
        let dsl_bytes = if dsl_len == 0 {
            &[][..]
        } else {
            unsafe { core::slice::from_raw_parts(dsl_utf8, dsl_len) }
        };

        let Ok(name) = core::str::from_utf8(name_bytes) else {
            return 0;
        };
        let Ok(dsl) = core::str::from_utf8(dsl_bytes) else {
            return 0;
        };
        let hq = &mut *ptr;
        hq.add_strategy(name, dsl).unwrap_or(0)
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_push_bar(ptr: *mut HQuant, bar: Bar) {
    let _ = ffi_catch((), || {
        if ptr.is_null() {
            return;
        }
        let hq = &mut *ptr;
        hq.push_kline(bar);
    });
}

#[no_mangle]
pub unsafe extern "C" fn hquant_update_last_bar(ptr: *mut HQuant, bar: Bar) {
    let _ = ffi_catch((), || {
        if ptr.is_null() {
            return;
        }
        let hq = &mut *ptr;
        hq.update_last(bar);
    });
}

#[no_mangle]
pub unsafe extern "C" fn hquant_len(ptr: *mut HQuant) -> usize {
    ffi_catch(0, || {
        if ptr.is_null() {
            return 0;
        }
        let hq = &mut *ptr;
        hq.len()
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_capacity(ptr: *mut HQuant) -> usize {
    ffi_catch(0, || {
        if ptr.is_null() {
            return 0;
        }
        let hq = &mut *ptr;
        hq.capacity()
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_close_column(ptr: *mut HQuant) -> HqColumnF64 {
    ffi_catch(empty_col_f64(), || {
        if ptr.is_null() {
            return empty_col_f64();
        }
        let hq = &mut *ptr;
        let (p, cap, len, head) = hq.bars().close().raw_parts();
        HqColumnF64 {
            ptr: p,
            capacity: cap,
            len,
            head,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_open_column(ptr: *mut HQuant) -> HqColumnF64 {
    ffi_catch(empty_col_f64(), || {
        if ptr.is_null() {
            return empty_col_f64();
        }
        let hq = &mut *ptr;
        let (p, cap, len, head) = hq.bars().open().raw_parts();
        HqColumnF64 {
            ptr: p,
            capacity: cap,
            len,
            head,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_high_column(ptr: *mut HQuant) -> HqColumnF64 {
    ffi_catch(empty_col_f64(), || {
        if ptr.is_null() {
            return empty_col_f64();
        }
        let hq = &mut *ptr;
        let (p, cap, len, head) = hq.bars().high().raw_parts();
        HqColumnF64 {
            ptr: p,
            capacity: cap,
            len,
            head,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_low_column(ptr: *mut HQuant) -> HqColumnF64 {
    ffi_catch(empty_col_f64(), || {
        if ptr.is_null() {
            return empty_col_f64();
        }
        let hq = &mut *ptr;
        let (p, cap, len, head) = hq.bars().low().raw_parts();
        HqColumnF64 {
            ptr: p,
            capacity: cap,
            len,
            head,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_volume_column(ptr: *mut HQuant) -> HqColumnF64 {
    ffi_catch(empty_col_f64(), || {
        if ptr.is_null() {
            return empty_col_f64();
        }
        let hq = &mut *ptr;
        let (p, cap, len, head) = hq.bars().volume().raw_parts();
        HqColumnF64 {
            ptr: p,
            capacity: cap,
            len,
            head,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_buy_volume_column(ptr: *mut HQuant) -> HqColumnF64 {
    ffi_catch(empty_col_f64(), || {
        if ptr.is_null() {
            return empty_col_f64();
        }
        let hq = &mut *ptr;
        let (p, cap, len, head) = hq.bars().buy_volume().raw_parts();
        HqColumnF64 {
            ptr: p,
            capacity: cap,
            len,
            head,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_timestamp_column(ptr: *mut HQuant) -> HqColumnI64 {
    ffi_catch(empty_col_i64(), || {
        if ptr.is_null() {
            return empty_col_i64();
        }
        let hq = &mut *ptr;
        let (p, cap, len, head) = hq.bars().timestamp().raw_parts();
        HqColumnI64 {
            ptr: p,
            capacity: cap,
            len,
            head,
        }
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_indicator_last(ptr: *mut HQuant, id: u32) -> IndicatorValue {
    ffi_catch(IndicatorValue::scalar(f64::NAN), || {
        if ptr.is_null() {
            return IndicatorValue::scalar(f64::NAN);
        }
        let hq = &mut *ptr;
        hq.indicator_last(IndicatorId(id))
            .unwrap_or(IndicatorValue::scalar(f64::NAN))
    })
}

#[no_mangle]
pub unsafe extern "C" fn hquant_signals_len(ptr: *mut HQuant) -> usize {
    ffi_catch(0, || {
        if ptr.is_null() {
            return 0;
        }
        let hq = &mut *ptr;
        hq.signals_len()
    })
}

/// Drains up to `cap` signals into `out` and returns the count written.
#[no_mangle]
pub unsafe extern "C" fn hquant_poll_signals(ptr: *mut HQuant, out: *mut Signal, cap: usize) -> usize {
    ffi_catch(0, || {
        if out.is_null() || cap == 0 {
            return 0;
        }
        if ptr.is_null() {
            return 0;
        }
        let hq = &mut *ptr;
        // Safety: caller promises `out` points to `cap` writable `Signal`s.
        let out_slice = unsafe { core::slice::from_raw_parts_mut(out, cap) };
        hq.poll_signals_into(out_slice)
    })
}

// ===== Backtest C ABI =====

#[no_mangle]
pub extern "C" fn hq_backtest_new(params: BacktestParams) -> *mut FuturesBacktest {
    ffi_catch(core::ptr::null_mut(), || match FuturesBacktest::try_new(params) {
        Some(bt) => Box::into_raw(Box::new(bt)),
        None => core::ptr::null_mut(),
    })
}

#[no_mangle]
pub unsafe extern "C" fn hq_backtest_free(ptr: *mut FuturesBacktest) {
    let _ = ffi_catch((), || {
        if !ptr.is_null() {
            drop(Box::from_raw(ptr));
        }
    });
}

#[no_mangle]
pub unsafe extern "C" fn hq_backtest_apply_signal(
    ptr: *mut FuturesBacktest,
    action: crate::Action,
    price: f64,
    margin: f64,
) {
    let _ = ffi_catch((), || {
        if ptr.is_null() {
            return;
        }
        let bt = &mut *ptr;
        bt.apply_signal(action, price, margin);
    });
}

#[no_mangle]
pub unsafe extern "C" fn hq_backtest_on_price(ptr: *mut FuturesBacktest, price: f64) {
    let _ = ffi_catch((), || {
        if ptr.is_null() {
            return;
        }
        let bt = &mut *ptr;
        bt.on_price(price);
    });
}

#[no_mangle]
pub unsafe extern "C" fn hq_backtest_result(
    ptr: *mut FuturesBacktest,
    price: f64,
) -> crate::backtest::BacktestResult {
    ffi_catch(
        crate::backtest::BacktestResult {
            equity: f64::NAN,
            profit: f64::NAN,
            profit_rate: f64::NAN,
            max_drawdown_rate: f64::NAN,
            liquidated: true,
        },
        || {
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
        },
    )
}
