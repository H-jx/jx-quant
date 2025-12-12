/**
 * 公共适配器抽象基类
 * 提供无需认证的市场数据查询功能
 */

import type {
  IPublicAdapter,
  PublicAdapterConfig,
  SymbolInfo,
  TradeType,
} from './types';
import { singlePromise } from './utils';

export abstract class BasePublicAdapter implements IPublicAdapter {
  abstract readonly name: string;

  protected config: PublicAdapterConfig;
  protected symbolInfoCache: Map<string, SymbolInfo> = new Map();

  constructor(config: PublicAdapterConfig = {}) {
    this.config = config;
  }

  // ============ 抽象方法 - 子类必须实现 ============

  /** 从交易所获取symbol信息 */
  protected abstract fetchSymbolInfo(symbol: string, tradeType: TradeType): Promise<SymbolInfo | null>;

  /** 从交易所获取所有symbols */
  protected abstract fetchSymbols(tradeType: TradeType): Promise<SymbolInfo[]>;

  /** 获取价格 (内部实现) */
  protected abstract _fetchPrice(symbol: string, tradeType: TradeType): Promise<string>;

  /** 获取标记价格 */
  abstract getMarkPrice(symbol: string, tradeType: TradeType): Promise<string>;

  /** symbol转换 */
  abstract toRawSymbol(symbol: string, tradeType: TradeType): string;
  abstract fromRawSymbol(rawSymbol: string, tradeType: TradeType): string;

  // ============ 公共实现 ============

  /**
   * 获取交易对信息 (带缓存)
   */
  async getSymbolInfo(symbol: string, tradeType: TradeType): Promise<SymbolInfo | null> {
    const cacheKey = `${tradeType}:${symbol}`;

    if (this.symbolInfoCache.has(cacheKey)) {
      return this.symbolInfoCache.get(cacheKey)!;
    }

    const info = await this.fetchSymbolInfo(symbol, tradeType);
    if (info) {
      this.symbolInfoCache.set(cacheKey, info);
    }
    return info;
  }

  /**
   * 获取所有交易对 (带缓存)
   */
  async getSymbols(tradeType: TradeType): Promise<SymbolInfo[]> {
    const symbols = await this.fetchSymbols(tradeType);

    // 更新缓存
    for (const info of symbols) {
      const cacheKey = `${tradeType}:${info.symbol}`;
      this.symbolInfoCache.set(cacheKey, info);
    }

    return symbols;
  }

  /**
   * 获取价格 (防并发)
   */
  protected fetchPrice: (symbol: string, tradeType: TradeType) => Promise<string>;

  /**
   * 初始化 fetchPrice 方法 (子类构造函数中调用)
   */
  protected initFetchPrice(): void {
    this.fetchPrice = singlePromise(
      this._fetchPrice.bind(this),
      (symbol, tradeType) => `${tradeType}:${symbol}`
    );
  }

  /**
   * 获取价格
   */
  async getPrice(symbol: string, tradeType: TradeType): Promise<string> {
    return this.fetchPrice(symbol, tradeType);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.symbolInfoCache.clear();
  }
}
