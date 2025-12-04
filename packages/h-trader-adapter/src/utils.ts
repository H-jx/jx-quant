/**
 * 工具函数
 */

/**
 * 获取小数位数
 * @example getDecimalPlaces('0.001') => 3
 * @example getDecimalPlaces('0.00000001') => 8
 */
export function getDecimalPlaces(value: string | number): number {
  const str = String(value);
  const dotIndex = str.indexOf('.');
  if (dotIndex === -1) return 0;
  return str.length - dotIndex - 1;
}

/**
 * 保留固定小数位数 (截断而非四舍五入)
 * @example keepDecimalFixed(1.23456, 2) => 1.23
 * @example keepDecimalFixed(1.999, 2) => 1.99
 */
export function keepDecimalFixed(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.floor(value * multiplier) / multiplier;
}

/**
 * 格式化数值到指定精度
 * @example formatToPrecision(1.23456, 3) => '1.234'
 */
export function formatToPrecision(value: number, precision: number): string {
  return keepDecimalFixed(value, precision).toFixed(precision);
}

/**
 * 按步长对齐数量 (向下取整)
 * @example alignToStepSize(1.234, '0.01') => 1.23
 * @example alignToStepSize(15, '10') => 10
 */
export function alignToStepSize(value: number, stepSize: string): number {
  const step = parseFloat(stepSize);
  const decimals = getDecimalPlaces(stepSize);
  const aligned = Math.floor(value / step) * step;
  return keepDecimalFixed(aligned, decimals);
}

/**
 * 按tick对齐价格 (向下取整)
 */
export function alignToTickSize(price: number, tickSize: string): number {
  return alignToStepSize(price, tickSize);
}

/**
 * 重试Promise
 * @param retries 重试次数
 * @param fn 执行函数
 * @param delay 延迟时间(ms)
 */
export async function retryPromise<T>(
  retries: number,
  fn: () => Promise<T>,
  delay = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * 延迟
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 单一Promise缓存 (防止并发重复请求)
 * @param fn 原函数
 * @param keyFn 缓存key生成函数
 */
export function singlePromise<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  keyFn: (...args: Args) => string
): (...args: Args) => Promise<T> {
  const cache = new Map<string, Promise<T>>();

  return async (...args: Args): Promise<T> => {
    const key = keyFn(...args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const promise = fn(...args).finally(() => {
      cache.delete(key);
    });

    cache.set(key, promise);
    return promise;
  };
}

/**
 * 解析统一symbol格式
 * @example parseSymbol('BTC-USDT') => { base: 'BTC', quote: 'USDT' }
 */
export function parseSymbol(symbol: string): { base: string; quote: string } {
  const parts = symbol.split('-');
  if (parts.length !== 2) {
    throw new Error(`Invalid symbol format: ${symbol}, expected format: BTC-USDT`);
  }
  return { base: parts[0], quote: parts[1] };
}

/**
 * 生成客户端订单ID
 */
export function generateClientOrderId(prefix = 'ht'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * 比较两个数值字符串
 * @returns -1: a < b, 0: a == b, 1: a > b
 */
export function compareNumericString(a: string, b: string): number {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (numA < numB) return -1;
  if (numA > numB) return 1;
  return 0;
}

/**
 * 安全的数值解析
 */
export function safeParseFloat(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  const num = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(num) ? 0 : num;
}
