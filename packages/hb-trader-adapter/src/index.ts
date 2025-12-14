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

  // 批量下单
  BatchPlaceOrderResult,
  BatchOrderLimits,
  ValidationResult,

  // 行情数据
  Ticker,
  OrderBook,

  // API 认证
  ApiCredentials,
  AdapterOptions,
} from './types'

// Result 工具函数
export { Ok, Err } from './utils'

// ============================================================================
// Base Classes
// ============================================================================
export { BasePublicAdapter } from './BasePublicAdapter'
export type { IPublicAdapter } from './BasePublicAdapter'
export { BaseTradeAdapter } from './BaseTradeAdapter'
export type { ITradeAdapter } from './BaseTradeAdapter'
// ============================================================================
// Adapters
// ============================================================================
export {
  OkxPublicAdapter,
  OkxTradeAdapter,
  BinancePublicAdapter,
  BinanceTradeAdapter
} from './adapters'

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
  parseUnifiedSymbol,
  createUnifiedSymbol,
  unifiedToOkx,
  unifiedToBinance,
  okxToUnified,
  binanceToUnified,

  // 交易所客户端转换
  getOkxInstType,
  getOkxTdMode,

  // 币本位合约工具
  getContractValue,
  usdtToContracts,
  coinToContracts,
  contractsToCoin,

  // 错误处理
  wrapAsync,
  extractOkxError,
  extractBinanceError,

  // 时间工具
  generateClientOrderId,

  // 类型守卫
  isValidTradeType,
  isValidExchange,

  // 代理工具
  createProxyAgent
} from './utils'
