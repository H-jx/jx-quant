import { MainClient, USDMClient, CoinMClient, FuturesOrderType, OrderTimeInForce, BooleanString, NewFuturesOrderParams, NewOrderResult } from 'binance'
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
  ApiCredentials,
  AdapterOptions,
  IPublicAdapter,
  BatchOrderLimits
} from '../types'
import { Ok, Err } from '../types'
import { BaseTradeAdapter } from '../BaseTradeAdapter'
import {
  unifiedToBinance,
  parseBinanceSymbol,
  wrapAsync,
  coinToContracts,
  createProxyAgent
} from '../utils'
import { BinancePublicAdapter } from './BinancePublicAdapter'

// Binance API response types
type numberInString = string | number

interface BinanceOrderResponse {
  orderId: number
  clientOrderId: string
  symbol: string
  side: string
  positionSide?: string
  status: string
  type?: string
  price: numberInString
  avgPrice?: numberInString
  origQty: numberInString
  executedQty: numberInString
  time?: number
  updateTime?: number
  transactTime?: number
}

interface BinanceSpotBalanceResponse {
  balances: Array<{
    asset: string
    free: numberInString
    locked: numberInString
  }>
}

interface BinanceFuturesBalanceResponse {
  asset: string
  availableBalance: numberInString
  crossUnPnl: numberInString
  crossWalletBalance: numberInString
}

interface BinancePositionResponse {
  symbol: string
  positionSide: string
  positionAmt: numberInString
  entryPrice: numberInString
  unRealizedProfit: numberInString
  leverage: numberInString
  marginType: string
  liquidationPrice: numberInString
}

interface BinanceFuturesOrderResponse {
  orderId: number
  clientOrderId: string
  symbol: string
  side: string
  positionSide: string
  status: string
  type?: string
  price: numberInString
  avgPrice: numberInString
  origQty: numberInString
  executedQty: numberInString
  updateTime: number
}

/**
 * Binance 交易 API 适配器
 * 使用组合模式，公共 API 委托给 BinancePublicAdapter
 */
export class BinanceTradeAdapter extends BaseTradeAdapter {
  /** 组合的公共适配器 */
  readonly publicAdapter: IPublicAdapter

  protected spotClient: MainClient
  protected futuresClient: USDMClient
  protected deliveryClient: CoinMClient

  constructor(credentials: ApiCredentials, options?: AdapterOptions, publicAdapter?: BinancePublicAdapter) {
    super()
    const config: Record<string, unknown> = {
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret
    }
    const agent = createProxyAgent(options)
    if (agent) {
      config.httpsAgent = agent
    }
    this.spotClient = new MainClient(config)
    this.futuresClient = new USDMClient(config)
    this.deliveryClient = new CoinMClient(config)

    // 使用传入的公共适配器或创建新实例
    this.publicAdapter = publicAdapter || new BinancePublicAdapter(options)
  }

  // ============================================================================
  // 批量下单限制
  // ============================================================================

  getBatchOrderLimits(): BatchOrderLimits {
    return {
      maxBatchSize: 5,  // Binance 批量下单限制为 5
      supportedTradeTypes: ['futures', 'delivery']  // Binance 现货不支持批量下单
    }
  }

  // ============================================================================
  // 交易 API 实现
  // ============================================================================

  /**
   * 获取账户余额
   */
  async getBalance(tradeType: TradeType): Promise<Result<Balance[]>> {
    switch (tradeType) {
      case 'spot':
        return this.getSpotBalance()
      case 'futures':
        return this.getFuturesBalance()
      case 'delivery':
        return this.getDeliveryBalance()
    }
  }

  /**
   * 获取合约持仓
   */
  async getPositions(symbol?: string, tradeType?: TradeType): Promise<Result<Position[]>> {
    const positions: Position[] = []

    // 获取 USDM 持仓
    if (!tradeType || tradeType === 'futures') {
      const futuresResult = await this.getFuturesPositions(symbol)
      if (futuresResult.ok) {
        positions.push(...futuresResult.data)
      }
    }

    // 获取 COINM 持仓
    if (!tradeType || tradeType === 'delivery') {
      const deliveryResult = await this.getDeliveryPositions(symbol)
      if (deliveryResult.ok) {
        positions.push(...deliveryResult.data)
      }
    }

    return Ok(positions)
  }

  /**
   * 执行单个下单 (内部实现)
   */
  protected async doPlaceOrder(params: PlaceOrderParams, symbolInfo: SymbolInfo): Promise<Result<Order>> {
    const rawSymbol = symbolInfo.rawSymbol

    switch (params.tradeType) {
      case 'spot':
        return this.placeSpotOrder(params, rawSymbol)
      case 'futures':
        return this.placeFuturesOrder(params, rawSymbol)
      case 'delivery':
        return this.placeDeliveryOrder(params, rawSymbol, symbolInfo)
    }
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

    // 检查是否所有订单都是同一交易类型
    const tradeType = paramsList[0].tradeType

    // Binance 现货不支持批量下单，退化为并行单个下单
    if (tradeType === 'spot') {
      return Promise.all(
        paramsList.map(params => {
          const key = `${params.symbol}:${params.tradeType}`
          const symbolInfo = symbolInfoMap.get(key)!
          return this.doPlaceOrder(params, symbolInfo)
        })
      )
    }

    // 合约批量下单
    if (tradeType === 'futures') {
      return this.batchPlaceFuturesOrders(paramsList, symbolInfoMap)
    }

    if (tradeType === 'delivery') {
      return this.batchPlaceDeliveryOrders(paramsList, symbolInfoMap)
    }

    return []
  }

  /**
   * 取消订单
   */
  async cancelOrder(
    symbol: string,
    orderId: string,
    tradeType: TradeType
  ): Promise<Result<Order>> {
    const rawSymbol = unifiedToBinance(symbol, tradeType)

    const result = await wrapAsync<BinanceOrderResponse>(
      () => {
        switch (tradeType) {
          case 'spot':
            return this.spotClient.cancelOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
          case 'futures':
            return this.futuresClient.cancelOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
          case 'delivery':
            return this.deliveryClient.cancelOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
        }
      },
      'CANCEL_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    return Ok(this.transformOrder(result.data, symbol, tradeType))
  }

  /**
   * 查询订单
   */
  async getOrder(
    symbol: string,
    orderId: string,
    tradeType: TradeType
  ): Promise<Result<Order>> {
    const rawSymbol = unifiedToBinance(symbol, tradeType)

    const result = await wrapAsync<BinanceOrderResponse>(
      () => {
        switch (tradeType) {
          case 'spot':
            return this.spotClient.getOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
          case 'futures':
            return this.futuresClient.getOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
          case 'delivery':
            return this.deliveryClient.getOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
        }
      },
      'GET_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    return Ok(this.transformOrder(result.data, symbol, tradeType))
  }

  /**
   * 获取未成交订单
   */
  async getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Result<Order[]>> {
    const orders: Order[] = []
    const rawSymbol = symbol && tradeType ? unifiedToBinance(symbol, tradeType) : undefined

    // 获取现货未成交订单
    if (!tradeType || tradeType === 'spot') {
      const spotResult = await wrapAsync<BinanceOrderResponse[]>(
        () => rawSymbol
          ? this.spotClient.getOpenOrders({ symbol: rawSymbol })
          : this.spotClient.getOpenOrders(),
        'GET_SPOT_OPEN_ORDERS_ERROR'
      )
      if (spotResult.ok) {
        orders.push(...spotResult.data.map(o => this.transformSpotOrder(o)))
      }
    }

    // 获取 USDM 未成交订单
    if (!tradeType || tradeType === 'futures') {
      const futuresResult = await wrapAsync<BinanceFuturesOrderResponse[]>(
        () => rawSymbol
          ? this.futuresClient.getAllOpenOrders({ symbol: rawSymbol })
          : this.futuresClient.getAllOpenOrders(),
        'GET_FUTURES_OPEN_ORDERS_ERROR'
      )
      if (futuresResult.ok) {
        orders.push(...futuresResult.data.map(o => this.transformFuturesOrder(o)))
      }
    }

    // 获取 COINM 未成交订单
    if (!tradeType || tradeType === 'delivery') {
      const deliveryResult = await wrapAsync<BinanceFuturesOrderResponse[]>(
        () => rawSymbol
          ? this.deliveryClient.getAllOpenOrders({ symbol: rawSymbol })
          : this.deliveryClient.getAllOpenOrders(),
        'GET_DELIVERY_OPEN_ORDERS_ERROR'
      )
      if (deliveryResult.ok) {
        orders.push(...deliveryResult.data.map(o => this.transformDeliveryOrder(o)))
      }
    }

    return Ok(orders)
  }

  /**
   * 设置杠杆
   */
  async setLeverage(
    symbol: string,
    leverage: number,
    tradeType: TradeType,
    _positionSide?: PositionSide
  ): Promise<Result<void>> {
    if (tradeType === 'spot') {
      return Err({
        code: 'INVALID_TRADE_TYPE',
        message: 'Cannot set leverage for spot trading'
      })
    }

    const rawSymbol = unifiedToBinance(symbol, tradeType)

    const result = await wrapAsync(
      () => {
        if (tradeType === 'futures') {
          return this.futuresClient.setLeverage({ symbol: rawSymbol, leverage })
        }
        return this.deliveryClient.setLeverage({ symbol: rawSymbol, leverage })
      },
      'SET_LEVERAGE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    return Ok(undefined)
  }

  // ============================================================================
  // 私有方法 - 余额
  // ============================================================================

  private async getSpotBalance(): Promise<Result<Balance[]>> {
    const result = await wrapAsync<BinanceSpotBalanceResponse>(
      () => this.spotClient.getAccountInformation(),
      'GET_SPOT_BALANCE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const balances: Balance[] = result.data.balances
      .filter(b => parseFloat(String(b.free)) > 0 || parseFloat(String(b.locked)) > 0)
      .map(b => ({
        asset: b.asset,
        free: String(b.free),
        locked: String(b.locked),
        total: String(parseFloat(String(b.free)) + parseFloat(String(b.locked)))
      }))

    return Ok(balances)
  }

  private async getFuturesBalance(): Promise<Result<Balance[]>> {
    const result = await wrapAsync<BinanceFuturesBalanceResponse[]>(
      () => this.futuresClient.getBalance(),
      'GET_FUTURES_BALANCE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const balances: Balance[] = result.data
      .filter(b => parseFloat(String(b.crossWalletBalance)) > 0)
      .map(b => ({
        asset: b.asset,
        free: String(b.availableBalance),
        locked: String(parseFloat(String(b.crossWalletBalance)) - parseFloat(String(b.availableBalance))),
        total: String(b.crossWalletBalance)
      }))

    return Ok(balances)
  }

  private async getDeliveryBalance(): Promise<Result<Balance[]>> {
    const result = await wrapAsync<BinanceFuturesBalanceResponse[]>(
      () => this.deliveryClient.getBalance(),
      'GET_DELIVERY_BALANCE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const balances: Balance[] = result.data
      .filter(b => parseFloat(String(b.crossWalletBalance)) > 0)
      .map(b => ({
        asset: b.asset,
        free: String(b.availableBalance),
        locked: String(parseFloat(String(b.crossWalletBalance)) - parseFloat(String(b.availableBalance))),
        total: String(b.crossWalletBalance)
      }))

    return Ok(balances)
  }

  // ============================================================================
  // 私有方法 - 持仓
  // ============================================================================

  private async getFuturesPositions(symbol?: string): Promise<Result<Position[]>> {
    const result = await wrapAsync<BinancePositionResponse[]>(
      () => symbol
        ? this.futuresClient.getPositions({ symbol: unifiedToBinance(symbol, 'futures') })
        : this.futuresClient.getPositions(),
      'GET_FUTURES_POSITIONS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const positions: Position[] = result.data
      .filter(p => parseFloat(String(p.positionAmt)) !== 0)
      .map(p => {
        // BTCUSDT -> BTC-USDT
        const { base, quote } = parseBinanceSymbol(p.symbol)

        return {
          symbol: `${base}-${quote}`,
          positionSide: p.positionSide.toLowerCase() as PositionSide,
          positionAmt: String(p.positionAmt),
          entryPrice: String(p.entryPrice),
          unrealizedPnl: String(p.unRealizedProfit),
          leverage: parseInt(String(p.leverage)),
          marginMode: p.marginType.toLowerCase() as 'cross' | 'isolated',
          liquidationPrice: String(p.liquidationPrice)
        }
      })

    return Ok(positions)
  }

  private async getDeliveryPositions(symbol?: string): Promise<Result<Position[]>> {
    const result = await wrapAsync<BinancePositionResponse[]>(
      () => symbol
        ? this.deliveryClient.getPositions({ pair: unifiedToBinance(symbol, 'delivery').split('_')[0] })
        : this.deliveryClient.getPositions(),
      'GET_DELIVERY_POSITIONS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const positions: Position[] = result.data
      .filter(p => parseFloat(String(p.positionAmt)) !== 0)
      .map(p => {
        // BTCUSD_PERP -> BTC-USD
        const [pair] = p.symbol.split('_')
        const base = pair.replace(/USD$/, '')

        return {
          symbol: `${base}-USD`,
          positionSide: p.positionSide.toLowerCase() as PositionSide,
          positionAmt: String(p.positionAmt),
          entryPrice: String(p.entryPrice),
          unrealizedPnl: String(p.unRealizedProfit),
          leverage: parseInt(String(p.leverage)),
          marginMode: p.marginType.toLowerCase() as 'cross' | 'isolated',
          liquidationPrice: String(p.liquidationPrice)
        }
      })

    return Ok(positions)
  }

  // ============================================================================
  // 私有方法 - 下单
  // ============================================================================

  private async placeSpotOrder(
    params: PlaceOrderParams,
    rawSymbol: string
  ): Promise<Result<Order>> {
    const orderParams: {
      symbol: string
      side: 'BUY' | 'SELL'
      type: string
      quantity: string
      price?: string
      newClientOrderId?: string
      timeInForce?: string
    } = {
      symbol: rawSymbol,
      side: params.side.toUpperCase() as 'BUY' | 'SELL',
      type: this.mapOrderType(params.orderType),
      quantity: params.quantity
    }

    if (params.orderType === 'limit' || params.orderType === 'maker-only') {
      orderParams.price = params.price
      orderParams.timeInForce = params.orderType === 'maker-only' ? 'GTX' : (params.timeInForce || 'GTC')
    }

    if (params.clientOrderId) {
      orderParams.newClientOrderId = params.clientOrderId
    }

    const result = await wrapAsync<BinanceOrderResponse>(
      () => this.spotClient.submitNewOrder(orderParams as never),
      'PLACE_SPOT_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    return Ok(this.transformSpotOrder(result.data))
  }

  private async placeFuturesOrder(
    params: PlaceOrderParams,
    rawSymbol: string
  ): Promise<Result<Order>> {
    const orderParams: {
      symbol: string
      side: 'BUY' | 'SELL'
      positionSide?: 'LONG' | 'SHORT'
      type: FuturesOrderType
      quantity: number
      price?: number
      newClientOrderId?: string
      timeInForce?: OrderTimeInForce
      reduceOnly?: BooleanString
    } = {
      symbol: rawSymbol,
      side: params.side.toUpperCase() as 'BUY' | 'SELL',
      type: this.mapOrderType(params.orderType),
      quantity: Number(params.quantity)
    }

    if (params.positionSide) {
      orderParams.positionSide = params.positionSide.toUpperCase() as 'LONG' | 'SHORT'
    }

    if (params.orderType === 'limit' || params.orderType === 'maker-only') {
      orderParams.price = Number(params.price)
      orderParams.timeInForce = params.orderType === 'maker-only' ? 'GTX' : (params.timeInForce || 'GTC')
    }

    if (params.clientOrderId) {
      orderParams.newClientOrderId = params.clientOrderId
    }

    if (params.reduceOnly) {
      orderParams.reduceOnly = 'true'
    }

    const result = await wrapAsync<BinanceFuturesOrderResponse>(
      () => this.futuresClient.submitNewOrder(orderParams),
      'PLACE_FUTURES_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    return Ok(this.transformFuturesOrder(result.data))
  }

  private async placeDeliveryOrder(
    params: PlaceOrderParams,
    rawSymbol: string,
    symbolInfo: SymbolInfo
  ): Promise<Result<Order>> {
    // 币本位合约需要将数量转换为张数
    let quantity = params.quantity
    if (symbolInfo.contractValue) {
      const price = parseFloat(params.price || '0')
      if (price > 0) {
        const contracts = coinToContracts(params.symbol, parseFloat(params.quantity), price)
        quantity = String(contracts)
      }
    }

    const orderParams: {
      symbol: string
      side: 'BUY' | 'SELL'
      positionSide?: 'LONG' | 'SHORT'
      type: FuturesOrderType
      quantity: number
      price?: number
      newClientOrderId?: string
      timeInForce?: OrderTimeInForce
      reduceOnly?: BooleanString
    } = {
      symbol: rawSymbol,
      side: params.side.toUpperCase() as 'BUY' | 'SELL',
      type: this.mapOrderType(params.orderType),
      quantity: Number(quantity)
    }

    if (params.positionSide) {
      orderParams.positionSide = params.positionSide.toUpperCase() as 'LONG' | 'SHORT'
    }

    if (params.orderType === 'limit' || params.orderType === 'maker-only') {
      orderParams.price = Number(params.price)
      orderParams.timeInForce = params.orderType === 'maker-only' ? 'GTX' : (params.timeInForce || 'GTC')
    }

    if (params.clientOrderId) {
      orderParams.newClientOrderId = params.clientOrderId
    }

    if (params.reduceOnly) {
      orderParams.reduceOnly = 'true'
    }

    const result = await wrapAsync<BinanceFuturesOrderResponse>(
      () => this.deliveryClient.submitNewOrder(orderParams),
      'PLACE_DELIVERY_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    return Ok(this.transformDeliveryOrder(result.data))
  }

  // ============================================================================
  // 私有方法 - 批量下单
  // ============================================================================

  private async batchPlaceFuturesOrders(
    paramsList: PlaceOrderParams[],
    symbolInfoMap: Map<string, SymbolInfo>
  ): Promise<Result<Order>[]> {
    // 构建批量下单参数
    const batchOrders: NewFuturesOrderParams[] = paramsList.map(params => {
      const key = `${params.symbol}:${params.tradeType}`
      const symbolInfo = symbolInfoMap.get(key)!

      const orderParams: NewFuturesOrderParams = {
        symbol: symbolInfo.rawSymbol,
        side: params.side.toUpperCase() as 'BUY' | 'SELL',
        type: this.mapOrderType(params.orderType),
        quantity: Number(params.quantity)
      }

      if (params.positionSide) {
        orderParams.positionSide = params.positionSide.toUpperCase() as 'LONG' | 'SHORT'
      }

      if (params.orderType === 'limit' || params.orderType === 'maker-only') {
        orderParams.price = Number(params.price)
        orderParams.timeInForce = params.orderType === 'maker-only' ? 'GTX' : (params.timeInForce || 'GTC') as OrderTimeInForce
      }

      if (params.clientOrderId) {
        orderParams.newClientOrderId = params.clientOrderId
      }

      if (params.reduceOnly) {
        orderParams.reduceOnly = 'true'
      }

      return orderParams
    })

    const result = await wrapAsync<Array<NewOrderResult | { code: number; msg?: string }>>(
      () => this.futuresClient.submitMultipleOrders(batchOrders),
      'BATCH_PLACE_FUTURES_ORDER_ERROR'
    )

    if (!result.ok) {
      // 如果整体失败，返回所有失败结果
      return paramsList.map(() => Err(result.error))
    }

    const data = result.data

    // 映射结果
    return data.map((item, index) => {
      if ('code' in item && item.code) {
        return Err({
          code: String(item.code),
          message: ('msg' in item ? item.msg : undefined) || 'Unknown error',
          raw: item
        })
      }
      const orderResult = item as NewOrderResult
      return Ok(this.transformFuturesOrder({
        orderId: orderResult.orderId,
        clientOrderId: orderResult.clientOrderId || '',
        symbol: orderResult.symbol || paramsList[index].symbol,
        side: orderResult.side || paramsList[index].side,
        positionSide: orderResult.positionSide || paramsList[index].positionSide || '',
        status: orderResult.status || 'NEW',
        type: orderResult.type,
        price: orderResult.price || '0',
        avgPrice: orderResult.avgPrice || '0',
        origQty: orderResult.origQty || paramsList[index].quantity,
        executedQty: orderResult.executedQty || '0',
        updateTime: orderResult.updateTime || Date.now()
      }))
    })
  }

  private async batchPlaceDeliveryOrders(
    paramsList: PlaceOrderParams[],
    symbolInfoMap: Map<string, SymbolInfo>
  ): Promise<Result<Order>[]> {
    // 构建批量下单参数
    const batchOrders: NewFuturesOrderParams<string>[] = paramsList.map(params => {
      const key = `${params.symbol}:${params.tradeType}`
      const symbolInfo = symbolInfoMap.get(key)!

      // 币本位合约需要将数量转换为张数
      let quantity = params.quantity
      if (symbolInfo.contractValue) {
        const price = parseFloat(params.price || '0')
        if (price > 0) {
          quantity = String(coinToContracts(params.symbol, parseFloat(params.quantity), price))
        }
      }

      const orderParams: NewFuturesOrderParams<string> = {
        symbol: symbolInfo.rawSymbol,
        side: params.side.toUpperCase() as 'BUY' | 'SELL',
        type: this.mapOrderType(params.orderType),
        quantity
      }

      if (params.positionSide) {
        orderParams.positionSide = params.positionSide.toUpperCase() as 'LONG' | 'SHORT'
      }

      if (params.orderType === 'limit' || params.orderType === 'maker-only') {
        orderParams.price = params.price
        orderParams.timeInForce = params.orderType === 'maker-only' ? 'GTX' : (params.timeInForce || 'GTC') as OrderTimeInForce
      }

      if (params.clientOrderId) {
        orderParams.newClientOrderId = params.clientOrderId
      }

      if (params.reduceOnly) {
        orderParams.reduceOnly = 'true'
      }

      return orderParams
    })

    const result = await wrapAsync<Array<NewOrderResult | { code: number; msg?: string }>>(
      () => this.deliveryClient.submitMultipleOrders(batchOrders),
      'BATCH_PLACE_DELIVERY_ORDER_ERROR'
    )

    if (!result.ok) {
      return paramsList.map(() => Err(result.error))
    }

    const data = result.data
    return data.map((item, index) => {
      if ('code' in item && item.code) {
        return Err({
          code: String(item.code),
          message: ('msg' in item ? item.msg : undefined) || 'Unknown error',
          raw: item
        })
      }
      const orderResult = item as NewOrderResult
      return Ok(this.transformDeliveryOrder({
        orderId: orderResult.orderId,
        clientOrderId: orderResult.clientOrderId || '',
        symbol: orderResult.symbol || paramsList[index].symbol,
        side: orderResult.side || paramsList[index].side,
        positionSide: orderResult.positionSide || paramsList[index].positionSide || '',
        status: orderResult.status || 'NEW',
        type: orderResult.type,
        price: orderResult.price || '0',
        avgPrice: orderResult.avgPrice || '0',
        origQty: orderResult.origQty || paramsList[index].quantity,
        executedQty: orderResult.executedQty || '0',
        updateTime: orderResult.updateTime || Date.now()
      }))
    })
  }

  // ============================================================================
  // 私有方法 - Transform
  // ============================================================================

  private transformOrder(
    data: BinanceOrderResponse,
    symbol: string,
    tradeType: TradeType
  ): Order {
    return {
      orderId: String(data.orderId),
      clientOrderId: data.clientOrderId,
      symbol,
      tradeType,
      side: data.side.toLowerCase() as 'buy' | 'sell',
      positionSide: data.positionSide ? data.positionSide.toLowerCase() as PositionSide : undefined,
      orderType: this.reverseMapOrderType(data.type || 'LIMIT'),
      status: this.mapOrderStatus(data.status),
      price: String(data.price),
      avgPrice: String(data.avgPrice || data.price),
      quantity: String(data.origQty),
      filledQty: String(data.executedQty),
      createTime: data.time || data.transactTime || Date.now(),
      updateTime: data.updateTime || data.time || Date.now(),
    }
  }

  private transformSpotOrder(data: BinanceOrderResponse): Order {
    // BTCUSDT -> BTC-USDT
    const quoteCoins = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB']
    let symbol = data.symbol
    for (const quote of quoteCoins) {
      if (data.symbol.endsWith(quote)) {
        const base = data.symbol.slice(0, -quote.length)
        symbol = `${base}-${quote}`
        break
      }
    }

    return this.transformOrder(data, symbol, 'spot')
  }

  private transformFuturesOrder(data: BinanceFuturesOrderResponse): Order {
    // BTCUSDT -> BTC-USDT
    const { base, quote } = parseBinanceSymbol(data.symbol)
    const symbol = `${base}-${quote}`

    return this.transformOrder({
      ...data,
      price: String(data.price),
      avgPrice: String(data.avgPrice),
      origQty: String(data.origQty),
      executedQty: String(data.executedQty)
    }, symbol, 'futures')
  }

  private transformDeliveryOrder(data: BinanceFuturesOrderResponse): Order {
    // BTCUSD_PERP -> BTC-USD
    const [pair] = data.symbol.split('_')
    const base = pair.replace(/USD$/, '')
    const symbol = `${base}-USD`

    return this.transformOrder({ ...data, avgPrice: data.avgPrice }, symbol, 'delivery')
  }

  private mapOrderType(orderType: string): FuturesOrderType {
    switch (orderType) {
      case 'limit':
        return 'LIMIT'
      case 'market':
        return 'MARKET'
      case 'maker-only':
        return 'LIMIT' // Binance uses timeInForce=GTX for maker-only
      default:
        return 'LIMIT'
    }
  }

  private reverseMapOrderType(type: string): 'limit' | 'market' | 'maker-only' {
    switch (type.toUpperCase()) {
      case 'LIMIT':
        return 'limit'
      case 'MARKET':
        return 'market'
      default:
        return 'limit'
    }
  }

  private mapOrderStatus(status: string): OrderStatus {
    switch (status) {
      case 'NEW':
        return 'open'
      case 'PARTIALLY_FILLED':
        return 'partial'
      case 'FILLED':
        return 'filled'
      case 'CANCELED':
        return 'canceled'
      case 'REJECTED':
        return 'rejected'
      case 'EXPIRED':
        return 'expired'
      default:
        return 'open'
    }
  }
}
