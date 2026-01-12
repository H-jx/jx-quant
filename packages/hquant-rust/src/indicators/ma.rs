/// 移动平均线指标 (MA)
/// 支持 SMA, EMA, WMA

use crate::common::F64RingBuffer;
use crate::kline::Bar;
use super::{Indicator, IndicatorValue, PriceType};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MAType {
    /// 简单移动平均
    SMA,
    /// 指数移动平均
    EMA,
    /// 加权移动平均
    WMA,
}

#[derive(Debug)]
pub struct MA {
    name: String,
    period: usize,
    ma_type: MAType,
    price_type: PriceType,
    values: F64RingBuffer,
    // EMA 专用
    ema_value: f64,
    ema_multiplier: f64,
    // WMA 专用
    wma_divisor: f64,
    // 输入数据缓存
    input_buffer: F64RingBuffer,
    count: usize,
    last_timestamp: i64,
}

impl MA {
    pub fn new(period: usize, ma_type: MAType) -> Self {
        Self::with_price_type(period, ma_type, PriceType::Close)
    }

    pub fn with_price_type(period: usize, ma_type: MAType, price_type: PriceType) -> Self {
        let ema_multiplier = 2.0 / (period as f64 + 1.0);
        let wma_divisor = (period * (period + 1) / 2) as f64;

        Self {
            name: format!("{}_{}", match ma_type {
                MAType::SMA => "SMA",
                MAType::EMA => "EMA",
                MAType::WMA => "WMA",
            }, period),
            period,
            ma_type,
            price_type,
            values: F64RingBuffer::new(period * 2),
            ema_value: 0.0,
            ema_multiplier,
            wma_divisor,
            input_buffer: F64RingBuffer::new(period),
            count: 0,
            last_timestamp: 0,
        }
    }

    pub fn sma(period: usize) -> Self {
        Self::new(period, MAType::SMA)
    }

    pub fn ema(period: usize) -> Self {
        Self::new(period, MAType::EMA)
    }

    pub fn wma(period: usize) -> Self {
        Self::new(period, MAType::WMA)
    }

    fn calculate_sma(&self) -> f64 {
        self.input_buffer.mean()
    }

    fn calculate_wma(&self) -> f64 {
        let mut sum = 0.0;
        let len = self.input_buffer.len();
        for i in 0..len {
            if let Some(v) = self.input_buffer.get(i) {
                sum += v * (i + 1) as f64;
            }
        }
        sum / self.wma_divisor
    }

    fn compute(&mut self, price: f64) -> f64 {
        match self.ma_type {
            MAType::SMA => self.calculate_sma(),
            MAType::EMA => {
                if self.count == self.period {
                    // 第一个 EMA 值使用 SMA
                    self.ema_value = self.calculate_sma();
                } else if self.count > self.period {
                    self.ema_value = (price - self.ema_value) * self.ema_multiplier + self.ema_value;
                }
                self.ema_value
            }
            MAType::WMA => self.calculate_wma(),
        }
    }
}

impl Indicator for MA {
    fn name(&self) -> &str {
        &self.name
    }

    fn min_periods(&self) -> usize {
        self.period
    }

    fn push(&mut self, bar: &Bar) {
        let price = self.price_type.extract(bar);
        self.input_buffer.push(price);
        self.count += 1;
        self.last_timestamp = bar.timestamp;

        if self.count >= self.period {
            let ma_value = self.compute(price);
            self.values.push(ma_value);
        }
    }

    fn update_last(&mut self, bar: &Bar) {
        let price = self.price_type.extract(bar);
        self.input_buffer.update_last(price);
        self.last_timestamp = bar.timestamp;

        if self.count >= self.period {
            // 对于 EMA，需要重新计算
            let ma_value = match self.ma_type {
                MAType::SMA => self.calculate_sma(),
                MAType::EMA => {
                    // 使用前一个 EMA 值重新计算
                    if let Some(prev_ema) = self.values.get_from_end(2) {
                        (price - prev_ema) * self.ema_multiplier + prev_ema
                    } else {
                        self.calculate_sma()
                    }
                }
                MAType::WMA => self.calculate_wma(),
            };
            self.values.update_last(ma_value);
        }
    }

    fn value(&self) -> Option<f64> {
        self.values.last()
    }

    fn result(&self) -> Option<IndicatorValue> {
        self.value().map(|v| IndicatorValue::new(v, self.last_timestamp))
    }

    fn is_ready(&self) -> bool {
        self.count >= self.period
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
        self.values.clear();
        self.input_buffer.clear();
        self.ema_value = 0.0;
        self.count = 0;
        self.last_timestamp = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_bars(prices: &[f64]) -> Vec<Bar> {
        prices.iter().enumerate().map(|(i, &p)| {
            Bar::new(i as i64 * 1000, p, p + 1.0, p - 1.0, p, 100.0)
        }).collect()
    }

    #[test]
    fn test_sma() {
        let mut ma = MA::sma(3);
        let bars = create_bars(&[1.0, 2.0, 3.0, 4.0, 5.0]);

        for bar in &bars {
            ma.push(bar);
        }

        assert!(ma.is_ready());
        // SMA(3) of [3, 4, 5] = 4.0
        assert!((ma.value().unwrap() - 4.0).abs() < 1e-10);
    }

    #[test]
    fn test_ema() {
        let mut ma = MA::ema(3);
        let bars = create_bars(&[1.0, 2.0, 3.0, 4.0, 5.0]);

        for bar in &bars {
            ma.push(bar);
        }

        assert!(ma.is_ready());
        // 第一个 EMA = SMA(3) = 2.0
        // multiplier = 2/(3+1) = 0.5
        // EMA[3] = (4 - 2) * 0.5 + 2 = 3.0
        // EMA[4] = (5 - 3) * 0.5 + 3 = 4.0
        assert!((ma.value().unwrap() - 4.0).abs() < 1e-10);
    }

    #[test]
    fn test_wma() {
        let mut ma = MA::wma(3);
        let bars = create_bars(&[1.0, 2.0, 3.0]);

        for bar in &bars {
            ma.push(bar);
        }

        // WMA(3) = (1*1 + 2*2 + 3*3) / (1+2+3) = 14/6 ≈ 2.333
        assert!((ma.value().unwrap() - 14.0 / 6.0).abs() < 1e-10);
    }

    #[test]
    fn test_ma_update_last() {
        let mut ma = MA::sma(3);
        let bars = create_bars(&[1.0, 2.0, 3.0]);

        for bar in &bars {
            ma.push(bar);
        }

        // SMA = 2.0
        assert!((ma.value().unwrap() - 2.0).abs() < 1e-10);

        // 更新最后一根
        let updated = Bar::new(2000, 6.0, 7.0, 5.0, 6.0, 100.0);
        ma.update_last(&updated);

        // SMA = (1 + 2 + 6) / 3 = 3.0
        assert!((ma.value().unwrap() - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_ma_not_ready() {
        let mut ma = MA::sma(5);
        let bars = create_bars(&[1.0, 2.0, 3.0]);

        for bar in &bars {
            ma.push(bar);
        }

        assert!(!ma.is_ready());
        assert!(ma.value().is_none());
    }
}
