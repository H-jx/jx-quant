# hquant-rs / LLM_TECH_SPEC

## Package
- crate: `hquant-rs`
- lib name: `hquant_rs`
- features:
  - `ffi-node`: N-API addon (napi-rs)
  - `ffi-python`: PyO3 extension module (+ numpy)
- deps (core): `pest`, `pest_derive`
- optional deps:
  - node: `napi`, `napi-derive`, `napi-sys`, build: `napi-build`
  - python: `pyo3` (`extension-module`), `numpy`
- entry: `packages/hquant-rs/src/lib.rs`

## Module Map
- `packages/hquant-rs/src/types.rs`: `Bar`, `Field`, `Action`, `Signal`
- `packages/hquant-rs/src/circular.rs`: `CircularColumn<T>` fixed-cap ring
- `packages/hquant-rs/src/kline_buffer.rs`: `KlineBuffer` SoA ring of bars
- `packages/hquant-rs/src/indicator/mod.rs`: `IndicatorGraph`, `IndicatorSpec`, `IndicatorValue`
- `packages/hquant-rs/src/strategy/mod.rs`: strategy DSL compile/eval
- `packages/hquant-rs/src/engine.rs`: `HQuant` runtime
- `packages/hquant-rs/src/period.rs`: `Period`
- `packages/hquant-rs/src/aggregator.rs`: `Aggregator` multi-period candle aggregation
- `packages/hquant-rs/src/multi.rs`: `MultiHQuant` multi-period runtime
- `packages/hquant-rs/src/backtest.rs`: `FuturesBacktest` futures backtest
- `packages/hquant-rs/src/ffi/c.rs`: C ABI
- `packages/hquant-rs/src/ffi/node.rs`: Node addon (feature `ffi-node`)
- `packages/hquant-rs/src/ffi/python.rs`: Python module (feature `ffi-python`)
- `packages/hquant-rs/include/hquant.h`: C header

## Core Types (Rust)
- `Bar` (`packages/hquant-rs/src/types.rs`)
  - `#[repr(C)]`
  - fields:
    - `timestamp: i64` (ms; semantics depend on caller; in `Aggregator` treated as open_time)
    - `open/high/low/close: f64`
    - `volume: f64`
    - `buy_volume: f64`
  - constructor: `Bar::new(timestamp, open, high, low, close, volume, buy_volume) -> Bar`
- `Field` (`#[repr(u8)]`): `Open|High|Low|Close|Volume|BuyVolume`
- `Action` (`#[repr(u8)]`): `Buy=1|Sell=2|Hold=3`
- `Signal` (`#[repr(C)]`): `{ strategy_id: u32, action: Action, timestamp: i64 }`

## Storage
### `CircularColumn<T>` (`packages/hquant-rs/src/circular.rs`)
- generic: `T: Copy + Default`
- ring metadata:
  - `capacity: usize` (fixed; `>0`)
  - `len: usize` (`<= capacity`)
  - `head: usize` (next write index into backing storage)
- methods:
  - `new(capacity) -> Self`
  - `capacity()`, `len()`, `is_empty()`, `is_full()`
  - `push(v)` (overwrites oldest when full)
  - `update_last(v)` (no-op if empty)
  - `get(i)` (index from oldest, `0..len`)
  - `get_from_end(i)` (index from newest)
  - `raw_parts() -> (*const T, capacity, len, head)` (order may wrap)
  - `to_vec_ordered() -> Vec<T>` (copy, chronological oldest->newest)

### `KlineBuffer` (`packages/hquant-rs/src/kline_buffer.rs`)
- SoA ring for `Bar` columns:
  - `timestamp: CircularColumn<i64>`
  - `open/high/low/close/volume/buy_volume: CircularColumn<f64>`
- methods:
  - `new(capacity) -> Self`
  - `capacity()`, `len()`, `is_empty()`
  - `push(bar)`
  - `update_last(bar) -> Option<Bar>` (returns previous last)
  - `get(i) -> Option<Bar>` (index from oldest)
  - `last() -> Option<Bar>`
  - `get_f64(field, i) -> Option<f64>`
  - `last_f64(field) -> Option<f64>`
  - column accessors: `close()/open()/high()/low()/volume()/buy_volume()/timestamp() -> &CircularColumn<_>`

## Indicators
### Specs and Values (`packages/hquant-rs/src/indicator/mod.rs`)
- `IndicatorId(u32)`
- `IndicatorSpec` (hashable, used for auto-dedup):
  - `Sma { field: Field, period: usize }`
  - `Ema { field: Field, period: usize }`
  - `StdDev { field: Field, period: usize }`
  - `Rsi { period: usize }` (close only)
  - `Boll { period: usize, k_bits: u64 }` (uses `SMA(close,period)` + `StdDev(close,period)`)
    - helper: `IndicatorSpec::boll(period, k: f64) -> Self` (stores `k.to_bits()`)
  - `Macd { fast: usize, slow: usize, signal: usize }`
    - computes `macd = ema_fast - ema_slow`, `signal = ema(macd, signal)`, `hist = macd - signal`
- `IndicatorValueKind` (`#[repr(u8)]`): `Scalar=1|Triple=2`
- `IndicatorValue` (`#[repr(C)]`): `{ kind, a, b, c }`
  - scalar: `a = value`, `b/c = NaN`
  - triple: `a/b/c = (a,b,c)` as defined by indicator
    - `Boll`: `(upper, mid, lower)`
    - `Macd`: `(macd, signal, hist)`

### `IndicatorGraph` (`packages/hquant-rs/src/indicator/mod.rs`)
- role: indicator DAG + output ring columns; auto-dedup by `IndicatorSpec`
- constructors:
  - `IndicatorGraph::new(capacity) -> Self`
- methods:
  - `add(spec: IndicatorSpec) -> IndicatorId` (dedup; ensures deps are added first)
  - `last_value(id) -> Option<IndicatorValue>`
  - `on_push(bars: &KlineBuffer)` (exec in topo insertion order)
  - `on_update_last(old_bar, new_bar, bars)` (recompute last values incrementally)
- warmup semantics: many indicators output `NaN` until enough history.



## Engine (single-period)
### `HQuant` (`packages/hquant-rs/src/engine.rs`)
- state:
  - `bars: KlineBuffer` (SoA ring)
  - `indicators: IndicatorGraph` (dedup + outputs)
  - `strategies: Vec<CompiledStrategy>`
  - `signals: VecDeque<Signal>`
- API:
  - `HQuant::new(capacity: usize) -> Self`
  - `capacity() -> usize`
  - `len() -> usize`
  - `bars() -> &KlineBuffer` (read-only view)
  - `add_indicator(spec: IndicatorSpec) -> IndicatorId`
  - `indicator_last(id: IndicatorId) -> Option<IndicatorValue>`
  - `add_strategy(name: &str, dsl: &str) -> Result<u32, StrategyError>` (allocates monotonically increasing ids)
  - `push_kline(bar: Bar)`:
    - push to `bars`
    - `indicators.on_push(&bars)`
    - eval all strategies (emit 0..N signals)
  - `update_last(bar: Bar)`:
    - replace last bar if exists
    - `indicators.on_update_last(old_bar, new_bar, &bars)`
    - eval strategies
  - `poll_signals() -> Vec<Signal>` (drain all)
  - `signals_len() -> usize`
  - `poll_signals_into(out: &mut [Signal]) -> usize` (drain up to `out.len()`)

## Period
### `Period` (`packages/hquant-rs/src/period.rs`)
- `Period::parse("15m"|"4h"|"500ms"|...) -> Result<Period, &'static str>`
  - units supported: `ms|s|m|h|d`
- `as_ms() -> i64`
- `bucket_start(ts_ms) -> i64` (floor to boundary; uses integer division)

## Aggregation (multi-period candles)
### `Aggregator` (`packages/hquant-rs/src/aggregator.rs`)
- constructor: `Aggregator::new(periods: Vec<Period>)` (requires non-empty)
- input: `push(bar: Bar)`
  - treats `bar.timestamp` as `open_time` (ms)
  - assumes non-decreasing timestamps
- per period maintains `current` candle; on each push emits events:
  - `AggregatorEventKind::KlineUpdated`
  - `AggregatorEventKind::KlineClosed` (bucket boundary switch or flush)
- `flush()` closes all in-progress candles
- `poll_events() -> Vec<AggregatorEvent>` drains queue
- `AggregateCandle` fields:
  - `open_time`, `close_time`, `open/high/low/close`, `volume`, `buy_volume`, `last_update_ts`
  - `as_bar_open_time() -> Bar` with `timestamp = open_time`

## Multi-period runtime
### `MultiHQuant` (`packages/hquant-rs/src/multi.rs`)
- constructor: `MultiHQuant::new(capacity, periods: Vec<Period>)`
  - creates `HQuant` per period (keyed by `period_ms`)
  - period index mapping: `idx=1..` for per-period engines; `idx=0` reserved for multi-strategies
- accessors:
  - `engine(period_ms) -> Option<&HQuant>`
  - `engine_mut(period_ms) -> Option<&mut HQuant>`
- ingestion:
  - `feed_bar(bar)`:
    - `Aggregator::push(bar)` => events
    - routes events into each period engine:
      - `KlineUpdated`: `update_last` if same `open_time` else `push_kline`
      - `KlineClosed`: ensures final candle written (update_last/push_kline)
    - collects per-period signals and encodes ids
    - evaluates cross-period strategies after routing events
  - `flush()` => closes all buckets then routes
- cross-period strategies:
  - `add_multi_strategy(name, dsl) -> Result<u32, StrategyError>`
  - indicator resolver:
    - reads `@suffix` on series refs, else uses default period = first `period_order` element
    - registers indicator on the referenced period engine
- signal id encoding:
  - `strategy_id = ((period_idx as u32) << 16) | (local_id & 0xffff)`
  - `period_idx=0`: multi-strategy
  - `period_idx>=1`: per-period engine strategy
- output:
  - `poll_signals() -> Vec<Signal>` drains multi queue

## Backtest (futures)
### `FuturesBacktest` (`packages/hquant-rs/src/backtest.rs`)
- params: `BacktestParams` (`#[repr(C)]`)
  - `initial_margin: f64` (`>0`)
  - `leverage: f64` (`>=1`)
  - `contract_size: f64` (`>0`)
  - `maker_fee_rate: f64` (`>=0`)
  - `taker_fee_rate: f64` (`>=0`)
  - `maintenance_margin_rate: f64` (`>=0`)
  - `is_valid() -> bool` (finite + range checks)
- result: `BacktestResult` (`#[repr(C)]`)
  - `equity`, `profit`, `profit_rate`, `max_drawdown_rate` (negative), `liquidated`
- behavior:
  - positions: separate `pos_long` and `pos_short` (can both exist)
  - `apply_signal(action, price, margin)`:
    - `BUY`: close short then open/merge long
    - `SELL`: close long then open/merge short
    - `HOLD`: no-op
    - then `on_price(price)` (updates drawdown + liquidation)
  - liquidation: if `equity(price) <= maintenance_margin(price)` => `liquidated=true`, clear positions, cash=0
- APIs:
  - `new(params)`, `try_new(params) -> Option<Self>`
  - `cash()`, `liquidated()`
  - `max_open_margin(fee_rate)`
  - `open_long/open_short/close_long/close_short`
  - `equity(price)`, `locked_margin()`, `total_notional(price)`, `maintenance_margin(price)`
  - `result(price) -> BacktestResult`

## FFI: C ABI
### Build
- artifacts: `cdylib` (`libhquant_rs.{dylib,so,dll}`)
- header: `packages/hquant-rs/include/hquant.h`
- implementation: `packages/hquant-rs/src/ffi/c.rs`
- error handling:
  - exported functions use `catch_unwind`; return `NULL/0/NaN/default` on panic or invalid inputs

### Types (C) (`packages/hquant-rs/include/hquant.h`)
- opaque: `HQuant`, `FuturesBacktest`
- `Bar` matches Rust `#[repr(C)]`
- `Action` matches Rust `#[repr(u8)]`: `1/2/3`
- `Signal` matches Rust `#[repr(C)]`
- `IndicatorValueKind` matches Rust `#[repr(u8)]`: `1/2`
- `IndicatorValue` matches Rust `#[repr(C)]`
- ring column views:
  - `HqColumnF64 { ptr, capacity, len, head }`
  - `HqColumnI64 { ptr, capacity, len, head }`
  - `ptr` points to backing storage of length `capacity` (chronological order may wrap)

### HQuant functions (C) (`packages/hquant-rs/include/hquant.h`)
- lifecycle:
  - `hquant_new(capacity) -> HQuant*` (NULL if `capacity==0`)
  - `hquant_free(HQuant*)`
- indicators (return `0` on invalid args):
  - `hquant_add_rsi(period)`
  - `hquant_add_ema_close(period)`
  - `hquant_add_sma_close(period)`
  - `hquant_add_stddev_close(period)`
  - `hquant_add_boll(period, k)`
  - `hquant_add_macd(fast, slow, signal)` (invalid if `fast>=slow`)
- strategies:
  - `hquant_add_strategy(name_utf8,name_len,dsl_utf8,dsl_len) -> u32` (0 on invalid UTF-8 or parse error)
- ingestion:
  - `hquant_push_bar(HQuant*, Bar)`
  - `hquant_update_last_bar(HQuant*, Bar)`
- info:
  - `hquant_len(HQuant*) -> size_t`
  - `hquant_capacity(HQuant*) -> size_t`
- columns (ring backing storage):
  - `hquant_{close,open,high,low,volume,buy_volume}_column(HQuant*) -> HqColumnF64`
  - `hquant_timestamp_column(HQuant*) -> HqColumnI64`
- indicator value:
  - `hquant_indicator_last(HQuant*, id) -> IndicatorValue` (scalar NaN when missing)
- signals:
  - `hquant_signals_len(HQuant*) -> size_t`
  - `hquant_poll_signals(HQuant*, Signal* out, size_t cap) -> size_t`

### Backtest functions (C) (`packages/hquant-rs/include/hquant.h`)
- lifecycle:
  - `hq_backtest_new(BacktestParams) -> FuturesBacktest*` (NULL if params invalid)
  - `hq_backtest_free(FuturesBacktest*)`
- ops:
  - `hq_backtest_apply_signal(FuturesBacktest*, Action, price, margin)`
  - `hq_backtest_on_price(FuturesBacktest*, price)`
  - `hq_backtest_result(FuturesBacktest*, price) -> BacktestResult` (NaNs if ptr null)

## FFI: Node (napi-rs)
### Build
- feature: `ffi-node`
- `packages/hquant-rs/build.rs` runs `napi_build::setup()` under `ffi-node`
- dev script (macOS): `packages/hquant-rs/scripts/dev-build-node-macos.sh`
  - command: `cargo build --release --features ffi-node`
  - copies `target/release/libhquant_rs.dylib` -> repo root `hquant.node`

### Exported JS APIs (`packages/hquant-rs/src/ffi/node.rs`)
- class `HQuant`:
  - `new(capacity: number)`
  - `add_rsi(period: number) -> number`
  - `add_ema_close(period: number) -> number`
  - `add_strategy(name: string, dsl: string) -> number`
  - `push_bar(bar: {timestamp,open,high,low,close,volume,buy_volume?})`
  - `update_last_bar(bar: ...)`
  - `indicator_last(id: number) -> {kind,a,b,c}`
  - `poll_signals() -> Array<{strategy_id, action: "BUY"|"SELL"|"HOLD", timestamp}>`
  - `len() -> number`
  - `capacity() -> number`
  - `*_column(env) -> { buffer: ArrayBuffer, capacity, len, head }` for `close/open/high/low/volume/buy_volume`
    - `buffer` is an external ArrayBuffer over the ring backing storage (byte length = `capacity * 8`)
    - caller reconstructs chronological order using `(capacity,len,head)`
- class `MultiHQuant`:
  - `new(capacity: number, periods: string[])` where `Period::parse` accepts `ms|s|m|h|d`
  - `feed_bar(bar)`
  - `flush()`
  - `add_multi_strategy(name: string, dsl: string) -> number`
  - `poll_signals() -> Signal[]` (strategy_id encoded)
- class `FuturesBacktest`:
  - `new(params: {initial_margin, leverage, contract_size, maker_fee_rate, taker_fee_rate, maintenance_margin_rate})`
  - `apply_signal(action: "BUY"|"SELL"|"HOLD", price: number, margin: number)`
  - `on_price(price: number)`
  - `result(price: number) -> {equity, profit, profit_rate, max_drawdown_rate, liquidated}`

## FFI: Python (PyO3)
### Build
- feature: `ffi-python`
- `packages/hquant-rs/build.rs` on macOS prints `-undefined dynamic_lookup` under `ffi-python`
- dev script (macOS): `packages/hquant-rs/scripts/dev-build-pyo3-macos.sh`
  - command: `cargo build --release --features ffi-python`
  - copies `target/release/libhquant_rs.dylib` -> repo root `hquant_py_native${EXT_SUFFIX}`

### Exported Python APIs (`packages/hquant-rs/src/ffi/python.rs`)
- module: `hquant_py_native`
- class `HQuant`:
  - `HQuant(capacity: int)`
  - `add_rsi(period: int) -> int`
  - `add_strategy(name: str, dsl: str) -> int`
  - `push_bar(timestamp, open, high, low, close, volume, buy_volume: Optional[float])`
  - `update_last_bar(timestamp, open, high, low, close, volume, buy_volume: Optional[float])`
  - `indicator_last(id: int) -> float` (returns scalar `a` or NaN)
  - `poll_signals() -> List[dict]` with keys `strategy_id/action/timestamp`
  - `close_column() -> (numpy.ndarray[float64], capacity:int, len:int, head:int)`
    - zero-copy view over ring backing storage; requires runtime importable `numpy`
- class `FuturesBacktest`:
  - `FuturesBacktest(initial_margin, leverage, contract_size, maker_fee_rate, taker_fee_rate, maintenance_margin_rate)`
  - `apply_signal(action: str, price: float, margin: float)`
  - `on_price(price: float)`
  - `result(price: float) -> dict` with keys `equity/profit/profit_rate/max_drawdown_rate/liquidated`

## Build / Test Commands
- core tests: `cargo test` (from `packages/hquant-rs`)
- build core: `cargo build --release`
- build node: `cargo build --release --features ffi-node`
- build python: `cargo build --release --features ffi-python`

