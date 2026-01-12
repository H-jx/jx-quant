/// 周期聚合器
/// 支持从细粒度K线聚合到粗粒度K线（如 15m -> 4h -> 1d）

use crate::kline::{Bar, KlineSeries};

/// 时间周期定义（毫秒）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TimeFrame {
    M1,   // 1分钟
    M5,   // 5分钟
    M15,  // 15分钟
    M30,  // 30分钟
    H1,   // 1小时
    H4,   // 4小时
    D1,   // 1天
    W1,   // 1周
}

impl TimeFrame {
    /// 获取周期的毫秒数
    pub fn millis(&self) -> i64 {
        match self {
            TimeFrame::M1 => 60_000,
            TimeFrame::M5 => 5 * 60_000,
            TimeFrame::M15 => 15 * 60_000,
            TimeFrame::M30 => 30 * 60_000,
            TimeFrame::H1 => 60 * 60_000,
            TimeFrame::H4 => 4 * 60 * 60_000,
            TimeFrame::D1 => 24 * 60 * 60_000,
            TimeFrame::W1 => 7 * 24 * 60 * 60_000,
        }
    }

    /// 计算时间戳对应的周期起始时间
    pub fn align_timestamp(&self, timestamp: i64) -> i64 {
        let period = self.millis();
        (timestamp / period) * period
    }

    /// 检查是否是另一个周期的整数倍
    pub fn is_multiple_of(&self, other: &TimeFrame) -> bool {
        self.millis() % other.millis() == 0
    }

    /// 计算需要多少个源周期才能组成一个目标周期
    pub fn ratio(&self, source: &TimeFrame) -> usize {
        (self.millis() / source.millis()) as usize
    }
}

/// 周期聚合器
#[derive(Debug)]
pub struct Aggregator {
    source_tf: TimeFrame,
    target_tf: TimeFrame,
    #[allow(dead_code)]
    ratio: usize,
    current_bar: Option<Bar>,
    bar_count: usize,
    output: KlineSeries,
}

impl Aggregator {
    pub fn new(source_tf: TimeFrame, target_tf: TimeFrame, capacity: usize) -> Self {
        assert!(
            target_tf.is_multiple_of(&source_tf),
            "Target timeframe must be a multiple of source timeframe"
        );

        Self {
            source_tf,
            target_tf,
            ratio: target_tf.ratio(&source_tf),
            current_bar: None,
            bar_count: 0,
            output: KlineSeries::new(capacity),
        }
    }

    /// 输入一根源周期K线，返回是否产生了新的目标周期K线
    pub fn push(&mut self, bar: &Bar) -> bool {
        let aligned_ts = self.target_tf.align_timestamp(bar.timestamp);

        match &mut self.current_bar {
            None => {
                // 开始新的聚合周期
                self.current_bar = Some(Bar {
                    timestamp: aligned_ts,
                    open: bar.open,
                    high: bar.high,
                    low: bar.low,
                    close: bar.close,
                    volume: bar.volume,
                });
                self.bar_count = 1;
                false
            }
            Some(current) => {
                if aligned_ts != current.timestamp {
                    // 新周期开始，保存当前聚合结果
                    self.output.append(current);

                    // 开始新的聚合
                    self.current_bar = Some(Bar {
                        timestamp: aligned_ts,
                        open: bar.open,
                        high: bar.high,
                        low: bar.low,
                        close: bar.close,
                        volume: bar.volume,
                    });
                    self.bar_count = 1;
                    true
                } else {
                    // 继续聚合
                    current.merge(bar);
                    self.bar_count += 1;
                    false
                }
            }
        }
    }

    /// 更新当前正在聚合的K线（用于实时更新）
    pub fn update_last(&mut self, bar: &Bar) {
        if let Some(current) = &mut self.current_bar {
            let aligned_ts = self.target_tf.align_timestamp(bar.timestamp);
            if aligned_ts == current.timestamp {
                // 更新当前聚合中的最后一根
                current.high = current.high.max(bar.high);
                current.low = current.low.min(bar.low);
                current.close = bar.close;
                // volume 需要特殊处理，这里简化为直接更新
            }
        }
    }

    /// 获取当前正在聚合的K线（未完成）
    pub fn current(&self) -> Option<&Bar> {
        self.current_bar.as_ref()
    }

    /// 获取已完成的聚合K线序列
    pub fn output(&self) -> &KlineSeries {
        &self.output
    }

    /// 获取最后一根已完成的聚合K线
    pub fn last_completed(&self) -> Option<Bar> {
        self.output.last()
    }

    /// 强制完成当前聚合（用于回测结束时）
    pub fn flush(&mut self) -> Option<Bar> {
        if let Some(bar) = self.current_bar.take() {
            self.output.append(&bar);
            self.bar_count = 0;
            Some(bar)
        } else {
            None
        }
    }

    /// 重置聚合器
    pub fn reset(&mut self) {
        self.current_bar = None;
        self.bar_count = 0;
        self.output.clear();
    }

    /// 获取源周期
    pub fn source_timeframe(&self) -> TimeFrame {
        self.source_tf
    }

    /// 获取目标周期
    pub fn target_timeframe(&self) -> TimeFrame {
        self.target_tf
    }
}

/// 多周期聚合管理器
/// 支持同时维护多个时间周期的K线数据
#[derive(Debug)]
pub struct MultiTimeFrameAggregator {
    #[allow(dead_code)]
    base_tf: TimeFrame,
    aggregators: Vec<Aggregator>,
}

impl MultiTimeFrameAggregator {
    pub fn new(base_tf: TimeFrame, target_tfs: &[TimeFrame], capacity: usize) -> Self {
        let aggregators = target_tfs
            .iter()
            .filter(|tf| tf.is_multiple_of(&base_tf) && **tf != base_tf)
            .map(|tf| Aggregator::new(base_tf, *tf, capacity))
            .collect();

        Self {
            base_tf,
            aggregators,
        }
    }

    /// 输入基础周期K线，更新所有聚合器
    /// 返回产生了新K线的周期列表
    pub fn push(&mut self, bar: &Bar) -> Vec<TimeFrame> {
        let mut completed = Vec::new();

        for agg in &mut self.aggregators {
            if agg.push(bar) {
                completed.push(agg.target_timeframe());
            }
        }

        completed
    }

    /// 更新所有聚合器的最后一根K线
    pub fn update_last(&mut self, bar: &Bar) {
        for agg in &mut self.aggregators {
            agg.update_last(bar);
        }
    }

    /// 获取指定周期的聚合器
    pub fn get(&self, tf: TimeFrame) -> Option<&Aggregator> {
        self.aggregators.iter().find(|a| a.target_timeframe() == tf)
    }

    /// 获取指定周期的当前K线（可能未完成）
    pub fn current(&self, tf: TimeFrame) -> Option<&Bar> {
        self.get(tf).and_then(|a| a.current())
    }

    /// 获取指定周期的输出序列
    pub fn output(&self, tf: TimeFrame) -> Option<&KlineSeries> {
        self.get(tf).map(|a| a.output())
    }

    /// 强制完成所有聚合
    pub fn flush_all(&mut self) {
        for agg in &mut self.aggregators {
            agg.flush();
        }
    }

    /// 重置所有聚合器
    pub fn reset(&mut self) {
        for agg in &mut self.aggregators {
            agg.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timeframe_millis() {
        assert_eq!(TimeFrame::M1.millis(), 60_000);
        assert_eq!(TimeFrame::M15.millis(), 15 * 60_000);
        assert_eq!(TimeFrame::H4.millis(), 4 * 60 * 60_000);
        assert_eq!(TimeFrame::D1.millis(), 24 * 60 * 60_000);
    }

    #[test]
    fn test_timeframe_align() {
        // 15分钟对齐
        let ts = 1000 * 60 * 17; // 17分钟
        let aligned = TimeFrame::M15.align_timestamp(ts);
        assert_eq!(aligned, 1000 * 60 * 15); // 对齐到15分钟

        // 4小时对齐
        let ts = 1000 * 60 * 60 * 5; // 5小时
        let aligned = TimeFrame::H4.align_timestamp(ts);
        assert_eq!(aligned, 1000 * 60 * 60 * 4); // 对齐到4小时
    }

    #[test]
    fn test_timeframe_multiple() {
        assert!(TimeFrame::H4.is_multiple_of(&TimeFrame::M15));
        assert!(TimeFrame::D1.is_multiple_of(&TimeFrame::H4));
        assert!(TimeFrame::H4.is_multiple_of(&TimeFrame::M30)); // 4h = 8 * 30m
        assert!(!TimeFrame::M5.is_multiple_of(&TimeFrame::M15)); // 5m < 15m，不是整数倍
    }

    #[test]
    fn test_timeframe_ratio() {
        assert_eq!(TimeFrame::H1.ratio(&TimeFrame::M15), 4);
        assert_eq!(TimeFrame::H4.ratio(&TimeFrame::M15), 16);
        assert_eq!(TimeFrame::D1.ratio(&TimeFrame::H4), 6);
    }

    #[test]
    fn test_aggregator_basic() {
        let mut agg = Aggregator::new(TimeFrame::M15, TimeFrame::H1, 100);

        // 输入4根15分钟K线
        let bars = vec![
            Bar::new(0, 100.0, 105.0, 99.0, 104.0, 1000.0),
            Bar::new(15 * 60_000, 104.0, 108.0, 103.0, 107.0, 1200.0),
            Bar::new(30 * 60_000, 107.0, 110.0, 106.0, 109.0, 1100.0),
            Bar::new(45 * 60_000, 109.0, 112.0, 108.0, 111.0, 1300.0),
        ];

        for (i, bar) in bars.iter().enumerate() {
            let completed = agg.push(bar);
            if i < 3 {
                assert!(!completed);
            }
        }

        // 输入下一个小时的第一根K线，触发完成
        let next_bar = Bar::new(60 * 60_000, 111.0, 113.0, 110.0, 112.0, 900.0);
        let completed = agg.push(&next_bar);
        assert!(completed);

        // 检查聚合结果
        let result = agg.last_completed().unwrap();
        assert_eq!(result.timestamp, 0);
        assert_eq!(result.open, 100.0);
        assert_eq!(result.high, 112.0);
        assert_eq!(result.low, 99.0);
        assert_eq!(result.close, 111.0);
        assert_eq!(result.volume, 4600.0);
    }

    #[test]
    fn test_aggregator_current() {
        let mut agg = Aggregator::new(TimeFrame::M15, TimeFrame::H1, 100);

        let bar = Bar::new(0, 100.0, 105.0, 99.0, 104.0, 1000.0);
        agg.push(&bar);

        let current = agg.current().unwrap();
        assert_eq!(current.open, 100.0);
        assert_eq!(current.close, 104.0);
    }

    #[test]
    fn test_aggregator_flush() {
        let mut agg = Aggregator::new(TimeFrame::M15, TimeFrame::H1, 100);

        let bars = vec![
            Bar::new(0, 100.0, 105.0, 99.0, 104.0, 1000.0),
            Bar::new(15 * 60_000, 104.0, 108.0, 103.0, 107.0, 1200.0),
        ];

        for bar in &bars {
            agg.push(bar);
        }

        // 强制完成
        let flushed = agg.flush().unwrap();
        assert_eq!(flushed.open, 100.0);
        assert_eq!(flushed.close, 107.0);
        assert!(agg.current().is_none());
    }

    #[test]
    fn test_multi_timeframe() {
        let mut mtf = MultiTimeFrameAggregator::new(
            TimeFrame::M15,
            &[TimeFrame::H1, TimeFrame::H4],
            100,
        );

        // 输入16根15分钟K线（4小时）
        for i in 0..16 {
            let bar = Bar::new(
                i * 15 * 60_000,
                100.0 + i as f64,
                105.0 + i as f64,
                99.0 + i as f64,
                104.0 + i as f64,
                1000.0,
            );
            let completed = mtf.push(&bar);

            // 每4根完成一个H1
            if i > 0 && i % 4 == 0 {
                assert!(completed.contains(&TimeFrame::H1));
            }
        }

        // 输入下一根触发H4完成
        let bar = Bar::new(16 * 15 * 60_000, 116.0, 121.0, 115.0, 120.0, 1000.0);
        let completed = mtf.push(&bar);
        assert!(completed.contains(&TimeFrame::H4));
    }
}
