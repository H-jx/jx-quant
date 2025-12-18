/**
 * WebSocket 用户数据流示例
 * 
 * 运行方式: npx esno example/wsUserData.ts [okx|binance]
 */
import { 
  OkxWsUserDataAdapter, 
  BinanceWsUserDataAdapter,
} from '../src'
import type {
  WsUserDataEvent,
  WsOrderUpdate,
  WsPositionUpdate,
  WsBalanceUpdate,
  WsStrategyOrderUpdate,
  TradeType
} from '../src/core/types'
import { createLogger } from './logger'
import { env } from './helpers'
const logger = createLogger('StrategyOrderExample')
// ============================================================================
// 配置
// ============================================================================

const OKX_CONFIG = {
  apiKey: env.okxApiKey || '',
  apiSecret: env.okxApiSecret || '',
  passphrase: env.okxPassphrase || '',
  socksProxy: 'socks5://127.0.0.1:7890',
  simulated: true
}

const BINANCE_CONFIG = {
  apiKey: env.binanceApiKey || '',
  apiSecret: env.binanceApiSecret || '',
  socksProxy: 'socks5://127.0.0.1:7890'
}

// ============================================================================
// 事件处理器
// ============================================================================

function handleOrderUpdate(event: WsOrderUpdate): void {
  logger.info(`[订单更新] ${event.symbol}`)
  logger.info(`  订单ID: ${event.orderId}`)
  logger.info(`  方向: ${event.side} ${event.positionSide || ''}`)
  logger.info(`  类型: ${event.orderType}`)
  logger.info(`  状态: ${event.status}`)
  logger.info(`  价格: ${event.price}`)
  logger.info(`  数量: ${event.quantity} / 已成交: ${event.filledQuantity}`)
  if (event.avgPrice) {
    logger.info(`  均价: ${event.avgPrice}`)
  }
  if (event.fee) {
    logger.info(`  手续费: ${event.fee} ${event.feeAsset || ''}`)
  }
}

function handleStrategyOrderUpdate(event: WsStrategyOrderUpdate): void {
  logger.info(`[策略订单更新] ${event.symbol}`)
  logger.info(`  策略ID: ${event.algoId}`)
  logger.info(`  类型: ${event.strategyType}`)
  logger.info(`  方向: ${event.side} ${event.positionSide || ''}`)
  logger.info(`  状态: ${event.status}`)
  logger.info(`  触发价: ${event.triggerPrice}`)
  if (event.orderPrice) {
    logger.info(`  委托价: ${event.orderPrice}`)
  }
  logger.info(`  数量: ${event.quantity}`)
  if (event.triggerTime) {
    logger.info(`  触发时间: ${new Date(event.triggerTime).toLocaleString()}`)
  }
}

function handlePositionUpdate(event: WsPositionUpdate): void {
  logger.info(`[持仓更新] ${event.symbol}`)
  logger.info(`  方向: ${event.positionSide}`)
  logger.info(`  数量: ${event.quantity}`)
  logger.info(`  开仓均价: ${event.entryPrice}`)
  logger.info(`  未实现盈亏: ${event.unrealizedPnl}`)
  if (event.leverage) {
    logger.info(`  杠杆: ${event.leverage}x`)
  }
  if (event.liquidationPrice) {
    logger.info(`  强平价: ${event.liquidationPrice}`)
  }
}

function handleBalanceUpdate(event: WsBalanceUpdate): void {
  logger.info(`[余额更新] ${event.asset}`)
  logger.info(`  可用: ${event.available}`)
  if (event.total) {
    logger.info(`  总额: ${event.total}`)
  }
  if (event.frozen) {
    logger.info(`  冻结: ${event.frozen}`)
  }
  if (event.unrealizedPnl) {
    logger.info(`  未实现盈亏: ${event.unrealizedPnl}`)
  }
}

function handleAllEvents(event: WsUserDataEvent): void {
  logger.warn(`[${event.eventType}] Raw event:`, JSON.stringify(event, null, 2))
}

// ============================================================================
// OKX WebSocket 示例
// ============================================================================

async function testOkxWsUserData() {
  logger.info('========== OKX WebSocket 用户数据流 ==========')
  
  const adapter = new OkxWsUserDataAdapter(OKX_CONFIG)
  const tradeType: TradeType = 'futures'

  // 添加事件监听器
  adapter.on('order', handleOrderUpdate)
  adapter.on('strategyOrder', handleStrategyOrderUpdate)
  adapter.on('position', handlePositionUpdate)
  adapter.on('balance', handleBalanceUpdate)
  adapter.on('connected', (event: any) => {
    logger.info(`[连接成功] ${event.tradeType || 'all'}`)
  })
  adapter.on('disconnected', (event: any) => {
    logger.warn(`[断开连接] ${event.tradeType || 'all'}: ${event.reason || 'unknown'}`)
  })
  adapter.on('error', (event) => {
    logger.error(`[错误] ${event.code}: ${event.message}`)
  })

  // 订阅用户数据流
  await adapter.subscribe(
    { tradeType, autoReconnect: true },
    handleAllEvents
  )

  logger.info('已订阅 OKX 用户数据流，等待事件...')
  logger.info('按 Ctrl+C 退出')

  // 保持运行
  await new Promise((resolve) => {
    process.on('SIGINT', async () => {
      logger.info('正在关闭连接...')
      await adapter.close()
      resolve(undefined)
    })
  })
}

// ============================================================================
// Binance WebSocket 示例
// ============================================================================

async function testBinanceWsUserData() {
  logger.info('========== Binance WebSocket 用户数据流 ==========')
  
  const adapter = new BinanceWsUserDataAdapter(BINANCE_CONFIG)
  const tradeType: TradeType = 'futures'

  // 添加事件监听器
  adapter.on('order', handleOrderUpdate)
  adapter.on('position', handlePositionUpdate)
  adapter.on('balance', handleBalanceUpdate)
  adapter.on('connected', (event: any) => {
    logger.info(`[连接成功] ${event.tradeType || 'all'}`)
  })
  adapter.on('disconnected', (event: any) => {
    logger.warn(`[断开连接] ${event.tradeType || 'all'}: ${event.reason || 'unknown'}`)
  })
  adapter.on('error', (event) => {
    logger.error(`[错误] ${event.code}: ${event.message}`)
  })

  // 订阅用户数据流
  await adapter.subscribe(
    { tradeType, autoReconnect: true },
    handleAllEvents
  )

  logger.info('已订阅 Binance 用户数据流，等待事件...')
  logger.info('按 Ctrl+C 退出')

  // 保持运行
  await new Promise((resolve) => {
    process.on('SIGINT', async () => {
      logger.info('正在关闭连接...')
      await adapter.close()
      resolve(undefined)
    })
  })
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {

  
  const exchange = process.argv[2] || 'binance'
  
  try {
    if (exchange === 'okx') {
      await testOkxWsUserData()
    } else if (exchange === 'binance') {
      await testBinanceWsUserData()
    } else {
      logger.info('Usage: npx esno example/wsUserData.ts [okx|binance]')
    }
  } catch (error) {
    logger.error('执行出错:', error)
  }
}

main()
