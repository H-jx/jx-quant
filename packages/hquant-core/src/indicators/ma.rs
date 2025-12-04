//! 移动平均线指标
//!
//! 优化: O(1) 增量计算，使用 running_sum

use crate::Kline;
use crate::common::RingBuffer;
use super::Indicator;

/// 移动平均线
#[derive(Debug)]
pub struct MA {
    buffer: RingBuffer,   // 滑动窗口
    result: RingBuffer,   // 历史结果
    period: usize,
    key: KlineField,
}

/// K线字段选择
#[derive(Debug, Clone, Copy)]
pub enum KlineField {
    Open,
    Close,
    High,
    Low,
    Volume,
}

impl Default for KlineField {
    fn default() -> Self {
        KlineField::Close
    }
}

impl MA {
    /// 创建 MA 指标
    ///
    /// - period: 周期
    /// - max_history: 结果历史长度
    /// - key: 使用哪个字段计算
    pub fn new(period: usize, max_history: usize, key: KlineField) -> Self {
        Self {
            buffer: RingBuffer::new(period),
            result: RingBuffer::new(max_history),
            period,
            key,
        }
    }

    /// 使用 close 价格的 MA
    pub fn with_close(period: usize, max_history: usize) -> Self {
        Self::new(period, max_history, KlineField::Close)
    }

    /// 直接添加数值
    pub fn add_value(&mut self, value: f64) -> f64 {
        self.buffer.push(value);

        let ma = if self.buffer.len() >= self.period {
            // O(1): 使用 running_sum
            self.buffer.sum() / self.period as f64
        } else {
            f64::NAN
        };

        self.result.push(ma);
        ma
    }

    /// 更新最后一个值
    pub fn update_last_value(&mut self, value: f64) -> f64 {
        self.buffer.update_last(value);

        let ma = if self.buffer.len() >= self.period {
            self.buffer.sum() / self.period as f64
        } else {
            f64::NAN
        };

        self.result.update_last(ma);
        ma
    }

    fn extract_value(&self, kline: &Kline) -> f64 {
        match self.key {
            KlineField::Open => kline.open,
            KlineField::Close => kline.close,
            KlineField::High => kline.high,
            KlineField::Low => kline.low,
            KlineField::Volume => kline.volume,
        }
    }

    /// 获取周期
    pub fn period(&self) -> usize {
        self.period
    }
}

impl Indicator for MA {
    fn add(&mut self, kline: &Kline) {
        let value = self.extract_value(kline);
        self.add_value(value);
    }

    fn update_last(&mut self, kline: &Kline) {
        let value = self.extract_value(kline);
        self.update_last_value(value);
    }

    fn get_value(&self, index: i32) -> f64 {
        self.result.get(index)
    }

    fn len(&self) -> usize {
        self.result.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ma_calculation() {
        let mut ma = MA::with_close(3, 100);

        // 添加数据
        ma.add_value(10.0);
        ma.add_value(20.0);
        assert!(ma.get_value(-1).is_nan()); // 不足周期

        ma.add_value(30.0);
        assert_eq!(ma.get_value(-1), 20.0); // (10+20+30)/3

        ma.add_value(40.0);
        assert_eq!(ma.get_value(-1), 30.0); // (20+30+40)/3
    }

    #[test]
    fn test_ma_update_last() {
        let mut ma = MA::with_close(3, 100);

        ma.add_value(10.0);
        ma.add_value(20.0);
        ma.add_value(30.0);
        assert_eq!(ma.get_value(-1), 20.0);

        ma.update_last_value(60.0); // 30 -> 60
        assert_eq!(ma.get_value(-1), 30.0); // (10+20+60)/3
    }
}
