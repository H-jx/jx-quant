/**
 * OKX 公共适配器
 * 提供无需认证的市场数据查询
 */

import { RestClient } from 'okx-api';
import { BasePublicAdapter } from '../BasePublicAdapter';
import type {
  PublicAdapterConfig,
  SymbolInfo,
  TradeType,
} from '../types';
import { retryPromise, getDecimalPlaces } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

/** OKX InstType 映射 */
const TRADE_TYPE_TO_INST_TYPE: Record<TradeType, string> = {
  spot: 'SPOT',
  futures: 'SWAP',
  delivery: 'FUTURES',
};

export class OkxPublicAdapter extends BasePublicAdapter {
  readonly name = 'okx';

  protected client: RestClient;

  constructor(config: PublicAdapterConfig = {}) {
    super(config);

    // 公共 API 不需要认证，但 okx-api 类型要求传入 credentials
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.client = new RestClient({} as any, config.simulated ? 'demo' : 'prod');

    // 初始化防并发的 fetchPrice
    this.initFetchPrice();
  }

  // ============ Symbol 转换 ============

  toRawSymbol(symbol: string, tradeType: TradeType): string {
    // BTC-USDT -> BTC-USDT (现货), BTC-USDT-SWAP (合约), BTC-USDT-240329 (交割)
    if (tradeType === 'spot') {
      return symbol;
    } else if (tradeType === 'futures') {
      return `${symbol}-SWAP`;
    } else {
      // delivery需要额外处理，这里简化
      return `${symbol}-SWAP`;
    }
  }

  fromRawSymbol(rawSymbol: string, tradeType: TradeType): string {
    // BTC-USDT-SWAP -> BTC-USDT
    if (tradeType === 'spot') {
      return rawSymbol;
    }
    return rawSymbol.replace(/-SWAP$/, '').replace(/-\d{6}$/, '');
  }

  // ============ Symbol 信息 ============

  protected async fetchSymbolInfo(symbol: string, tradeType: TradeType): Promise<SymbolInfo | null> {
    const instId = this.toRawSymbol(symbol, tradeType);
    const instType = TRADE_TYPE_TO_INST_TYPE[tradeType];

    const data: AnyRecord[] = await retryPromise(2, () =>
      this.client.getInstruments({ instType } as AnyRecord)
    );

    const instrument = data.find((item) => item.instId === instId);
    if (!instrument) return null;

    return this.transformSymbolInfo(instrument, tradeType);
  }

  protected async fetchSymbols(tradeType: TradeType): Promise<SymbolInfo[]> {
    const instType = TRADE_TYPE_TO_INST_TYPE[tradeType];

    const data: AnyRecord[] = await retryPromise(2, () =>
      this.client.getInstruments({ instType } as AnyRecord)
    );

    return data.map((item) => this.transformSymbolInfo(item, tradeType));
  }

  private transformSymbolInfo(data: AnyRecord, tradeType: TradeType): SymbolInfo {
    const instId = data.instId as string;
    const parts = instId.split('-');

    return {
      symbol: this.fromRawSymbol(instId, tradeType),
      rawSymbol: instId,
      baseCurrency: parts[0],
      quoteCurrency: parts[1],
      tradeType,
      tickSize: data.tickSz,
      stepSize: data.lotSz,
      minQty: data.minSz,
      maxQty: data.maxSz || '99999999',
      quantityPrecision: getDecimalPlaces(data.lotSz),
      pricePrecision: getDecimalPlaces(data.tickSz),
      contractMultiplier: data.ctVal ? parseFloat(data.ctVal) : undefined,
      tradable: data.state === 'live',
      raw: data,
    };
  }

  // ============ 市场数据 ============

  protected async _fetchPrice(symbol: string, tradeType: TradeType): Promise<string> {
    const instId = this.toRawSymbol(symbol, tradeType);

    if (tradeType === 'spot') {
      const data: AnyRecord[] = await this.client.getTicker(instId);
      return data[0]?.last || '0';
    } else {
      const data: AnyRecord[] = await this.client.getMarkPrice({ instId, instType: 'SWAP' });
      return data[0]?.markPx || '0';
    }
  }

  async getMarkPrice(symbol: string, tradeType: TradeType): Promise<string> {
    const instId = this.toRawSymbol(symbol, tradeType);
    const data: AnyRecord[] = await this.client.getMarkPrice({
      instId,
      instType: TRADE_TYPE_TO_INST_TYPE[tradeType],
    } as AnyRecord);
    return data[0]?.markPx || '0';
  }
}
