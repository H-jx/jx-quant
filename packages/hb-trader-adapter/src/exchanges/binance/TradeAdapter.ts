import {
  MainClient,
  USDMClient,
  CoinMClient,
  FuturesOrderType,
  OrderTimeInForce,
  BooleanString,
  NewFuturesOrderParams,
  NewOrderResult,
  OrderType,
  OrderSide,
  SelfTradePreventionMode,
  RestClientOptions,
  FuturesAlgoOrderResponse,
  FuturesCancelAlgoOrderResponse,
} from 'binance'
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
} from '../../core/types'
import { Ok, Err, wrapAsync, createProxyAgent, coinToContracts } from '../../core/utils'
import { BaseTradeAdapter } from '../../core/BaseTradeAdapter'
import { ErrorCodes } from '../../core/errorCodes'
import {
  unifiedToBinance,
  parseBinanceSymbol,
  generateBinanceClientOrderId
} from './utils'
import { BinancePublicAdapter } from './PublicAdapter'
import { IPublicAdapter } from '../../core/BasePublicAdapter'

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
  origQty?: numberInString
  executedQty?: numberInString
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

interface BinanceAlgoOrderResponse {
  algoId: number
  clientAlgoId?: string
  symbol: string
  side: string
  positionSide?: string
  algoStatus: string
  orderType: string
  price?: numberInString
  quantity?: numberInString
  triggerPrice?: numberInString
  workingType?: string
  activationPrice?: numberInString
  callbackRate?: numberInString
  createTime?: number
  updateTime?: number
  triggerTime?: number
}

export interface OrderFill {
  price: numberInString;
  qty: numberInString;
  commission: numberInString;
  commissionAsset: string;
}
export interface OrderResponseFull {
  symbol: string;
  orderId: number;
  orderListId?: number;
  clientOrderId: string;
  transactTime: number;
  price: numberInString;
  origQty: numberInString;
  executedQty: numberInString;
  cummulativeQuoteQty: numberInString;
  status: OrderStatus;
  timeInForce: OrderTimeInForce;
  type: OrderType;
  side: OrderSide;
  marginBuyBorrowAmount?: number;
  marginBuyBorrowAsset?: string;
  isIsolated?: boolean;
  workingTime: number;
  selfTradePreventionMode: SelfTradePreventionMode;
  fills: OrderFill[];
}

type BinanceTradeAdapterParams = TradeAdapterInit<BinancePublicAdapter> & {

}
/**
 * Binance 交易 API 适配器
 * 使用组合模式，公共 API 委托给 BinancePublicAdapter
 */
export class BinanceTradeAdapter extends BaseTradeAdapter {
  static publicAdapter: BinancePublicAdapter
  /** 组合的公共适配器 */
  readonly publicAdapter: IPublicAdapter

  protected spotClient: MainClient
  protected futuresClient: USDMClient
  protected deliveryClient: CoinMClient

  constructor({ apiKey, apiSecret, httpsProxy, socksProxy, publicAdapter, demonet }: BinanceTradeAdapterParams) {
    super()
    const config: RestClientOptions = {
      api_key: apiKey,
      api_secret: apiSecret,
      testnet: demonet || false
    }
    const requestOptions: AxiosRequestConfig = {}


    if (httpsProxy || socksProxy) {
      const agent = createProxyAgent({ httpsProxy, socksProxy })
      requestOptions.httpAgent = agent
      requestOptions.httpsAgent = agent
    }

    this.spotClient = new MainClient(config, requestOptions)
    this.futuresClient = new USDMClient(config, requestOptions)
    this.deliveryClient = new CoinMClient(config, requestOptions)
    // 复用公共适配器实例
    if (BinanceTradeAdapter.publicAdapter === undefined) {
      BinanceTradeAdapter.publicAdapter = publicAdapter || new BinancePublicAdapter({ httpsProxy, socksProxy })
    }
    this.publicAdapter = BinanceTradeAdapter.publicAdapter
  }

  protected generateClientOrderId(tradeType: TradeType): string {
    return generateBinanceClientOrderId(tradeType)
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
      return this.batchPlaceFuturesOrders(paramsList)
    }

    if (tradeType === 'delivery') {
      return this.batchPlaceDeliveryOrders(paramsList)
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
        code: ErrorCodes.INVALID_TRADE_TYPE,
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
      () => this.futuresClient.getBalanceV3(),
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
      type: OrderType
      quantity: number
      price?: number
      newClientOrderId?: string
      timeInForce?: OrderTimeInForce
    } = {
      symbol: rawSymbol,
      side: params.side.toUpperCase() as 'BUY' | 'SELL',
      type: this.mapOrderType(params.orderType) as OrderType,
      quantity: Number(params.quantity)
    }

    if (params.orderType === 'limit' || params.orderType === 'maker-only') {
      orderParams.price = Number(params.price)
      orderParams.timeInForce = params.orderType === 'maker-only' ? 'GTX' : (params.timeInForce || 'GTC')
    }

    if (params.clientOrderId) {
      orderParams.newClientOrderId = params.clientOrderId
    }

    const result = await wrapAsync<OrderResponseFull>(
      () => this.spotClient.submitNewOrder(orderParams) as Promise<OrderResponseFull>,
      'PLACE_SPOT_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }
    if (result.data.origQty == undefined) {
      return Err({ code: ErrorCodes.INVALID_ORDER_RESPONSE, message: `order ACK received, but full order data not available` });
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
      type: this.mapOrderType(params.orderType) as FuturesOrderType,
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
      const price = Number(params.price)
      if (price && price > 0) {
        const contracts = coinToContracts(params.symbol, Number(params.quantity), price)
        quantity = contracts
      }
    }

    const orderParams: NewFuturesOrderParams<number> = {
      symbol: rawSymbol,
      side: params.side.toUpperCase() as 'BUY' | 'SELL',
      type: this.mapOrderType(params.orderType) as FuturesOrderType,
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
    paramsList: PlaceOrderParams[]
  ): Promise<Result<Order>[]> {
    if (!Array.isArray(paramsList) || !paramsList[0]) {
      return []
    }
    const orderType = paramsList[0].tradeType
    const allSymbolsResult = await BinanceTradeAdapter.publicAdapter.getAllSymbols(orderType)
    if (!allSymbolsResult.ok) {
      return paramsList.map(() => Err(allSymbolsResult.error))
    }
    // 构建批量下单参数
    const batchOrders: NewFuturesOrderParams[] = paramsList.map(params => {
      const symboInfo = allSymbolsResult.data.find(s => s.symbol === params.symbol);
      if (!symboInfo) {
        throw new Error(`Symbol info not found for ${params.symbol} in batchPlaceFuturesOrders`);
      }
      const orderParams: NewFuturesOrderParams = {
        symbol: symboInfo.rawSymbol,
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
    paramsList: PlaceOrderParams[]
  ): Promise<Result<Order>[]> {

    if (!Array.isArray(paramsList) || !paramsList[0]) {
      return []
    }
    const orderType = paramsList[0].tradeType
    const allSymbolsResult = await BinanceTradeAdapter.publicAdapter.getAllSymbols(orderType)
    if (!allSymbolsResult.ok) {
      return paramsList.map(() => Err(allSymbolsResult.error))
    }
    // 构建批量下单参数
    const batchOrders: NewFuturesOrderParams<string>[] = paramsList.map(params => {
      const symbolInfo = allSymbolsResult.data.find(s => s.symbol === params.symbol);
      if (!symbolInfo) {
        throw new Error(`Symbol info not found for ${params.symbol} in batchPlaceDeliveryOrders`);
      }

      // 币本位合约需要将数量转换为张数
      let quantity = params.quantity
      if (symbolInfo.contractValue) {
        const price = Number(params.price)
        if (price && price > 0) {
          quantity = coinToContracts(params.symbol, Number(params.quantity), price)
        }
      }

      const orderParams: NewFuturesOrderParams<string> = {
        symbol: symbolInfo.rawSymbol,
        side: params.side.toUpperCase() as 'BUY' | 'SELL',
        type: this.mapOrderType(params.orderType),
        quantity: String(quantity)
      }

      if (params.positionSide) {
        orderParams.positionSide = params.positionSide.toUpperCase() as 'LONG' | 'SHORT'
      }

      if (params.orderType === 'limit' || params.orderType === 'maker-only') {
        orderParams.price = String(params.price)
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

  // ============================================================================
  // 策略订单 (Algo Order) 实现
  // ============================================================================

  /**
   * 策略下单 (止盈止损/计划委托/移动止盈止损)
   * Binance 合约使用 /fapi/v1/algoOrder 接口
   */
  async placeStrategyOrder(params: StrategyOrderParams): Promise<Result<StrategyOrder>> {
    if (params.tradeType === 'spot') {
      return Err({
        code: ErrorCodes.INVALID_TRADE_TYPE,
        message: 'Binance spot does not support strategy orders through algo API'
      })
    }

    const rawSymbol = unifiedToBinance(params.symbol, params.tradeType)

    // 构建 Binance 策略订单请求
    const algoRequest: {
      algoType: 'CONDITIONAL'
      symbol: string
      side: 'BUY' | 'SELL'
      positionSide?: 'LONG' | 'SHORT' | 'BOTH'
      type: string
      quantity?: string
      price?: string
      triggerPrice?: string
      workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE'
      reduceOnly?: string
      clientAlgoId?: string
      activationPrice?: string
      callbackRate?: string
    } = {
      algoType: 'CONDITIONAL',
      symbol: rawSymbol,
      side: params.side.toUpperCase() as 'BUY' | 'SELL',
      type: this.mapBinanceStrategyOrderType(params.strategyType, params.orderPrice),
      quantity: String(params.quantity),
      triggerPrice: String(params.triggerPrice),
    }

    // 持仓方向
    if (params.positionSide) {
      algoRequest.positionSide = params.positionSide.toUpperCase() as 'LONG' | 'SHORT'
    } else {
      algoRequest.positionSide = 'BOTH'
    }

    // 触发价类型
    if (params.triggerPriceType) {
      algoRequest.workingType = params.triggerPriceType === 'mark' ? 'MARK_PRICE' : 'CONTRACT_PRICE'
    }

    // 委托价格 (限价单)
    if (params.orderPrice && Number(params.orderPrice) > 0) {
      algoRequest.price = String(params.orderPrice)
    }

    // 只减仓: Binance 在双开(hedge)模式下不接受 reduceOnly 参数
    // 只在未指定 positionSide 的情况下传递 reduceOnly（即 one-way 模式）
    if (params.reduceOnly && !params.positionSide) {
      algoRequest.reduceOnly = 'true'
    }

    // 客户端策略订单ID
    if (params.clientAlgoId) {
      algoRequest.clientAlgoId = params.clientAlgoId
    }

    // 移动止盈止损专用参数
    if (params.strategyType === 'trailing-stop') {
      if (params.activationPrice !== undefined) {
        algoRequest.activationPrice = String(params.activationPrice)
      }
      if (params.callbackRatio !== undefined) {
        // Binance callbackRate 范围是 0.1-10，代表 0.1%-10%
        algoRequest.callbackRate = String(params.callbackRatio * 100)
      }
    }

    const result = await wrapAsync<BinanceAlgoOrderResponse>(
      () => {
        if (params.tradeType === 'futures') {
          return this.futuresClient.submitNewAlgoOrder(algoRequest as any)
        } else {
          throw new Error('Not implemented delivery algo order')
        }
      },
      ErrorCodes.PLACE_STRATEGY_ORDER_ERROR
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    // 返回策略订单信息
    const strategyOrder: StrategyOrder = {
      algoId: String(data.algoId),
      clientAlgoId: data.clientAlgoId || params.clientAlgoId,
      symbol: params.symbol,
      tradeType: params.tradeType,
      side: params.side,
      positionSide: params.positionSide,
      strategyType: params.strategyType,
      status: this.mapBinanceAlgoOrderStatus(data.algoStatus),
      triggerPrice: String(params.triggerPrice),
      triggerPriceType: params.triggerPriceType,
      orderPrice: params.orderPrice ? String(params.orderPrice) : undefined,
      quantity: String(params.quantity),
      createTime: data.createTime,
      updateTime: data.updateTime,
      raw: data
    }

    return Ok(strategyOrder)
  }

  /**
   * 撤销策略订单
   */
  async cancelStrategyOrder(
    _symbol: string,
    algoId: string,
    tradeType: TradeType
  ): Promise<Result<StrategyOrder>> {
    if (tradeType === 'spot') {
      return Err({
        code: ErrorCodes.INVALID_TRADE_TYPE,
        message: 'Binance spot does not support strategy orders through algo API'
      })
    }

    // const rawSymbol = unifiedToBinance(symbol, tradeType)

    const result = await wrapAsync<FuturesCancelAlgoOrderResponse>(
      () => {
        if (tradeType === 'futures') {
          return this.futuresClient.cancelAlgoOrder({ algoId: parseInt(algoId) })
        } else {
          throw new Error('Not implemented delivery cancel algo order')
        }
      },
      ErrorCodes.CANCEL_ORDER_ERROR
    )

    if (!result.ok) {
      return Err(result.error)
    }

    // 返回取消后的订单信息
    return this.getStrategyOrder(algoId, tradeType)
  }

  /**
   * 获取策略订单详情
   */
  async getStrategyOrder(
    algoId: string,
    tradeType: TradeType
  ): Promise<Result<StrategyOrder>> {
    if (tradeType === 'spot') {
      return Err({
        code: ErrorCodes.INVALID_TRADE_TYPE,
        message: 'Binance spot does not support strategy orders through algo API'
      })
    }

    const result = await wrapAsync<BinanceAlgoOrderResponse>(
      () => {
        if (tradeType === 'futures') {
          return this.futuresClient.getAlgoOrder({ algoId: parseInt(algoId) })
        } else {
          throw new Error('Not implemented delivery get algo order')
        }
      },
      'GET_STRATEGY_ORDER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data
    return Ok(this.transformBinanceAlgoOrder(data, tradeType))
  }

  /**
   * 获取未完成策略订单列表
   */
  async getOpenStrategyOrders(
    symbol?: string,
    tradeType?: TradeType
  ): Promise<Result<StrategyOrder[]>> {
    const orders: StrategyOrder[] = []

    // 获取 USDM 策略订单
    if (!tradeType || tradeType === 'futures') {
      const params: { symbol?: string } = {}
      if (symbol) {
        params.symbol = unifiedToBinance(symbol, 'futures')
      }

      const futuresResult = await wrapAsync<FuturesAlgoOrderResponse[]>(
        () => this.futuresClient.getOpenAlgoOrders(params),
        'GET_FUTURES_OPEN_STRATEGY_ORDERS_ERROR'
      )

      if (futuresResult.ok && futuresResult.data) {
        orders.push(...futuresResult.data.map(o => this.transformBinanceAlgoOrder(o, 'futures')))
      }
    }

    // 获取 COINM 策略订单
    if (!tradeType || tradeType === 'delivery') {
      return Err({
        code: "NOT_IMPLEMENTED",
        message: 'Binance delivery algo orders not implemented'
      })
    }

    return Ok(orders)
  }

  // ============================================================================
  // 策略订单辅助方法
  // ============================================================================

  private transformBinanceAlgoOrder(
    data: BinanceAlgoOrderResponse,
    tradeType: TradeType
  ): StrategyOrder {
    // 转换 symbol
    let symbol: string
    if (tradeType === 'delivery') {
      const [pair] = data.symbol.split('_')
      const base = pair.replace(/USD$/, '')
      symbol = `${base}-USD`
    } else {
      const { base, quote } = parseBinanceSymbol(data.symbol)
      symbol = `${base}-${quote}`
    }

    return {
      algoId: String(data.algoId),
      clientAlgoId: data.clientAlgoId || undefined,
      symbol,
      tradeType,
      side: data.side.toLowerCase() as 'buy' | 'sell',
      positionSide: data.positionSide ? data.positionSide.toLowerCase() as PositionSide : undefined,
      strategyType: this.reverseBinanceStrategyOrderType(data.orderType),
      status: this.mapBinanceAlgoOrderStatus(data.algoStatus),
      triggerPrice: String(data.triggerPrice || ''),
      triggerPriceType: data.workingType === 'MARK_PRICE' ? 'mark' : 'last',
      orderPrice: data.price ? String(data.price) : undefined,
      quantity: String(data.quantity || ''),
      createTime: data.createTime,
      updateTime: data.updateTime,
      triggerTime: data.triggerTime || undefined,
      raw: data
    }
  }

  private mapBinanceStrategyOrderType(strategyType: StrategyOrderType, orderPrice?: string | number): string {
    const isMarket = !orderPrice || Number(orderPrice) <= 0

    switch (strategyType) {
      case 'stop-loss':
        return isMarket ? 'STOP_MARKET' : 'STOP'
      case 'take-profit':
        return isMarket ? 'TAKE_PROFIT_MARKET' : 'TAKE_PROFIT'
      case 'trigger':
        return isMarket ? 'STOP_MARKET' : 'STOP' // Binance 没有纯计划委托，使用 STOP
      case 'trailing-stop':
        return 'TRAILING_STOP_MARKET'
      default:
        return 'STOP_MARKET'
    }
  }

  private reverseBinanceStrategyOrderType(orderType: string): StrategyOrderType {
    switch (orderType?.toUpperCase()) {
      case 'STOP':
      case 'STOP_MARKET':
        return 'stop-loss'
      case 'TAKE_PROFIT':
      case 'TAKE_PROFIT_MARKET':
        return 'take-profit'
      case 'TRAILING_STOP_MARKET':
        return 'trailing-stop'
      default:
        return 'trigger'
    }
  }

  private mapBinanceAlgoOrderStatus(status: string): StrategyOrderStatus {
    switch (status?.toUpperCase()) {
      case 'NEW':
        return 'live'
      case 'TRIGGERED':
      case 'FILLED':
        return 'effective'
      case 'CANCELLED':
      case 'CANCELED':
        return 'canceled'
      case 'REJECTED':
      case 'EXPIRED':
        return 'failed'
      default:
        return 'live'
    }
  }

  private mapOrderType(orderType: string) {
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
