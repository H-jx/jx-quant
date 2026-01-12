/// 动态指标 - 支持运行时自定义指标计算函数
///
/// 示例:
/// ```ignore
/// quant.addDynamicIndicator("vwap", |bars| {
///     calcVWAP(bars.close, bars.volume)
/// });
/// ```

use crate::common::F64RingBuffer;
use crate::kline::{Bar, KlineSeries};
use super::{Indicator, IndicatorValue};

/// 动态指标计算函数类型
/// 输入: K线序列引用
/// 输出: 计算结果值
pub type DynamicIndicatorFn = Box<dyn Fn(&KlineSeries) -> Option<f64> + Send + Sync>;

/// 动态指标
pub struct DynamicIndicator {
    name: String,
    min_periods: usize,
    calc_fn: DynamicIndicatorFn,
    klines: KlineSeries,
    values: F64RingBuffer,
    last_timestamp: i64,
}

impl DynamicIndicator {
    /// 创建动态指标
    ///
    /// # 参数
    /// - `name`: 指标名称
    /// - `min_periods`: 最小数据点数量
    /// - `capacity`: 数据缓存容量
    /// - `calc_fn`: 计算函数
    pub fn new<F>(name: impl Into<String>, min_periods: usize, capacity: usize, calc_fn: F) -> Self
    where
        F: Fn(&KlineSeries) -> Option<f64> + Send + Sync + 'static,
    {
        Self {
            name: name.into(),
            min_periods,
            calc_fn: Box::new(calc_fn),
            klines: KlineSeries::new(capacity),
            values: F64RingBuffer::new(capacity),
            last_timestamp: 0,
        }
    }
}

impl std::fmt::Debug for DynamicIndicator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DynamicIndicator")
            .field("name", &self.name)
            .field("min_periods", &self.min_periods)
            .field("values_len", &self.values.len())
            .finish()
    }
}

impl Indicator for DynamicIndicator {
    fn name(&self) -> &str {
        &self.name
    }

    fn min_periods(&self) -> usize {
        self.min_periods
    }

    fn push(&mut self, bar: &Bar) {
        self.klines.append(bar);
        self.last_timestamp = bar.timestamp;

        if self.klines.len() >= self.min_periods {
            if let Some(value) = (self.calc_fn)(&self.klines) {
                self.values.push(value);
            }
        }
    }

    fn update_last(&mut self, bar: &Bar) {
        self.klines.update_last(bar);
        self.last_timestamp = bar.timestamp;

        if self.klines.len() >= self.min_periods {
            if let Some(value) = (self.calc_fn)(&self.klines) {
                self.values.update_last(value);
            }
        }
    }

    fn value(&self) -> Option<f64> {
        self.values.last()
    }

    fn result(&self) -> Option<IndicatorValue> {
        self.value().map(|v| IndicatorValue::new(v, self.last_timestamp))
    }

    fn is_ready(&self) -> bool {
        self.klines.len() >= self.min_periods
    }

    fn get(&self, index: usize) -> Option<f64> {
        self.values.get(index)
    }

    fn get_from_end(&self, n: usize) -> Option<f64> {
        self.values.get_from_end(n)
    }

    fn len(&self) -> usize {
        self.values.len()
    }

    fn reset(&mut self) {
        self.klines.clear();
        self.values.clear();
        self.last_timestamp = 0;
    }
}

/// 常用动态指标工厂函数

/// VWAP (成交量加权平均价格)
pub fn vwap(capacity: usize) -> DynamicIndicator {
    DynamicIndicator::new("VWAP", 1, capacity, |klines| {
        let mut sum_pv = 0.0;
        let mut sum_v = 0.0;

        for i in 0..klines.len() {
            if let (Some(typical), Some(vol)) = (
                klines.get(i).map(|b| (b.high + b.low + b.close) / 3.0),
                klines.volumes().get(i),
            ) {
                sum_pv += typical * vol;
                sum_v += vol;
            }
        }

        if sum_v > 0.0 {
            Some(sum_pv / sum_v)
        } else {
            None
        }
    })
}

/// OBV (能量潮指标)
pub fn obv(capacity: usize) -> DynamicIndicator {
    DynamicIndicator::new("OBV", 2, capacity, |klines| {
        let mut obv = 0.0;

        for i in 1..klines.len() {
            if let (Some(prev), Some(curr)) = (klines.get(i - 1), klines.get(i)) {
                if curr.close > prev.close {
                    obv += curr.volume;
                } else if curr.close < prev.close {
                    obv -= curr.volume;
                }
            }
        }

        Some(obv)
    })
}

/// MFI (资金流量指标)
pub fn mfi(period: usize, capacity: usize) -> DynamicIndicator {
    DynamicIndicator::new(format!("MFI_{}", period), period + 1, capacity, move |klines| {
        if klines.len() < period + 1 {
            return None;
        }

        let mut positive_flow = 0.0;
        let mut negative_flow = 0.0;

        let start = klines.len().saturating_sub(period + 1);

        for i in (start + 1)..klines.len() {
            if let (Some(prev), Some(curr)) = (klines.get(i - 1), klines.get(i)) {
                let prev_typical = (prev.high + prev.low + prev.close) / 3.0;
                let curr_typical = (curr.high + curr.low + curr.close) / 3.0;
                let money_flow = curr_typical * curr.volume;

                if curr_typical > prev_typical {
                    positive_flow += money_flow;
                } else if curr_typical < prev_typical {
                    negative_flow += money_flow;
                }
            }
        }

        if negative_flow == 0.0 {
            Some(100.0)
        } else {
            let mfr = positive_flow / negative_flow;
            Some(100.0 - 100.0 / (1.0 + mfr))
        }
    })
}

/// Williams %R
pub fn williams_r(period: usize, capacity: usize) -> DynamicIndicator {
    DynamicIndicator::new(format!("WR_{}", period), period, capacity, move |klines| {
        if klines.len() < period {
            return None;
        }

        let start = klines.len() - period;
        let mut highest = f64::NEG_INFINITY;
        let mut lowest = f64::INFINITY;

        for i in start..klines.len() {
            if let Some(bar) = klines.get(i) {
                highest = highest.max(bar.high);
                lowest = lowest.min(bar.low);
            }
        }

        if let Some(last) = klines.last() {
            let range = highest - lowest;
            if range > 0.0 {
                Some(-100.0 * (highest - last.close) / range)
            } else {
                Some(-50.0)
            }
        } else {
            None
        }
    })
}

/// CCI (商品通道指数)
pub fn cci(period: usize, capacity: usize) -> DynamicIndicator {
    DynamicIndicator::new(format!("CCI_{}", period), period, capacity, move |klines| {
        if klines.len() < period {
            return None;
        }

        let start = klines.len() - period;
        let mut typicals = Vec::with_capacity(period);

        for i in start..klines.len() {
            if let Some(bar) = klines.get(i) {
                typicals.push((bar.high + bar.low + bar.close) / 3.0);
            }
        }

        if typicals.len() < period {
            return None;
        }

        let sma: f64 = typicals.iter().sum::<f64>() / period as f64;
        let mad: f64 = typicals.iter().map(|t| (t - sma).abs()).sum::<f64>() / period as f64;

        if let Some(&last_typical) = typicals.last() {
            if mad > 0.0 {
                Some((last_typical - sma) / (0.015 * mad))
            } else {
                Some(0.0)
            }
        } else {
            None
        }
    })
}

/// ROC (变动率)
pub fn roc(period: usize, capacity: usize) -> DynamicIndicator {
    DynamicIndicator::new(format!("ROC_{}", period), period + 1, capacity, move |klines| {
        if klines.len() < period + 1 {
            return None;
        }

        let current = klines.last()?;
        let past = klines.get(klines.len() - period - 1)?;

        if past.close != 0.0 {
            Some((current.close - past.close) / past.close * 100.0)
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_bars() -> Vec<Bar> {
        vec![
            Bar::new(1000, 100.0, 105.0, 99.0, 104.0, 1000.0),
            Bar::new(2000, 104.0, 108.0, 103.0, 107.0, 1200.0),
            Bar::new(3000, 107.0, 110.0, 106.0, 109.0, 1100.0),
            Bar::new(4000, 109.0, 112.0, 108.0, 111.0, 1300.0),
            Bar::new(5000, 111.0, 113.0, 109.0, 110.0, 900.0),
        ]
    }

    #[test]
    fn test_dynamic_indicator_basic() {
        // 创建一个简单的收盘价均值指标
        let mut indicator = DynamicIndicator::new("close_avg", 3, 100, |klines| {
            let mut sum = 0.0;
            let count = klines.len();
            for i in 0..count {
                if let Some(bar) = klines.get(i) {
                    sum += bar.close;
                }
            }
            Some(sum / count as f64)
        });

        let bars = create_bars();
        for bar in &bars {
            indicator.push(bar);
        }

        assert!(indicator.is_ready());
        assert!(indicator.value().is_some());
    }

    #[test]
    fn test_vwap() {
        let mut indicator = vwap(100);
        let bars = create_bars();

        for bar in &bars {
            indicator.push(bar);
        }

        assert!(indicator.is_ready());
        let vwap_val = indicator.value().unwrap();
        assert!(vwap_val > 100.0 && vwap_val < 115.0);
    }

    #[test]
    fn test_obv() {
        let mut indicator = obv(100);
        let bars = create_bars();

        for bar in &bars {
            indicator.push(bar);
        }

        assert!(indicator.is_ready());
        // 价格持续上涨，OBV应该为正
        assert!(indicator.value().unwrap() > 0.0);
    }

    #[test]
    fn test_williams_r() {
        let mut indicator = williams_r(5, 100);
        let bars = create_bars();

        for bar in &bars {
            indicator.push(bar);
        }

        assert!(indicator.is_ready());
        let wr = indicator.value().unwrap();
        // Williams %R 范围是 -100 到 0
        assert!(wr >= -100.0 && wr <= 0.0);
    }

    #[test]
    fn test_cci() {
        let mut indicator = cci(5, 100);
        let bars = create_bars();

        for bar in &bars {
            indicator.push(bar);
        }

        assert!(indicator.is_ready());
        assert!(indicator.value().is_some());
    }

    #[test]
    fn test_roc() {
        let mut indicator = roc(3, 100);
        let bars = create_bars();

        for bar in &bars {
            indicator.push(bar);
        }

        assert!(indicator.is_ready());
        // 价格上涨，ROC应该为正
        assert!(indicator.value().unwrap() > 0.0);
    }

    #[test]
    fn test_dynamic_indicator_update_last() {
        let mut indicator = DynamicIndicator::new("last_close", 1, 100, |klines| {
            klines.last().map(|b| b.close)
        });

        let bars = create_bars();
        for bar in &bars {
            indicator.push(bar);
        }

        let initial = indicator.value().unwrap();
        assert_eq!(initial, 110.0);

        // 更新最后一根
        let updated = Bar::new(5000, 111.0, 120.0, 109.0, 118.0, 1500.0);
        indicator.update_last(&updated);

        assert_eq!(indicator.value().unwrap(), 118.0);
    }
}
