/**
 * 策略订单示例 (止盈止损/计划委托/移动止损)
 * 
 * 运行方式: npx esno example/strategyOrder.ts
 */
import { OkxTradeAdapter, BinanceTradeAdapter } from '../src'
import type { StrategyOrderParams, StrategyOrder, TradeType } from '../src'
import { createLogger } from './logger'
import { env } from './helpers'
const logger = createLogger('')
// ============================================================================
// 配置
// ============================================================================

const OKX_CONFIG = {
  apiKey: env.okxApiKey || '',
  apiSecret: env.okxApiSecret || '',
  passphrase: env.okxPassphrase || '',
  httpsProxy: 'http://127.0.0.1:7890'
}

const BINANCE_CONFIG = {
  apiKey: env.binanceApiKey || '',
  apiSecret: env.binanceApiSecret || '',
  httpsProxy: 'http://127.0.0.1:7890'
}

// ============================================================================
// OKX 策略订单示例
// ============================================================================

async function testOkxStrategyOrders() {
  logger.info('========== OKX 策略订单测试 ==========')
  
  const adapter = new OkxTradeAdapter(OKX_CONFIG)
  const symbol = 'BTC-USDT'
  const tradeType: TradeType = 'futures'

  // 1. 条件单 (止损)
  logger.info('\n--- 1. 下条件止损单 ---')
  const stopLossParams: StrategyOrderParams = {
    symbol,
    tradeType,
    side: 'sell',
    positionSide: 'long',
    strategyType: 'stop-loss',
    quantity: 0.001,
    triggerPrice: 90000,
    triggerPriceType: 'last',
    orderPrice: 89900, // 限价，不填则为市价
    reduceOnly: true
  }

  const stopLossResult = await adapter.placeStrategyOrder(stopLossParams)
  if (stopLossResult.ok) {
    logger.info('止损单下单成功:', stopLossResult.data)
  } else {
    logger.error('止损单下单失败:', stopLossResult.error)
  }

  // 2. 止盈单
  logger.info('\n--- 2. 下止盈单 ---')
  const takeProfitParams: StrategyOrderParams = {
    symbol,
    tradeType,
    side: 'sell',
    positionSide: 'long',
    strategyType: 'take-profit',
    quantity: 0.001,
    triggerPrice: 110000,
    triggerPriceType: 'last',
    reduceOnly: true
  }

  const takeProfitResult = await adapter.placeStrategyOrder(takeProfitParams)
  if (takeProfitResult.ok) {
    logger.info('止盈单下单成功:', takeProfitResult.data)
  } else {
    logger.error('止盈单下单失败:', takeProfitResult.error)
  }

  // 3. 计划委托 (触发后开仓)
  logger.info('\n--- 3. 下计划委托单 ---')
  const triggerParams: StrategyOrderParams = {
    symbol,
    tradeType,
    side: 'buy',
    positionSide: 'long',
    strategyType: 'trigger',
    quantity: 0.001,
    triggerPrice: 95000,
    triggerPriceType: 'last',
    orderPrice: 95100,
  }

  const triggerResult = await adapter.placeStrategyOrder(triggerParams)
  if (triggerResult.ok) {
    logger.info('计划委托单下单成功:', triggerResult.data)
  } else {
    logger.error('计划委托单下单失败:', triggerResult.error)
  }

  // 4. 移动止盈止损
  logger.info('\n--- 4. 下移动止盈止损单 ---')
  const trailingParams: StrategyOrderParams = {
    symbol,
    tradeType,
    side: 'sell',
    positionSide: 'long',
    strategyType: 'trailing-stop',
    quantity: 0.001,
    triggerPrice: 98000, // 激活价
    callbackRatio: 0.01, // 1% 回调比例
    reduceOnly: true
  }

  const trailingResult = await adapter.placeStrategyOrder(trailingParams)
  if (trailingResult.ok) {
    logger.info('移动止盈止损单下单成功:', trailingResult.data)
  } else {
    logger.error('移动止盈止损单下单失败:', trailingResult.error)
  }

  // 5. 查询未完成策略订单
  logger.info('\n--- 5. 查询未完成策略订单 ---')
  const openOrdersResult = await adapter.getOpenStrategyOrders(symbol, tradeType)
  if (openOrdersResult.ok) {
    logger.info(`未完成策略订单数量: ${openOrdersResult.data.length}`)
    openOrdersResult.data.forEach((order: StrategyOrder, index: number) => {
      logger.info(`  [${index + 1}] ${order.strategyType} ${order.side} ${order.quantity} @ trigger ${order.triggerPrice}`)
    })
  } else {
    logger.error('查询失败:', openOrdersResult.error)
  }

  // 6. 取消策略订单
  if (stopLossResult.ok) {
    logger.info('\n--- 6. 取消止损单 ---')
    const cancelResult = await adapter.cancelStrategyOrder(
      symbol,
      stopLossResult.data.algoId,
      tradeType
    )
    if (cancelResult.ok) {
      logger.info('取消成功:', cancelResult.data.status)
    } else {
      logger.error('取消失败:', cancelResult.error)
    }
  }
}

// ============================================================================
// Binance 策略订单示例
// ============================================================================

async function testBinanceStrategyOrders() {
  logger.info('\n========== Binance 策略订单测试 ==========')
  
  const adapter = new BinanceTradeAdapter(BINANCE_CONFIG)
  const symbol = 'BTC-USDT'
  const tradeType: TradeType = 'futures'

  // 1. 止损单
  logger.info('\n--- 1. 下止损单 ---')
  const stopLossParams: StrategyOrderParams = {
    symbol,
    tradeType,
    side: 'sell',
    positionSide: 'long',
    strategyType: 'stop-loss',
    quantity: 0.001,
    triggerPrice: 90000,
    triggerPriceType: 'last',
    reduceOnly: true
  }

  const stopLossResult = await adapter.placeStrategyOrder(stopLossParams)
  if (stopLossResult.ok) {
    logger.info('止损单下单成功:', stopLossResult.data)
  } else {
    logger.error('止损单下单失败:', stopLossResult.error)
  }

  // 2. 止盈单
  logger.info('\n--- 2. 下止盈单 ---')
  const takeProfitParams: StrategyOrderParams = {
    symbol,
    tradeType,
    side: 'sell',
    positionSide: 'long',
    strategyType: 'take-profit',
    quantity: 0.001,
    triggerPrice: 110000,
    triggerPriceType: 'mark', // 使用标记价格触发
    reduceOnly: true
  }

  const takeProfitResult = await adapter.placeStrategyOrder(takeProfitParams)
  if (takeProfitResult.ok === true) {
    logger.info('止盈单下单成功:', takeProfitResult.data)
  } else {
    logger.error('止盈单下单失败:', takeProfitResult.error)
  }

  // 3. 追踪止损单
  logger.info('\n--- 3. 下追踪止损单 ---')
  const trailingParams: StrategyOrderParams = {
    symbol,
    tradeType,
    side: 'sell',
    positionSide: 'long',
    strategyType: 'trailing-stop',
    quantity: 0.001,
    triggerPrice: 98000, // 激活价
    activationPrice: 100000, // 激活价格
    callbackRatio: 0.01, // 1% 回调
    reduceOnly: true
  }

  const trailingResult = await adapter.placeStrategyOrder(trailingParams)
  if (trailingResult.ok) {
    logger.info('追踪止损单下单成功:', trailingResult.data)
  } else {
    logger.error('追踪止损单下单失败:', trailingResult.error)
  }

  // 4. 查询未完成策略订单
  logger.info('\n--- 4. 查询未完成策略订单 ---')
  const openOrdersResult = await adapter.getOpenStrategyOrders(symbol, tradeType)
  if (openOrdersResult.ok) {
    logger.info(`未完成策略订单数量: ${openOrdersResult.data.length}`)
    openOrdersResult.data.forEach((order: StrategyOrder, index: number) => {
      logger.info(`  [${index + 1}] ${order.strategyType} ${order.side} ${order.quantity} @ trigger ${order.triggerPrice}`)
    })
  } else {
    logger.error('查询失败:', openOrdersResult.error)
  }

  // 5. 取消策略订单
  if (stopLossResult.ok) {
    logger.info('\n--- 5. 取消止损单 ---')
    const cancelResult = await adapter.cancelStrategyOrder(
      symbol,
      stopLossResult.data.algoId,
      tradeType
    )
    if (cancelResult.ok) {
      logger.info('取消成功:', cancelResult.data.status)
    } else {
      logger.error('取消失败:', cancelResult.error)
    }
  }
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {

  const exchange = process.argv[2] || 'okx'
  
  try {
    if (exchange === 'okx') {
      await testOkxStrategyOrders()
    } else if (exchange === 'binance') {
      await testBinanceStrategyOrders()
    } else if (exchange === 'all') {
      await testOkxStrategyOrders()
      await testBinanceStrategyOrders()
    } else {
      logger.info('Usage: npx esno example/strategyOrder.ts [okx|binance|all]')
    }
  } catch (error) {
    logger.error('执行出错:', error)
  }
}

main()
