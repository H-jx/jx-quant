# @jx-quant/etrader

[![npm version](https://img.shields.io/npm/v/@jx-quant/etrader.svg)](https://www.npmjs.com/package/@jx-quant/etrader)

多平台交易适配器，旨在抹平 OKX、Binance 等主流加密货币交易所的 API 差异。通过提供一个统一、标准化的接口，简化量化交易策略的开发和部署流程。

## ✨ 核心特性

- **统一接口**: 为不同交易所的交易和查询操作提供一致的调用方式。
- **固化流程**: 标准化下单前的校验流程（参数校验 → 余额检查 → 精度格式化）。
- **统一数据结构**: 无论是交易对信息、订单、余额还是持仓，都返回统一的、经过清洗的数据格式。
- **职责分离**:
  - **`PublicAdapter`**: 无需 API Key，负责查询市场行情、交易对信息等公开数据。
  - **`TradeAdapter`**: 需要 API Key，负责下单、撤单、查询私有账户信息。
- **高可扩展性**: 提供清晰的基类和接口，方便快速集成新的交易所。
- **现代化的错误处理**: 采用 Go/Rust 风格的 `Result` 模式，使错误处理更安全、更明确。

## 📦 安装

```bash
npm install @jx-quant/etrader
```

## 🚀 使用指南

以下示例展示一个完整的交易流程：查询交易对信息 → 下单 → 监听订单状态。

### 完整交易流程示例

```typescript
import {
  BinanceTradeAdapter,
  BinanceWsUserDataAdapter,
  type WsOrderUpdate,
  type PlaceOrderParams,
} from '@jx-quant/etrader'

// ============================================================================
// 1. 初始化适配器
// ============================================================================

const tradeAdapter = new BinanceTradeAdapter({
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret',
  demonet: true, // 使用测试网进行开发调试
})

const wsAdapter = new BinanceWsUserDataAdapter({
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret',
  demonet: true,
})

// ============================================================================
// 2. 查询交易对信息
// ============================================================================

async function querySymbolInfo() {
  // 初始化适配器（加载交易对信息）
  const initResult = await tradeAdapter.init()
  if (!initResult.ok) {
    console.error('初始化失败:', initResult.error.message)
    return null
  }

  // 查询 BTC-USDT 永续合约信息
  const symbolResult = await tradeAdapter.getSymbolInfo('BTC-USDT', 'futures')
  if (!symbolResult.ok) {
    console.error('获取交易对信息失败:', symbolResult.error.message)
    return null
  }

  const symbolInfo = symbolResult.data
  console.log('交易对信息:', {
    symbol: symbolInfo.symbol,
    tickSize: symbolInfo.tickSize,      // 价格精度
    stepSize: symbolInfo.stepSize,      // 数量精度
    minQty: symbolInfo.minQty,          // 最小下单数量
    maxLeverage: symbolInfo.maxLeverage // 最大杠杆
  })

  return symbolInfo
}

// ============================================================================
// 3. 下单
// ============================================================================

async function placeOrder() {
  // 获取当前价格
  const priceResult = await tradeAdapter.getPrice('BTC-USDT', 'futures')
  if (!priceResult.ok) {
    console.error('获取价格失败:', priceResult.error.message)
    return null
  }

  const currentPrice = parseFloat(priceResult.data)
  // 限价单价格设为当前价格的 99%
  const limitPrice = currentPrice * 0.99

  // 构建下单参数
  const orderParams: PlaceOrderParams = {
    symbol: 'BTC-USDT',
    tradeType: 'futures',
    side: 'buy',
    orderType: 'limit',
    quantity: 0.001,
    price: limitPrice,
    positionSide: 'long', // 合约必须指定仓位方向
  }

  // 下单
  const orderResult = await tradeAdapter.placeOrder(orderParams)
  if (!orderResult.ok) {
    console.error('下单失败:', orderResult.error.message)
    return null
  }

  const order = orderResult.data
  console.log('下单成功:', {
    orderId: order.orderId,
    symbol: order.symbol,
    side: order.side,
    price: order.price,
    quantity: order.quantity,
    status: order.status
  })

  return order
}

// ============================================================================
// 4. 监听订单状态
// ============================================================================

async function subscribeOrderUpdates() {
  // 监听订单更新事件
  wsAdapter.on('order', (event: WsOrderUpdate) => {
    console.log('订单更新:', {
      orderId: event.orderId,
      symbol: event.symbol,
      side: event.side,
      status: event.status,
      filledQty: event.filledQty,
      avgPrice: event.avgPrice,
    })

    // 订单完全成交
    if (event.status === 'filled') {
      console.log(`订单 ${event.orderId} 已完全成交`)
    }

    // 订单被取消
    if (event.status === 'canceled') {
      console.log(`订单 ${event.orderId} 已取消`)
    }
  })

  // 监听仓位更新
  wsAdapter.on('position', (event) => {
    console.log('仓位更新:', {
      symbol: event.symbol,
      positionSide: event.positionSide,
      positionAmt: event.positionAmt,
      unrealizedPnl: event.unrealizedPnl,
    })
  })

  // 订阅 WebSocket
  await wsAdapter.subscribe(
    { tradeType: 'futures', autoReconnect: true },
    (event) => {
      // 可选的通用事件处理
      console.log('收到事件:', event.eventType)
    }
  )

  console.log('WebSocket 订阅成功')
}

// ============================================================================
// 5. 运行完整流程
// ============================================================================

async function main() {
  try {
    // 订阅订单更新
    await subscribeOrderUpdates()

    // 查询交易对信息
    const symbolInfo = await querySymbolInfo()
    if (!symbolInfo) return

    // 下单
    const order = await placeOrder()
    if (!order) return

    // 等待订单状态更新 (通过 WebSocket 接收)
    console.log('等待订单状态更新...')

    // 查询订单状态 (可选，用于主动查询)
    const orderStatus = await tradeAdapter.getOrder(
      'BTC-USDT',
      order.orderId,
      'futures'
    )
    if (orderStatus.ok) {
      console.log('订单当前状态:', orderStatus.data.status)
    }

    // 取消订单 (可选)
    // const cancelResult = await tradeAdapter.cancelOrder(
    //   'BTC-USDT',
    //   order.orderId,
    //   'futures'
    // )

  } catch (error) {
    console.error('执行出错:', error)
  }
}

// 运行
main()

// 优雅退出
process.on('SIGINT', async () => {
  console.log('正在关闭连接...')
  await wsAdapter.close()
  await tradeAdapter.destroy()
  process.exit(0)
})
```

### 更多示例

#### 查询账户余额和持仓

```typescript
// 查询合约账户余额
const balanceResult = await tradeAdapter.getBalance('futures')
if (balanceResult.ok) {
  balanceResult.data.forEach((balance) => {
    console.log(`${balance.asset}: 可用 ${balance.free}, 冻结 ${balance.locked}`)
  })
}

// 查询所有持仓
const positionsResult = await tradeAdapter.getPositions(undefined, 'futures')
if (positionsResult.ok) {
  positionsResult.data
    .filter((p) => parseFloat(p.positionAmt) !== 0)
    .forEach((position) => {
      console.log(`${position.symbol} ${position.positionSide}: ${position.positionAmt}`)
    })
}
```

#### 市价单

```typescript
const result = await tradeAdapter.placeOrder({
  symbol: 'BTC-USDT',
  tradeType: 'futures',
  side: 'buy',
  orderType: 'market',
  quantity: 0.001,
  positionSide: 'long',
})
```

#### 止盈止损单

```typescript
const result = await tradeAdapter.placeStrategyOrder({
  symbol: 'BTC-USDT',
  tradeType: 'futures',
  side: 'sell',
  positionSide: 'long',
  quantity: 0.001,
  strategyType: 'stop-loss',
  triggerPrice: 50000,
  triggerPriceType: 'mark', // 使用标记价格触发
})
```

## 🛠️ 开发者指南

### 环境设置

1.  克隆仓库。
2.  安装依赖项：
    ```bash
    npm install
    ```

### 主要命令

-   **构建项目**:
    ```bash
    npm run build
    ```
    此命令使用 `tsup` 将 TypeScript 源码打包成 CommonJS 和 ESModule 格式。

-   **开发模式 (监听文件变化)**:
    ```bash
    npm run dev
    ```

-   **运行测试**:
    ```bash
    npm run test
    ```
    此命令使用 `vitest` 运行单元测试。

-   **类型检查**:
    ```bash
    npm run typecheck
    ```
    此命令使用 `tsc` 对整个项目进行静态类型检查。

## 📜 License

[MIT](./LICENSE)
