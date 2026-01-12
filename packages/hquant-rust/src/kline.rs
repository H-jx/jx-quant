/// K线数据结构 - 使用 SoA (Struct of Arrays) 列式存储
/// 优点：
/// 1. 缓存友好 - 连续内存访问
/// 2. SIMD 友好 - 便于向量化计算
/// 3. 内存效率 - 避免结构体填充

use crate::common::RingBuffer;

/// 单根K线数据（用于输入/输出）
#[derive(Debug, Clone, Copy, Default)]
pub struct Bar {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

impl Bar {
    pub fn new(timestamp: i64, open: f64, high: f64, low: f64, close: f64, volume: f64) -> Self {
        Self {
            timestamp,
            open,
            high,
            low,
            close,
            volume,
        }
    }

    /// 合并两根K线（用于周期聚合）
    pub fn merge(&mut self, other: &Bar) {
        self.high = self.high.max(other.high);
        self.low = self.low.min(other.low);
        self.close = other.close;
        self.volume += other.volume;
        // timestamp 和 open 保持不变
    }
}

/// K线序列 - SoA 列式存储
#[derive(Debug, Clone)]
pub struct KlineSeries {
    pub timestamp: RingBuffer<i64>,
    pub open: RingBuffer<f64>,
    pub high: RingBuffer<f64>,
    pub low: RingBuffer<f64>,
    pub close: RingBuffer<f64>,
    pub volume: RingBuffer<f64>,
    capacity: usize,
}

impl KlineSeries {
    /// 创建指定容量的K线序列
    pub fn new(capacity: usize) -> Self {
        Self {
            timestamp: RingBuffer::new(capacity),
            open: RingBuffer::new(capacity),
            high: RingBuffer::new(capacity),
            low: RingBuffer::new(capacity),
            close: RingBuffer::new(capacity),
            volume: RingBuffer::new(capacity),
            capacity,
        }
    }

    /// 追加一根K线
    #[inline]
    pub fn append(&mut self, bar: &Bar) {
        self.timestamp.push(bar.timestamp);
        self.open.push(bar.open);
        self.high.push(bar.high);
        self.low.push(bar.low);
        self.close.push(bar.close);
        self.volume.push(bar.volume);
    }

    /// 更新最后一根K线（用于实时websocket更新）
    #[inline]
    pub fn update_last(&mut self, bar: &Bar) {
        self.timestamp.update_last(bar.timestamp);
        self.open.update_last(bar.open);
        self.high.update_last(bar.high);
        self.low.update_last(bar.low);
        self.close.update_last(bar.close);
        self.volume.update_last(bar.volume);
    }

    /// 获取指定索引的K线
    pub fn get(&self, index: usize) -> Option<Bar> {
        Some(Bar {
            timestamp: *self.timestamp.get(index)?,
            open: *self.open.get(index)?,
            high: *self.high.get(index)?,
            low: *self.low.get(index)?,
            close: *self.close.get(index)?,
            volume: *self.volume.get(index)?,
        })
    }

    /// 获取最后一根K线
    #[inline]
    pub fn last(&self) -> Option<Bar> {
        if self.len() == 0 {
            return None;
        }
        self.get(self.len() - 1)
    }

    /// 获取倒数第n根K线（1为最新）
    #[inline]
    pub fn get_from_end(&self, n: usize) -> Option<Bar> {
        if n == 0 || n > self.len() {
            return None;
        }
        self.get(self.len() - n)
    }

    /// 当前K线数量
    #[inline]
    pub fn len(&self) -> usize {
        self.timestamp.len()
    }

    /// 是否为空
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.timestamp.is_empty()
    }

    /// 容量
    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// 清空
    pub fn clear(&mut self) {
        self.timestamp.clear();
        self.open.clear();
        self.high.clear();
        self.low.clear();
        self.close.clear();
        self.volume.clear();
    }

    /// 批量加载历史数据
    pub fn load_history(&mut self, bars: &[Bar]) {
        for bar in bars {
            self.append(bar);
        }
    }

    /// 获取最新的收盘价
    #[inline]
    pub fn last_close(&self) -> Option<f64> {
        self.close.last().copied()
    }

    /// 获取最新的时间戳
    #[inline]
    pub fn last_timestamp(&self) -> Option<i64> {
        self.timestamp.last().copied()
    }

    /// 获取收盘价序列引用（用于指标计算）
    #[inline]
    pub fn closes(&self) -> &RingBuffer<f64> {
        &self.close
    }

    /// 获取最高价序列引用
    #[inline]
    pub fn highs(&self) -> &RingBuffer<f64> {
        &self.high
    }

    /// 获取最低价序列引用
    #[inline]
    pub fn lows(&self) -> &RingBuffer<f64> {
        &self.low
    }

    /// 获取成交量序列引用
    #[inline]
    pub fn volumes(&self) -> &RingBuffer<f64> {
        &self.volume
    }

    /// 迭代所有K线
    pub fn iter(&self) -> KlineSeriesIter<'_> {
        KlineSeriesIter {
            series: self,
            current: 0,
        }
    }
}

pub struct KlineSeriesIter<'a> {
    series: &'a KlineSeries,
    current: usize,
}

impl<'a> Iterator for KlineSeriesIter<'a> {
    type Item = Bar;

    fn next(&mut self) -> Option<Self::Item> {
        if self.current >= self.series.len() {
            return None;
        }
        let bar = self.series.get(self.current)?;
        self.current += 1;
        Some(bar)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.series.len() - self.current;
        (remaining, Some(remaining))
    }
}

impl<'a> ExactSizeIterator for KlineSeriesIter<'a> {}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_bars() -> Vec<Bar> {
        vec![
            Bar::new(1000, 100.0, 105.0, 99.0, 104.0, 1000.0),
            Bar::new(2000, 104.0, 108.0, 103.0, 107.0, 1200.0),
            Bar::new(3000, 107.0, 110.0, 106.0, 109.0, 1100.0),
            Bar::new(4000, 109.0, 112.0, 108.0, 111.0, 1300.0),
            Bar::new(5000, 111.0, 113.0, 109.0, 110.0, 900.0),
        ]
    }

    #[test]
    fn test_kline_series_basic() {
        let mut series = KlineSeries::new(10);
        let bars = create_test_bars();

        for bar in &bars {
            series.append(bar);
        }

        assert_eq!(series.len(), 5);
        assert_eq!(series.last_close(), Some(110.0));
        assert_eq!(series.last_timestamp(), Some(5000));
    }

    #[test]
    fn test_kline_series_get() {
        let mut series = KlineSeries::new(10);
        let bars = create_test_bars();
        series.load_history(&bars);

        let bar = series.get(0).unwrap();
        assert_eq!(bar.timestamp, 1000);
        assert_eq!(bar.close, 104.0);

        let last = series.last().unwrap();
        assert_eq!(last.timestamp, 5000);
        assert_eq!(last.close, 110.0);
    }

    #[test]
    fn test_kline_series_update_last() {
        let mut series = KlineSeries::new(10);
        let bars = create_test_bars();
        series.load_history(&bars);

        // 模拟实时更新最后一根K线
        let updated_bar = Bar::new(5000, 111.0, 115.0, 109.0, 114.0, 1500.0);
        series.update_last(&updated_bar);

        let last = series.last().unwrap();
        assert_eq!(last.high, 115.0);
        assert_eq!(last.close, 114.0);
        assert_eq!(last.volume, 1500.0);
        assert_eq!(series.len(), 5); // 数量不变
    }

    #[test]
    fn test_kline_series_overflow() {
        let mut series = KlineSeries::new(3);
        let bars = create_test_bars();

        for bar in &bars {
            series.append(bar);
        }

        assert_eq!(series.len(), 3);
        // 最旧的两根被覆盖，剩下 3000, 4000, 5000
        assert_eq!(series.get(0).unwrap().timestamp, 3000);
        assert_eq!(series.get(2).unwrap().timestamp, 5000);
    }

    #[test]
    fn test_kline_series_iter() {
        let mut series = KlineSeries::new(10);
        let bars = create_test_bars();
        series.load_history(&bars);

        let timestamps: Vec<i64> = series.iter().map(|b| b.timestamp).collect();
        assert_eq!(timestamps, vec![1000, 2000, 3000, 4000, 5000]);
    }

    #[test]
    fn test_kline_series_get_from_end() {
        let mut series = KlineSeries::new(10);
        let bars = create_test_bars();
        series.load_history(&bars);

        assert_eq!(series.get_from_end(1).unwrap().timestamp, 5000);
        assert_eq!(series.get_from_end(2).unwrap().timestamp, 4000);
        assert_eq!(series.get_from_end(5).unwrap().timestamp, 1000);
        assert!(series.get_from_end(6).is_none());
    }

    #[test]
    fn test_bar_merge() {
        let mut bar1 = Bar::new(1000, 100.0, 105.0, 99.0, 104.0, 1000.0);
        let bar2 = Bar::new(2000, 104.0, 108.0, 103.0, 107.0, 1200.0);

        bar1.merge(&bar2);

        assert_eq!(bar1.timestamp, 1000); // 保持不变
        assert_eq!(bar1.open, 100.0);     // 保持不变
        assert_eq!(bar1.high, 108.0);     // 取最高
        assert_eq!(bar1.low, 99.0);       // 取最低
        assert_eq!(bar1.close, 107.0);    // 取最新
        assert_eq!(bar1.volume, 2200.0);  // 累加
    }
}
