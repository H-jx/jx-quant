/**
 * OKX 交易适配器
 * 提供需要认证的交易功能
 */

import { RestClient } from 'okx-api';
import { BaseTradeAdapter } from '../BaseTradeAdapter';
import { OkxPublicAdapter } from './OkxPublicAdapter';
import type {
  TradeAdapterConfig,
  IPublicAdapter,
  SymbolInfo,
  Balance,
  Position,
  PlaceOrderParams,
  PlaceOrderResult,
  BatchOrderLimits,
  CancelOrderResult,
  Order,
  TradeType,
  OrderStatus,
  Side,
} from '../types';
import { retryPromise } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

/** OKX InstType 映射 */
const TRADE_TYPE_TO_INST_TYPE: Record<TradeType, string> = {
  spot: 'SPOT',
  futures: 'SWAP',
  delivery: 'FUTURES',
};

export class OkxTradeAdapter extends BaseTradeAdapter {
  readonly name = 'okx';

  private client: RestClient;

  /**
   * 创建 OKX 交易适配器
   * @param config 交易配置（需要 apiKey/apiSecret/passphrase）
   * @param publicAdapter 可选的公共适配器实例，不传则自动创建
   */
  constructor(config: TradeAdapterConfig, publicAdapter?: IPublicAdapter) {
    const pubAdapter = publicAdapter || new OkxPublicAdapter({
      simulated: config.simulated,
      timeout: config.timeout,
      proxy: config.proxy,
    });

    super(config, pubAdapter);

    this.client = new RestClient({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      apiPass: config.passphrase,
    }, config.simulated ? 'demo' : 'prod');
  }

  async init(): Promise<void> {
    // 检查账户配置 (确保是开平仓模式)
    const accountConfig = await this.client.getAccountConfiguration();
    if (accountConfig[0]?.posMode !== 'long_short_mode') {
      await this.client.setPositionMode('long_short_mode');
    }
  }

  async destroy(): Promise<void> {
    this.publicAdapter.clearCache();
  }

  // ============ 账户信息 ============

  async getBalance(_tradeType: TradeType): Promise<Balance[]> {
    const data: AnyRecord[] = await retryPromise(2, () => this.client.getBalance());

    return data[0]?.details?.map((item: AnyRecord) => ({
      currency: item.ccy,
      total: item.cashBal || '0',
      available: item.availBal || '0',
      frozen: item.frozenBal || '0',
      crossUnPnl: item.crossUnPnl || '0',
      raw: item,
    })) || [];
  }

  async getPositions(symbol?: string, tradeType?: TradeType): Promise<Position[]> {
    const params: AnyRecord = {};

    if (tradeType) {
      params.instType = TRADE_TYPE_TO_INST_TYPE[tradeType];
    }
    if (symbol && tradeType) {
      params.instId = this.publicAdapter.toRawSymbol(symbol, tradeType);
    }

    const data: AnyRecord[] = await retryPromise(2, () => this.client.getPositions(params));

    return data.map((item) => ({
      symbol: this.publicAdapter.fromRawSymbol(item.instId, tradeType || 'futures'),
      positionSide: (item.posSide || 'long').toLowerCase() as 'long' | 'short',
      positionAmt: item.pos || '0',
      entryPrice: item.avgPx || '0',
      markPrice: item.markPx || '0',
      unrealizedPnl: item.upl || '0',
      leverage: parseFloat(item.lever || '1'),
      marginMode: (item.mgnMode || 'cross') as 'cross' | 'isolated',
      liquidationPrice: item.liqPx || undefined,
      raw: item,
    }));
  }

  // ============ 下单 ============

  protected async doPlaceOrder(params: PlaceOrderParams, symbolInfo: SymbolInfo): Promise<PlaceOrderResult> {
    const instId = symbolInfo.rawSymbol;

    // 设置杠杆 (合约)
    if (params.tradeType !== 'spot' && params.leverage) {
      await retryPromise(2, () =>
        this.client.setLeverage({
          instId,
          lever: String(params.leverage),
          mgnMode: 'isolated',
          posSide: params.positionSide,
        } as AnyRecord)
      );
    }

    // 构建下单参数
    const orderParams: AnyRecord = {
      instId,
      tdMode: params.tradeType === 'spot' ? 'cash' : 'isolated',
      side: params.side,
      ordType: params.orderType,
      sz: String(params.quantity),
    };

    if (params.positionSide) {
      orderParams.posSide = params.positionSide;
    }
    if (params.price !== undefined) {
      orderParams.px = String(params.price);
    }
    if (params.clientOrderId) {
      orderParams.clOrdId = params.clientOrderId;
    }
    if (params.reduceOnly) {
      orderParams.reduceOnly = 'true';
    }

    try {
      const result: AnyRecord[] = await retryPromise(2, () =>
        this.client.submitOrder(orderParams)
      );

      const orderData = result[0];

      if (orderData?.sCode === '0') {
        return {
          success: true,
          order: {
            orderId: orderData.ordId,
            clientOrderId: orderData.clOrdId,
            symbol: params.symbol,
            tradeType: params.tradeType,
            side: params.side,
            orderType: params.orderType,
            status: 'open',
            price: String(params.price || 0),
            quantity: String(params.quantity),
            filledQty: '0',
            avgPrice: '0',
            positionSide: params.positionSide,
            createTime: Date.now(),
            updateTime: Date.now(),
            raw: orderData,
          },
          raw: result,
        };
      } else {
        return {
          success: false,
          code: orderData?.sCode || 'UNKNOWN',
          message: orderData?.sMsg || 'Unknown error',
          raw: result,
        };
      }
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        code: 'REQUEST_ERROR',
        message: err.message,
      };
    }
  }

  // ============ 批量下单 ============

  getBatchOrderLimits(): BatchOrderLimits {
    return {
      maxBatchSize: 20,
      supportedTradeTypes: ['spot', 'futures', 'delivery'],
    };
  }

  protected async doBatchPlaceOrder(
    paramsList: PlaceOrderParams[],
    _symbolInfoMap: Map<string, SymbolInfo>
  ): Promise<PlaceOrderResult[]> {
    if (paramsList.length === 0) return [];

    // 构建批量下单参数
    const batchOrders = paramsList.map(params => {
      const instId = this.publicAdapter.toRawSymbol(params.symbol, params.tradeType);

      const order: AnyRecord = {
        instId,
        tdMode: params.tradeType === 'spot' ? 'cash' : 'isolated',
        side: params.side,
        ordType: params.orderType,
        sz: String(params.quantity),
      };

      if (params.positionSide) {
        order.posSide = params.positionSide;
      }
      if (params.price !== undefined) {
        order.px = String(params.price);
      }
      if (params.clientOrderId) {
        order.clOrdId = params.clientOrderId;
      }
      if (params.reduceOnly) {
        order.reduceOnly = 'true';
      }

      return order;
    });

    try {
      const results: AnyRecord[] = await retryPromise(2, () =>
        this.client.submitMultipleOrders(batchOrders)
      );

      // 转换结果 (OKX 返回顺序与请求一致)
      return results.map((data, index) => {
        const params = paramsList[index];

        if (data?.sCode === '0') {
          return {
            success: true,
            order: {
              orderId: data.ordId,
              clientOrderId: data.clOrdId,
              symbol: params.symbol,
              tradeType: params.tradeType,
              side: params.side,
              orderType: params.orderType,
              status: 'open' as const,
              price: String(params.price || 0),
              quantity: String(params.quantity),
              filledQty: '0',
              avgPrice: '0',
              positionSide: params.positionSide,
              createTime: Date.now(),
              updateTime: Date.now(),
              raw: data,
            },
            raw: data,
          };
        } else {
          return {
            success: false,
            code: data?.sCode || 'UNKNOWN',
            message: data?.sMsg || 'Unknown error',
            raw: data,
          };
        }
      });
    } catch (error) {
      const err = error as Error;
      return paramsList.map(() => ({
        success: false,
        code: 'BATCH_REQUEST_ERROR',
        message: err.message,
      }));
    }
  }

  // ============ 订单管理 ============

  async cancelOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<CancelOrderResult> {
    const instId = this.publicAdapter.toRawSymbol(symbol, tradeType);

    try {
      const result: AnyRecord[] = await retryPromise(2, () =>
        this.client.cancelOrder({ instId, ordId: orderId })
      );

      const data = result[0];
      if (data?.sCode === '0') {
        return { success: true, orderId };
      } else {
        // 订单已成交或不存在
        if (['51400', '51401', '51001'].includes(data?.sCode)) {
          return { success: true, orderId };
        }
        return {
          success: false,
          orderId,
          code: data?.sCode,
          message: data?.sMsg,
        };
      }
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        orderId,
        code: 'REQUEST_ERROR',
        message: err.message,
      };
    }
  }

  async getOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Order | null> {
    const instId = this.publicAdapter.toRawSymbol(symbol, tradeType);

    const data: AnyRecord[] = await retryPromise(2, () =>
      this.client.getOrderDetails({ instId, ordId: orderId })
    );

    if (!data[0]) return null;

    return this.transformOrder(data[0], tradeType);
  }

  async getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Order[]> {
    const params: AnyRecord = {};

    if (tradeType) {
      params.instType = TRADE_TYPE_TO_INST_TYPE[tradeType];
    }
    if (symbol && tradeType) {
      params.instId = this.publicAdapter.toRawSymbol(symbol, tradeType);
    }

    const data: AnyRecord[] = await retryPromise(2, () =>
      this.client.getOrderList(params)
    );

    return data.map((item) =>
      this.transformOrder(item, tradeType || this.guessTradeType(item.instId))
    );
  }

  private transformOrder(data: AnyRecord, tradeType: TradeType): Order {
    return {
      orderId: data.ordId,
      clientOrderId: data.clOrdId || undefined,
      symbol: this.publicAdapter.fromRawSymbol(data.instId, tradeType),
      tradeType,
      side: data.side as Side,
      orderType: data.ordType === 'market' ? 'market' : 'limit',
      status: this.transformOrderStatus(data.state),
      price: data.px || '0',
      quantity: data.sz || '0',
      filledQty: data.accFillSz || '0',
      avgPrice: data.avgPx || '0',
      positionSide: data.posSide as 'long' | 'short' | undefined,
      fee: data.fee || undefined,
      feeCurrency: data.feeCcy || undefined,
      createTime: parseInt(data.cTime) || Date.now(),
      updateTime: parseInt(data.uTime) || Date.now(),
      raw: data,
    };
  }

  private transformOrderStatus(state: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      live: 'open',
      partially_filled: 'partial',
      filled: 'filled',
      canceled: 'cancelled',
      rejected: 'rejected',
      expired: 'expired',
    };
    return statusMap[state] || 'pending';
  }

  private guessTradeType(instId: string): TradeType {
    if (instId.endsWith('-SWAP')) return 'futures';
    if (instId.match(/-\d{6}$/)) return 'delivery';
    return 'spot';
  }
}
