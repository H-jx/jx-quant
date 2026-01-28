use crate::{circular::CircularColumn, Bar, Field};

/// Columnar (SoA) ring-buffer of OHLCV(+buy_volume) bars.
#[derive(Debug, Clone)]
pub struct KlineBuffer {
    ts: CircularColumn<i64>,
    open: CircularColumn<f64>,
    high: CircularColumn<f64>,
    low: CircularColumn<f64>,
    close: CircularColumn<f64>,
    volume: CircularColumn<f64>,
    buy_volume: CircularColumn<f64>,
}

impl KlineBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            ts: CircularColumn::new(capacity),
            open: CircularColumn::new(capacity),
            high: CircularColumn::new(capacity),
            low: CircularColumn::new(capacity),
            close: CircularColumn::new(capacity),
            volume: CircularColumn::new(capacity),
            buy_volume: CircularColumn::new(capacity),
        }
    }

    #[inline]
    pub fn capacity(&self) -> usize {
        self.close.capacity()
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.close.len()
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    #[inline]
    pub fn push(&mut self, bar: Bar) {
        self.ts.push(bar.timestamp);
        self.open.push(bar.open);
        self.high.push(bar.high);
        self.low.push(bar.low);
        self.close.push(bar.close);
        self.volume.push(bar.volume);
        self.buy_volume.push(bar.buy_volume);
    }

    /// Replaces the last bar and returns the previous last bar (if any).
    #[inline]
    pub fn update_last(&mut self, bar: Bar) -> Option<Bar> {
        let old = self.last();
        self.ts.update_last(bar.timestamp);
        self.open.update_last(bar.open);
        self.high.update_last(bar.high);
        self.low.update_last(bar.low);
        self.close.update_last(bar.close);
        self.volume.update_last(bar.volume);
        self.buy_volume.update_last(bar.buy_volume);
        old
    }

    #[inline]
    pub fn get(&self, i: usize) -> Option<Bar> {
        Some(Bar {
            timestamp: self.ts.get(i)?,
            open: self.open.get(i)?,
            high: self.high.get(i)?,
            low: self.low.get(i)?,
            close: self.close.get(i)?,
            volume: self.volume.get(i)?,
            buy_volume: self.buy_volume.get(i)?,
        })
    }

    #[inline]
    pub fn last(&self) -> Option<Bar> {
        let i = self.len().checked_sub(1)?;
        self.get(i)
    }

    #[inline]
    pub fn get_f64(&self, field: Field, i: usize) -> Option<f64> {
        match field {
            Field::Open => self.open.get(i),
            Field::High => self.high.get(i),
            Field::Low => self.low.get(i),
            Field::Close => self.close.get(i),
            Field::Volume => self.volume.get(i),
            Field::BuyVolume => self.buy_volume.get(i),
        }
    }

    #[inline]
    pub fn last_f64(&self, field: Field) -> Option<f64> {
        let i = self.len().checked_sub(1)?;
        self.get_f64(field, i)
    }

    pub fn close(&self) -> &CircularColumn<f64> {
        &self.close
    }

    pub fn open(&self) -> &CircularColumn<f64> {
        &self.open
    }

    pub fn high(&self) -> &CircularColumn<f64> {
        &self.high
    }

    pub fn low(&self) -> &CircularColumn<f64> {
        &self.low
    }

    pub fn volume(&self) -> &CircularColumn<f64> {
        &self.volume
    }

    pub fn buy_volume(&self) -> &CircularColumn<f64> {
        &self.buy_volume
    }

    pub fn timestamp(&self) -> &CircularColumn<i64> {
        &self.ts
    }
}

#[cfg(test)]
mod tests {
    use super::KlineBuffer;
    use crate::Bar;

    #[test]
    fn push_update_last_roundtrip() {
        let mut kb = KlineBuffer::new(2);
        kb.push(Bar::new(1, 1.0, 2.0, 0.5, 1.5, 10.0, 3.0));
        kb.push(Bar::new(2, 2.0, 3.0, 1.5, 2.5, 11.0, 4.0));
        assert_eq!(kb.len(), 2);
        let old = kb.update_last(Bar::new(2, 20.0, 30.0, 15.0, 25.0, 110.0, 40.0));
        assert_eq!(old.unwrap().close, 2.5);
        assert_eq!(kb.last().unwrap().close, 25.0);
        kb.push(Bar::new(3, 3.0, 4.0, 2.5, 3.5, 12.0, 5.0));
        assert_eq!(kb.len(), 2);
        assert_eq!(kb.get(0).unwrap().timestamp, 2);
        assert_eq!(kb.get(1).unwrap().timestamp, 3);
    }
}

