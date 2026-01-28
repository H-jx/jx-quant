use core::fmt;

/// Fixed-capacity ring buffer (append-only, overwrite-oldest when full).
///
/// - Internal mutability, but callers only get read access via `get`/`iter`.
/// - SoA-friendly: store each column separately (e.g. close/open/volume).
#[derive(Clone)]
pub struct CircularColumn<T: Copy + Default> {
    capacity: usize,
    len: usize,
    head: usize, // next write index
    data: Vec<T>,
}

impl<T: Copy + Default> fmt::Debug for CircularColumn<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CircularColumn")
            .field("capacity", &self.capacity)
            .field("len", &self.len)
            .field("head", &self.head)
            .finish_non_exhaustive()
    }
}

impl<T: Copy + Default> CircularColumn<T> {
    pub fn new(capacity: usize) -> Self {
        assert!(capacity > 0, "capacity must be > 0");
        Self {
            capacity,
            len: 0,
            head: 0,
            data: vec![T::default(); capacity],
        }
    }

    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.len
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    #[inline]
    pub fn is_full(&self) -> bool {
        self.len == self.capacity
    }

    /// Index (in `data`) of the oldest element.
    #[inline]
    fn start(&self) -> usize {
        // Works for both partially-filled and full rings.
        (self.head + self.capacity - self.len) % self.capacity
    }

    #[inline]
    fn idx_from_oldest(&self, i: usize) -> usize {
        debug_assert!(i < self.len);
        (self.start() + i) % self.capacity
    }

    /// Pushes a new element (overwriting the oldest when full).
    #[inline]
    pub fn push(&mut self, v: T) {
        self.data[self.head] = v;
        self.head = (self.head + 1) % self.capacity;
        if self.len < self.capacity {
            self.len += 1;
        }
    }

    /// Updates the last (most recent) element.
    #[inline]
    pub fn update_last(&mut self, v: T) {
        if self.len == 0 {
            return;
        }
        let last_idx = (self.head + self.capacity - 1) % self.capacity;
        self.data[last_idx] = v;
    }

    /// Gets element by index from oldest (0 = oldest).
    #[inline]
    pub fn get(&self, i: usize) -> Option<T> {
        if i >= self.len {
            return None;
        }
        Some(self.data[self.idx_from_oldest(i)])
    }

    /// Gets element by index from newest (0 = newest).
    #[inline]
    pub fn get_from_end(&self, i: usize) -> Option<T> {
        if i >= self.len {
            return None;
        }
        self.get(self.len - 1 - i)
    }

    /// Updates element by index from oldest (0 = oldest).
    #[inline]
    pub fn update(&mut self, i: usize, v: T) {
        if i >= self.len {
            return;
        }
        let idx = self.idx_from_oldest(i);
        self.data[idx] = v;
    }

    pub fn iter(&self) -> Iter<'_, T> {
        Iter { col: self, i: 0 }
    }

    /// Exposes raw backing storage + ring metadata for FFI consumers.
    ///
    /// Note: data order is NOT chronological when wrapped. Use `head/len/capacity`
    /// to reconstruct order, or call `to_vec_ordered` (copying).
    #[inline]
    pub fn raw_parts(&self) -> (*const T, usize, usize, usize) {
        (self.data.as_ptr(), self.capacity, self.len, self.head)
    }

    pub fn to_vec_ordered(&self) -> Vec<T> {
        let mut out = Vec::with_capacity(self.len);
        for v in self.iter() {
            out.push(v);
        }
        out
    }
}

pub struct Iter<'a, T: Copy + Default> {
    col: &'a CircularColumn<T>,
    i: usize,
}

impl<'a, T: Copy + Default> Iterator for Iter<'a, T> {
    type Item = T;
    fn next(&mut self) -> Option<Self::Item> {
        if self.i >= self.col.len {
            return None;
        }
        let v = self.col.get(self.i);
        self.i += 1;
        v
    }
}

#[cfg(test)]
mod tests {
    use super::CircularColumn;

    #[test]
    fn ring_overwrite_ordered_iter() {
        let mut c = CircularColumn::<i32>::new(3);
        c.push(1);
        c.push(2);
        c.push(3);
        assert_eq!(c.to_vec_ordered(), vec![1, 2, 3]);
        c.push(4);
        assert_eq!(c.to_vec_ordered(), vec![2, 3, 4]);
        c.push(5);
        assert_eq!(c.to_vec_ordered(), vec![3, 4, 5]);
    }

    #[test]
    fn update_last_updates_most_recent() {
        let mut c = CircularColumn::<i32>::new(2);
        c.push(10);
        c.push(20);
        c.update_last(21);
        assert_eq!(c.to_vec_ordered(), vec![10, 21]);
        c.push(30);
        assert_eq!(c.to_vec_ordered(), vec![21, 30]);
        c.update_last(31);
        assert_eq!(c.to_vec_ordered(), vec![21, 31]);
    }
}

