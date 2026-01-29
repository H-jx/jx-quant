# hquant-js (WIP)

Node.js wrapper for `hquant-rs`.

This repo currently exposes a stable C ABI from Rust (`packages/hquant-rs/include/hquant.h`).

Roadmap:

1) Minimal JS wrapper using a dynamic library loader (e.g. `ffi-napi`) for development.
2) Production wrapper using N-API (recommended) to support **zero-copy** `Float64Array` via external `ArrayBuffer`.

## Build native addon (napi-rs)

The N-API addon lives in `packages/hquant-node` (Rust).

Build:

```bash
cd packages/hquant-node
cargo build --release
```

On macOS this produces a dylib like:

`packages/hquant-node/target/release/libhquant_node.dylib`

Rename it to `.node` (Node can load it):

```bash
cp packages/hquant-node/target/release/libhquant_node.dylib ./hquant.node
```

Then run Node with:

```bash
export HQUANT_NATIVE_PATH=$PWD/hquant.node
```

JS API loads `process.env.HQUANT_NATIVE_PATH` first.

Convenience script (macOS):

`packages/hquant-node/scripts/dev-build-macos.sh`
