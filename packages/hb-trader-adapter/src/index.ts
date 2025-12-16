// ============================================================================
// Types
// ============================================================================
export type {
  // Result 模式
  Result,
  ErrorInfo,

  // 交易所和交易类型
  Exchange,
  TradeType,

  // Symbol 信息
  SymbolInfo,

  // 账户和余额
  Balance,
  FuturesBalance,
  Position,

  // 订单相关
  OrderSide,
  PositionSide,
  OrderType,
  TimeInForce,
  OrderStatus,
  PlaceOrderParams,
  Order,
  StrategyOrder,
  StrategyOrderParams,
  StrategyOrderType,
  StrategyOrderStatus,
  StrategyTriggerPriceType,
  StrategyAttachedOrder,

  // WebSocket 用户数据
  WsUserDataEventType,
  WsUserDataEvent,
  WsOrderUpdate,
  WsStrategyOrderUpdate,
  WsPositionUpdate,
  WsBalanceUpdate,
  WsAccountUpdate,
  WsConnectionEvent,
  WsErrorEvent,
  WsEventHandler,
  WsSubscribeOptions,

  // 批量下单
  BatchPlaceOrderResult,
  BatchOrderLimits,
  ValidationResult,

  // 行情数据
  Ticker,
  OrderBook,

  // API 认证
  AdapterOptions,
} from './core/types'

// Result 工具函数
export { Ok, Err } from './core/utils'

// ============================================================================
// Base Classes
// ============================================================================
export { BasePublicAdapter } from './core/BasePublicAdapter'
export type { IPublicAdapter } from './core/BasePublicAdapter'
export { BaseTradeAdapter } from './core/BaseTradeAdapter'
export type { ITradeAdapter } from './core/BaseTradeAdapter'
export { BaseWsUserDataAdapter } from './core/BaseWsUserDataAdapter'
export type { IWsUserDataAdapter } from './core/BaseWsUserDataAdapter'

// ============================================================================
// Adapters
// ============================================================================
export { OkxPublicAdapter } from './exchanges/okx/PublicAdapter'
export { OkxTradeAdapter } from './exchanges/okx/TradeAdapter'
export { OkxWsUserDataAdapter } from './exchanges/okx/WsUserDataAdapter'
export type { OkxWsUserDataAdapterInit } from './exchanges/okx/WsUserDataAdapter'

export { BinancePublicAdapter } from './exchanges/binance/PublicAdapter'
export { BinanceTradeAdapter } from './exchanges/binance/TradeAdapter'
export { BinanceWsUserDataAdapter } from './exchanges/binance/WsUserDataAdapter'
export type { BinanceWsUserDataAdapterInit } from './exchanges/binance/WsUserDataAdapter'

// ============================================================================
// Utils
// ============================================================================
export {
  // 精度处理
  truncateDecimal,
  adjustByStep,
  getDecimalPlaces,
  formatPrice,
  formatQuantity,

  // Symbol 转换

  // 错误处理
  wrapAsync,
  // 代理工具
  createProxyAgent
} from './core/utils'
