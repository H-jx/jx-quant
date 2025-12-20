/**
 * OKX 类型映射器
 *
 * 设计模式: Registry/Mapper 模式
 * 将所有 OKX 特有的类型映射集中管理，避免在 TradeAdapter 和 WsUserDataAdapter 中重复定义
 *
 * 使用方式:
 *   import { OkxOrderMapper, OkxStrategyOrderMapper, OkxSymbolResolver } from './mappers'
 *   const status = OkxOrderMapper.toUnified.status('live')
 *   const rawSymbol = await OkxSymbolResolver.toRaw('BTC-USD', 'delivery', publicAdapter)
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
import type { InstrumentType, TradeMode, AlgoOrderRequest } from 'okx-api'

// ============================================================================
// 订单类型映射器
// ============================================================================

/**
 * OKX 订单类型/状态映射
 * 统一 TradeAdapter 和 WsUserDataAdapter 的映射逻辑
 */
export const OkxOrderMapper = {
  /**
   * 转换为 OKX 格式
   */
  toRaw: {
    /**
     * 统一订单类型 -> OKX 订单类型
     */
    orderType(type: OrderType): 'limit' | 'market' | 'post_only' {
      switch (type) {
        case 'limit':
          return 'limit'
        case 'market':
          return 'market'
        case 'maker-only':
          return 'post_only'
        default:
          return 'limit'
      }
    },

    /**
     * 统一策略订单类型 -> OKX 算法订单类型
     */
    strategyOrderType(strategyType: StrategyOrderType): AlgoOrderRequest['ordType'] {
      switch (strategyType) {
        case 'stop-loss':
        case 'take-profit':
          return 'conditional'
        case 'trigger':
          return 'trigger'
        case 'trailing-stop':
          return 'move_order_stop'
        default:
          return 'conditional'
      }
    },

    /**
     * TradeType -> OKX instType
     */
    instType(tradeType: TradeType): InstrumentType {
      switch (tradeType) {
        case 'spot':
          return 'SPOT'
        case 'futures':
          return 'SWAP'
        case 'delivery':
          return 'FUTURES'
      }
    },

    /**
     * TradeType -> OKX tdMode
     */
    tdMode(tradeType: TradeType, marginMode: 'cross' | 'isolated' = 'cross'): TradeMode {
      if (tradeType === 'spot') {
        return 'cash'
      }
      return marginMode
    },
  },

  /**
   * 转换为统一格式
   */
  toUnified: {
    /**
     * OKX 订单类型 -> 统一订单类型
     */
    orderType(ordType: string): OrderType {
      switch (ordType?.toLowerCase()) {
        case 'market':
          return 'market'
        case 'limit':
          return 'limit'
        case 'post_only':
          return 'maker-only'
        case 'fok':
        case 'ioc':
          return 'limit' // FOK/IOC 是执行类型，基础类型还是 limit
        default:
          return 'limit'
      }
    },

    /**
     * OKX 订单状态 -> 统一订单状态
     */
    orderStatus(state: string): OrderStatus {
      switch (state?.toLowerCase()) {
        case 'live':
          return 'open'
        case 'partially_filled':
          return 'partial'
        case 'filled':
          return 'filled'
        case 'canceled':
        case 'cancelled':
          return 'canceled'
        default:
          return 'open'
      }
    },

    /**
     * OKX 持仓方向 -> 统一持仓方向
     */
    positionSide(posSide: string): PositionSide {
      return posSide?.toLowerCase() as PositionSide
    },

    /**
     * OKX 算法订单类型 -> 统一策略订单类型
     */
    strategyOrderType(ordType: string): StrategyOrderType {
      switch (ordType?.toLowerCase()) {
        case 'conditional':
        case 'oco':
          return 'stop-loss' // 默认按止损处理，实际需要根据具体字段判断
        case 'trigger':
          return 'trigger'
        case 'move_order_stop':
          return 'trailing-stop'
        default:
          return 'trigger'
      }
    },

    /**
     * OKX 算法订单状态 -> 统一策略订单状态
     */
    strategyOrderStatus(state: string): StrategyOrderStatus {
      switch (state?.toLowerCase()) {
        case 'live':
          return 'live'
        case 'effective':
          return 'effective'
        case 'canceled':
        case 'cancelled':
          return 'canceled'
        case 'order_failed':
        case 'partially_failed':
          return 'failed'
        case 'partially_effective':
          return 'partially_effective'
        default:
          return 'live'
      }
    },

    /**
     * OKX instType -> TradeType
     */
    tradeType(instType: string): TradeType {
      switch (instType?.toUpperCase()) {
        case 'SPOT':
          return 'spot'
        case 'SWAP':
          return 'futures'
        case 'FUTURES':
          return 'delivery'
        default:
          return 'futures'
      }
    },
  },
}

// ============================================================================
// Symbol 解析器
// ============================================================================

/**
 * OKX Symbol 解析器
 * 处理统一格式与 OKX 原始格式之间的转换
 * 支持 delivery 合约的自动季度合约匹配
 */
export const OkxSymbolResolver = {
  /**
   * OKX 原始格式 -> 统一格式 + TradeType
   * BTC-USDT -> { symbol: 'BTC-USDT', tradeType: 'spot' }
   * BTC-USDT-SWAP -> { symbol: 'BTC-USDT', tradeType: 'futures' }
   * BTC-USD-240329 -> { symbol: 'BTC-USD', tradeType: 'delivery' }
   */
  toUnified(instId: string): { symbol: string; tradeType: TradeType } {
    const parts = instId.split('-')

    if (parts.length === 2) {
      return { symbol: instId, tradeType: 'spot' }
    }

    if (parts.length === 3) {
      const suffix = parts[2]
      if (suffix === 'SWAP') {
        return { symbol: `${parts[0]}-${parts[1]}`, tradeType: 'futures' }
      }
      // 日期格式的是交割合约
      return { symbol: `${parts[0]}-${parts[1]}`, tradeType: 'delivery' }
    }

    return { symbol: instId, tradeType: 'spot' }
  },

  /**
   * 统一格式 -> OKX 原始格式
   *
   * 注意: 对于 delivery 类型，此方法不会添加日期后缀
   * 如需完整的 delivery symbol，请使用 toRawWithContract 方法
   */
  toRaw(symbol: string, tradeType: TradeType): string {
    switch (tradeType) {
      case 'spot':
        return symbol
      case 'futures':
        return `${symbol}-SWAP`
      case 'delivery':
        // 币本位交割需要具体合约日期，调用方需要自己拼接
        // 或使用 toRawWithContract 方法
        return symbol
    }
  },

  /**
   * 智能解析 delivery symbol
   *
   * 支持以下输入格式:
   * - 'BTC-USD' -> 自动查找当前季度合约
   * - 'BTC-USD-SWAP' -> 直接返回
   * - 'BTC-USD-240329' -> 直接返回
   *
   * @param symbol 统一格式 symbol (如 'BTC-USD')
   * @param tradeType 交易类型
   * @param publicAdapter 公共适配器 (用于查询可用合约)
   * @param contractType 合约类型: 'current_quarter' | 'next_quarter'
   */
  async toRawWithContract(
    symbol: string,
    tradeType: TradeType,
    publicAdapter: IPublicAdapter,
    contractType: 'current_quarter' | 'next_quarter' = 'current_quarter'
  ): Promise<string> {
    // 非 delivery 类型直接使用基础转换
    if (tradeType !== 'delivery') {
      return this.toRaw(symbol, tradeType)
    }

    // 如果已经包含日期后缀，直接返回
    const parts = symbol.split('-')
    if (parts.length === 3 && /^\d+$/.test(parts[2])) {
      return symbol
    }

    // 需要查找季度合约
    const symbolsResult = await publicAdapter.getAllSymbols('delivery')
    if (!symbolsResult.ok) {
      // 降级为返回原始 symbol，让调用方处理错误
      return symbol
    }

    // 过滤出该币种的合约
    const [base, quote] = symbol.split('-')
    const contracts = symbolsResult.data.filter(
      (s) =>
        s.baseCurrency === base &&
        s.quoteCurrency === quote &&
        s.rawSymbol !== `${symbol}-SWAP` // 排除永续
    )

    if (contracts.length === 0) {
      return symbol
    }

    // 按到期日期排序 (从 rawSymbol 提取日期)
    const sorted = contracts.sort((a, b) => {
      const partsA = a.rawSymbol.split('-')
      const partsB = b.rawSymbol.split('-')
      const dateA = partsA[2] || ''
      const dateB = partsB[2] || ''
      return dateA.localeCompare(dateB)
    })

    // 根据 contractType 返回对应合约
    if (contractType === 'current_quarter') {
      return sorted[0]?.rawSymbol || symbol
    } else if (contractType === 'next_quarter') {
      return sorted[1]?.rawSymbol || sorted[0]?.rawSymbol || symbol
    }

    return symbol
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

  /**
   * 从 instId 推断 TradeType
   */
  detectTradeType(instId: string): TradeType {
    if (instId.endsWith('-SWAP')) {
      return 'futures'
    }
    const parts = instId.split('-')
    if (parts.length === 3 && /^\d+$/.test(parts[2])) {
      return 'delivery'
    }
    return 'spot'
  },
}
