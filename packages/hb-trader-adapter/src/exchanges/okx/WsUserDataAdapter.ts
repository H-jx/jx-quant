import { WebsocketClient } from 'okx-api'
import { BaseWsUserDataAdapter } from '../../core/BaseWsUserDataAdapter'
import type {
  Exchange,
  TradeType,
  WsEventHandler,
  WsSubscribeOptions,
  WsOrderUpdate,
  WsStrategyOrderUpdate,
  WsPositionUpdate,
  WsBalanceUpdate,
  WsAccountUpdate,
  OrderStatus,
  OrderSide,
  PositionSide,
  OrderType,
  StrategyOrderType,
  StrategyOrderStatus,
} from '../../core/types'
import { okxToUnified } from './utils'
import { createProxyAgent } from '../../core/utils'

// ============================================================================
// OKX WebSocket 响应类型
// ============================================================================

interface OkxWsOrderData {
  instId: string
  instType: string
  ordId: string
  clOrdId?: string
  side: string
  posSide?: string
  ordType: string
  state: string
  px: string
  sz: string
  fillSz: string
  avgPx?: string
  fee?: string
  feeCcy?: string
  reduceOnly?: string
  uTime: string
}

interface OkxWsAlgoOrderData {
  instId: string
  instType: string
  algoId: string
  algoClOrdId?: string
  side: string
  posSide?: string
  ordType: string
  state: string
  triggerPx: string
  ordPx?: string
  sz: string
  triggerTime?: string
  uTime: string
}

interface OkxWsPositionData {
  instId: string
  instType: string
  posSide: string
  pos: string
  avgPx: string
  upl: string
  lever?: string
  mgnMode: string
  liqPx?: string
  uTime: string
}

interface OkxWsBalanceData {
  ccy: string
  cashBal: string
  availBal: string
  frozenBal: string
  upl?: string
  uTime: string
}

interface OkxWsAccountData {
  details: OkxWsBalanceData[]
  uTime: string
}

// ============================================================================
// 初始化参数
// ============================================================================

export interface OkxWsUserDataAdapterInit {
  apiKey: string
  apiSecret: string
  passphrase: string
  /** 是否使用模拟盘 */
  simulated?: boolean
  httpsProxy?: string
  socksProxy?: string
}

// ============================================================================
// OKX WebSocket 用户数据适配器
// ============================================================================

export class OkxWsUserDataAdapter extends BaseWsUserDataAdapter {
  readonly exchange: Exchange = 'okx'

  private wsClient: WebsocketClient
  private connectedTradeTypes: Set<TradeType> = new Set()
  private subscribeOptions: Map<TradeType, WsSubscribeOptions> = new Map()
  /** 是否使用模拟盘 */
  readonly simulated: boolean

  constructor(config: OkxWsUserDataAdapterInit) {
    super()
    this.simulated = config.simulated || false

    this.wsClient = new WebsocketClient({
      accounts: [{
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        apiPass: config.passphrase
      }],
      demoTrading: this.simulated,
      wsOptions: {
        agent: createProxyAgent({ socksProxy: config.socksProxy })
      }
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

    // OKX 使用统一的私有 WebSocket，订阅不同频道
    // 订阅订单频道
    this.wsClient.subscribe({
      channel: 'orders',
      instType: this.getOkxInstType(tradeType)
    })

    // 订阅策略订单频道
    this.wsClient.subscribe({
      channel: 'orders-algo',
      instType: this.getOkxInstType(tradeType)
    })

    // 订阅持仓频道 (合约)
    if (tradeType !== 'spot') {
      this.wsClient.subscribe({
        channel: 'positions',
        instType: this.getOkxInstType(tradeType)
      })
    }

    // 订阅账户频道
    this.wsClient.subscribe({
      channel: 'account'
    })
  }

  async unsubscribe(tradeType?: TradeType): Promise<void> {
    if (tradeType) {
      // 取消特定交易类型的订阅
      this.wsClient.unsubscribe({
        channel: 'orders',
        instType: this.getOkxInstType(tradeType)
      })
      this.wsClient.unsubscribe({
        channel: 'orders-algo',
        instType: this.getOkxInstType(tradeType)
      })
      if (tradeType !== 'spot') {
        this.wsClient.unsubscribe({
          channel: 'positions',
          instType: this.getOkxInstType(tradeType)
        })
      }
      this.subscribeOptions.delete(tradeType)
      this.connectedTradeTypes.delete(tradeType)
    } else {
      // 取消所有订阅
      for (const tt of this.subscribeOptions.keys()) {
        await this.unsubscribe(tt)
      }
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
      console.log('[OKX WS] Connected:', event.wsKey)
    })

    this.wsClient.on('authenticated', (event) => {
      console.log('[OKX WS] Authenticated:', event.wsKey)
      // 标记所有订阅的交易类型为已连接
      for (const tradeType of this.subscribeOptions.keys()) {
        this.connectedTradeTypes.add(tradeType)
        this.emitConnected(tradeType)
      }
    })

    this.wsClient.on('close', (event) => {
      console.log('[OKX WS] Disconnected:', event.wsKey)
      for (const tradeType of this.connectedTradeTypes) {
        this.emitDisconnected(tradeType, 'Connection closed')
      }
      this.connectedTradeTypes.clear()
    })

    this.wsClient.on('exception', (error: { message?: string }) => {
      console.error('[OKX WS] Error:', error)
      this.emitError('WS_ERROR', error?.message || 'Unknown error')
    })

    // 数据更新
    this.wsClient.on('update', (data: any) => {
      this.handleUpdate(data)
    })
  }

  private handleUpdate(data: any): void {
    const { arg, data: updates } = data
    if (!arg || !updates || !Array.isArray(updates)) return

    const channel = arg.channel
    const instType = arg.instType

    switch (channel) {
      case 'orders':
        updates.forEach((order: OkxWsOrderData) => {
          this.handleOrderUpdate(order, instType)
        })
        break

      case 'orders-algo':
        updates.forEach((algoOrder: OkxWsAlgoOrderData) => {
          this.handleAlgoOrderUpdate(algoOrder, instType)
        })
        break

      case 'positions':
        updates.forEach((position: OkxWsPositionData) => {
          this.handlePositionUpdate(position, instType)
        })
        break

      case 'account':
        if (updates[0]) {
          this.handleAccountUpdate(updates[0] as OkxWsAccountData, instType)
        }
        break
    }
  }

  private handleOrderUpdate(order: OkxWsOrderData, instType: string): void {
    const tradeType = this.instTypeToTradeType(instType)
    const { symbol } = okxToUnified(order.instId)

    const update: WsOrderUpdate = {
      eventType: 'order',
      symbol,
      tradeType,
      orderId: order.ordId,
      clientOrderId: order.clOrdId,
      side: order.side.toLowerCase() as OrderSide,
      positionSide: order.posSide?.toLowerCase() as PositionSide,
      orderType: this.mapOrderType(order.ordType),
      status: this.mapOrderStatus(order.state),
      price: order.px,
      quantity: order.sz,
      filledQuantity: order.fillSz,
      avgPrice: order.avgPx,
      fee: order.fee,
      feeAsset: order.feeCcy,
      reduceOnly: order.reduceOnly === 'true',
      updateTime: parseInt(order.uTime),
      raw: order
    }

    this.emitOrderUpdate(update)
  }

  private handleAlgoOrderUpdate(algoOrder: OkxWsAlgoOrderData, instType: string): void {
    const tradeType = this.instTypeToTradeType(instType)
    const { symbol } = okxToUnified(algoOrder.instId)

    const update: WsStrategyOrderUpdate = {
      eventType: 'strategyOrder',
      symbol,
      tradeType,
      algoId: algoOrder.algoId,
      clientAlgoId: algoOrder.algoClOrdId,
      side: algoOrder.side.toLowerCase() as OrderSide,
      positionSide: algoOrder.posSide?.toLowerCase() as PositionSide,
      strategyType: this.mapStrategyOrderType(algoOrder.ordType),
      status: this.mapStrategyOrderStatus(algoOrder.state),
      triggerPrice: algoOrder.triggerPx,
      orderPrice: algoOrder.ordPx,
      quantity: algoOrder.sz,
      triggerTime: algoOrder.triggerTime ? parseInt(algoOrder.triggerTime) : undefined,
      updateTime: parseInt(algoOrder.uTime),
      raw: algoOrder
    }

    this.emitStrategyOrderUpdate(update)
  }

  private handlePositionUpdate(position: OkxWsPositionData, instType: string): void {
    const tradeType = this.instTypeToTradeType(instType)
    const { symbol } = okxToUnified(position.instId)

    const update: WsPositionUpdate = {
      eventType: 'position',
      symbol,
      tradeType,
      positionSide: position.posSide.toLowerCase() as PositionSide,
      quantity: position.pos,
      entryPrice: position.avgPx,
      unrealizedPnl: position.upl,
      leverage: position.lever,
      marginType: position.mgnMode === 'cross' ? 'cross' : 'isolated',
      liquidationPrice: position.liqPx,
      updateTime: parseInt(position.uTime),
      raw: position
    }

    this.emitPositionUpdate(update)
  }

  private handleAccountUpdate(account: OkxWsAccountData, instType: string): void {
    const tradeType = this.instTypeToTradeType(instType || 'SWAP')
    const updateTime = parseInt(account.uTime)

    // 发送单独的余额更新
    account.details.forEach((balance) => {
      const balanceUpdate: WsBalanceUpdate = {
        eventType: 'balance',
        asset: balance.ccy,
        tradeType,
        available: balance.availBal,
        total: balance.cashBal,
        frozen: balance.frozenBal,
        unrealizedPnl: balance.upl,
        updateTime: parseInt(balance.uTime),
        raw: balance
      }
      this.emitBalanceUpdate(balanceUpdate)
    })

    // 发送综合账户更新
    const accountUpdate: WsAccountUpdate = {
      eventType: 'account',
      tradeType,
      balances: account.details.map((balance) => ({
        asset: balance.ccy,
        tradeType,
        available: balance.availBal,
        total: balance.cashBal,
        frozen: balance.frozenBal,
        unrealizedPnl: balance.upl,
        updateTime: parseInt(balance.uTime),
        raw: balance
      })),
      positions: [], // 持仓通过单独的 positions 频道推送
      updateTime,
      raw: account
    }

    this.emitAccountUpdate(accountUpdate)
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private getOkxInstType(tradeType: TradeType): 'SPOT' | 'SWAP' | 'FUTURES' {
    switch (tradeType) {
      case 'spot':
        return 'SPOT'
      case 'futures':
        return 'SWAP'
      case 'delivery':
        return 'FUTURES'
      default:
        return 'SWAP'
    }
  }

  private instTypeToTradeType(instType: string): TradeType {
    switch (instType?.toUpperCase()) {
      case 'SPOT':
        return 'spot'
      case 'SWAP':
        return 'futures'
      case 'FUTURES':
        return 'delivery'
      default:
        return 'futures'
    }
  }

  private mapOrderType(ordType: string): OrderType {
    switch (ordType?.toLowerCase()) {
      case 'market':
        return 'market'
      case 'limit':
        return 'limit'
      case 'post_only':
        return 'maker-only'
      case 'fok':
      case 'ioc':
        return 'limit' // FOK/IOC are execution types, base order is limit
      default:
        return 'limit'
    }
  }

  private mapOrderStatus(state: string): OrderStatus {
    switch (state?.toLowerCase()) {
      case 'live':
        return 'open'
      case 'partially_filled':
        return 'partial'
      case 'filled':
        return 'filled'
      case 'canceled':
      case 'cancelled':
        return 'canceled'
      default:
        return 'open'
    }
  }

  private mapStrategyOrderType(ordType: string): StrategyOrderType {
    switch (ordType?.toLowerCase()) {
      case 'conditional':
        return 'stop-loss'
      case 'oco':
        return 'take-profit'
      case 'trigger':
        return 'trigger'
      case 'move_order_stop':
        return 'trailing-stop'
      default:
        return 'trigger'
    }
  }

  private mapStrategyOrderStatus(state: string): StrategyOrderStatus {
    switch (state?.toLowerCase()) {
      case 'live':
        return 'live'
      case 'effective':
        return 'effective'
      case 'canceled':
      case 'cancelled':
        return 'canceled'
      case 'order_failed':
        return 'failed'
      case 'partially_effective':
        return 'partially_effective'
      default:
        return 'live'
    }
  }
}
