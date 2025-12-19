/**
 * 交易 API 示例（单笔下单 + 批量下单 + WebSocket 订单流）
 *
 * 运行方式:
 *   npx esno example/trader.ts              # 仅下单测试
 *   npx esno example/trader.ts --ws         # 下单 + WebSocket 用户数据流
 *   npx esno example/trader.ts --ws-only    # 仅 WebSocket 用户数据流
 */
import { BaseTradeAdapter } from '../src'
import type {
  BatchPlaceOrderResult,
  Order,
  PlaceOrderParams,
  TradeType,
  WsUserDataEvent,
  WsOrderUpdate,
  WsPositionUpdate,
  WsBalanceUpdate,
} from '../src/core/types'
import {
  bootstrapAdapters,
  buildLimitOrder,
  getScenarioSymbol,
  getWsUserDataAdapter,
  env,
  log,
  runWithErrorHandling,
  setupGracefulShutdown,
} from './helpers'
import {
  SINGLE_ORDER_SCENARIOS,
  BATCH_ORDER_SCENARIOS,
  filterScenarios,
  isModuleEnabled,
  ENABLED_EXCHANGES,
  ENABLED_TRADE_TYPES,
  type OrderScenario,
  type BatchOrderScenario,
} from './config'
import { formatLabel } from './constants'

// ============================================================================
// 解析命令行参数
// ============================================================================

const args = process.argv.slice(2)
const enableWs = args.includes('--ws')
const wsOnly = args.includes('--ws-only')

// ============================================================================
// 下单执行函数
// ============================================================================

async function executeSingleOrder(
  label: string,
  adapter: BaseTradeAdapter,
  scenario: OrderScenario,
  simulated: boolean
) {
  const symbol = getScenarioSymbol(scenario.exchange, scenario.tradeType)
  const params = await buildLimitOrder(
    adapter,
    symbol,
    scenario.tradeType,
    scenario.side,
    scenario.positionSide
  )

  log.section(`${label} 单笔下单`)
  log.json('请求参数', params)

  if (simulated) {
    log.warn(`${label} 处于模拟模式：跳过下单请求`)
    return
  }

  const result = await adapter.placeOrder(params)
  if (result.ok === true) {
    log.success(`${label} 下单成功`, result.data)
  } else {
    log.error(`${label} 下单失败`, result.error)
  }
}

async function executeBatchOrders(
  label: string,
  adapter: BaseTradeAdapter,
  scenario: BatchOrderScenario,
  simulated: boolean
) {
  const symbol = getScenarioSymbol(scenario.exchange, scenario.tradeType)
  const paramsList: PlaceOrderParams<number, number>[] = []

  for (let i = 0; i < scenario.count; i++) {
    const multiplier = 1 + i * 0.5
    const params = await buildLimitOrder(
      adapter,
      symbol,
      scenario.tradeType,
      scenario.side,
      scenario.positionSide,
      multiplier
    )
    paramsList.push(params)
  }

  log.section(`${label} 批量下单`)
  log.json('批量请求参数', paramsList)

  if (simulated) {
    log.warn(`${label} 处于模拟模式：跳过批量下单请求`)
    return
  }

  const batchResult = await adapter.placeOrders(paramsList)
  summarizeBatch(label, batchResult)
}

function summarizeBatch(label: string, batchResult: BatchPlaceOrderResult) {
  log.info(`${label} 批量执行汇总`, {
    successCount: batchResult.successCount,
    failedCount: batchResult.failedCount,
  })
  batchResult.results.forEach((result, index) => {
    if (result.ok === true) {
      log.success(`${label} 第${index + 1}单成功`, result.data as Order)
    } else {
      log.error(`${label} 第${index + 1}单失败`, result.error)
    }
  })
}

// ============================================================================
// WebSocket 事件处理器
// ============================================================================

function handleOrderUpdate(event: WsOrderUpdate): void {
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

function handlePositionUpdate(event: WsPositionUpdate): void {
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

function handleBalanceUpdate(event: WsBalanceUpdate): void {
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

function handleAllEvents(_event: WsUserDataEvent): void {
  // 用于调试：可以打印原始事件
  // log.warn(`[${event.eventType}] Raw event:`, JSON.stringify(event, null, 2))
}

// ============================================================================
// WebSocket 订阅
// ============================================================================

interface WsCleanup {
  close: () => Promise<void>
}

async function subscribeWsUserData(tradeType: TradeType): Promise<WsCleanup[]> {
  const cleanups: WsCleanup[] = []

  for (const exchange of ENABLED_EXCHANGES) {
    const adapter = getWsUserDataAdapter(exchange)
    const label = formatLabel(exchange, tradeType)

    // 添加事件监听器
    adapter.on('order', handleOrderUpdate)
    adapter.on('position', handlePositionUpdate)
    adapter.on('balance', handleBalanceUpdate)
    adapter.on('connected', () => {
      log.success(`[${label}] WebSocket 连接成功`)
    })
    adapter.on('disconnected', (event: any) => {
      log.warn(`[${label}] WebSocket 断开连接: ${event.reason || 'unknown'}`)
    })
    adapter.on('error', (event) => {
      log.error(`[${label}] WebSocket 错误: ${event.code}: ${event.message}`)
    })

    // 订阅用户数据流
    await adapter.subscribe({ tradeType, autoReconnect: true }, handleAllEvents)

    log.info(`[${label}] 已订阅用户数据流`)

    cleanups.push({ close: () => adapter.close() })
  }

  return cleanups
}

// ============================================================================
// 主测试流程
// ============================================================================

async function runTraderExamples() {
  if (!isModuleEnabled('trade') && !wsOnly) {
    log.warn('交易 API 测试模块已禁用')
    return
  }

  const simulated = env.simulated !== false
  let wsCleanups: WsCleanup[] = []

  // 启动 WebSocket 用户数据流（如果启用）
  if (enableWs || wsOnly) {
    log.banner('WebSocket 用户数据流')
    // 默认使用第一个启用的交易类型
    const tradeType = ENABLED_TRADE_TYPES[0] || 'futures'
    wsCleanups = await subscribeWsUserData(tradeType)
    log.info('WebSocket 连接已建立，等待订单事件...')

    if (wsOnly) {
      log.info('按 Ctrl+C 退出')
      await setupGracefulShutdown(async () => {
        for (const cleanup of wsCleanups) {
          await cleanup.close()
        }
      })
      return
    }
  }

  const { tradeAdapters } = await bootstrapAdapters()

  if (simulated) {
    log.warn('当前处于模拟模式，如需发送真实订单请在 .env.local 中设置 SIMULATED=false。')
  }

  // 单笔下单测试
  const singleScenarios = filterScenarios(SINGLE_ORDER_SCENARIOS)
  if (singleScenarios.length > 0) {
    log.banner('单笔下单测试')
    for (const scenario of singleScenarios) {
      const adapter = tradeAdapters[scenario.exchange]
      const label = formatLabel(scenario.exchange, scenario.tradeType)
      await log.timed(label, () => executeSingleOrder(label, adapter, scenario, simulated))
      log.divider()
    }
  }

  // 批量下单测试
  const batchScenarios = filterScenarios(BATCH_ORDER_SCENARIOS)
  if (batchScenarios.length > 0) {
    log.banner('批量下单测试')
    for (const scenario of batchScenarios) {
      const adapter = tradeAdapters[scenario.exchange]
      const limits = adapter.getBatchOrderLimits()
      if (!limits.supportedTradeTypes.includes(scenario.tradeType)) {
        log.warn(`${formatLabel(scenario.exchange, scenario.tradeType)} 不支持批量下单，已跳过。`)
        continue
      }
      const cappedScenario: BatchOrderScenario = {
        ...scenario,
        count: Math.min(scenario.count, limits.maxBatchSize),
      }
      if (scenario.count > limits.maxBatchSize) {
        log.warn(
          `${scenario.exchange.toUpperCase()} 批量数量 ${scenario.count} 超出上限 ${limits.maxBatchSize}，改用 ${cappedScenario.count} 单。`
        )
      }
      const label = formatLabel(scenario.exchange, scenario.tradeType)
      await log.timed(label, () => executeBatchOrders(label, adapter, cappedScenario, simulated))
      log.divider()
    }
  }

  // 如果启用了 WebSocket，等待用户退出
  if (enableWs && wsCleanups.length > 0) {
    log.banner('等待 WebSocket 事件')
    log.info('下单完成，继续监听 WebSocket 事件...')
    log.info('按 Ctrl+C 退出')
    await setupGracefulShutdown(async () => {
      for (const cleanup of wsCleanups) {
        await cleanup.close()
      }
    })
  }
}

runWithErrorHandling('trade-api-example', runTraderExamples)
