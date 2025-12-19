/**
 * WebSocket 用户数据流示例
 *
 * 运行方式:
 *   npx esno example/wsUserData.ts              # 测试所有启用的交易所
 *   npx esno example/wsUserData.ts binance      # 仅测试 Binance
 *   npx esno example/wsUserData.ts okx          # 仅测试 OKX
 *
 * 也可以被其他模块导入使用：
 *   import { createWsUserDataMonitor, WsEventHandlers } from './wsUserData'
 */
import type {
  WsUserDataEvent,
  WsOrderUpdate,
  WsPositionUpdate,
  WsBalanceUpdate,
  WsStrategyOrderUpdate,
  TradeType,
  Exchange,
} from '../src/core/types'
import {
  getWsUserDataAdapter,
  log,
  runWithErrorHandling,
  setupGracefulShutdown,
} from './helpers'
import {
  ENABLED_EXCHANGES,
  ENABLED_TRADE_TYPES,
  isModuleEnabled,
  isExchangeEnabled,
} from './config'
import { formatLabel } from './constants'

// ============================================================================
// 事件处理器类型
// ============================================================================

export interface WsEventHandlers {
  onOrder?: (event: WsOrderUpdate) => void
  onStrategyOrder?: (event: WsStrategyOrderUpdate) => void
  onPosition?: (event: WsPositionUpdate) => void
  onBalance?: (event: WsBalanceUpdate) => void
  onConnected?: (exchange: Exchange, tradeType: TradeType) => void
  onDisconnected?: (exchange: Exchange, reason?: string) => void
  onError?: (exchange: Exchange, code: string, message: string) => void
  onAllEvents?: (event: WsUserDataEvent) => void
}

// ============================================================================
// 默认事件处理器
// ============================================================================

function defaultHandleOrderUpdate(event: WsOrderUpdate): void {
  log.info(`[订单更新] ${event.symbol}`)
  log.info(`  订单ID: ${event.orderId}`)
  log.info(`  方向: ${event.side} ${event.positionSide || ''}`)
  log.info(`  类型: ${event.orderType}`)
  log.info(`  状态: ${event.status}`)
  log.info(`  价格: ${event.price}`)
  log.info(`  数量: ${event.quantity} / 已成交: ${event.filledQuantity}`)
  if (event.avgPrice) {
    log.info(`  均价: ${event.avgPrice}`)
  }
  if (event.fee) {
    log.info(`  手续费: ${event.fee} ${event.feeAsset || ''}`)
  }
}

function defaultHandleStrategyOrderUpdate(event: WsStrategyOrderUpdate): void {
  log.info(`[策略订单更新] ${event.symbol}`)
  log.info(`  策略ID: ${event.algoId}`)
  log.info(`  类型: ${event.strategyType}`)
  log.info(`  方向: ${event.side} ${event.positionSide || ''}`)
  log.info(`  状态: ${event.status}`)
  log.info(`  触发价: ${event.triggerPrice}`)
  if (event.orderPrice) {
    log.info(`  委托价: ${event.orderPrice}`)
  }
  log.info(`  数量: ${event.quantity}`)
  if (event.triggerTime) {
    log.info(`  触发时间: ${new Date(event.triggerTime).toLocaleString()}`)
  }
}

function defaultHandlePositionUpdate(event: WsPositionUpdate): void {
  log.info(`[持仓更新] ${event.symbol}`)
  log.info(`  方向: ${event.positionSide}`)
  log.info(`  数量: ${event.quantity}`)
  log.info(`  开仓均价: ${event.entryPrice}`)
  log.info(`  未实现盈亏: ${event.unrealizedPnl}`)
  if (event.leverage) {
    log.info(`  杠杆: ${event.leverage}x`)
  }
  if (event.liquidationPrice) {
    log.info(`  强平价: ${event.liquidationPrice}`)
  }
}

function defaultHandleBalanceUpdate(event: WsBalanceUpdate): void {
  log.info(`[余额更新] ${event.asset}`)
  log.info(`  可用: ${event.available}`)
  if (event.total) {
    log.info(`  总额: ${event.total}`)
  }
  if (event.frozen) {
    log.info(`  冻结: ${event.frozen}`)
  }
  if (event.unrealizedPnl) {
    log.info(`  未实现盈亏: ${event.unrealizedPnl}`)
  }
}

// ============================================================================
// WebSocket 用户数据监控器
// ============================================================================

export interface WsUserDataMonitor {
  /** 关闭所有连接 */
  close(): Promise<void>
  /** 获取已连接的交易所列表 */
  getConnectedExchanges(): Exchange[]
}

export interface CreateMonitorOptions {
  /** 要监控的交易所列表，默认使用 ENABLED_EXCHANGES */
  exchanges?: Exchange[]
  /** 交易类型，默认使用 ENABLED_TRADE_TYPES[0] */
  tradeType?: TradeType
  /** 事件处理器 */
  handlers?: WsEventHandlers
  /** 是否自动重连，默认 true */
  autoReconnect?: boolean
}

/**
 * 创建 WebSocket 用户数据监控器
 *
 * @example
 * // 使用默认处理器
 * const monitor = await createWsUserDataMonitor()
 *
 * // 使用自定义处理器
 * const monitor = await createWsUserDataMonitor({
 *   exchanges: ['binance'],
 *   handlers: {
 *     onOrder: (event) => console.log('订单:', event),
 *   }
 * })
 *
 * // 关闭连接
 * await monitor.close()
 */
export async function createWsUserDataMonitor(
  options: CreateMonitorOptions = {}
): Promise<WsUserDataMonitor> {
  const {
    exchanges = ENABLED_EXCHANGES,
    tradeType = ENABLED_TRADE_TYPES[0] || 'futures',
    handlers = {},
    autoReconnect = true,
  } = options

  const connectedExchanges: Exchange[] = []
  const adapters: Array<{ exchange: Exchange; close: () => Promise<void> }> = []

  for (const exchange of exchanges) {
    if (!isExchangeEnabled(exchange)) {
      log.warn(`交易所 ${exchange} 未启用，跳过`)
      continue
    }

    const adapter = getWsUserDataAdapter(exchange)
    const label = formatLabel(exchange, tradeType)

    // 注册事件监听器
    adapter.on('order', handlers.onOrder || defaultHandleOrderUpdate)
    adapter.on('strategyOrder', handlers.onStrategyOrder || defaultHandleStrategyOrderUpdate)
    adapter.on('position', handlers.onPosition || defaultHandlePositionUpdate)
    adapter.on('balance', handlers.onBalance || defaultHandleBalanceUpdate)

    adapter.on('connected', () => {
      if (handlers.onConnected) {
        handlers.onConnected(exchange, tradeType)
      } else {
        log.success(`[${label}] WebSocket 连接成功`)
      }
    })

    adapter.on('disconnected', (event: any) => {
      if (handlers.onDisconnected) {
        handlers.onDisconnected(exchange, event.reason)
      } else {
        log.warn(`[${label}] WebSocket 断开连接: ${event.reason || 'unknown'}`)
      }
    })

    adapter.on('error', (event) => {
      if (handlers.onError) {
        handlers.onError(exchange, event.code, event.message)
      } else {
        log.error(`[${label}] WebSocket 错误: ${event.code}: ${event.message}`)
      }
    })

    // 订阅用户数据流
    const allEventsHandler = handlers.onAllEvents || ((_e: WsUserDataEvent) => {})
    await adapter.subscribe({ tradeType, autoReconnect }, allEventsHandler)

    log.info(`[${label}] 已订阅用户数据流`)

    connectedExchanges.push(exchange)
    adapters.push({ exchange, close: () => adapter.close() })
  }

  return {
    async close() {
      for (const { close } of adapters) {
        await close()
      }
      log.info('所有 WebSocket 连接已关闭')
    },
    getConnectedExchanges() {
      return [...connectedExchanges]
    },
  }
}

// ============================================================================
// 独立运行模式
// ============================================================================

async function runStandalone() {
  if (!isModuleEnabled('wsUserData')) {
    log.warn('WebSocket 用户数据流测试模块已禁用')
    return
  }

  // 解析命令行参数
  const args = process.argv.slice(2)
  let exchanges: Exchange[] = ENABLED_EXCHANGES

  if (args.length > 0) {
    const arg = args[0].toLowerCase()
    if (arg === 'binance' || arg === 'okx') {
      exchanges = [arg as Exchange]
    }
  }

  log.banner('WebSocket 用户数据流测试')

  const monitor = await createWsUserDataMonitor({ exchanges })

  log.info(`已连接交易所: ${monitor.getConnectedExchanges().join(', ')}`)
  log.info('等待用户数据事件...')
  log.info('按 Ctrl+C 退出')

  await setupGracefulShutdown(() => monitor.close())
}

// 如果作为主模块运行
if (require.main === module) {
  runWithErrorHandling('ws-user-data-example', runStandalone)
}
