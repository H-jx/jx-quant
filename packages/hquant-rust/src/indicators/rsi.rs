/// 相对强弱指数 (RSI)
/// RSI = 100 - 100 / (1 + RS)
/// RS = 平均涨幅 / 平均跌幅

use crate::common::F64RingBuffer;
use crate::kline::Bar;
use super::{Indicator, IndicatorValue, PriceType};

#[derive(Debug)]
pub struct RSI {
    name: String,
    period: usize,
    price_type: PriceType,
    values: F64RingBuffer,
    // 使用 Wilder 平滑法
    avg_gain: f64,
    avg_loss: f64,
    prev_price: f64,
    count: usize,
    last_timestamp: i64,
    // 用于初始化阶段
    gains: Vec<f64>,
    losses: Vec<f64>,
}

impl RSI {
    pub fn new(period: usize) -> Self {
        Self::with_price_type(period, PriceType::Close)
    }

    pub fn with_price_type(period: usize, price_type: PriceType) -> Self {
        Self {
            name: format!("RSI_{}", period),
            period,
            price_type,
            values: F64RingBuffer::new(period * 2),
            avg_gain: 0.0,
            avg_loss: 0.0,
            prev_price: 0.0,
            count: 0,
            last_timestamp: 0,
            gains: Vec::with_capacity(period),
            losses: Vec::with_capacity(period),
        }
    }

    fn calculate_rsi(&self) -> f64 {
        if self.avg_loss == 0.0 {
            if self.avg_gain == 0.0 {
                return 50.0; // 无变化
            }
            return 100.0; // 全涨
        }
        let rs = self.avg_gain / self.avg_loss;
        100.0 - 100.0 / (1.0 + rs)
    }
}

impl Indicator for RSI {
    fn name(&self) -> &str {
        &self.name
    }

    fn min_periods(&self) -> usize {
        self.period + 1
    }

    fn push(&mut self, bar: &Bar) {
        let price = self.price_type.extract(bar);
        self.count += 1;
        self.last_timestamp = bar.timestamp;

        if self.count == 1 {
            self.prev_price = price;
            return;
        }

        let change = price - self.prev_price;
        let gain = change.max(0.0);
        let loss = (-change).max(0.0);

        if self.count <= self.period + 1 {
            // 初始化阶段，收集数据
            self.gains.push(gain);
            self.losses.push(loss);

            if self.count == self.period + 1 {
                // 计算第一个平均值
                self.avg_gain = self.gains.iter().sum::<f64>() / self.period as f64;
                self.avg_loss = self.losses.iter().sum::<f64>() / self.period as f64;
                let rsi = self.calculate_rsi();
                self.values.push(rsi);
            }
        } else {
            // 使用 Wilder 平滑法更新
            self.avg_gain = (self.avg_gain * (self.period - 1) as f64 + gain) / self.period as f64;
            self.avg_loss = (self.avg_loss * (self.period - 1) as f64 + loss) / self.period as f64;
            let rsi = self.calculate_rsi();
            self.values.push(rsi);
        }

        self.prev_price = price;
    }

    fn update_last(&mut self, bar: &Bar) {
        let price = self.price_type.extract(bar);
        self.last_timestamp = bar.timestamp;

        if self.count < 2 {
            self.prev_price = price;
            return;
        }

        if self.count <= self.period + 1 {
            // 初始化阶段
            if self.gains.len() > 1 {
                // 回退到上一个状态重新计算
                let last_gain = self.gains.pop().unwrap();
                let last_loss = self.losses.pop().unwrap();

                let change = price - self.prev_price;
                let gain = change.max(0.0);
                let loss = (-change).max(0.0);

                self.gains.push(gain);
                self.losses.push(loss);

                if self.count == self.period + 1 {
                    self.avg_gain = self.gains.iter().sum::<f64>() / self.period as f64;
                    self.avg_loss = self.losses.iter().sum::<f64>() / self.period as f64;
                    let rsi = self.calculate_rsi();
                    self.values.update_last(rsi);
                }
                // 恢复用于下次更新
                self.gains.pop();
                self.gains.push(last_gain);
                self.losses.pop();
                self.losses.push(last_loss);
            }
        } else {
            // 这里简化处理：重新计算当前的变化
            let change = price - self.prev_price;
            let gain = change.max(0.0);
            let loss = (-change).max(0.0);

            // 近似重新计算
            let temp_avg_gain = (self.avg_gain * self.period as f64 - self.avg_gain + gain)
                / self.period as f64;
            let temp_avg_loss = (self.avg_loss * self.period as f64 - self.avg_loss + loss)
                / self.period as f64;

            let rs = if temp_avg_loss == 0.0 {
                if temp_avg_gain == 0.0 {
                    1.0
                } else {
                    f64::MAX
                }
            } else {
                temp_avg_gain / temp_avg_loss
            };

            let rsi = 100.0 - 100.0 / (1.0 + rs);
            self.values.update_last(rsi);
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
        self.avg_gain = 0.0;
        self.avg_loss = 0.0;
        self.prev_price = 0.0;
        self.count = 0;
        self.last_timestamp = 0;
        self.gains.clear();
        self.losses.clear();
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
    fn test_rsi_basic() {
        let mut rsi = RSI::new(14);
        // 创建一个上涨趋势
        let prices: Vec<f64> = (0..20).map(|i| 100.0 + i as f64).collect();
        let bars = create_bars(&prices);

        for bar in &bars {
            rsi.push(bar);
        }

        assert!(rsi.is_ready());
        // 持续上涨，RSI 应该接近 100
        assert!(rsi.value().unwrap() > 90.0);
    }

    #[test]
    fn test_rsi_downtrend() {
        let mut rsi = RSI::new(14);
        // 创建一个下跌趋势
        let prices: Vec<f64> = (0..20).map(|i| 200.0 - i as f64).collect();
        let bars = create_bars(&prices);

        for bar in &bars {
            rsi.push(bar);
        }

        assert!(rsi.is_ready());
        // 持续下跌，RSI 应该接近 0
        assert!(rsi.value().unwrap() < 10.0);
    }

    #[test]
    fn test_rsi_range() {
        let mut rsi = RSI::new(14);
        // 波动行情
        let mut prices = Vec::new();
        for i in 0..30 {
            if i % 2 == 0 {
                prices.push(100.0 + (i as f64));
            } else {
                prices.push(100.0 - (i as f64) * 0.5);
            }
        }
        let bars = create_bars(&prices);

        for bar in &bars {
            rsi.push(bar);
        }

        assert!(rsi.is_ready());
        // RSI 应该在 0-100 之间
        let val = rsi.value().unwrap();
        assert!(val >= 0.0 && val <= 100.0);
    }

    #[test]
    fn test_rsi_not_ready() {
        let mut rsi = RSI::new(14);
        let bars = create_bars(&[100.0, 101.0, 102.0]);

        for bar in &bars {
            rsi.push(bar);
        }

        assert!(!rsi.is_ready());
    }
}
