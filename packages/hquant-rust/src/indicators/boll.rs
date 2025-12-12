//! 布林带指标
//!
//! 优化: 使用 Welford 算法实现 O(1) 增量标准差计算

use crate::Kline;
use crate::common::RingBuffer;
use super::{Indicator, BollResult, MA, ma::KlineField};

/// 布林带指标
#[derive(Debug)]
pub struct BOLL {
    ma: MA,
    values: RingBuffer,      // 价格窗口
    std_factor: f64,         // 标准差倍数 (通常为 2)
    period: usize,

    // Welford 增量计算状态
    mean: f64,
    m2: f64,                 // 平方和
    count: usize,

    // 结果存储
    result_up: RingBuffer,
    result_mid: RingBuffer,
    result_low: RingBuffer,
}

impl BOLL {
    /// 创建布林带指标
    ///
    /// - period: 周期 (通常 20)
    /// - std_factor: 标准差倍数 (通常 2)
    /// - max_history: 结果历史长度
    pub fn new(period: usize, std_factor: f64, max_history: usize) -> Self {
        Self {
            ma: MA::new(period, max_history, KlineField::Close),
            values: RingBuffer::new(period),
            std_factor,
            period,
            mean: 0.0,
            m2: 0.0,
            count: 0,
            result_up: RingBuffer::new(max_history),
            result_mid: RingBuffer::new(max_history),
            result_low: RingBuffer::new(max_history),
        }
    }

    /// Welford 算法: 添加值
    fn welford_add(&mut self, x: f64) {
        self.count += 1;
        let delta = x - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = x - self.mean;
        self.m2 += delta * delta2;
    }

    /// Welford 算法: 移除值 (滑动窗口)
    fn welford_remove(&mut self, x: f64) {
        if self.count <= 1 {
            self.mean = 0.0;
            self.m2 = 0.0;
            self.count = 0;
            return;
        }

        let delta = x - self.mean;
        self.mean = (self.mean * self.count as f64 - x) / (self.count - 1) as f64;
        let delta2 = x - self.mean;
        self.m2 -= delta * delta2;
        self.count -= 1;

        // 防止浮点误差导致负数
        if self.m2 < 0.0 {
            self.m2 = 0.0;
        }
    }

    /// 计算标准差
    fn std_dev(&self) -> f64 {
        if self.count < 2 {
            return f64::NAN;
        }
        (self.m2 / self.count as f64).sqrt()
    }

    /// 添加数值并返回结果
    pub fn add_value(&mut self, close: f64) -> BollResult {
        // 更新 MA
        let ma_value = self.ma.add_value(close);

        // 滑动窗口: 移除最老值
        if self.values.is_full() {
            let old = self.values.first();
            self.welford_remove(old);
        }

        // 添加新值
        self.welford_add(close);
        self.values.push(close);

        // 计算布林带
        let result = if self.values.len() >= self.period {
            let std = self.std_dev();
            BollResult {
                up: ma_value + self.std_factor * std,
                mid: ma_value,
                low: ma_value - self.std_factor * std,
            }
        } else {
            BollResult {
                up: f64::NAN,
                mid: f64::NAN,
                low: f64::NAN,
            }
        };

        self.result_up.push(result.up);
        self.result_mid.push(result.mid);
        self.result_low.push(result.low);

        result
    }

    /// 更新最后一个值
    pub fn update_last_value(&mut self, close: f64) -> BollResult {
        if self.values.is_empty() {
            return BollResult::default();
        }

        // 移除旧的最后一个值的 Welford 贡献
        let old_last = self.values.last();
        self.welford_remove(old_last);

        // 添加新值的 Welford 贡献
        self.welford_add(close);
        self.values.update_last(close);

        // 更新 MA
        let ma_value = self.ma.update_last_value(close);

        // 计算布林带
        let result = if self.values.len() >= self.period {
            let std = self.std_dev();
            BollResult {
                up: ma_value + self.std_factor * std,
                mid: ma_value,
                low: ma_value - self.std_factor * std,
            }
        } else {
            BollResult {
                up: f64::NAN,
                mid: f64::NAN,
                low: f64::NAN,
            }
        };

        self.result_up.update_last(result.up);
        self.result_mid.update_last(result.mid);
        self.result_low.update_last(result.low);

        result
    }

    /// 获取布林带结果
    pub fn get_boll(&self, index: i32) -> BollResult {
        BollResult {
            up: self.result_up.get(index),
            mid: self.result_mid.get(index),
            low: self.result_low.get(index),
        }
    }
}

impl Indicator for BOLL {
    fn add(&mut self, kline: &Kline) {
        self.add_value(kline.close);
    }

    fn update_last(&mut self, kline: &Kline) {
        self.update_last_value(kline.close);
    }

    fn get_value(&self, index: i32) -> f64 {
        // 返回中轨
        self.result_mid.get(index)
    }

    fn len(&self) -> usize {
        self.result_mid.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_boll_calculation() {
        let mut boll = BOLL::new(3, 2.0, 100);

        boll.add_value(100.0);
        boll.add_value(102.0);
        boll.add_value(101.0);

        let result = boll.get_boll(-1);
        // MA = (100+102+101)/3 = 101
        assert!((result.mid - 101.0).abs() < 0.01);
        // StdDev ≈ 0.816
        assert!(result.up > result.mid);
        assert!(result.low < result.mid);
    }

    #[test]
    fn test_boll_sliding_window() {
        let mut boll = BOLL::new(3, 2.0, 100);

        boll.add_value(100.0);
        boll.add_value(102.0);
        boll.add_value(101.0);
        boll.add_value(103.0); // 窗口: 102, 101, 103

        let result = boll.get_boll(-1);
        // MA = (102+101+103)/3 = 102
        assert!((result.mid - 102.0).abs() < 0.01);
    }

    #[test]
    fn test_welford_accuracy() {
        // 测试 Welford 算法的准确性
        let mut boll = BOLL::new(5, 2.0, 100);
        let values = vec![10.0, 20.0, 30.0, 40.0, 50.0];

        for v in &values {
            boll.add_value(*v);
        }

        // 手动计算标准差
        let mean = 30.0;
        let variance: f64 = values.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / 5.0;
        let expected_std = variance.sqrt();

        let result = boll.get_boll(-1);
        let actual_std = (result.up - result.mid) / 2.0;

        assert!((actual_std - expected_std).abs() < 0.01);
    }
}
