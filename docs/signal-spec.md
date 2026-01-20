
## 3.4 模型系统设计（重点）
模型不是策略
模型输出的是 市场观点（Market View）
## 模型统一输出格式
ModelOutput(
  direction: LONG | SHORT | NEUTRAL,
  strength: float,
  volatility: float,
  confidence: float
)

## Signal 生成流程
Market Data
   ↓
Models
   ↓
Model Outputs
   ↓
Signal Filter
   ↓
Signal Risk Control
   ↓
TradeSignal

## Python 风控不是“止损”
只做 前置约束
波动率过高 → 禁止信号
多模型冲突 → 放弃交易
置信度过低 → 降权


