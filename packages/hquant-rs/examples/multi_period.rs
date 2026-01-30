use hquant_rs::indicator::IndicatorSpec;
use hquant_rs::multi::MultiHQuant;
use hquant_rs::period::Period;
use hquant_rs::{Bar, Field};

fn main() {
    // Define the periods we want to maintain internally.
    // IMPORTANT: `Bar.timestamp` is treated as "open_time in milliseconds" by the aggregator.
    let p15m = Period::parse("15m").unwrap();
    let p4h = Period::parse("4h").unwrap();

    // Multi-period runtime:
    // - you feed base bars (can be 1m/5m/15m/etc, as long as timestamps are non-decreasing)
    // - it aggregates into `p15m` and `p4h`
    // - each period has its own internal `HQuant` engine
    let mut mq = MultiHQuant::new(1024, vec![p15m, p4h]);

    // 1) Per-period strategy: attach directly to the 15m engine.
    {
        let hq15 = mq.engine_mut(p15m.as_ms()).unwrap();
        let _rsi15 = hq15.add_indicator(IndicatorSpec::Rsi { period: 14 });
        let _ema15 = hq15.add_indicator(IndicatorSpec::Ema {
            field: Field::Close,
            period: 20,
        });

        hq15.add_strategy(
            "rsi_15m",
            r#"
            IF RSI(14) < 30 THEN BUY
            IF RSI(14) > 70 THEN SELL
            "#,
        )
        .unwrap();
    }

    // 2) Cross-period strategy: reference other timeframe via `@<period>` suffix.
    // - `RSI(14)` has no suffix => defaults to the *first* period you passed into MultiHQuant (here: 15m)
    // - `SMA(close@4h, period=1)` is computed on the 4h engine
    mq.add_multi_strategy(
        "dip_buy_with_4h_filter",
        r#"
        IF RSI(14) < 30 AND SMA(close@4h, period=1) > 150 THEN BUY
        "#,
    )
    .unwrap();

    // Feed synthetic 15m bars for ~50 hours (200 * 15m).
    // The first segment trends down (RSI tends to go low), then trends up (RSI tends to go high).
    let step_ms = p15m.as_ms();
    for i in 0..200i64 {
        let close = if i < 80 {
            200.0 - (i as f64) * 0.8
        } else {
            136.0 + ((i - 80) as f64) * 0.9
        };

        mq.feed_bar(Bar::new(
            i * step_ms,
            close,
            close,
            close,
            close,
            1000.0,
            0.0,
        ));

        // Poll and print signals as they occur.
        for s in mq.poll_signals() {
            let period_idx = (s.strategy_id >> 16) as u16;
            let local_id = (s.strategy_id & 0xffff) as u16;
            println!(
                "ts={} action={:?} strategy=(period_idx={}, local_id={})",
                s.timestamp, s.action, period_idx, local_id
            );
        }
    }

    // Flush any in-progress candles (optional, but handy at end-of-stream).
    mq.flush();
    for s in mq.poll_signals() {
        let period_idx = (s.strategy_id >> 16) as u16;
        let local_id = (s.strategy_id & 0xffff) as u16;
        println!(
            "(flush) ts={} action={:?} strategy=(period_idx={}, local_id={})",
            s.timestamp, s.action, period_idx, local_id
        );
    }

    // Inspect latest values (optional):
    let hq4h = mq.engine(p4h.as_ms()).unwrap();
    println!("4h_bars={}", hq4h.len());
}
