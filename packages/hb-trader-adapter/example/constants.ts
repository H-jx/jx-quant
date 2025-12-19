/**
 * 公共常量定义
 */
import type { TradeType } from '../src/core/types'

/**
 * 交易类型中文标签
 */
export const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  spot: '现货',
  futures: '永续合约',
  delivery: '交割合约',
}

/**
 * 所有交易类型列表
 */
export const ALL_TRADE_TYPES: TradeType[] = ['spot', 'futures', 'delivery']

/**
 * 获取交易类型的中文标签
 */
export function getTradeTypeLabel(tradeType: TradeType): string {
  return TRADE_TYPE_LABELS[tradeType]
}

/**
 * 格式化交易所和交易类型的标签
 */
export function formatLabel(exchange: string, tradeType: TradeType): string {
  return `${exchange.toUpperCase()} ${TRADE_TYPE_LABELS[tradeType]}`
}
