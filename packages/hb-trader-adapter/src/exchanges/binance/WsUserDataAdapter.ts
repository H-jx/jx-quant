import { WebsocketClient, WsUserDataEvents, WsMessageFuturesUserDataAccountUpdateFormatted, WsMessageFuturesUserDataTradeUpdateEventFormatted } from 'binance'
import { BaseWsUserDataAdapter } from '../../core/BaseWsUserDataAdapter'
import type {
  Exchange,
  TradeType,
  WsEventHandler,
  WsSubscribeOptions,
  WsOrderUpdate,
  WsPositionUpdate,
  WsBalanceUpdate,
  WsAccountUpdate,
  OrderStatus,
  OrderSide,
  PositionSide,
  OrderType,
} from '../../core/types'
import { parseBinanceSymbol } from './utils'
import { createProxyAgent } from '../../core/utils'

// ============================================================================
// 初始化参数
// ============================================================================

export interface BinanceWsUserDataAdapterInit {
  apiKey: string
  apiSecret: string
  /** 是否使用测试网 */
  simulated?: boolean
  httpsProxy?: string
  socksProxy?: string
}

// ============================================================================
// Binance WebSocket 用户数据适配器
// ============================================================================

export class BinanceWsUserDataAdapter extends BaseWsUserDataAdapter {
  readonly exchange: Exchange = 'binance'

  private wsClient: WebsocketClient
  private connectedTradeTypes: Set<TradeType> = new Set()
  private subscribeOptions: Map<TradeType, WsSubscribeOptions> = new Map()
  /** 是否使用测试网 */
  readonly testnet: boolean

  constructor(config: BinanceWsUserDataAdapterInit) {
    super()
    this.testnet = config.simulated || false

    this.wsClient = new WebsocketClient({
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      beautify: true, // 使用格式化的响应
      wsOptions: {
        agent: createProxyAgent({ socksProxy: config.socksProxy })
      },
      // Ensure REST listenKey/keep-alive calls use the same proxy agent
      requestOptions: (() => {
        const agent = createProxyAgent({ socksProxy: config.socksProxy, httpsProxy: config.httpsProxy })
        if (!agent) return undefined
        return { httpAgent: agent, httpsAgent: agent }
      })(),
    })

    this.setupEventHandlers()
  }

  // ============================================================================
  // 连接状态
  // ============================================================================

  isConnected(tradeType?: TradeType): boolean {
    if (tradeType) {
      return this.connectedTradeTypes.has(tradeType)
    }
    return this.connectedTradeTypes.size > 0
  }

  // ============================================================================
  // 订阅/取消订阅
  // ============================================================================

  async subscribe(options: WsSubscribeOptions, handler: WsEventHandler): Promise<void> {
    const { tradeType, autoReconnect, reconnectInterval, maxReconnectAttempts } = options

    // 更新重连配置
    if (autoReconnect !== undefined) this.reconnectConfig.autoReconnect = autoReconnect
    if (reconnectInterval !== undefined) this.reconnectConfig.reconnectInterval = reconnectInterval
    if (maxReconnectAttempts !== undefined) this.reconnectConfig.maxReconnectAttempts = maxReconnectAttempts

    // 添加全局处理器
    this.addGlobalHandler(handler)

    // 保存订阅选项
    this.subscribeOptions.set(tradeType, options)

    // Binance 使用不同的 WebSocket 端点
    switch (tradeType) {
      case 'spot':
        this.wsClient.subscribeSpotUserDataStream()
        break
      case 'futures':
        this.wsClient.subscribeUsdFuturesUserDataStream()
        break
      case 'delivery':
        this.wsClient.subscribeCoinFuturesUserDataStream()
        break
    }
  }

  async unsubscribe(tradeType?: TradeType): Promise<void> {
    if (tradeType) {
      this.subscribeOptions.delete(tradeType)
      this.connectedTradeTypes.delete(tradeType)
      // Binance WebSocket client 不支持单独取消订阅，需要关闭整个连接
    } else {
      this.subscribeOptions.clear()
      this.connectedTradeTypes.clear()
    }
  }

  async close(): Promise<void> {
    this.wsClient.closeAll()
    this.connectedTradeTypes.clear()
    this.subscribeOptions.clear()
    this.clearAllListeners()
  }

  // ============================================================================
  // 事件处理
  // ============================================================================

  private setupEventHandlers(): void {
    // 连接状态
    this.wsClient.on('open', (event) => {
      console.log('[Binance WS] Connected:', event.wsKey)
      const tradeType = this.wsKeyToTradeType(event.wsKey)
      if (tradeType) {
        this.connectedTradeTypes.add(tradeType)
        this.emitConnected(tradeType)
      }
    })

    this.wsClient.on('close', (event) => {
      console.log('[Binance WS] Disconnected:', event.wsKey)
      const tradeType = this.wsKeyToTradeType(event.wsKey)
      if (tradeType) {
        this.connectedTradeTypes.delete(tradeType)
        this.emitDisconnected(tradeType, 'Connection closed')
      }
    })

    this.wsClient.on('exception', (error: { message?: string }) => {
      console.error('[Binance WS] Error:', error)
      this.emitError('WS_ERROR', error?.message || 'Unknown error')
    })

    // 格式化的用户数据事件
    this.wsClient.on('formattedUserDataMessage', (data: WsUserDataEvents) => {
      this.handleFormattedUserData(data)
    })
  }

  private handleFormattedUserData(data: WsUserDataEvents): void {
    const eventType = data.eventType

    switch (eventType) {
      case 'ORDER_TRADE_UPDATE':
        this.handleOrderTradeUpdate(data as any)
        break

      case 'ACCOUNT_UPDATE':
        this.handleAccountUpdateEvent(data as WsMessageFuturesUserDataAccountUpdateFormatted)
        break

      // 现货订单更新
      case 'executionReport':
        this.handleSpotOrderUpdate(data as any)
        break

      // 现货账户更新
      case 'outboundAccountPosition':
        this.handleSpotAccountUpdate(data as any)
        break
    }
  }

  private handleOrderTradeUpdate(data: WsMessageFuturesUserDataTradeUpdateEventFormatted): void {
    const order = data.order
    const tradeType = this.detectFuturesType(order.symbol)
    const symbol = this.convertSymbol(order.symbol, tradeType)

    const update: WsOrderUpdate = {
      eventType: 'order',
      symbol,
      tradeType,
      orderId: String(order.orderId),
      clientOrderId: order.clientOrderId,
      side: order.orderSide.toLowerCase() as OrderSide,
      positionSide: order.positionSide?.toLowerCase() as PositionSide,
      orderType: this.mapOrderType(order.orderType),
      status: this.mapOrderStatus(order.orderStatus),
      price: String(order.originalPrice),
      quantity: String(order.originalQuantity),
      filledQuantity: String(order.lastFilledQuantity || 0),
      avgPrice: String(order.averagePrice),
      fee: String(order.commissionAmount),
      feeAsset: order.commissionAsset,
      reduceOnly: order.isReduceOnly,
      updateTime: order.orderTradeTime,
      raw: data
    }

    this.emitOrderUpdate(update)
  }

  private handleSpotOrderUpdate(data: any): void {
    const tradeType: TradeType = 'spot'
    const symbol = this.convertSymbol(data.symbol, tradeType)

    const update: WsOrderUpdate = {
      eventType: 'order',
      symbol,
      tradeType,
      orderId: String(data.orderId),
      clientOrderId: data.originalClientOrderId || data.newClientOrderId,
      side: data.side.toLowerCase() as OrderSide,
      orderType: this.mapOrderType(data.orderType),
      status: this.mapOrderStatus(data.orderStatus),
      price: data.price,
      quantity: data.quantity,
      filledQuantity: data.accumulatedQuantity,
      avgPrice: data.averagePrice,
      fee: data.commission,
      feeAsset: data.commissionAsset,
      updateTime: data.orderTradeTime || data.eventTime,
      raw: data
    }

    this.emitOrderUpdate(update)
  }

  private handleAccountUpdateEvent(data: WsMessageFuturesUserDataAccountUpdateFormatted): void {
    const updateData = data.updateData
    const tradeType = this.detectFuturesTypeFromBalances(updateData.updatedBalances)
    const updateTime = data.eventTime

    // 发送余额更新
    updateData.updatedBalances.forEach((balance) => {
      const balanceUpdate: WsBalanceUpdate = {
        eventType: 'balance',
        asset: balance.asset,
        tradeType,
        available: String(balance.crossWalletBalance),
        total: String(balance.walletBalance),
        updateTime,
        raw: balance
      }
      this.emitBalanceUpdate(balanceUpdate)
    })

    // 发送持仓更新
    updateData.updatedPositions.forEach((position) => {
      const positionTradeType = this.detectFuturesType(position.symbol)
      const symbol = this.convertSymbol(position.symbol, positionTradeType)

      const positionUpdate: WsPositionUpdate = {
        eventType: 'position',
        symbol,
        tradeType: positionTradeType,
        positionSide: position.positionSide?.toLowerCase() as PositionSide || 'long',
        quantity: String(position.positionAmount),
        entryPrice: String(position.entryPrice),
        unrealizedPnl: String(position.unrealisedPnl),
        marginType: position.marginType === 'cross' ? 'cross' : 'isolated',
        updateTime,
        raw: position
      }
      this.emitPositionUpdate(positionUpdate)
    })

    // 发送综合账户更新
    const accountUpdate: WsAccountUpdate = {
      eventType: 'account',
      tradeType,
      balances: updateData.updatedBalances.map((balance) => ({
        asset: balance.asset,
        tradeType,
        available: String(balance.crossWalletBalance),
        total: String(balance.walletBalance),
        updateTime,
        raw: balance
      })),
      positions: updateData.updatedPositions.map((position) => {
        const positionTradeType = this.detectFuturesType(position.symbol)
        const symbol = this.convertSymbol(position.symbol, positionTradeType)
        return {
          symbol,
          tradeType: positionTradeType,
          positionSide: position.positionSide?.toLowerCase() as PositionSide || 'long',
          quantity: String(position.positionAmount),
          entryPrice: String(position.entryPrice),
          unrealizedPnl: String(position.unrealisedPnl),
          marginType: (position.marginType === 'cross' ? 'cross' : 'isolated') as 'cross' | 'isolated',
          updateTime,
          raw: position
        }
      }),
      updateTime,
      raw: data
    }

    this.emitAccountUpdate(accountUpdate)
  }

  private handleSpotAccountUpdate(data: any): void {
    const tradeType: TradeType = 'spot'
    const updateTime = data.eventTime

    // 发送余额更新
    data.balances?.forEach((balance: any) => {
      const balanceUpdate: WsBalanceUpdate = {
        eventType: 'balance',
        asset: balance.asset,
        tradeType,
        available: balance.availableBalance,
        total: String(parseFloat(balance.availableBalance) + parseFloat(balance.onOrderBalance || '0')),
        frozen: balance.onOrderBalance,
        updateTime,
        raw: balance
      }
      this.emitBalanceUpdate(balanceUpdate)
    })
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private wsKeyToTradeType(wsKey: string): TradeType | undefined {
    if (wsKey.includes('spot') || wsKey.includes('main')) {
      return 'spot'
    } else if (wsKey.includes('usdm') || wsKey.includes('fapi')) {
      return 'futures'
    } else if (wsKey.includes('coinm') || wsKey.includes('dapi')) {
      return 'delivery'
    }
    return undefined
  }

  private detectFuturesType(symbol: string): TradeType {
    // COINM 合约通常包含 _PERP 或 _日期 后缀
    if (symbol.includes('_')) {
      return 'delivery'
    }
    return 'futures'
  }

  private detectFuturesTypeFromBalances(_balances: unknown[]): TradeType {
    // 如果包含 BTC, ETH 等作为保证金，可能是币本位
    // 简化处理，默认返回 futures
    return 'futures'
  }

  private convertSymbol(rawSymbol: string, tradeType: TradeType): string {
    if (tradeType === 'delivery') {
      // COINM: BTCUSD_PERP -> BTC-USD
      const [pair] = rawSymbol.split('_')
      const base = pair.replace(/USD$/, '')
      return `${base}-USD`
    } else {
      // USDM/Spot: BTCUSDT -> BTC-USDT
      const { base, quote } = parseBinanceSymbol(rawSymbol)
      return `${base}-${quote}`
    }
  }

  private mapOrderType(orderType: string): OrderType {
    switch (orderType?.toUpperCase()) {
      case 'MARKET':
        return 'market'
      case 'LIMIT':
        return 'limit'
      case 'LIMIT_MAKER':
        return 'maker-only'
      case 'STOP':
      case 'STOP_MARKET':
      case 'TAKE_PROFIT':
      case 'TAKE_PROFIT_MARKET':
        return 'limit'
      default:
        return 'limit'
    }
  }

  private mapOrderStatus(status: string): OrderStatus {
    switch (status?.toUpperCase()) {
      case 'NEW':
        return 'open'
      case 'PARTIALLY_FILLED':
        return 'partial'
      case 'FILLED':
        return 'filled'
      case 'CANCELED':
      case 'CANCELLED':
        return 'canceled'
      case 'EXPIRED':
      case 'REJECTED':
        return 'canceled'
      default:
        return 'open'
    }
  }
}
