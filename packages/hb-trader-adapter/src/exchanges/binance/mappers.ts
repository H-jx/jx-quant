/**
 * Binance 类型映射器
 *
 * 设计模式: Registry/Mapper 模式
 * 将所有 Binance 特有的类型映射集中管理，避免在 TradeAdapter 和 WsUserDataAdapter 中重复定义
 *
 * 使用方式:
 *   import { BinanceOrderMapper, BinanceStrategyOrderMapper, BinanceSymbolResolver } from './mappers'
 *   const status = BinanceOrderMapper.toUnified.status('NEW')
 *   const rawSymbol = await BinanceSymbolResolver.toRaw('BTC-USD', 'delivery', publicAdapter)
 */

import type {
  OrderType,
  OrderStatus,
  StrategyOrderType,
  StrategyOrderStatus,
  TradeType,
  PositionSide,
} from '../../core/types'
import type { IPublicAdapter } from '../../core/BasePublicAdapter'
import { parseUnifiedSymbol } from '../../core/utils'

// ============================================================================
// 订单类型映射器
// ============================================================================

/**
 * Binance 订单类型/状态映射
 * 统一 TradeAdapter 和 WsUserDataAdapter 的映射逻辑
 */
export const BinanceOrderMapper = {
  /**
   * 转换为 Binance 格式
   */
  toRaw: {
    /**
     * 统一订单类型 -> Binance 订单类型
     */
    orderType(type: OrderType): string {
      switch (type) {
        case 'limit':
          return 'LIMIT'
        case 'market':
          return 'MARKET'
        case 'maker-only':
          return 'LIMIT' // Binance 使用 timeInForce=GTX 实现 maker-only
        default:
          return 'LIMIT'
      }
    },

    /**
     * 统一持仓方向 -> Binance 持仓方向
     */
    positionSide(side: PositionSide): 'LONG' | 'SHORT' {
      return side.toUpperCase() as 'LONG' | 'SHORT'
    },

    /**
     * 统一策略订单类型 -> Binance 算法订单类型
     */
    strategyOrderType(strategyType: StrategyOrderType, orderPrice?: string | number): string {
      const isMarket = !orderPrice || Number(orderPrice) <= 0

      switch (strategyType) {
        case 'stop-loss':
          return isMarket ? 'STOP_MARKET' : 'STOP'
        case 'take-profit':
          return isMarket ? 'TAKE_PROFIT_MARKET' : 'TAKE_PROFIT'
        case 'trigger':
          return isMarket ? 'STOP_MARKET' : 'STOP' // Binance 没有纯计划委托，使用 STOP
        case 'trailing-stop':
          return 'TRAILING_STOP_MARKET'
        default:
          return 'STOP_MARKET'
      }
    },
  },

  /**
   * 转换为统一格式
   */
  toUnified: {
    /**
     * Binance 订单类型 -> 统一订单类型
     */
    orderType(type: string): OrderType {
      switch (type?.toUpperCase()) {
        case 'MARKET':
          return 'market'
        case 'LIMIT':
          return 'limit'
        case 'LIMIT_MAKER':
          return 'maker-only'
        // 条件单类型也返回基础类型
        case 'STOP':
        case 'STOP_MARKET':
        case 'TAKE_PROFIT':
        case 'TAKE_PROFIT_MARKET':
          return 'limit'
        default:
          return 'limit'
      }
    },

    /**
     * Binance 订单状态 -> 统一订单状态
     */
    orderStatus(status: string): OrderStatus {
      switch (status?.toUpperCase()) {
        case 'NEW':
          return 'open'
        case 'PARTIALLY_FILLED':
          return 'partial'
        case 'FILLED':
          return 'filled'
        case 'CANCELED':
        case 'CANCELLED':
          return 'canceled'
        case 'REJECTED':
          return 'rejected'
        case 'EXPIRED':
          return 'expired'
        default:
          return 'open'
      }
    },

    /**
     * Binance 持仓方向 -> 统一持仓方向
     */
    positionSide(side: string): PositionSide {
      return side?.toLowerCase() as PositionSide
    },

    /**
     * Binance 算法订单类型 -> 统一策略订单类型
     */
    strategyOrderType(orderType: string): StrategyOrderType {
      switch (orderType?.toUpperCase()) {
        case 'STOP':
        case 'STOP_MARKET':
          return 'stop-loss'
        case 'TAKE_PROFIT':
        case 'TAKE_PROFIT_MARKET':
          return 'take-profit'
        case 'TRAILING_STOP_MARKET':
          return 'trailing-stop'
        default:
          return 'trigger'
      }
    },

    /**
     * Binance 算法订单状态 -> 统一策略订单状态
     */
    strategyOrderStatus(status: string): StrategyOrderStatus {
      switch (status?.toUpperCase()) {
        case 'NEW':
          return 'live'
        case 'TRIGGERED':
        case 'FILLED':
          return 'effective'
        case 'CANCELLED':
        case 'CANCELED':
          return 'canceled'
        case 'REJECTED':
        case 'EXPIRED':
          return 'failed'
        default:
          return 'live'
      }
    },
  },
}

// ============================================================================
// Symbol 解析器
// ============================================================================

/**
 * Binance Symbol 解析器
 * 处理统一格式与 Binance 原始格式之间的转换
 * 支持 delivery 合约的自动季度合约匹配
 */
export const BinanceSymbolResolver = {
  /**
   * 已知的报价币种列表 (用于解析 Binance 格式)
   */
  QUOTE_CURRENCIES: ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB'] as const,

  /**
   * 解析 Binance 格式的 symbol，提取 base 和 quote
   * BTCUSDT -> { base: 'BTC', quote: 'USDT' }
   */
  parseRawSymbol(symbol: string): { base: string; quote: string } {
    for (const quote of this.QUOTE_CURRENCIES) {
      if (symbol.endsWith(quote)) {
        return { base: symbol.slice(0, -quote.length), quote }
      }
    }
    // fallback
    return { base: symbol, quote: '' }
  },

  /**
   * Binance 原始格式 -> 统一格式
   */
  toUnified(rawSymbol: string, tradeType: TradeType): string {
    if (tradeType === 'delivery') {
      // BTCUSD_PERP 或 BTCUSD_240329 -> BTC-USD
      const [pair] = rawSymbol.split('_')
      const base = pair.replace(/USD$/, '')
      return `${base}-USD`
    }

    // 现货和 U本位: BTCUSDT -> BTC-USDT
    const { base, quote } = this.parseRawSymbol(rawSymbol)
    if (quote) {
      return `${base}-${quote}`
    }

    return rawSymbol
  },

  /**
   * 统一格式 -> Binance 原始格式
   *
   * 注意: 对于 delivery 类型，默认返回永续合约格式 (BTCUSD_PERP)
   * 如需季度合约，请使用 toRawWithContract 方法
   */
  toRaw(symbol: string, tradeType: TradeType): string {
    const { base, quote } = parseUnifiedSymbol(symbol)

    switch (tradeType) {
      case 'spot':
      case 'futures':
        return `${base}${quote}`
      case 'delivery':
        // 币本位合约默认使用永续: BTCUSD_PERP
        return `${base}USD_PERP`
    }
  },

  /**
   * 智能解析 delivery symbol
   *
   * 支持以下输入格式:
   * - 'BTC-USD' -> 自动查找当前季度合约
   * - 'BTCUSD_PERP' -> 直接返回
   * - 'BTCUSD_240329' -> 直接返回
   *
   * @param symbol 统一格式 symbol (如 'BTC-USD')
   * @param tradeType 交易类型
   * @param publicAdapter 公共适配器 (用于查询可用合约)
   * @param contractType 合约类型: 'perpetual' | 'current_quarter' | 'next_quarter'
   */
  async toRawWithContract(
    symbol: string,
    tradeType: TradeType,
    publicAdapter: IPublicAdapter,
    contractType: 'perpetual' | 'current_quarter' | 'next_quarter' = 'perpetual'
  ): Promise<string> {
    // 非 delivery 类型直接使用基础转换
    if (tradeType !== 'delivery') {
      return this.toRaw(symbol, tradeType)
    }

    // 如果已经是 Binance 格式，直接返回
    if (symbol.includes('_')) {
      return symbol
    }

    const { base } = parseUnifiedSymbol(symbol)

    // 永续合约
    if (contractType === 'perpetual') {
      return `${base}USD_PERP`
    }

    // 需要查找季度合约
    const symbolsResult = await publicAdapter.getAllSymbols('delivery')
    if (!symbolsResult.ok) {
      // 降级为永续
      return `${base}USD_PERP`
    }

    // 过滤出该币种的合约，排除永续
    const contracts = symbolsResult.data.filter(
      (s) =>
        s.baseCurrency === base && s.quoteCurrency === 'USD' && !s.rawSymbol.endsWith('_PERP')
    )

    if (contracts.length === 0) {
      // 没有季度合约，降级为永续
      return `${base}USD_PERP`
    }

    // 按到期日期排序 (从 rawSymbol 提取日期)
    const sorted = contracts.sort((a, b) => {
      const dateA = a.rawSymbol.split('_')[1] || ''
      const dateB = b.rawSymbol.split('_')[1] || ''
      return dateA.localeCompare(dateB)
    })

    // 根据 contractType 返回对应合约
    if (contractType === 'current_quarter') {
      return sorted[0]?.rawSymbol || `${base}USD_PERP`
    } else if (contractType === 'next_quarter') {
      return sorted[1]?.rawSymbol || sorted[0]?.rawSymbol || `${base}USD_PERP`
    }

    return `${base}USD_PERP`
  },

  /**
   * 通过 publicAdapter 获取真实的 instId/rawSymbol
   *
   * 这是最推荐的方法，因为它会从交易所返回的数据中精确匹配
   *
   * @param symbol 统一格式 symbol (如 'BTC-USD')
   * @param tradeType 交易类型
   * @param publicAdapter 公共适配器
   */
  async getSymbol(
    symbol: string,
    tradeType: TradeType,
    publicAdapter: IPublicAdapter
  ): Promise<string | undefined> {
    const result = await publicAdapter.getSymbolInfo(symbol, tradeType)
    if (result.ok) {
      return result.data.rawSymbol
    }
    return undefined
  },
}

// ============================================================================
// InstType 映射 (用于 WS 事件处理)
// ============================================================================

/**
 * 根据 wsKey 推断 TradeType
 */
export function wsKeyToTradeType(wsKey: string): TradeType | undefined {
  if (wsKey.includes('spot') || wsKey.includes('main')) {
    return 'spot'
  } else if (wsKey.includes('usdm') || wsKey.includes('fapi')) {
    return 'futures'
  } else if (wsKey.includes('coinm') || wsKey.includes('dapi')) {
    return 'delivery'
  }
  return undefined
}

