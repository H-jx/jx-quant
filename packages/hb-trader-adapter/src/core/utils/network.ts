import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import type { Agent } from 'node:http'
import type { Result, AdapterOptions } from '../types'
import { Err } from './result'

/**
 * 包装异步调用, 捕获异常并转换为 Result
 */
export async function wrapAsync<T>(
  fn: () => Promise<T>,
  errorCode = 'UNKNOWN_ERROR'
): Promise<Result<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (e) {
    const error = e as Error & { code?: string; data?: unknown; body?: any; msg?: string }
    return Err({
      code: error.code || errorCode,
      message: error.message || error.msg || 'Unknown error',
      raw: error.data ||  error.body || error
    })
  }
}

/**
 * 根据 AdapterOptions 创建代理 Agent
 */
export function createProxyAgent(options?: AdapterOptions): Agent | undefined {
  if (!options) return undefined

  // 优先使用 SOCKS 代理
  if (options.socksProxy) {
    return new SocksProxyAgent(options.socksProxy)
  }

  // 其次使用 HTTPS 代理
  if (options.httpsProxy) {
    return new HttpsProxyAgent(options.httpsProxy)
  }

  return undefined
}
