import { BaseTradeAdapter } from '../src'
import type {
  BatchPlaceOrderResult,
  Exchange,
  Order,
  OrderSide,
  PlaceOrderParams,
  PositionSide,
  Result,
  SymbolInfo,
  TradeType
} from '../src/types'
import { bootstrapAdapters, ensureSymbolLoaded, env, log, runWithErrorHandling } from './helpers'

const sampleSymbols: Record<TradeType, Record<Exchange, string>> = {
  spot: { binance: 'BTC-USDT', okx: 'BTC-USDT' },
  futures: { binance: 'BTC-USDT', okx: 'BTC-USDT' },
  delivery: { binance: 'BTC-USD', okx: 'BTC-USD-251219' }
}
const tradeTypeLabel: Record<TradeType, string> = {
  spot: '现货',
  futures: '永续合约',
  delivery: '交割合约'
}

interface SingleScenario {
  exchange: Exchange
  tradeType: TradeType
  side: OrderSide
  positionSide?: PositionSide
}

interface BatchScenario extends SingleScenario {
  count: number
}

const singleScenarios: SingleScenario[] = [
  { exchange: 'binance', tradeType: 'spot', side: 'buy' },
  { exchange: 'binance', tradeType: 'futures', side: 'buy', positionSide: 'long' },
  { exchange: 'binance', tradeType: 'delivery', side: 'buy', positionSide: 'long' },
  // { exchange: 'okx', tradeType: 'spot', side: 'buy' },
  // { exchange: 'okx', tradeType: 'futures', side: 'buy', positionSide: 'long' },
  // { exchange: 'okx', tradeType: 'delivery', side: 'buy', positionSide: 'long' }
]

const batchScenarios: BatchScenario[] = [
  { exchange: 'binance', tradeType: 'spot', side: 'buy', count: 2 },
  { exchange: 'binance', tradeType: 'futures', side: 'buy', positionSide: 'long', count: 2 },
  { exchange: 'binance', tradeType: 'delivery', side: 'buy', positionSide: 'long', count: 2 },
  { exchange: 'okx', tradeType: 'spot', side: 'buy', count: 2 },
  { exchange: 'okx', tradeType: 'futures', side: 'buy', positionSide: 'long', count: 2 },
  { exchange: 'okx', tradeType: 'delivery', side: 'buy', positionSide: 'long', count: 2 }
]

const precisionFallback = 6

function assertResult<T>(result: Result<T>, context: string): T {
  if (result.ok === false) {
    throw new Error(`${context} 失败：${result.error.code} - ${result.error.message}`)
  }
  return result.data
}

function normalizeQuantity(info: SymbolInfo, multiplier = 1): number {
  const minQty = parseFloat(info.minQty) || 0
  const stepSize = parseFloat(info.stepSize) || minQty || 0.0001
  const baseQty = Math.max(minQty, stepSize)
  const qty = baseQty * multiplier
  const precision = typeof info.quantityPrecision === 'number' ? info.quantityPrecision : precisionFallback
  return Number(qty.toFixed(Math.min(precision, 8)))
}

function normalizePrice(info: SymbolInfo, rawPrice: number): number {
  const precision = typeof info.pricePrecision === 'number' ? info.pricePrecision : precisionFallback
  return Number(rawPrice.toFixed(Math.min(precision, 8)))
}

async function buildLimitOrder(
  adapter: BaseTradeAdapter,
  symbol: string,
  tradeType: TradeType,
  side: OrderSide,
  positionSide?: PositionSide,
  multiplier = 1
): Promise<PlaceOrderParams<number, number>> {
  const info = await ensureSymbolLoaded(adapter, symbol, tradeType)
  const priceResult = await adapter.getPrice(symbol, tradeType)
  const lastPrice = parseFloat(assertResult(priceResult, `${adapter.exchange} 价格查询`))
  const offset = side === 'buy' ? 0.995 : 1.005
  const price = lastPrice * offset //  normalizePrice(info, lastPrice * offset)
  const quantity = normalizeQuantity(info, multiplier)

  return {
    symbol,
    tradeType,
    side,
    orderType: 'limit',
    price,
    quantity,
    positionSide,
    leverage: tradeType === 'spot' ? undefined : 5
  }
}

async function executeSingleOrder(label: string, adapter: BaseTradeAdapter, scenario: SingleScenario, simulated: boolean) {
  const symbol = sampleSymbols[scenario.tradeType][adapter.exchange]
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

async function executeBatchOrders(label: string, adapter: BaseTradeAdapter, scenario: BatchScenario, simulated: boolean) {
  const symbol = sampleSymbols[scenario.tradeType][adapter.exchange]
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
    failedCount: batchResult.failedCount
  })
  batchResult.results.forEach((result, index) => {
    if (result.ok === true) {
      log.success(`${label} 第${index + 1}单成功`, result.data as Order)
    } else {
      log.error(`${label} 第${index + 1}单失败`, result.error)
    }
  })
}

async function runTraderExamples() {
  const { tradeAdapters } = await bootstrapAdapters()
  const simulated = env.simulated !== false

  if (simulated) {
    log.warn('当前处于模拟模式，如需发送真实订单请在 .env.local 中设置 SIMULATED=false。')
  }

  log.banner('单笔下单测试')
  for (const scenario of singleScenarios) {
    const adapter = tradeAdapters[scenario.exchange]
    const label = `${scenario.exchange.toUpperCase()} ${tradeTypeLabel[scenario.tradeType]}`
    await log.timed(label, () => executeSingleOrder(label, adapter, scenario, simulated))
    log.divider()
  }

  log.banner('批量下单测试')
  for (const scenario of batchScenarios) {
    const adapter = tradeAdapters[scenario.exchange]
    const limits = adapter.getBatchOrderLimits()
    if (!limits.supportedTradeTypes.includes(scenario.tradeType)) {
      log.warn(`${scenario.exchange.toUpperCase()} ${tradeTypeLabel[scenario.tradeType]} 不支持批量下单，已跳过。`)
      continue
    }
    const cappedScenario: BatchScenario = {
      ...scenario,
      count: Math.min(scenario.count, limits.maxBatchSize)
    }
    if (scenario.count > limits.maxBatchSize) {
      log.warn(`${scenario.exchange.toUpperCase()} 批量数量 ${scenario.count} 超出上限 ${limits.maxBatchSize}，改用 ${cappedScenario.count} 单。`)
    }
    const label = `${scenario.exchange.toUpperCase()} ${tradeTypeLabel[scenario.tradeType]}`
    await log.timed(label, () => executeBatchOrders(label, adapter, cappedScenario, simulated))
    log.divider()
  }
}

runWithErrorHandling('trade-api-example', runTraderExamples)
