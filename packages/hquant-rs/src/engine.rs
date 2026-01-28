use crate::indicator::{IndicatorGraph, IndicatorId, IndicatorSpec, IndicatorValue};
use crate::kline_buffer::KlineBuffer;
use crate::strategy::{compile_strategy, CompiledStrategy, StrategyError, StrategyId};
use crate::{Bar, Signal};
use std::collections::VecDeque;

/// Core runtime: columnar bars + indicator DAG + strategy evaluation.
#[derive(Debug)]
pub struct HQuant {
    bars: KlineBuffer,
    indicators: IndicatorGraph,
    next_strategy_id: u32,
    strategies: Vec<CompiledStrategy>,
    signals: VecDeque<Signal>,
}

impl HQuant {
    pub fn new(capacity: usize) -> Self {
        Self {
            bars: KlineBuffer::new(capacity),
            indicators: IndicatorGraph::new(capacity),
            next_strategy_id: 1,
            strategies: Vec::new(),
            signals: VecDeque::new(),
        }
    }

    pub fn capacity(&self) -> usize {
        self.bars.capacity()
    }

    pub fn len(&self) -> usize {
        self.bars.len()
    }

    pub fn bars(&self) -> &KlineBuffer {
        &self.bars
    }

    pub fn add_indicator(&mut self, spec: IndicatorSpec) -> IndicatorId {
        self.indicators.add(spec)
    }

    pub fn indicator_last(&self, id: IndicatorId) -> Option<IndicatorValue> {
        self.indicators.last_value(id)
    }

    pub fn add_strategy(&mut self, name: &str, dsl: &str) -> Result<u32, StrategyError> {
        let id = StrategyId(self.next_strategy_id);
        self.next_strategy_id += 1;
        let compiled = compile_strategy(id, name.to_string(), dsl, &mut self.indicators)?;
        self.strategies.push(compiled);
        Ok(id.0)
    }

    pub fn push_kline(&mut self, bar: Bar) {
        self.bars.push(bar);
        self.indicators.on_push(&self.bars);
        self.eval_strategies();
    }

    pub fn update_last(&mut self, bar: Bar) {
        let old = self.bars.update_last(bar);
        if let Some(old_bar) = old {
            self.indicators.on_update_last(old_bar, bar, &self.bars);
            self.eval_strategies();
        }
    }

    fn eval_strategies(&mut self) {
        let ts = self.bars.last().map(|b| b.timestamp).unwrap_or(0);
        for s in &self.strategies {
            if let Some(sig) = s.evaluate(&self.indicators, ts) {
                self.signals.push_back(sig);
            }
        }
    }

    pub fn poll_signals(&mut self) -> Vec<Signal> {
        self.signals.drain(..).collect()
    }

    pub fn signals_len(&self) -> usize {
        self.signals.len()
    }

    pub fn poll_signals_into(&mut self, out: &mut [Signal]) -> usize {
        let n = out.len().min(self.signals.len());
        for i in 0..n {
            // Safe: n <= len.
            out[i] = self.signals.pop_front().unwrap();
        }
        n
    }
}

#[cfg(test)]
mod tests {
    use super::HQuant;
    use crate::indicator::IndicatorSpec;
    use crate::{Action, Bar, Field};

    #[test]
    fn rsi_strategy_emits_signal() {
        let mut hq = HQuant::new(64);
        let rsi_id = hq.add_indicator(IndicatorSpec::Rsi { period: 14 });
        let ema_id = hq.add_indicator(IndicatorSpec::Ema {
            field: Field::Close,
            period: 10,
        });
        let _ = hq.add_strategy("s", "IF RSI(14) < 30 THEN BUY").unwrap();
        // Feed monotonic down closes to drive RSI low.
        let mut price = 100.0;
        for i in 0..40 {
            price -= 1.0;
            hq.push_kline(Bar::new(i, price + 1.0, price + 1.0, price, price, 1.0, 0.0));
        }
        let last = hq.indicator_last(rsi_id).unwrap().a;
        // At least computed.
        assert!(last.is_finite());
        let sigs = hq.poll_signals();
        assert!(sigs.iter().any(|s| s.action == Action::Buy));

        assert!(hq.indicator_last(ema_id).is_some());
    }

    #[test]
    fn strategy_dsl_complex_and_or_precedence_multiple_rules() {
        let mut hq = HQuant::new(64);

        // Add these explicitly so we can assert their values while the DSL uses the same specs
        // (IndicatorGraph will dedup by spec).
        let rsi3 = hq.add_indicator(IndicatorSpec::Rsi { period: 3 });
        let sma3 = hq.add_indicator(IndicatorSpec::Sma {
            field: Field::Close,
            period: 3,
        });
        let ema3 = hq.add_indicator(IndicatorSpec::Ema {
            field: Field::Close,
            period: 3,
        });

        // This DSL intentionally mixes AND/OR to validate precedence:
        // - AND binds tighter than OR.
        // - Multiple IF rules are evaluated top-down (first match wins for that bar).
        let dsl = r#"
          # BUY: should trigger when RSI is low OR when (SMA low AND EMA low)
          IF RSI(3) < 30 OR SMA(3) < 99 AND EMA(3) < 98.6 THEN BUY

          # SELL: should trigger when SMA is very high (OR branch), even if RSI branch is false
          IF RSI(3) > 70 AND EMA(3) > 150 OR SMA(3) > 101 THEN SELL
        "#;
        hq.add_strategy("complex", dsl).unwrap();

        fn push(hq: &mut HQuant, ts: i64, close: f64) {
            hq.push_kline(Bar::new(ts, close, close, close, close, 0.0, 0.0));
        }

        // Seed: no signals while indicators are warming up.
        push(&mut hq, 1, 100.0);
        assert!(hq.poll_signals().is_empty());
        push(&mut hq, 2, 100.0);
        assert!(hq.poll_signals().is_empty());
        push(&mut hq, 3, 99.0);
        assert!(hq.poll_signals().is_empty());

        // At ts=4:
        // - RSI(3) is low due to diffs: 0, -1, -1
        // - SMA(3) == 99 and EMA(3) ~= 98.75, so the (SMA<99 AND EMA<98.6) branch is false
        // => BUY must come from the `RSI(3) < 30` OR branch (tests OR/AND precedence).
        push(&mut hq, 4, 98.0);
        let sigs = hq.poll_signals();
        assert_eq!(sigs.len(), 1);
        assert_eq!(sigs[0].action, Action::Buy);
        assert_eq!(sigs[0].timestamp, 4);

        // Drift up slowly so RSI recovers above 30, while SMA/EMA remain under thresholds.
        push(&mut hq, 5, 98.2);
        let _ = hq.poll_signals(); // may still BUY while RSI remains low
        push(&mut hq, 6, 98.4);
        let _ = hq.poll_signals();

        // At ts=7 we expect RSI >= 30, but still BUY because (SMA<99 AND EMA<98.6) is true.
        push(&mut hq, 7, 98.6);
        let rsi_v = hq.indicator_last(rsi3).unwrap().a;
        let sma_v = hq.indicator_last(sma3).unwrap().a;
        let ema_v = hq.indicator_last(ema3).unwrap().a;
        assert!(rsi_v >= 30.0, "rsi_v={}", rsi_v);
        assert!(sma_v < 99.0, "sma_v={}", sma_v);
        assert!(ema_v < 98.6, "ema_v={}", ema_v);
        let sigs = hq.poll_signals();
        assert_eq!(sigs.len(), 1);
        assert_eq!(sigs[0].action, Action::Buy);
        assert_eq!(sigs[0].timestamp, 7);

        // Jump higher: RSI likely spikes, but SELL should NOT trigger yet because
        // (RSI>70 AND EMA>150) is false and SMA(3) isn't > 101 yet.
        push(&mut hq, 8, 102.0);
        assert!(hq.poll_signals().is_empty());

        // Make SMA(3) > 101 at ts=10 (last 3 closes are all 102).
        push(&mut hq, 9, 102.0);
        assert!(hq.poll_signals().is_empty());
        push(&mut hq, 10, 102.0);
        let sigs = hq.poll_signals();
        assert_eq!(sigs.len(), 1);
        assert_eq!(sigs[0].action, Action::Sell);
        assert_eq!(sigs[0].timestamp, 10);
    }
}
