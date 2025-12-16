import { TradeType, ErrorInfo } from '../../core/types'
import { parseUnifiedSymbol } from '../../core/utils'
import { BinanceBaseUrlKey, generateNewOrderId } from 'binance'

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

export function generateBinanceClientOrderId(tradeType: TradeType): string {
    const networkMap: Record<TradeType, BinanceBaseUrlKey> = {
      spot: 'spot',
      futures: 'usdm',
      delivery: 'coinm'
    }
    return generateNewOrderId(networkMap[tradeType])
}
