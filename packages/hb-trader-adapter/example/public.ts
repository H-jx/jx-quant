/**
 * 公共 API 示例
 *
 * 运行方式: npx esno example/public.ts
 */
import type { SymbolInfo, Ticker, OrderBook } from '../src/core/types'
import {
  bootstrapAdapters,
  ensureSymbolLoaded,
  assertResult,
  log,
  runWithErrorHandling,
} from './helpers'
import { formatList } from './logger'
import {
  ENABLED_EXCHANGES,
  ENABLED_TRADE_TYPES,
  getSymbol,
  isModuleEnabled,
} from './config'
import { formatLabel } from './constants'

// ============================================================================
// 数据格式化
// ============================================================================

function previewSymbol(info: SymbolInfo): string {
  return formatList([
    ['统一交易对', info.symbol],
    ['原始交易对', info.rawSymbol],
    ['交易类型', info.tradeType],
    ['基础/计价', `${info.baseCurrency}/${info.quoteCurrency}`],
    ['价格精度', info.tickSize],
    ['数量精度', info.stepSize],
    ['最小下单量', info.minQty],
    ['最大下单量', info.maxQty || '暂无'],
  ])
}

function previewTicker(ticker: Ticker): string {
  return formatList([
    ['最新价', ticker.last],
    ['24 小时最高', ticker.high],
    ['24 小时最低', ticker.low],
    ['24 小时成交量', ticker.volume],
    ['计价币成交量', ticker.quoteVolume],
    ['时间戳', new Date(ticker.timestamp).toISOString()],
  ])
}

function previewOrderBook(orderBook: OrderBook): string {
  const bestBids =
    orderBook.bids
      .slice(0, 3)
      .map(([price, amount]) => `${price} x ${amount}`)
      .join(' | ') || '暂无'
  const bestAsks =
    orderBook.asks
      .slice(0, 3)
      .map(([price, amount]) => `${price} x ${amount}`)
      .join(' | ') || '暂无'
  return formatList([
    ['最优买单', bestBids],
    ['最优卖单', bestAsks],
    ['时间戳', new Date(orderBook.timestamp).toISOString()],
  ])
}

// ============================================================================
// 测试任务定义
// ============================================================================

interface Task {
  title: string
  run(): Promise<void>
}

// ============================================================================
// 主测试流程
// ============================================================================

async function enqueuePublicTests(): Promise<void> {
  if (!isModuleEnabled('public')) {
    log.warn('公共 API 测试模块已禁用')
    return
  }

  const { publicAdapters } = await bootstrapAdapters()
  log.banner('公共 API 队列测试')

  for (const exchange of ENABLED_EXCHANGES) {
    const adapter = publicAdapters[exchange]

    for (const tradeType of ENABLED_TRADE_TYPES) {
      const symbol = getSymbol(exchange, tradeType)
      const label = formatLabel(exchange, tradeType)

      const queue: Task[] = [
        {
          title: `${label} :: 加载交易对`,
          run: async () => {
            const all = assertResult(await adapter.getAllSymbols(tradeType), `${label} 加载交易对`)
            log.info(`${label} 交易对加载完成`, { count: all.length })
          },
        },
        {
          title: `${label} :: 交易对信息 (${symbol})`,
          run: async () => {
            const info = await ensureSymbolLoaded(adapter, symbol, tradeType)
            log.section(`${label} 交易对快照`)
            console.log(previewSymbol(info))
          },
        },
        {
          title: `${label} :: 价格数据`,
          run: async () => {
            const lastPrice = assertResult(await adapter.getPrice(symbol, tradeType), `${label} 获取最新价`)
            log.kv(`${label} 最新价`, lastPrice)

            if (tradeType !== 'spot') {
              const markPrice = assertResult(
                await adapter.getMarkPrice(symbol, tradeType),
                `${label} 获取标记价`
              )
              log.kv(`${label} 标记价`, markPrice)
            }
          },
        },
        {
          title: `${label} :: 行情快照`,
          run: async () => {
            const ticker = assertResult(await adapter.getTicker(symbol, tradeType), `${label} 获取行情`)
            log.section(`${label} 行情`)
            console.log(previewTicker(ticker))
          },
        },
        {
          title: `${label} :: 深度数据`,
          run: async () => {
            const book = assertResult(
              await adapter.getOrderBook(symbol, tradeType, 20),
              `${label} 获取深度`
            )
            log.section(`${label} 委托簿`)
            console.log(previewOrderBook(book))
          },
        },
        {
          title: `${label} :: 交易对转换`,
          run: async () => {
            const info = await ensureSymbolLoaded(adapter, symbol, tradeType)
            const raw = adapter.toRawSymbol(symbol, tradeType)
            const unified = adapter.fromRawSymbol(info.rawSymbol, tradeType)
            log.info(`${label} 转换结果`, { raw, unified })
          },
        },
      ]

      for (const task of queue) {
        await log.timed(task.title, task.run)
        log.divider()
      }
    }
  }
}

runWithErrorHandling('public-api-example', enqueuePublicTests)
