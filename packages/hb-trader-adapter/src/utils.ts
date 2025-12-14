import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type { Agent } from 'node:http'
import type { Exchange, TradeType, Result, ErrorInfo, AdapterOptions } from './types'
import { InstrumentType, TradeMode } from 'okx-api'


// ============================================================================
// Result 模式 - Go/Rust 风格的错误处理
// ============================================================================
export function Ok<T>(data: T): Result<T, never> {
  return { ok: true, data }
}

export function Err<E = ErrorInfo>(error: E): Result<never, E> {
  return { ok: false, error }
}

// ============================================================================
// 精度处理
// ============================================================================

/**
 * 保留指定小数位数 (截断, 不四舍五入)
 */
export function truncateDecimal(value: number | string, precision: number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'

  const factor = Math.pow(10, precision)
  return (Math.floor(num * factor) / factor).toFixed(precision)
}

/**
 * 根据 stepSize 调整数量
 * 例如 stepSize = "0.001", quantity = 1.2345 => "1.234"
 */
export function adjustByStep(value: number | string, stepSize: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  const step = parseFloat(stepSize)

  if (isNaN(num) || isNaN(step) || step === 0) return '0'

  const precision = getDecimalPlaces(stepSize)
  const adjusted = Math.floor(num / step) * step
  return adjusted.toFixed(precision)
}

/**
 * 获取小数位数
 */
export function getDecimalPlaces(value: string): number {
  const str = value.toString()
  const index = str.indexOf('.')
  if (index === -1) return 0
  return str.length - index - 1
}

/**
 * 格式化价格 (保留精度)
 */
export function formatPrice(price: number | string, tickSize: string): string {
  return adjustByStep(price, tickSize)
}

/**
 * 格式化数量 (保留精度)
 */
export function formatQuantity(quantity: number | string, stepSize: string): string {
  return adjustByStep(quantity, stepSize)
}

// ============================================================================
// Symbol 转换
// ============================================================================

/**
 * 解析统一格式的 symbol (BTC-USDT)
 */
export function parseUnifiedSymbol(symbol: string): { base: string; quote: string } {
  const parts = symbol.split('-')
  return {
    base: parts[0] || '',
    quote: parts[1] || ''
  }
}

/**
 * 创建统一格式的 symbol
 */
export function createUnifiedSymbol(base: string, quote: string): string {
  return `${base.toUpperCase()}-${quote.toUpperCase()}`
}

/**
 * 统一格式 -> OKX 格式
 */
export function unifiedToOkx(symbol: string, tradeType: TradeType): string {
  // 统一格式: BTC-USDT
  // OKX SPOT: BTC-USDT
  // OKX SWAP: BTC-USDT-SWAP
  // OKX FUTURES: BTC-USDT-240329 (需要具体日期，这里暂时不处理)
  switch (tradeType) {
    case 'spot':
      return symbol
    case 'futures':
      return `${symbol}-SWAP`
    case 'delivery':
      // 币本位交割需要具体合约日期，调用方需要自己拼接
      return symbol
  }
}

/**
 * 统一格式 -> Binance 格式
 */
export function unifiedToBinance(symbol: string, tradeType: TradeType): string {
  // 统一格式: BTC-USDT
  // Binance SPOT: BTCUSDT
  // Binance USDM: BTCUSDT
  // Binance COINM: BTCUSD_PERP
  const { base, quote } = parseUnifiedSymbol(symbol)

  switch (tradeType) {
    case 'spot':
    case 'futures':
      return `${base}${quote}`
    case 'delivery':
      // 币本位合约: BTCUSD_PERP (永续) 或 BTCUSD_240329 (交割)
      return `${base}USD_PERP`
  }
}

/**
 * OKX 格式 -> 统一格式
 */
export function okxToUnified(instId: string): { symbol: string; tradeType: TradeType } {
  // BTC-USDT -> spot
  // BTC-USDT-SWAP -> futures
  // BTC-USDT-240329 -> delivery
  const parts = instId.split('-')

  if (parts.length === 2) {
    return { symbol: instId, tradeType: 'spot' }
  }

  if (parts.length === 3) {
    const suffix = parts[2]
    if (suffix === 'SWAP') {
      return { symbol: `${parts[0]}-${parts[1]}`, tradeType: 'futures' }
    }
    // 日期格式的是交割合约
    return { symbol: `${parts[0]}-${parts[1]}`, tradeType: 'delivery' }
  }

  return { symbol: instId, tradeType: 'spot' }
}

/**
 * 解析 Binance 格式的 symbol，提取 base 和 quote
 * BTCUSDT -> { base: 'BTC', quote: 'USDT' }
 */
export function parseBinanceSymbol(symbol: string): { base: string; quote: string } {
  const quoteCoins = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB']

  for (const quote of quoteCoins) {
    if (symbol.endsWith(quote)) {
      return { base: symbol.slice(0, -quote.length), quote }
    }
  }

  // fallback
  return { base: symbol, quote: '' }
}

/**
 * Binance 格式 -> 统一格式
 */
export function binanceToUnified(
  symbol: string,
  tradeType: TradeType
): string {
  // BTCUSDT -> BTC-USDT
  // BTCUSD_PERP -> BTC-USD

  if (tradeType === 'delivery') {
    // BTCUSD_PERP 或 BTCUSD_240329
    const [pair] = symbol.split('_')
    // 假设格式是 XXXUSD
    const base = pair.replace(/USD$/, '')
    return `${base}-USD`
  }

  // 现货和 U本位: BTCUSDT
  const { base, quote } = parseBinanceSymbol(symbol)
  if (quote) {
    return `${base}-${quote}`
  }

  return symbol
}

// ============================================================================
// 交易所客户端转换
// ============================================================================

/**
 * 获取 OKX 的 instType
 */
export function getOkxInstType(tradeType: TradeType): InstrumentType {
  switch (tradeType) {
    case 'spot':
      return 'SPOT'
    case 'futures':
      return 'SWAP'
    case 'delivery':
      return 'FUTURES'
  }
}

/**
 * 获取 OKX 的 tdMode (交易模式)
 */
export function getOkxTdMode(tradeType: TradeType, marginMode: 'cross' | 'isolated' = 'cross'): TradeMode {
  if (tradeType === 'spot') {
    return 'cash'
  }
  return marginMode
}

// ============================================================================
// 币本位合约工具
// ============================================================================

/**
 * 获取合约面值
 */
export function getContractValue(symbol: string): number {
  const { base } = parseUnifiedSymbol(symbol)
  // BTC 合约面值 100 USD, 其他 10 USD
  return base.toUpperCase() === 'BTC' ? 100 : 10
}

/**
 * USDT -> 张数 (币本位)
 */
export function usdtToContracts(
  symbol: string,
  usdt: number,
  _price: number
): number {
  const contractValue = getContractValue(symbol)
  // 张数 = USDT / (合约面值 / 币价)
  // 实际上: 张数 = USDT / 合约面值 * 币价 (这个公式不对)
  // 正确: 张数 = USDT * 币价 / 合约面值 (也不对)
  // 币本位: 1张 = contractValue USD worth of base currency
  // 张数 = USDT / contractValue
  return Math.floor(usdt / contractValue)
}

/**
 * 币数量 -> 张数 (币本位)
 */
export function coinToContracts(
  symbol: string,
  coinAmount: number,
  price: number
): number {
  const contractValue = getContractValue(symbol)
  // 张数 = 币数量 * 币价 / 合约面值
  return Math.floor(coinAmount * price / contractValue)
}

/**
 * 张数 -> 币数量 (币本位)
 */
export function contractsToCoin(
  symbol: string,
  contracts: number,
  price: number
): number {
  const contractValue = getContractValue(symbol)
  // 币数量 = 张数 * 合约面值 / 币价
  return contracts * contractValue / price
}

// ============================================================================
// 错误处理
// ============================================================================

/**
 * 包装异步调用, 捕获异常并转换为 Result
 */
export async function wrapAsync<T>(
  fn: () => Promise<T>,
  errorCode = 'UNKNOWN_ERROR'
): Promise<Result<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (e) {
    const error = e as Error & { code?: string; data?: unknown; msg?: string }
    return Err({
      code: error.code || errorCode,
      message: error.message || error.msg || 'Unknown error',
      raw: error.data || error
    })
  }
}

/**
 * 从交易所响应中提取错误
 */
export function extractOkxError(response: unknown): ErrorInfo | null {
  const res = response as { code?: string; msg?: string; data?: Array<{ sCode?: string; sMsg?: string }> }

  if (res.code && res.code !== '0') {
    return {
      code: res.code,
      message: res.msg || 'Unknown error',
      raw: response
    }
  }

  if (res.data?.[0]?.sCode && res.data[0].sCode !== '0') {
    return {
      code: res.data[0].sCode,
      message: res.data[0].sMsg || 'Unknown error',
      raw: response
    }
  }

  return null
}

/**
 * 从 Binance 响应中提取错误
 */
export function extractBinanceError(response: unknown): ErrorInfo | null {
  const res = response as { code?: number; msg?: string }

  if (res.code && res.code !== 0 && res.code !== 200) {
    return {
      code: String(res.code),
      message: res.msg || 'Unknown error',
      raw: response
    }
  }

  return null
}

// ============================================================================
// 时间工具
// ============================================================================

/**
 * 生成客户端订单ID
 */
export function generateClientOrderId(prefix: string = 'jx'): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${timestamp}_${random}`
}

// ============================================================================
// 类型守卫
// ============================================================================

export function isValidTradeType(value: unknown): value is TradeType {
  return value === 'spot' || value === 'futures' || value === 'delivery'
}

export function isValidExchange(value: unknown): value is Exchange {
  return value === 'okx' || value === 'binance'
}

// ============================================================================
// 代理工具
// ============================================================================

/**
 * 根据 AdapterOptions 创建代理 Agent
 */
export function createProxyAgent(options?: AdapterOptions): Agent | undefined {
  if (!options) return undefined

  // 优先使用 SOCKS 代理
  if (options.socksProxy) {
    return new SocksProxyAgent(options.socksProxy)
  }

  // 其次使用 HTTPS 代理
  if (options.httpsProxy) {
    return new HttpsProxyAgent(options.httpsProxy)
  }

  return undefined
}
