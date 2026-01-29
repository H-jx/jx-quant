#!/usr/bin/env bash
set -euo pipefail

# Builds the PyO3 extension from `hquant-rs` (feature: ffi-python) and copies it to repo root
# for quick dev imports.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

EXT_SUFFIX="$(python3 -c "import sysconfig; print(sysconfig.get_config_var('EXT_SUFFIX') or '')")"
if [[ -z "$EXT_SUFFIX" ]]; then
  echo "Could not determine Python EXT_SUFFIX" >&2
  exit 1
fi

cd "$CRATE_DIR"
cargo build --release --features ffi-python

cp "target/release/libhquant_rs.dylib" "$ROOT_DIR/hquant_py_native${EXT_SUFFIX}"
echo "Wrote $ROOT_DIR/hquant_py_native${EXT_SUFFIX}"

