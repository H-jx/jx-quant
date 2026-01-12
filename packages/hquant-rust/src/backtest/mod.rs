/// 回测引擎
/// 支持现货和合约回测，包含手续费、滑点、爆仓模拟

use crate::kline::Bar;
use crate::strategy::{Signal, Side};

/// 交易类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarketType {
    Spot,     // 现货
    Futures,  // 合约
}

/// 持仓方向
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PositionSide {
    Long,
    Short,
}

/// 持仓信息
#[derive(Debug, Clone)]
pub struct Position {
    pub side: PositionSide,
    pub size: f64,           // 持仓数量
    pub entry_price: f64,    // 开仓均价
    pub leverage: f64,       // 杠杆倍数（现货为1）
    pub liquidation_price: f64, // 爆仓价格
    pub unrealized_pnl: f64, // 未实现盈亏
    pub timestamp: i64,
}

impl Position {
    pub fn new(side: PositionSide, size: f64, entry_price: f64, leverage: f64) -> Self {
        let liquidation_price = Self::calc_liquidation_price(side, entry_price, leverage);
        Self {
            side,
            size,
            entry_price,
            leverage,
            liquidation_price,
            unrealized_pnl: 0.0,
            timestamp: 0,
        }
    }

    fn calc_liquidation_price(side: PositionSide, entry_price: f64, leverage: f64) -> f64 {
        if leverage <= 1.0 {
            return 0.0; // 现货无爆仓
        }
        // 简化的爆仓价格计算（假设维持保证金率为0.5%）
        let maintenance_margin_rate = 0.005;
        let margin_ratio = 1.0 / leverage;

        match side {
            PositionSide::Long => {
                entry_price * (1.0 - margin_ratio + maintenance_margin_rate)
            }
            PositionSide::Short => {
                entry_price * (1.0 + margin_ratio - maintenance_margin_rate)
            }
        }
    }

    /// 更新未实现盈亏
    pub fn update_pnl(&mut self, current_price: f64) {
        let price_diff = current_price - self.entry_price;
        self.unrealized_pnl = match self.side {
            PositionSide::Long => price_diff * self.size,
            PositionSide::Short => -price_diff * self.size,
        };
    }

    /// 检查是否爆仓
    pub fn is_liquidated(&self, current_price: f64) -> bool {
        if self.leverage <= 1.0 {
            return false;
        }
        match self.side {
            PositionSide::Long => current_price <= self.liquidation_price,
            PositionSide::Short => current_price >= self.liquidation_price,
        }
    }
}

/// 交易记录
#[derive(Debug, Clone)]
pub struct Trade {
    pub timestamp: i64,
    pub side: Side,
    pub price: f64,
    pub size: f64,
    pub fee: f64,
    pub pnl: f64,  // 已实现盈亏
}

/// 回测配置
#[derive(Debug, Clone)]
pub struct BacktestConfig {
    pub market_type: MarketType,
    pub initial_capital: f64,
    pub leverage: f64,           // 合约杠杆
    pub maker_fee: f64,          // 挂单手续费率
    pub taker_fee: f64,          // 吃单手续费率
    pub slippage: f64,           // 滑点率
    pub position_size_pct: f64,  // 每次开仓占总资金比例
}

impl Default for BacktestConfig {
    fn default() -> Self {
        Self {
            market_type: MarketType::Spot,
            initial_capital: 10000.0,
            leverage: 1.0,
            maker_fee: 0.001,  // 0.1%
            taker_fee: 0.001,  // 0.1%
            slippage: 0.0005,  // 0.05%
            position_size_pct: 0.1, // 10%
        }
    }
}

impl BacktestConfig {
    pub fn spot(initial_capital: f64) -> Self {
        Self {
            initial_capital,
            ..Default::default()
        }
    }

    pub fn futures(initial_capital: f64, leverage: f64) -> Self {
        Self {
            market_type: MarketType::Futures,
            initial_capital,
            leverage,
            ..Default::default()
        }
    }
}

/// 回测统计
#[derive(Debug, Clone, Default)]
pub struct BacktestStats {
    pub total_trades: usize,
    pub winning_trades: usize,
    pub losing_trades: usize,
    pub total_pnl: f64,
    pub max_drawdown: f64,
    pub max_drawdown_pct: f64,
    pub sharpe_ratio: f64,
    pub win_rate: f64,
    pub profit_factor: f64,
    pub final_equity: f64,
    pub return_pct: f64,
    pub liquidations: usize,
}

impl BacktestStats {
    pub fn calculate(&mut self, initial_capital: f64, equity_curve: &[f64]) {
        if self.total_trades > 0 {
            self.win_rate = self.winning_trades as f64 / self.total_trades as f64;
        }

        self.final_equity = *equity_curve.last().unwrap_or(&initial_capital);
        self.return_pct = (self.final_equity - initial_capital) / initial_capital * 100.0;

        // 计算最大回撤
        let mut peak = initial_capital;
        for &equity in equity_curve {
            if equity > peak {
                peak = equity;
            }
            let drawdown = peak - equity;
            let drawdown_pct = drawdown / peak;
            if drawdown > self.max_drawdown {
                self.max_drawdown = drawdown;
                self.max_drawdown_pct = drawdown_pct * 100.0;
            }
        }

        // 简化的 Sharpe Ratio 计算
        if equity_curve.len() > 1 {
            let returns: Vec<f64> = equity_curve
                .windows(2)
                .map(|w| (w[1] - w[0]) / w[0])
                .collect();

            let mean_return = returns.iter().sum::<f64>() / returns.len() as f64;
            let variance = returns.iter().map(|r| (r - mean_return).powi(2)).sum::<f64>()
                / returns.len() as f64;
            let std_dev = variance.sqrt();

            if std_dev > 0.0 {
                // 年化（假设日频数据）
                self.sharpe_ratio = mean_return / std_dev * (252.0_f64).sqrt();
            }
        }
    }
}

/// 回测引擎
pub struct BacktestEngine {
    config: BacktestConfig,
    equity: f64,
    position: Option<Position>,
    trades: Vec<Trade>,
    equity_curve: Vec<f64>,
    stats: BacktestStats,
}

impl BacktestEngine {
    pub fn new(config: BacktestConfig) -> Self {
        let equity = config.initial_capital;
        Self {
            config,
            equity,
            position: None,
            trades: Vec::new(),
            equity_curve: vec![equity],
            stats: BacktestStats::default(),
        }
    }

    /// 处理信号
    pub fn process_signal(&mut self, signal: &Signal, bar: &Bar) {
        // 先检查爆仓
        if let Some(pos) = &self.position {
            if pos.is_liquidated(bar.low) {
                self.liquidate(bar);
                return;
            }
        }

        match signal.side {
            Side::Buy => self.handle_buy(bar),
            Side::Sell => self.handle_sell(bar),
            Side::Hold => {}
        }

        // 更新权益
        self.update_equity(bar.close);
    }

    fn handle_buy(&mut self, bar: &Bar) {
        let price = self.apply_slippage(bar.close, true);

        match &self.position {
            None => {
                // 开多仓
                let size = self.calculate_position_size(price);
                if size > 0.0 {
                    let fee = self.calculate_fee(price * size);
                    self.equity -= fee;

                    self.position = Some(Position::new(
                        PositionSide::Long,
                        size,
                        price,
                        self.config.leverage,
                    ));

                    self.trades.push(Trade {
                        timestamp: bar.timestamp,
                        side: Side::Buy,
                        price,
                        size,
                        fee,
                        pnl: 0.0,
                    });
                }
            }
            Some(pos) if pos.side == PositionSide::Short => {
                // 平空仓
                self.close_position(bar, price);
            }
            _ => {}
        }
    }

    fn handle_sell(&mut self, bar: &Bar) {
        let price = self.apply_slippage(bar.close, false);

        match &self.position {
            None => {
                // 合约可以开空仓
                if self.config.market_type == MarketType::Futures {
                    let size = self.calculate_position_size(price);
                    if size > 0.0 {
                        let fee = self.calculate_fee(price * size);
                        self.equity -= fee;

                        self.position = Some(Position::new(
                            PositionSide::Short,
                            size,
                            price,
                            self.config.leverage,
                        ));

                        self.trades.push(Trade {
                            timestamp: bar.timestamp,
                            side: Side::Sell,
                            price,
                            size,
                            fee,
                            pnl: 0.0,
                        });
                    }
                }
            }
            Some(pos) if pos.side == PositionSide::Long => {
                // 平多仓
                self.close_position(bar, price);
            }
            _ => {}
        }
    }

    fn close_position(&mut self, bar: &Bar, price: f64) {
        if let Some(pos) = self.position.take() {
            let pnl = match pos.side {
                PositionSide::Long => (price - pos.entry_price) * pos.size * pos.leverage,
                PositionSide::Short => (pos.entry_price - price) * pos.size * pos.leverage,
            };

            let fee = self.calculate_fee(price * pos.size);
            let net_pnl = pnl - fee;

            self.equity += net_pnl;
            self.stats.total_pnl += net_pnl;

            if net_pnl > 0.0 {
                self.stats.winning_trades += 1;
            } else {
                self.stats.losing_trades += 1;
            }

            self.trades.push(Trade {
                timestamp: bar.timestamp,
                side: if pos.side == PositionSide::Long { Side::Sell } else { Side::Buy },
                price,
                size: pos.size,
                fee,
                pnl: net_pnl,
            });

            self.stats.total_trades += 1;
        }
    }

    fn liquidate(&mut self, bar: &Bar) {
        if let Some(pos) = self.position.take() {
            // 爆仓：损失全部保证金
            let margin = pos.entry_price * pos.size / pos.leverage;
            self.equity -= margin;
            self.stats.liquidations += 1;
            self.stats.total_trades += 1;
            self.stats.losing_trades += 1;

            self.trades.push(Trade {
                timestamp: bar.timestamp,
                side: if pos.side == PositionSide::Long { Side::Sell } else { Side::Buy },
                price: pos.liquidation_price,
                size: pos.size,
                fee: 0.0,
                pnl: -margin,
            });
        }
    }

    fn calculate_position_size(&self, price: f64) -> f64 {
        let available = self.equity * self.config.position_size_pct;
        let size = available * self.config.leverage / price;
        size.max(0.0)
    }

    fn calculate_fee(&self, notional: f64) -> f64 {
        notional * self.config.taker_fee
    }

    fn apply_slippage(&self, price: f64, is_buy: bool) -> f64 {
        if is_buy {
            price * (1.0 + self.config.slippage)
        } else {
            price * (1.0 - self.config.slippage)
        }
    }

    fn update_equity(&mut self, current_price: f64) {
        let mut equity = self.equity;

        if let Some(pos) = &mut self.position {
            pos.update_pnl(current_price);
            equity += pos.unrealized_pnl;
        }

        self.equity_curve.push(equity);
    }

    /// 获取回测结果
    pub fn result(&mut self) -> &BacktestStats {
        self.stats.calculate(self.config.initial_capital, &self.equity_curve);
        &self.stats
    }

    /// 获取交易记录
    pub fn trades(&self) -> &[Trade] {
        &self.trades
    }

    /// 获取权益曲线
    pub fn equity_curve(&self) -> &[f64] {
        &self.equity_curve
    }

    /// 获取当前持仓
    pub fn position(&self) -> Option<&Position> {
        self.position.as_ref()
    }

    /// 获取当前权益
    pub fn equity(&self) -> f64 {
        self.equity
    }

    /// 重置引擎
    pub fn reset(&mut self) {
        self.equity = self.config.initial_capital;
        self.position = None;
        self.trades.clear();
        self.equity_curve = vec![self.equity];
        self.stats = BacktestStats::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_bars(prices: &[(f64, f64, f64, f64)]) -> Vec<Bar> {
        prices
            .iter()
            .enumerate()
            .map(|(i, &(o, h, l, c))| Bar::new(i as i64 * 1000, o, h, l, c, 1000.0))
            .collect()
    }

    #[test]
    fn test_spot_backtest() {
        let config = BacktestConfig::spot(10000.0);
        let mut engine = BacktestEngine::new(config);

        let bars = create_bars(&[
            (100.0, 105.0, 99.0, 104.0),
            (104.0, 110.0, 103.0, 109.0),
            (109.0, 112.0, 108.0, 111.0),
        ]);

        // 买入信号
        let buy_signal = Signal::buy(1.0, "test", bars[0].timestamp);
        engine.process_signal(&buy_signal, &bars[0]);

        assert!(engine.position().is_some());
        assert_eq!(engine.position().unwrap().side, PositionSide::Long);

        // 价格上涨
        engine.process_signal(&Signal::hold(bars[1].timestamp), &bars[1]);

        // 卖出信号
        let sell_signal = Signal::sell(1.0, "test", bars[2].timestamp);
        engine.process_signal(&sell_signal, &bars[2]);

        assert!(engine.position().is_none());

        let stats = engine.result();
        assert_eq!(stats.total_trades, 1);
        assert!(stats.total_pnl > 0.0); // 应该盈利
    }

    #[test]
    fn test_futures_long() {
        let config = BacktestConfig::futures(10000.0, 10.0);
        let mut engine = BacktestEngine::new(config);

        let bars = create_bars(&[
            (100.0, 105.0, 99.0, 104.0),
            (104.0, 110.0, 103.0, 109.0),
        ]);

        let buy_signal = Signal::buy(1.0, "test", bars[0].timestamp);
        engine.process_signal(&buy_signal, &bars[0]);

        let pos = engine.position().unwrap();
        assert_eq!(pos.leverage, 10.0);
        assert!(pos.liquidation_price > 0.0);

        let sell_signal = Signal::sell(1.0, "test", bars[1].timestamp);
        engine.process_signal(&sell_signal, &bars[1]);

        let stats = engine.result();
        assert!(stats.total_pnl > 0.0);
    }

    #[test]
    fn test_futures_short() {
        let config = BacktestConfig::futures(10000.0, 5.0);
        let mut engine = BacktestEngine::new(config);

        let bars = create_bars(&[
            (100.0, 105.0, 99.0, 104.0),
            (104.0, 106.0, 95.0, 96.0), // 价格下跌
        ]);

        // 开空
        let sell_signal = Signal::sell(1.0, "test", bars[0].timestamp);
        engine.process_signal(&sell_signal, &bars[0]);

        let pos = engine.position().unwrap();
        assert_eq!(pos.side, PositionSide::Short);

        // 平空
        let buy_signal = Signal::buy(1.0, "test", bars[1].timestamp);
        engine.process_signal(&buy_signal, &bars[1]);

        let stats = engine.result();
        assert!(stats.total_pnl > 0.0); // 做空盈利
    }

    #[test]
    fn test_liquidation() {
        let config = BacktestConfig::futures(10000.0, 20.0); // 高杠杆
        let mut engine = BacktestEngine::new(config);

        let bars = create_bars(&[
            (100.0, 105.0, 99.0, 104.0),
            (104.0, 105.0, 80.0, 82.0), // 大幅下跌触发爆仓
        ]);

        let buy_signal = Signal::buy(1.0, "test", bars[0].timestamp);
        engine.process_signal(&buy_signal, &bars[0]);

        // 价格暴跌
        engine.process_signal(&Signal::hold(bars[1].timestamp), &bars[1]);

        let stats = engine.result();
        assert_eq!(stats.liquidations, 1);
        assert!(engine.position().is_none());
    }

    #[test]
    fn test_max_drawdown() {
        let config = BacktestConfig::spot(10000.0);
        let mut engine = BacktestEngine::new(config);

        let bars = create_bars(&[
            (100.0, 110.0, 99.0, 108.0),  // 上涨
            (108.0, 112.0, 107.0, 111.0), // 继续涨
            (111.0, 112.0, 95.0, 96.0),   // 大跌
            (96.0, 100.0, 95.0, 99.0),    // 小涨
        ]);

        engine.process_signal(&Signal::buy(1.0, "test", bars[0].timestamp), &bars[0]);
        engine.process_signal(&Signal::hold(bars[1].timestamp), &bars[1]);
        engine.process_signal(&Signal::hold(bars[2].timestamp), &bars[2]);
        engine.process_signal(&Signal::sell(1.0, "test", bars[3].timestamp), &bars[3]);

        let stats = engine.result();
        assert!(stats.max_drawdown > 0.0);
        assert!(stats.max_drawdown_pct > 0.0);
    }

    #[test]
    fn test_position_liquidation_price() {
        // 多仓爆仓价
        let long_pos = Position::new(PositionSide::Long, 1.0, 100.0, 10.0);
        assert!(long_pos.liquidation_price < 100.0);
        assert!(long_pos.liquidation_price > 0.0);

        // 空仓爆仓价
        let short_pos = Position::new(PositionSide::Short, 1.0, 100.0, 10.0);
        assert!(short_pos.liquidation_price > 100.0);

        // 现货无爆仓
        let spot_pos = Position::new(PositionSide::Long, 1.0, 100.0, 1.0);
        assert_eq!(spot_pos.liquidation_price, 0.0);
    }

    #[test]
    fn test_win_rate() {
        let config = BacktestConfig::spot(10000.0);
        let mut engine = BacktestEngine::new(config);

        // 两笔盈利交易
        let bars1 = create_bars(&[(100.0, 105.0, 99.0, 104.0), (104.0, 110.0, 103.0, 109.0)]);
        engine.process_signal(&Signal::buy(1.0, "test", bars1[0].timestamp), &bars1[0]);
        engine.process_signal(&Signal::sell(1.0, "test", bars1[1].timestamp), &bars1[1]);

        // 一笔亏损交易
        let bars2 = create_bars(&[(109.0, 110.0, 108.0, 109.0), (109.0, 110.0, 100.0, 101.0)]);
        engine.process_signal(&Signal::buy(1.0, "test", bars2[0].timestamp), &bars2[0]);
        engine.process_signal(&Signal::sell(1.0, "test", bars2[1].timestamp), &bars2[1]);

        let stats = engine.result();
        assert_eq!(stats.total_trades, 2);
        assert_eq!(stats.winning_trades, 1);
        assert_eq!(stats.losing_trades, 1);
        assert!((stats.win_rate - 0.5).abs() < 0.01);
    }
}
