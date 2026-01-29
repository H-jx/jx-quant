use pest::iterators::Pair;
use pest::Parser as PestParser;
use pest_derive::Parser;

use super::{BoolExprCall, CmpOp, IndicatorCall, SeriesRef};

#[derive(Parser)]
#[grammar = "strategy/dsl.pest"]
struct ConditionParser;

pub(super) fn parse_condition(src: &str) -> Result<BoolExprCall, String> {
    let mut pairs = ConditionParser::parse(Rule::condition, src).map_err(|e| e.to_string())?;
    let pair = pairs.next().ok_or_else(|| "empty condition".to_string())?;
    let expr_pair = pair.into_inner().next().ok_or_else(|| "empty condition".to_string())?;
    build_expr(expr_pair)
}

fn build_expr(pair: Pair<'_, Rule>) -> Result<BoolExprCall, String> {
    match pair.as_rule() {
        Rule::expr => build_expr(pair.into_inner().next().unwrap()),
        Rule::or_expr => fold_bin(pair, Rule::or_op, BoolExprCall::Or),
        Rule::and_expr => fold_bin(pair, Rule::and_op, BoolExprCall::And),
        Rule::unary_expr => {
            let mut inner = pair.into_inner().peekable();
            let mut not_count = 0usize;
            while matches!(inner.peek().map(|p| p.as_rule()), Some(Rule::not_op)) {
                inner.next();
                not_count += 1;
            }
            let primary = inner.next().ok_or_else(|| "missing expression".to_string())?;
            let mut out = build_expr(primary)?;
            if not_count % 2 == 1 {
                out = BoolExprCall::Not(Box::new(out));
            }
            Ok(out)
        }
        Rule::primary => build_expr(pair.into_inner().next().unwrap()),
        Rule::comparison => build_comparison(pair),
        _ => Err(format!("unexpected rule: {:?}", pair.as_rule())),
    }
}

fn fold_bin(
    pair: Pair<'_, Rule>,
    op_rule: Rule,
    mk: fn(Box<BoolExprCall>, Box<BoolExprCall>) -> BoolExprCall,
) -> Result<BoolExprCall, String> {
    let mut inner = pair.into_inner();
    let first = inner.next().ok_or_else(|| "missing lhs".to_string())?;
    let mut left = build_expr(first)?;
    while let Some(op) = inner.next() {
        if op.as_rule() != op_rule {
            return Err(format!("unexpected operator rule: {:?}", op.as_rule()));
        }
        let rhs = inner.next().ok_or_else(|| "missing rhs".to_string())?;
        let right = build_expr(rhs)?;
        left = mk(Box::new(left), Box::new(right));
    }
    Ok(left)
}

fn build_comparison(pair: Pair<'_, Rule>) -> Result<BoolExprCall, String> {
    let mut inner = pair.into_inner();
    let call_pair = inner.next().ok_or_else(|| "missing indicator call".to_string())?;
    let op_pair = inner.next().ok_or_else(|| "missing comparison operator".to_string())?;
    let rhs_pair = inner.next().ok_or_else(|| "missing rhs number".to_string())?;

    let left = parse_indicator_call(call_pair)?;
    let op = match op_pair.as_str() {
        "<" => CmpOp::Lt,
        "<=" => CmpOp::Le,
        ">" => CmpOp::Gt,
        ">=" => CmpOp::Ge,
        "==" => CmpOp::Eq,
        "!=" => CmpOp::Ne,
        _ => return Err(format!("unknown comparison operator: {}", op_pair.as_str())),
    };
    let right: f64 = rhs_pair
        .as_str()
        .parse()
        .map_err(|_| format!("invalid number: {}", rhs_pair.as_str()))?;

    Ok(BoolExprCall::Cmp { left, op, right })
}

#[derive(Debug, Clone)]
enum Arg {
    Value(Value),
    Kwarg(String, Value),
}

#[derive(Debug, Clone)]
enum Value {
    Number(f64),
    Series(SeriesRef),
}

fn parse_indicator_call(pair: Pair<'_, Rule>) -> Result<IndicatorCall, String> {
    let mut inner = pair.into_inner();
    let name = inner
        .next()
        .ok_or_else(|| "missing indicator name".to_string())?
        .as_str()
        .to_string();
    let args = inner
        .next()
        .map(parse_arg_list)
        .transpose()?
        .unwrap_or_default();

    build_indicator_call(&name, &args)
}

fn parse_arg_list(pair: Pair<'_, Rule>) -> Result<Vec<Arg>, String> {
    debug_assert_eq!(pair.as_rule(), Rule::arg_list);
    let mut out = Vec::new();
    for p in pair.into_inner() {
        match p.as_rule() {
            Rule::kwarg => out.push(parse_kwarg(p)?),
            Rule::value => out.push(Arg::Value(parse_value(p)?)),
            _ => return Err(format!("unexpected arg list item: {:?}", p.as_rule())),
        }
    }
    Ok(out)
}

fn parse_kwarg(pair: Pair<'_, Rule>) -> Result<Arg, String> {
    debug_assert_eq!(pair.as_rule(), Rule::kwarg);
    let mut kv = pair.into_inner();
    let k = kv
        .next()
        .ok_or_else(|| "missing kwarg key".to_string())?
        .as_str()
        .to_string();
    let v = kv
        .next()
        .ok_or_else(|| "missing kwarg value".to_string())?;
    Ok(Arg::Kwarg(k, parse_value(v)?))
}

fn parse_value(pair: Pair<'_, Rule>) -> Result<Value, String> {
    match pair.as_rule() {
        Rule::value => parse_value(pair.into_inner().next().unwrap()),
        Rule::series_ref => Ok(Value::Series(super::parse_series_ref_str(pair.as_str())?)),
        Rule::number => {
            let n: f64 = pair
                .as_str()
                .parse()
                .map_err(|_| format!("invalid number: {}", pair.as_str()))?;
            Ok(Value::Number(n))
        }
        _ => Err(format!("unexpected value rule: {:?}", pair.as_rule())),
    }
}

fn build_indicator_call(name: &str, args: &[Arg]) -> Result<IndicatorCall, String> {
    let upper = name.to_ascii_uppercase();

    match upper.as_str() {
        "RSI" => {
            let mut series: Option<SeriesRef> = None;
            let mut period: Option<usize> = None;

            for a in args {
                match a {
                    Arg::Value(v) => match v {
                        Value::Series(s) => {
                            if series.is_some() {
                                return Err("RSI: too many series args".into());
                            }
                            series = Some(s.clone());
                        }
                        Value::Number(n) => {
                            if period.is_some() {
                                return Err("RSI: too many period args".into());
                            }
                            period = Some(expect_usize(*n, "RSI period")?);
                        }
                    },
                    Arg::Kwarg(k, v) => {
                        let ku = k.to_ascii_uppercase();
                        match ku.as_str() {
                            "PERIOD" => match v {
                                Value::Number(n) => period = Some(expect_usize(*n, "RSI period")?),
                                _ => return Err("RSI: PERIOD expects a number".into()),
                            },
                            "FIELD" => match v {
                                Value::Series(s) => series = Some(s.clone()),
                                _ => return Err("RSI: FIELD expects a series".into()),
                            },
                            _ => return Err(format!("RSI: unknown kwarg {k}")),
                        }
                    }
                }
            }

            let period = period.ok_or_else(|| "RSI missing period".to_string())?;
            if let Some(s) = &series {
                if s.field != crate::Field::Close {
                    return Err("RSI only supports close series".into());
                }
            }
            Ok(IndicatorCall::Rsi { series, period })
        }
        "SMA" | "EMA" | "STDDEV" => {
            let mut series: Option<SeriesRef> = None;
            let mut period: Option<usize> = None;

            for a in args {
                match a {
                    Arg::Value(v) => match v {
                        Value::Series(s) => {
                            if series.is_some() {
                                return Err(format!("{upper}: too many series args"));
                            }
                            series = Some(s.clone());
                        }
                        Value::Number(n) => {
                            if period.is_some() {
                                return Err(format!("{upper}: too many period args"));
                            }
                            period = Some(expect_usize(*n, format!("{upper} period"))?);
                        }
                    },
                    Arg::Kwarg(k, v) => {
                        let ku = k.to_ascii_uppercase();
                        match ku.as_str() {
                            "PERIOD" => match v {
                                Value::Number(n) => {
                                    period = Some(expect_usize(*n, format!("{upper} period"))?)
                                }
                                _ => return Err(format!("{upper}: PERIOD expects a number")),
                            },
                            "FIELD" => match v {
                                Value::Series(s) => series = Some(s.clone()),
                                _ => return Err(format!("{upper}: FIELD expects a series")),
                            },
                            _ => return Err(format!("{upper}: unknown kwarg {k}")),
                        }
                    }
                }
            }

            let period = period.ok_or_else(|| format!("{upper} missing period"))?;
            let series = series.unwrap_or_else(|| SeriesRef {
                field: crate::Field::Close,
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

fn expect_usize(n: f64, what: impl Into<String>) -> Result<usize, String> {
    let what = what.into();
    if !n.is_finite() || n <= 0.0 {
        return Err(format!("{what} must be > 0"));
    }
    if n.fract() != 0.0 {
        return Err(format!("{what} must be an integer"));
    }
    Ok(n as usize)
}
