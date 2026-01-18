//! 语言绑定入口
//!
//! - Node.js: `ffi-node` feature，使用 `napi-rs`
//! - Python: `ffi-python` feature，使用 `PyO3`
//! - Go: `ffi-go` feature，导出 C ABI 供 cgo 使用

#[cfg(feature = "ffi-node")]
pub mod node;

#[cfg(feature = "ffi-python")]
pub mod python;

#[cfg(feature = "ffi-go")]
pub mod go;
