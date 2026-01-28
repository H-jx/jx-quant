use crate::period::Period;
use crate::Bar;
use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AggregatorEventKind {
    KlineUpdated,
    KlineClosed,
}

#[derive(Debug, Clone, Copy)]
pub struct AggregateCandle {
    pub open_time: i64,
    pub close_time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub buy_volume: f64,
    pub last_update_ts: i64,
}

impl AggregateCandle {
    fn new(open_time: i64, close_time: i64, bar: Bar) -> Self {
        Self {
            open_time,
            close_time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
            buy_volume: bar.buy_volume,
            last_update_ts: bar.timestamp,
        }
    }

    fn merge(&mut self, bar: Bar) {
        self.high = self.high.max(bar.high);
        self.low = self.low.min(bar.low);
        self.close = bar.close;
        self.volume += bar.volume;
        self.buy_volume += bar.buy_volume;
        self.last_update_ts = bar.timestamp;
    }

    pub fn as_bar_open_time(&self) -> Bar {
        Bar::new(
            self.open_time,
            self.open,
            self.high,
            self.low,
            self.close,
            self.volume,
            self.buy_volume,
        )
    }
}

#[derive(Debug, Clone, Copy)]
pub struct AggregatorEvent {
    pub kind: AggregatorEventKind,
    pub period_ms: i64,
    pub candle: AggregateCandle,
}

#[derive(Debug)]
struct Slot {
    period: Period,
    current: Option<AggregateCandle>,
}

/// Multi-period candle aggregator.
///
/// Input `Bar.timestamp` is treated as the bar's open_time (ms).
/// It can be base timeframe OHLCV bars, or raw tick-like snapshots (as long as
/// timestamps are non-decreasing).
#[derive(Debug)]
pub struct Aggregator {
    slots: Vec<Slot>,
    events: VecDeque<AggregatorEvent>,
}

impl Aggregator {
    pub fn new(periods: Vec<Period>) -> Self {
        assert!(!periods.is_empty(), "periods must not be empty");
        Self {
            slots: periods
                .into_iter()
                .map(|p| Slot {
                    period: p,
                    current: None,
                })
                .collect(),
            events: VecDeque::new(),
        }
    }

    pub fn push(&mut self, bar: Bar) {
        for slot in &mut self.slots {
            let p = slot.period;
            let open_time = p.bucket_start(bar.timestamp);
            let close_time = open_time + p.as_ms();

            match &mut slot.current {
                None => {
                    let candle = AggregateCandle::new(open_time, close_time, bar);
                    slot.current = Some(candle);
                    self.events.push_back(AggregatorEvent {
                        kind: AggregatorEventKind::KlineUpdated,
                        period_ms: p.as_ms(),
                        candle,
                    });
                }
                Some(cur) => {
                    if open_time != cur.open_time {
                        // Close previous and start new.
                        let prev = *cur;
                        self.events.push_back(AggregatorEvent {
                            kind: AggregatorEventKind::KlineClosed,
                            period_ms: p.as_ms(),
                            candle: prev,
                        });
                        let next = AggregateCandle::new(open_time, close_time, bar);
                        self.events.push_back(AggregatorEvent {
                            kind: AggregatorEventKind::KlineUpdated,
                            period_ms: p.as_ms(),
                            candle: next,
                        });
                        *cur = next;
                    } else {
                        cur.merge(bar);
                        let cur2 = *cur;
                        self.events.push_back(AggregatorEvent {
                            kind: AggregatorEventKind::KlineUpdated,
                            period_ms: p.as_ms(),
                            candle: cur2,
                        });
                    }
                }
            }
        }
    }

    /// Forces closing all in-progress candles.
    pub fn flush(&mut self) {
        for slot in &mut self.slots {
            if let Some(cur) = slot.current.take() {
                self.events.push_back(AggregatorEvent {
                    kind: AggregatorEventKind::KlineClosed,
                    period_ms: slot.period.as_ms(),
                    candle: cur,
                });
            }
        }
    }

    pub fn poll_events(&mut self) -> Vec<AggregatorEvent> {
        self.events.drain(..).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::period::Period;

    #[test]
    fn emits_closed_on_bucket_switch_and_flush() {
        let mut ag = Aggregator::new(vec![Period::parse("15m").unwrap()]);
        let pms = 15 * 60_000;

        // 0.. <15m => same bucket
        ag.push(Bar::new(0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.5));
        ag.push(Bar::new(1, 2.0, 3.0, 1.0, 2.5, 2.0, 1.0));
        let ev = ag.poll_events();
        assert_eq!(ev.len(), 2);
        assert!(ev.iter().all(|e| e.kind == AggregatorEventKind::KlineUpdated));
        assert!(ev.iter().all(|e| e.period_ms == pms));
        assert_eq!(ev[1].candle.open_time, 0);
        assert_eq!(ev[1].candle.close_time, pms);
        assert_eq!(ev[1].candle.open, 1.0);
        assert_eq!(ev[1].candle.high, 3.0);
        assert_eq!(ev[1].candle.low, 1.0);
        assert_eq!(ev[1].candle.close, 2.5);
        assert!((ev[1].candle.volume - 3.0).abs() < 1e-12);
        assert!((ev[1].candle.buy_volume - 1.5).abs() < 1e-12);

        // Next bucket at 15m
        ag.push(Bar::new(pms, 10.0, 10.0, 9.0, 9.5, 1.0, 0.0));
        let ev = ag.poll_events();
        assert_eq!(ev.len(), 2);
        assert_eq!(ev[0].kind, AggregatorEventKind::KlineClosed);
        assert_eq!(ev[0].candle.open_time, 0);
        assert_eq!(ev[1].kind, AggregatorEventKind::KlineUpdated);
        assert_eq!(ev[1].candle.open_time, pms);

        ag.flush();
        let ev = ag.poll_events();
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0].kind, AggregatorEventKind::KlineClosed);
        assert_eq!(ev[0].candle.open_time, pms);
    }
}
