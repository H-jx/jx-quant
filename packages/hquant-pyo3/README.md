# hquant-pyo3 (PyO3)

Python extension module `hquant_py_native` for `hquant-rs`.

Build:

```bash
cd packages/hquant-pyo3
cargo build --release
```

Runtime requirements:

- Python needs `numpy` installed to use `HQuant.close_column()` (zero-copy view via NumPy C-API).

Dev import (macOS):

```bash
cp target/release/libhquant_py_native.dylib ../../hquant_py_native.cpython-39-darwin.so
python3 -c \"import hquant_py_native; print(hquant_py_native.HQuant)\"
```

