use crate::{circular::CircularColumn, kline_buffer::KlineBuffer, Bar, Field};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct IndicatorId(pub u32);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum IndicatorSpec {
    Sma { field: Field, period: usize },
    Ema { field: Field, period: usize },
    StdDev { field: Field, period: usize },
    Rsi { period: usize },
    /// mid=SMA(close,period) + k*StdDev(close,period)
    ///
    /// `k_bits` is `f64::to_bits(k)` to keep the spec hashable.
    Boll { period: usize, k_bits: u64 },
    Macd {
        fast: usize,
        slow: usize,
        signal: usize,
    }, // macd=ema_fast-ema_slow, signal=ema(macd, signal), hist=macd-signal
}

impl IndicatorSpec {
    pub fn boll(period: usize, k: f64) -> Self {
        Self::Boll {
            period,
            k_bits: k.to_bits(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum IndicatorValueKind {
    Scalar = 1,
    Triple = 2,
}

/// Small, FFI-friendly value container.
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C)]
pub struct IndicatorValue {
    pub kind: IndicatorValueKind,
    pub a: f64,
    pub b: f64,
    pub c: f64,
}

impl IndicatorValue {
    pub fn scalar(v: f64) -> Self {
        Self {
            kind: IndicatorValueKind::Scalar,
            a: v,
            b: f64::NAN,
            c: f64::NAN,
        }
    }
    pub fn triple(a: f64, b: f64, c: f64) -> Self {
        Self {
            kind: IndicatorValueKind::Triple,
            a,
            b,
            c,
        }
    }
}

enum OutputColumns {
    Scalar(CircularColumn<f64>),
    Triple {
        a: CircularColumn<f64>,
        b: CircularColumn<f64>,
        c: CircularColumn<f64>,
    },
}

impl OutputColumns {
    fn last_value(&self) -> Option<IndicatorValue> {
        match self {
            OutputColumns::Scalar(col) => Some(IndicatorValue::scalar(col.get_from_end(0)?)),
            OutputColumns::Triple { a, b, c } => Some(IndicatorValue::triple(
                a.get_from_end(0)?,
                b.get_from_end(0)?,
                c.get_from_end(0)?,
            )),
        }
    }

    fn push_scalar(&mut self, v: f64) {
        match self {
            OutputColumns::Scalar(col) => col.push(v),
            OutputColumns::Triple { .. } => unreachable!("expected scalar output"),
        }
    }

    fn update_last_scalar(&mut self, v: f64) {
        match self {
            OutputColumns::Scalar(col) => col.update_last(v),
            OutputColumns::Triple { .. } => unreachable!("expected scalar output"),
        }
    }

    fn push_triple(&mut self, a0: f64, b0: f64, c0: f64) {
        match self {
            OutputColumns::Triple { a, b, c } => {
                a.push(a0);
                b.push(b0);
                c.push(c0);
            }
            OutputColumns::Scalar(_) => unreachable!("expected triple output"),
        }
    }

    fn update_last_triple(&mut self, a0: f64, b0: f64, c0: f64) {
        match self {
            OutputColumns::Triple { a, b, c } => {
                a.update_last(a0);
                b.update_last(b0);
                c.update_last(c0);
            }
            OutputColumns::Scalar(_) => unreachable!("expected triple output"),
        }
    }
}

trait IndicatorExec {
    fn output_kind(&self) -> IndicatorValueKind;
    fn on_push(
        &mut self,
        bars: &KlineBuffer,
        dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    );
    fn on_update_last(
        &mut self,
        old_bar: Bar,
        new_bar: Bar,
        bars: &KlineBuffer,
        dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    );
}

struct Node {
    deps: Vec<IndicatorId>,
    exec: Box<dyn IndicatorExec>,
    out: OutputColumns,
}

/// Indicator DAG with auto-dedup by `IndicatorSpec`.
pub struct IndicatorGraph {
    capacity: usize,
    next_id: u32,
    order: Vec<IndicatorId>,
    nodes: HashMap<IndicatorId, Node>,
    by_spec: HashMap<IndicatorSpec, IndicatorId>,
}

impl core::fmt::Debug for IndicatorGraph {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("IndicatorGraph")
            .field("capacity", &self.capacity)
            .field("next_id", &self.next_id)
            .field("nodes", &self.nodes.len())
            .field("order", &self.order.len())
            .finish()
    }
}

impl IndicatorGraph {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            next_id: 1,
            order: Vec::new(),
            nodes: HashMap::new(),
            by_spec: HashMap::new(),
        }
    }

    pub fn add(&mut self, spec: IndicatorSpec) -> IndicatorId {
        if let Some(id) = self.by_spec.get(&spec) {
            return *id;
        }

        // Build dependencies first (so insertion order is a valid topo order).
        let (deps, exec): (Vec<IndicatorId>, Box<dyn IndicatorExec>) = match &spec {
            IndicatorSpec::Sma { field, period } => (vec![], Box::new(SmaExec::new(*field, *period))),
            IndicatorSpec::Ema { field, period } => (vec![], Box::new(EmaExec::new(*field, *period))),
            IndicatorSpec::StdDev { field, period } => {
                (vec![], Box::new(StdDevExec::new(*field, *period)))
            }
            IndicatorSpec::Rsi { period } => (vec![], Box::new(RsiExec::new(*period, self.capacity))),
            IndicatorSpec::Boll { period, k_bits } => {
                let sma = self.add(IndicatorSpec::Sma {
                    field: Field::Close,
                    period: *period,
                });
                let std = self.add(IndicatorSpec::StdDev {
                    field: Field::Close,
                    period: *period,
                });
                (
                    vec![sma, std],
                    Box::new(BollExec::new(*k_bits, *period)),
                )
            }
            IndicatorSpec::Macd { fast, slow, signal } => {
                let ema_fast = self.add(IndicatorSpec::Ema {
                    field: Field::Close,
                    period: *fast,
                });
                let ema_slow = self.add(IndicatorSpec::Ema {
                    field: Field::Close,
                    period: *slow,
                });
                (
                    vec![ema_fast, ema_slow],
                    Box::new(MacdExec::new(*signal)),
                )
            }
        };

        let id = IndicatorId(self.next_id);
        self.next_id += 1;

        let out = match exec.output_kind() {
            IndicatorValueKind::Scalar => OutputColumns::Scalar(CircularColumn::new(self.capacity)),
            IndicatorValueKind::Triple => OutputColumns::Triple {
                a: CircularColumn::new(self.capacity),
                b: CircularColumn::new(self.capacity),
                c: CircularColumn::new(self.capacity),
            },
        };

        self.nodes.insert(
            id,
            Node {
                deps,
                exec,
                out,
            },
        );
        self.by_spec.insert(spec, id);
        self.order.push(id);
        id
    }

    pub fn last_value(&self, id: IndicatorId) -> Option<IndicatorValue> {
        self.nodes.get(&id)?.out.last_value()
    }

    pub fn on_push(&mut self, bars: &KlineBuffer) {
        // Execute in topo order.
        for &id in &self.order {
            let dep_vals = {
                let node = self.nodes.get(&id).expect("node exists");
                node.deps
                    .iter()
                    .map(|d| self.last_value(*d).unwrap_or(IndicatorValue::scalar(f64::NAN)))
                    .collect::<Vec<_>>()
            };
            let node = self.nodes.get_mut(&id).expect("node exists");
            node.exec.on_push(bars, &dep_vals, &mut node.out);
        }
    }

    pub fn on_update_last(&mut self, old: Bar, new: Bar, bars: &KlineBuffer) {
        for &id in &self.order {
            let dep_vals = {
                let node = self.nodes.get(&id).expect("node exists");
                node.deps
                    .iter()
                    .map(|d| self.last_value(*d).unwrap_or(IndicatorValue::scalar(f64::NAN)))
                    .collect::<Vec<_>>()
            };
            let node = self.nodes.get_mut(&id).expect("node exists");
            node.exec
                .on_update_last(old, new, bars, &dep_vals, &mut node.out);
        }
    }
}

// ===== Primary indicators =====

struct SmaExec {
    field: Field,
    period: usize,
    sum: f64,
}

impl SmaExec {
    fn new(field: Field, period: usize) -> Self {
        assert!(period > 0);
        Self {
            field,
            period,
            sum: 0.0,
        }
    }
}

impl IndicatorExec for SmaExec {
    fn output_kind(&self) -> IndicatorValueKind {
        IndicatorValueKind::Scalar
    }

    fn on_push(
        &mut self,
        bars: &KlineBuffer,
        _dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        let v = bars.last_f64(self.field).unwrap_or(f64::NAN);

        if n == 0 {
            out.push_scalar(f64::NAN);
            return;
        }

        if n <= self.period {
            self.sum += v;
        } else {
            let removed = bars
                .get_f64(self.field, n - self.period - 1)
                .unwrap_or(0.0);
            self.sum += v - removed;
        }

        let sma = if n < self.period {
            f64::NAN
        } else {
            self.sum / (self.period as f64)
        };
        out.push_scalar(sma);
    }

    fn on_update_last(
        &mut self,
        old_bar: Bar,
        new_bar: Bar,
        bars: &KlineBuffer,
        _dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        if bars.is_empty() {
            return;
        }
        let n = bars.len();
        let old_v = get_bar_field_f64(old_bar, self.field);
        let new_v = get_bar_field_f64(new_bar, self.field);
        self.sum += new_v - old_v;
        let sma = if n < self.period {
            f64::NAN
        } else {
            self.sum / (self.period as f64)
        };
        out.update_last_scalar(sma);
    }
}

struct EmaExec {
    field: Field,
    alpha: f64,
}

impl EmaExec {
    fn new(field: Field, period: usize) -> Self {
        assert!(period > 0);
        let alpha = 2.0 / (period as f64 + 1.0);
        Self {
            field,
            alpha,
        }
    }
}

impl IndicatorExec for EmaExec {
    fn output_kind(&self) -> IndicatorValueKind {
        IndicatorValueKind::Scalar
    }

    fn on_push(
        &mut self,
        bars: &KlineBuffer,
        _dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        let price = bars.last_f64(self.field).unwrap_or(f64::NAN);
        if n <= 1 {
            out.push_scalar(price);
            return;
        }
        let prev = match out {
            OutputColumns::Scalar(col) => col.get_from_end(0).unwrap_or(price),
            _ => unreachable!(),
        };
        let ema = prev + self.alpha * (price - prev);
        out.push_scalar(ema);
    }

    fn on_update_last(
        &mut self,
        _old_bar: Bar,
        _new_bar: Bar,
        bars: &KlineBuffer,
        _dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        if n == 0 {
            return;
        }
        let price = bars.last_f64(self.field).unwrap_or(f64::NAN);
        if n == 1 {
            out.update_last_scalar(price);
            return;
        }
        let prev_ema = match out {
            OutputColumns::Scalar(col) => col.get_from_end(1).unwrap_or(price),
            _ => unreachable!(),
        };
        let ema = prev_ema + self.alpha * (price - prev_ema);
        out.update_last_scalar(ema);
    }
}

struct StdDevExec {
    field: Field,
    period: usize,
    sum: f64,
    sumsq: f64,
}

impl StdDevExec {
    fn new(field: Field, period: usize) -> Self {
        assert!(period > 0);
        Self {
            field,
            period,
            sum: 0.0,
            sumsq: 0.0,
        }
    }
}

impl IndicatorExec for StdDevExec {
    fn output_kind(&self) -> IndicatorValueKind {
        IndicatorValueKind::Scalar
    }

    fn on_push(
        &mut self,
        bars: &KlineBuffer,
        _dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        let v = bars.last_f64(self.field).unwrap_or(f64::NAN);
        if n == 0 {
            out.push_scalar(f64::NAN);
            return;
        }
        if n <= self.period {
            self.sum += v;
            self.sumsq += v * v;
        } else {
            let removed = bars
                .get_f64(self.field, n - self.period - 1)
                .unwrap_or(0.0);
            self.sum += v - removed;
            self.sumsq += v * v - removed * removed;
        }

        let std = if n < self.period {
            f64::NAN
        } else {
            let mean = self.sum / (self.period as f64);
            let var = (self.sumsq / (self.period as f64)) - mean * mean;
            var.max(0.0).sqrt()
        };
        out.push_scalar(std);
    }

    fn on_update_last(
        &mut self,
        old_bar: Bar,
        new_bar: Bar,
        bars: &KlineBuffer,
        _dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        if bars.is_empty() {
            return;
        }
        let n = bars.len();
        let old_v = get_bar_field_f64(old_bar, self.field);
        let new_v = get_bar_field_f64(new_bar, self.field);
        self.sum += new_v - old_v;
        self.sumsq += new_v * new_v - old_v * old_v;

        let std = if n < self.period {
            f64::NAN
        } else {
            let mean = self.sum / (self.period as f64);
            let var = (self.sumsq / (self.period as f64)) - mean * mean;
            var.max(0.0).sqrt()
        };
        out.update_last_scalar(std);
    }
}

struct RsiExec {
    period: usize,
    // Only needed during initialization (first `period` diffs).
    init_sum_gain: f64,
    init_sum_loss: f64,
    // Store avg_gain/avg_loss per-bar to support update_last without rollback.
    avg_gain: CircularColumn<f64>,
    avg_loss: CircularColumn<f64>,
}

impl RsiExec {
    fn new(period: usize, capacity: usize) -> Self {
        assert!(period > 0);
        Self {
            period,
            init_sum_gain: 0.0,
            init_sum_loss: 0.0,
            avg_gain: CircularColumn::new(capacity),
            avg_loss: CircularColumn::new(capacity),
        }
    }

    fn rsi_from(av_gain: f64, av_loss: f64) -> f64 {
        if av_gain == 0.0 && av_loss == 0.0 {
            return 50.0;
        }
        if av_loss == 0.0 {
            return 100.0;
        }
        let rs = av_gain / av_loss;
        100.0 - (100.0 / (1.0 + rs))
    }
}

impl IndicatorExec for RsiExec {
    fn output_kind(&self) -> IndicatorValueKind {
        IndicatorValueKind::Scalar
    }

    fn on_push(
        &mut self,
        bars: &KlineBuffer,
        _dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        if n <= 1 {
            self.avg_gain.push(0.0);
            self.avg_loss.push(0.0);
            out.push_scalar(f64::NAN);
            return;
        }

        let close = bars.last_f64(Field::Close).unwrap_or(f64::NAN);
        let prev_close = bars.close().get_from_end(1).unwrap_or(close);
        let change = close - prev_close;
        let gain = change.max(0.0);
        let loss = (-change).max(0.0);

        // n bars => n-1 diffs. We initialize at diff_count == period.
        let diff_count = n - 1;
        let (ag, al) = if diff_count < self.period {
            self.init_sum_gain += gain;
            self.init_sum_loss += loss;
            (0.0, 0.0)
        } else if diff_count == self.period {
            self.init_sum_gain += gain;
            self.init_sum_loss += loss;
            (
                self.init_sum_gain / (self.period as f64),
                self.init_sum_loss / (self.period as f64),
            )
        } else {
            let prev_ag = self.avg_gain.get_from_end(0).unwrap_or(0.0);
            let prev_al = self.avg_loss.get_from_end(0).unwrap_or(0.0);
            (
                (prev_ag * (self.period as f64 - 1.0) + gain) / (self.period as f64),
                (prev_al * (self.period as f64 - 1.0) + loss) / (self.period as f64),
            )
        };

        self.avg_gain.push(ag);
        self.avg_loss.push(al);
        let rsi = if diff_count < self.period {
            f64::NAN
        } else {
            Self::rsi_from(ag, al)
        };
        out.push_scalar(rsi);
    }

    fn on_update_last(
        &mut self,
        old_bar: Bar,
        new_bar: Bar,
        bars: &KlineBuffer,
        _dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        if n <= 1 {
            out.update_last_scalar(f64::NAN);
            self.avg_gain.update_last(0.0);
            self.avg_loss.update_last(0.0);
            return;
        }

        let prev_close = bars.close().get_from_end(1).unwrap_or(new_bar.close);
        let old_change = old_bar.close - prev_close;
        let new_change = new_bar.close - prev_close;
        let old_gain = old_change.max(0.0);
        let old_loss = (-old_change).max(0.0);
        let new_gain = new_change.max(0.0);
        let new_loss = (-new_change).max(0.0);

        let diff_count = n - 1;
        let (ag, al) = if diff_count < self.period {
            // Still initializing: update sums in-place.
            self.init_sum_gain += new_gain - old_gain;
            self.init_sum_loss += new_loss - old_loss;
            (0.0, 0.0)
        } else if diff_count == self.period {
            // Init point uses sums too.
            self.init_sum_gain += new_gain - old_gain;
            self.init_sum_loss += new_loss - old_loss;
            (
                self.init_sum_gain / (self.period as f64),
                self.init_sum_loss / (self.period as f64),
            )
        } else {
            // Use previous bar's avg (index n-2) as the base.
            let prev_ag = self.avg_gain.get_from_end(1).unwrap_or(0.0);
            let prev_al = self.avg_loss.get_from_end(1).unwrap_or(0.0);
            (
                (prev_ag * (self.period as f64 - 1.0) + new_gain) / (self.period as f64),
                (prev_al * (self.period as f64 - 1.0) + new_loss) / (self.period as f64),
            )
        };

        self.avg_gain.update_last(ag);
        self.avg_loss.update_last(al);
        let rsi = if diff_count < self.period {
            f64::NAN
        } else {
            Self::rsi_from(ag, al)
        };
        out.update_last_scalar(rsi);
    }
}

// ===== Composite indicators =====

struct BollExec {
    k: f64,
    period: usize,
}

impl BollExec {
    fn new(k_bits: u64, period: usize) -> Self {
        Self {
            k: f64::from_bits(k_bits),
            period,
        }
    }
}

impl IndicatorExec for BollExec {
    fn output_kind(&self) -> IndicatorValueKind {
        IndicatorValueKind::Triple
    }

    fn on_push(
        &mut self,
        bars: &KlineBuffer,
        dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        if n < self.period {
            out.push_triple(f64::NAN, f64::NAN, f64::NAN);
            return;
        }
        let sma = dep_vals.get(0).map(|v| v.a).unwrap_or(f64::NAN);
        let std = dep_vals.get(1).map(|v| v.a).unwrap_or(f64::NAN);
        let up = sma + self.k * std;
        let mid = sma;
        let low = sma - self.k * std;
        out.push_triple(up, mid, low);
    }

    fn on_update_last(
        &mut self,
        _old_bar: Bar,
        _new_bar: Bar,
        bars: &KlineBuffer,
        dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        if n < self.period {
            out.update_last_triple(f64::NAN, f64::NAN, f64::NAN);
            return;
        }
        let sma = dep_vals.get(0).map(|v| v.a).unwrap_or(f64::NAN);
        let std = dep_vals.get(1).map(|v| v.a).unwrap_or(f64::NAN);
        let up = sma + self.k * std;
        let mid = sma;
        let low = sma - self.k * std;
        out.update_last_triple(up, mid, low);
    }
}

struct MacdExec {
    alpha_signal: f64,
}

impl MacdExec {
    fn new(signal_period: usize) -> Self {
        assert!(signal_period > 0);
        Self {
            alpha_signal: 2.0 / (signal_period as f64 + 1.0),
        }
    }
}

impl IndicatorExec for MacdExec {
    fn output_kind(&self) -> IndicatorValueKind {
        IndicatorValueKind::Triple
    }

    fn on_push(
        &mut self,
        bars: &KlineBuffer,
        dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        if n == 0 {
            out.push_triple(f64::NAN, f64::NAN, f64::NAN);
            return;
        }
        let fast = dep_vals.get(0).map(|v| v.a).unwrap_or(f64::NAN);
        let slow = dep_vals.get(1).map(|v| v.a).unwrap_or(f64::NAN);
        let macd = fast - slow;

        let prev_signal = match out {
            OutputColumns::Triple { b, .. } => b.get_from_end(0).unwrap_or(macd),
            _ => unreachable!(),
        };
        let signal = if n <= 1 {
            macd
        } else {
            prev_signal + self.alpha_signal * (macd - prev_signal)
        };
        let hist = macd - signal;
        out.push_triple(macd, signal, hist);
    }

    fn on_update_last(
        &mut self,
        _old_bar: Bar,
        _new_bar: Bar,
        bars: &KlineBuffer,
        dep_vals: &[IndicatorValue],
        out: &mut OutputColumns,
    ) {
        let n = bars.len();
        if n == 0 {
            return;
        }
        let fast = dep_vals.get(0).map(|v| v.a).unwrap_or(f64::NAN);
        let slow = dep_vals.get(1).map(|v| v.a).unwrap_or(f64::NAN);
        let macd = fast - slow;
        let prev_signal = match out {
            OutputColumns::Triple { b, .. } => b.get_from_end(1).unwrap_or(macd),
            _ => unreachable!(),
        };
        let signal = if n == 1 {
            macd
        } else {
            prev_signal + self.alpha_signal * (macd - prev_signal)
        };
        let hist = macd - signal;
        out.update_last_triple(macd, signal, hist);
    }
}

// ===== helpers =====

fn get_bar_field_f64(b: Bar, field: Field) -> f64 {
    match field {
        Field::Open => b.open,
        Field::High => b.high,
        Field::Low => b.low,
        Field::Close => b.close,
        Field::Volume => b.volume,
        Field::BuyVolume => b.buy_volume,
    }
}

// (no extra helpers)

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::HQuant;
    use crate::Bar;

    #[test]
    fn boll_matches_sma_and_stddev() {
        let mut hq = HQuant::new(16);
        let boll = hq.add_indicator(IndicatorSpec::boll(3, 2.0));

        hq.push_kline(Bar::new(1, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0));
        assert!(hq.indicator_last(boll).unwrap().a.is_nan());
        hq.push_kline(Bar::new(2, 2.0, 2.0, 2.0, 2.0, 0.0, 0.0));
        assert!(hq.indicator_last(boll).unwrap().a.is_nan());

        hq.push_kline(Bar::new(3, 3.0, 3.0, 3.0, 3.0, 0.0, 0.0));
        let v = hq.indicator_last(boll).unwrap();
        let mid = 2.0;
        let std = (2.0f64 / 3.0f64).sqrt();
        assert!((v.b - mid).abs() < 1e-12);
        assert!((v.a - (mid + 2.0 * std)).abs() < 1e-12);
        assert!((v.c - (mid - 2.0 * std)).abs() < 1e-12);

        // update_last should update the last Boll using the updated close.
        hq.update_last(Bar::new(3, 6.0, 6.0, 6.0, 6.0, 0.0, 0.0));
        let v2 = hq.indicator_last(boll).unwrap();
        let mid2: f64 = (1.0 + 2.0 + 6.0) / 3.0;
        let mean_sq: f64 = (1.0 * 1.0 + 2.0 * 2.0 + 6.0 * 6.0) / 3.0;
        let std2: f64 = (mean_sq - mid2 * mid2).sqrt();
        assert!((v2.b - mid2).abs() < 1e-12);
        assert!((v2.a - (mid2 + 2.0 * std2)).abs() < 1e-12);
        assert!((v2.c - (mid2 - 2.0 * std2)).abs() < 1e-12);
    }
}
