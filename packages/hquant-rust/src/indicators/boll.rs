/// 布林带指标 (Bollinger Bands)
/// Middle = SMA(close, period)
/// Upper = Middle + std_dev_factor * StdDev(close, period)
/// Lower = Middle - std_dev_factor * StdDev(close, period)

use crate::common::F64RingBuffer;
use crate::kline::Bar;
use super::{Indicator, IndicatorValue, PriceType};

#[derive(Debug)]
pub struct BOLL {
    name: String,
    period: usize,
    std_dev_factor: f64,
    price_type: PriceType,
    // 输入缓存
    input_buffer: F64RingBuffer,
    // 输出
    middle_values: F64RingBuffer,
    upper_values: F64RingBuffer,
    lower_values: F64RingBuffer,
    // 状态
    count: usize,
    last_timestamp: i64,
}

impl BOLL {
    pub fn new(period: usize, std_dev_factor: f64) -> Self {
        Self::with_price_type(period, std_dev_factor, PriceType::Close)
    }

    pub fn with_price_type(period: usize, std_dev_factor: f64, price_type: PriceType) -> Self {
        Self {
            name: format!("BOLL_{}", period),
            period,
            std_dev_factor,
            price_type,
            input_buffer: F64RingBuffer::new(period),
            middle_values: F64RingBuffer::new(period * 2),
            upper_values: F64RingBuffer::new(period * 2),
            lower_values: F64RingBuffer::new(period * 2),
            count: 0,
            last_timestamp: 0,
        }
    }

    /// 标准布林带 (20, 2.0)
    pub fn standard() -> Self {
        Self::new(20, 2.0)
    }

    fn calculate(&self) -> (f64, f64, f64) {
        let middle = self.input_buffer.mean();
        let std_dev = self.input_buffer.std_dev();
        let upper = middle + self.std_dev_factor * std_dev;
        let lower = middle - self.std_dev_factor * std_dev;
        (middle, upper, lower)
    }

    /// 获取中轨值
    pub fn middle(&self) -> Option<f64> {
        self.middle_values.last()
    }

    /// 获取上轨值
    pub fn upper(&self) -> Option<f64> {
        self.upper_values.last()
    }

    /// 获取下轨值
    pub fn lower(&self) -> Option<f64> {
        self.lower_values.last()
    }

    /// 获取带宽 (bandwidth = (upper - lower) / middle)
    pub fn bandwidth(&self) -> Option<f64> {
        if let (Some(m), Some(u), Some(l)) = (self.middle(), self.upper(), self.lower()) {
            if m != 0.0 {
                Some((u - l) / m)
            } else {
                None
            }
        } else {
            None
        }
    }

    /// 获取 %B (percent_b = (price - lower) / (upper - lower))
    pub fn percent_b(&self, price: f64) -> Option<f64> {
        if let (Some(u), Some(l)) = (self.upper(), self.lower()) {
            let range = u - l;
            if range != 0.0 {
                Some((price - l) / range)
            } else {
                None
            }
        } else {
            None
        }
    }
}

impl Indicator for BOLL {
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
            let (middle, upper, lower) = self.calculate();
            self.middle_values.push(middle);
            self.upper_values.push(upper);
            self.lower_values.push(lower);
        }
    }

    fn update_last(&mut self, bar: &Bar) {
        let price = self.price_type.extract(bar);
        self.input_buffer.update_last(price);
        self.last_timestamp = bar.timestamp;

        if self.count >= self.period {
            let (middle, upper, lower) = self.calculate();
            self.middle_values.update_last(middle);
            self.upper_values.update_last(upper);
            self.lower_values.update_last(lower);
        }
    }

    fn value(&self) -> Option<f64> {
        self.middle()
    }

    fn result(&self) -> Option<IndicatorValue> {
        if let (Some(m), Some(u), Some(l)) = (self.middle(), self.upper(), self.lower()) {
            Some(IndicatorValue::with_extra(m, self.last_timestamp, vec![u, l]))
        } else {
            None
        }
    }

    fn is_ready(&self) -> bool {
        self.count >= self.period
    }

    fn get(&self, index: usize) -> Option<f64> {
        self.middle_values.get(index)
    }

    fn get_from_end(&self, n: usize) -> Option<f64> {
        self.middle_values.get_from_end(n)
    }

    fn len(&self) -> usize {
        self.middle_values.len()
    }

    fn reset(&mut self) {
        self.input_buffer.clear();
        self.middle_values.clear();
        self.upper_values.clear();
        self.lower_values.clear();
        self.count = 0;
        self.last_timestamp = 0;
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
    fn test_boll_basic() {
        let mut boll = BOLL::new(5, 2.0);
        let prices: Vec<f64> = vec![10.0, 11.0, 12.0, 11.0, 10.0, 11.0, 12.0];
        let bars = create_bars(&prices);

        for bar in &bars {
            boll.push(bar);
        }

        assert!(boll.is_ready());
        assert!(boll.middle().is_some());
        assert!(boll.upper().is_some());
        assert!(boll.lower().is_some());

        // 上轨 > 中轨 > 下轨
        assert!(boll.upper().unwrap() > boll.middle().unwrap());
        assert!(boll.middle().unwrap() > boll.lower().unwrap());
    }

    #[test]
    fn test_boll_constant_price() {
        let mut boll = BOLL::new(5, 2.0);
        // 恒定价格，标准差为0
        let bars = create_bars(&[100.0, 100.0, 100.0, 100.0, 100.0]);

        for bar in &bars {
            boll.push(bar);
        }

        assert!(boll.is_ready());
        // 当标准差为0时，上轨=中轨=下轨
        assert!((boll.upper().unwrap() - boll.middle().unwrap()).abs() < 1e-10);
        assert!((boll.lower().unwrap() - boll.middle().unwrap()).abs() < 1e-10);
    }

    #[test]
    fn test_boll_bandwidth() {
        let mut boll = BOLL::new(5, 2.0);
        let bars = create_bars(&[10.0, 12.0, 8.0, 14.0, 6.0]);

        for bar in &bars {
            boll.push(bar);
        }

        let bandwidth = boll.bandwidth().unwrap();
        assert!(bandwidth > 0.0);
    }

    #[test]
    fn test_boll_percent_b() {
        let mut boll = BOLL::new(5, 2.0);
        let bars = create_bars(&[10.0, 11.0, 12.0, 11.0, 10.0]);

        for bar in &bars {
            boll.push(bar);
        }

        let upper = boll.upper().unwrap();
        let lower = boll.lower().unwrap();
        let middle = boll.middle().unwrap();

        // 价格在下轨时 %B = 0
        assert!((boll.percent_b(lower).unwrap()).abs() < 1e-10);
        // 价格在上轨时 %B = 1
        assert!((boll.percent_b(upper).unwrap() - 1.0).abs() < 1e-10);
        // 价格在中轨时 %B = 0.5
        assert!((boll.percent_b(middle).unwrap() - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_boll_update_last() {
        let mut boll = BOLL::new(5, 2.0);
        let bars = create_bars(&[10.0, 11.0, 12.0, 11.0, 10.0]);

        for bar in &bars {
            boll.push(bar);
        }

        let old_middle = boll.middle().unwrap();

        // 更新最后一根
        let updated = Bar::new(4000, 15.0, 16.0, 14.0, 15.0, 100.0);
        boll.update_last(&updated);

        // 中轨应该上移
        assert!(boll.middle().unwrap() > old_middle);
    }

    #[test]
    fn test_boll_not_ready() {
        let mut boll = BOLL::standard();
        let bars = create_bars(&[100.0, 101.0, 102.0]);

        for bar in &bars {
            boll.push(bar);
        }

        assert!(!boll.is_ready());
    }
}
