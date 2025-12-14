import { Cache } from './tools/Cache'
import type {
  Exchange,
  TradeType,
  Result,
  SymbolInfo,
  Ticker,
  OrderBook,
  IPublicAdapter
} from './types'

const cacheExpiry = 60 * 60 * 1000 // 60 分钟
/**
 * 公共 API 适配器基类
 * 提供缓存和通用逻辑
 */
export abstract class BasePublicAdapter implements IPublicAdapter {
  abstract readonly exchange: Exchange

  /** Symbol 信息缓存 */
  protected symbolCache: Cache<SymbolInfo> = new Cache<SymbolInfo>(cacheExpiry)

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
   * 从缓存获取 Symbol 信息
   */
  protected getCachedSymbol(symbol: string, tradeType: TradeType): SymbolInfo | undefined {
    const key = this.getCacheKey(symbol, tradeType)
    const cachedInfo = this.symbolCache.get(key)
    if (cachedInfo) {
      return cachedInfo
    }
    return undefined
  }

  /**
   * 设置 Symbol 缓存
   */
  protected setCachedSymbol(symbol: string, tradeType: TradeType, info: SymbolInfo): void {
    const key = this.getCacheKey(symbol, tradeType)
    this.symbolCache.set(key, info)
  }

  /**
   * 批量设置缓存
   */
  protected setCachedSymbols(tradeType: TradeType, symbols: SymbolInfo[]): void {
    for (const info of symbols) {
      const key = this.getCacheKey(info.symbol, tradeType)
      this.symbolCache.set(key, info)
    }
  }
}
