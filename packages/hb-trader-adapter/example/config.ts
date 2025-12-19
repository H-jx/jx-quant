/**
 * 统一配置管理
 *
 * 支持模块化开关，可以单独注释某个配置来控制测试范围：
 * - 交易所：binance / okx
 * - 交易类型：spot / futures / delivery
 * - 测试模块：public / trade / wsUserData
 */
import type { Exchange, TradeType } from '../src/core/types'

// ============================================================================
// 测试范围配置 - 通过注释来控制测试哪些功能
// ============================================================================

/**
 * 启用的交易所
 * 注释某一行可以跳过该交易所的测试
 */
export const ENABLED_EXCHANGES: Exchange[] = [
  'binance',
  'okx',
]

/**
 * 启用的交易类型
 * 注释某一行可以跳过该交易类型的测试
 */
export const ENABLED_TRADE_TYPES: TradeType[] = [
  'spot',
  'futures',
  // 'delivery',  // 取消注释以测试交割合约
]

/**
 * 测试模块开关
 * 设置为 false 可以跳过对应模块的测试
 */
export const TEST_MODULES = {
  /** 公共 API 测试（行情、深度等） */
  public: true,
  /** 交易 API 测试（单笔/批量下单） */
  trade: true,
  /** WebSocket 用户数据流测试 */
  wsUserData: true,
} as const

// ============================================================================
// 交易对配置
// ============================================================================

/**
 * 各交易类型的测试交易对
 * 可根据需要修改测试的交易对
 */
export const SAMPLE_SYMBOLS: Record<TradeType, Record<Exchange, string>> = {
  spot: {
    binance: 'BTC-USDT',
    okx: 'BTC-USDT',
  },
  futures: {
    binance: 'BTC-USDT',
    okx: 'BTC-USDT',
  },
  delivery: {
    binance: 'BTC-USD',
    okx: 'BTC-USD-251219',
  },
}

/**
 * 获取指定交易所和交易类型的交易对
 */
export function getSymbol(exchange: Exchange, tradeType: TradeType): string {
  return SAMPLE_SYMBOLS[tradeType][exchange]
}

// ============================================================================
// 下单配置
// ============================================================================

export const ORDER_CONFIG = {
  /** 默认杠杆倍数（仅限合约） */
  defaultLeverage: 5,
  /** 买单价格偏移（低于市价的比例） */
  buyPriceOffset: 0.995,
  /** 卖单价格偏移（高于市价的比例） */
  sellPriceOffset: 1.005,
  /** 批量下单数量 */
  batchOrderCount: 2,
} as const

// ============================================================================
// 下单场景配置
// ============================================================================

import type { OrderSide, PositionSide } from '../src/core/types'

export interface OrderScenario {
  exchange: Exchange
  tradeType: TradeType
  side: OrderSide
  positionSide?: PositionSide
}

export interface BatchOrderScenario extends OrderScenario {
  count: number
}

/**
 * 单笔下单场景
 * 注释某一行可以跳过该场景的测试
 */
export const SINGLE_ORDER_SCENARIOS: OrderScenario[] = [
  // Binance 场景
  { exchange: 'binance', tradeType: 'spot', side: 'buy' },
  { exchange: 'binance', tradeType: 'futures', side: 'buy', positionSide: 'long' },
  // { exchange: 'binance', tradeType: 'delivery', side: 'buy', positionSide: 'long' },

  // OKX 场景
  // { exchange: 'okx', tradeType: 'spot', side: 'buy' },
  // { exchange: 'okx', tradeType: 'futures', side: 'buy', positionSide: 'long' },
  // { exchange: 'okx', tradeType: 'delivery', side: 'buy', positionSide: 'long' },
]

/**
 * 批量下单场景
 * 注释某一行可以跳过该场景的测试
 */
export const BATCH_ORDER_SCENARIOS: BatchOrderScenario[] = [
  // Binance 场景
  { exchange: 'binance', tradeType: 'spot', side: 'buy', count: ORDER_CONFIG.batchOrderCount },
  { exchange: 'binance', tradeType: 'futures', side: 'buy', positionSide: 'long', count: ORDER_CONFIG.batchOrderCount },
  // { exchange: 'binance', tradeType: 'delivery', side: 'buy', positionSide: 'long', count: ORDER_CONFIG.batchOrderCount },

  // OKX 场景
  { exchange: 'okx', tradeType: 'spot', side: 'buy', count: ORDER_CONFIG.batchOrderCount },
  { exchange: 'okx', tradeType: 'futures', side: 'buy', positionSide: 'long', count: ORDER_CONFIG.batchOrderCount },
  // { exchange: 'okx', tradeType: 'delivery', side: 'buy', positionSide: 'long', count: ORDER_CONFIG.batchOrderCount },
]

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 过滤场景：只保留启用的交易所和交易类型
 */
export function filterScenarios<T extends OrderScenario>(scenarios: T[]): T[] {
  return scenarios.filter(
    (s) => ENABLED_EXCHANGES.includes(s.exchange) && ENABLED_TRADE_TYPES.includes(s.tradeType)
  )
}

/**
 * 检查是否启用了指定的交易所
 */
export function isExchangeEnabled(exchange: Exchange): boolean {
  return ENABLED_EXCHANGES.includes(exchange)
}

/**
 * 检查是否启用了指定的交易类型
 */
export function isTradeTypeEnabled(tradeType: TradeType): boolean {
  return ENABLED_TRADE_TYPES.includes(tradeType)
}

/**
 * 检查是否启用了指定的测试模块
 */
export function isModuleEnabled(module: keyof typeof TEST_MODULES): boolean {
  return TEST_MODULES[module]
}
