# hquant-py (WIP)

Python wrapper for `hquant-rs`.

- Default: `ctypes` wrapper (`hquant_py/api.py`) for quick local dev.
- Optional: PyO3 native module (`packages/hquant-pyo3`) for lower overhead + NumPy zero-copy views.

Zero-copy note:

- `hquant-rs` exposes raw column pointers + ring metadata.
- We can build a NumPy view (`numpy.ctypeslib.as_array`) over the backing buffer with **zero-copy**.
- Chronological order is not contiguous when the ring wraps; `HQuant.close_ordered_slices()` returns 2 zero-copy slices for (oldest->newest).

## Quick start (local dev)

1) Build the Rust dylib:

```bash
cd packages/hquant-rs
cargo build --release
```

2) Point Python to the dylib:

```bash
export HQUANT_RS_LIB=packages/hquant-rs/target/release/libhquant_rs.dylib
```

3) Use the wrapper:

```python
from hquant_py import HQuant, Bar

hq = HQuant(capacity=1024)
rsi = hq.add_rsi(14)
hq.push_bar(Bar(ts=0, open=1, high=1, low=1, close=1, volume=1, buy_volume=0))
print(hq.indicator_last(rsi))
```

## PyO3 native module (NumPy required)

Build:

```bash
cd packages/hquant-pyo3
cargo build --release
```

Install NumPy in your Python env (required for `close_column()`):

```bash
python3 -m pip install numpy
```

Then make `hquant_py_native` importable (one simple dev approach is to copy/rename the dylib to a Python extension in your working dir).

Convenience script (macOS):

`packages/hquant-pyo3/scripts/dev-build-macos.sh`
