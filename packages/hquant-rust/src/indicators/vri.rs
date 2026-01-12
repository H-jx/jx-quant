/// 成交量相对强度指标 (VRI - Volume Relative Index)
/// 类似 RSI，但使用成交量变化而非价格变化
/// VRI = 100 - 100 / (1 + VRS)
/// VRS = 平均成交量增加 / 平均成交量减少

use crate::common::F64RingBuffer;
use crate::kline::Bar;
use super::{Indicator, IndicatorValue};

#[derive(Debug)]
pub struct VRI {
    name: String,
    period: usize,
    values: F64RingBuffer,
    avg_up: f64,
    avg_down: f64,
    prev_volume: f64,
    count: usize,
    last_timestamp: i64,
    // 初始化用
    ups: Vec<f64>,
    downs: Vec<f64>,
}

impl VRI {
    pub fn new(period: usize) -> Self {
        Self {
            name: format!("VRI_{}", period),
            period,
            values: F64RingBuffer::new(period * 2),
            avg_up: 0.0,
            avg_down: 0.0,
            prev_volume: 0.0,
            count: 0,
            last_timestamp: 0,
            ups: Vec::with_capacity(period),
            downs: Vec::with_capacity(period),
        }
    }

    fn calculate_vri(&self) -> f64 {
        if self.avg_down == 0.0 {
            if self.avg_up == 0.0 {
                return 50.0;
            }
            return 100.0;
        }
        let vrs = self.avg_up / self.avg_down;
        100.0 - 100.0 / (1.0 + vrs)
    }
}

impl Indicator for VRI {
    fn name(&self) -> &str {
        &self.name
    }

    fn min_periods(&self) -> usize {
        self.period + 1
    }

    fn push(&mut self, bar: &Bar) {
        self.count += 1;
        self.last_timestamp = bar.timestamp;

        if self.count == 1 {
            self.prev_volume = bar.volume;
            return;
        }

        let change = bar.volume - self.prev_volume;
        let up = change.max(0.0);
        let down = (-change).max(0.0);

        if self.count <= self.period + 1 {
            self.ups.push(up);
            self.downs.push(down);

            if self.count == self.period + 1 {
                self.avg_up = self.ups.iter().sum::<f64>() / self.period as f64;
                self.avg_down = self.downs.iter().sum::<f64>() / self.period as f64;
                let vri = self.calculate_vri();
                self.values.push(vri);
            }
        } else {
            // Wilder 平滑法
            self.avg_up = (self.avg_up * (self.period - 1) as f64 + up) / self.period as f64;
            self.avg_down = (self.avg_down * (self.period - 1) as f64 + down) / self.period as f64;
            let vri = self.calculate_vri();
            self.values.push(vri);
        }

        self.prev_volume = bar.volume;
    }

    fn update_last(&mut self, bar: &Bar) {
        self.last_timestamp = bar.timestamp;

        if self.count < 2 {
            self.prev_volume = bar.volume;
            return;
        }

        // 简化处理：更新最后的 VRI
        if self.count > self.period {
            let change = bar.volume - self.prev_volume;
            let up = change.max(0.0);
            let down = (-change).max(0.0);

            // 近似重新计算
            let temp_avg_up = (self.avg_up * (self.period - 1) as f64 + up) / self.period as f64;
            let temp_avg_down = (self.avg_down * (self.period - 1) as f64 + down) / self.period as f64;

            let vrs = if temp_avg_down == 0.0 {
                if temp_avg_up == 0.0 { 1.0 } else { f64::MAX }
            } else {
                temp_avg_up / temp_avg_down
            };

            let vri = 100.0 - 100.0 / (1.0 + vrs);
            self.values.update_last(vri);
        }
    }

    fn value(&self) -> Option<f64> {
        self.values.last()
    }

    fn result(&self) -> Option<IndicatorValue> {
        self.value().map(|v| IndicatorValue::new(v, self.last_timestamp))
    }

    fn is_ready(&self) -> bool {
        self.count > self.period
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
        self.avg_up = 0.0;
        self.avg_down = 0.0;
        self.prev_volume = 0.0;
        self.count = 0;
        self.last_timestamp = 0;
        self.ups.clear();
        self.downs.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vri_increasing_volume() {
        let mut vri = VRI::new(14);

        // 成交量持续增加
        for i in 0..20 {
            let bar = Bar::new(i * 1000, 100.0, 105.0, 98.0, 102.0, 1000.0 + i as f64 * 100.0);
            vri.push(&bar);
        }

        assert!(vri.is_ready());
        // 持续增加，VRI 应该高于 50
        assert!(vri.value().unwrap() > 50.0);
    }

    #[test]
    fn test_vri_decreasing_volume() {
        let mut vri = VRI::new(14);

        // 成交量持续减少
        for i in 0..20 {
            let bar = Bar::new(
                i * 1000,
                100.0,
                105.0,
                98.0,
                102.0,
                10000.0 - i as f64 * 100.0,
            );
            vri.push(&bar);
        }

        assert!(vri.is_ready());
        // 持续减少，VRI 应该低于 50
        assert!(vri.value().unwrap() < 50.0);
    }

    #[test]
    fn test_vri_range() {
        let mut vri = VRI::new(14);

        for i in 0..20 {
            let volume = if i % 2 == 0 { 1000.0 + i as f64 * 50.0 } else { 1000.0 - i as f64 * 30.0 };
            let bar = Bar::new(i * 1000, 100.0, 105.0, 98.0, 102.0, volume.max(100.0));
            vri.push(&bar);
        }

        assert!(vri.is_ready());
        let val = vri.value().unwrap();
        assert!(val >= 0.0 && val <= 100.0);
    }

    #[test]
    fn test_vri_not_ready() {
        let mut vri = VRI::new(14);

        for i in 0..5 {
            let bar = Bar::new(i * 1000, 100.0, 105.0, 98.0, 102.0, 1000.0);
            vri.push(&bar);
        }

        assert!(!vri.is_ready());
    }
}
