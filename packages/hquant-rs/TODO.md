
# Quant Runtime / Quant VM / 高性能量化框架：指标、策略、回测

## 目标
构建一个面向实时计算与历史训练的高性能量化指标引擎

## features
- 基础数据不可变：immutable, append-only
- 列式存储 + 循环队列（SoA + RingBuffer）：类似: {close: [1.0,2.0], open: [1.0,2.0]}
- 指标可增量计算、可复用、无重复计算
- Indicator 之间共享计算结果（如 EMA → Boll / MACD）
- 零拷贝 Python 交互：通过 PyO3 + ndarray 零拷贝传递 NumPy 数组
- 跨语言 FFI（Python / Node ）优雅接入: 低成本拷贝传递 NumPy 数组，Nodejs也可得到类列式存储紧凑型（比如{close: Float64Array, open: Float64Array}）
- 支持常见指标：SMA、EMA、RSI、MACD、Boll、平均真实波幅ATR、VRI 量比指标 等（参考TA-Lib）
- 支持Strategy DSL： 根据指标生成信号
- 历史数据回测: 支持导入NumPy、csv，json， 虚拟货币U本位合约回测（模拟爆仓，最高可开金额）
- k线数据周期聚合器：支持15m -> 4h -> 1d

## 数据结构

### CircularColumn<T>
最底层数据结构，仅负责 存储 + 索引，不参与任何金融语义。
固定容量
循环覆盖（ring buffer）
列式（SoA）
内部可变，对外只读视图
不可删除
支持迭代
支持获取最后一个
CircularColumn<T>
- capacity : usize
- len      : usize
- head     : usize
- data     : Vec<T>


### OHLCV 但多了buy_volume
```rust
pub struct Bar {
    pub timestamp: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub buy_volume: f64,
}

```
金融领域的 不可变时间序列输入
KlineBuffer
├── open   : CircularColumn<f64>
├── high   : CircularColumn<f64>
├── low    : CircularColumn<f64>
├── close  : CircularColumn<f64>
├── volume : CircularColumn<f64>
└── buy_volume : CircularColumn<f64>

### Indicator 基础模型
Indicator
- 有内部状态
- 支持update_last(), 更新计算最后一个结果
- 脱离quant也能单独使用

### 基础指标 vs 组合指标
#### 基础指标（Primary Indicator）
EMA
SMA
RSI
StdDev

#### 组合指标（Composite Indicator）
Bollinger Band（依赖 EMA + Std）
MACD（依赖 EMA_fast / EMA_slow / EMA_signal）
组合指标不创建子指标实例，只引用已有实例

#### enbeding

## IndicatorBuffer（核心执行容器）
可增加，可更新指标的最后一个
IndicatorBuffer
├── ema_20  : CircularColumn<f64>
├── rsi_14  : CircularColumn<f64>
├── macd    : CircularColumn<f64>
└── ...
在 add_strategy 中 Indicator 可能需要 DAG实现（自动去重， 自动合并， 跨 Strategy 共享指标）

## FFI 使用

```python

hquant = HQuant(capacity=1000)

rsi = hquant.add_indicator({
    "type": "rsi",
    "period": 14
})

macd = hquant.add_indicator({
    "type": "macd",
    "fast": 12,
    "slow": 26,
    "signal": 9
})

# === 加载历史数据 ===
for bar in history:
    hquant.push_kline({
        "open": bar.open,
        "high": bar.high,
        "low": bar.low,
        "close": bar.close,
        "volume": bar.volume,
        "buy_volume": bar.buy_volume, // 可选
        "ts": 1769603613707
    })
# === 实时更新 ===
hquant.update_last({
    "close": 101.2,
    "volume": 1200,
})

```
## Strategy DSL (看完所有案例后定一个规范)


```text
# 基础指标
ema20 = EMA(close, period=20)           # 返回 EMA 序列

# 可选增量归一化
vector_ema_20 = NORMALIZE(ema20, length=30)  # 返回归一化后的向量，长度为 30

# 相似度计算
SIMILARITY(
    vector_ema_20, // 实际 vector_ema_20 一个是历史标记数据（外部传入）
    vector_ema_20, // 实际 vector_ema_20 是当前的数据
    method="cosine",
) > 0.9

IF RSI(14) < 30 THEN BUY
IF RSI(14) > 70 THEN SELL
```

```python
hquant.add_strategy(f"
  # 用法
  ema20 = EMA(close, period=20)           # 返回 EMA 序列

  # 可选增量归一化
  vector_ema_20 = NORMALIZE(ema20, length=30)  # 返回归一化后的向量，长度为 30

  # 相似度计算
  SIMILARITY(
      vector_ema_20, // 实际 vector_ema_20 一个是历史标记数据（外部传入）
      vector_ema_20, // 实际 vector_ema_20 是当前的数据
      method="cosine",
  ) > 0.9

  IF RSI(14) < 30 THEN BUY() // BUY可以传meta 比如时间
  IF RSI(14) > 70 THEN SELL()
")
```
---

## 向量特征 + 标注命中：统一回测/实盘的设计
核心原则：
- 外部向量在引擎里是一等“时间序列输入”（和 OHLCV 同级），回测/实盘都用同一事件流喂入
- Qdrant 作为“管理/在线服务”，回测用本地只读 snapshot 索引，保证可复现与性能
- 策略输出保持纯动作（BUY/SELL），命中详情走旁路 meta（便于调试与回放）

### VectorStore 把外部向量当成输入数据源 并且向量相似度对比
```python
lables = [
  {
    label: 1,
    vector: [1,1,2,1... 1] // 假设是30个
  }
]
hquant.locadStore("4h_BTC", lables)

hquant.add_strategy("vector_strategy", f"
  vector_4h = VEC_STORE("4h_BTC")
  close_vector = NORMALIZE(close, length=30)
  hit = SIMILARITY(vector_4h, close_vector)
  IF hit.label == 1 THEN BUY(META(ts=hit.ts))
  IF hit.label == -1 THEN SELL(META(ts=hit.ts))
")

for bar in history:
    hquant.push_kline({
        "open": bar.open,
        "high": bar.high,
        "low": bar.low,
        "close": bar.close,
        "volume": bar.volume,
        "buy_volume": bar.buy_volume, // 可选
        "ts": 1769603613707
    })
    signals = engine.pollSignals()
    for s in signals
      handle(s) // ->  {"action": "SELL", "meta": {ts: 1769603613707}}
   
```
## 聚合器
### merge 规则
open        = first bar.open
high        = max(all highs)
low         = min(all lows)
close       = last bar.close
volume      += bar.volume
buy_volume  += bar.buy_volume

```rust
struct AggregateCandle {
    open_time: i64,
    close_time: i64, // 根据open_time + period 计算出  close_time
    open: f64,
    high: f64,
    low: f64,
    close: f64,
    volume: f64,
    buy_volume: f64,
    last_update_ts: i64,
}
```

```javascript
const hquant_15m = HQuant(capacity=1000)
const hquant_4h = HQuant(capacity=1000)
const aggregator = new Aggregator()

for bar in history:
  aggregator.pushKline({
    open_time: 1700000000000,
    open: 100,
    high: 110,
    low: 95.1,
    close: 108.1,
    volume: 1234.1,
    buy_volume: 1234.1,
  })
aggregator.flush() // 强制结束所有周期
const events = aggregator.pollEvents()

for (const ev of events) {
  if (ev.kind === "KlineClosed" && ev.period === "15m") {
     hquant_15m.push_kline(ev.candle)
  }
  if (ev.kind === "KlineClosed" && ev.period === "4h") {
     hquant_4h.push_kline(ev.candle)
  }
}
```


```javascript
const hquant_15m = HQuant({capacity: 1000})
const hquant_4h = HQuant({capacity: 1000})
const aggregator = new Aggregator()
aggregator.pushKline({
  open_time: 1700000000000,
  open: 100,
  high: 110,
  low: 95.1,
  close: 108.1,
  volume: 1234.1,
  buy_volume: 1234.1,
})

const events = aggregator.pollEvents()

for (const ev of events) {
  if (ev.kind === "KlineClosed" && ev.period === "15m") {
     hquant_15m.push_kline(ev.candle)
  }
  if (ev.kind === "KlineClosed" && ev.period === "4h") {
     hquant_4h.push_kline(ev.candle)
  }
}
```


```javascript
// node ffi 多周期使用（该示例是贴近生产的用法）
const { Backtest, HQuant } = requie("./hquant.node")
const hquant_multi_period = HQuant({
  capacity: 1000
  period: ["15m", "4h", "1d"]
})
const bt = new Backtest({
  initial_margin: 1000,
  leverage: 10,
  contract_size: 1,
  "maker_fee_rate": 0.00044,
  "taker_fee_rate": 0.00044,
})
hquant_multi_period.add_strategy("multi_period_vector_strategy", `
  vector_4h = VEC_STORE("4h_BTC")
  vector_15m = VEC_STORE("15m_BTC")
  close_vector_4h = NORMALIZE(close@4h, length=30)
  close_vector_15m = NORMALIZE(close@15m, length=30)
  hit_4h = SIMILARITY(vector_4h, close_vector)
  hit_15m = SIMILARITY(vector_15m, close_vector)
  IF hit_4h AND hit_15m AND hit_4h.label == 1 AND hit_15m.label == 1   
    THEN BUY(META(ts=hit.ts))
  IF hit AND hit.label == -1 
    THEN SELL(META(ts=hit.ts))
`)
// 真实数据流
// ws.on("kline", (k) => {
//   hquant_multi_period.feed_kline(k) // 原始数据流，内部会触发多周期聚合器判断周期闭合
//   const events = hquant_multi_period.pollSignals()
//   for (const s of signals) {
//     handle(s)
//   }
// })

// 回测
for (const bar of history) {
  hquant_multi_period.push_kline(bar)
  const events = hquant_multi_period.pollSignals()
  for (const s of signals) {
    if (s.acton === "BUY") {
      bt.open_long(k.close, 100)
      bt.sell_short(k.close, 100)
    } else if (s.acton === "SELL") {
      bt.buy_short(k.close, 100)
      bt.sell_long(k.close, 100)
    }
  }
}
// 回撤
bt.backtest_result() // 如果爆仓，需要告知爆仓的节点
```


## ffi
rust不必写测试，都由nodejs、python封装后测试

python二次封装：packages/hquant-py （空目录）
nodejs二次封装： packages/hquant-js (已初始化package.json)

## Progress (implemented)
- `packages/hquant-rs`: SoA ring buffer + indicators (SMA/EMA/RSI/StdDev + Boll/MACD) + HQuant engine + FuturesBacktest + C ABI
- Multi-period: `period.rs` + `aggregator.rs` + `multi.rs` (cross-period strategy support via `close@4h` etc)
- Node N-API addon: `packages/hquant-node` (napi-rs, external ArrayBuffer for zero-copy column view)
- Python: `packages/hquant-pyo3` (PyO3 + numpy zero-copy view) and `packages/hquant-py` (ctypes fallback)
