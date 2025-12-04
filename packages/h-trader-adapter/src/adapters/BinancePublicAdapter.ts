/**
 * Binance 公共适配器
 * 提供无需认证的市场数据查询
 */

import {
  MainClient,
  USDMClient,
  CoinMClient,
} from 'binance';
import { BasePublicAdapter } from '../BasePublicAdapter';
import type {
  PublicAdapterConfig,
  SymbolInfo,
  TradeType,
} from '../types';
import { retryPromise, getDecimalPlaces } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

export class BinancePublicAdapter extends BasePublicAdapter {
  readonly name = 'binance';

  protected spotClient: MainClient;
  protected futuresClient: USDMClient;
  protected deliveryClient: CoinMClient;

  constructor(config: PublicAdapterConfig = {}) {
    super(config);

    // 公共 API 不需要认证
    this.spotClient = new MainClient({});
    this.futuresClient = new USDMClient({});
    this.deliveryClient = new CoinMClient({});

    // 初始化防并发的 fetchPrice
    this.initFetchPrice();
  }

  // ============ Symbol 转换 ============

  toRawSymbol(symbol: string, _tradeType: TradeType): string {
    // BTC-USDT -> BTCUSDT
    return symbol.replace('-', '');
  }

  fromRawSymbol(rawSymbol: string, _tradeType: TradeType): string {
    // BTCUSDT -> BTC-USDT (需要根据已知的quote货币列表来分割)
    const quotes = ['USDT', 'BUSD', 'USDC', 'BTC', 'ETH', 'BNB'];
    for (const quote of quotes) {
      if (rawSymbol.endsWith(quote)) {
        const base = rawSymbol.slice(0, -quote.length);
        return `${base}-${quote}`;
      }
    }
    return rawSymbol;
  }

  // ============ Symbol 信息 ============

  protected async fetchSymbolInfo(symbol: string, tradeType: TradeType): Promise<SymbolInfo | null> {
    const rawSymbol = this.toRawSymbol(symbol, tradeType);
    const symbols = await this.fetchSymbols(tradeType);
    return symbols.find(s => s.rawSymbol === rawSymbol) || null;
  }

  protected async fetchSymbols(tradeType: TradeType): Promise<SymbolInfo[]> {
    if (tradeType === 'spot') {
      const data = await retryPromise(2, () => this.spotClient.getExchangeInfo());
      return (data.symbols as AnyRecord[])
        .filter((s) => s.status === 'TRADING')
        .map((s) => this.transformSpotSymbolInfo(s));
    } else if (tradeType === 'futures') {
      const data = await retryPromise(2, () => this.futuresClient.getExchangeInfo());
      return (data.symbols as AnyRecord[])
        .filter((s) => s.status === 'TRADING')
        .map((s) => this.transformFuturesSymbolInfo(s));
    } else {
      const data = await retryPromise(2, () => this.deliveryClient.getExchangeInfo());
      return (data.symbols as AnyRecord[])
        .filter((s) => s.contractStatus === 'TRADING')
        .map((s) => this.transformDeliverySymbolInfo(s));
    }
  }

  private transformSpotSymbolInfo(data: AnyRecord): SymbolInfo {
    const filters = data.filters || [];
    const priceFilter = filters.find((f: AnyRecord) => f.filterType === 'PRICE_FILTER') || {};
    const lotFilter = filters.find((f: AnyRecord) => f.filterType === 'LOT_SIZE') || {};
    const notionalFilter = filters.find((f: AnyRecord) => f.filterType === 'NOTIONAL') || {};

    return {
      symbol: `${data.baseAsset}-${data.quoteAsset}`,
      rawSymbol: data.symbol,
      baseCurrency: data.baseAsset,
      quoteCurrency: data.quoteAsset,
      tradeType: 'spot',
      tickSize: priceFilter.tickSize || '0.01',
      stepSize: lotFilter.stepSize || '0.00001',
      minQty: lotFilter.minQty || '0.00001',
      maxQty: lotFilter.maxQty || '99999999',
      minNotional: notionalFilter.minNotional,
      quantityPrecision: getDecimalPlaces(lotFilter.stepSize || '0.00001'),
      pricePrecision: getDecimalPlaces(priceFilter.tickSize || '0.01'),
      tradable: data.status === 'TRADING',
      raw: data,
    };
  }

  private transformFuturesSymbolInfo(data: AnyRecord): SymbolInfo {
    const filters = data.filters || [];
    const priceFilter = filters.find((f: AnyRecord) => f.filterType === 'PRICE_FILTER') || {};
    const lotFilter = filters.find((f: AnyRecord) => f.filterType === 'LOT_SIZE') || {};
    const minNotionalFilter = filters.find((f: AnyRecord) => f.filterType === 'MIN_NOTIONAL') || {};

    return {
      symbol: `${data.baseAsset}-${data.quoteAsset}`,
      rawSymbol: data.symbol,
      baseCurrency: data.baseAsset,
      quoteCurrency: data.quoteAsset,
      tradeType: 'futures',
      tickSize: priceFilter.tickSize || '0.01',
      stepSize: lotFilter.stepSize || '0.001',
      minQty: lotFilter.minQty || '0.001',
      maxQty: lotFilter.maxQty || '99999999',
      minNotional: minNotionalFilter.notional,
      quantityPrecision: data.quantityPrecision || getDecimalPlaces(lotFilter.stepSize || '0.001'),
      pricePrecision: data.pricePrecision || getDecimalPlaces(priceFilter.tickSize || '0.01'),
      tradable: data.status === 'TRADING',
      raw: data,
    };
  }

  private transformDeliverySymbolInfo(data: AnyRecord): SymbolInfo {
    const filters = data.filters || [];
    const priceFilter = filters.find((f: AnyRecord) => f.filterType === 'PRICE_FILTER') || {};
    const lotFilter = filters.find((f: AnyRecord) => f.filterType === 'LOT_SIZE') || {};

    return {
      symbol: `${data.baseAsset}-${data.quoteAsset}`,
      rawSymbol: data.symbol,
      baseCurrency: data.baseAsset,
      quoteCurrency: data.quoteAsset,
      tradeType: 'delivery',
      tickSize: priceFilter.tickSize || '0.01',
      stepSize: lotFilter.stepSize || '1',
      minQty: lotFilter.minQty || '1',
      maxQty: lotFilter.maxQty || '99999999',
      quantityPrecision: data.quantityPrecision || 0,
      pricePrecision: data.pricePrecision || getDecimalPlaces(priceFilter.tickSize || '0.01'),
      contractMultiplier: data.contractSize ? parseFloat(data.contractSize) : 10,
      tradable: data.contractStatus === 'TRADING',
      raw: data,
    };
  }

  // ============ 市场数据 ============

  protected async _fetchPrice(symbol: string, tradeType: TradeType): Promise<string> {
    const rawSymbol = this.toRawSymbol(symbol, tradeType);

    if (tradeType === 'spot') {
      const data: AnyRecord = await this.spotClient.getSymbolPriceTicker({ symbol: rawSymbol });
      return data.price || '0';
    } else if (tradeType === 'futures') {
      const data: AnyRecord = await this.futuresClient.getMarkPrice({ symbol: rawSymbol });
      return data.markPrice || '0';
    } else {
      const data: AnyRecord = await this.deliveryClient.getMarkPrice({ symbol: rawSymbol });
      return data?.[0]?.markPrice || '0';
    }
  }

  async getMarkPrice(symbol: string, tradeType: TradeType): Promise<string> {
    const rawSymbol = this.toRawSymbol(symbol, tradeType);

    if (tradeType === 'futures') {
      const data: AnyRecord = await this.futuresClient.getMarkPrice({ symbol: rawSymbol });
      return data.markPrice || '0';
    } else if (tradeType === 'delivery') {
      const data: AnyRecord = await this.deliveryClient.getMarkPrice({ symbol: rawSymbol });
      return data?.[0]?.markPrice || '0';
    }
    // 现货没有标记价格，返回最新价
    return this.getPrice(symbol, tradeType);
  }
}
