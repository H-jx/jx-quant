import {
  AlgoOrderRequest,
  AlgoOrderResult,
  InstrumentType,
  OrderDetails,
  OrderRequest,
  OrderType,
  RestClient,
  RestClientOptions,
  SetLeverageRequest,
  AlgoOrderDetailsResult,
  AlgoOrderType
} from 'okx-api'
import type { AxiosRequestConfig } from 'axios'
import type {
  TradeType,
  Result,
  SymbolInfo,
  Balance,
  Position,
  Order,
  PlaceOrderParams,
  PositionSide,
  OrderStatus,
  BatchOrderLimits,
  TradeAdapterInit,
  StrategyOrderParams,
  StrategyOrder,
  StrategyOrderStatus,
  StrategyOrderType,
  StrategyTriggerPriceType,
} from '../types'
import { Ok, Err } from '../utils'
import { BaseTradeAdapter } from '../BaseTradeAdapter'
import { ErrorCodes } from '../errorCodes'
import {
  unifiedToOkx,
  getOkxInstType,
  getOkxTdMode,
  wrapAsync,
  createProxyAgent,
  formatPrice,
  formatQuantity,
  generateClientOrderId,
} from '../utils'
import { OkxPublicAdapter } from './OkxPublicAdapter'
import { IPublicAdapter } from '../BasePublicAdapter'

// OKX API response types
interface OkxBalanceResponse {
  details: Array<{
    ccy: string
    availBal: string
    frozenBal: string
    cashBal: string
  }>
}

interface OkxPositionResponse {
  instId: string
  posSide: string
  pos: string
  avgPx: string
  upl: string
  lever: string
  mgnMode: string
  liqPx: string
}

interface OkxOrderResponse {
  ordId: string
  clOrdId: string
  sCode: string
  sMsg: string
}

type OkxOrderDetailResponse = OrderDetails

type OkxTradeAdapterParams = TradeAdapterInit<OkxPublicAdapter> & {
  demoTrading?: boolean
}


/**
 * OKX 交易 API 适配器
 * 使用组合模式，公共 API 委托给 OkxPublicAdapter
 */
export class OkxTradeAdapter extends BaseTradeAdapter {
  /** 组合的公共适配器[复用] */
  static publicAdapter: OkxPublicAdapter
  /** 组合的公共适配器 */
  readonly publicAdapter: IPublicAdapter

  protected client: RestClient

  constructor({ apiKey, apiSecret, passphrase, demoTrading, httpsProxy, socksProxy, publicAdapter }: OkxTradeAdapterParams) {
    super()

    const clientConfig: RestClientOptions = {
      apiKey: apiKey,
      apiSecret: apiSecret,
      apiPass: passphrase,
      demoTrading
    }
    const requestOptions: AxiosRequestConfig = {}

    if (httpsProxy || socksProxy) {
      const agent = createProxyAgent({ httpsProxy, socksProxy })
      requestOptions.httpAgent = agent
      requestOptions.httpsAgent = agent
    }

    this.client = new RestClient(clientConfig, requestOptions)
    // 复用公共适配器实例
    if (OkxTradeAdapter.publicAdapter === undefined) {
      OkxTradeAdapter.publicAdapter = publicAdapter || new OkxPublicAdapter({ httpsProxy, socksProxy })
    }
    this.publicAdapter = OkxTradeAdapter.publicAdapter
  }
  // ============================================================================
  // 批量下单限制
  // ============================================================================

  getBatchOrderLimits(): BatchOrderLimits {
    return {
      maxBatchSize: 20,  // OKX 批量下单限制为 20
      supportedTradeTypes: ['spot', 'futures', 'delivery']
    }
  }

  // ============================================================================
  // 交易 API 实现
  // ============================================================================

  /**
   * 获取账户余额
   */
  async getBalance(_tradeType: TradeType): Promise<Result<Balance[]>> {
    const result = await wrapAsync<OkxBalanceResponse[]>(
      () => this.client.getBalance(),
      'GET_BALANCE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0 || !data[0].details) {
      return Ok([])
    }

    const balances: Balance[] = data[0].details.map(d => ({
      asset: d.ccy,
      free: d.availBal,
      locked: d.frozenBal,
      total: d.cashBal
    }))

    return Ok(balances)
  }

  /**
   * 获取合约持仓
   */
  async getPositions(symbol: string, tradeType: TradeType): Promise<Result<Position[]>> {
    const params = {
      instType: getOkxInstType(tradeType),
      instId: symbol
    }

    const result = await wrapAsync<OkxPositionResponse[]>(
      () => this.client.getPositions(params),
      'GET_POSITIONS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const positions: Position[] = result.data
      .filter(p => parseFloat(p.pos) !== 0)
      .map(p => {
        const parts = p.instId.split('-')
        const unifiedSymbol = `${parts[0]}-${parts[1]}`

        return {
          symbol: unifiedSymbol,
          positionSide: p.posSide.toLowerCase() as PositionSide,
          positionAmt: p.pos,
          entryPrice: p.avgPx,
          unrealizedPnl: p.upl,
          leverage: parseInt(p.lever),
          marginMode: p.mgnMode as 'cross' | 'isolated',
          liquidationPrice: p.liqPx
        }
      })

    return Ok(positions)
  }

  /**
   * 执行单个下单 (内部实现)
   */
  protected async doPlaceOrder(params: PlaceOrderParams, symbolInfo: SymbolInfo): Promise<Result<Order>> {
    const instId = symbolInfo.rawSymbol

    // 构建 OKX 订单请求
    const orderRequest: OrderRequest = {
      instId,
      tdMode: getOkxTdMode(params.tradeType),
      side: params.side,
      ordType: this.mapOrderType(params.orderType),
      sz: String(params.quantity)
    }

    // 限价单需要价格
    if (params.orderType === 'limit' || params.orderType === 'maker-only') {
      orderRequest.px = String(params.price)
    }

    // 合约需要持仓方向
    if (params.tradeType !== 'spot' && params.positionSide) {
      orderRequest.posSide = params.positionSide
    }

    // 客户端订单ID
    if (params.clientOrderId) {
      orderRequest.clOrdId = params.clientOrderId
    }

    // 只减仓
    if (params.reduceOnly) {
      orderRequest.reduceOnly = true
    }

    const result = await wrapAsync<OkxOrderResponse[]>(
      () => this.client.submitOrder(orderRequest),
      ErrorCodes.PLACE_ORDER_ERROR
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0) {
      return Err({
        code: ErrorCodes.PLACE_ORDER_ERROR,
        message: 'Empty response from exchange'
      })
    }

    const orderData = data[0]

    // 检查下单是否成功
    if (orderData.sCode !== '0') {
      return Err({
        code: orderData.sCode,
        message: orderData.sMsg,
        raw: data
      })
    }

    // 返回订单信息
    const order: Order = {
      orderId: orderData.ordId,
      clientOrderId: orderData.clOrdId,
      symbol: params.symbol,
      tradeType: params.tradeType,
      side: params.side,
      positionSide: params.positionSide,
      orderType: params.orderType,
      status: 'open',
      price: String(params.price) || '0',
      avgPrice: '0',
      quantity: String(params.quantity),
      filledQty: '0',
      raw: data
    }

    return Ok(order)
  }

  /**
   * 执行批量下单 (内部实现)
   */
  protected async doBatchPlaceOrder(
    paramsList: PlaceOrderParams[],
    symbolInfoMap: Map<string, SymbolInfo>
  ): Promise<Result<Order>[]> {
    if (paramsList.length === 0) {
      return []
    }

    // 构建批量下单请求
    const batchOrders = paramsList.map(params => {
      const key = `${params.symbol}:${params.tradeType}`
      const symbolInfo = symbolInfoMap.get(key)!

      const orderRequest: OrderRequest = {
        instId: symbolInfo.rawSymbol,
        tdMode: getOkxTdMode(params.tradeType),
        side: params.side,
        ordType: this.mapOrderType(params.orderType),
        sz: String(params.quantity)
      }

      if (params.orderType === 'limit' || params.orderType === 'maker-only') {
        orderRequest.px = String(params.price)
      }

      if (params.tradeType !== 'spot' && params.positionSide) {
        orderRequest.posSide = params.positionSide
      }

      if (params.clientOrderId) {
        orderRequest.clOrdId = params.clientOrderId
      }

      if (params.reduceOnly) {
        orderRequest.reduceOnly = true
      }

      return orderRequest
    })

    const result = await wrapAsync<OkxOrderResponse[]>(
      () => this.client.submitMultipleOrders(batchOrders),
      ErrorCodes.BATCH_PLACE_ORDER_ERROR
    )

    if (!result.ok) {
      // 如果整体失败，返回所有失败结果
      return paramsList.map(() => Err(result.error))
    }

    const data = result.data

    // 映射结果
    return data.map((item, index) => {
      const params = paramsList[index]

      if (item.sCode !== '0') {
        return Err({
          code: item.sCode,
          message: item.sMsg,
          raw: item
        })
      }

      return Ok({
        orderId: item.ordId,
        clientOrderId: item.clOrdId,
        symbol: params.symbol,
        tradeType: params.tradeType,
        side: params.side,
        positionSide: params.positionSide,
        orderType: params.orderType,
        status: 'open' as OrderStatus,
        price: String(params.price) || '0',
        avgPrice: '0',
        quantity: String(params.quantity),
        filledQty: '0',
        raw: item
      })
    })
  }

  /**
   * 取消订单
   */
  async cancelOrder(
    symbol: string,
    orderId: string,
    tradeType: TradeType
  ): Promise<Result<Order>> {
    const instId = unifiedToOkx(symbol, tradeType)

    const result = await wrapAsync<OkxOrderResponse[]>(
      () => this.client.cancelOrder({ instId, ordId: orderId }),
      ErrorCodes.CANCEL_ORDER_ERROR
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0) {
      return Err({
        code: ErrorCodes.CANCEL_ORDER_ERROR,
        message: 'Empty response from exchange'
      })
    }

    const orderData = data[0]

    if (orderData.sCode !== '0') {
      return Err({
        code: orderData.sCode,
        message: orderData.sMsg,
        raw: data
      })
    }

    // 查询订单详情
    return this.getOrder(symbol, orderId, tradeType)
  }

  /**
   * 查询订单
   */
  async getOrder(
    symbol: string,
    orderId: string,
    tradeType: TradeType
  ): Promise<Result<Order>> {
    const instId = unifiedToOkx(symbol, tradeType)

    const result = await wrapAsync<OkxOrderDetailResponse[]>(
      () => this.client.getOrderDetails({ instId, ordId: orderId }),
      'GET_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0) {
      return Err({
        code: ErrorCodes.ORDER_NOT_FOUND,
        message: `Order ${orderId} not found`
      })
    }

    const orderData = data[0]

    return Ok(this.transformOrder(orderData, symbol, tradeType))
  }

  /**
   * 获取未成交订单
   */
  async getOpenOrders(symbol: string, tradeType: TradeType): Promise<Result<Order[]>> {
    const params: { instType: InstrumentType; instId: string } = {
      instType: getOkxInstType(tradeType),
      instId: symbol
    }

    const result = await wrapAsync<OkxOrderDetailResponse[]>(
      () => this.client.getOrderList(params),
      'GET_OPEN_ORDERS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const orders = result.data.map(orderData => {
      const parts = orderData.instId.split('-')
      const unifiedSymbol = `${parts[0]}-${parts[1]}`
      const orderTradeType = this.getTradeTypeFromInstId(orderData.instId)
      return this.transformOrder(orderData, unifiedSymbol, orderTradeType)
    })

    return Ok(orders)
  }

  /**
   * 设置杠杆
   */
  async setLeverage(
    symbol: string,
    leverage: number,
    tradeType: TradeType,
    positionSide?: PositionSide
  ): Promise<Result<void>> {
    if (tradeType === 'spot') {
      return Err({
        code: ErrorCodes.INVALID_TRADE_TYPE,
        message: 'Cannot set leverage for spot trading'
      })
    }

    const instId = unifiedToOkx(symbol, tradeType)

    const params: {
      instId: string
      lever: string
      mgnMode: SetLeverageRequest['mgnMode']
      posSide?: SetLeverageRequest['posSide']
    } = {
      instId,
      lever: String(leverage),
      mgnMode: 'isolated'
    }

    if (positionSide) {
      params.posSide = positionSide
    }

    const result = await wrapAsync(
      () => this.client.setLeverage(params),
      'SET_LEVERAGE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    return Ok(undefined)
  }



  private transformOrder(
    orderData: OkxOrderDetailResponse,
    symbol: string,
    tradeType: TradeType
  ): Order {
    return {
      orderId: orderData.ordId,
      clientOrderId: orderData.clOrdId,
      symbol,
      tradeType,
      side: orderData.side as 'buy' | 'sell',
      positionSide: orderData.posSide ? orderData.posSide.toLowerCase() as PositionSide : undefined,
      orderType: this.reverseMapOrderType(orderData.ordType),
      status: this.mapOrderStatus(orderData.state),
      price: orderData.px,
      avgPrice: orderData.avgPx,
      quantity: orderData.sz,
      filledQty: orderData.accFillSz,
      createTime: parseInt(orderData.cTime),
      updateTime: parseInt(orderData.uTime),
      raw: orderData
    }
  }

  // ============================================================================
  // 策略订单 (Algo Order) 实现
  // ============================================================================

  /**
   * 策略下单 (止盈止损/计划委托/移动止盈止损)
   */
  async placeStrategyOrder(params: StrategyOrderParams): Promise<Result<StrategyOrder>> {
    const instId = unifiedToOkx(params.symbol, params.tradeType)

    // 构建 OKX 策略订单请求
    const algoRequest: AlgoOrderRequest = {
      instId,
      tdMode: getOkxTdMode(params.tradeType),
      side: params.side,
      ordType: this.mapStrategyOrderType(params.strategyType),
      sz: String(params.quantity),
    }

    // 持仓方向 (合约必填)
    if (params.tradeType !== 'spot' && params.positionSide) {
      algoRequest.posSide = params.positionSide
    }

    // 触发价类型
    const triggerPxType = params.triggerPriceType || 'last'

    // 根据策略类型设置不同的字段
    switch (params.strategyType) {
      case 'stop-loss':
        // 止损: slTriggerPx, slOrdPx
        algoRequest.slTriggerPx = String(params.triggerPrice)
        algoRequest.slTriggerPxType = triggerPxType
        algoRequest.slOrdPx = params.orderPrice ? String(params.orderPrice) : '-1' // -1 表示市价
        break

      case 'take-profit':
        // 止盈: tpTriggerPx, tpOrdPx
        algoRequest.tpTriggerPx = String(params.triggerPrice)
        algoRequest.tpTriggerPxType = triggerPxType
        algoRequest.tpOrdPx = params.orderPrice ? String(params.orderPrice) : '-1'
        break

      case 'trigger':
        // 计划委托: triggerPx, orderPx
        algoRequest.triggerPx = String(params.triggerPrice)
        algoRequest.triggerPxType = triggerPxType
        algoRequest.orderPx = params.orderPrice ? String(params.orderPrice) : '-1'
        // 附带止盈止损
        if (params.attachedOrders && params.attachedOrders.length > 0) {
          algoRequest.attachAlgoOrds = params.attachedOrders.map(ao => ({
            tpTriggerPx: ao.tpTriggerPrice ? String(ao.tpTriggerPrice) : undefined,
            tpOrdPx: ao.tpOrderPrice ? String(ao.tpOrderPrice) : undefined,
            tpTriggerPxType: ao.tpTriggerPriceType,
            slTriggerPx: ao.slTriggerPrice ? String(ao.slTriggerPrice) : undefined,
            slOrdPx: ao.slOrderPrice ? String(ao.slOrderPrice) : undefined,
            slTriggerPxType: ao.slTriggerPriceType,
          }))
        }
        break

      case 'trailing-stop':
        // 移动止盈止损: callbackRatio / callbackSpread, activePx
        if (params.callbackRatio !== undefined) {
          algoRequest.callbackRatio = String(params.callbackRatio)
        }
        if (params.callbackSpread !== undefined) {
          algoRequest.callbackSpread = String(params.callbackSpread)
        }
        if (params.activationPrice !== undefined) {
          algoRequest.activePx = String(params.activationPrice)
        }
        break
    }

    // 只减仓
    if (params.reduceOnly) {
      algoRequest.reduceOnly = true
    }

    // 客户端策略订单ID
    if (params.clientAlgoId) {
      algoRequest.algoClOrdId = params.clientAlgoId
    }

    const result = await wrapAsync<AlgoOrderResult[]>(
      () => this.client.placeAlgoOrder(algoRequest),
      ErrorCodes.PLACE_STRATEGY_ORDER_ERROR
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data
    if (!data || data.length === 0) {
      return Err({
        code: ErrorCodes.PLACE_STRATEGY_ORDER_ERROR,
        message: 'Empty response from exchange'
      })
    }

    const algoData = data[0]

    // 检查下单是否成功
    if (algoData.sCode !== '0') {
      return Err({
        code: algoData.sCode,
        message: algoData.sMsg,
        raw: data
      })
    }

    // 返回策略订单信息
    const strategyOrder: StrategyOrder = {
      algoId: algoData.algoId,
      clientAlgoId: algoData.algoClOrdId || params.clientAlgoId,
      symbol: params.symbol,
      tradeType: params.tradeType,
      side: params.side,
      positionSide: params.positionSide,
      strategyType: params.strategyType,
      status: 'live',
      triggerPrice: String(params.triggerPrice),
      triggerPriceType: params.triggerPriceType,
      orderPrice: params.orderPrice ? String(params.orderPrice) : undefined,
      quantity: String(params.quantity),
      raw: data
    }

    return Ok(strategyOrder)
  }

  /**
   * 撤销策略订单
   */
  async cancelStrategyOrder(
    symbol: string,
    algoId: string,
    tradeType: TradeType
  ): Promise<Result<StrategyOrder>> {
    const instId = unifiedToOkx(symbol, tradeType)

    const result = await wrapAsync<AlgoOrderResult[]>(
      () => this.client.cancelAlgoOrder([{ instId, algoId }]),
      ErrorCodes.CANCEL_ORDER_ERROR
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data
    if (!data || data.length === 0) {
      return Err({
        code: ErrorCodes.CANCEL_ORDER_ERROR,
        message: 'Empty response from exchange'
      })
    }

    const algoData = data[0]
    if (algoData.sCode !== '0') {
      return Err({
        code: algoData.sCode,
        message: algoData.sMsg,
        raw: data
      })
    }

    // 查询策略订单详情
    return this.getStrategyOrder(algoId, tradeType)
  }

  /**
   * 获取策略订单详情
   */
  async getStrategyOrder(
    algoId: string,
    _tradeType: TradeType
  ): Promise<Result<StrategyOrder>> {
    const result = await wrapAsync<AlgoOrderDetailsResult[]>(
      () => this.client.getAlgoOrderDetails({ algoId }),
      'GET_STRATEGY_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data
    if (!data || data.length === 0) {
      return Err({
        code: ErrorCodes.ORDER_NOT_FOUND,
        message: `Strategy order ${algoId} not found`
      })
    }

    const algoData = data[0]
    return Ok(this.transformStrategyOrder(algoData))
  }

  /**
   * 获取未完成策略订单列表
   */
  async getOpenStrategyOrders(
    symbol?: string,
    tradeType?: TradeType
  ): Promise<Result<StrategyOrder[]>> {
    const params: { ordType: AlgoOrderType; instType?: InstrumentType; instId?: string } = {
      ordType: 'trigger'
    }

    if (tradeType) {
      params.instType = getOkxInstType(tradeType)
    }
    if (symbol && tradeType) {
      params.instId = unifiedToOkx(symbol, tradeType)
    }

    const result = await wrapAsync<AlgoOrderDetailsResult[]>(
      () => this.client.getAlgoOrderList(params),
      'GET_OPEN_STRATEGY_ORDERS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const orders = result.data.map(algoData => this.transformStrategyOrder(algoData))
    return Ok(orders)
  }

  // ============================================================================
  // 策略订单辅助方法
  // ============================================================================

  private transformStrategyOrder(algoData: AlgoOrderDetailsResult): StrategyOrder {
    const parts = algoData.instId.split('-')
    const unifiedSymbol = `${parts[0]}-${parts[1]}`
    const orderTradeType = this.getTradeTypeFromInstId(algoData.instId)

    // 确定触发价格
    let triggerPrice = ''
    if (algoData.triggerPx) {
      triggerPrice = algoData.triggerPx
    } else if (algoData.slTriggerPx) {
      triggerPrice = algoData.slTriggerPx
    } else if (algoData.tpTriggerPx) {
      triggerPrice = algoData.tpTriggerPx
    }

    // 确定委托价格
    let orderPrice: string | undefined
    if (algoData.ordPx) {
      orderPrice = algoData.ordPx
    } else if (algoData.slOrdPx) {
      orderPrice = algoData.slOrdPx
    } else if (algoData.tpOrdPx) {
      orderPrice = algoData.tpOrdPx
    }

    return {
      algoId: algoData.algoId,
      clientAlgoId: algoData.algoClOrdId || undefined,
      symbol: unifiedSymbol,
      tradeType: orderTradeType,
      side: algoData.side as 'buy' | 'sell',
      positionSide: algoData.posSide ? algoData.posSide.toLowerCase() as PositionSide : undefined,
      strategyType: this.reverseMapStrategyOrderType(algoData.ordType),
      status: this.mapStrategyOrderStatus(algoData.state),
      triggerPrice,
      triggerPriceType: (algoData.triggerPxType || algoData.slTriggerPxType || algoData.tpTriggerPxType || 'last') as StrategyTriggerPriceType,
      orderPrice,
      quantity: algoData.sz,
      tpTriggerPrice: algoData.tpTriggerPx || undefined,
      tpOrderPrice: algoData.tpOrdPx || undefined,
      slTriggerPrice: algoData.slTriggerPx || undefined,
      slOrderPrice: algoData.slOrdPx || undefined,
      triggerTime: algoData.triggerTime ? parseInt(algoData.triggerTime) : undefined,
      raw: algoData
    }
  }

  private mapStrategyOrderType(strategyType: StrategyOrderType): AlgoOrderRequest['ordType'] {
    switch (strategyType) {
      case 'stop-loss':
      case 'take-profit':
        return 'conditional'
      case 'trigger':
        return 'trigger'
      case 'trailing-stop':
        return 'move_order_stop'
      default:
        return 'conditional'
    }
  }

  private reverseMapStrategyOrderType(ordType: string): StrategyOrderType {
    switch (ordType) {
      case 'conditional':
      case 'oco':
        return 'stop-loss' // 默认按止损处理，实际需要根据具体字段判断
      case 'trigger':
        return 'trigger'
      case 'move_order_stop':
        return 'trailing-stop'
      default:
        return 'trigger'
    }
  }

  private mapStrategyOrderStatus(state: string): StrategyOrderStatus {
    switch (state) {
      case 'live':
        return 'live'
      case 'effective':
        return 'effective'
      case 'canceled':
        return 'canceled'
      case 'order_failed':
      case 'partially_failed':
        return 'failed'
      case 'partially_effective':
        return 'partially_effective'
      default:
        return 'live'
    }
  }

  private mapOrderType(orderType: string): OrderType {
    switch (orderType) {
      case 'limit':
        return 'limit'
      case 'market':
        return 'market'
      case 'maker-only':
        return 'post_only'
      default:
        return 'limit'
    }
  }

  private reverseMapOrderType(ordType: string): 'limit' | 'market' | 'maker-only' {
    switch (ordType) {
      case 'limit':
        return 'limit'
      case 'market':
        return 'market'
      case 'post_only':
        return 'maker-only'
      default:
        return 'limit'
    }
  }

  private mapOrderStatus(state: string): OrderStatus {
    switch (state) {
      case 'live':
        return 'open'
      case 'partially_filled':
        return 'partial'
      case 'filled':
        return 'filled'
      case 'canceled':
        return 'canceled'
      default:
        return 'open'
    }
  }

  private getTradeTypeFromInstId(instId: string): TradeType {
    if (instId.endsWith('-SWAP')) {
      return 'futures'
    }
    const parts = instId.split('-')
    if (parts.length === 3 && /^\d+$/.test(parts[2])) {
      return 'delivery'
    }
    return 'spot'
  }
}
