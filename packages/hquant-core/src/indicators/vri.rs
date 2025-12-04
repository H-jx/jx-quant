//! VRI (成交量比率指标)
//!
//! VRI = 当前成交量 / 过去 N 期平均成交量

use crate::Kline;
use crate::common::RingBuffer;
use super::Indicator;

/// VRI 指标
#[derive(Debug)]
pub struct VRI {
    period: usize,
    volumes: RingBuffer,
    result: RingBuffer,
}

impl VRI {
    /// 创建 VRI 指标
    ///
    /// - period: 周期
    /// - max_history: 结果历史长度
    pub fn new(period: usize, max_history: usize) -> Self {
        Self {
            period,
            volumes: RingBuffer::new(period),
            result: RingBuffer::new(max_history),
        }
    }

    /// 添加成交量
    pub fn add_volume(&mut self, volume: f64) -> f64 {
        self.volumes.push(volume);

        let vri = if self.volumes.len() >= self.period {
            // 计算平均 (不含最新)
            let sum = self.volumes.sum() - volume;
            let avg = sum / (self.volumes.len() - 1) as f64;
            if avg > 0.0 {
                volume / avg
            } else {
                f64::NAN
            }
        } else if self.volumes.len() > 1 {
            // 数据不足，使用已有数据的平均
            let sum = self.volumes.sum() - volume;
            let avg = sum / (self.volumes.len() - 1) as f64;
            if avg > 0.0 {
                volume / avg
            } else {
                f64::NAN
            }
        } else {
            f64::NAN
        };

        self.result.push(vri);
        vri
    }

    /// 更新最后一个成交量
    pub fn update_last_volume(&mut self, volume: f64) -> f64 {
        self.volumes.update_last(volume);

        let vri = if self.volumes.len() > 1 {
            let sum = self.volumes.sum() - volume;
            let avg = sum / (self.volumes.len() - 1) as f64;
            if avg > 0.0 {
                volume / avg
            } else {
                f64::NAN
            }
        } else {
            f64::NAN
        };

        self.result.update_last(vri);
        vri
    }
}

impl Indicator for VRI {
    fn add(&mut self, kline: &Kline) {
        self.add_volume(kline.volume);
    }

    fn update_last(&mut self, kline: &Kline) {
        self.update_last_volume(kline.volume);
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
    fn test_vri_calculation() {
        let mut vri = VRI::new(5, 100);

        // 添加数据
        vri.add_volume(1000.0);
        vri.add_volume(1000.0);
        vri.add_volume(1000.0);
        vri.add_volume(1000.0);
        vri.add_volume(2000.0); // 双倍成交量

        let value = vri.get_value(-1);
        // VRI = 2000 / 1000 = 2.0
        assert!((value - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_vri_low_volume() {
        let mut vri = VRI::new(5, 100);

        vri.add_volume(1000.0);
        vri.add_volume(1000.0);
        vri.add_volume(1000.0);
        vri.add_volume(1000.0);
        vri.add_volume(500.0); // 一半成交量

        let value = vri.get_value(-1);
        // VRI = 500 / 1000 = 0.5
        assert!((value - 0.5).abs() < 0.01);
    }
}
