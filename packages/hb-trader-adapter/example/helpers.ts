import { config as loadEnvFile } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLogger } from './logger'
import { BaseTradeAdapter, BasePublicAdapter, BinancePublicAdapter, BinanceTradeAdapter, OkxPublicAdapter, OkxTradeAdapter } from '../src'
import type { TradeType, PlaceOrderParams } from '../src/types'

export const log = createLogger('')

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
  proxy: process.env.PROXY
}

export interface AdapterSuite {
  publicAdapters: Record<string, BasePublicAdapter>
  tradeAdapters: Record<string, BaseTradeAdapter>
}

let cachedSuite: AdapterSuite | null = null

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

  const publicAdapters = {
    binance: new BinancePublicAdapter({ httpsProxy: env.proxy }),
    okx: new OkxPublicAdapter({ httpsProxy: env.proxy })
  }
  console.log(env.simulated)
  const tradeAdapters = {
    binance: new BinanceTradeAdapter({
      apiKey: env.binanceApiKey,
      apiSecret: env.binanceApiSecret,
      httpsProxy: env.proxy,
      publicAdapter: publicAdapters.binance as BinancePublicAdapter
    }),
    okx: new OkxTradeAdapter({
      apiKey: env.okxApiKey,
      apiSecret: env.okxApiSecret,
      passphrase: env.okxPassphrase,
      httpsProxy: env.proxy,
      publicAdapter: publicAdapters.okx as OkxPublicAdapter,
      demoTrading: true
    })
  }

  cachedSuite = { publicAdapters, tradeAdapters }
  return cachedSuite
}

export async function runWithErrorHandling(taskName: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    log.error(`${taskName} 执行失败`, error)
    process.exitCode = 1
  }
}

export async function ensureSymbolLoaded(adapter: BasePublicAdapter | BaseTradeAdapter, symbol: string, tradeType: TradeType) {
  const info = await adapter.getSymbolInfo(symbol, tradeType)
  if (!info.ok) {
    throw new Error(`无法加载 ${symbol} 的交易对信息：${info.error.message}`)
  }
  return info.data
}

export async function placeOrderSafe(adapter: BaseTradeAdapter, params: PlaceOrderParams<number, number>) {
  const result = await adapter.placeOrder(params)
  if (!result.ok) {
    log.error('下单失败', result.error)
  } else {
    log.success('下单成功', result.data)
  }
  return result
}
