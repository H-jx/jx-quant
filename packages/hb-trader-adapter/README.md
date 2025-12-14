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

### 1. 查询公开市场数据 (无需认证)

您可以轻松创建一个 `PublicAdapter` 来获取任何支持的交易所的公开数据，例如交易对信息和最新价格。

```typescript
import { createPublicAdapter } from '@jx-quant/etrader';

async function main() {
  // 1. 创建 Binance 公共适配器
  const publicAdapter = createPublicAdapter('binance');

  // 2. 获取 'BTC-USDT' U本位永续合约的交易对信息
  const symbolResult = await publicAdapter.getSymbolInfo('BTC-USDT', 'futures');

  if (symbolResult.ok) {
    const symbolInfo = symbolResult.data;
    console.log('--- BTC-USDT Futures Symbol Info ---');
    console.log(`最小下单量 (minQty): ${symbolInfo.minQty}`);
    console.log(`价格精度 (tickSize): ${symbolInfo.tickSize}`);
    console.log(`数量精度 (stepSize): ${symbolInfo.stepSize}`);
  } else {
    console.error('获取交易对信息失败:', symbolResult.error);
    return;
  }

  // 3. 获取 'ETH-USDT' U本位永续合约的当前市场价
  const priceResult = await publicAdapter.getPrice('ETH-USDT', 'futures');

  if (priceResult.ok) {
    console.log(`\n--- ETH-USDT Futures Price ---`);
    console.log(`当前价格: ${priceResult.data}`);
  } else {
    console.error('获取价格失败:', priceResult.error);
  }
}

main().catch(console.error);
```

### 2. 执行交易操作 (需要认证)

对于交易操作，您需要提供 API 凭证来创建一个 `TradeAdapter`。`placeOrder` 方法封装了完整的安全校验流程。

```typescript
import { createTradeAdapter } from '@jx-quant/etrader';
import type { ApiCredentials } from '@jx-quant/etrader';

async function main() {
  // 1. 设置您的 API 凭证
  const credentials = {
    apiKey: 'YOUR_API_KEY',
    apiSecret: 'YOUR_API_SECRET',
    // passphrase: 'YOUR_PASSPHRASE', // 如果是 OKX，则需要 passphrase
  };

  // 2. 创建 OKX 交易适配器
  const tradeAdapter = createTradeAdapter('okx', credentials);

  // （可选）初始化适配器，预加载所有交易对信息到缓存中，以提高后续性能
  await tradeAdapter.init();

  // 3. 获取 U本位合约账户的 USDT 余额
  const balanceResult = await tradeAdapter.getBalance('futures');
  if (balanceResult.ok) {
    const usdtBalance = balanceResult.data.find(b => b.asset === 'USDT');
    console.log('--- Futures Account Balance ---');
    console.log(`USDT 可用余额: ${usdtBalance?.free}`);
  } else {
    console.error('获取余额失败:', balanceResult.error);
  }

  // 4. 下一个限价单：买入 0.01 BTC，价格为 50000 USDT
  console.log('\n--- Placing Order ---');
  const orderResult = await tradeAdapter.placeOrder({
    symbol: 'BTC-USDT',
    tradeType: 'futures',
    side: 'buy',
    orderType: 'limit',
    quantity: 0.01,
    price: 50000,
    positionSide: 'long', // 合约交易必填
  });

  if (orderResult.ok) {
    console.log('✅ 下单成功!');
    console.log(`订单 ID: ${orderResult.data.orderId}`);
  } else {
    console.log('❌ 下单失败:');
    console.log(`  - 错误码: ${orderResult.error.code}`);
    console.log(`  - 错误信息: ${orderResult.error.message}`);
  }
}

main().catch(console.error);
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
