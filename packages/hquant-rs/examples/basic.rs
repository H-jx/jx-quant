use hquant_rs::engine::HQuant;
use hquant_rs::indicator::IndicatorSpec;
use hquant_rs::{Bar, Field};

fn main() {
    let mut hq = HQuant::new(1024);
    let rsi = hq.add_indicator(IndicatorSpec::Rsi { period: 14 });
    let _ema = hq.add_indicator(IndicatorSpec::Ema {
        field: Field::Close,
        period: 20,
    });
    hq.add_strategy("rsi", "IF RSI(14) < 30 THEN BUY\nIF RSI(14) > 70 THEN SELL")
        .unwrap();

    for i in 0..200 {
        let close = 100.0 + (i as f64 * 0.01);
        hq.push_kline(Bar::new(
            i,
            close,
            close,
            close,
            close,
            1000.0,
            0.0,
        ));
    }

    println!("rsi_last={}", hq.indicator_last(rsi).unwrap().a);
    println!("signals={}", hq.signals_len());
}

