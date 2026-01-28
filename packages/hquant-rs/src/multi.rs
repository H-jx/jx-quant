use crate::aggregator::{Aggregator, AggregatorEventKind};
use crate::engine::HQuant;
use crate::period::Period;
use crate::strategy::{compile_multi_strategy, period_suffix_to_ms, CompiledStrategyT, IndicatorCall, MultiIndicatorRef, StrategyId};
use crate::{Bar, Signal};
use std::collections::{HashMap, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PeriodKey(pub i64); // milliseconds

/// Multi-period quant runtime:
/// - accepts base timeframe bars via `feed_bar`
/// - aggregates into multiple periods
/// - routes KlineUpdated/KlineClosed into each period's `HQuant` instance
#[derive(Debug)]
pub struct MultiHQuant {
    agg: Aggregator,
    period_order: Vec<PeriodKey>,
    period_index: HashMap<PeriodKey, u16>,
    engines: HashMap<PeriodKey, HQuant>,
    signals: VecDeque<Signal>,
    current_ts: i64,
    next_multi_strategy_id: u32,
    multi_strategies: Vec<CompiledStrategyT<MultiIndicatorRef>>,
}

impl MultiHQuant {
    pub fn new(capacity: usize, periods: Vec<Period>) -> Self {
        let mut period_order = Vec::new();
        let mut period_index = HashMap::new();
        let mut engines = HashMap::new();
        for (idx0, p) in periods.iter().enumerate() {
            let key = PeriodKey(p.as_ms());
            engines.insert(key, HQuant::new(capacity));
            period_order.push(key);
            // idx=0 reserved for multi-strategy, so periods start at 1.
            let idx = (idx0 + 1) as u16;
            period_index.insert(key, idx);
        }
        Self {
            agg: Aggregator::new(periods),
            period_order,
            period_index,
            engines,
            signals: VecDeque::new(),
            current_ts: 0,
            next_multi_strategy_id: 1,
            multi_strategies: Vec::new(),
        }
    }

    pub fn engine_mut(&mut self, period_ms: i64) -> Option<&mut HQuant> {
        self.engines.get_mut(&PeriodKey(period_ms))
    }

    pub fn engine(&self, period_ms: i64) -> Option<&HQuant> {
        self.engines.get(&PeriodKey(period_ms))
    }

    pub fn feed_bar(&mut self, bar: Bar) {
        self.current_ts = bar.timestamp;
        self.agg.push(bar);
        self.drain_events();
    }

    pub fn flush(&mut self) {
        self.agg.flush();
        self.drain_events();
    }

    /// Adds a cross-period strategy. Field references may include `@period` suffixes like `close@4h`.
    ///
    /// Strategy ids emitted by `poll_signals` are encoded as:
    /// - multi strategy: `period_idx=0` => `strategy_id = (0<<16) | (id & 0xffff)`
    /// - per-period engine strategy: `strategy_id = (period_idx<<16) | (local_id & 0xffff)`
    pub fn add_multi_strategy(&mut self, name: &str, dsl: &str) -> Result<u32, crate::strategy::StrategyError> {
        let id = StrategyId(self.next_multi_strategy_id);
        self.next_multi_strategy_id += 1;
        let default_period_ms = self
            .period_order
            .first()
            .map(|k| k.0)
            .ok_or(crate::strategy::StrategyError::Parse(
                "MultiHQuant has no periods".into(),
            ))?;

        let mut resolver = |call: IndicatorCall| -> Result<MultiIndicatorRef, String> {
            let (period_ms, spec) = match call {
                IndicatorCall::Rsi { series, period } => {
                    let period_ms = series
                        .as_ref()
                        .and_then(|s| s.period_suffix.as_deref())
                        .map(period_suffix_to_ms)
                        .transpose()?
                        .unwrap_or(default_period_ms);
                    if let Some(s) = &series {
                        if s.field != crate::Field::Close {
                            return Err("RSI only supports close series".into());
                        }
                    }
                    (period_ms, crate::indicator::IndicatorSpec::Rsi { period })
                }
                IndicatorCall::Sma { series, period } => {
                    let period_ms = series
                        .period_suffix
                        .as_deref()
                        .map(period_suffix_to_ms)
                        .transpose()?
                        .unwrap_or(default_period_ms);
                    (
                        period_ms,
                        crate::indicator::IndicatorSpec::Sma {
                            field: series.field,
                            period,
                        },
                    )
                }
                IndicatorCall::Ema { series, period } => {
                    let period_ms = series
                        .period_suffix
                        .as_deref()
                        .map(period_suffix_to_ms)
                        .transpose()?
                        .unwrap_or(default_period_ms);
                    (
                        period_ms,
                        crate::indicator::IndicatorSpec::Ema {
                            field: series.field,
                            period,
                        },
                    )
                }
                IndicatorCall::StdDev { series, period } => {
                    let period_ms = series
                        .period_suffix
                        .as_deref()
                        .map(period_suffix_to_ms)
                        .transpose()?
                        .unwrap_or(default_period_ms);
                    (
                        period_ms,
                        crate::indicator::IndicatorSpec::StdDev {
                            field: series.field,
                            period,
                        },
                    )
                }
            };

            let hq = self
                .engine_mut(period_ms)
                .ok_or_else(|| format!("unknown period for strategy: {period_ms}ms"))?;
            let ind = hq.add_indicator(spec);
            Ok(MultiIndicatorRef { period_ms, id: ind })
        };

        let compiled = compile_multi_strategy(id, name.to_string(), dsl, &mut resolver)?;
        self.multi_strategies.push(compiled);
        Ok(id.0)
    }

    fn drain_events(&mut self) {
        let events = self.agg.poll_events();
        for ev in events {
            let key = PeriodKey(ev.period_ms);
            let hq = match self.engines.get_mut(&key) {
                Some(v) => v,
                None => continue,
            };
            // Use open_time as Bar.timestamp for stable identity across updates.
            let bar = ev.candle.as_bar_open_time();
            match ev.kind {
                AggregatorEventKind::KlineUpdated => {
                    // If last bar is the same open_time, update it; otherwise push a new bar.
                    let last_ts = hq.bars().last().map(|b| b.timestamp);
                    if last_ts == Some(bar.timestamp) {
                        hq.update_last(bar);
                    } else {
                        hq.push_kline(bar);
                    }
                }
                AggregatorEventKind::KlineClosed => {
                    // Ensure final candle is written. We treat close as an update of the latest bucket.
                    let last_ts = hq.bars().last().map(|b| b.timestamp);
                    if last_ts == Some(bar.timestamp) {
                        hq.update_last(bar);
                    } else {
                        hq.push_kline(bar);
                    }
                }
            }
            let period_idx = *self.period_index.get(&key).unwrap_or(&0);
            for mut s in hq.poll_signals() {
                s.strategy_id = encode_strategy_id(period_idx, s.strategy_id);
                self.signals.push_back(s);
            }
        }

        // Evaluate cross-period strategies after all engines are updated for this feed.
        for st in &self.multi_strategies {
            if let Some(mut sig) = st.evaluate_with(
                |r: MultiIndicatorRef| {
                    self.engine(r.period_ms)
                        .and_then(|hq| hq.indicator_last(r.id))
                        .map(|v| v.a)
                },
                self.current_ts,
            ) {
                sig.strategy_id = encode_strategy_id(0, sig.strategy_id);
                self.signals.push_back(sig);
            }
        }
    }

    pub fn poll_signals(&mut self) -> Vec<Signal> {
        self.signals.drain(..).collect()
    }
}

#[inline]
fn encode_strategy_id(period_idx: u16, local_id: u32) -> u32 {
    ((period_idx as u32) << 16) | (local_id & 0xffff)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::indicator::IndicatorSpec;

    #[test]
    fn multi_routes_events_and_collects_signals() {
        let p15m = Period::parse("15m").unwrap();
        let p4h = Period::parse("4h").unwrap();
        let mut mq = MultiHQuant::new(128, vec![p15m, p4h]);

        // Attach a trivial RSI strategy on 15m engine.
        {
            let hq15 = mq.engine_mut(p15m.as_ms()).unwrap();
            hq15.add_indicator(IndicatorSpec::Rsi { period: 3 });
            hq15.add_strategy("s", "IF RSI(3) < 30 THEN BUY").unwrap();
        }

        // Feed base bars across 15m buckets so the 15m engine actually gets multiple bars (push).
        // For RSI(3), we need at least 4 candles (diff_count >= 3).
        let pms = p15m.as_ms();
        for i in 0..4i64 {
            let close = 100.0 - (i as f64);
            mq.feed_bar(Bar::new(i * pms, close, close, close, close, 1.0, 0.0));
        }
        let sigs = mq.poll_signals();
        assert!(sigs.iter().any(|s| s.action == crate::Action::Buy));

        // Ensure 4h engine exists and has some bars aggregated.
        let hq4h = mq.engine(p4h.as_ms()).unwrap();
        assert!(hq4h.len() > 0);
    }

    #[test]
    fn multi_strategy_can_reference_other_period() {
        let p15m = Period::parse("15m").unwrap();
        let p4h = Period::parse("4h").unwrap();
        let mut mq = MultiHQuant::new(128, vec![p15m, p4h]);

        // Cross-period strategy: buy when 4h SMA(close) is above a threshold.
        mq.add_multi_strategy("ms", "IF SMA(close@4h, period=1) > 100 THEN BUY")
            .unwrap();

        // Feed base bars within 4h bucket; SMA(1) will equal last close.
        mq.feed_bar(Bar::new(0, 0.0, 0.0, 0.0, 101.0, 0.0, 0.0));
        let sigs = mq.poll_signals();
        assert!(sigs.iter().any(|s| s.action == crate::Action::Buy));

        // Encoded as period_idx=0 (multi-strategy).
        assert!(sigs.iter().any(|s| (s.strategy_id >> 16) == 0));
    }
}
