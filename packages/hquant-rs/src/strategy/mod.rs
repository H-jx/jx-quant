use crate::indicator::{IndicatorGraph, IndicatorId, IndicatorSpec};
use crate::period::Period;
use crate::{Action, Field, Signal};

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

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Ident(String),
    Number(f64),
    LParen,
    RParen,
    Comma,
    Assign,
    EqEq,
    Lt,
    Gt,
    Le,
    Ge,
    And,
    Or,
    Not,
}

fn parse_condition(src: &str) -> Result<BoolExprCall, String> {
    let mut p = Parser::new(src)?;
    let expr = p.parse_or()?;
    if p.peek().is_some() {
        return Err("unexpected tokens after condition".into());
    }
    Ok(expr)
}

struct Parser {
    toks: Vec<Tok>,
    i: usize,
}

impl Parser {
    fn new(src: &str) -> Result<Self, String> {
        Ok(Self {
            toks: lex(src)?,
            i: 0,
        })
    }

    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.i)
    }

    fn bump(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.i).cloned();
        if t.is_some() {
            self.i += 1;
        }
        t
    }

    fn eat(&mut self, want: &Tok) -> bool {
        if self.peek() == Some(want) {
            self.i += 1;
            true
        } else {
            false
        }
    }

    fn parse_or(&mut self) -> Result<BoolExprCall, String> {
        let mut left = self.parse_and()?;
        while matches!(self.peek(), Some(Tok::Or)) {
            self.bump();
            let right = self.parse_and()?;
            left = BoolExprCall::Or(Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<BoolExprCall, String> {
        let mut left = self.parse_unary()?;
        while matches!(self.peek(), Some(Tok::And)) {
            self.bump();
            let right = self.parse_unary()?;
            left = BoolExprCall::And(Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<BoolExprCall, String> {
        if matches!(self.peek(), Some(Tok::Not)) {
            self.bump();
            return Ok(BoolExprCall::Not(Box::new(self.parse_unary()?)));
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<BoolExprCall, String> {
        if self.eat(&Tok::LParen) {
            let e = self.parse_or()?;
            if !self.eat(&Tok::RParen) {
                return Err("missing ')'".into());
            }
            return Ok(e);
        }
        self.parse_cmp()
    }

    fn parse_cmp(&mut self) -> Result<BoolExprCall, String> {
        let left = self.parse_indicator_call()?;
        let op = match self.bump() {
            Some(Tok::Lt) => CmpOp::Lt,
            Some(Tok::Le) => CmpOp::Le,
            Some(Tok::Gt) => CmpOp::Gt,
            Some(Tok::Ge) => CmpOp::Ge,
            Some(Tok::EqEq) => CmpOp::Eq,
            _ => return Err("missing comparison operator".into()),
        };
        let right = match self.bump() {
            Some(Tok::Number(n)) => n,
            _ => return Err("expected number on right side".into()),
        };
        Ok(BoolExprCall::Cmp { left, op, right })
    }

    fn parse_indicator_call(&mut self) -> Result<IndicatorCall, String> {
        let name = match self.bump() {
            Some(Tok::Ident(s)) => s,
            _ => return Err("expected indicator name".into()),
        };
        if !self.eat(&Tok::LParen) {
            return Err("expected '(' after indicator name".into());
        }
        let mut args: Vec<Tok> = Vec::new();
        // Collect tokens until ')', but keep commas for splitting.
        let mut depth = 0i32;
        while let Some(t) = self.peek() {
            if matches!(t, Tok::RParen) && depth == 0 {
                break;
            }
            match t {
                Tok::LParen => depth += 1,
                Tok::RParen => depth -= 1,
                _ => {}
            }
            args.push(self.bump().unwrap());
        }
        if !self.eat(&Tok::RParen) {
            return Err("missing ')' after indicator args".into());
        }
        parse_indicator_call_from_tokens(&name, &args)
    }
}

fn lex(src: &str) -> Result<Vec<Tok>, String> {
    let mut out = Vec::new();
    let mut i = 0usize;
    let b = src.as_bytes();
    while i < b.len() {
        let c = b[i] as char;
        if c.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        match c {
            '(' => {
                out.push(Tok::LParen);
                i += 1;
            }
            ')' => {
                out.push(Tok::RParen);
                i += 1;
            }
            ',' => {
                out.push(Tok::Comma);
                i += 1;
            }
            '<' => {
                if i + 1 < b.len() && b[i + 1] as char == '=' {
                    out.push(Tok::Le);
                    i += 2;
                } else {
                    out.push(Tok::Lt);
                    i += 1;
                }
            }
            '>' => {
                if i + 1 < b.len() && b[i + 1] as char == '=' {
                    out.push(Tok::Ge);
                    i += 2;
                } else {
                    out.push(Tok::Gt);
                    i += 1;
                }
            }
            '=' => {
                if i + 1 < b.len() && b[i + 1] as char == '=' {
                    out.push(Tok::EqEq);
                    i += 2;
                } else {
                    out.push(Tok::Assign);
                    i += 1;
                }
            }
            _ => {
                if c.is_ascii_digit() || c == '.' {
                    let start = i;
                    i += 1;
                    while i < b.len() {
                        let ch = b[i] as char;
                        if ch.is_ascii_digit() || ch == '.' {
                            i += 1;
                        } else {
                            break;
                        }
                    }
                    let s = &src[start..i];
                    let n: f64 = s.parse().map_err(|_| format!("invalid number: {s}"))?;
                    out.push(Tok::Number(n));
                    continue;
                }
                if is_ident_start(c) {
                    let start = i;
                    i += 1;
                    while i < b.len() {
                        let ch = b[i] as char;
                        if is_ident_cont(ch) {
                            i += 1;
                        } else {
                            break;
                        }
                    }
                    let s = src[start..i].to_string();
                    let upper = s.to_ascii_uppercase();
                    match upper.as_str() {
                        "AND" => out.push(Tok::And),
                        "OR" => out.push(Tok::Or),
                        "NOT" => out.push(Tok::Not),
                        _ => out.push(Tok::Ident(s)),
                    }
                    continue;
                }
                return Err(format!("unexpected char: {c}"));
            }
        }
    }
    Ok(out)
}

#[inline]
fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}

#[inline]
fn is_ident_cont(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '@'
}

fn parse_indicator_call_from_tokens(name: &str, args: &[Tok]) -> Result<IndicatorCall, String> {
    let upper = name.to_ascii_uppercase();
    let parts = split_args(args);

    match upper.as_str() {
        "RSI" => {
            // RSI(14) | RSI(period=14) | RSI(close@4h, 14) | RSI(close, period=14)
            let mut series: Option<SeriesRef> = None;
            let mut period: Option<usize> = None;
            for p in parts {
                if p.is_empty() {
                    continue;
                }
                if let Some((k, v)) = parse_kv(&p)? {
                    if k == "PERIOD" {
                        period = Some(parse_usize_token(&v)?);
                    } else {
                        return Err(format!("unknown arg {k} for RSI"));
                    }
                    continue;
                }
                if series.is_none() {
                    if let Some(sr) = try_parse_series_ref(&p)? {
                        series = Some(sr);
                        continue;
                    }
                }
                if period.is_none() {
                    period = Some(parse_usize_token(&p)?);
                    continue;
                }
                return Err("too many args for RSI".into());
            }
            let period = period.ok_or_else(|| "RSI missing period".to_string())?;
            Ok(IndicatorCall::Rsi { series, period })
        }
        "SMA" | "EMA" | "STDDEV" => {
            // SMA(close@4h, period=20) | SMA(period=20) | SMA(20)
            let mut series: Option<SeriesRef> = None;
            let mut period: Option<usize> = None;
            for p in parts {
                if p.is_empty() {
                    continue;
                }
                if let Some((k, v)) = parse_kv(&p)? {
                    if k == "PERIOD" {
                        period = Some(parse_usize_token(&v)?);
                    } else if k == "FIELD" {
                        series = Some(parse_series_ref_tokens(&v)?);
                    } else {
                        return Err(format!("unknown arg {k} for {upper}"));
                    }
                    continue;
                }
                if series.is_none() {
                    if let Some(sr) = try_parse_series_ref(&p)? {
                        series = Some(sr);
                        continue;
                    }
                }
                if period.is_none() {
                    period = Some(parse_usize_token(&p)?);
                    continue;
                }
                return Err(format!("too many args for {upper}"));
            }
            let period = period.ok_or_else(|| format!("{upper} missing period"))?;
            let series = series.unwrap_or_else(|| SeriesRef {
                field: Field::Close,
                period_suffix: None,
            });
            Ok(match upper.as_str() {
                "SMA" => IndicatorCall::Sma { series, period },
                "EMA" => IndicatorCall::Ema { series, period },
                _ => IndicatorCall::StdDev { series, period },
            })
        }
        _ => Err(format!("unsupported indicator: {name}")),
    }
}

fn split_args(args: &[Tok]) -> Vec<Vec<Tok>> {
    let mut out = Vec::new();
    let mut cur = Vec::new();
    for t in args {
        if matches!(t, Tok::Comma) {
            out.push(cur);
            cur = Vec::new();
        } else {
            cur.push(t.clone());
        }
    }
    out.push(cur);
    out
}

fn parse_kv(part: &[Tok]) -> Result<Option<(String, Vec<Tok>)>, String> {
    // Parses `ident = value` where value is a single token (Ident/Number) or series ref token.
    if part.len() >= 3 {
        if let Tok::Ident(k) = &part[0] {
            if matches!(part[1], Tok::Assign) {
                return Ok(Some((k.to_ascii_uppercase(), part[2..].to_vec())));
            }
        }
    }
    Ok(None)
}

fn parse_usize_token(part: &[Tok]) -> Result<usize, String> {
    if part.len() != 1 {
        return Err("expected single number".into());
    }
    match &part[0] {
        Tok::Number(n) => Ok(*n as usize),
        Tok::Ident(s) => s.parse::<usize>().map_err(|_| "invalid integer".into()),
        _ => Err("expected number".into()),
    }
}

fn try_parse_series_ref(part: &[Tok]) -> Result<Option<SeriesRef>, String> {
    if part.len() != 1 {
        return Ok(None);
    }
    match &part[0] {
        Tok::Ident(s) => Ok(Some(parse_series_ref_str(s)?)),
        _ => Ok(None),
    }
}

fn parse_series_ref_tokens(part: &[Tok]) -> Result<SeriesRef, String> {
    if part.len() != 1 {
        return Err("FIELD expects a single identifier".into());
    }
    match &part[0] {
        Tok::Ident(s) => parse_series_ref_str(s),
        _ => Err("FIELD expects an identifier".into()),
    }
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
