/**
 * 多平台交易适配器 - 核心类型定义
 */

// ============ 基础枚举 ============
export type ExchangeName = 'okx' | 'binance';

/** 交易方向 */
export type Side = 'buy' | 'sell';

/** 订单类型 */
export type OrderType = 'limit' | 'market';

/** 持仓方向 (合约) */
export type PositionSide = 'long' | 'short';

/** 保证金模式 */
export type MarginMode = 'cross' | 'isolated';

/** 交易类型 */
export type TradeType = 'spot' | 'futures' | 'delivery';

/** 订单状态 */
export type OrderStatus =
  | 'pending'      // 待提交
  | 'open'         // 挂单中
  | 'partial'      // 部分成交
  | 'filled'       // 完全成交
  | 'cancelled'    // 已取消
  | 'rejected'     // 被拒绝
  | 'expired';     // 已过期

// ============ Symbol 信息 ============

/** Symbol 基础信息 - 统一格式 */
export interface SymbolInfo {
  /** 交易对 (统一格式: BTC-USDT) */
  symbol: string;
  /** 原始交易对 (交易所格式: BTCUSDT 或 BTC-USDT) */
  rawSymbol: string;
  /** 基础货币 (BTC) */
  baseCurrency: string;
  /** 计价货币 (USDT) */
  quoteCurrency: string;
  /** 交易类型 */
  tradeType: TradeType;
  /** 最小价格变动 (tickSize) */
  tickSize: string;
  /** 最小数量变动 (stepSize/lotSize) */
  stepSize: string;
  /** 最小下单数量 */
  minQty: string;
  /** 最大下单数量 */
  maxQty: string;
  /** 最小下单金额 (notional) */
  minNotional?: string;
  /** 数量精度 */
  quantityPrecision: number;
  /** 价格精度 */
  pricePrecision: number;
  /** 合约乘数 (仅delivery) */
  contractMultiplier?: number;
  /** 是否可交易 */
  tradable: boolean;
  /** 原始数据 */
  raw?: string;
}

// ============ 账户和余额 ============

/** 余额信息 */
export interface Balance {
  /** 币种 */
  currency: string;
  /** 总余额 */
  total: string;
  /** 可用余额 */
  available: string;
  /** 冻结余额 */
  frozen: string;
  /** 全仓未实现盈亏 (合约) */
  crossUnPnl?: string;
  /** 原始数据 */
  raw?: unknown;
}

/** 持仓信息 */
export interface Position {
  /** 交易对 */
  symbol: string;
  /** 持仓方向 */
  positionSide: PositionSide;
  /** 持仓数量 (正为多，负为空) */
  positionAmt: string;
  /** 开仓均价 */
  entryPrice: string;
  /** 标记价格 */
  markPrice?: string;
  /** 未实现盈亏 */
  unrealizedPnl: string;
  /** 杠杆倍数 */
  leverage: number;
  /** 保证金模式 */
  marginMode: MarginMode;
  /** 强平价格 */
  liquidationPrice?: string;
  /** 原始数据 */
  raw?: unknown;
}

// ============ 订单相关 ============

/** 下单参数 */
export interface PlaceOrderParams {
  /** 交易对 (统一格式) */
  symbol: string;
  /** 交易类型 */
  tradeType: TradeType;
  /** 交易方向 */
  side: Side;
  /** 订单类型 */
  orderType: OrderType;
  /** 下单数量 (基础货币单位) */
  quantity: number;
  /** 下单价格 (限价单必填) */
  price?: number;
  /** 持仓方向 (合约必填) */
  positionSide?: PositionSide;
  /** 杠杆倍数 (合约) */
  leverage?: number;
  /** 是否只减仓 */
  reduceOnly?: boolean;
  /** 客户端订单ID */
  clientOrderId?: string;
}

/** 订单信息 */
export interface Order {
  /** 订单ID */
  orderId: string;
  /** 客户端订单ID */
  clientOrderId?: string;
  /** 交易对 */
  symbol: string;
  /** 交易类型 */
  tradeType: TradeType;
  /** 交易方向 */
  side: Side;
  /** 订单类型 */
  orderType: OrderType;
  /** 订单状态 */
  status: OrderStatus;
  /** 下单价格 */
  price: string;
  /** 下单数量 */
  quantity: string;
  /** 已成交数量 */
  filledQty: string;
  /** 成交均价 */
  avgPrice: string;
  /** 持仓方向 */
  positionSide?: PositionSide;
  /** 手续费 */
  fee?: string;
  /** 手续费币种 */
  feeCurrency?: string;
  /** 创建时间 */
  createTime: number;
  /** 更新时间 */
  updateTime: number;
  /** 原始数据 */
  raw?: unknown;
}

// ============ 校验相关 ============

/** 校验错误码 */
export type ValidationErrorCode =
  | 'SYMBOL_NOT_FOUND'        // 交易对不存在
  | 'SYMBOL_NOT_TRADABLE'     // 交易对不可交易
  | 'INVALID_PRICE'           // 价格无效
  | 'PRICE_PRECISION_ERROR'   // 价格精度错误
  | 'INVALID_QUANTITY'        // 数量无效
  | 'QUANTITY_PRECISION_ERROR'// 数量精度错误
  | 'QUANTITY_TOO_SMALL'      // 数量太小
  | 'QUANTITY_TOO_LARGE'      // 数量太大
  | 'NOTIONAL_TOO_SMALL'      // 下单金额太小
  | 'INSUFFICIENT_BALANCE'    // 余额不足
  | 'INSUFFICIENT_POSITION'   // 持仓不足(平仓时)
  | 'MISSING_PRICE'           // 限价单缺少价格
  | 'MISSING_POSITION_SIDE'   // 合约缺少持仓方向
  | 'INVALID_LEVERAGE';       // 杠杆倍数无效

/** 校验错误 */
export interface ValidationError {
  /** 错误码 */
  code: ValidationErrorCode;
  /** 错误字段 */
  field: string;
  /** 错误信息 */
  message: string;
  /** 当前值 */
  actual?: unknown;
  /** 期望值 */
  expected?: unknown;
}

/** 校验结果 */
export interface ValidationResult {
  /** 是否通过 */
  valid: boolean;
  /** 错误列表 */
  errors: ValidationError[];
}

// ============ 下单结果 ============

/** 下单结果 */
export interface PlaceOrderResult {
  /** 是否成功 */
  success: boolean;
  /** 订单信息 (成功时) */
  order?: Order;
  /** 错误码 (失败时) */
  code?: string;
  /** 错误信息 (失败时) */
  message?: string;
  /** 原始响应 */
  raw?: unknown;
}

/** 取消订单结果 */
export interface CancelOrderResult {
  /** 是否成功 */
  success: boolean;
  /** 订单ID */
  orderId?: string;
  /** 错误码 */
  code?: string;
  /** 错误信息 */
  message?: string;
}

// ============ 批量下单 ============

/** 批量下单限制 */
export interface BatchOrderLimits {
  /** 最大批量数 */
  maxBatchSize: number;
  /** 支持的交易类型 */
  supportedTradeTypes: TradeType[];
}

/** 批量下单结果 */
export interface BatchPlaceOrderResult {
  /** 总数 */
  total: number;
  /** 成功数 */
  successCount: number;
  /** 失败数 */
  failedCount: number;
  /** 各订单结果 (顺序与输入一致) */
  results: PlaceOrderResult[];
}

// ============ 适配器配置 ============

/** 公共适配器配置 */
export interface PublicAdapterConfig {
  /** 是否模拟盘 */
  simulated?: boolean;
  /** 请求超时 (ms) */
  timeout?: number;
  /** 代理 */
  proxy?: string;
}

/** 交易适配器配置 */
export interface TradeAdapterConfig extends PublicAdapterConfig {
  /** API Key */
  apiKey: string;
  /** API Secret */
  apiSecret: string;
  /** Passphrase (OKX需要) */
  passphrase?: string;
}

// ============ 公共适配器接口 ============

/** 公共适配器接口 - 不需要认证 */
export interface IPublicAdapter {
  /** 适配器名称 (okx, binance) */
  readonly name: string;

  // ---- Symbol 信息 ----

  /** 获取交易对信息 */
  getSymbolInfo(symbol: string, tradeType: TradeType): Promise<SymbolInfo | null>;

  /** 获取所有交易对 */
  getSymbols(tradeType: TradeType): Promise<SymbolInfo[]>;

  /** 统一symbol转原始symbol */
  toRawSymbol(symbol: string, tradeType: TradeType): string;

  /** 原始symbol转统一symbol */
  fromRawSymbol(rawSymbol: string, tradeType: TradeType): string;

  // ---- 市场数据 ----

  /** 获取当前价格 */
  getPrice(symbol: string, tradeType: TradeType): Promise<string>;

  /** 获取标记价格 (合约) */
  getMarkPrice(symbol: string, tradeType: TradeType): Promise<string>;

  // ---- 缓存管理 ----

  /** 清空缓存 */
  clearCache(): void;
}

// ============ 交易适配器接口 ============

/** 交易适配器接口 - 需要认证 */
export interface ITradeAdapter {
  /** 适配器名称 */
  readonly name: string;

  /** 公共适配器实例 */
  readonly publicAdapter: IPublicAdapter;

  // ---- 初始化 ----

  /** 初始化适配器 */
  init(): Promise<void>;

  /** 销毁适配器 */
  destroy(): Promise<void>;

  // ---- 账户信息 ----

  /** 获取余额 */
  getBalance(tradeType: TradeType): Promise<Balance[]>;

  /** 获取持仓 (合约) */
  getPositions(symbol?: string, tradeType?: TradeType): Promise<Position[]>;

  // ---- 下单校验 ----

  /**
   * 校验下单参数
   * 检查: symbol是否存在、价格/数量精度、最小/最大限制
   */
  validateOrderParams(params: PlaceOrderParams, symbolInfo: SymbolInfo): ValidationResult;

  /**
   * 校验余额是否充足
   * 现货买入: 检查quoteCurrency余额
   * 现货卖出: 检查baseCurrency余额
   * 合约开仓: 检查保证金余额
   * 合约平仓: 检查持仓数量
   */
  validateBalance(
    params: PlaceOrderParams,
    symbolInfo: SymbolInfo,
    balance: Balance[],
    positions?: Position[]
  ): ValidationResult;

  /**
   * 格式化订单参数 (按精度)
   * 自动调整price和quantity到符合交易所要求的精度
   */
  formatOrderParams(params: PlaceOrderParams, symbolInfo: SymbolInfo): PlaceOrderParams;

  // ---- 下单 ----

  /**
   * 下单 (完整流程)
   * 1. 获取symbolInfo
   * 2. 校验参数 (validateOrderParams)
   * 3. 获取余额/持仓
   * 4. 校验余额 (validateBalance)
   * 5. 格式化参数 (formatOrderParams)
   * 6. 执行下单
   * 7. 返回统一格式
   */
  placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult>;

  /**
   * 批量下单
   * - Binance: 最多 5 个订单
   * - OKX: 最多 20 个订单
   * 注意: 批量下单跳过余额校验，仅做参数校验和格式化
   */
  placeOrders(params: PlaceOrderParams[]): Promise<BatchPlaceOrderResult>;

  /** 获取批量下单限制 */
  getBatchOrderLimits(): BatchOrderLimits;

  // ---- 订单管理 ----

  /** 取消订单 */
  cancelOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<CancelOrderResult>;

  /** 查询订单 */
  getOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Order | null>;

  /** 查询未完成订单 */
  getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Order[]>;
}

// ============ 事件类型 ============

/** 适配器事件映射 */
export interface AdapterEventMap {
  /** 订单更新 */
  orderUpdate: Order;
  /** 余额更新 */
  balanceUpdate: Balance[];
  /** 持仓更新 */
  positionUpdate: Position[];
  /** 连接状态 */
  connectionStatus: { connected: boolean; error?: Error };
  /** 错误 */
  error: Error;
}
