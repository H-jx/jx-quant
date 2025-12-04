//! C FFI 接口
//!
//! 供 Go、Python 等语言通过 CGO/ctypes 调用

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_int, c_long};
use std::ptr;

use crate::indicators::{Indicator, MA, BOLL, RSI, MACD, ATR, VRI, BollResult, MacdResult};
use crate::indicators::ma::KlineField;
use crate::kline::{Kline, KlineFrame};

/// HQuant 上下文
pub struct HQuantContext {
    frame: KlineFrame,
    indicators: HashMap<String, Box<dyn Indicator + Send>>,
}

/// C 接口的 K 线结构
#[repr(C)]
pub struct HKline {
    pub open: c_double,
    pub close: c_double,
    pub high: c_double,
    pub low: c_double,
    pub volume: c_double,
    pub timestamp: c_long,
}

impl From<&HKline> for Kline {
    fn from(k: &HKline) -> Self {
        Kline {
            open: k.open,
            close: k.close,
            high: k.high,
            low: k.low,
            volume: k.volume,
            timestamp: k.timestamp as i64,
            buy: None,
            sell: None,
        }
    }
}

/// BOLL 结果
#[repr(C)]
pub struct HBollResult {
    pub up: c_double,
    pub mid: c_double,
    pub low: c_double,
}

/// MACD 结果
#[repr(C)]
pub struct HMacdResult {
    pub macd: c_double,
    pub signal: c_double,
    pub histogram: c_double,
}

// ============= 生命周期 =============

/// 创建 HQuant 上下文
#[no_mangle]
pub extern "C" fn hquant_new(capacity: c_int) -> *mut HQuantContext {
    let ctx = Box::new(HQuantContext {
        frame: KlineFrame::new(capacity as usize),
        indicators: HashMap::new(),
    });
    Box::into_raw(ctx)
}

/// 销毁 HQuant 上下文
#[no_mangle]
pub extern "C" fn hquant_free(ctx: *mut HQuantContext) {
    if !ctx.is_null() {
        unsafe {
            drop(Box::from_raw(ctx));
        }
    }
}

// ============= 添加指标 =============

/// 添加 MA 指标
#[no_mangle]
pub extern "C" fn hquant_add_ma(
    ctx: *mut HQuantContext,
    name: *const c_char,
    period: c_int,
    max_history: c_int,
) -> c_int {
    let ctx = unsafe { &mut *ctx };
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy().into_owned();

    let ma = MA::with_close(period as usize, max_history as usize);
    ctx.indicators.insert(name, Box::new(ma));
    0
}

/// 添加 BOLL 指标
#[no_mangle]
pub extern "C" fn hquant_add_boll(
    ctx: *mut HQuantContext,
    name: *const c_char,
    period: c_int,
    std_factor: c_double,
    max_history: c_int,
) -> c_int {
    let ctx = unsafe { &mut *ctx };
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy().into_owned();

    let boll = BOLL::new(period as usize, std_factor, max_history as usize);
    ctx.indicators.insert(name, Box::new(boll));
    0
}

/// 添加 RSI 指标
#[no_mangle]
pub extern "C" fn hquant_add_rsi(
    ctx: *mut HQuantContext,
    name: *const c_char,
    period: c_int,
    max_history: c_int,
) -> c_int {
    let ctx = unsafe { &mut *ctx };
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy().into_owned();

    let rsi = RSI::new(period as usize, max_history as usize);
    ctx.indicators.insert(name, Box::new(rsi));
    0
}

/// 添加 MACD 指标
#[no_mangle]
pub extern "C" fn hquant_add_macd(
    ctx: *mut HQuantContext,
    name: *const c_char,
    short_period: c_int,
    long_period: c_int,
    signal_period: c_int,
    max_history: c_int,
) -> c_int {
    let ctx = unsafe { &mut *ctx };
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy().into_owned();

    let macd = MACD::new(
        short_period as usize,
        long_period as usize,
        signal_period as usize,
        max_history as usize,
    );
    ctx.indicators.insert(name, Box::new(macd));
    0
}

/// 添加 ATR 指标
#[no_mangle]
pub extern "C" fn hquant_add_atr(
    ctx: *mut HQuantContext,
    name: *const c_char,
    period: c_int,
    max_history: c_int,
) -> c_int {
    let ctx = unsafe { &mut *ctx };
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy().into_owned();

    let atr = ATR::new(period as usize, max_history as usize);
    ctx.indicators.insert(name, Box::new(atr));
    0
}

/// 添加 VRI 指标
#[no_mangle]
pub extern "C" fn hquant_add_vri(
    ctx: *mut HQuantContext,
    name: *const c_char,
    period: c_int,
    max_history: c_int,
) -> c_int {
    let ctx = unsafe { &mut *ctx };
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy().into_owned();

    let vri = VRI::new(period as usize, max_history as usize);
    ctx.indicators.insert(name, Box::new(vri));
    0
}

// ============= 数据操作 =============

/// 添加单根 K 线
#[no_mangle]
pub extern "C" fn hquant_add_kline(ctx: *mut HQuantContext, kline: *const HKline) {
    let ctx = unsafe { &mut *ctx };
    let kline: Kline = unsafe { &*kline }.into();

    ctx.frame.push(&kline);

    // 更新所有指标
    for indicator in ctx.indicators.values_mut() {
        indicator.add(&kline);
    }
}

/// 更新最后一根 K 线
#[no_mangle]
pub extern "C" fn hquant_update_last(ctx: *mut HQuantContext, kline: *const HKline) {
    let ctx = unsafe { &mut *ctx };
    let kline: Kline = unsafe { &*kline }.into();

    ctx.frame.update_last(&kline);

    // 更新所有指标
    for indicator in ctx.indicators.values_mut() {
        indicator.update_last(&kline);
    }
}

/// 从 JSON 批量导入
#[no_mangle]
pub extern "C" fn hquant_import_json(
    ctx: *mut HQuantContext,
    json: *const c_char,
    len: c_int,
) -> c_int {
    let ctx = unsafe { &mut *ctx };
    let json_str = unsafe {
        let slice = std::slice::from_raw_parts(json as *const u8, len as usize);
        std::str::from_utf8_unchecked(slice)
    };

    match KlineFrame::from_json_flexible(json_str, ctx.frame.capacity()) {
        Ok(frame) => {
            // 逐条添加到指标
            for i in 0..frame.len() as i32 {
                if let Some(kline) = frame.get(i) {
                    for indicator in ctx.indicators.values_mut() {
                        indicator.add(&kline);
                    }
                }
            }
            ctx.frame = frame;
            0
        }
        Err(_) => -1,
    }
}

/// 从二进制批量导入
#[no_mangle]
pub extern "C" fn hquant_import_binary(
    ctx: *mut HQuantContext,
    data: *const u8,
    len: c_int,
) -> c_int {
    let ctx = unsafe { &mut *ctx };
    let bytes = unsafe { std::slice::from_raw_parts(data, len as usize) };

    match KlineFrame::from_binary(bytes) {
        Ok(frame) => {
            // 逐条添加到指标
            for i in 0..frame.len() as i32 {
                if let Some(kline) = frame.get(i) {
                    for indicator in ctx.indicators.values_mut() {
                        indicator.add(&kline);
                    }
                }
            }
            ctx.frame = frame;
            0
        }
        Err(_) => -1,
    }
}

// ============= 获取指标值 =============

/// 获取 MA 值
#[no_mangle]
pub extern "C" fn hquant_get_ma(
    ctx: *const HQuantContext,
    name: *const c_char,
    index: c_int,
) -> c_double {
    let ctx = unsafe { &*ctx };
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy();

    ctx.indicators
        .get(name.as_ref())
        .map(|ind| ind.get_value(index))
        .unwrap_or(f64::NAN)
}

/// 获取 RSI 值
#[no_mangle]
pub extern "C" fn hquant_get_rsi(
    ctx: *const HQuantContext,
    name: *const c_char,
    index: c_int,
) -> c_double {
    hquant_get_ma(ctx, name, index) // 通用接口
}

/// 获取 ATR 值
#[no_mangle]
pub extern "C" fn hquant_get_atr(
    ctx: *const HQuantContext,
    name: *const c_char,
    index: c_int,
) -> c_double {
    hquant_get_ma(ctx, name, index)
}

/// 获取 VRI 值
#[no_mangle]
pub extern "C" fn hquant_get_vri(
    ctx: *const HQuantContext,
    name: *const c_char,
    index: c_int,
) -> c_double {
    hquant_get_ma(ctx, name, index)
}

/// 获取 K 线数量
#[no_mangle]
pub extern "C" fn hquant_kline_count(ctx: *const HQuantContext) -> c_int {
    let ctx = unsafe { &*ctx };
    ctx.frame.len() as c_int
}

/// 获取指标历史长度
#[no_mangle]
pub extern "C" fn hquant_indicator_len(
    ctx: *const HQuantContext,
    name: *const c_char,
) -> c_int {
    let ctx = unsafe { &*ctx };
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy();

    ctx.indicators
        .get(name.as_ref())
        .map(|ind| ind.len() as c_int)
        .unwrap_or(0)
}

// ============= 导出二进制 =============

/// 导出为二进制格式
/// 返回值需要用 hquant_free_bytes 释放
#[no_mangle]
pub extern "C" fn hquant_export_binary(
    ctx: *const HQuantContext,
    out_len: *mut c_int,
) -> *mut u8 {
    let ctx = unsafe { &*ctx };
    let bytes = ctx.frame.to_binary();

    unsafe { *out_len = bytes.len() as c_int };

    let mut boxed = bytes.into_boxed_slice();
    let ptr = boxed.as_mut_ptr();
    std::mem::forget(boxed);
    ptr
}

/// 释放二进制数据
#[no_mangle]
pub extern "C" fn hquant_free_bytes(ptr: *mut u8, len: c_int) {
    if !ptr.is_null() {
        unsafe {
            let _ = Vec::from_raw_parts(ptr, len as usize, len as usize);
        }
    }
}
