//! 高性能环形缓冲区
//!
//! 特性:
//! - 固定容量，零分配
//! - O(1) push/get 操作
//! - 支持增量计算 (running_sum)

/// 高性能环形缓冲区
#[derive(Debug, Clone)]
pub struct RingBuffer {
    data: Vec<f64>,
    capacity: usize,
    head: usize,      // 下一个写入位置
    len: usize,       // 当前长度
    running_sum: f64, // 用于 O(1) 均值计算
}

impl RingBuffer {
    /// 创建指定容量的环形缓冲区
    pub fn new(capacity: usize) -> Self {
        Self {
            data: vec![0.0; capacity],
            capacity,
            head: 0,
            len: 0,
            running_sum: 0.0,
        }
    }

    /// 添加值到缓冲区
    /// 如果已满，会覆盖最旧的值
    #[inline]
    pub fn push(&mut self, value: f64) {
        if self.len == self.capacity {
            // 缓冲区已满，减去被覆盖的旧值
            self.running_sum -= self.data[self.head];
        } else {
            self.len += 1;
        }

        self.data[self.head] = value;
        self.running_sum += value;
        self.head = (self.head + 1) % self.capacity;
    }

    /// 获取指定索引的值 (0 = 最旧, -1 = 最新)
    #[inline]
    pub fn get(&self, index: i32) -> f64 {
        if self.len == 0 {
            return f64::NAN;
        }

        let idx = if index < 0 {
            // 负索引: -1 表示最新
            let abs_idx = (-index) as usize;
            if abs_idx > self.len {
                return f64::NAN;
            }
            (self.head + self.capacity - abs_idx) % self.capacity
        } else {
            // 正索引: 0 表示最旧
            let idx = index as usize;
            if idx >= self.len {
                return f64::NAN;
            }
            (self.head + self.capacity - self.len + idx) % self.capacity
        };

        self.data[idx]
    }

    /// 获取最新值
    #[inline]
    pub fn last(&self) -> f64 {
        self.get(-1)
    }

    /// 获取最旧值
    #[inline]
    pub fn first(&self) -> f64 {
        self.get(0)
    }

    /// 获取累计和 (O(1))
    #[inline]
    pub fn sum(&self) -> f64 {
        self.running_sum
    }

    /// 获取均值 (O(1))
    #[inline]
    pub fn mean(&self) -> f64 {
        if self.len == 0 {
            f64::NAN
        } else {
            self.running_sum / self.len as f64
        }
    }

    /// 更新最后一个值
    #[inline]
    pub fn update_last(&mut self, value: f64) {
        if self.len == 0 {
            return;
        }
        let last_idx = (self.head + self.capacity - 1) % self.capacity;
        self.running_sum -= self.data[last_idx];
        self.running_sum += value;
        self.data[last_idx] = value;
    }

    /// 当前长度
    #[inline]
    pub fn len(&self) -> usize {
        self.len
    }

    /// 是否为空
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// 是否已满
    #[inline]
    pub fn is_full(&self) -> bool {
        self.len == self.capacity
    }

    /// 容量
    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// 清空缓冲区
    pub fn clear(&mut self) {
        self.head = 0;
        self.len = 0;
        self.running_sum = 0.0;
    }

    /// 迭代器 (从旧到新)
    pub fn iter(&self) -> RingBufferIter<'_> {
        RingBufferIter {
            buffer: self,
            index: 0,
        }
    }
}

/// 环形缓冲区迭代器
pub struct RingBufferIter<'a> {
    buffer: &'a RingBuffer,
    index: usize,
}

impl<'a> Iterator for RingBufferIter<'a> {
    type Item = f64;

    fn next(&mut self) -> Option<Self::Item> {
        if self.index >= self.buffer.len {
            None
        } else {
            let val = self.buffer.get(self.index as i32);
            self.index += 1;
            Some(val)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_push_and_get() {
        let mut buf = RingBuffer::new(3);
        buf.push(1.0);
        buf.push(2.0);
        buf.push(3.0);

        assert_eq!(buf.get(0), 1.0);  // 最旧
        assert_eq!(buf.get(-1), 3.0); // 最新
        assert_eq!(buf.len(), 3);
    }

    #[test]
    fn test_overflow() {
        let mut buf = RingBuffer::new(3);
        buf.push(1.0);
        buf.push(2.0);
        buf.push(3.0);
        buf.push(4.0); // 覆盖 1.0

        assert_eq!(buf.get(0), 2.0);  // 最旧变成 2.0
        assert_eq!(buf.get(-1), 4.0); // 最新
        assert_eq!(buf.len(), 3);
    }

    #[test]
    fn test_running_sum() {
        let mut buf = RingBuffer::new(3);
        buf.push(1.0);
        buf.push(2.0);
        buf.push(3.0);
        assert_eq!(buf.sum(), 6.0);
        assert_eq!(buf.mean(), 2.0);

        buf.push(4.0); // 覆盖 1.0, sum = 2+3+4 = 9
        assert_eq!(buf.sum(), 9.0);
        assert_eq!(buf.mean(), 3.0);
    }

    #[test]
    fn test_update_last() {
        let mut buf = RingBuffer::new(3);
        buf.push(1.0);
        buf.push(2.0);
        buf.push(3.0);

        buf.update_last(5.0);
        assert_eq!(buf.last(), 5.0);
        assert_eq!(buf.sum(), 8.0); // 1+2+5
    }
}
