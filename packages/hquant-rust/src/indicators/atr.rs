/// 平均真实波幅 (ATR - Average True Range)
/// TR = max(high - low, |high - prev_close|, |low - prev_close|)
/// ATR = EMA(TR, period) 或 SMA(TR, period)

use crate::common::F64RingBuffer;
use crate::kline::Bar;
use super::{Indicator, IndicatorValue};

#[derive(Debug)]
pub struct ATR {
    name: String,
    period: usize,
    values: F64RingBuffer,
    tr_values: F64RingBuffer,
    atr_value: f64,
    prev_close: f64,
    count: usize,
    last_timestamp: i64,
}

impl ATR {
    pub fn new(period: usize) -> Self {
        Self {
            name: format!("ATR_{}", period),
            period,
            values: F64RingBuffer::new(period * 2),
            tr_values: F64RingBuffer::new(period),
            atr_value: 0.0,
            prev_close: 0.0,
            count: 0,
            last_timestamp: 0,
        }
    }

    fn calculate_tr(&self, bar: &Bar, prev_close: f64) -> f64 {
        let hl = bar.high - bar.low;
        let hc = (bar.high - prev_close).abs();
        let lc = (bar.low - prev_close).abs();
        hl.max(hc).max(lc)
    }
}

impl Indicator for ATR {
    fn name(&self) -> &str {
        &self.name
    }

    fn min_periods(&self) -> usize {
        self.period
    }

    fn push(&mut self, bar: &Bar) {
        self.count += 1;
        self.last_timestamp = bar.timestamp;

        if self.count == 1 {
            // 第一根K线，TR = high - low
            let tr = bar.high - bar.low;
            self.tr_values.push(tr);
            self.prev_close = bar.close;
            return;
        }

        let tr = self.calculate_tr(bar, self.prev_close);
        self.tr_values.push(tr);
        self.prev_close = bar.close;

        if self.count < self.period {
            return;
        }

        if self.count == self.period {
            // 第一个 ATR 使用 SMA
            self.atr_value = self.tr_values.mean();
        } else {
            // 使用 Wilder 平滑法
            self.atr_value = (self.atr_value * (self.period - 1) as f64 + tr) / self.period as f64;
        }

        self.values.push(self.atr_value);
    }

    fn update_last(&mut self, bar: &Bar) {
        self.last_timestamp = bar.timestamp;

        if self.count < 2 {
            let tr = bar.high - bar.low;
            self.tr_values.update_last(tr);
            return;
        }

        // 使用前一根K线的收盘价
        let prev_close = self.prev_close;

        let tr = self.calculate_tr(bar, prev_close);
        self.tr_values.update_last(tr);

        if self.count >= self.period {
            let new_atr = if self.count == self.period {
                self.tr_values.mean()
            } else {
                // 使用前一个 ATR 值
                let prev_atr = self.values.get_from_end(2).unwrap_or(self.atr_value);
                (prev_atr * (self.period - 1) as f64 + tr) / self.period as f64
            };
            self.values.update_last(new_atr);
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
        self.tr_values.clear();
        self.atr_value = 0.0;
        self.prev_close = 0.0;
        self.count = 0;
        self.last_timestamp = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atr_basic() {
        let mut atr = ATR::new(14);

        // 创建测试数据
        for i in 0..20 {
            let bar = Bar::new(
                i * 1000,
                100.0 + i as f64,
                105.0 + i as f64,
                98.0 + i as f64,
                102.0 + i as f64,
                1000.0,
            );
            atr.push(&bar);
        }

        assert!(atr.is_ready());
        assert!(atr.value().unwrap() > 0.0);
    }

    #[test]
    fn test_atr_volatility() {
        let mut atr_low = ATR::new(5);
        let mut atr_high = ATR::new(5);

        // 低波动
        for i in 0..10 {
            let bar = Bar::new(i * 1000, 100.0, 101.0, 99.0, 100.0, 1000.0);
            atr_low.push(&bar);
        }

        // 高波动
        for i in 0..10 {
            let bar = Bar::new(i * 1000, 100.0, 110.0, 90.0, 100.0, 1000.0);
            atr_high.push(&bar);
        }

        assert!(atr_high.value().unwrap() > atr_low.value().unwrap());
    }

    #[test]
    fn test_atr_not_ready() {
        let mut atr = ATR::new(14);

        for i in 0..5 {
            let bar = Bar::new(i * 1000, 100.0, 105.0, 98.0, 102.0, 1000.0);
            atr.push(&bar);
        }

        assert!(!atr.is_ready());
    }
}
