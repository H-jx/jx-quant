# PRD v1: 多平台交易适配器

## 1. 项目目标

开发一个多平台交易适配器，旨在抹平 OKX、Binance 等主流加密货币交易所的 API 差异。通过提供一个统一、标准化的接口，简化量化交易策略的开发和部署流程。

## 2. 核心特性

- **统一接口**: 为不同交易所的交易和查询操作提供一致的调用方式。
- **固化流程**: 标准化下单前的校验流程（参数校验 → 余额检查 → 精度格式化）。
- **统一数据结构**: 无论是交易对信息、订单、余额还是持仓，都返回统一的、经过清洗的数据格式。
- **职责分离**:
  - **公共适配器 (`PublicAdapter`)**: 无需 API Key，负责查询市场行情、交易对信息等公开数据。
  - **交易适配器 (`TradeAdapter`)**: 需要 API Key，负责下单、撤单、查询私有账户信息（余额、持仓）等。
- **高可扩展性**: 提供清晰的基类和接口，方便快速集成新的交易所。
- **现代化的错误处理**: 采用 Go/Rust 风格的 `Result<T, E>` 模式，强制调用方处理成功和失败两种情况，杜绝隐藏的 `try/catch` 异常。

## 3. 架构设计

系统核心由 `PublicAdapter` 和 `TradeAdapter` 两大组件构成。`TradeAdapter` 内部组合（Composition）一个 `PublicAdapter` 实例来访问公共数据，实现了职责分离和资源复用。

### 3.1. 适配器分类

- **`BasePublicAdapter`**: 抽象基类，定义了获取公开数据（如交易对、价格）的通用逻辑和缓存策略。
- **`BaseTradeAdapter`**: 抽象基类，封装了完整的下单生命周期，包括参数校验、余额检查、精度格式化以及订单执行。
- **具体实现**:
  - `OkxPublicAdapter` / `OkxTradeAdapter`
  - `BinancePublicAdapter` / `BinanceTradeAdapter`

### 3.2. Symbol 格式
- **统一格式**: 所有内部逻辑和外部调用均采用 `BASE-QUOTE` 格式，例如 `BTC-USDT`。
- **转换层**: 在每个交易所适配器内部，通过 `toRawSymbol` 和 `fromRawSymbol` 方法处理与交易所特定格式（如 Binance 的 `BTCUSDT` 或 OKX 的 `BTC-USDT-SWAP`）之间的转换。

### 3.3. 下单流程

`BaseTradeAdapter.placeOrder()` 封装了标准的下单流程，确保交易的安全性和可靠性：

1.  **获取 `SymbolInfo`**: 通过 `publicAdapter` 获取交易对的精度、最小下单量等元数据（利用缓存机制）。
2.  **参数校验 (`validateOrderParams`)**: 检查订单类型、价格、数量、交易对状态等基本参数的合法性。
3.  **获取账户状态**: 并发获取当前余额和持仓信息。
4.  **余额校验 (`validateBalance`)**: 根据订单类型（开/平仓、现货/合约）计算所需资金或持仓，并与可用余额进行比较。
5.  **参数格式化 (`formatOrderParams`)**: 根据 `SymbolInfo` 中的精度要求，对下单价格和数量进行对齐和截断。
6.  **执行下单 (`doPlaceOrder`)**: 调用由子类实现的、针对特定交易所的下单方法。
7.  **返回统一结果**: 将交易所的原始响应包装成统一的 `Result<Order>` 格式。

## 4. 核心接口 (I/O)

### 4.1. `IPublicAdapter` (公共接口)

```typescript
interface IPublicAdapter {
  readonly exchange: Exchange;

  // 获取单个交易对的详细信息 (精度、最小/最大下单量等)
  getSymbolInfo(symbol: string, tradeType: TradeType): Promise<Result<SymbolInfo>>;

  // 获取指定市场的所有交易对
  getAllSymbols(tradeType: TradeType): Promise<Result<SymbolInfo[]>>;

  // 获取最新市场价
  getPrice(symbol: string, tradeType: TradeType): Promise<Result<string>>;

  // 获取标记价格 (仅合约)
  getMarkPrice(symbol: string, tradeType: TradeType): Promise<Result<string>>;
}
```

### 4.2. `ITradeAdapter` (交易接口)

```typescript
interface ITradeAdapter extends IPublicAdapter {
  // 账户信息
  getBalance(tradeType: TradeType): Promise<Result<Balance[]>>;
  getPositions(symbol?: string, tradeType?: TradeType): Promise<Result<Position[]>>;

  // 交易操作
  placeOrder(params: PlaceOrderParams): Promise<Result<Order>>;
  cancelOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Result<Order>>;
  placeOrders(paramsList: PlaceOrderParams[]): Promise<BatchPlaceOrderResult>;

  // 订单查询
  getOrder(symbol: string, orderId: string, tradeType: TradeType): Promise<Result<Order>>;
  getOpenOrders(symbol?: string, tradeType?: TradeType): Promise<Result<Order[]>>;
  
  // 其他
  setLeverage(symbol: string, leverage: number, tradeType: TradeType, positionSide?: PositionSide): Promise<Result<void>>;
}
```

## 5. 核心数据结构

### `Result<T, E>`
```typescript
type Result<T, E = ErrorInfo> =
  | { ok: true; data: T }
  | { ok: false; error: E };

interface ErrorInfo {
  code: string;
  message: string;
  raw?: unknown;
}
```

### `SymbolInfo`
```typescript
interface SymbolInfo {
  symbol: string;           // 统一格式: BTC-USDT
  rawSymbol: string;        // 交易所原始格式
  baseCurrency: string;     // 基础货币: BTC
  quoteCurrency: string;    // 计价货币: USDT
  tradeType: TradeType;
  tickSize: string;         // 价格精度 (最小变动单位)
  stepSize: string;         // 数量精度 (最小变动单位)
  minQty: string;           // 最小下单数量
  maxQty: string;           // 最大下单数量
  status: SymbolStatus;     // 交易对状态 (1: 可用)
}
```

### `PlaceOrderParams`
```typescript
interface PlaceOrderParams {
  symbol: string;
  tradeType: TradeType;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market' | 'maker-only';
  quantity: number | string;
  price?: number | string;
  positionSide?: 'long' | 'short'; // 合约必填
  leverage?: number;
}
```

### `Order`
```typescript
interface Order {
  orderId: string;
  symbol: string;
  tradeType: TradeType;
  side: 'buy' | 'sell';
  status: 'open' | 'filled' | 'canceled' | 'rejected' ...;
  price: string;      // 下单价格
  avgPrice: string;   // 成交均价
  quantity: string;   // 下单数量
  filledQty: string;  // 已成交数量
}
```

## 6. 扩展性

要集成一个新的交易所，开发者需要完成以下步骤：

1.  **实现 `NewExchangePublicAdapter`**:
    - 继承 `BasePublicAdapter`。
    - 实现与交易所 API 对接的 `fetchSymbolInfo`, `fetchSymbols`, `_fetchPrice` 等方法。
    - 实现 `toRawSymbol` 和 `fromRawSymbol` 进行交易对格式转换。

2.  **实现 `NewExchangeTradeAdapter`**:
    - 继承 `BaseTradeAdapter`。
    - 实现 `getBalance`, `getPositions`, `cancelOrder`, `getOrder` 等与私有账户相关的 API 调用。
    - 实现核心的 `doPlaceOrder` (单个下单) 和 `doBatchPlaceOrder` (批量下单) 方法。

3.  **注册到工厂函数**: 在 `src/index.ts` 的工厂函数中添加新的 `case`，使其可以通过 `createPublicAdapter('new-exchange')` 被实例化。

## 7. 工具函数

项目提供了一系列经过良好测试的工具函数，用于处理常见的计算和格式化任务：

-   `formatPrice(price, tickSize)`: 按价格精度格式化。
-   `formatQuantity(quantity, stepSize)`: 按数量精度格式化。
-   `parseUnifiedSymbol(symbol)`: 解析统一格式的 Symbol。
-   `generateClientOrderId(exchange)`: 生成唯一的客户端订单 ID。
-   `wrapAsync(...)`: 将 Promise 包装成 `Result` 对象。
