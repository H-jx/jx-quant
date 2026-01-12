/// MACD 指标 (Moving Average Convergence Divergence)
/// MACD Line = EMA(fast) - EMA(slow)
/// Signal Line = EMA(MACD Line, signal_period)
/// Histogram = MACD Line - Signal Line

use crate::common::F64RingBuffer;
use crate::kline::Bar;
use super::{Indicator, IndicatorValue, PriceType};

#[derive(Debug)]
pub struct MACD {
    name: String,
    #[allow(dead_code)]
    fast_period: usize,
    slow_period: usize,
    signal_period: usize,
    price_type: PriceType,
    // EMA 值
    fast_ema: f64,
    slow_ema: f64,
    signal_ema: f64,
    // EMA 乘数
    fast_mult: f64,
    slow_mult: f64,
    signal_mult: f64,
    // 输出
    macd_values: F64RingBuffer,
    signal_values: F64RingBuffer,
    histogram_values: F64RingBuffer,
    // 状态
    count: usize,
    last_timestamp: i64,
    // 初始化用
    price_sum: f64,
}

impl MACD {
    pub fn new(fast_period: usize, slow_period: usize, signal_period: usize) -> Self {
        Self::with_price_type(fast_period, slow_period, signal_period, PriceType::Close)
    }

    pub fn with_price_type(
        fast_period: usize,
        slow_period: usize,
        signal_period: usize,
        price_type: PriceType,
    ) -> Self {
        Self {
            name: format!("MACD_{}_{}", fast_period, slow_period),
            fast_period,
            slow_period,
            signal_period,
            price_type,
            fast_ema: 0.0,
            slow_ema: 0.0,
            signal_ema: 0.0,
            fast_mult: 2.0 / (fast_period as f64 + 1.0),
            slow_mult: 2.0 / (slow_period as f64 + 1.0),
            signal_mult: 2.0 / (signal_period as f64 + 1.0),
            macd_values: F64RingBuffer::new(slow_period * 2),
            signal_values: F64RingBuffer::new(slow_period * 2),
            histogram_values: F64RingBuffer::new(slow_period * 2),
            count: 0,
            last_timestamp: 0,
            price_sum: 0.0,
        }
    }

    /// 标准 MACD (12, 26, 9)
    pub fn standard() -> Self {
        Self::new(12, 26, 9)
    }

    /// 获取 MACD 线值
    pub fn macd_line(&self) -> Option<f64> {
        self.macd_values.last()
    }

    /// 获取信号线值
    pub fn signal_line(&self) -> Option<f64> {
        self.signal_values.last()
    }

    /// 获取柱状图值
    pub fn histogram(&self) -> Option<f64> {
        self.histogram_values.last()
    }
}

impl Indicator for MACD {
    fn name(&self) -> &str {
        &self.name
    }

    fn min_periods(&self) -> usize {
        self.slow_period + self.signal_period - 1
    }

    fn push(&mut self, bar: &Bar) {
        let price = self.price_type.extract(bar);
        self.count += 1;
        self.last_timestamp = bar.timestamp;
        self.price_sum += price;

        if self.count < self.slow_period {
            // 收集数据阶段
            return;
        }

        if self.count == self.slow_period {
            // 初始化 EMA
            let sma = self.price_sum / self.slow_period as f64;
            self.fast_ema = sma;
            self.slow_ema = sma;
        } else {
            // 更新 EMA
            self.fast_ema = (price - self.fast_ema) * self.fast_mult + self.fast_ema;
            self.slow_ema = (price - self.slow_ema) * self.slow_mult + self.slow_ema;
        }

        let macd = self.fast_ema - self.slow_ema;
        self.macd_values.push(macd);

        // 计算信号线
        let macd_count = self.macd_values.len();
        if macd_count < self.signal_period {
            return;
        }

        if macd_count == self.signal_period {
            // 初始化信号线 EMA
            self.signal_ema = self.macd_values.mean();
        } else {
            self.signal_ema = (macd - self.signal_ema) * self.signal_mult + self.signal_ema;
        }

        self.signal_values.push(self.signal_ema);
        self.histogram_values.push(macd - self.signal_ema);
    }

    fn update_last(&mut self, bar: &Bar) {
        let price = self.price_type.extract(bar);
        self.last_timestamp = bar.timestamp;

        if self.count < self.slow_period {
            return;
        }

        // 重新计算当前 EMA（使用前一个值）
        let prev_fast = if self.count == self.slow_period {
            self.price_sum / self.slow_period as f64
        } else {
            // 近似：使用当前值回推
            (self.fast_ema - price * self.fast_mult) / (1.0 - self.fast_mult)
        };

        let prev_slow = if self.count == self.slow_period {
            self.price_sum / self.slow_period as f64
        } else {
            (self.slow_ema - price * self.slow_mult) / (1.0 - self.slow_mult)
        };

        let new_fast = (price - prev_fast) * self.fast_mult + prev_fast;
        let new_slow = (price - prev_slow) * self.slow_mult + prev_slow;
        let macd = new_fast - new_slow;

        self.macd_values.update_last(macd);

        if self.signal_values.len() > 0 {
            let prev_signal = if let Some(s) = self.signal_values.get_from_end(2) {
                s
            } else {
                self.signal_ema
            };
            let new_signal = (macd - prev_signal) * self.signal_mult + prev_signal;
            self.signal_values.update_last(new_signal);
            self.histogram_values.update_last(macd - new_signal);
        }
    }

    fn value(&self) -> Option<f64> {
        self.macd_line()
    }

    fn result(&self) -> Option<IndicatorValue> {
        if let (Some(macd), Some(signal), Some(hist)) =
            (self.macd_line(), self.signal_line(), self.histogram())
        {
            Some(IndicatorValue::with_extra(
                macd,
                self.last_timestamp,
                vec![signal, hist],
            ))
        } else {
            None
        }
    }

    fn is_ready(&self) -> bool {
        self.signal_values.len() > 0
    }

    fn get(&self, index: usize) -> Option<f64> {
        self.macd_values.get(index)
    }

    fn get_from_end(&self, n: usize) -> Option<f64> {
        self.macd_values.get_from_end(n)
    }

    fn len(&self) -> usize {
        self.macd_values.len()
    }

    fn reset(&mut self) {
        self.fast_ema = 0.0;
        self.slow_ema = 0.0;
        self.signal_ema = 0.0;
        self.macd_values.clear();
        self.signal_values.clear();
        self.histogram_values.clear();
        self.count = 0;
        self.last_timestamp = 0;
        self.price_sum = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_bars(prices: &[f64]) -> Vec<Bar> {
        prices
            .iter()
            .enumerate()
            .map(|(i, &p)| Bar::new(i as i64 * 1000, p, p + 1.0, p - 1.0, p, 100.0))
            .collect()
    }

    #[test]
    fn test_macd_basic() {
        let mut macd = MACD::new(3, 5, 2);
        // 上涨趋势
        let prices: Vec<f64> = (0..15).map(|i| 100.0 + i as f64).collect();
        let bars = create_bars(&prices);

        for bar in &bars {
            macd.push(bar);
        }

        assert!(macd.is_ready());
        // 上涨趋势中，MACD 应该为正
        assert!(macd.macd_line().unwrap() > 0.0);
    }

    #[test]
    fn test_macd_standard() {
        let mut macd = MACD::standard();
        // 需要足够的数据
        let prices: Vec<f64> = (0..50).map(|i| 100.0 + (i as f64).sin() * 10.0).collect();
        let bars = create_bars(&prices);

        for bar in &bars {
            macd.push(bar);
        }

        assert!(macd.is_ready());
        assert!(macd.signal_line().is_some());
        assert!(macd.histogram().is_some());
    }

    #[test]
    fn test_macd_result() {
        let mut macd = MACD::new(3, 5, 2);
        let prices: Vec<f64> = (0..15).map(|i| 100.0 + i as f64).collect();
        let bars = create_bars(&prices);

        for bar in &bars {
            macd.push(bar);
        }

        let result = macd.result().unwrap();
        assert!(result.extra.is_some());
        let extra = result.extra.unwrap();
        assert_eq!(extra.len(), 2); // signal, histogram
    }

    #[test]
    fn test_macd_not_ready() {
        let mut macd = MACD::standard();
        let bars = create_bars(&[100.0, 101.0, 102.0]);

        for bar in &bars {
            macd.push(bar);
        }

        assert!(!macd.is_ready());
    }
}
