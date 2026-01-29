//! FFI module.
//!
//! - `c`: minimal C ABI (stable surface for other languages)
//! - `node`: N-API addon (feature: `ffi-node`)
//! - `python`: PyO3 extension module (feature: `ffi-python`)

pub mod c;

#[cfg(feature = "ffi-node")]
pub mod node;

#[cfg(feature = "ffi-python")]
pub mod python;
