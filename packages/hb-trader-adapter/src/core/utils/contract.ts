import { parseUnifiedSymbol } from './symbol'

/**
 * 获取合约面值
 */
export function getContractValue(symbol: string): number {
  const { base } = parseUnifiedSymbol(symbol)
  // BTC 合约面值 100 USD, 其他 10 USD
  return base.toUpperCase() === 'BTC' ? 100 : 10
}

/**
 * USDT -> 张数 (币本位)
 */
export function usdtToContracts(
  symbol: string,
  usdt: number,
  _price: number
): number {
  const contractValue = getContractValue(symbol)
  // 张数 = USDT / (合约面值 / 币价)
  // 实际上: 张数 = USDT / 合约面值 * 币价 (这个公式不对)
  // 正确: 张数 = USDT * 币价 / 合约面值 (也不对)
  // 币本位: 1张 = contractValue USD worth of base currency
  // 张数 = USDT / contractValue
  return Math.floor(usdt / contractValue)
}

/**
 * 币数量 -> 张数 (币本位)
 */
export function coinToContracts(
  symbol: string,
  coinAmount: number,
  price: number
): number {
  const contractValue = getContractValue(symbol)
  // 张数 = 币数量 * 币价 / 合约面值
  return Math.floor(coinAmount * price / contractValue)
}

/**
 * 张数 -> 币数量 (币本位)
 */
export function contractsToCoin(
  symbol: string,
  contracts: number,
  price: number
): number {
  const contractValue = getContractValue(symbol)
  // 币数量 = 张数 * 合约面值 / 币价
  return contracts * contractValue / price
}
