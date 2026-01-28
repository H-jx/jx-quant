use crate::Action;

#[derive(Debug, Clone, Copy)]
#[repr(C)]
pub struct BacktestParams {
    pub initial_margin: f64,
    pub leverage: f64,
    pub contract_size: f64,
    pub maker_fee_rate: f64,
    pub taker_fee_rate: f64,
    pub maintenance_margin_rate: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Long,
    Short,
}

#[derive(Debug, Clone, Copy)]
pub struct Position {
    pub side: Side,
    pub entry_price: f64,
    pub qty: f64,
    pub margin: f64,
}

#[derive(Debug)]
pub struct FuturesBacktest {
    params: BacktestParams,
    cash: f64,
    pos_long: Option<Position>,
    pos_short: Option<Position>,
    max_equity: f64,
    max_drawdown: f64, // negative
    liquidated: bool,
}

#[derive(Debug, Clone, Copy)]
#[repr(C)]
pub struct BacktestResult {
    pub equity: f64,
    pub profit: f64,
    pub profit_rate: f64,
    pub max_drawdown_rate: f64,
    pub liquidated: bool,
}

impl FuturesBacktest {
    pub fn new(params: BacktestParams) -> Self {
        assert!(params.initial_margin > 0.0);
        assert!(params.leverage >= 1.0);
        assert!(params.contract_size > 0.0);
        assert!(params.maintenance_margin_rate >= 0.0);
        Self {
            cash: params.initial_margin,
            max_equity: params.initial_margin,
            max_drawdown: 0.0,
            params,
            pos_long: None,
            pos_short: None,
            liquidated: false,
        }
    }

    pub fn cash(&self) -> f64 {
        self.cash
    }

    pub fn liquidated(&self) -> bool {
        self.liquidated
    }

    pub fn open_long(&mut self, price: f64, margin: f64) {
        self.open(Side::Long, price, margin, self.params.taker_fee_rate);
    }

    pub fn open_short(&mut self, price: f64, margin: f64) {
        self.open(Side::Short, price, margin, self.params.taker_fee_rate);
    }

    pub fn close_long(&mut self, price: f64) {
        self.close(Side::Long, price, self.params.maker_fee_rate);
    }

    pub fn close_short(&mut self, price: f64) {
        self.close(Side::Short, price, self.params.maker_fee_rate);
    }

    pub fn max_open_margin(&self, fee_rate: f64) -> f64 {
        // margin + fee <= cash; fee = margin*leverage*fee_rate
        // => margin <= cash / (1 + leverage*fee_rate)
        let denom = 1.0 + self.params.leverage * fee_rate;
        if denom <= 0.0 {
            return 0.0;
        }
        (self.cash / denom).max(0.0)
    }

    fn open(&mut self, side: Side, price: f64, margin: f64, fee_rate: f64) {
        if self.liquidated || margin <= 0.0 || price <= 0.0 {
            return;
        }
        if self.cash < margin {
            return;
        }

        let margin = margin.min(self.max_open_margin(fee_rate));
        if margin <= 0.0 {
            return;
        }

        let notional = margin * self.params.leverage;
        let qty = (notional / price) * self.params.contract_size;
        let fee = notional * fee_rate;
        if self.cash < margin + fee {
            return;
        }
        self.cash -= margin + fee;

        let pos_opt = match side {
            Side::Long => &mut self.pos_long,
            Side::Short => &mut self.pos_short,
        };

        // Merge into an existing position (weighted average entry).
        if let Some(mut p) = *pos_opt {
            let new_qty = p.qty + qty;
            if new_qty > 0.0 {
                p.entry_price = (p.entry_price * p.qty + price * qty) / new_qty;
            }
            p.qty = new_qty;
            p.margin += margin;
            *pos_opt = Some(p);
        } else {
            *pos_opt = Some(Position {
                side,
                entry_price: price,
                qty,
                margin,
            });
        }
    }

    fn close(&mut self, side: Side, price: f64, fee_rate: f64) {
        if self.liquidated || price <= 0.0 {
            return;
        }
        let pos_opt = match side {
            Side::Long => &mut self.pos_long,
            Side::Short => &mut self.pos_short,
        };
        let pos = match pos_opt.take() {
            Some(p) => p,
            None => return,
        };
        let notional = (pos.qty / self.params.contract_size) * price;
        let pnl = match side {
            Side::Long => (price - pos.entry_price) * pos.qty,
            Side::Short => (pos.entry_price - price) * pos.qty,
        };
        let fee = notional * fee_rate;
        self.cash += pos.margin + pnl - fee;
    }

    pub fn on_price(&mut self, price: f64) {
        if self.liquidated || price <= 0.0 {
            return;
        }
        let equity = self.equity(price);

        if equity > self.max_equity {
            self.max_equity = equity;
        }
        let dd = (equity - self.max_equity) / self.max_equity;
        if dd < self.max_drawdown {
            self.max_drawdown = dd;
        }

        let maint = self.maintenance_margin(price);
        if equity <= maint {
            self.liquidated = true;
            self.pos_long = None;
            self.pos_short = None;
            self.cash = 0.0;
        }
    }

    pub fn apply_signal(&mut self, action: Action, price: f64, margin: f64) {
        match action {
            Action::Buy => {
                self.close_short(price);
                self.open_long(price, margin);
            }
            Action::Sell => {
                self.close_long(price);
                self.open_short(price, margin);
            }
            Action::Hold => {}
        }
        self.on_price(price);
    }

    pub fn equity(&self, price: f64) -> f64 {
        let mut eq = self.cash + self.locked_margin();
        if let Some(p) = self.pos_long {
            eq += (price - p.entry_price) * p.qty;
        }
        if let Some(p) = self.pos_short {
            eq += (p.entry_price - price) * p.qty;
        }
        eq
    }

    pub fn locked_margin(&self) -> f64 {
        self.pos_long.map(|p| p.margin).unwrap_or(0.0) + self.pos_short.map(|p| p.margin).unwrap_or(0.0)
    }

    pub fn total_notional(&self, price: f64) -> f64 {
        let mut n = 0.0;
        if let Some(p) = self.pos_long {
            n += (p.qty / self.params.contract_size) * price;
        }
        if let Some(p) = self.pos_short {
            n += (p.qty / self.params.contract_size) * price;
        }
        n
    }

    pub fn maintenance_margin(&self, price: f64) -> f64 {
        self.total_notional(price) * self.params.maintenance_margin_rate
    }

    pub fn result(&self, price: f64) -> BacktestResult {
        let eq = self.equity(price);
        BacktestResult {
            equity: eq,
            profit: eq - self.params.initial_margin,
            profit_rate: (eq - self.params.initial_margin) / self.params.initial_margin,
            max_drawdown_rate: self.max_drawdown,
            liquidated: self.liquidated,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Action;

    #[test]
    fn backtest_smoke() {
        let mut bt = FuturesBacktest::new(BacktestParams {
            initial_margin: 1000.0,
            leverage: 10.0,
            contract_size: 1.0,
            maker_fee_rate: 0.0004,
            taker_fee_rate: 0.0004,
            maintenance_margin_rate: 0.005,
        });
        bt.apply_signal(Action::Buy, 100.0, 100.0);
        bt.on_price(110.0);
        bt.apply_signal(Action::Sell, 110.0, 100.0);
        let r = bt.result(110.0);
        assert!(r.equity.is_finite());
    }
}
