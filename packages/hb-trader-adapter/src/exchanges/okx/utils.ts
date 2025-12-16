import { TradeType, ErrorInfo } from '../../core/types'
import { InstrumentType, TradeMode } from 'okx-api'

/**
 * 统一格式 -> OKX 格式
 */
export function unifiedToOkx(symbol: string, tradeType: TradeType): string {
  // 统一格式: BTC-USDT
  // OKX SPOT: BTC-USDT
  // OKX SWAP: BTC-USDT-SWAP
  // OKX FUTURES: BTC-USDT-240329 (需要具体日期，这里暂时不处理)
  switch (tradeType) {
    case 'spot':
      return symbol
    case 'futures':
      return `${symbol}-SWAP`
    case 'delivery':
      // 币本位交割需要具体合约日期，调用方需要自己拼接
      return symbol
  }
}

/**
 * OKX 格式 -> 统一格式
 */
export function okxToUnified(instId: string): { symbol: string; tradeType: TradeType } {
  // BTC-USDT -> spot
  // BTC-USDT-SWAP -> futures
  // BTC-USDT-240329 -> delivery
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
}

/**
 * 获取 OKX 的 instType
 */
export function getOkxInstType(tradeType: TradeType): InstrumentType {
  switch (tradeType) {
    case 'spot':
      return 'SPOT'
    case 'futures':
      return 'SWAP'
    case 'delivery':
      return 'FUTURES'
  }
}

/**
 * 获取 OKX 的 tdMode (交易模式)
 */
export function getOkxTdMode(tradeType: TradeType, marginMode: 'cross' | 'isolated' = 'cross'): TradeMode {
  if (tradeType === 'spot') {
    return 'cash'
  }
  return marginMode
}

/**
 * 从交易所响应中提取错误
 */
export function extractOkxError(response: unknown): ErrorInfo | null {
  const res = response as { code?: string; msg?: string; data?: Array<{ sCode?: string; sMsg?: string }> }

  if (res.code && res.code !== '0') {
    return {
      code: res.code,
      message: res.msg || 'Unknown error',
      raw: response
    }
  }

  if (res.data?.[0]?.sCode && res.data[0].sCode !== '0') {
    return {
      code: res.data[0].sCode,
      message: res.data[0].sMsg || 'Unknown error',
      raw: response
    }
  }

  return null
}

export function generateOkxClientOrderId(): string {
    // OKX: 客户端订单ID要求 1-32 位，字母（区分大小写）与数字的组合
    // 这里生成一个 20 位的随机字符串
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const prefix = 'hbokx'
    const length = 32 - prefix.length
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return `${prefix}${result}`
}
