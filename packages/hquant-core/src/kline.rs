//! K线数据结构
//!
//! 支持两种存储模式:
//! - Kline: 单根K线 (AoS)
//! - KlineFrame: 列式存储 (SoA) - 高性能批量处理

use serde::{Deserialize, Serialize};
use crate::common::RingBuffer;

/// 单根K线数据
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Kline {
    pub open: f64,
    pub close: f64,
    pub high: f64,
    pub low: f64,
    pub volume: f64,
    pub timestamp: i64,
    #[serde(default)]
    pub buy: Option<f64>,
    #[serde(default)]
    pub sell: Option<f64>,
}

impl Kline {
    pub fn new(open: f64, close: f64, high: f64, low: f64, volume: f64, timestamp: i64) -> Self {
        Self {
            open,
            close,
            high,
            low,
            volume,
            timestamp,
            buy: None,
            sell: None,
        }
    }
}

/// 列式存储的K线数据帧 (Struct of Arrays)
///
/// 优势:
/// - 更好的 CPU 缓存命中率
/// - 支持 SIMD 向量化
/// - 内存占用更小
#[derive(Debug)]
pub struct KlineFrame {
    pub open: RingBuffer,
    pub close: RingBuffer,
    pub high: RingBuffer,
    pub low: RingBuffer,
    pub volume: RingBuffer,
    pub timestamp: Vec<i64>,
    capacity: usize,
    len: usize,
}

impl KlineFrame {
    /// 创建指定容量的 K线帧
    pub fn new(capacity: usize) -> Self {
        Self {
            open: RingBuffer::new(capacity),
            close: RingBuffer::new(capacity),
            high: RingBuffer::new(capacity),
            low: RingBuffer::new(capacity),
            volume: RingBuffer::new(capacity),
            timestamp: Vec::with_capacity(capacity),
            capacity,
            len: 0,
        }
    }

    /// 添加一根K线
    pub fn push(&mut self, kline: &Kline) {
        self.open.push(kline.open);
        self.close.push(kline.close);
        self.high.push(kline.high);
        self.low.push(kline.low);
        self.volume.push(kline.volume);

        if self.len < self.capacity {
            self.timestamp.push(kline.timestamp);
            self.len += 1;
        } else {
            // 环形覆盖 timestamp
            let idx = self.len % self.capacity;
            self.timestamp[idx] = kline.timestamp;
        }
    }

    /// 更新最后一根K线
    pub fn update_last(&mut self, kline: &Kline) {
        self.open.update_last(kline.open);
        self.close.update_last(kline.close);
        self.high.update_last(kline.high);
        self.low.update_last(kline.low);
        self.volume.update_last(kline.volume);

        if !self.timestamp.is_empty() {
            let last_idx = (self.len - 1) % self.capacity;
            self.timestamp[last_idx] = kline.timestamp;
        }
    }

    /// 获取指定索引的K线
    pub fn get(&self, index: i32) -> Option<Kline> {
        let open = self.open.get(index);
        if open.is_nan() {
            return None;
        }

        let idx = if index < 0 {
            let abs_idx = (-index) as usize;
            if abs_idx > self.len {
                return None;
            }
            self.len - abs_idx
        } else {
            index as usize
        };

        Some(Kline {
            open,
            close: self.close.get(index),
            high: self.high.get(index),
            low: self.low.get(index),
            volume: self.volume.get(index),
            timestamp: self.timestamp.get(idx % self.capacity).copied().unwrap_or(0),
            buy: None,
            sell: None,
        })
    }

    /// 从 JSON 批量导入
    pub fn from_json(json: &str, capacity: usize) -> Result<Self, serde_json::Error> {
        let klines: Vec<Kline> = serde_json::from_str(json)?;
        let mut frame = Self::new(capacity.max(klines.len()));
        for kline in &klines {
            frame.push(kline);
        }
        Ok(frame)
    }

    /// 从 JSON 批量导入 (带字符串字段支持)
    pub fn from_json_flexible(json: &str, capacity: usize) -> Result<Self, serde_json::Error> {
        #[derive(Deserialize)]
        struct KlineIn {
            open: serde_json::Value,
            close: serde_json::Value,
            high: serde_json::Value,
            low: serde_json::Value,
            volume: serde_json::Value,
            timestamp: i64,
        }

        fn to_f64(v: &serde_json::Value) -> f64 {
            match v {
                serde_json::Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
                serde_json::Value::String(s) => s.parse().unwrap_or(f64::NAN),
                _ => f64::NAN,
            }
        }

        let klines: Vec<KlineIn> = serde_json::from_str(json)?;
        let mut frame = Self::new(capacity.max(klines.len()));

        for k in &klines {
            frame.push(&Kline {
                open: to_f64(&k.open),
                close: to_f64(&k.close),
                high: to_f64(&k.high),
                low: to_f64(&k.low),
                volume: to_f64(&k.volume),
                timestamp: k.timestamp,
                buy: None,
                sell: None,
            });
        }
        Ok(frame)
    }

    /// 当前长度
    pub fn len(&self) -> usize {
        self.open.len()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// 容量
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// 清空
    pub fn clear(&mut self) {
        self.open.clear();
        self.close.clear();
        self.high.clear();
        self.low.clear();
        self.volume.clear();
        self.timestamp.clear();
        self.len = 0;
    }
}

/// 二进制格式头部
#[repr(C, packed)]
pub struct BinaryHeader {
    pub magic: [u8; 4],     // "HQKL"
    pub version: u8,        // 0x01
    pub flags: u8,          // 压缩等标志
    pub columns: u8,        // 列数
    pub reserved1: u8,
    pub count: u32,         // 行数
    pub ts_base: i64,       // 基准时间戳
    pub reserved2: [u8; 12],
}

impl KlineFrame {
    /// 导出为二进制格式 (高性能)
    pub fn to_binary(&self) -> Vec<u8> {
        let count = self.len() as u32;
        let ts_base = if !self.timestamp.is_empty() {
            self.timestamp[0]
        } else {
            0
        };

        // 计算总大小: header(32) + 5*count*8 (OHLCV) + count*4 (timestamp delta)
        let size = 32 + (count as usize) * 44;
        let mut buf = Vec::with_capacity(size);

        // Header
        buf.extend_from_slice(b"HQKL");
        buf.push(0x01); // version
        buf.push(0x00); // flags
        buf.push(6);    // columns
        buf.push(0);    // reserved
        buf.extend_from_slice(&count.to_le_bytes());
        buf.extend_from_slice(&ts_base.to_le_bytes());
        buf.extend_from_slice(&[0u8; 12]); // reserved

        // Data columns
        for v in self.open.iter() {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        for v in self.close.iter() {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        for v in self.high.iter() {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        for v in self.low.iter() {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        for v in self.volume.iter() {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        // Timestamp as delta
        for &ts in &self.timestamp {
            let delta = (ts - ts_base) as i32;
            buf.extend_from_slice(&delta.to_le_bytes());
        }

        buf
    }

    /// 从二进制格式导入
    pub fn from_binary(data: &[u8]) -> Result<Self, &'static str> {
        if data.len() < 32 {
            return Err("Data too short");
        }
        if &data[0..4] != b"HQKL" {
            return Err("Invalid magic");
        }

        let count = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;
        let ts_base = i64::from_le_bytes([
            data[12], data[13], data[14], data[15],
            data[16], data[17], data[18], data[19],
        ]);

        let expected_size = 32 + count * 44;
        if data.len() < expected_size {
            return Err("Data size mismatch");
        }

        let mut frame = Self::new(count);
        let mut offset = 32;

        // 读取各列
        let read_f64_column = |data: &[u8], offset: &mut usize, count: usize| -> Vec<f64> {
            let mut col = Vec::with_capacity(count);
            for _ in 0..count {
                let bytes: [u8; 8] = data[*offset..*offset + 8].try_into().unwrap();
                col.push(f64::from_le_bytes(bytes));
                *offset += 8;
            }
            col
        };

        let opens = read_f64_column(data, &mut offset, count);
        let closes = read_f64_column(data, &mut offset, count);
        let highs = read_f64_column(data, &mut offset, count);
        let lows = read_f64_column(data, &mut offset, count);
        let volumes = read_f64_column(data, &mut offset, count);

        // Timestamps
        for i in 0..count {
            let delta_bytes: [u8; 4] = data[offset..offset + 4].try_into().unwrap();
            let delta = i32::from_le_bytes(delta_bytes);
            frame.timestamp.push(ts_base + delta as i64);
            offset += 4;

            frame.open.push(opens[i]);
            frame.close.push(closes[i]);
            frame.high.push(highs[i]);
            frame.low.push(lows[i]);
            frame.volume.push(volumes[i]);
        }
        frame.len = count;

        Ok(frame)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kline_frame() {
        let mut frame = KlineFrame::new(100);
        frame.push(&Kline::new(100.0, 102.0, 103.0, 99.0, 1000.0, 1700000000));
        frame.push(&Kline::new(102.0, 105.0, 106.0, 101.0, 1200.0, 1700000060));

        assert_eq!(frame.len(), 2);
        assert_eq!(frame.close.last(), 105.0);
    }

    #[test]
    fn test_binary_roundtrip() {
        let mut frame = KlineFrame::new(100);
        frame.push(&Kline::new(100.0, 102.0, 103.0, 99.0, 1000.0, 1700000000));
        frame.push(&Kline::new(102.0, 105.0, 106.0, 101.0, 1200.0, 1700000060));

        let binary = frame.to_binary();
        let restored = KlineFrame::from_binary(&binary).unwrap();

        assert_eq!(restored.len(), 2);
        assert_eq!(restored.close.get(0), 102.0);
        assert_eq!(restored.close.get(1), 105.0);
    }

    #[test]
    fn test_json_import() {
        let json = r#"[
            {"open": 100, "close": 102, "high": 103, "low": 99, "volume": 1000, "timestamp": 1700000000},
            {"open": "102.5", "close": "105.5", "high": "106", "low": "101", "volume": "1200", "timestamp": 1700000060}
        ]"#;

        let frame = KlineFrame::from_json_flexible(json, 100).unwrap();
        assert_eq!(frame.len(), 2);
        assert_eq!(frame.close.get(1), 105.5);
    }
}
