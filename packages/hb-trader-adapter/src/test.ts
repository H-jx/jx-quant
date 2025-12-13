/**
 * etrader 适配器测试文件
 *
 * 运行方式:
 * npx tsx src/test.ts
 *
 * 使用代理运行:
 * PROXY=http://127.0.0.1:7890 npx tsx src/test.ts
 *
 * 或者先构建再运行:
 * npm run build && node dist/test.js
 */

import {
  OkxPublicAdapter,
  BinancePublicAdapter,
  OkxTradeAdapter,
  BinanceTradeAdapter,
  type Result,
  type ApiCredentials,
  type AdapterOptions
} from './index'

// ============================================================================
// 测试配置
// ============================================================================

const TEST_SYMBOL = 'BTC-USDT'
const TEST_TRADE_TYPE = 'futures' as const

// 从环境变量读取代理配置
const SOCKS_PROXY = process.env.socks_proxy || process.env.SOCKS_PROXY
const HTTPS_PROXY = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY

const ADAPTER_OPTIONS: AdapterOptions | undefined = (SOCKS_PROXY || HTTPS_PROXY)
  ? { socksProxy: SOCKS_PROXY, httpsProxy: HTTPS_PROXY }
  : undefined

// 如果需要测试交易 API，请填写真实的 API 密钥
const OKX_CREDENTIALS: ApiCredentials | null = null
// {
//   apiKey: 'your-api-key',
//   apiSecret: 'your-api-secret',
//   passphrase: 'your-passphrase'
// }

const BINANCE_CREDENTIALS: ApiCredentials | null = null
// {
//   apiKey: 'your-api-key',
//   apiSecret: 'your-api-secret'
// }

// ============================================================================
// 工具函数
// ============================================================================

function printResult<T>(name: string, result: Result<T>): void {
  if (result.ok) {
    console.log(`✅ ${name}:`)
    console.log(JSON.stringify(result.data, null, 2))
  } else {
    console.log(`❌ ${name} 失败:`)
    console.log(`   Code: ${result.error.code}`)
    console.log(`   Message: ${result.error.message}`)
  }
  console.log('')
}

function printSection(title: string): void {
  console.log('\n' + '='.repeat(60))
  console.log(` ${title}`)
  console.log('='.repeat(60) + '\n')
}

// ============================================================================
// OKX 公共 API 测试
// ============================================================================

async function testOkxPublicApi(): Promise<void> {
  printSection('OKX 公共 API 测试')

  const adapter = new OkxPublicAdapter(ADAPTER_OPTIONS)

  // 测试获取交易对信息
  console.log('📌 测试 getSymbolInfo...')
  const symbolInfo = await adapter.getSymbolInfo(TEST_SYMBOL, TEST_TRADE_TYPE)
  printResult('getSymbolInfo', symbolInfo)

  // 测试获取价格
  console.log('📌 测试 getPrice...')
  const price = await adapter.getPrice(TEST_SYMBOL, TEST_TRADE_TYPE)
  printResult('getPrice', price)

  // 测试获取 Ticker
  console.log('📌 测试 getTicker...')
  const ticker = await adapter.getTicker(TEST_SYMBOL, TEST_TRADE_TYPE)
  printResult('getTicker', ticker)

  // 测试获取深度
  console.log('📌 测试 getOrderBook...')
  const orderBook = await adapter.getOrderBook(TEST_SYMBOL, TEST_TRADE_TYPE, 5)
  if (orderBook.ok) {
    console.log('✅ getOrderBook:')
    console.log(`   Asks (卖盘前3): ${JSON.stringify(orderBook.data.asks.slice(0, 3))}`)
    console.log(`   Bids (买盘前3): ${JSON.stringify(orderBook.data.bids.slice(0, 3))}`)
  } else {
    printResult('getOrderBook', orderBook)
  }

  // 测试获取所有交易对 (只显示前5个)
  console.log('\n📌 测试 getAllSymbols (现货, 显示前5个)...')
  const allSymbols = await adapter.getAllSymbols('spot')
  if (allSymbols.ok) {
    console.log(`✅ getAllSymbols: 共 ${allSymbols.data.length} 个交易对`)
    console.log('   前5个:')
    allSymbols.data.slice(0, 5).forEach(s => {
      console.log(`   - ${s.symbol} (${s.rawSymbol})`)
    })
  } else {
    printResult('getAllSymbols', allSymbols)
  }
}

// ============================================================================
// Binance 公共 API 测试
// ============================================================================

async function testBinancePublicApi(): Promise<void> {
  printSection('Binance 公共 API 测试')

  const adapter = new BinancePublicAdapter(ADAPTER_OPTIONS)

  // 测试获取交易对信息
  console.log('📌 测试 getSymbolInfo...')
  const symbolInfo = await adapter.getSymbolInfo(TEST_SYMBOL, TEST_TRADE_TYPE)
  printResult('getSymbolInfo', symbolInfo)

  // 测试获取价格
  console.log('📌 测试 getPrice...')
  const price = await adapter.getPrice(TEST_SYMBOL, TEST_TRADE_TYPE)
  printResult('getPrice', price)

  // 测试获取 Ticker
  console.log('📌 测试 getTicker...')
  const ticker = await adapter.getTicker(TEST_SYMBOL, TEST_TRADE_TYPE)
  printResult('getTicker', ticker)

  // 测试获取深度
  console.log('📌 测试 getOrderBook...')
  const orderBook = await adapter.getOrderBook(TEST_SYMBOL, TEST_TRADE_TYPE, 5)
  if (orderBook.ok) {
    console.log('✅ getOrderBook:')
    console.log(`   Asks (卖盘前3): ${JSON.stringify(orderBook.data.asks.slice(0, 3))}`)
    console.log(`   Bids (买盘前3): ${JSON.stringify(orderBook.data.bids.slice(0, 3))}`)
  } else {
    printResult('getOrderBook', orderBook)
  }

  // 测试获取所有交易对 (只显示前5个)
  console.log('\n📌 测试 getAllSymbols (现货, 显示前5个)...')
  const allSymbols = await adapter.getAllSymbols('spot')
  if (allSymbols.ok) {
    console.log(`✅ getAllSymbols: 共 ${allSymbols.data.length} 个交易对`)
    console.log('   前5个:')
    allSymbols.data.slice(0, 5).forEach(s => {
      console.log(`   - ${s.symbol} (${s.rawSymbol})`)
    })
  } else {
    printResult('getAllSymbols', allSymbols)
  }
}

// ============================================================================
// OKX 交易 API 测试 (需要 API 密钥)
// ============================================================================

async function testOkxTradeApi(): Promise<void> {
  if (!OKX_CREDENTIALS) {
    console.log('⚠️  跳过 OKX 交易 API 测试 (未配置 API 密钥)')
    return
  }

  printSection('OKX 交易 API 测试')

  const adapter = new OkxTradeAdapter(OKX_CREDENTIALS, ADAPTER_OPTIONS)

  // 测试获取余额
  console.log('📌 测试 getBalance...')
  const balance = await adapter.getBalance('spot')
  if (balance.ok) {
    console.log(`✅ getBalance: 共 ${balance.data.length} 种资产`)
    balance.data.slice(0, 5).forEach(b => {
      console.log(`   - ${b.asset}: ${b.free} (可用) / ${b.total} (总计)`)
    })
  } else {
    printResult('getBalance', balance)
  }

  // 测试获取持仓
  console.log('\n📌 测试 getPositions...')
  const positions = await adapter.getPositions(undefined, 'futures')
  if (positions.ok) {
    console.log(`✅ getPositions: 共 ${positions.data.length} 个持仓`)
    positions.data.forEach(p => {
      console.log(`   - ${p.symbol} ${p.positionSide}: ${p.positionAmt} @ ${p.entryPrice}`)
    })
  } else {
    printResult('getPositions', positions)
  }

  // 测试获取未成交订单
  console.log('\n📌 测试 getOpenOrders...')
  const openOrders = await adapter.getOpenOrders(undefined, 'futures')
  if (openOrders.ok) {
    console.log(`✅ getOpenOrders: 共 ${openOrders.data.length} 个未成交订单`)
    openOrders.data.slice(0, 5).forEach(o => {
      console.log(`   - ${o.symbol} ${o.side} ${o.quantity} @ ${o.price}`)
    })
  } else {
    printResult('getOpenOrders', openOrders)
  }
}

// ============================================================================
// Binance 交易 API 测试 (需要 API 密钥)
// ============================================================================

async function testBinanceTradeApi(): Promise<void> {
  if (!BINANCE_CREDENTIALS) {
    console.log('⚠️  跳过 Binance 交易 API 测试 (未配置 API 密钥)')
    return
  }

  printSection('Binance 交易 API 测试')

  const adapter = new BinanceTradeAdapter(BINANCE_CREDENTIALS, ADAPTER_OPTIONS)

  // 测试获取余额
  console.log('📌 测试 getBalance...')
  const balance = await adapter.getBalance('spot')
  if (balance.ok) {
    console.log(`✅ getBalance: 共 ${balance.data.length} 种资产`)
    balance.data.slice(0, 5).forEach(b => {
      console.log(`   - ${b.asset}: ${b.free} (可用) / ${b.total} (总计)`)
    })
  } else {
    printResult('getBalance', balance)
  }

  // 测试获取持仓
  console.log('\n📌 测试 getPositions...')
  const positions = await adapter.getPositions(undefined, 'futures')
  if (positions.ok) {
    console.log(`✅ getPositions: 共 ${positions.data.length} 个持仓`)
    positions.data.forEach(p => {
      console.log(`   - ${p.symbol} ${p.positionSide}: ${p.positionAmt} @ ${p.entryPrice}`)
    })
  } else {
    printResult('getPositions', positions)
  }

  // 测试获取未成交订单
  console.log('\n📌 测试 getOpenOrders...')
  const openOrders = await adapter.getOpenOrders(undefined, 'futures')
  if (openOrders.ok) {
    console.log(`✅ getOpenOrders: 共 ${openOrders.data.length} 个未成交订单`)
    openOrders.data.slice(0, 5).forEach(o => {
      console.log(`   - ${o.symbol} ${o.side} ${o.quantity} @ ${o.price}`)
    })
  } else {
    printResult('getOpenOrders', openOrders)
  }
}

// ============================================================================
// WebSocket 测试
// ============================================================================

async function testOkxWebSocket(): Promise<void> {
  printSection('OKX WebSocket 测试')

  const { WebsocketClient } = await import('okx-api')

  return new Promise((resolve) => {
    console.log('📌 连接 OKX WebSocket...')
    if (SOCKS_PROXY || HTTPS_PROXY) {
      console.log(`   使用代理: ${SOCKS_PROXY || HTTPS_PROXY}`)
    }

    const ws = new WebsocketClient()

    let messageCount = 0
    const maxMessages = 5

    ws.on('open', (data) => {
      console.log('✅ WebSocket 已连接:', data.wsKey)
    })

    ws.on('update', (data) => {
      messageCount++
      if (data.arg?.channel === 'tickers') {
        const ticker = data.data?.[0]
        if (ticker) {
          console.log(`📊 Ticker 更新 [${messageCount}/${maxMessages}]:`, {
            instId: ticker.instId,
            last: ticker.last,
            vol24h: ticker.vol24h
          })
        }
      }

      if (messageCount >= maxMessages) {
        console.log('\n✅ OKX WebSocket 测试完成，关闭连接...')
        ws.close()
        resolve()
      }
    })

    ws.on('error', (error) => {
      console.log('❌ WebSocket 错误:', (error as Error).message || error)
      resolve()
    })

    // 订阅 BTC-USDT-SWAP ticker
    ws.subscribe({
      channel: 'tickers',
      instId: 'BTC-USDT-SWAP'
    })

    // 超时保护
    setTimeout(() => {
      if (messageCount < maxMessages) {
        console.log('⚠️  WebSocket 测试超时')
        ws.close()
        resolve()
      }
    }, 15000)
  })
}

async function testBinanceWebSocket(): Promise<void> {
  printSection('Binance WebSocket 测试')

  const { WebsocketClient } = await import('binance')

  return new Promise((resolve) => {
    console.log('📌 连接 Binance WebSocket...')
    if (SOCKS_PROXY || HTTPS_PROXY) {
      console.log(`   使用代理: ${SOCKS_PROXY || HTTPS_PROXY}`)
    }

    const ws = new WebsocketClient({})

    let messageCount = 0
    const maxMessages = 5

    ws.on('open', (data) => {
      console.log('✅ WebSocket 已连接:', data.wsKey)
    })

    ws.on('formattedMessage', (data) => {
      messageCount++
      const msg = data as { eventType?: string; symbol?: string; close?: string; volume?: string }
      if (msg.eventType === '24hrTicker') {
        console.log(`📊 Ticker 更新 [${messageCount}/${maxMessages}]:`, {
          symbol: msg.symbol,
          close: msg.close,
          volume: msg.volume
        })
      }

      if (messageCount >= maxMessages) {
        console.log('\n✅ Binance WebSocket 测试完成，关闭连接...')
        ws.close(undefined, false)
        resolve()
      }
    })

    ws.on('error', (error) => {
      const err = error as { error?: Error }
      console.log('❌ WebSocket 错误:', err.error?.message || error)
      resolve()
    })

    // 订阅 BTCUSDT ticker (USDM)
    ws.subscribeSymbol24hrTicker('BTCUSDT', 'usdm')

    // 超时保护
    setTimeout(() => {
      if (messageCount < maxMessages) {
        console.log('⚠️  WebSocket 测试超时')
        ws.close(undefined, false)
        resolve()
      }
    }, 15000)
  })
}

// ============================================================================
// 主函数
// ============================================================================

async function main(): Promise<void> {
  console.log('\n🚀 etrader 适配器测试开始\n')
  console.log(`测试交易对: ${TEST_SYMBOL}`)
  console.log(`测试类型: ${TEST_TRADE_TYPE}`)
  console.log(`SOCKS 代理: ${SOCKS_PROXY || '无'}`)
  console.log(`HTTPS 代理: ${HTTPS_PROXY || '无'}`)

  try {
    // 公共 API 测试
    await testOkxPublicApi()
    await testBinancePublicApi()

    // 交易 API 测试 (需要配置 API 密钥)
    await testOkxTradeApi()
    await testBinanceTradeApi()

    // WebSocket 测试
    await testOkxWebSocket()
    await testBinanceWebSocket()

    printSection('测试完成')
    console.log('✅ 所有测试已完成!\n')

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error)
  }

  process.exit(0)
}

main()
