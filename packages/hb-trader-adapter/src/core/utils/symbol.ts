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
