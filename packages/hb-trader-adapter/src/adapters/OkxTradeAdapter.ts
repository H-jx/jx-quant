import {
  AlgoOrderRequest,
  AlgoOrderResult,
  InstrumentType,
  OrderDetails,
  OrderRequest,
  OrderType,
  RestClient,
  RestClientOptions,
  SetLeverageRequest
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
  TradeAdapterInit
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
