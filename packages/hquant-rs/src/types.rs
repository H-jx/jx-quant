#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C)]
pub struct Bar {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub buy_volume: f64,
}

impl Bar {
    pub fn new(
        timestamp: i64,
        open: f64,
        high: f64,
        low: f64,
        close: f64,
        volume: f64,
        buy_volume: f64,
    ) -> Self {
        Self {
            timestamp,
            open,
            high,
            low,
            close,
            volume,
            buy_volume,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Field {
    Open = 0,
    High = 1,
    Low = 2,
    Close = 3,
    Volume = 4,
    BuyVolume = 5,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Action {
    Buy = 1,
    Sell = 2,
    Hold = 3,
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C)]
pub struct Signal {
    pub strategy_id: u32,
    pub action: Action,
    pub timestamp: i64,
}

