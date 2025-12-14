import { format } from 'node:util'

const horizontalRule = '+'.padEnd(80, '-')

const levelTag: Record<LogLevel, string> = {
  info: '信息',
  success: '成功',
  warn: '警告',
  error: '错误'
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export interface Logger {
  banner(title: string): void
  section(title: string): void
  info(message: string, ...params: unknown[]): void
  success(message: string, ...params: unknown[]): void
  warn(message: string, ...params: unknown[]): void
  error(message: string, ...params: unknown[]): void
  divider(): void
  kv(label: string, value: unknown): void
  json(label: string, payload: unknown): void
  timed<T>(title: string, fn: () => Promise<T>): Promise<T>
}

const emphasizedLevels: ReadonlySet<LogLevel> = new Set(['warn', 'error'])

export function createLogger(_scope: string): Logger {

  const base = (level: LogLevel, message: string, params: unknown[]) => {
    const prefix = emphasizedLevels.has(level) ? `${levelTag[level]} ` : ''
    const line = `${prefix}${message}`
    if (params.length === 0) {
      console.log(line)
      return
    }
    console.log(line, ...params)
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`
    }
    return `${(ms / 1000).toFixed(2)}s`
  }

  return {
    banner(title: string) {
      const line = '='.repeat(Math.max(title.length + 8, 32))
      console.log(line)
      console.log(`===  ${title}  ===`)
      console.log(line)
    },
    section(title: string) {
      const line = `--- ${title} ${'-'.repeat(Math.max(0, 60 - title.length))}`
      console.log(line)
    },
    info(message: string, ...params: unknown[]) {
      base('info', message, params)
    },
    success(message: string, ...params: unknown[]) {
      base('success', message, params)
    },
    warn(message: string, ...params: unknown[]) {
      base('warn', message, params)
    },
    error(message: string, ...params: unknown[]) {
      base('error', message, params)
    },
    divider() {
      console.log(horizontalRule)
    },
    kv(label: string, value: unknown) {
      const padded = label.padEnd(24, '.')
      base('info', `${padded} ${value}`, [])
    },
    json(label: string, payload: unknown) {
      this.section(label)
      console.log(JSON.stringify(payload, null, 2))
      this.divider()
    },
    async timed<T>(title: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now()
      this.info(`${title} [开始] `)
      try {
        const result = await fn()
        this.success(`${title} (${formatDuration(Date.now() - start)}) [完成]`)
        return result
      } catch (error) {
        this.error(`${title} (${formatDuration(Date.now() - start)}) [失败]`)
        throw error
      }
    }
  }
}

export function formatList(items: Array<[string, string | number]>): string {
  return items.map(([k, v]) => `${k.padEnd(24, '.')} ${v}`).join('\n')
}

export function formatMessage(template: string, ...params: unknown[]): string {
  return format(template, ...params)
}
