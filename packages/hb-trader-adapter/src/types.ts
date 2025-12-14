// ============================================================================
// Result 模式 - Go/Rust 风格的错误处理
// ============================================================================

export type Result<T, E = ErrorInfo> =
  | { ok: boolean; data: T; error: E }
  | { ok: false; error: E }

export interface ErrorInfo {
  code: string
  message: string
  raw?: unknown
}

// ============================================================================
// 交易所和交易类型
// ============================================================================

export type Exchange = 'okx' | 'binance'

/**
 * 交易类型
 * - spot: 现货
 * - futures: U本位永续 (OKX: SWAP, Binance: USDM)
 * - delivery: 币本位交割 (OKX: FUTURES, Binance: COINM)
 */
export type TradeType = 'spot' | 'futures' | 'delivery'

/**
 * 交易对状态
 * - 0: 不可用
 * - 1: 可用
 */
export enum SymbolStatus {
  Disabled = 0,
  Enabled = 1
}

// ============================================================================
// Symbol 信息
// ============================================================================

/**
 * 统一的交易对信息
 */
export interface SymbolInfo {
  /** 统一格式: BTC-USDT */
  symbol: string
  /** 原始格式: BTCUSDT (Binance) / BTC-USDT-SWAP (OKX) */
  rawSymbol: string
  /** 基础货币: BTC */
  baseCurrency: string
  /** 计价货币: USDT */
  quoteCurrency: string
  /** 交易类型 */
  tradeType: TradeType
  /** 最小价格变动: "0.01" */
  tickSize: string
  /** 最小数量变动: "0.001" */
  stepSize: string
  /** 最小下单数量 */
  minQty: string
  /** 最大下单数量 */
  maxQty: string
  /** 数量精度 */
  quantityPrecision: number
  /** 价格精度 */
  pricePrecision: number
  /** 交易对状态 */
  status: SymbolStatus
  /** 合约面值 (仅合约) */
  contractValue?: number
  /** 最大杠杆 (仅合约) */
  maxLeverage?: number
  /** 补充其他原始数据 */
  raw?: string
}

// ============================================================================
// 账户和余额
// ============================================================================

/**
 * 账户余额
 */
export interface Balance {
  /** 资产名称: USDT, BTC */
  asset: string
  /** 可用余额 */
  free: string
  /** 冻结余额 */
  locked: string
  /** 总余额 */
  total: string
}

/**
 * 合约账户余额
 */
export interface FuturesBalance extends Balance {
  /** 未实现盈亏 */
  unrealizedPnl: string
  /** 保证金余额 */
  marginBalance: string
  /** 可提取余额 */
  withdrawAvailable: string
}

/**
 * 合约持仓
 */
export interface Position {
  /** 交易对 */
  symbol: string
  /** 持仓方向 */
  positionSide: PositionSide
  /** 持仓数量 (正数多头, 负数空头) */
  positionAmt: string
  /** 开仓均价 */
  entryPrice: string
  /** 未实现盈亏 */
  unrealizedPnl: string
  /** 杠杆倍数 */
  leverage: number
  /** 保证金模式 */
  marginMode: 'cross' | 'isolated'
  /** 强平价格 */
  liquidationPrice: string
}

// ============================================================================
// 订单相关
// ============================================================================

export type OrderSide = 'buy' | 'sell'
export type PositionSide = 'long' | 'short'
export type OrderType = 'limit' | 'market' | 'maker-only'
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'GTX'
export type OrderStatus =
  | 'pending'      // 等待触发 (条件单)
  | 'open'         // 未成交
  | 'partial'      // 部分成交
  | 'filled'       // 完全成交
  | 'canceled'     // 已取消
  | 'rejected'     // 被拒绝
  | 'expired'      // 已过期

/**
 * 下单参数
 */
export interface PlaceOrderParams<TQuantity = string | number, TPrice = string | number> {
  /** 交易对 (统一格式: BTC-USDT) */
  symbol: string
  /** 交易类型 */
  tradeType: TradeType
  /** 交易方向 */
  side: OrderSide
  /** 订单类型 */
  orderType: OrderType
  /** 下单数量 */
  quantity: TQuantity
  /** 价格 (限价单必填) */
  price?: TPrice
  /** 持仓方向 (合约必填) */
  positionSide?: PositionSide
  /** 杠杆倍数 (合约) */
  leverage?: number
  /** 客户端订单ID */
  clientOrderId?: string
  /** 有效期 */
  timeInForce?: TimeInForce
  /** 是否只减仓 */
  reduceOnly?: boolean
}

/**
 * 订单信息
 */
export interface Order {
  /** 订单ID */
  orderId: string
  /** 客户端订单ID */
  clientOrderId?: string
  /** 交易对 */
  symbol: string
  /** 交易类型 */
  tradeType: TradeType
  /** 交易方向 */
  side: OrderSide
  /** 持仓方向 */
  positionSide?: PositionSide
  /** 订单类型 */
  orderType: OrderType
  /** 订单状态 */
  status: OrderStatus
  /** 下单价格 */
  price: string
  /** 成交均价 */
  avgPrice: string
  /** 下单数量 */
  quantity: string
  /** 已成交数量 */
  filledQty: string
  /** 创建时间 */
  createTime?: number
  /** 更新时间 */
  updateTime?: number
  /** 原始数据 */
  raw?: unknown
}

// ============================================================================
// 行情数据
// ============================================================================

/**
 * 价格信息
 */
export interface Ticker {
  /** 交易对 */
  symbol: string
  /** 最新价 */
  last: string
  /** 24h最高价 */
  high: string
  /** 24h最低价 */
  low: string
  /** 24h成交量 */
  volume: string
  /** 24h成交额 */
  quoteVolume: string
  /** 时间戳 */
  timestamp: number
}

/**
 * 深度数据
 */
export interface OrderBook {
  /** 交易对 */
  symbol: string
  /** 买盘 [[价格, 数量], ...] */
  bids: [string, string][]
  /** 卖盘 [[价格, 数量], ...] */
  asks: [string, string][]
  /** 时间戳 */
  timestamp: number
}

// ============================================================================
// API 认证配置
// ============================================================================

export interface ApiCredentials {
  apiKey: string
  apiSecret: string
  passphrase?: string // OKX 需要
}

export interface AdapterOptions {
  /** HTTP/HTTPS 代理 URL (例如: http://127.0.0.1:7890) */
  httpsProxy?: string
  /** SOCKS 代理 URL (例如: socks://127.0.0.1:7890) */
  socksProxy?: string
}

export type TradeAdapterInit<TPublicAdapter> = ApiCredentials & AdapterOptions & {
  /** 共享的公共适配器实例 */
  publicAdapter?: TPublicAdapter
}



// ============================================================================
// 批量下单相关类型
// ============================================================================

/**
 * 批量下单结果
 */
export interface BatchPlaceOrderResult {
  /** 成功数量 */
  successCount: number
  /** 失败数量 */
  failedCount: number
  /** 结果列表 (顺序与输入一致) */
  results: Result<Order>[]
}

/**
 * 批量下单限制
 */
export interface BatchOrderLimits {
  /** 最大批量大小 */
  maxBatchSize: number
  /** 支持的交易类型 */
  supportedTradeTypes: TradeType[]
}

/**
 * 校验结果
 */
export interface ValidationResult {
  /** 是否通过校验 */
  valid: boolean
  /** 错误信息 (校验失败时) */
  error?: ErrorInfo
}
