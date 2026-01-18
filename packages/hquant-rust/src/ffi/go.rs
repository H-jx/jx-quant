//! 简单 C ABI，便于 Go 通过 cgo 调用

use std::ffi::CStr;
use std::os::raw::{c_char, c_double, c_int};

use crate::{Bar, QuantEngine};

#[repr(C)]
pub struct FfiBar {
    pub timestamp: i64,
    pub open: c_double,
    pub high: c_double,
    pub low: c_double,
    pub close: c_double,
    pub volume: c_double,
}

fn bar_from_ffi(bar: &FfiBar) -> Bar {
    Bar {
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
    }
}

/// 创建引擎实例，需配合 `hquant_engine_free` 释放
#[no_mangle]
pub extern "C" fn hquant_engine_new(capacity: usize) -> *mut QuantEngine {
    Box::into_raw(Box::new(QuantEngine::new(capacity)))
}

/// 释放引擎实例
#[no_mangle]
pub extern "C" fn hquant_engine_free(ptr: *mut QuantEngine) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(Box::from_raw(ptr));
    }
}

/// 追加一根 K 线
#[no_mangle]
pub extern "C" fn hquant_engine_append_bar(ptr: *mut QuantEngine, bar: FfiBar) {
    if ptr.is_null() {
        return;
    }
    let engine = unsafe { &mut *ptr };
    engine.append_bar(&bar_from_ffi(&bar));
}

/// 更新最后一根 K 线
#[no_mangle]
pub extern "C" fn hquant_engine_update_last_bar(ptr: *mut QuantEngine, bar: FfiBar) {
    if ptr.is_null() {
        return;
    }
    let engine = unsafe { &mut *ptr };
    engine.update_last_bar(&bar_from_ffi(&bar));
}

/// 判断指标是否就绪
#[no_mangle]
pub extern "C" fn hquant_engine_indicator_ready(ptr: *mut QuantEngine, name: *const c_char) -> c_int {
    if ptr.is_null() || name.is_null() {
        return 0;
    }
    let engine = unsafe { &mut *ptr };
    let cname = unsafe { CStr::from_ptr(name) };
    if let Ok(name_str) = cname.to_str() {
        return if engine.indicator_ready(name_str) { 1 } else { 0 };
    }
    0
}

/// 获取指标值；返回 1 表示成功并将结果写入 out_val
#[no_mangle]
pub extern "C" fn hquant_engine_indicator_value(
    ptr: *mut QuantEngine,
    name: *const c_char,
    out_val: *mut c_double,
) -> c_int {
    if ptr.is_null() || name.is_null() || out_val.is_null() {
        return 0;
    }
    let engine = unsafe { &mut *ptr };
    let cname = unsafe { CStr::from_ptr(name) };
    if let Ok(name_str) = cname.to_str() {
        if let Some(val) = engine.indicator_value(name_str) {
            unsafe {
                *out_val = val;
            }
            return 1;
        }
    }
    0
}

/// 重置引擎
#[no_mangle]
pub extern "C" fn hquant_engine_reset(ptr: *mut QuantEngine) {
    if ptr.is_null() {
        return;
    }
    let engine = unsafe { &mut *ptr };
    engine.reset();
}
