//! ATR (平均真实波幅)
//!
//! True Range = max(high-low, |high-prev_close|, |low-prev_close|)
//! ATR = EMA(TR, period)

use crate::Kline;
use crate::common::RingBuffer;
use super::Indicator;

/// ATR 指标
#[derive(Debug)]
pub struct ATR {
    period: usize,
    prev_close: Option<f64>,
    atr: f64,
    count: usize,
    result: RingBuffer,
}

impl ATR {
    /// 创建 ATR 指标
    ///
    /// - period: 周期 (通常 14)
    /// - max_history: 结果历史长度
    pub fn new(period: usize, max_history: usize) -> Self {
        Self {
            period,
            prev_close: None,
            atr: 0.0,
            count: 0,
            result: RingBuffer::new(max_history),
        }
    }

    /// 计算 True Range
    fn true_range(&self, high: f64, low: f64, prev_close: f64) -> f64 {
        let hl = high - low;
        let hc = (high - prev_close).abs();
        let lc = (low - prev_close).abs();
        hl.max(hc).max(lc)
    }

    /// 添加 K线
    pub fn add_kline(&mut self, high: f64, low: f64, close: f64) -> f64 {
        let tr = match self.prev_close {
            None => high - low,
            Some(pc) => self.true_range(high, low, pc),
        };

        self.count += 1;

        if self.count == 1 {
            self.atr = tr;
        } else {
            // Wilder's smoothing (等效于 EMA with alpha = 1/period)
            self.atr = (self.atr * (self.period - 1) as f64 + tr) / self.period as f64;
        }

        self.prev_close = Some(close);

        let value = if self.count >= self.period {
            self.atr
        } else {
            f64::NAN
        };

        self.result.push(value);
        value
    }

    /// 更新最后一个 K线
    pub fn update_last_kline(&mut self, high: f64, low: f64, close: f64) -> f64 {
        // 简化: 重新计算 (ATR 对单次更新不太敏感)
        let tr = match self.prev_close {
            None => high - low,
            Some(pc) => self.true_range(high, low, pc),
        };

        let new_atr = (self.atr * (self.period - 1) as f64 + tr) / self.period as f64;

        let value = if self.count >= self.period {
            new_atr
        } else {
            f64::NAN
        };

        self.result.update_last(value);
        value
    }
}

impl Indicator for ATR {
    fn add(&mut self, kline: &Kline) {
        self.add_kline(kline.high, kline.low, kline.close);
    }

    fn update_last(&mut self, kline: &Kline) {
        self.update_last_kline(kline.high, kline.low, kline.close);
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
    fn test_atr_calculation() {
        let mut atr = ATR::new(5, 100);

        // 模拟 K 线数据
        let klines = vec![
            (102.0, 98.0, 100.0),   // TR = 4
            (103.0, 99.0, 101.0),   // TR = 4
            (105.0, 100.0, 104.0),  // TR = 5
            (106.0, 102.0, 103.0),  // TR = 4
            (104.0, 100.0, 101.0),  // TR = 4
        ];

        for (h, l, c) in klines {
            atr.add_kline(h, l, c);
        }

        let value = atr.get_value(-1);
        assert!(!value.is_nan());
        assert!(value > 0.0);
    }

    #[test]
    fn test_atr_volatility() {
        let mut atr_low = ATR::new(5, 100);
        let mut atr_high = ATR::new(5, 100);

        // 低波动
        for i in 0..10 {
            let base = 100.0 + i as f64 * 0.1;
            atr_low.add_kline(base + 0.5, base - 0.5, base);
        }

        // 高波动
        for i in 0..10 {
            let base = 100.0 + i as f64 * 0.1;
            atr_high.add_kline(base + 5.0, base - 5.0, base);
        }

        assert!(atr_high.get_value(-1) > atr_low.get_value(-1));
    }
}
