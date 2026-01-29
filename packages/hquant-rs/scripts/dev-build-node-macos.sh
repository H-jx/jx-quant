#!/usr/bin/env bash
set -euo pipefail

# Builds the napi-rs addon from `hquant-rs` (feature: ffi-node) and copies it to repo root
# as `hquant.node` for quick dev.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$CRATE_DIR"
cargo build --release --features ffi-node

cp "target/release/libhquant_rs.dylib" "$ROOT_DIR/hquant.node"
echo "Wrote $ROOT_DIR/hquant.node"

