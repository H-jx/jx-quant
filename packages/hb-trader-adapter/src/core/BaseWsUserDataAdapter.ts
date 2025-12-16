import type {
  TradeType,
  WsUserDataEvent,
  WsEventHandler,
  WsSubscribeOptions,
  WsOrderUpdate,
  WsStrategyOrderUpdate,
  WsPositionUpdate,
  WsBalanceUpdate,
  WsAccountUpdate,
  Exchange,
} from './types'

// ============================================================================
// WebSocket 用户数据适配器接口
// ============================================================================

/**
 * WebSocket 用户数据适配器接口
 * 用于订阅私有用户数据流 (订单、持仓、余额更新)
 */
export interface IWsUserDataAdapter {
  /** 交易所标识 */
  readonly exchange: Exchange

  /** 是否已连接 */
  isConnected(tradeType?: TradeType): boolean

  /**
   * 订阅用户数据流
   * @param options 订阅选项
   * @param handler 事件处理器
   */
  subscribe(
    options: WsSubscribeOptions,
    handler: WsEventHandler
  ): Promise<void>

  /**
   * 取消订阅用户数据流
   * @param tradeType 交易类型
   */
  unsubscribe(tradeType?: TradeType): Promise<void>

  /**
   * 添加事件监听器
   * @param eventType 事件类型
   * @param handler 处理器
   */
  on<T extends WsUserDataEvent['eventType']>(
    eventType: T,
    handler: WsEventHandler<Extract<WsUserDataEvent, { eventType: T }>>
  ): void

  /**
   * 移除事件监听器
   * @param eventType 事件类型
   * @param handler 处理器
   */
  off<T extends WsUserDataEvent['eventType']>(
    eventType: T,
    handler: WsEventHandler<Extract<WsUserDataEvent, { eventType: T }>>
  ): void

  /**
   * 关闭所有连接
   */
  close(): Promise<void>
}

// ============================================================================
// WebSocket 用户数据适配器基类
// ============================================================================

/**
 * WebSocket 用户数据适配器基类
 * 提供事件分发和连接管理的通用逻辑
 */
export abstract class BaseWsUserDataAdapter implements IWsUserDataAdapter {
  abstract readonly exchange: Exchange

  /** 事件监听器映射 */
  protected eventListeners: Map<string, Set<WsEventHandler>> = new Map()

  /** 全局事件处理器 */
  protected globalHandlers: Set<WsEventHandler> = new Set()

  /** 重连配置 */
  protected reconnectConfig = {
    autoReconnect: true,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  }

  // ============================================================================
  // 抽象方法 - 子类必须实现
  // ============================================================================

  abstract isConnected(tradeType?: TradeType): boolean
  abstract subscribe(options: WsSubscribeOptions, handler: WsEventHandler): Promise<void>
  abstract unsubscribe(tradeType?: TradeType): Promise<void>
  abstract close(): Promise<void>

  // ============================================================================
  // 事件管理
  // ============================================================================

  /**
   * 添加事件监听器
   */
  on<T extends WsUserDataEvent['eventType']>(
    eventType: T,
    handler: WsEventHandler<Extract<WsUserDataEvent, { eventType: T }>>
  ): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set())
    }
    this.eventListeners.get(eventType)!.add(handler as WsEventHandler)
  }

  /**
   * 移除事件监听器
   */
  off<T extends WsUserDataEvent['eventType']>(
    eventType: T,
    handler: WsEventHandler<Extract<WsUserDataEvent, { eventType: T }>>
  ): void {
    const listeners = this.eventListeners.get(eventType)
    if (listeners) {
      listeners.delete(handler as WsEventHandler)
    }
  }

  /**
   * 触发事件
   */
  protected emit(event: WsUserDataEvent): void {
    // 触发特定类型的监听器
    const listeners = this.eventListeners.get(event.eventType)
    if (listeners) {
      listeners.forEach(handler => {
        try {
          handler(event)
        } catch (error) {
          console.error(`[${this.exchange}] Event handler error:`, error)
        }
      })
    }

    // 触发全局处理器
    this.globalHandlers.forEach(handler => {
      try {
        handler(event)
      } catch (error) {
        console.error(`[${this.exchange}] Global handler error:`, error)
      }
    })
  }

  /**
   * 触发订单更新事件
   */
  protected emitOrderUpdate(update: WsOrderUpdate): void {
    this.emit(update)
  }

  /**
   * 触发策略订单更新事件
   */
  protected emitStrategyOrderUpdate(update: WsStrategyOrderUpdate): void {
    this.emit(update)
  }

  /**
   * 触发持仓更新事件
   */
  protected emitPositionUpdate(update: WsPositionUpdate): void {
    this.emit(update)
  }

  /**
   * 触发余额更新事件
   */
  protected emitBalanceUpdate(update: WsBalanceUpdate): void {
    this.emit(update)
  }

  /**
   * 触发账户更新事件
   */
  protected emitAccountUpdate(update: WsAccountUpdate): void {
    this.emit(update)
  }

  /**
   * 触发连接事件
   */
  protected emitConnected(tradeType?: TradeType): void {
    this.emit({
      eventType: 'connected',
      tradeType,
      timestamp: Date.now()
    })
  }

  /**
   * 触发断开连接事件
   */
  protected emitDisconnected(tradeType?: TradeType, reason?: string): void {
    this.emit({
      eventType: 'disconnected',
      tradeType,
      timestamp: Date.now(),
      reason
    })
  }

  /**
   * 触发错误事件
   */
  protected emitError(code: string, message: string, tradeType?: TradeType, raw?: unknown): void {
    this.emit({
      eventType: 'error',
      code,
      message,
      tradeType,
      timestamp: Date.now(),
      raw
    })
  }

  /**
   * 添加全局处理器
   */
  protected addGlobalHandler(handler: WsEventHandler): void {
    this.globalHandlers.add(handler)
  }

  /**
   * 移除全局处理器
   */
  protected removeGlobalHandler(handler: WsEventHandler): void {
    this.globalHandlers.delete(handler)
  }

  /**
   * 清理所有监听器
   */
  protected clearAllListeners(): void {
    this.eventListeners.clear()
    this.globalHandlers.clear()
  }
}
