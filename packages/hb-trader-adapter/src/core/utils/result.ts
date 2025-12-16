import type { Result, ErrorInfo } from '../types'

export function Ok<T>(data: T): Result<T, never> {
  return { ok: true, data }
}

export function Err<E = ErrorInfo>(error: E): Result<never, E> {
  return { ok: false, error }
}
