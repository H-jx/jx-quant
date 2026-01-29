# hquant-rs

Rust core for a high-performance quant runtime (indicators / strategies / backtest).

Status: early WIP. Design notes live in `packages/hquant-rs/TODO.md`.

## Rust API (smoke)

```rust
use hquant_rs::engine::HQuant;
use hquant_rs::indicator::IndicatorSpec;
use hquant_rs::{Bar, Field};

let mut hq = HQuant::new(1024);
let _rsi = hq.add_indicator(IndicatorSpec::Rsi { period: 14 });
let _ema = hq.add_indicator(IndicatorSpec::Ema { field: Field::Close, period: 20 });
hq.add_strategy("rsi", "IF RSI(14) < 30 THEN BUY\nIF RSI(14) > 70 THEN SELL").unwrap();

hq.push_kline(Bar::new(1, 100.0, 101.0, 99.0, 100.5, 1234.0, 0.0));
let signals = hq.poll_signals();
```

## Multi-period Aggregator

See:

- `hquant_rs::aggregator::Aggregator`
- `hquant_rs::multi::MultiHQuant` (routes aggregated candles into per-period `HQuant`)

Example idea:

```rust
use hquant_rs::multi::MultiHQuant;
use hquant_rs::period::Period;
use hquant_rs::Bar;

let p15m = Period::parse("15m").unwrap();
let p4h = Period::parse("4h").unwrap();
let mut mq = MultiHQuant::new(1024, vec![p15m, p4h]);

mq.feed_bar(Bar::new(0, 100.0, 101.0, 99.0, 100.5, 123.0, 0.0));
let sigs = mq.poll_signals();
```

## C ABI (for Node/Python wrappers)

This crate also builds a `cdylib` and exports a minimal C ABI in `hquant_rs::ffi::c`.

FFI notes:

- Functions return `NULL` / `0` on invalid inputs (instead of panicking across the ABI boundary).
- Strategy DSL strings must be UTF-8.

Key functions:

- `hquant_new` / `hquant_free`
- `hquant_add_*` (RSI/EMA/SMA/StdDev/Boll/MACD)
- `hquant_push_bar` / `hquant_update_last_bar`
- `hquant_indicator_last`
- `hquant_poll_signals`
- `hquant_*_column` (returns raw pointer + ring metadata for zero-copy column access)

Ring columns are not always chronologically contiguous. Use `(capacity,len,head)` to reconstruct
the ordered view (or copy in the wrapper).

## Strategy DSL

The condition expression inside `IF ... THEN ...` is parsed via `pest` grammar in `src/strategy/dsl.pest`.
