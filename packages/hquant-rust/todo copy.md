


0. 设计目标
基于rust构建一个 高并发、可回测、可实时运行、可扩展 的量化交易核心系统，满足以下关键能力：

多周期行情聚合与实时更新（update_last_bar）

支持提供给 nodejs、python语言使用且 根据不同语言情况 支持高性能通信


// 核心架构模块
mod aggregator;     // 将 5m K线聚合为 15m, 4h, 1d 周期、订单簿（Limit Order Book）
mod indicators;     // 技术指标库
mod strategies;     // 交易策略与信号
mod execution;      // 订单执行引擎
mod backtest;       // 回测引擎（现货 + U 本位合约）
mod risk;           // 风险管理
mod math;           // 数学工具(均值、方差)
mod ml;             // (形态与状态相似度)
mod logger;         // 日志系统
mod error;          // 错误处理
mod time;           // 时间周期聚合
mod config;         // 配置管理

// 高性能
异步与非阻塞设计

// 多语言高性通信（）
┌────────────┐     napi-rs      ┌──────────────┐
│  Node.js   │ ──────────────▶ │              │
│            │                 │              │
└────────────┘                 │              │
                               │  Rust Core   │
┌────────────┐     PyO3        │              │
│  Python    │ ──────────────▶ │              │
│            │                 │              │
└────────────┘                 └──────────────┘


pub struct BarSeries {
    pub open: Vec<f64>,
    pub close: Vec<f64>,
    pub high: Vec<f64>,
    pub low: Vec<f64>,

    pub volume: Vec<f64>,
    pub buy_volume: Vec<f64>,

    pub timestamp: Vec<i64>,
}

参考：
1. https://github.com/avhz/RustQuant?tab=readme-ov-file
2. https://github.com/barter-rs/barter-rs
3. https://www.binance.com/zh-CN/support/faq/detail/360033162192（现货+虚拟货币中的U本位合约，参考）
