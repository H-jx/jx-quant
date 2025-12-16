/**
 * 保留指定小数位数 (截断, 不四舍五入)
 */
export function truncateDecimal(value: number | string, precision: number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'

  const factor = Math.pow(10, precision)
  return (Math.floor(num * factor) / factor).toFixed(precision)
}

/**
 * 根据 stepSize 调整数量
 * 例如 stepSize = "0.001", quantity = 1.2345 => "1.234"
 */
export function adjustByStep(value: number | string, stepSize: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  const step = parseFloat(stepSize)

  if (isNaN(num) || isNaN(step) || step === 0) return '0'

  const precision = getDecimalPlaces(stepSize)
  const adjusted = Math.floor(num / step) * step
  return adjusted.toFixed(precision)
}

/**
 * 获取小数位数
 */
export function getDecimalPlaces(value: string): number {
  const str = value.toString()
  const index = str.indexOf('.')
  if (index === -1) return 0
  return str.length - index - 1
}

/**
 * 格式化价格 (保留精度)
 */
export function formatPrice(price: number | string, tickSize: string): string {
  return adjustByStep(price, tickSize)
}

/**
 * 格式化数量 (保留精度)
 */
export function formatQuantity(quantity: number | string, stepSize: string): string {
  return adjustByStep(quantity, stepSize)
}
