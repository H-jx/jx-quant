/**
 * 交易适配器抽象基类
 * 组合公共适配器，提供需要认证的交易功能
 */

import { EventEmitter } from 'events';
import type {
  ITradeAdapter,
  IPublicAdapter,
  TradeAdapterConfig,
  SymbolInfo,
  Balance,
  Position,
  PlaceOrderParams,
  PlaceOrderResult,
  BatchPlaceOrderResult,
  BatchOrderLimits,
  CancelOrderResult,
  Order,
  ValidationResult,
  ValidationError,
  TradeType,
  AdapterEventMap,
} from './types';
import {
  alignToStepSize,
  alignToTickSize,
  parseSymbol,
  safeParseFloat,
} from './utils';

export abstract class BaseTradeAdapter extends EventEmitter implements ITradeAdapter {
  abstract readonly name: string;

  /** 公共适配器实例 */
  readonly publicAdapter: IPublicAdapter;

  protected config: TradeAdapterConfig;

  constructor(config: TradeAdapterConfig, publicAdapter: IPublicAdapter) {
    super();
    this.config = config;
    this.publicAdapter = publicAdapter;
  }

  // ============ 抽象方法 - 子类必须实现 ============

  abstract init(): Promise<void>;
  abstract destroy(): Promise<void>;

  /** 获取余额 */
  abstract getBalance(tradeType: TradeType): Promise<Balance[]>;

  /** 获取持仓 */
  abstract getPositions(symbol?: string, tradeType?: TradeType): Promise<Position[]>;

  /** 执行下单 (交易所原生调用) */
  protected abstract doPlaceOrder(params: PlaceOrderParams, symbolInfo: SymbolInfo): Promise<PlaceOrderResult>;

  /** 执行批量下单 (交易所原生调用) */
  protected abstract doBatchPlaceOrder(
    paramsList: PlaceOrderParams[],
    symbolInfoMap: Map<string, SymbolInfo>
  ): Promise<PlaceOrderResult[]>;

  /** 获取批量下单限制 */
  abstract getBatchOrderLimits(): BatchOrderLimits;

  /** 取消订单 */
  abstract cancelOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<CancelOrderResult>;

  /** 查询订单 */
  abstract getOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Order | null>;

  /** 查询未完成订单 */
  abstract getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Order[]>;

  // ============ 公共实现 ============

  /**
   * 校验下单参数
   */
  validateOrderParams(params: PlaceOrderParams, symbolInfo: SymbolInfo): ValidationResult {
    const errors: ValidationError[] = [];

    // 1. 检查交易对是否可交易
    if (!symbolInfo.tradable) {
      errors.push({
        code: 'SYMBOL_NOT_TRADABLE',
        field: 'symbol',
        message: `Symbol ${params.symbol} is not tradable`,
      });
    }

    // 2. 限价单必须有价格
    if (params.orderType === 'limit' && (params.price === undefined || params.price <= 0)) {
      errors.push({
        code: 'MISSING_PRICE',
        field: 'price',
        message: 'Price is required for limit order',
        actual: params.price,
      });
    }

    // 3. 合约必须有持仓方向
    if ((params.tradeType === 'futures' || params.tradeType === 'delivery') && !params.positionSide) {
      errors.push({
        code: 'MISSING_POSITION_SIDE',
        field: 'positionSide',
        message: 'Position side is required for futures/delivery order',
      });
    }

    // 4. 检查数量
    if (params.quantity <= 0) {
      errors.push({
        code: 'INVALID_QUANTITY',
        field: 'quantity',
        message: 'Quantity must be greater than 0',
        actual: params.quantity,
      });
    }

    // 5. 检查最小数量
    const minQty = safeParseFloat(symbolInfo.minQty);
    if (params.quantity < minQty) {
      errors.push({
        code: 'QUANTITY_TOO_SMALL',
        field: 'quantity',
        message: `Quantity ${params.quantity} is less than minimum ${minQty}`,
        actual: params.quantity,
        expected: minQty,
      });
    }

    // 6. 检查最大数量
    const maxQty = safeParseFloat(symbolInfo.maxQty);
    if (maxQty > 0 && params.quantity > maxQty) {
      errors.push({
        code: 'QUANTITY_TOO_LARGE',
        field: 'quantity',
        message: `Quantity ${params.quantity} exceeds maximum ${maxQty}`,
        actual: params.quantity,
        expected: maxQty,
      });
    }

    // 7. 检查价格有效性 (限价单)
    if (params.orderType === 'limit' && params.price !== undefined) {
      if (params.price <= 0) {
        errors.push({
          code: 'INVALID_PRICE',
          field: 'price',
          message: 'Price must be greater than 0',
          actual: params.price,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 校验余额是否充足
   */
  validateBalance(
    params: PlaceOrderParams,
    symbolInfo: SymbolInfo,
    balance: Balance[],
    positions?: Position[]
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const { base, quote } = parseSymbol(params.symbol);

    if (params.tradeType === 'spot') {
      // 现货交易
      if (params.side === 'buy') {
        // 买入需要quote货币
        const quoteBalance = balance.find(b => b.currency === quote);
        const available = safeParseFloat(quoteBalance?.available);
        const price = params.price || 0;
        const required = params.quantity * price * 1.002; // 1.002 滑点缓冲

        if (available < required) {
          errors.push({
            code: 'INSUFFICIENT_BALANCE',
            field: 'balance',
            message: `Insufficient ${quote} balance. Required: ${required}, Available: ${available}`,
            actual: available,
            expected: required,
          });
        }
      } else {
        // 卖出需要base货币
        const baseBalance = balance.find(b => b.currency === base);
        const available = safeParseFloat(baseBalance?.available);

        if (available < params.quantity) {
          errors.push({
            code: 'INSUFFICIENT_BALANCE',
            field: 'balance',
            message: `Insufficient ${base} balance. Required: ${params.quantity}, Available: ${available}`,
            actual: available,
            expected: params.quantity,
          });
        }
      }
    } else {
      // 合约交易
      const isOpen = (params.side === 'buy' && params.positionSide === 'long') ||
                     (params.side === 'sell' && params.positionSide === 'short');

      if (isOpen) {
        // 开仓 - 检查保证金
        const leverage = params.leverage || 1;
        const price = params.price || 0;
        const requiredMargin = (params.quantity * price) / leverage;

        // 合约一般用USDT做保证金
        const marginCurrency = params.tradeType === 'delivery' ? base : 'USDT';
        const marginBalance = balance.find(b => b.currency === marginCurrency);
        const available = safeParseFloat(marginBalance?.available);

        if (available < requiredMargin) {
          errors.push({
            code: 'INSUFFICIENT_BALANCE',
            field: 'balance',
            message: `Insufficient margin. Required: ${requiredMargin} ${marginCurrency}, Available: ${available}`,
            actual: available,
            expected: requiredMargin,
          });
        }
      } else {
        // 平仓 - 检查持仓
        if (positions) {
          const position = positions.find(
            p => p.symbol === params.symbol && p.positionSide === params.positionSide
          );
          const positionAmt = safeParseFloat(position?.positionAmt);

          if (Math.abs(positionAmt) < params.quantity) {
            errors.push({
              code: 'INSUFFICIENT_POSITION',
              field: 'position',
              message: `Insufficient position. Required: ${params.quantity}, Available: ${Math.abs(positionAmt)}`,
              actual: Math.abs(positionAmt),
              expected: params.quantity,
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 格式化订单参数 (按精度)
   */
  formatOrderParams(params: PlaceOrderParams, symbolInfo: SymbolInfo): PlaceOrderParams {
    const formatted = { ...params };

    // 格式化数量
    formatted.quantity = alignToStepSize(params.quantity, symbolInfo.stepSize);

    // 格式化价格 (限价单)
    if (params.price !== undefined) {
      formatted.price = alignToTickSize(params.price, symbolInfo.tickSize);
    }

    return formatted;
  }

  /**
   * 下单 (完整流程)
   */
  async placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
    try {
      // 1. 获取symbolInfo (通过公共适配器)
      const symbolInfo = await this.publicAdapter.getSymbolInfo(params.symbol, params.tradeType);
      if (!symbolInfo) {
        return {
          success: false,
          code: 'SYMBOL_NOT_FOUND',
          message: `Symbol ${params.symbol} not found`,
        };
      }

      // 2. 校验参数
      const paramValidation = this.validateOrderParams(params, symbolInfo);
      if (!paramValidation.valid) {
        return {
          success: false,
          code: paramValidation.errors[0].code,
          message: paramValidation.errors.map(e => e.message).join('; '),
        };
      }

      // 3. 获取余额/持仓
      const [balance, positions] = await Promise.all([
        this.getBalance(params.tradeType),
        params.tradeType !== 'spot' ? this.getPositions(params.symbol, params.tradeType) : Promise.resolve(undefined),
      ]);

      // 4. 校验余额
      const balanceValidation = this.validateBalance(params, symbolInfo, balance, positions);
      if (!balanceValidation.valid) {
        return {
          success: false,
          code: balanceValidation.errors[0].code,
          message: balanceValidation.errors.map(e => e.message).join('; '),
        };
      }

      // 5. 格式化参数
      const formattedParams = this.formatOrderParams(params, symbolInfo);

      // 6. 执行下单
      const result = await this.doPlaceOrder(formattedParams, symbolInfo);

      // 7. 发送事件
      if (result.success && result.order) {
        this.emit('orderUpdate', result.order);
      }

      return result;
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        code: 'UNKNOWN_ERROR',
        message: err.message,
      };
    }
  }

  /**
   * 批量下单
   * 注意: 跳过余额校验，仅做参数校验和格式化
   */
  async placeOrders(paramsList: PlaceOrderParams[]): Promise<BatchPlaceOrderResult> {
    const limits = this.getBatchOrderLimits();
    const results: PlaceOrderResult[] = [];

    // 检查批量大小
    if (paramsList.length > limits.maxBatchSize) {
      // 超过限制，返回所有失败
      return {
        total: paramsList.length,
        successCount: 0,
        failedCount: paramsList.length,
        results: paramsList.map(() => ({
          success: false,
          code: 'BATCH_SIZE_EXCEEDED',
          message: `Batch size ${paramsList.length} exceeds limit ${limits.maxBatchSize}`,
        })),
      };
    }

    // 空列表
    if (paramsList.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    // 收集所有需要的 symbolInfo
    const symbolInfoMap = new Map<string, SymbolInfo>();
    const validatedParams: PlaceOrderParams[] = [];
    const preValidationResults: (PlaceOrderResult | null)[] = [];

    for (const params of paramsList) {
      const cacheKey = `${params.tradeType}:${params.symbol}`;

      // 获取 symbolInfo (通过公共适配器)
      let symbolInfo = symbolInfoMap.get(cacheKey);
      if (!symbolInfo) {
        symbolInfo = await this.publicAdapter.getSymbolInfo(params.symbol, params.tradeType);
        if (symbolInfo) {
          symbolInfoMap.set(cacheKey, symbolInfo);
        }
      }

      if (!symbolInfo) {
        preValidationResults.push({
          success: false,
          code: 'SYMBOL_NOT_FOUND',
          message: `Symbol ${params.symbol} not found`,
        });
        continue;
      }

      // 参数校验
      const validation = this.validateOrderParams(params, symbolInfo);
      if (!validation.valid) {
        preValidationResults.push({
          success: false,
          code: validation.errors[0].code,
          message: validation.errors.map(e => e.message).join('; '),
        });
        continue;
      }

      // 格式化参数
      const formattedParams = this.formatOrderParams(params, symbolInfo);
      validatedParams.push(formattedParams);
      preValidationResults.push(null); // null 表示需要发送到交易所
    }

    // 执行批量下单 (只发送校验通过的)
    let batchResults: PlaceOrderResult[] = [];
    if (validatedParams.length > 0) {
      try {
        batchResults = await this.doBatchPlaceOrder(validatedParams, symbolInfoMap);
      } catch (error) {
        const err = error as Error;
        batchResults = validatedParams.map(() => ({
          success: false,
          code: 'BATCH_ORDER_ERROR',
          message: err.message,
        }));
      }
    }

    // 合并结果 (保持原始顺序)
    let batchIdx = 0;
    for (const preResult of preValidationResults) {
      if (preResult !== null) {
        // 预校验失败
        results.push(preResult);
      } else {
        // 使用批量下单结果
        results.push(batchResults[batchIdx++]);
      }
    }

    // 统计
    const successCount = results.filter(r => r.success).length;

    // 发送事件
    for (const result of results) {
      if (result.success && result.order) {
        this.emit('orderUpdate', result.order);
      }
    }

    return {
      total: paramsList.length,
      successCount,
      failedCount: paramsList.length - successCount,
      results,
    };
  }

  // ============ 事件相关 ============

  /**
   * 类型安全的事件监听
   */
  on<K extends keyof AdapterEventMap>(
    event: K,
    listener: (data: AdapterEventMap[K]) => void
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof AdapterEventMap>(event: K, data: AdapterEventMap[K]): boolean {
    return super.emit(event, data);
  }
}
