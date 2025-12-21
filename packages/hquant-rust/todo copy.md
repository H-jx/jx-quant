

帮我设计一个方案，存markdown输出。量化交易、信号机制、高并发、指标库（Indicators）、 
**实时更新能力**：支持对最后一个周期的更新（`update_last_bar`）。limit order book、量化需要用到的math、K-Nearest Neighbors。logger，错误处理。**周期聚合**：内置 
5m、15m、4h、1d 聚合策略；提供从任意 timestamp 计算窗口起止（比如 `period_bounds(period: Period, ts: i64)`），并支持从更细粒度数据上滚动汇总。 
回测（现货+虚拟货币中的U本位合约，参考https://www.binance.com/zh-CN/support/faq/detail/360033162192）
参考：
1. https://github.com/avhz/RustQuant?tab=readme-ov-file
2. https://github.com/barter-rs/barter-rs
其他建议：
ai agent补充