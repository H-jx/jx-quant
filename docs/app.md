# Quant Trading Platform – Unified Architecture Design

> 角色视角：  
> - 资深系统工程师（稳定性 / 可维护性 / 可演进）  
> - 专业量化交易员（回测一致性 / 风控前置 / 组合视角）  

---

## 1. 核心设计哲学（非常重要）

### 1.1 分层，而不是分语言

语言只是工具，真正的分层是：

- **决策层（Decision Layer）**
- **执行层（Execution Layer）**

Python / Node.js 只是对这两个层的最优匹配。

---

### 1.2 三条铁律

1. **信号 ≠ 订单**
2. **策略永远不直接操作仓位**
3. **风控必须在下单之前、而不是之后**

---

### 1.3 一个残酷但现实的事实

> 99% 的量化系统亏钱  
> 不是因为策略不好  
> 而是 **执行、风控、状态不一致**

---

## 2. 单仓（Monorepo）结构

├── docs/
│ ├── architecture.md
│ ├── signal-spec.md
│ └── risk-spec.md
│
├── decision-python/
│ ├── engine/
│ ├── models/
│ ├── signals/
│ ├── risk/
│ ├── backtest/
│ └── api/
│
├── execution-node/
│ ├── core/
│ ├── signal/
│ ├── risk/
│ ├── execution/
│ └── exchange/
│
└── shared/
├── schemas/
└── enums/



---

## 3. 决策系统（Python）

> 职责：**决定“是否值得交易”**  
> 不知道账户、不关心交易所

---

## 3.1 Python 系统真正的输入与输出

### 输入

- 标准化 K 线
- 可选：成交统计、深度摘要
- 可选：影子仓位（只读）

### 3.2 Signal 是“意图”，不是“动作” 

```python
TradeSignal(
  symbol="BTCUSDT",
  side="LONG" | "SHORT" | "FLAT",
  model_id="alpha_001",
  timestamp=...
)
```
