import { config as loadEnvFile } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLogger } from './logger'
import {
  BaseTradeAdapter,
  BasePublicAdapter,
  BinancePublicAdapter,
  BinanceTradeAdapter,
  OkxPublicAdapter,
  OkxTradeAdapter,
  OkxWsUserDataAdapter,
  BinanceWsUserDataAdapter,
} from '../src'
import type { TradeType, PlaceOrderParams, Exchange, Result } from '../src/core/types'
import { ORDER_CONFIG, getSymbol } from './config'
import { formatLabel } from './constants'

export const log = createLogger('')

// ============================================================================
// 环境变量加载
// ============================================================================

const envFiles = ['.env', '.env.local']
for (const file of envFiles) {
  const fullPath = resolve(process.cwd(), file)
  if (existsSync(fullPath)) {
    loadEnvFile({ path: fullPath, override: true })
  }
}

function parseBoolean(value?: string): boolean | undefined {
  if (!value) {
    return undefined
  }
  const normalized = value.toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false
  }
  return undefined
}

function parseNumber(value?: string): number | undefined {
  if (!value) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const env = {
  binanceApiKey: process.env.BINANCE_API_KEY,
  binanceApiSecret: process.env.BINANCE_API_SECRET,
  okxApiKey: process.env.OKX_API_KEY,
  okxApiSecret: process.env.OKX_API_SECRET,
  okxPassphrase: process.env.OKX_PASSPHRASE,
  simulated: parseBoolean(process.env.SIMULATED),
  timeout: parseNumber(process.env.TIMEOUT),
  proxy: process.env.PROXY,
  socksProxy: process.env.SOCKS_PROXY,
  demonet: parseBoolean(process.env.DEMONET) ?? true,
}

// ============================================================================
// 适配器类型定义
// ============================================================================

export interface AdapterSuite {
  publicAdapters: Record<Exchange, BasePublicAdapter>
  tradeAdapters: Record<Exchange, BaseTradeAdapter>
}

export interface WsAdapterSuite {
  binance: BinanceWsUserDataAdapter
  okx: OkxWsUserDataAdapter
}

// ============================================================================
// 适配器初始化
// ============================================================================

let cachedSuite: AdapterSuite | null = null
let cachedWsSuite: WsAdapterSuite | null = null

/**
 * 初始化公共和交易适配器
 */
export async function bootstrapAdapters(): Promise<AdapterSuite> {
  if (cachedSuite) {
    return cachedSuite
  }

  if (!env.binanceApiKey || !env.binanceApiSecret) {
    throw new Error('缺少 Binance 凭证（BINANCE_API_KEY / BINANCE_API_SECRET）')
  }
  if (!env.okxApiKey || !env.okxApiSecret || !env.okxPassphrase) {
    throw new Error('缺少 OKX 凭证（OKX_API_KEY / OKX_API_SECRET / OKX_PASSPHRASE）')
  }

  const publicAdapters: Record<Exchange, BasePublicAdapter> = {
    binance: new BinancePublicAdapter({ httpsProxy: env.proxy }),
    okx: new OkxPublicAdapter({ httpsProxy: env.proxy }),
  }

  log.info(`模拟模式 = ${env.simulated}, 演示网 = ${env.demonet}`)

  const tradeAdapters: Record<Exchange, BaseTradeAdapter> = {
    binance: new BinanceTradeAdapter({
      apiKey: env.binanceApiKey,
      apiSecret: env.binanceApiSecret,
      httpsProxy: env.proxy,
      publicAdapter: publicAdapters.binance as BinancePublicAdapter,
      demonet: env.demonet,
    }),
    okx: new OkxTradeAdapter({
      apiKey: env.okxApiKey,
      apiSecret: env.okxApiSecret,
      passphrase: env.okxPassphrase,
      httpsProxy: env.proxy,
      publicAdapter: publicAdapters.okx as OkxPublicAdapter,
      demonet: env.demonet,
    }),
  }

  cachedSuite = { publicAdapters, tradeAdapters }
  return cachedSuite
}

/**
 * 初始化 WebSocket 用户数据适配器
 */
export function bootstrapWsAdapters(): WsAdapterSuite {
  if (cachedWsSuite) {
    return cachedWsSuite
  }

  if (!env.binanceApiKey || !env.binanceApiSecret) {
    throw new Error('缺少 Binance 凭证（BINANCE_API_KEY / BINANCE_API_SECRET）')
  }
  if (!env.okxApiKey || !env.okxApiSecret || !env.okxPassphrase) {
    throw new Error('缺少 OKX 凭证（OKX_API_KEY / OKX_API_SECRET / OKX_PASSPHRASE）')
  }

  const proxyConfig = env.socksProxy || env.proxy

  cachedWsSuite = {
    binance: new BinanceWsUserDataAdapter({
      apiKey: env.binanceApiKey,
      apiSecret: env.binanceApiSecret,
      socksProxy: proxyConfig,
    }),
    okx: new OkxWsUserDataAdapter({
      apiKey: env.okxApiKey,
      apiSecret: env.okxApiSecret,
      passphrase: env.okxPassphrase,
      socksProxy: proxyConfig,
      demonet: env.demonet,
    }),
  }

  return cachedWsSuite
}

/**
 * 获取单个 WS 用户数据适配器
 */
export function getWsUserDataAdapter(exchange: Exchange): BinanceWsUserDataAdapter | OkxWsUserDataAdapter {
  const suite = bootstrapWsAdapters()
  return suite[exchange]
}

// ============================================================================
// 工具函数
// ============================================================================

export async function runWithErrorHandling(taskName: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    log.error(`${taskName} 执行失败`, error)
    process.exitCode = 1
  }
}

export async function ensureSymbolLoaded(
  adapter: BaseTradeAdapter | BasePublicAdapter,
  symbol: string,
  tradeType: TradeType
) {
  const info = await adapter.getSymbolInfo(symbol, tradeType)
  if (info.ok === false) {
    throw new Error(`无法加载 ${symbol} 的交易对信息：${(info as any).error.message}`)
  }
  return info.data
}

export async function placeOrderSafe(adapter: BaseTradeAdapter, params: PlaceOrderParams<number, number>) {
  const result = await adapter.placeOrder(params)
  if (result.ok === false) {
    log.error('下单失败', result.error)
  } else {
    log.success('下单成功', result.data)
  }
  return result
}

/**
 * 断言 Result 成功并返回数据
 */
export function assertResult<T>(result: Result<T>, context: string): T {
  if (result.ok === false) {
    throw new Error(`${context} 失败：${result.error.code} - ${result.error.message}`)
  }
  return result.data
}

// ============================================================================
// 下单辅助函数
// ============================================================================

/**
 * 构建限价单参数
 * 注意：价格和数量使用原始值，由 adapter 内部处理精度
 */
export async function buildLimitOrder(
  adapter: BaseTradeAdapter,
  symbol: string,
  tradeType: TradeType,
  side: 'buy' | 'sell',
  positionSide?: 'long' | 'short',
  multiplier = 1
): Promise<PlaceOrderParams<number, number>> {
  const info = await ensureSymbolLoaded(adapter, symbol, tradeType)
  const label = formatLabel(adapter.exchange, tradeType)
  const priceResult = await adapter.getPrice(symbol, tradeType)
  const lastPrice = parseFloat(assertResult(priceResult, `${label} 价格查询`))
  const offset = side === 'buy' ? ORDER_CONFIG.buyPriceOffset : ORDER_CONFIG.sellPriceOffset
  const price = lastPrice * offset

  // 直接使用 minQty 或 stepSize 作为基础数量，让 adapter 处理精度
  const minQty = parseFloat(info.minQty) || 0
  const stepSize = parseFloat(info.stepSize) || minQty || 0.0001
  const quantity = Math.max(minQty, stepSize) * multiplier

  return {
    symbol,
    tradeType,
    side,
    orderType: 'limit',
    price,
    quantity,
    positionSide,
    leverage: tradeType === 'spot' ? undefined : ORDER_CONFIG.defaultLeverage,
  }
}

/**
 * 获取指定场景的交易对
 */
export function getScenarioSymbol(exchange: Exchange, tradeType: TradeType): string {
  return getSymbol(exchange, tradeType)
}

// ============================================================================
// 进程信号处理
// ============================================================================

/**
 * 设置优雅退出处理
 */
export function setupGracefulShutdown(cleanup: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const handler = async () => {
      log.info('正在关闭连接...')
      await cleanup()
      resolve()
    }

    process.on('SIGINT', handler)
    process.on('SIGTERM', handler)
  })
}
