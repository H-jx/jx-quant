import type {
  TradeType,
  Result,
  SymbolInfo,
  Balance,
  Position,
  Order,
  PlaceOrderParams,
  PositionSide,
  BatchPlaceOrderResult,
  BatchOrderLimits,
  ValidationResult,
  Ticker,
  OrderBook,
  Exchange
} from './types'
import { Ok, Err } from './utils'
import { formatPrice, formatQuantity, generateClientOrderId } from './utils'
import { ErrorCodes } from './errorCodes'
import { IPublicAdapter } from './BasePublicAdapter'


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
    currentPrice: number,
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

/**
 * 交易 API 适配器基类
 * 实现通用的下单流程和校验逻辑
 */
export abstract class BaseTradeAdapter implements ITradeAdapter {
  /** 组合的公共适配器 */
  abstract readonly publicAdapter: IPublicAdapter

  /** 交易所标识 (委托给 publicAdapter) */
  get exchange(): Exchange {
    return this.publicAdapter.exchange
  }

  // ============================================================================
  // 抽象方法 - 子类必须实现
  // ============================================================================

  abstract getBalance(tradeType: TradeType): Promise<Result<Balance[]>>
  abstract getPositions(symbol?: string, tradeType?: TradeType): Promise<Result<Position[]>>
  abstract cancelOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Result<Order>>
  abstract getOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Result<Order>>
  abstract getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Result<Order[]>>
  abstract setLeverage(symbol: string, leverage: number, tradeType: TradeType, positionSide?: PositionSide): Promise<Result<void>>

  /** 执行单个下单 (子类实现具体的交易所调用) */
  protected abstract doPlaceOrder(params: PlaceOrderParams, symbolInfo: SymbolInfo): Promise<Result<Order>>

  /** 执行批量下单 (子类实现具体的交易所调用) */
  protected abstract doBatchPlaceOrder(
    paramsList: PlaceOrderParams[],
    symbolInfoMap: Map<string, SymbolInfo>
  ): Promise<Result<Order>[]>

  // ============================================================================
  // 公共 API 委托 (委托给 publicAdapter)
  // ============================================================================

  async getSymbolInfo(symbol: string, tradeType: TradeType): Promise<Result<SymbolInfo>> {
    return this.publicAdapter.getSymbolInfo(symbol, tradeType)
  }

  async getAllSymbols(tradeType: TradeType): Promise<Result<SymbolInfo[]>> {
    return this.publicAdapter.getAllSymbols(tradeType)
  }

  async getPrice(symbol: string, tradeType: TradeType): Promise<Result<string>> {
    return this.publicAdapter.getPrice(symbol, tradeType)
  }

  async getMarkPrice(symbol: string, tradeType: TradeType): Promise<Result<string>> {
    return this.publicAdapter.getMarkPrice(symbol, tradeType)
  }

  async getTicker(symbol: string, tradeType: TradeType): Promise<Result<Ticker>> {
    return this.publicAdapter.getTicker(symbol, tradeType)
  }

  async getOrderBook(symbol: string, tradeType: TradeType, limit?: number): Promise<Result<OrderBook>> {
    return this.publicAdapter.getOrderBook(symbol, tradeType, limit)
  }

  toRawSymbol(symbol: string, tradeType: TradeType): string {
    return this.publicAdapter.toRawSymbol(symbol, tradeType)
  }

  fromRawSymbol(rawSymbol: string, tradeType: TradeType): string {
    return this.publicAdapter.fromRawSymbol(rawSymbol, tradeType)
  }


  // ============================================================================
  // 生命周期
  // ============================================================================

  /**
   * 初始化适配器
   * 默认加载所有交易类型的交易对信息
   */
  async init(): Promise<Result<void>> {
    const tradeTypes: TradeType[] = ['spot', 'futures', 'delivery']
    for (const tradeType of tradeTypes) {
      const result = await this.loadSymbols(tradeType)
      if (!result.ok) {
        // 只记录错误，不中断初始化
        console.warn(`Failed to load ${tradeType} symbols:`, result.error)
      }
    }
    return Ok(undefined)
  }

  /**
   * 预加载交易对信息到缓存
   */
  async loadSymbols(tradeType?: TradeType): Promise<Result<void>> {
    if (tradeType) {
      const result = await this.getAllSymbols(tradeType)
      if (!result.ok) {
        return Err(result.error)
      }
      return Ok(undefined)
    }

    // 加载所有类型
    const tradeTypes: TradeType[] = ['spot', 'futures', 'delivery']
    for (const tt of tradeTypes) {
      await this.getAllSymbols(tt)
    }
    return Ok(undefined)
  }

  // ============================================================================
  // 下单校验 (公开方法，可供调用方预先校验)
  // ============================================================================

  /**
   * 校验下单参数
   */
  validateOrderParams(params: PlaceOrderParams<number, number>, symbolInfo: SymbolInfo): ValidationResult {
    // 基础参数检查
    if (!params.symbol) {
      return { valid: false, error: { code: ErrorCodes.INVALID_PARAMS, message: 'symbol is required' } }
    }

    if (!params.tradeType) {
      return { valid: false, error: { code: ErrorCodes.INVALID_PARAMS, message: 'tradeType is required' } }
    }

    if (!params.side || !['buy', 'sell'].includes(params.side)) {
      return { valid: false, error: { code: ErrorCodes.INVALID_PARAMS, message: 'side must be buy or sell' } }
    }

    if (!params.orderType) {
      return { valid: false, error: { code: ErrorCodes.INVALID_PARAMS, message: 'orderType is required' } }
    }

    if (!params.quantity || params.quantity <= 0) {
      return { valid: false, error: { code: ErrorCodes.INVALID_PARAMS, message: 'quantity must be greater than 0' } }
    }

    if (params.orderType === 'limit' && (!params.price || params.price <= 0)) {
      return { valid: false, error: { code: ErrorCodes.INVALID_PARAMS, message: 'price is required for limit order' } }
    }

    if (params.tradeType !== 'spot' && !params.positionSide) {
      return { valid: false, error: { code: ErrorCodes.INVALID_PARAMS, message: 'positionSide is required for futures/delivery' } }
    }

    // 交易对状态检查
    if (symbolInfo.status !== 1) {
      return {
        valid: false,
        error: { code: ErrorCodes.SYMBOL_NOT_AVAILABLE, message: `${params.symbol} is not available for trading` }
      }
    }

    // 数量范围检查
    const quantity = params.quantity
    const minQty = parseFloat(symbolInfo.minQty)
    const maxQty = parseFloat(symbolInfo.maxQty)

    if (quantity < minQty) {
      return {
        valid: false,
        error: { code: ErrorCodes.QUANTITY_TOO_SMALL, message: `Quantity ${quantity} is less than minimum ${minQty}` }
      }
    }

    if (maxQty > 0 && quantity > maxQty) {
      return {
        valid: false,
        error: { code: ErrorCodes.QUANTITY_TOO_LARGE, message: `Quantity ${quantity} is greater than maximum ${maxQty}` }
      }
    }

    return { valid: true }
  }

  /**
   * 校验余额是否充足
   */
  validateBalance(
    params: PlaceOrderParams<number, number>,
    symbolInfo: SymbolInfo,
    balances: Balance[],
    currentPrice: number,
    positions?: Position[]
  ): ValidationResult {
    const quantity = params.quantity
    let price: number
    if (!params.price) {
      price = currentPrice
    } else {
      price = params.price
    }
    // 计算所需金额
    let required: number
    let asset: string

    if (params.tradeType === 'spot') {
      if (params.side === 'buy') {
        // 现货买入需要报价币
        asset = symbolInfo.quoteCurrency
        required = price * quantity
      } else {
        // 现货卖出需要基础币
        asset = symbolInfo.baseCurrency
        required = quantity
      }
    } else {
      // 合约交易
      if (params.positionSide === 'long' && params.side === 'sell' ||
        params.positionSide === 'short' && params.side === 'buy') {
        // 平仓：检查持仓数量
        if (positions) {
          const position = positions.find(
            p => p.symbol === params.symbol && p.positionSide === params.positionSide
          )
          const positionAmt = Math.abs(parseFloat(position?.positionAmt || '0'))
          if (positionAmt < quantity) {
            return {
              valid: false,
              error: {
                code: ErrorCodes.INSUFFICIENT_POSITION,
                message: `Insufficient position. Required: ${quantity}, Available: ${positionAmt}`
              }
            }
          }
        }
        return { valid: true }
      } else {
        // 开仓：检查保证金
        asset = symbolInfo.quoteCurrency
        required = (price * quantity) / (params.leverage || 1)
      }
    }

    // 查找对应资产余额
    const balance = balances.find(b => b.asset === asset)
    const available = parseFloat(balance?.free || '0')

    if (available < required && !process.env.SKIP_VALIDATE) {
      return {
        valid: false,
        error: {
          code: ErrorCodes.INSUFFICIENT_BALANCE,
          message: `Insufficient balance. Required: ${required} ${asset}, Available: ${available} ${asset}`
        }
      }
    }

    return { valid: true }
  }

  /**
   * 格式化下单参数 (精度对齐)
   */
  formatOrderParams(params: PlaceOrderParams<number, number>, symbolInfo: SymbolInfo): PlaceOrderParams<string, string> {
    const { quantity, price, ...reset } = params
    const formatted = {
      ...reset,
      quantity: '',
      price: undefined as string | undefined,
    }
    // 格式化数量
    formatted.quantity = formatQuantity(params.quantity, symbolInfo.stepSize)

    // 格式化价格
    if (params.price) {
      formatted.price = formatPrice(params.price, symbolInfo.tickSize)
    }

    // 生成客户端订单ID
    if (!formatted.clientOrderId) {
      formatted.clientOrderId = generateClientOrderId(this.exchange, params.tradeType)
    }

    return formatted
  }

  // ============================================================================
  // 下单
  // ============================================================================

  /**
   * 下单 (带完整的前置校验流程)
   */
  async placeOrder(params: PlaceOrderParams<number, number>): Promise<Result<Order>> {
    // 1. 获取交易对信息
    const [symbolResult, priceResult] = await Promise.all([
      this.getSymbolInfo(params.symbol, params.tradeType),
      this.getPrice(params.symbol, params.tradeType)
    ])
    if (!symbolResult.ok) {
      return Err(symbolResult.error)
    }
    if (!priceResult.ok) {
      return Err(priceResult.error)
    }
    const symbolInfo = symbolResult.data

    // 2. 参数校验
    const validation = this.validateOrderParams(params, symbolInfo)
    if (!validation.valid) {
      return Err(validation.error!)
    }

    // 3. 余额校验 (并行获取余额和持仓)
    const [balanceResult, positionsResult] = await Promise.all([
      this.getBalance(params.tradeType),
      params.tradeType !== 'spot' ? this.getPositions(params.symbol, params.tradeType) : Promise.resolve(Ok([]))
    ])

    if (!balanceResult.ok) {
      return balanceResult as Result<Order>
    }

    const positions = positionsResult.ok ? positionsResult.data : []
    const balanceValidation = this.validateBalance(params, symbolInfo, balanceResult.data, Number(priceResult.data), positions)
    if (!balanceValidation.valid) {
      return Err(balanceValidation.error!)
    }

    // 4. 格式化参数
    const formattedParams = this.formatOrderParams(params, symbolInfo)

    // 5. 再次检查格式化后的数量是否符合要求
    const formattedQty = parseFloat(formattedParams.quantity)
    if (formattedQty < parseFloat(symbolInfo.minQty)) {
      return Err({
        code: ErrorCodes.QUANTITY_TOO_SMALL,
        message: `Formatted quantity ${formattedQty} is less than minimum ${symbolInfo.minQty}`
      })
    }

    // 6. 执行下单
    return this.doPlaceOrder(formattedParams, symbolInfo)
  }

  /**
   * 批量下单
   * 注意：批量下单跳过余额校验，只做参数校验和格式化
   */
  async placeOrders(paramsList: PlaceOrderParams<number, number>[]): Promise<BatchPlaceOrderResult> {
    if (paramsList.length === 0) {
      return { successCount: 0, failedCount: 0, results: [] }
    }

    const limits = this.getBatchOrderLimits()
    const results: Result<Order>[] = []

    // 获取所有交易对信息
    const symbolInfoMap = new Map<string, SymbolInfo>()
    const preparedParams: PlaceOrderParams[] = []
    const failedIndices: number[] = []

    for (let i = 0; i < paramsList.length; i++) {
      const params = paramsList[i]
      const key = `${params.symbol}:${params.tradeType}`

      // 获取交易对信息
      let symbolInfo = symbolInfoMap.get(key)
      if (!symbolInfo) {
        const symbolResult = await this.getSymbolInfo(params.symbol, params.tradeType)
        if (!symbolResult.ok) {
          results[i] = symbolResult as Result<Order>
          failedIndices.push(i)
          continue
        }
        symbolInfo = symbolResult.data
        symbolInfoMap.set(key, symbolInfo)
      }

      // 参数校验
      const validation = this.validateOrderParams(params, symbolInfo)
      if (!validation.valid) {
        results[i] = Err(validation.error!)
        failedIndices.push(i)
        continue
      }

      // 格式化参数
      const formattedParams = this.formatOrderParams(params, symbolInfo)

      // 检查格式化后的数量
      const formattedQty = parseFloat(formattedParams.quantity)
      if (formattedQty < parseFloat(symbolInfo.minQty)) {
        results[i] = Err({
          code: ErrorCodes.QUANTITY_TOO_SMALL,
          message: `Formatted quantity ${formattedQty} is less than minimum ${symbolInfo.minQty}`
        })
        failedIndices.push(i)
        continue
      }

      preparedParams.push(formattedParams)
    }

    // 按批次大小分组执行
    const validIndices = paramsList.map((_, i) => i).filter(i => !failedIndices.includes(i))

    for (let i = 0; i < preparedParams.length; i += limits.maxBatchSize) {
      const batch = preparedParams.slice(i, i + limits.maxBatchSize)
      const batchResults = await this.doBatchPlaceOrder(batch, symbolInfoMap)

      // 将结果映射回原始索引
      for (let j = 0; j < batchResults.length; j++) {
        const originalIndex = validIndices[i + j]
        results[originalIndex] = batchResults[j]
      }
    }

    // 统计结果
    let successCount = 0
    let failedCount = 0
    for (const result of results) {
      if (result.ok) {
        successCount++
      } else {
        failedCount++
      }
    }

    return { successCount, failedCount, results }
  }

  /**
   * 获取批量下单限制
   * 子类应该覆盖此方法返回正确的限制
   */
  getBatchOrderLimits(): BatchOrderLimits {
    return {
      maxBatchSize: 5,
      supportedTradeTypes: ['spot', 'futures', 'delivery']
    }
  }

  // ============================================================================
  // 内部辅助方法
  // ============================================================================

  /**
   * 完整的下单前处理流程 (内部使用)
   * @deprecated 使用 placeOrder 方法，它已经包含完整流程
   */
  protected async prepareOrder(
    params: PlaceOrderParams<number, number>,
    options: { checkBalance?: boolean } = {}
  ): Promise<Result<{ params: PlaceOrderParams; symbolInfo: SymbolInfo }>> {
    // 1. 获取交易对信息
    const [symbolResult, priceResult] = await Promise.all([
      this.getSymbolInfo(params.symbol, params.tradeType),
      this.getPrice(params.symbol, params.tradeType)
    ])
    if (!symbolResult.ok) {
      return Err(symbolResult.error)
    }
    if (!priceResult.ok) {
      return Err(priceResult.error)
    }
    const symbolInfo = symbolResult.data

    // 2. 参数校验
    const validation = this.validateOrderParams(params, symbolInfo)
    if (!validation.valid) {
      return Err(validation.error!)
    }

    // 3. 余额检查
    if (options.checkBalance !== false) {
      const balanceResult = await this.getBalance(params.tradeType)
      if (!balanceResult.ok) {
        return balanceResult
      }

      let positions: Position[] = []
      if (params.tradeType !== 'spot') {
        const positionsResult = await this.getPositions(params.symbol, params.tradeType)
        if (positionsResult.ok) {
          positions = positionsResult.data
        }
      }

      const balanceValidation = this.validateBalance(params, symbolInfo, balanceResult.data, Number(priceResult.data), positions)
      if (!balanceValidation.valid) {
        return Err(balanceValidation.error!)
      }
    }

    // 4. 格式化参数
    const formattedParams = this.formatOrderParams(params, symbolInfo)

    // 5. 检查格式化后的数量
    const formattedQty = parseFloat(formattedParams.quantity)
    if (formattedQty < parseFloat(symbolInfo.minQty)) {
      return Err({
        code: ErrorCodes.QUANTITY_TOO_SMALL,
        message: `Quantity ${formattedQty} is less than minimum ${symbolInfo.minQty}`
      })
    }

    if (parseFloat(symbolInfo.maxQty) > 0 && formattedQty > parseFloat(symbolInfo.maxQty)) {
      return Err({
        code: ErrorCodes.QUANTITY_TOO_LARGE,
        message: `Quantity ${formattedQty} is greater than maximum ${symbolInfo.maxQty}`
      })
    }

    return Ok({ params: formattedParams, symbolInfo })
  }



  /**
   * 销毁适配器
   * 清理资源和缓存
   */
  async destroy(): Promise<void> {
    // this.publicAdapter.
  }

}
