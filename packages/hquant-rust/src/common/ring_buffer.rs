/// 高性能环形缓冲区实现
/// 使用固定大小数组，避免动态内存分配
/// 支持 O(1) 的追加和随机访问

#[derive(Debug, Clone)]
pub struct RingBuffer<T> {
    data: Vec<T>,
    capacity: usize,
    head: usize,  // 写入位置
    len: usize,   // 当前元素数量
}

impl<T: Default + Clone> RingBuffer<T> {
    /// 创建指定容量的环形缓冲区
    #[inline]
    pub fn new(capacity: usize) -> Self {
        assert!(capacity > 0, "capacity must be > 0");
        Self {
            data: vec![T::default(); capacity],
            capacity,
            head: 0,
            len: 0,
        }
    }

    /// 创建带初始数据的环形缓冲区
    pub fn with_data(capacity: usize, initial: &[T]) -> Self {
        let mut rb = Self::new(capacity);
        for item in initial {
            rb.push(item.clone());
        }
        rb
    }

    /// 追加元素，如果已满则覆盖最旧的元素
    #[inline]
    pub fn push(&mut self, value: T) {
        self.data[self.head] = value;
        self.head = (self.head + 1) % self.capacity;
        if self.len < self.capacity {
            self.len += 1;
        }
    }

    /// 更新最后一个元素（用于实时K线更新）
    #[inline]
    pub fn update_last(&mut self, value: T) {
        if self.len > 0 {
            let last_idx = if self.head == 0 {
                self.capacity - 1
            } else {
                self.head - 1
            };
            self.data[last_idx] = value;
        }
    }

    /// 获取指定索引的元素（0为最旧，len-1为最新）
    #[inline]
    pub fn get(&self, index: usize) -> Option<&T> {
        if index >= self.len {
            return None;
        }
        let actual_idx = self.to_actual_index(index);
        Some(&self.data[actual_idx])
    }

    /// 获取最新的元素
    #[inline]
    pub fn last(&self) -> Option<&T> {
        if self.len == 0 {
            None
        } else {
            self.get(self.len - 1)
        }
    }

    /// 获取最新的N个元素（从旧到新）
    #[inline]
    pub fn last_n(&self, n: usize) -> Vec<&T> {
        let n = n.min(self.len);
        let start = self.len.saturating_sub(n);
        (start..self.len).filter_map(|i| self.get(i)).collect()
    }

    /// 获取倒数第n个元素（1为最新，2为次新）
    #[inline]
    pub fn get_from_end(&self, n: usize) -> Option<&T> {
        if n == 0 || n > self.len {
            return None;
        }
        self.get(self.len - n)
    }

    /// 当前元素数量
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
    #[inline]
    pub fn clear(&mut self) {
        self.head = 0;
        self.len = 0;
    }

    /// 转换为逻辑索引到实际索引
    #[inline]
    fn to_actual_index(&self, logical_index: usize) -> usize {
        if self.len < self.capacity {
            logical_index
        } else {
            (self.head + logical_index) % self.capacity
        }
    }

    /// 迭代器（从旧到新）
    pub fn iter(&self) -> RingBufferIter<'_, T> {
        RingBufferIter {
            buffer: self,
            current: 0,
        }
    }

    /// 获取原始数据切片（用于批量计算）
    /// 返回两个切片，因为数据可能跨越边界
    pub fn as_slices(&self) -> (&[T], &[T]) {
        if self.len == 0 {
            return (&[], &[]);
        }

        if self.len < self.capacity {
            (&self.data[..self.len], &[])
        } else {
            let first = &self.data[self.head..];
            let second = &self.data[..self.head];
            (first, second)
        }
    }

    /// 转换为连续 Vec（用于需要连续内存的计算）
    pub fn to_vec(&self) -> Vec<T> {
        self.iter().cloned().collect()
    }
}

pub struct RingBufferIter<'a, T> {
    buffer: &'a RingBuffer<T>,
    current: usize,
}

impl<'a, T: Default + Clone> Iterator for RingBufferIter<'a, T> {
    type Item = &'a T;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        if self.current >= self.buffer.len {
            return None;
        }
        let item = self.buffer.get(self.current);
        self.current += 1;
        item
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.buffer.len - self.current;
        (remaining, Some(remaining))
    }
}

impl<'a, T: Default + Clone> ExactSizeIterator for RingBufferIter<'a, T> {}

/// f64 专用的高性能环形缓冲区
/// 提供额外的数值计算方法
#[derive(Debug, Clone)]
pub struct F64RingBuffer {
    inner: RingBuffer<f64>,
    // 缓存求和，用于快速计算均值
    sum: f64,
    // 缓存平方和，用于快速计算标准差
    sum_sq: f64,
}

impl F64RingBuffer {
    #[inline]
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: RingBuffer::new(capacity),
            sum: 0.0,
            sum_sq: 0.0,
        }
    }

    /// 追加元素，维护缓存的和
    #[inline]
    pub fn push(&mut self, value: f64) {
        // 如果缓冲区已满，减去即将被覆盖的值
        if self.inner.is_full() {
            if let Some(&old_val) = self.inner.get(0) {
                self.sum -= old_val;
                self.sum_sq -= old_val * old_val;
            }
        }
        self.sum += value;
        self.sum_sq += value * value;
        self.inner.push(value);
    }

    /// 更新最后一个元素
    #[inline]
    pub fn update_last(&mut self, value: f64) {
        if let Some(&old_val) = self.inner.last() {
            self.sum = self.sum - old_val + value;
            self.sum_sq = self.sum_sq - old_val * old_val + value * value;
            self.inner.update_last(value);
        }
    }

    /// O(1) 计算均值
    #[inline]
    pub fn mean(&self) -> f64 {
        if self.inner.is_empty() {
            0.0
        } else {
            self.sum / self.inner.len() as f64
        }
    }

    /// O(1) 计算方差
    #[inline]
    pub fn variance(&self) -> f64 {
        if self.inner.len() < 2 {
            return 0.0;
        }
        let n = self.inner.len() as f64;
        let mean = self.sum / n;
        (self.sum_sq / n) - (mean * mean)
    }

    /// O(1) 计算标准差
    #[inline]
    pub fn std_dev(&self) -> f64 {
        self.variance().sqrt()
    }

    /// 获取最大值
    pub fn max(&self) -> f64 {
        self.inner.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b))
    }

    /// 获取最小值
    pub fn min(&self) -> f64 {
        self.inner.iter().fold(f64::INFINITY, |a, &b| a.min(b))
    }

    /// 获取最新N个元素的均值
    pub fn mean_last_n(&self, n: usize) -> f64 {
        let items = self.inner.last_n(n);
        if items.is_empty() {
            return 0.0;
        }
        items.iter().map(|&&x| x).sum::<f64>() / items.len() as f64
    }

    #[inline]
    pub fn get(&self, index: usize) -> Option<f64> {
        self.inner.get(index).copied()
    }

    #[inline]
    pub fn last(&self) -> Option<f64> {
        self.inner.last().copied()
    }

    #[inline]
    pub fn get_from_end(&self, n: usize) -> Option<f64> {
        self.inner.get_from_end(n).copied()
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    #[inline]
    pub fn capacity(&self) -> usize {
        self.inner.capacity()
    }

    #[inline]
    pub fn clear(&mut self) {
        self.inner.clear();
        self.sum = 0.0;
        self.sum_sq = 0.0;
    }

    pub fn iter(&self) -> RingBufferIter<'_, f64> {
        self.inner.iter()
    }

    pub fn to_vec(&self) -> Vec<f64> {
        self.inner.to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_basic() {
        let mut rb: RingBuffer<i32> = RingBuffer::new(3);

        rb.push(1);
        rb.push(2);
        rb.push(3);

        assert_eq!(rb.len(), 3);
        assert!(rb.is_full());
        assert_eq!(rb.get(0), Some(&1));
        assert_eq!(rb.get(1), Some(&2));
        assert_eq!(rb.get(2), Some(&3));
        assert_eq!(rb.last(), Some(&3));
    }

    #[test]
    fn test_ring_buffer_overflow() {
        let mut rb: RingBuffer<i32> = RingBuffer::new(3);

        rb.push(1);
        rb.push(2);
        rb.push(3);
        rb.push(4); // 覆盖 1

        assert_eq!(rb.len(), 3);
        assert_eq!(rb.get(0), Some(&2));
        assert_eq!(rb.get(1), Some(&3));
        assert_eq!(rb.get(2), Some(&4));
    }

    #[test]
    fn test_ring_buffer_update_last() {
        let mut rb: RingBuffer<i32> = RingBuffer::new(3);

        rb.push(1);
        rb.push(2);
        rb.update_last(20);

        assert_eq!(rb.last(), Some(&20));
        assert_eq!(rb.len(), 2);
    }

    #[test]
    fn test_ring_buffer_iter() {
        let mut rb: RingBuffer<i32> = RingBuffer::new(3);
        rb.push(1);
        rb.push(2);
        rb.push(3);
        rb.push(4);

        let vals: Vec<i32> = rb.iter().copied().collect();
        assert_eq!(vals, vec![2, 3, 4]);
    }

    #[test]
    fn test_ring_buffer_last_n() {
        let mut rb: RingBuffer<i32> = RingBuffer::new(5);
        for i in 1..=5 {
            rb.push(i);
        }

        let last_3: Vec<i32> = rb.last_n(3).into_iter().copied().collect();
        assert_eq!(last_3, vec![3, 4, 5]);
    }

    #[test]
    fn test_ring_buffer_get_from_end() {
        let mut rb: RingBuffer<i32> = RingBuffer::new(5);
        for i in 1..=5 {
            rb.push(i);
        }

        assert_eq!(rb.get_from_end(1), Some(&5)); // 最新
        assert_eq!(rb.get_from_end(2), Some(&4)); // 次新
        assert_eq!(rb.get_from_end(5), Some(&1)); // 最旧
        assert_eq!(rb.get_from_end(6), None);
    }

    #[test]
    fn test_f64_ring_buffer_mean() {
        let mut rb = F64RingBuffer::new(4);
        rb.push(1.0);
        rb.push(2.0);
        rb.push(3.0);
        rb.push(4.0);

        assert!((rb.mean() - 2.5).abs() < 1e-10);
    }

    #[test]
    fn test_f64_ring_buffer_overflow_mean() {
        let mut rb = F64RingBuffer::new(3);
        rb.push(1.0);
        rb.push(2.0);
        rb.push(3.0);
        rb.push(4.0); // 覆盖 1.0

        // 均值应该是 (2+3+4)/3 = 3.0
        assert!((rb.mean() - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_f64_ring_buffer_std_dev() {
        let mut rb = F64RingBuffer::new(4);
        rb.push(2.0);
        rb.push(4.0);
        rb.push(4.0);
        rb.push(4.0);
        rb.push(5.0);
        rb.push(5.0);
        rb.push(7.0);
        rb.push(9.0);

        // 最后4个: 5, 5, 7, 9, 均值=6.5
        let expected_var = ((5.0-6.5_f64).powi(2) + (5.0-6.5_f64).powi(2)
            + (7.0-6.5_f64).powi(2) + (9.0-6.5_f64).powi(2)) / 4.0;
        assert!((rb.variance() - expected_var).abs() < 1e-10);
    }

    #[test]
    fn test_f64_ring_buffer_update_last() {
        let mut rb = F64RingBuffer::new(3);
        rb.push(1.0);
        rb.push(2.0);
        rb.push(3.0);

        rb.update_last(30.0);

        assert!((rb.last().unwrap() - 30.0).abs() < 1e-10);
        assert!((rb.mean() - 11.0).abs() < 1e-10); // (1+2+30)/3
    }
}
