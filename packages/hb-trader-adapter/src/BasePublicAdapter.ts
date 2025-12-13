import type {
  Exchange,
  TradeType,
  Result,
  SymbolInfo,
  Ticker,
  OrderBook,
  IPublicAdapter
} from './types'

/**
 * 公共 API 适配器基类
 * 提供缓存和通用逻辑
 */
export abstract class BasePublicAdapter implements IPublicAdapter {
  abstract readonly exchange: Exchange

  /** Symbol 信息缓存 */
  protected symbolCache: Map<string, SymbolInfo> = new Map()

  /** 缓存过期时间 (ms) */
  protected cacheExpiry = 5 * 60 * 1000 // 5 分钟

  /** 缓存时间戳 */
  protected cacheTimestamp: Map<string, number> = new Map()

  // ============================================================================
  // 抽象方法 - 子类必须实现
  // ============================================================================

  abstract getSymbolInfo(symbol: string, tradeType: TradeType): Promise<Result<SymbolInfo>>
  abstract getAllSymbols(tradeType: TradeType): Promise<Result<SymbolInfo[]>>
  abstract getPrice(symbol: string, tradeType: TradeType): Promise<Result<string>>
  abstract getMarkPrice(symbol: string, tradeType: TradeType): Promise<Result<string>>
  abstract getTicker(symbol: string, tradeType: TradeType): Promise<Result<Ticker>>
  abstract getOrderBook(symbol: string, tradeType: TradeType, limit?: number): Promise<Result<OrderBook>>

  /** 统一格式 -> 交易所原始格式 */
  abstract toRawSymbol(symbol: string, tradeType: TradeType): string

  /** 交易所原始格式 -> 统一格式 */
  abstract fromRawSymbol(rawSymbol: string, tradeType: TradeType): string

  // ============================================================================
  // 通用方法
  // ============================================================================

  /**
   * 生成缓存 key
   */
  protected getCacheKey(symbol: string, tradeType: TradeType): string {
    return `${this.exchange}:${tradeType}:${symbol}`
  }

  /**
   * 检查缓存是否有效
   */
  protected isCacheValid(key: string): boolean {
    const timestamp = this.cacheTimestamp.get(key)
    if (!timestamp) return false
    return Date.now() - timestamp < this.cacheExpiry
  }

  /**
   * 从缓存获取 Symbol 信息
   */
  protected getCachedSymbol(symbol: string, tradeType: TradeType): SymbolInfo | undefined {
    const key = this.getCacheKey(symbol, tradeType)
    if (this.isCacheValid(key)) {
      return this.symbolCache.get(key)
    }
    return undefined
  }

  /**
   * 设置 Symbol 缓存
   */
  protected setCachedSymbol(symbol: string, tradeType: TradeType, info: SymbolInfo): void {
    const key = this.getCacheKey(symbol, tradeType)
    this.symbolCache.set(key, info)
    this.cacheTimestamp.set(key, Date.now())
  }

  /**
   * 批量设置缓存
   */
  protected setCachedSymbols(tradeType: TradeType, symbols: SymbolInfo[]): void {
    const now = Date.now()
    for (const info of symbols) {
      const key = this.getCacheKey(info.symbol, tradeType)
      this.symbolCache.set(key, info)
      this.cacheTimestamp.set(key, now)
    }
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.symbolCache.clear()
    this.cacheTimestamp.clear()
  }

  /**
   * 设置缓存过期时间
   */
  public setCacheExpiry(ms: number): void {
    this.cacheExpiry = ms
  }
}
