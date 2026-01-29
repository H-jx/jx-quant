use crate::indicator::{IndicatorGraph, IndicatorId, IndicatorSpec};
use crate::period::Period;
use crate::{Action, Field, Signal};

mod dsl_parser;

#[derive(Debug)]
pub enum StrategyError {
    Empty,
    Parse(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StrategyId(pub u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct MultiIndicatorRef {
    pub period_ms: i64,
    pub id: IndicatorId,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrategyScope {
    /// A regular single-period strategy.
    Single,
    /// A multi-period strategy compiled against multiple internal engines.
    Multi,
}

#[derive(Debug, Clone)]
pub struct CompiledStrategyT<I: Copy> {
    pub id: StrategyId,
    pub name: String,
    pub scope: StrategyScope,
    rules: Vec<Rule<I>>,
}

pub type CompiledStrategy = CompiledStrategyT<IndicatorId>;

#[derive(Debug, Clone)]
struct Rule<I: Copy> {
    cond: BoolExpr<I>,
    action: Action,
}

#[derive(Debug, Clone)]
enum BoolExpr<I: Copy> {
    Cmp {
        left: ScalarOperand<I>,
        op: CmpOp,
        right: f64,
    },
    And(Box<BoolExpr<I>>, Box<BoolExpr<I>>),
    Or(Box<BoolExpr<I>>, Box<BoolExpr<I>>),
    Not(Box<BoolExpr<I>>),
}

#[derive(Debug, Clone, Copy)]
enum ScalarOperand<I: Copy> {
    Indicator(I),
}

#[derive(Debug, Clone, Copy)]
enum CmpOp {
    Lt,
    Le,
    Gt,
    Ge,
    Eq,
    Ne,
}

impl<I: Copy> CompiledStrategyT<I> {
    /// Evaluates rules top-down; returns the first matching action (if any).
    pub fn evaluate_with<F>(&self, mut get: F, timestamp: i64) -> Option<Signal>
    where
        F: FnMut(I) -> Option<f64>,
    {
        for r in &self.rules {
            if eval_bool(&r.cond, &mut get) {
                return Some(Signal {
                    strategy_id: self.id.0,
                    action: r.action,
                    timestamp,
                });
            }
        }
        None
    }
}

impl CompiledStrategyT<IndicatorId> {
    pub fn evaluate(&self, graph: &IndicatorGraph, timestamp: i64) -> Option<Signal> {
        self.evaluate_with(|id| graph.last_value(id).map(|v| v.a), timestamp)
    }
}

fn eval_bool<I: Copy, F: FnMut(I) -> Option<f64>>(e: &BoolExpr<I>, get: &mut F) -> bool {
    match e {
        BoolExpr::Cmp { left, op, right } => {
            let lv = match left {
                ScalarOperand::Indicator(i) => get(*i).unwrap_or(f64::NAN),
            };
            if lv.is_nan() || right.is_nan() {
                return false;
            }
            match op {
                CmpOp::Lt => lv < *right,
                CmpOp::Le => lv <= *right,
                CmpOp::Gt => lv > *right,
                CmpOp::Ge => lv >= *right,
                CmpOp::Eq => lv == *right,
                CmpOp::Ne => lv != *right,
            }
        }
        BoolExpr::And(a, b) => eval_bool(a, get) && eval_bool(b, get),
        BoolExpr::Or(a, b) => eval_bool(a, get) || eval_bool(b, get),
        BoolExpr::Not(x) => !eval_bool(x, get),
    }
}

// ===== DSL parsing (v1) =====

#[derive(Debug, Clone)]
pub(crate) struct SeriesRef {
    pub(crate) field: Field,
    pub(crate) period_suffix: Option<String>, // e.g. "4h"
}

#[derive(Debug, Clone)]
pub(crate) enum IndicatorCall {
    Rsi { series: Option<SeriesRef>, period: usize },
    Sma { series: SeriesRef, period: usize },
    Ema { series: SeriesRef, period: usize },
    StdDev { series: SeriesRef, period: usize },
}

#[derive(Debug, Clone)]
enum BoolExprCall {
    Cmp {
        left: IndicatorCall,
        op: CmpOp,
        right: f64,
    },
    And(Box<BoolExprCall>, Box<BoolExprCall>),
    Or(Box<BoolExprCall>, Box<BoolExprCall>),
    Not(Box<BoolExprCall>),
}

/// A more complete DSL (v1):
///
/// - `IF (RSI(14) < 30 OR (SMA(close,period=20) < 100 AND NOT EMA(close,20) > 105)) THEN BUY`
/// - `AND` / `OR` / `NOT`, parentheses supported
/// - `SMA/EMA/STDDEV` accept field selection: `close/open/high/low/volume/buy_volume`
/// - field can include multi-period suffix `@4h` (for MultiHQuant resolver)
pub fn compile_strategy(
    id: StrategyId,
    name: impl Into<String>,
    dsl: &str,
    graph: &mut IndicatorGraph,
) -> Result<CompiledStrategy, StrategyError> {
    let mut resolver = |call: IndicatorCall| -> Result<IndicatorId, String> {
        resolve_call_single(call, graph)
    };
    compile_with_resolver(id, name, StrategyScope::Single, dsl, &mut resolver)
}

/// Compiles a multi-period strategy by deferring indicator resolution to `resolver`.
pub(crate) fn compile_multi_strategy(
    id: StrategyId,
    name: impl Into<String>,
    dsl: &str,
    resolver: &mut dyn FnMut(IndicatorCall) -> Result<MultiIndicatorRef, String>,
) -> Result<CompiledStrategyT<MultiIndicatorRef>, StrategyError> {
    compile_with_resolver(id, name, StrategyScope::Multi, dsl, resolver)
}

fn compile_with_resolver<I: Copy>(
    id: StrategyId,
    name: impl Into<String>,
    scope: StrategyScope,
    dsl: &str,
    resolver: &mut dyn FnMut(IndicatorCall) -> Result<I, String>,
) -> Result<CompiledStrategyT<I>, StrategyError> {
    let mut rules = Vec::new();
    for (line_no, raw) in dsl.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line_upper = line.to_ascii_uppercase();
        if !line_upper.starts_with("IF ") {
            return Err(StrategyError::Parse(format!(
                "line {}: expected IF ... THEN ...",
                line_no + 1
            )));
        }
        let then_pos = line_upper.find(" THEN ").ok_or_else(|| {
            StrategyError::Parse(format!("line {}: missing THEN", line_no + 1))
        })?;
        let cond_src = line[3..then_pos].trim();
        let action_src = line[then_pos + 6..].trim();
        let action = parse_action(action_src).ok_or_else(|| {
            StrategyError::Parse(format!("line {}: invalid action", line_no + 1))
        })?;
        let cond_call = parse_condition(cond_src).map_err(|e| {
            StrategyError::Parse(format!("line {}: {}", line_no + 1, e))
        })?;
        let cond = lower_bool_expr(cond_call, resolver).map_err(|e| {
            StrategyError::Parse(format!("line {}: {}", line_no + 1, e))
        })?;
        rules.push(Rule { cond, action });
    }
    if rules.is_empty() {
        return Err(StrategyError::Empty);
    }
    Ok(CompiledStrategyT {
        id,
        name: name.into(),
        scope,
        rules,
    })
}

fn parse_action(s: &str) -> Option<Action> {
    match s.trim().to_ascii_uppercase().as_str() {
        "BUY" | "BUY()" => Some(Action::Buy),
        "SELL" | "SELL()" => Some(Action::Sell),
        "HOLD" | "HOLD()" => Some(Action::Hold),
        _ => None,
    }
}

fn lower_bool_expr<I: Copy>(
    e: BoolExprCall,
    resolver: &mut dyn FnMut(IndicatorCall) -> Result<I, String>,
) -> Result<BoolExpr<I>, String> {
    Ok(match e {
        BoolExprCall::Cmp { left, op, right } => BoolExpr::Cmp {
            left: ScalarOperand::Indicator(resolver(left)?),
            op,
            right,
        },
        BoolExprCall::And(a, b) => BoolExpr::And(
            Box::new(lower_bool_expr(*a, resolver)?),
            Box::new(lower_bool_expr(*b, resolver)?),
        ),
        BoolExprCall::Or(a, b) => BoolExpr::Or(
            Box::new(lower_bool_expr(*a, resolver)?),
            Box::new(lower_bool_expr(*b, resolver)?),
        ),
        BoolExprCall::Not(x) => BoolExpr::Not(Box::new(lower_bool_expr(*x, resolver)?)),
    })
}

fn resolve_call_single(call: IndicatorCall, graph: &mut IndicatorGraph) -> Result<IndicatorId, String> {
    // Disallow `@period` in a single-period engine to avoid silent wrong results.
    let check_series = |s: &SeriesRef| -> Result<(), String> {
        if s.period_suffix.is_some() {
            return Err("multi-period suffix like `close@4h` requires MultiHQuant".into());
        }
        Ok(())
    };

    match call {
        IndicatorCall::Rsi { series, period } => {
            if let Some(s) = &series {
                check_series(s)?;
                if s.field != Field::Close {
                    return Err("RSI only supports close series".into());
                }
            }
            Ok(graph.add(IndicatorSpec::Rsi { period }))
        }
        IndicatorCall::Sma { series, period } => {
            check_series(&series)?;
            Ok(graph.add(IndicatorSpec::Sma {
                field: series.field,
                period,
            }))
        }
        IndicatorCall::Ema { series, period } => {
            check_series(&series)?;
            Ok(graph.add(IndicatorSpec::Ema {
                field: series.field,
                period,
            }))
        }
        IndicatorCall::StdDev { series, period } => {
            check_series(&series)?;
            Ok(graph.add(IndicatorSpec::StdDev {
                field: series.field,
                period,
            }))
        }
    }
}

// ===== Condition parser =====

fn parse_condition(src: &str) -> Result<BoolExprCall, String> {
    dsl_parser::parse_condition(src)
}

fn parse_series_ref_str(s: &str) -> Result<SeriesRef, String> {
    let (field_s, period_suffix) = if let Some((a, b)) = s.split_once('@') {
        (a, Some(b.to_string()))
    } else {
        (s, None)
    };
    let field = match field_s.to_ascii_lowercase().as_str() {
        "open" => Field::Open,
        "high" => Field::High,
        "low" => Field::Low,
        "close" => Field::Close,
        "volume" => Field::Volume,
        "buy_volume" | "buyvolume" => Field::BuyVolume,
        _ => return Err(format!("unknown field: {field_s}")),
    };
    Ok(SeriesRef { field, period_suffix })
}

// Used by MultiHQuant resolver: parse `@4h` suffix to ms.
pub fn period_suffix_to_ms(suffix: &str) -> Result<i64, String> {
    Ok(Period::parse(suffix)
        .map_err(|e| e.to_string())?
        .as_ms())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::HQuant;
    use crate::Bar;

    #[test]
    fn parses_parentheses_and_not() {
        let mut hq = HQuant::new(32);
        hq.add_indicator(IndicatorSpec::Rsi { period: 3 });
        hq.add_indicator(IndicatorSpec::Sma {
            field: Field::Close,
            period: 3,
        });
        hq.add_strategy(
            "s",
            "IF NOT (RSI(3) > 70) AND (SMA(close, period=3) < 200) THEN BUY",
        )
        .unwrap();

        for i in 0..6 {
            let close = 100.0 - (i as f64);
            hq.push_kline(Bar::new(i, close, close, close, close, 0.0, 0.0));
        }
        let sigs = hq.poll_signals();
        assert!(sigs.iter().any(|s| s.action == Action::Buy));
    }
}
