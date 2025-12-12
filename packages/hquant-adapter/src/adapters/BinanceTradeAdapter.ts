/**
 * Binance 交易适配器
 * 提供需要认证的交易功能
 */

import {
  MainClient,
  USDMClient,
  CoinMClient,
} from 'binance';
import { BaseTradeAdapter } from '../BaseTradeAdapter';
import { BinancePublicAdapter } from './BinancePublicAdapter';
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

export class BinanceTradeAdapter extends BaseTradeAdapter {
  readonly name = 'binance';

  private spotClient: MainClient;
  private futuresClient: USDMClient;
  private deliveryClient: CoinMClient;

  /**
   * 创建 Binance 交易适配器
   * @param config 交易配置（需要 apiKey/apiSecret）
   * @param publicAdapter 可选的公共适配器实例，不传则自动创建
   */
  constructor(config: TradeAdapterConfig, publicAdapter?: IPublicAdapter) {
    const pubAdapter = publicAdapter || new BinancePublicAdapter({
      simulated: config.simulated,
      timeout: config.timeout,
      proxy: config.proxy,
    });

    super(config, pubAdapter);

    const clientConfig = {
      api_key: config.apiKey,
      api_secret: config.apiSecret,
    };

    this.spotClient = new MainClient(clientConfig);
    this.futuresClient = new USDMClient(clientConfig);
    this.deliveryClient = new CoinMClient(clientConfig);
  }

  async init(): Promise<void> {
    // 设置合约持仓模式为双向持仓
    try {
      await this.futuresClient.setPositionMode({ dualSidePosition: 'true' });
    } catch {
      // 已经是双向持仓模式会报错，忽略
    }
  }

  async destroy(): Promise<void> {
    this.publicAdapter.clearCache();
  }

  // ============ 账户信息 ============

  async getBalance(tradeType: TradeType): Promise<Balance[]> {
    if (tradeType === 'spot') {
      const data = await retryPromise(2, () => this.spotClient.getAccountInformation());
      return (data.balances as AnyRecord[])
        .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b) => ({
          currency: b.asset,
          total: String(parseFloat(b.free) + parseFloat(b.locked)),
          available: String(b.free),
          frozen: String(b.locked),
          raw: b,
        }));
    } else if (tradeType === 'futures') {
      const data: AnyRecord[] = await retryPromise(2, () => this.futuresClient.getBalance());
      return data.map((b) => ({
        currency: b.asset,
        total: String(b.balance),
        available: String(b.availableBalance),
        frozen: String(parseFloat(b.balance) - parseFloat(b.availableBalance)),
        crossUnPnl: String(b.crossUnPnl),
        raw: b,
      }));
    } else {
      const data: AnyRecord[] = await retryPromise(2, () => this.deliveryClient.getBalance());
      return data.map((b) => ({
        currency: b.asset,
        total: String(b.balance),
        available: String(b.availableBalance),
        frozen: String(parseFloat(b.balance) - parseFloat(b.availableBalance)),
        crossUnPnl: String(b.crossUnPnl),
        raw: b,
      }));
    }
  }

  async getPositions(symbol?: string, tradeType?: TradeType): Promise<Position[]> {
    const type = tradeType || 'futures';

    let data: AnyRecord[];
    if (type === 'delivery') {
      data = await retryPromise(2, () => this.deliveryClient.getPositions()) as AnyRecord[];
    } else {
      data = await retryPromise(2, () => this.futuresClient.getPositions()) as AnyRecord[];
    }

    let positions = (data as AnyRecord[])
      .filter((p: AnyRecord) => parseFloat(p.positionAmt) !== 0)
      .map((p: AnyRecord) => ({
        symbol: this.publicAdapter.fromRawSymbol(p.symbol, type),
        positionSide: (p.positionSide || 'BOTH').toLowerCase() as 'long' | 'short',
        positionAmt: String(p.positionAmt),
        entryPrice: String(p.entryPrice),
        markPrice: String(p.markPrice),
        unrealizedPnl: String(p.unRealizedProfit),
        leverage: parseInt(p.leverage) || 1,
        marginMode: (p.marginType || 'cross').toLowerCase() as 'cross' | 'isolated',
        liquidationPrice: String(p.liquidationPrice),
        raw: p,
      }));

    if (symbol) {
      positions = positions.filter((p: Position) => p.symbol === symbol);
    }

    return positions;
  }

  // ============ 下单 ============

  protected async doPlaceOrder(params: PlaceOrderParams, symbolInfo: SymbolInfo): Promise<PlaceOrderResult> {
    const rawSymbol = symbolInfo.rawSymbol;

    try {
      if (params.tradeType === 'spot') {
        return this.doSpotOrder(params, rawSymbol);
      } else if (params.tradeType === 'futures') {
        return this.doFuturesOrder(params, rawSymbol);
      } else {
        return this.doDeliveryOrder(params, rawSymbol);
      }
    } catch (error) {
      const err = error as Error & { code?: number };
      return {
        success: false,
        code: String(err.code || 'REQUEST_ERROR'),
        message: err.message,
      };
    }
  }

  private async doSpotOrder(params: PlaceOrderParams, rawSymbol: string): Promise<PlaceOrderResult> {
    const orderParams: AnyRecord = {
      symbol: rawSymbol,
      side: params.side.toUpperCase(),
      type: params.orderType.toUpperCase(),
      quantity: String(params.quantity),
    };

    if (params.orderType === 'limit') {
      orderParams.price = String(params.price);
      orderParams.timeInForce = 'GTC';
    }
    if (params.clientOrderId) {
      orderParams.newClientOrderId = params.clientOrderId;
    }

    const result: AnyRecord = await retryPromise(2, () =>
      this.spotClient.submitNewOrder(orderParams)
    );

    return {
      success: true,
      order: this.transformSpotOrderResult(result, params),
      raw: result,
    };
  }

  private async doFuturesOrder(params: PlaceOrderParams, rawSymbol: string): Promise<PlaceOrderResult> {
    // 设置杠杆
    if (params.leverage) {
      await retryPromise(2, () =>
        this.futuresClient.setLeverage({ symbol: rawSymbol, leverage: params.leverage! })
      );
    }

    const orderParams: AnyRecord = {
      symbol: rawSymbol,
      side: params.side.toUpperCase(),
      type: params.orderType.toUpperCase(),
      quantity: String(params.quantity),
      positionSide: params.positionSide?.toUpperCase() || 'BOTH',
    };

    if (params.orderType === 'limit') {
      orderParams.price = String(params.price);
      orderParams.timeInForce = 'GTC';
    }
    if (params.clientOrderId) {
      orderParams.newClientOrderId = params.clientOrderId;
    }
    if (params.reduceOnly) {
      orderParams.reduceOnly = 'true';
    }

    const result: AnyRecord = await retryPromise(2, () =>
      this.futuresClient.submitNewOrder(orderParams)
    );

    return {
      success: true,
      order: this.transformFuturesOrderResult(result, params),
      raw: result,
    };
  }

  private async doDeliveryOrder(params: PlaceOrderParams, rawSymbol: string): Promise<PlaceOrderResult> {
    // 设置杠杆
    if (params.leverage) {
      await retryPromise(2, () =>
        this.deliveryClient.setLeverage({ symbol: rawSymbol, leverage: params.leverage! })
      );
    }

    const orderParams: AnyRecord = {
      symbol: rawSymbol,
      side: params.side.toUpperCase(),
      type: params.orderType.toUpperCase(),
      quantity: String(params.quantity),
      positionSide: params.positionSide?.toUpperCase() || 'BOTH',
    };

    if (params.orderType === 'limit') {
      orderParams.price = String(params.price);
      orderParams.timeInForce = 'GTC';
    }
    if (params.clientOrderId) {
      orderParams.newClientOrderId = params.clientOrderId;
    }

    const result: AnyRecord = await retryPromise(2, () =>
      this.deliveryClient.submitNewOrder(orderParams)
    );

    return {
      success: true,
      order: this.transformFuturesOrderResult(result, params),
      raw: result,
    };
  }

  private transformSpotOrderResult(data: AnyRecord, params: PlaceOrderParams): Order {
    return {
      orderId: String(data.orderId),
      clientOrderId: data.clientOrderId,
      symbol: params.symbol,
      tradeType: params.tradeType,
      side: params.side,
      orderType: params.orderType,
      status: this.transformOrderStatus(data.status),
      price: String(data.price || params.price || 0),
      quantity: String(data.origQty || params.quantity),
      filledQty: String(data.executedQty || 0),
      avgPrice: String(data.avgPrice || 0),
      createTime: data.transactTime || Date.now(),
      updateTime: data.updateTime || Date.now(),
      raw: data,
    };
  }

  private transformFuturesOrderResult(data: AnyRecord, params: PlaceOrderParams): Order {
    return {
      orderId: String(data.orderId),
      clientOrderId: data.clientOrderId,
      symbol: params.symbol,
      tradeType: params.tradeType,
      side: params.side,
      orderType: params.orderType,
      status: this.transformOrderStatus(data.status),
      price: String(data.price || params.price || 0),
      quantity: String(data.origQty || params.quantity),
      filledQty: String(data.executedQty || 0),
      avgPrice: String(data.avgPrice || 0),
      positionSide: params.positionSide,
      createTime: data.updateTime || Date.now(),
      updateTime: data.updateTime || Date.now(),
      raw: data,
    };
  }

  // ============ 批量下单 ============

  getBatchOrderLimits(): BatchOrderLimits {
    return {
      maxBatchSize: 5,
      supportedTradeTypes: ['futures', 'delivery'],
    };
  }

  protected async doBatchPlaceOrder(
    paramsList: PlaceOrderParams[],
    symbolInfoMap: Map<string, SymbolInfo>
  ): Promise<PlaceOrderResult[]> {
    if (paramsList.length === 0) return [];

    // 按 tradeType 分组
    const tradeType = paramsList[0].tradeType;

    // Binance 现货不支持批量下单，退化为并行单个下单
    if (tradeType === 'spot') {
      return Promise.all(
        paramsList.map(params => {
          const symbolInfo = symbolInfoMap.get(`${params.tradeType}:${params.symbol}`);
          return this.doPlaceOrder(params, symbolInfo!);
        })
      );
    }

    // 构建批量下单参数 (注意: 数值必须是字符串!)
    const batchOrders = paramsList.map(params => {
      const order: AnyRecord = {
        symbol: this.publicAdapter.toRawSymbol(params.symbol, tradeType),
        side: params.side.toUpperCase(),
        type: params.orderType.toUpperCase(),
        quantity: String(params.quantity),
        positionSide: params.positionSide?.toUpperCase() || 'BOTH',
      };

      if (params.orderType === 'limit') {
        order.price = String(params.price);
        order.timeInForce = 'GTC';
      }
      if (params.clientOrderId) {
        order.newClientOrderId = params.clientOrderId;
      }
      if (params.reduceOnly) {
        order.reduceOnly = 'true';
      }

      return order;
    });

    try {
      let results: AnyRecord[];

      if (tradeType === 'futures') {
        results = await retryPromise(2, () =>
          this.futuresClient.submitMultipleOrders(batchOrders)
        );
      } else {
        results = await retryPromise(2, () =>
          this.deliveryClient.submitMultipleOrders(batchOrders)
        );
      }

      // 转换结果
      return results.map((data, index) => {
        const params = paramsList[index];

        // Binance 批量下单返回的错误格式
        if (data.code && data.code !== 200) {
          return {
            success: false,
            code: String(data.code),
            message: data.msg || 'Unknown error',
            raw: data,
          };
        }

        return {
          success: true,
          order: this.transformFuturesOrderResult(data, params),
          raw: data,
        };
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
    const rawSymbol = this.publicAdapter.toRawSymbol(symbol, tradeType);

    try {
      if (tradeType === 'spot') {
        await retryPromise(2, () =>
          this.spotClient.cancelOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
        );
      } else if (tradeType === 'futures') {
        await retryPromise(2, () =>
          this.futuresClient.cancelOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
        );
      } else {
        await retryPromise(2, () =>
          this.deliveryClient.cancelOrder({ symbol: rawSymbol, orderId: parseInt(orderId) })
        );
      }

      return { success: true, orderId };
    } catch (error) {
      const err = error as Error & { code?: number };
      // 订单已成交或不存在
      if (err.code === -2011) {
        return { success: true, orderId };
      }
      return {
        success: false,
        orderId,
        code: String(err.code || 'REQUEST_ERROR'),
        message: err.message,
      };
    }
  }

  async getOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Order | null> {
    const rawSymbol = this.publicAdapter.toRawSymbol(symbol, tradeType);

    try {
      let data: AnyRecord;

      if (tradeType === 'spot') {
        data = await this.spotClient.getOrder({ symbol: rawSymbol, orderId: parseInt(orderId) });
      } else if (tradeType === 'futures') {
        data = await this.futuresClient.getOrder({ symbol: rawSymbol, orderId: parseInt(orderId) });
      } else {
        data = await this.deliveryClient.getOrder({ symbol: rawSymbol, orderId: parseInt(orderId) });
      }

      return this.transformOrderData(data, symbol, tradeType);
    } catch {
      return null;
    }
  }

  async getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Order[]> {
    const type = tradeType || 'spot';
    const rawSymbol = symbol ? this.publicAdapter.toRawSymbol(symbol, type) : undefined;

    let data: AnyRecord[];

    if (type === 'spot') {
      data = rawSymbol
        ? await this.spotClient.getOpenOrders({ symbol: rawSymbol })
        : await this.spotClient.getOpenOrders();
    } else if (type === 'futures') {
      data = rawSymbol
        ? await this.futuresClient.getAllOpenOrders({ symbol: rawSymbol })
        : await this.futuresClient.getAllOpenOrders();
    } else {
      data = rawSymbol
        ? await this.deliveryClient.getAllOpenOrders({ symbol: rawSymbol })
        : await this.deliveryClient.getAllOpenOrders();
    }

    return data.map((item) => {
      const sym = symbol || this.publicAdapter.fromRawSymbol(item.symbol, type);
      return this.transformOrderData(item, sym, type);
    });
  }

  private transformOrderData(data: AnyRecord, symbol: string, tradeType: TradeType): Order {
    return {
      orderId: String(data.orderId),
      clientOrderId: data.clientOrderId,
      symbol,
      tradeType,
      side: (data.side as string).toLowerCase() as Side,
      orderType: (data.type as string).toLowerCase() === 'market' ? 'market' : 'limit',
      status: this.transformOrderStatus(data.status),
      price: String(data.price || 0),
      quantity: String(data.origQty || 0),
      filledQty: String(data.executedQty || 0),
      avgPrice: String(data.avgPrice || 0),
      positionSide: data.positionSide ? (data.positionSide as string).toLowerCase() as 'long' | 'short' : undefined,
      createTime: data.time || Date.now(),
      updateTime: data.updateTime || Date.now(),
      raw: data,
    };
  }

  private transformOrderStatus(status: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      NEW: 'open',
      PARTIALLY_FILLED: 'partial',
      FILLED: 'filled',
      CANCELED: 'cancelled',
      REJECTED: 'rejected',
      EXPIRED: 'expired',
    };
    return statusMap[status] || 'pending';
  }
}
