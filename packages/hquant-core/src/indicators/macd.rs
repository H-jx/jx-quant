//! MACD (移动平均收敛散度)
//!
//! MACD = EMA(short) - EMA(long)
//! Signal = EMA(MACD, signal_period)
//! Histogram = MACD - Signal

use crate::Kline;
use crate::common::RingBuffer;
use super::{Indicator, MacdResult};

/// EMA (指数移动平均)
#[derive(Debug)]
struct EMA {
    period: usize,
    alpha: f64,
    value: f64,
    count: usize,
}

impl EMA {
    fn new(period: usize) -> Self {
        Self {
            period,
            alpha: 2.0 / (period as f64 + 1.0),
            value: 0.0,
            count: 0,
        }
    }

    fn add(&mut self, value: f64) -> f64 {
        self.count += 1;
        if self.count == 1 {
            self.value = value;
        } else {
            self.value = self.alpha * value + (1.0 - self.alpha) * self.value;
        }
        self.value
    }

    fn update_last(&mut self, value: f64) -> f64 {
        // 近似更新
        self.value = self.alpha * value + (1.0 - self.alpha) * self.value;
        self.value
    }

    fn get(&self) -> f64 {
        if self.count == 0 {
            f64::NAN
        } else {
            self.value
        }
    }
}

/// MACD 指标
#[derive(Debug)]
pub struct MACD {
    short_ema: EMA,
    long_ema: EMA,
    signal_ema: EMA,
    short_period: usize,
    long_period: usize,
    signal_period: usize,

    result_macd: RingBuffer,
    result_signal: RingBuffer,
    result_histogram: RingBuffer,
}

impl MACD {
    /// 创建 MACD 指标
    ///
    /// - short_period: 短期 EMA 周期 (通常 12)
    /// - long_period: 长期 EMA 周期 (通常 26)
    /// - signal_period: 信号线周期 (通常 9)
    /// - max_history: 结果历史长度
    pub fn new(short_period: usize, long_period: usize, signal_period: usize, max_history: usize) -> Self {
        Self {
            short_ema: EMA::new(short_period),
            long_ema: EMA::new(long_period),
            signal_ema: EMA::new(signal_period),
            short_period,
            long_period,
            signal_period,
            result_macd: RingBuffer::new(max_history),
            result_signal: RingBuffer::new(max_history),
            result_histogram: RingBuffer::new(max_history),
        }
    }

    /// 默认参数 (12, 26, 9)
    pub fn default_params(max_history: usize) -> Self {
        Self::new(12, 26, 9, max_history)
    }

    /// 添加数值
    pub fn add_value(&mut self, close: f64) -> MacdResult {
        let short = self.short_ema.add(close);
        let long = self.long_ema.add(close);

        let macd = short - long;
        let signal = self.signal_ema.add(macd);
        let histogram = macd - signal;

        let result = if self.long_ema.count >= self.long_period {
            MacdResult { macd, signal, histogram }
        } else {
            MacdResult {
                macd: f64::NAN,
                signal: f64::NAN,
                histogram: f64::NAN,
            }
        };

        self.result_macd.push(result.macd);
        self.result_signal.push(result.signal);
        self.result_histogram.push(result.histogram);

        result
    }

    /// 更新最后一个值
    pub fn update_last_value(&mut self, close: f64) -> MacdResult {
        let short = self.short_ema.update_last(close);
        let long = self.long_ema.update_last(close);

        let macd = short - long;
        let signal = self.signal_ema.update_last(macd);
        let histogram = macd - signal;

        let result = if self.long_ema.count >= self.long_period {
            MacdResult { macd, signal, histogram }
        } else {
            MacdResult {
                macd: f64::NAN,
                signal: f64::NAN,
                histogram: f64::NAN,
            }
        };

        self.result_macd.update_last(result.macd);
        self.result_signal.update_last(result.signal);
        self.result_histogram.update_last(result.histogram);

        result
    }

    /// 获取 MACD 结果
    pub fn get_macd(&self, index: i32) -> MacdResult {
        MacdResult {
            macd: self.result_macd.get(index),
            signal: self.result_signal.get(index),
            histogram: self.result_histogram.get(index),
        }
    }
}

impl Indicator for MACD {
    fn add(&mut self, kline: &Kline) {
        self.add_value(kline.close);
    }

    fn update_last(&mut self, kline: &Kline) {
        self.update_last_value(kline.close);
    }

    fn get_value(&self, index: i32) -> f64 {
        // 返回 MACD 线
        self.result_macd.get(index)
    }

    fn len(&self) -> usize {
        self.result_macd.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_macd_calculation() {
        let mut macd = MACD::default_params(100);

        // 添加足够数据
        for i in 0..30 {
            macd.add_value(100.0 + (i as f64 * 0.5));
        }

        let result = macd.get_macd(-1);
        // 上涨趋势，MACD 应该为正
        assert!(result.macd > 0.0);
    }

    #[test]
    fn test_macd_crossover() {
        let mut macd = MACD::new(3, 6, 3, 100);

        // 先下跌后上涨，观察金叉
        let prices = vec![
            100.0, 98.0, 96.0, 94.0, 92.0, 90.0,  // 下跌
            92.0, 94.0, 96.0, 98.0, 100.0, 102.0, // 上涨
        ];

        for p in prices {
            macd.add_value(p);
        }

        // 上涨后 histogram 应该转正
        let result = macd.get_macd(-1);
        println!("MACD: {}, Signal: {}, Hist: {}", result.macd, result.signal, result.histogram);
    }
}
