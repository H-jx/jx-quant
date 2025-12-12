# h-trader-adapter 技术文档

多平台交易适配器 - 抹平 OKX/Binance 等交易所的 API 差异，提供统一的交易接口。

## 设计目标

1. **统一接口** - 抹平不同交易所的 API 差异
2. **固化流程** - 标准化下单前的校验流程（参数校验 → 余额检查 → 精度格式化）
3. **统一格式** - 返回统一的数据结构
4. **可扩展** - 方便添加新交易所支持
5. **职责分离** - 公共 API 与交易 API 分离，支持无认证查询

## 项目结构

```
src/
├── index.ts                  # 入口 + 工厂函数
├── types.ts                  # 核心类型定义
├── utils.ts                  # 工具函数
├── BasePublicAdapter.ts      # 公共适配器基类（无需认证）
├── BaseTradeAdapter.ts       # 交易适配器基类（需要认证）
└── exchange/
  ├── Binance/
  │   ├── BinancePublicAdapter.ts # Binance 公共适配器
  │   ├── BinanceTradeAdapter.ts  # Binance 交易适配器
  │   └── types.ts                # Binance 的数据类型
  └── okx/
    ├── OkxPublicAdapter.ts     # OKX 公共适配器
    ├── OkxTradeAdapter.ts      # OKX 交易适配器
    └── types.ts                # OKX 的数据类型
```

## 适配器分类

### 公共适配器 (PublicAdapter)

**无需 API Key**，用于查询公开市场数据：

- `getSymbolInfo()` - 获取交易对信息
- `getSymbols()` - 获取所有交易对
- `getPrice()` - 获取当前价格
- `getMarkPrice()` - 获取标记价格
- `toRawSymbol()` / `fromRawSymbol()` - Symbol 格式转换

### 交易适配器 (TradeAdapter)

**需要 API Key/Secret**，用于账户查询和交易操作：

- `getBalance()` - 获取余额
- `getPositions()` - 获取持仓
- `placeOrder()` - 下单
- `placeOrders()` - 批量下单
- `cancelOrder()` - 取消订单
- `getOrder()` / `getOpenOrders()` - 查询订单

交易适配器**组合**公共适配器，可以：
1. 内部自动创建公共适配器
2. 外部传入共享的公共适配器实例

## 核心类型

### TradeType - 交易类型

```typescript
type TradeType = 'spot' | 'futures' | 'delivery';
```

| 类型 | 说明 | OKX 对应 | Binance 对应 |
|------|------|----------|--------------|
| spot | 现货 | SPOT | Spot |
| futures | U本位永续 | SWAP | USDM Futures |
| delivery | 币本位交割 | FUTURES | COINM Futures |

### SymbolInfo - 交易对信息

```typescript
interface SymbolInfo {
  symbol: string;           // 统一格式: BTC-USDT
  rawSymbol: string;        // 原始格式: BTCUSDT (Binance) / BTC-USDT-SWAP (OKX)
  baseCurrency: string;     // 基础货币: BTC
  quoteCurrency: string;    // 计价货币: USDT
  tradeType: TradeType;
  tickSize: string;         // 最小价格变动: "0.01"
  stepSize: string;         // 最小数量变动: "0.001"
  minQty: string;           // 最小下单数量
  maxQty: string;           // 最大下单数量
  quantityPrecision: number;// 数量精度
  pricePrecision: number;   // 价格精度
  status: number;           // 1: 可用 2: 不可用
  raw: string;              // 补充其他原始数据(json text)
}
```

### PlaceOrderParams - 下单参数

```typescript
interface PlaceOrderParams {
  symbol: string;           // 交易对（统一格式）
  tradeType: TradeType;     // 交易类型
  side: 'buy' | 'sell';     // 交易方向
  orderType: 'limit' | 'market' | 'algos' | 'maker-only'; // 订单类型
  quantity: number;         // 下单数量
  price?: number;           // 价格（限价单必填）
  positionSide?: 'long' | 'short'; // 持仓方向（合约必填）
  leverage?: number;        // 杠杆倍数（合约）
  clientOrderId?: string;   // 客户端订单ID
}
```

### PlaceOrderResult - 下单结果

```typescript
interface PlaceOrderResult {
  success: boolean;         // 是否成功
  order?: Order;            // 订单信息（成功时）
  code?: string;            // 错误码（失败时）
  message?: string;         // 错误信息（失败时）
  raw?: unknown;            // 原始响应
}
```

采用 Result 模式而非异常，强制调用方处理成功/失败两种情况。

### 配置类型

```typescript
// 公共适配器配置（无需认证）
interface PublicAdapterConfig {
  simulated?: boolean;      // 是否模拟盘
  timeout?: number;         // 请求超时
  proxy?: string;           // 代理
}

// 交易适配器配置（需要认证）
interface TradeAdapterConfig extends PublicAdapterConfig {
  apiKey: string;           // API Key
  apiSecret: string;        // API Secret
  passphrase?: string;      // Passphrase (OKX需要)
}
```

## 核心接口

### IPublicAdapter - 公共适配器接口

```typescript
interface IPublicAdapter {
  readonly name: string;

  // Symbol 信息
  getSymbolInfo(symbol: string, tradeType: TradeType): Promise<SymbolInfo | null>;
  getSymbols(tradeType: TradeType): Promise<SymbolInfo[]>;
  toRawSymbol(symbol: string, tradeType: TradeType): string;
  fromRawSymbol(rawSymbol: string, tradeType: TradeType): string;

  // 市场数据
  getPrice(symbol: string, tradeType: TradeType): Promise<string>;
  getMarkPrice(symbol: string, tradeType: TradeType): Promise<string>;

  // 缓存管理
  clearCache(): void;
}
```

### ITradeAdapter - 交易适配器接口

```typescript
interface ITradeAdapter {
  readonly name: string;
  readonly publicAdapter: IPublicAdapter;  // 组合的公共适配器

  // 初始化
  init(): Promise<void>;
  // 销毁（gc语言需要）
  destroy(): Promise<void>;

  // 账户信息
  getBalance(tradeType: TradeType): Promise<Balance[]>;
  getPositions(symbol?: string, tradeType?: TradeType): Promise<Position[]>;

  // 下单校验
  validateOrderParams(params: PlaceOrderParams, symbolInfo: SymbolInfo): ValidationResult;
  validateBalance(...): ValidationResult;
  formatOrderParams(params: PlaceOrderParams, symbolInfo: SymbolInfo): PlaceOrderParams;

  // 下单
  placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult>;
  placeOrders(params: PlaceOrderParams[]): Promise<BatchPlaceOrderResult>;
  getBatchOrderLimits(): BatchOrderLimits;

  // 订单管理
  cancelOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<CancelOrderResult>;
  getOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Order | null>;
  getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Order[]>;
}
```

## 使用示例

### 仅查询市场数据（无需认证）

```typescript
import { createPublicAdapter } from 'hquant-adapter';

// 创建公共适配器（无需 API Key）
const publicAdapter = createPublicAdapter('binance');

// 获取交易对信息
const symbolInfo = await publicAdapter.getSymbolInfo('BTC-USDT', 'futures');
console.log(symbolInfo?.minQty, symbolInfo?.tickSize);

// 获取价格
const price = await publicAdapter.getPrice('BTC-USDT', 'futures');
console.log('当前价格:', price);

// 获取所有交易对
const symbols = await publicAdapter.getSymbols('futures');
console.log('交易对数量:', symbols.length);
```

### 交易操作（需要认证）

```typescript
import { createTradeAdapter } from 'hquant-adapter';

// 创建交易适配器
const tradeAdapter = createTradeAdapter('okx', {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  passphrase: 'your-passphrase',  // OKX 需要
  simulated: false,
});

// 初始化加载symbols信息并缓存
await tradeAdapter.loadSymbols();

// 获取余额
const balances = await tradeAdapter.getBalance('futures');
const usdtBalance = balances.find(b => b.currency === 'USDT');
console.log('可用:', usdtBalance?.available);

// 下单
const result = await tradeAdapter.placeOrder({
  symbol: 'BTC-USDT',
  tradeType: 'futures',
  side: 'buy',
  orderType: 'limit',
  quantity: 0.01,
  price: 40000,
  positionSide: 'long',
  leverage: 10,
});

if (result.success) {
  console.log('下单成功:', result.order?.orderId);
} else {
  console.log('下单失败:', result.code, result.message);
}
```

### 共享公共适配器

```typescript
import { createPublicAdapter, createTradeAdapter } from 'hquant-adapter';

// 创建共享的公共适配器
const publicAdapter = createPublicAdapter('binance');

// 多个交易账户共享同一个公共适配器
const trader1 = createTradeAdapter('binance', config1, publicAdapter);
const trader2 = createTradeAdapter('binance', config2, publicAdapter);

// 公共适配器的缓存被共享，减少重复请求
```

### 批量下单

```typescript
// 获取批量下单限制
const limits = tradeAdapter.getBatchOrderLimits();
console.log(`最大批量: ${limits.maxBatchSize}`); // OKX: 20, Binance: 5

// 批量下单
const batchResult = await tradeAdapter.placeOrders([
  {
    symbol: 'BTC-USDT',
    tradeType: 'futures',
    side: 'buy',
    orderType: 'limit',
    quantity: 0.01,
    price: 40000,
    positionSide: 'long',
  },
  {
    symbol: 'ETH-USDT',
    tradeType: 'futures',
    side: 'buy',
    orderType: 'limit',
    quantity: 0.1,
    price: 2000,
    positionSide: 'long',
  },
]);

console.log(`成功: ${batchResult.successCount}, 失败: ${batchResult.failedCount}`);
```

## 下单流程

`BaseTradeAdapter.placeOrder()` 封装了完整的下单流程：

```
┌─────────────────────────────────────────────────────────────┐
│                      placeOrder(params)                     │
├─────────────────────────────────────────────────────────────┤
│  1. 获取 SymbolInfo（通过 publicAdapter，带缓存）            │
│     └─ 失败返回 SYMBOL_NOT_FOUND                            │
├─────────────────────────────────────────────────────────────┤
│  2. 校验参数 validateOrderParams()                          │
│     ├─ 交易对是否可交易                                      │
│     ├─ 限价单是否有价格                                      │
│     ├─ 合约是否有 positionSide                              │
│     ├─ 数量是否 > 0                                         │
│     ├─ 数量是否 >= minQty                                   │
│     └─ 数量是否 <= maxQty                                   │
├─────────────────────────────────────────────────────────────┤
│  3. 获取余额/持仓（并行）                                    │
│     ├─ getBalance(tradeType)                                │
│     └─ getPositions(symbol, tradeType)  // 合约时           │
├─────────────────────────────────────────────────────────────┤
│  4. 校验余额 validateBalance()                              │
│     ├─ 现货买入: quoteCurrency 余额 >= quantity * price     │
│     ├─ 现货卖出: baseCurrency 余额 >= quantity              │
│     ├─ 合约开仓: 保证金余额 >= (quantity * price) / leverage│
│     └─ 合约平仓: 持仓数量 >= quantity                       │
├─────────────────────────────────────────────────────────────┤
│  5. 格式化参数 formatOrderParams()                          │
│     ├─ quantity → alignToStepSize(quantity, stepSize)       │
│     └─ price → alignToTickSize(price, tickSize)             │
├─────────────────────────────────────────────────────────────┤
│  6. 执行下单 doPlaceOrder()（子类实现）                      │
│     └─ 调用交易所 API                                       │
├─────────────────────────────────────────────────────────────┤
│  7. 返回统一格式 PlaceOrderResult                           │
│     ├─ success: true → { success, order, raw }              │
│     └─ success: false → { success, code, message }          │
└─────────────────────────────────────────────────────────────┘
```

## 批量下单 API

### 交易所限制

| 交易所 | 最大批量 | 支持的交易类型 | 接口 |
|--------|----------|----------------|------|
| OKX | 20 | spot, futures, delivery | `POST /api/v5/trade/batch-orders` |
| Binance | 5 | futures, delivery | `POST /fapi/v1/batchOrders` |

### 注意事项

1. **跳过余额校验** - 批量下单只做参数校验和格式化，不校验余额
2. **结果顺序一致** - 返回结果顺序与输入参数顺序一致
3. **Binance 现货不支持** - Binance 现货不支持批量下单，会退化为并行单个下单

## Symbol 格式转换

### 统一格式

所有 Symbol 使用 `BASE-QUOTE` 格式：`BTC-USDT`、`ETH-USDT`

### OKX 转换

| TradeType | 统一格式 | OKX 格式 |
|-----------|----------|----------|
| spot | BTC-USDT | BTC-USDT |
| futures | BTC-USDT | BTC-USDT-SWAP |
| delivery | BTC-USDT | BTC-USDT-240329 |

### Binance 转换

| TradeType | 统一格式 | Binance 格式 |
|-----------|----------|--------------|
| spot | BTC-USDT | BTCUSDT |
| futures | BTC-USDT | BTCUSDT |
| delivery | BTC-USDT | BTCUSD_PERP |

## 工具函数

```typescript
// 获取小数位数
getDecimalPlaces('0.001') // => 3

// 保留固定小数位（截断，非四舍五入）
keepDecimalFixed(1.23456, 2) // => 1.23

// 按步长对齐（向下取整）
alignToStepSize(1.234, '0.01') // => 1.23

// 重试 Promise
retryPromise(3, () => fetchData(), 1000)

// 并发去重（防止重复请求）
const cachedFetch = singlePromise(fetchData, (arg) => arg)

// 解析 Symbol
parseSymbol('BTC-USDT') // => { base: 'BTC', quote: 'USDT' }
```

## 扩展新交易所

### 1. 创建公共适配器

```typescript
import { BasePublicAdapter } from '../BasePublicAdapter';

export class NewExchangePublicAdapter extends BasePublicAdapter {
  readonly name = 'new-exchange';

  // 必须实现的方法
  protected async fetchSymbolInfo(symbol, tradeType) { /* ... */ }
  protected async fetchSymbols(tradeType) { /* ... */ }
  protected async _fetchPrice(symbol, tradeType) { /* ... */ }
  async getMarkPrice(symbol, tradeType) { /* ... */ }
  toRawSymbol(symbol, tradeType) { /* ... */ }
  fromRawSymbol(rawSymbol, tradeType) { /* ... */ }
}
```

### 2. 创建交易适配器

```typescript
import { BaseTradeAdapter } from '../BaseTradeAdapter';
import { NewExchangePublicAdapter } from './NewExchangePublicAdapter';

export class NewExchangeTradeAdapter extends BaseTradeAdapter {
  readonly name = 'new-exchange';

  constructor(config, publicAdapter?) {
    const pubAdapter = publicAdapter || new NewExchangePublicAdapter(config);
    super(config, pubAdapter);
  }

  // 必须实现的方法
  async init() { /* ... */ }
  async destroy() { /* ... */ }
  async getBalance(tradeType) { /* ... */ }
  async getPositions(symbol, tradeType) { /* ... */ }
  protected async doPlaceOrder(params, symbolInfo) { /* ... */ }
  protected async doBatchPlaceOrder(paramsList, symbolInfoMap) { /* ... */ }
  getBatchOrderLimits() { /* ... */ }
  async cancelOrder(symbol, orderId, tradeType) { /* ... */ }
  async getOrder(symbol, orderId, tradeType) { /* ... */ }
  async getOpenOrders(symbol, tradeType) { /* ... */ }
}
```

### 3. 注册到工厂函数

在 `index.ts` 的 `createPublicAdapter` 和 `createTradeAdapter` 中添加新交易所。

## 依赖

- `okx-api` - OKX API 客户端
- `binance` - Binance API 客户端

## API 文档参考

- OKX: https://www.okx.com/docs-v5/zh/#public-data
- Binance USDM: https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/websocket-api-general-info
- Binance COINM: https://developers.binance.com/docs/zh-CN/derivatives/coin-margined-futures/websocket-api-general-info
