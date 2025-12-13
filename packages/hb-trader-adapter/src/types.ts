// ============================================================================
// Result 模式 - Go/Rust 风格的错误处理
// ============================================================================

export type Result<T, E = ErrorInfo> =
  | { ok: true; data: T }
  | { ok: false; error: E }

export interface ErrorInfo {
  code: string
  message: string
  raw?: unknown
}

export function Ok<T>(data: T): Result<T, never> {
  return { ok: true, data }
}

export function Err<E = ErrorInfo>(error: E): Result<never, E> {
  return { ok: false, error }
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
  raw?: unknown
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
export interface PlaceOrderParams {
  /** 交易对 (统一格式: BTC-USDT) */
  symbol: string
  /** 交易类型 */
  tradeType: TradeType
  /** 交易方向 */
  side: OrderSide
  /** 订单类型 */
  orderType: OrderType
  /** 下单数量 */
  quantity: string
  /** 价格 (限价单必填) */
  price?: string
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
  createTime: number
  /** 更新时间 */
  updateTime: number
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
  lastPrice: string
  /** 24h最高价 */
  highPrice: string
  /** 24h最低价 */
  lowPrice: string
  /** 24h成交量 */
  volume: string
  /** 24h成交额 */
  quoteVolume: string
  /** 24h涨跌幅 */
  priceChangePercent: string
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

// ============================================================================
// 交易所 Symbol 映射规则
// ============================================================================

/**
 * OKX Symbol 格式:
 * - SPOT: BTC-USDT
 * - SWAP (永续): BTC-USDT-SWAP
 * - FUTURES (交割): BTC-USDT-240329
 *
 * Binance Symbol 格式:
 * - SPOT: BTCUSDT
 * - USDM (永续): BTCUSDT
 * - COINM (币本位): BTCUSD_PERP / BTCUSD_240329
 */

// ============================================================================
// 适配器接口定义
// ============================================================================

/**
 * 公共 API 适配器接口 (无需认证)
 */
export interface IPublicAdapter {
  /** 交易所标识 */
  readonly exchange: Exchange

  /** 获取交易对信息 */
  getSymbolInfo(symbol: string, tradeType: TradeType): Promise<Result<SymbolInfo>>

  /** 获取所有交易对信息 */
  getAllSymbols(tradeType: TradeType): Promise<Result<SymbolInfo[]>>

  /** 获取当前价格 */
  getPrice(symbol: string, tradeType: TradeType): Promise<Result<string>>

  /** 获取标记价格 (合约) */
  getMarkPrice(symbol: string, tradeType: TradeType): Promise<Result<string>>

  /** 获取 Ticker */
  getTicker(symbol: string, tradeType: TradeType): Promise<Result<Ticker>>

  /** 获取深度数据 */
  getOrderBook(symbol: string, tradeType: TradeType, limit?: number): Promise<Result<OrderBook>>

  /** 统一格式 -> 交易所原始格式 */
  toRawSymbol(symbol: string, tradeType: TradeType): string

  /** 交易所原始格式 -> 统一格式 */
  fromRawSymbol(rawSymbol: string, tradeType: TradeType): string

  /** 清除缓存 */
  clearCache(): void
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

/**
 * 交易 API 适配器接口 (需要认证)
 */
export interface ITradeAdapter extends IPublicAdapter {
  /** 组合的公共适配器 */
  readonly publicAdapter: IPublicAdapter

  // ============================================================================
  // 生命周期
  // ============================================================================

  /** 初始化 (加载交易对信息等) */
  init(): Promise<Result<void>>

  /** 销毁资源 */
  destroy(): Promise<void>

  /** 预加载所有交易对信息到缓存 */
  loadSymbols(tradeType?: TradeType): Promise<Result<void>>

  // ============================================================================
  // 账户信息
  // ============================================================================

  /** 获取账户余额 */
  getBalance(tradeType: TradeType): Promise<Result<Balance[]>>

  /** 获取合约持仓 */
  getPositions(symbol?: string, tradeType?: TradeType): Promise<Result<Position[]>>

  // ============================================================================
  // 下单校验 (可供调用方预先校验)
  // ============================================================================

  /** 校验下单参数 */
  validateOrderParams(params: PlaceOrderParams, symbolInfo: SymbolInfo): ValidationResult

  /** 校验余额是否充足 */
  validateBalance(
    params: PlaceOrderParams,
    symbolInfo: SymbolInfo,
    balances: Balance[],
    positions?: Position[]
  ): ValidationResult

  /** 格式化下单参数 (精度对齐) */
  formatOrderParams(params: PlaceOrderParams, symbolInfo: SymbolInfo): PlaceOrderParams

  // ============================================================================
  // 下单
  // ============================================================================

  /** 下单 */
  placeOrder(params: PlaceOrderParams): Promise<Result<Order>>

  /** 批量下单 */
  placeOrders(paramsList: PlaceOrderParams[]): Promise<BatchPlaceOrderResult>

  /** 获取批量下单限制 */
  getBatchOrderLimits(): BatchOrderLimits

  // ============================================================================
  // 订单管理
  // ============================================================================

  /** 取消订单 */
  cancelOrder(
    symbol: string,
    orderId: string,
    tradeType: TradeType
  ): Promise<Result<Order>>

  /** 查询订单 */
  getOrder(
    symbol: string,
    orderId: string,
    tradeType: TradeType
  ): Promise<Result<Order>>

  /** 获取未成交订单 */
  getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Result<Order[]>>

  /** 设置杠杆 */
  setLeverage(
    symbol: string,
    leverage: number,
    tradeType: TradeType,
    positionSide?: PositionSide
  ): Promise<Result<void>>
}
