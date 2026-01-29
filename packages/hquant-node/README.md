# hquant-node (napi-rs)

Node.js N-API addon for `hquant-rs`.

Build:

```bash
cd packages/hquant-node
cargo build --release
```

On macOS, copy/rename the output so Node can load it:

```bash
cp target/release/libhquant_node.dylib ../../hquant.node
```

Then in JS:

```bash
export HQUANT_NATIVE_PATH=$PWD/hquant.node
```

`packages/hquant-js` loads `HQUANT_NATIVE_PATH` first.

