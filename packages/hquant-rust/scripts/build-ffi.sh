#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${ROOT}/target/release"

usage() {
  cat <<'EOF'
Usage: scripts/build-ffi.sh [node|python|go|all]

Build helper for language bindings:
  node    Build napi-rs module (copies to target/release/hquant.node)
  python  Build PyO3 extension (keeps wheel via maturin if available, else copies to hquant_py.so)
  go      Build C ABI for cgo (libhquant.*)
  all     Build all of the above
EOF
}

detect_lib_ext() {
  case "$(uname -s)" in
    Darwin) echo "dylib" ;;
    MINGW*|MSYS*|CYGWIN*) echo "dll" ;;
    *) echo "so" ;;
  esac
}

build_node() {
  echo "==> Building Node.js module (ffi-node)..."
  (cd "${ROOT}" && cargo build --release ${CARGO_FEATURES:-})
  local ext
  ext="$(detect_lib_ext)"
  local src="${TARGET}/libhquant.${ext}"
  local dst="${TARGET}/hquant.node"
  if [[ -f "${src}" ]]; then
    cp "${src}" "${dst}"
    echo "Copied ${src} -> ${dst}"
  else
    echo "Warning: could not find ${src}"
  fi
}

build_python() {
  echo "==> Building Python module (ffi-python)..."
  if command -v maturin >/dev/null 2>&1; then
    (cd "${ROOT}" && maturin develop ${CARGO_FEATURES:-})
    echo "Installed into current Python env via maturin develop."
    return
  fi

  (cd "${ROOT}" && cargo build --release ${CARGO_FEATURES:-})
  local ext pyext
  ext="$(detect_lib_ext)"
  # Python extension suffix is .so for Unix-like platforms, .pyd on Windows
  case "${ext}" in
    dll) pyext="pyd" ;;
    *) pyext="so" ;;
  esac
  local src="${TARGET}/libhquant.${ext}"
  local dst="${TARGET}/hquant_py.${pyext}"
  if [[ -f "${src}" ]]; then
    cp "${src}" "${dst}"
    echo "Copied ${src} -> ${dst}"
    echo "You can add target/release to PYTHONPATH and import hquant_py."
  else
    echo "Warning: could not find ${src}"
  fi
}

build_go() {
  echo "==> Building Go C ABI (ffi-go)..."
  (cd "${ROOT}" && cargo build --release ${CARGO_FEATURES:-})
  local ext
  ext="$(detect_lib_ext)"
  local lib="${TARGET}/libhquant.${ext}"
  if [[ -f "${lib}" ]]; then
    echo "Built ${lib} (link with cgo via -L${TARGET} -lhquant)"
  else
    echo "Warning: could not find ${lib}"
  fi
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

case "$1" in
  node)
    export CARGO_FEATURES="--no-default-features --features ffi-node"
    build_node
    ;;
  python)
    export CARGO_FEATURES="--no-default-features --features ffi-python"
    build_python
    ;;
  go)
    export CARGO_FEATURES="--no-default-features --features ffi-go"
    build_go
    ;;
  all)
    export CARGO_FEATURES="--no-default-features --features ffi-node"
    build_node
    export CARGO_FEATURES="--no-default-features --features ffi-python"
    build_python
    export CARGO_FEATURES="--no-default-features --features ffi-go"
    build_go
    ;;
  *) usage; exit 1 ;;
esac
