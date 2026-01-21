# Quant Trading Platform – Unified Architecture Design

> 角色视角：  
> - 资深系统工程师（稳定性 / 可维护性 / 可演进）  
> - 专业量化交易员（回测一致性 / 风控前置 / 组合视角）  

---

## 1. 核心设计哲学（非常重要）

### 1.1 分层，而不是分语言

语言只是工具，真正的分层是：

- **决策层（Decision Layer）**
1. 生成信号
2. 策略执行
- **执行层（Execution Layer）**
1. 下单系统
- **用户管理**
1. 用户决定对什么币种使用什么策略，做合约/现货
2. 管理量化的配置
3. 交易记录
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

├── apps/                    # 可部署单元
│   ├── strategy-engine/     # 决策层服务（Python）
│   ├── trading-engine/      # 交易服务（Node.js）
│   ├── user-service/        # 用户 & 配置管理（Node.js）
│   └── admin-service/       # 管理后台（Node.js）
│
├── packages/                # 共享能力（强约束）
│   ├── contracts/           # 核心数据结构 & 协议
│   │   ├── proto/           # 唯一真源
│   │   │   ├── signal.proto
│   │   │   ├── order.proto
│   │   │   ├── position.proto
│   │   │   ├── account.proto
│   │   │   └── risk.proto
│   │   ├── generated/        # 不可编辑由gen.sh生成
│   │   │   ├── ts/
│   │   │   ├── python/
│   │   │   ├── rust/
│   │   │   └── go/
│   │   └── gen.sh           # proto生成类型(ts-proto、ts-proto、prost-types)
│   ├── risk-engine/         # 风控规则（前置）(nodejs)
│   ├── hquant-py/           # 组合 & 仓位模型
│   └── hquant-rust/         # 指标库（纯函数）
│
├── infra/                   # 基础设施
│   ├── exchange-adapters/   # 各交易所适配
│   ├── message-bus/         # NATS(已有不用实现)
│   └── storage/             # DB / Object Storage(已有不用实现)
├── logs/
│   ├── strategy.log  
│   ├── strategy.err  
│   ├── trading.log  
│   ├── trading.err  
│   ├── user.log  
│   ├── user.err  
│   └── admin.log
│   └── admin.err
└── docs/

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
