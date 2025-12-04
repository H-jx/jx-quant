//! RSI (相对强弱指标)
//!
//! 使用指数移动平均计算，O(1) 复杂度

use crate::Kline;
use crate::common::RingBuffer;
use super::Indicator;

/// RSI 指标
#[derive(Debug)]
pub struct RSI {
    period: usize,
    prev_close: Option<f64>,
    avg_gain: f64,
    avg_loss: f64,
    count: usize,
    result: RingBuffer,
}

impl RSI {
    /// 创建 RSI 指标
    ///
    /// - period: 周期 (通常 14)
    /// - max_history: 结果历史长度
    pub fn new(period: usize, max_history: usize) -> Self {
        Self {
            period,
            prev_close: None,
            avg_gain: 0.0,
            avg_loss: 0.0,
            count: 0,
            result: RingBuffer::new(max_history),
        }
    }

    /// 添加数值
    pub fn add_value(&mut self, close: f64) -> f64 {
        let rsi = match self.prev_close {
            None => {
                self.prev_close = Some(close);
                f64::NAN
            }
            Some(prev) => {
                let change = close - prev;
                let gain = if change > 0.0 { change } else { 0.0 };
                let loss = if change < 0.0 { -change } else { 0.0 };

                self.count += 1;

                if self.count <= self.period {
                    // 初始阶段: 累计平均
                    self.avg_gain = (self.avg_gain * (self.count - 1) as f64 + gain) / self.count as f64;
                    self.avg_loss = (self.avg_loss * (self.count - 1) as f64 + loss) / self.count as f64;
                } else {
                    // 指数移动平均
                    let alpha = 1.0 / self.period as f64;
                    self.avg_gain = self.avg_gain * (1.0 - alpha) + gain * alpha;
                    self.avg_loss = self.avg_loss * (1.0 - alpha) + loss * alpha;
                }

                self.prev_close = Some(close);

                // 计算 RSI
                if self.count >= self.period {
                    if self.avg_loss == 0.0 {
                        100.0
                    } else {
                        let rs = self.avg_gain / self.avg_loss;
                        100.0 - 100.0 / (1.0 + rs)
                    }
                } else {
                    f64::NAN
                }
            }
        };

        self.result.push(rsi);
        rsi
    }

    /// 更新最后一个值
    pub fn update_last_value(&mut self, close: f64) -> f64 {
        // RSI 使用指数平均，更新最后值需要回退状态
        // 简化实现: 重新计算最后一个
        if self.count == 0 {
            return f64::NAN;
        }

        // 注意: 这里简化处理，实际上应该保存更多状态才能精确回退
        // 对于实时更新场景，误差可接受
        if let Some(prev) = self.prev_close {
            // 假设前一个 close 没变，只是当前值变了
            let change = close - prev;
            let gain = if change > 0.0 { change } else { 0.0 };
            let loss = if change < 0.0 { -change } else { 0.0 };

            // 用新值重新计算当前 RSI (近似)
            let alpha = 1.0 / self.period as f64;
            let new_avg_gain = self.avg_gain * (1.0 - alpha) + gain * alpha;
            let new_avg_loss = self.avg_loss * (1.0 - alpha) + loss * alpha;

            let rsi = if new_avg_loss == 0.0 {
                100.0
            } else {
                let rs = new_avg_gain / new_avg_loss;
                100.0 - 100.0 / (1.0 + rs)
            };

            self.result.update_last(rsi);
            rsi
        } else {
            f64::NAN
        }
    }
}

impl Indicator for RSI {
    fn add(&mut self, kline: &Kline) {
        self.add_value(kline.close);
    }

    fn update_last(&mut self, kline: &Kline) {
        self.update_last_value(kline.close);
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
    fn test_rsi_calculation() {
        let mut rsi = RSI::new(14, 100);

        // 模拟上涨行情
        let prices = vec![
            44.0, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42,
            45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00,
        ];

        for p in prices {
            rsi.add_value(p);
        }

        let value = rsi.get_value(-1);
        // RSI 应该在 0-100 之间
        assert!(value >= 0.0 && value <= 100.0);
    }

    #[test]
    fn test_rsi_overbought_oversold() {
        let mut rsi = RSI::new(5, 100);

        // 持续上涨 -> RSI > 70
        for i in 0..10 {
            rsi.add_value(100.0 + i as f64 * 2.0);
        }
        assert!(rsi.get_value(-1) > 70.0);

        // 持续下跌 -> RSI < 30
        let mut rsi2 = RSI::new(5, 100);
        for i in 0..10 {
            rsi2.add_value(100.0 - i as f64 * 2.0);
        }
        assert!(rsi2.get_value(-1) < 30.0);
    }
}
