# HB-Trader-Adapter Agent Documentation

## Project Overview

**Package Name**: `hb-trader-adapter`
**Version**: 0.1.0
**Purpose**: A multi-exchange trading adapter that abstracts away API differences between OKX and Binance, providing unified interfaces for quantitative trading strategies.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Application Layer (User Code)              │
├─────────────────────────────────────────────────────────┤
│  Public APIs (BinancePublicAdapter, OkxPublicAdapter)   │
├─────────────────────────────────────────────────────────┤
│     Base Classes (BasePublicAdapter, BaseTradeAdapter)  │
├─────────────────────────────────────────────────────────┤
│  Core Types, Utils, and Error Handling                  │
├─────────────────────────────────────────────────────────┤
│  Exchange SDKs (binance, okx-api)                       │
└─────────────────────────────────────────────────────────┘
```

### Design Patterns

- **Composition**: `TradeAdapter` composes a `PublicAdapter` for accessing public data
- **Strategy Pattern**: Exchange-specific mappers for type conversions
- **Registry Pattern**: Mappers for centralized type mappings
- **Result Pattern**: Go/Rust-style `Result<T, E>` for error handling instead of exceptions

## Project Structure

```
src/
├── core/                           # Core abstractions and utilities
│   ├── BasePublicAdapter.ts        # Abstract public API base class
│   ├── BaseTradeAdapter.ts         # Abstract trade API base class
│   ├── BaseWsUserDataAdapter.ts    # Abstract WebSocket adapter
│   ├── types.ts                    # Complete type definitions
│   ├── errorCodes.ts               # Unified error codes
│   ├── tools/
│   │   └── Cache.ts                # TTL-based cache utility
│   └── utils/
│       ├── math.ts                 # Decimal arithmetic
│       ├── result.ts               # Result<T,E> constructor functions
│       ├── symbol.ts               # Symbol parsing
│       ├── network.ts              # HTTP/SOCKS proxy agent
│       └── contract.ts             # Contract-specific utilities
│
├── exchanges/
│   ├── binance/
│   │   ├── PublicAdapter.ts        # Binance public API
│   │   ├── TradeAdapter.ts         # Binance trading API
│   │   ├── WsUserDataAdapter.ts    # Binance WebSocket
│   │   ├── mappers.ts              # Type mappers
│   │   └── utils.ts                # Symbol conversion, error extraction
│   │
│   └── okx/
│       ├── PublicAdapter.ts        # OKX public API
│       ├── TradeAdapter.ts         # OKX trading API
│       ├── WsUserDataAdapter.ts    # OKX WebSocket
│       ├── mappers.ts              # Type mappers
│       └── utils.ts                # Symbol conversion, error extraction
│
└── index.ts                        # Main entry point
```

## Core Components

### Base Classes

| Class | Location | Purpose |
|-------|----------|---------|
| `BasePublicAdapter` | `src/core/BasePublicAdapter.ts` | Public market data access with caching |
| `BaseTradeAdapter` | `src/core/BaseTradeAdapter.ts` | Trading operations with validation |
| `BaseWsUserDataAdapter` | `src/core/BaseWsUserDataAdapter.ts` | WebSocket event subscription |

### Exchange Implementations

| Component | Binance | OKX |
|-----------|---------|-----|
| Public Adapter | `exchanges/binance/PublicAdapter.ts` | `exchanges/okx/PublicAdapter.ts` |
| Trade Adapter | `exchanges/binance/TradeAdapter.ts` | `exchanges/okx/TradeAdapter.ts` |
| WebSocket Adapter | `exchanges/binance/WsUserDataAdapter.ts` | `exchanges/okx/WsUserDataAdapter.ts` |
| Mappers | `exchanges/binance/mappers.ts` | `exchanges/okx/mappers.ts` |

## Type System

### Result Pattern

```typescript
type Result<T, E = ErrorInfo> =
  | { ok: true; data: T }
  | { ok: false; error: E }

interface ErrorInfo {
  code: string
  message: string
  raw?: unknown
}
```

### Core Types

| Type | Values | Description |
|------|--------|-------------|
| `Exchange` | `'okx' \| 'binance'` | Supported exchanges |
| `TradeType` | `'spot' \| 'futures' \| 'delivery'` | Market categories |
| `OrderSide` | `'buy' \| 'sell'` | Order direction |
| `PositionSide` | `'long' \| 'short'` | Position direction |
| `OrderType` | `'limit' \| 'market' \| 'maker-only'` | Order types |
| `OrderStatus` | `'pending' \| 'open' \| 'partial' \| 'filled' \| 'canceled' \| 'rejected' \| 'expired'` | Order states |

### Symbol Format

| Exchange | Spot | Futures | Delivery |
|----------|------|---------|----------|
| Unified | `BTC-USDT` | `BTC-USDT` | `BTC-USDT` |
| Binance | `BTCUSDT` | `BTCUSDT` | `BTCUSD_PERP` |
| OKX | `BTC-USDT` | `BTC-USDT-SWAP` | `BTC-USDT-240329` |

## API Interfaces

### IPublicAdapter

```typescript
interface IPublicAdapter {
  readonly exchange: Exchange

  getSymbolInfo(symbol: string, tradeType: TradeType): Promise<Result<SymbolInfo>>
  getAllSymbols(tradeType: TradeType): Promise<Result<SymbolInfo[]>>
  getPrice(symbol: string, tradeType: TradeType): Promise<Result<string>>
  getMarkPrice(symbol: string, tradeType: TradeType): Promise<Result<string>>
  getTicker(symbol: string, tradeType: TradeType): Promise<Result<Ticker>>
  getOrderBook(symbol: string, tradeType: TradeType, limit?: number): Promise<Result<OrderBook>>
  toRawSymbol(symbol: string, tradeType: TradeType): string
  fromRawSymbol(rawSymbol: string, tradeType: TradeType): string
}
```

### ITradeAdapter

```typescript
interface ITradeAdapter extends IPublicAdapter {
  readonly publicAdapter: IPublicAdapter

  // Lifecycle
  init(): Promise<Result<void>>
  destroy(): Promise<void>
  loadSymbols(tradeType?: TradeType): Promise<Result<void>>

  // Account
  getBalance(tradeType: TradeType): Promise<Result<Balance[]>>
  getPositions(symbol?: string, tradeType?: TradeType): Promise<Result<Position[]>>

  // Orders
  placeOrder(params: PlaceOrderParams): Promise<Result<Order>>
  placeOrders(paramsList: PlaceOrderParams[]): Promise<BatchPlaceOrderResult>
  cancelOrder(symbol, orderId, tradeType): Promise<Result<Order>>
  getOrder(symbol, orderId, tradeType): Promise<Result<Order>>
  getOpenOrders(symbol?, tradeType?): Promise<Result<Order[]>>

  // Strategy Orders
  placeStrategyOrder(params: StrategyOrderParams): Promise<Result<StrategyOrder>>
  cancelStrategyOrder(symbol, algoId, tradeType): Promise<Result<StrategyOrder>>
  getStrategyOrder(algoId, tradeType): Promise<Result<StrategyOrder>>
  getOpenStrategyOrders(symbol?, tradeType?): Promise<Result<StrategyOrder[]>>

  // Leverage
  setLeverage(symbol, leverage, tradeType, positionSide?): Promise<Result<void>>
}
```

### IWsUserDataAdapter

```typescript
interface IWsUserDataAdapter {
  readonly exchange: Exchange

  isConnected(tradeType?: TradeType): boolean
  subscribe(options: WsSubscribeOptions, handler: WsEventHandler): Promise<void>
  unsubscribe(tradeType?: TradeType): Promise<void>
  on<T extends WsUserDataEvent['eventType']>(eventType: T, handler): void
  off<T extends WsUserDataEvent['eventType']>(eventType: T, handler): void
  close(): Promise<void>
}
```

## Usage Examples

### Public Market Data

```typescript
import { BinancePublicAdapter } from 'hb-trader-adapter'

const adapter = new BinancePublicAdapter()

const result = await adapter.getSymbolInfo('BTC-USDT', 'futures')
if (result.ok) {
  console.log(`Min Quantity: ${result.data.minQty}`)
  console.log(`Tick Size: ${result.data.tickSize}`)
}

const price = await adapter.getPrice('BTC-USDT', 'futures')
const ticker = await adapter.getTicker('ETH-USDT', 'futures')
const orderbook = await adapter.getOrderBook('BTC-USDT', 'spot', 20)
```

### Trading Operations

```typescript
import { OkxTradeAdapter } from 'hb-trader-adapter'

const adapter = new OkxTradeAdapter({
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret',
  passphrase: 'your_passphrase'
})

await adapter.init()

const result = await adapter.placeOrder({
  symbol: 'BTC-USDT',
  tradeType: 'futures',
  side: 'buy',
  orderType: 'limit',
  quantity: 0.01,
  price: 50000,
  positionSide: 'long'
})

if (result.ok) {
  console.log(`Order placed: ${result.data.orderId}`)
}
```

### WebSocket Real-Time Data

```typescript
import { BinanceWsUserDataAdapter } from 'hb-trader-adapter'

const wsAdapter = new BinanceWsUserDataAdapter({
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret'
})

await wsAdapter.subscribe(
  { tradeType: 'futures', autoReconnect: true },
  (event) => console.log('Event:', event)
)

wsAdapter.on('order', (event) => {
  console.log(`Order ${event.orderId} status: ${event.status}`)
})

wsAdapter.on('position', (event) => {
  console.log(`Position updated: ${event.symbol}`)
})
```

## Error Codes

| Category | Codes |
|----------|-------|
| General | `INVALID_PARAMS`, `SYMBOL_NOT_AVAILABLE`, `INVALID_TRADE_TYPE` |
| Balance | `INSUFFICIENT_BALANCE`, `INSUFFICIENT_POSITION` |
| Quantity | `QUANTITY_TOO_SMALL`, `QUANTITY_TOO_LARGE` |
| Orders | `PLACE_ORDER_ERROR`, `CANCEL_ORDER_ERROR`, `ORDER_NOT_FOUND` |
| Strategy | `PLACE_STRATEGY_ORDER_ERROR`, `TRIGGER_PRICE_INVALID` |
| Market Data | `SYMBOL_NOT_FOUND`, `PRICE_NOT_FOUND`, `TICKER_NOT_FOUND` |
| WebSocket | `WS_CONNECTION_ERROR`, `WS_AUTHENTICATION_ERROR` |

## Utility Functions

| Module | Functions |
|--------|-----------|
| `utils/math.ts` | `truncateDecimal`, `adjustByStep`, `formatPrice`, `formatQuantity` |
| `utils/symbol.ts` | `parseUnifiedSymbol`, `createUnifiedSymbol` |
| `utils/result.ts` | `Ok`, `Err`, `wrapAsync` |
| `utils/network.ts` | `createProxyAgent` |

## Feature Support Matrix

| Feature | Binance | OKX |
|---------|---------|-----|
| Spot Trading | ✅ | ✅ |
| USDM Futures | ✅ | ✅ |
| COINM Delivery | ✅ | ✅ |
| Limit Orders | ✅ | ✅ |
| Market Orders | ✅ | ✅ |
| Maker-Only Orders | ✅ | ✅ |
| Stop-Loss | ✅ | ✅ |
| Take-Profit | ✅ | ✅ |
| Trailing-Stop | ✅ | ✅ |
| WebSocket User Data | ✅ | ✅ |
| Batch Orders | ✅ (max 40) | ✅ (max 20) |
| HTTPS Proxy | ✅ | ✅ |
| SOCKS Proxy | ✅ | ✅ |
| Demo Trading | ✅ | ✅ |

## Extension Guide

To add a new exchange:

1. **Create Public Adapter** - Extend `BasePublicAdapter`
2. **Create Trade Adapter** - Extend `BaseTradeAdapter`
3. **Create WebSocket Adapter** - Extend `BaseWsUserDataAdapter`
4. **Create Mappers** - Define type conversions
5. **Create Utils** - Symbol conversion, error extraction
6. **Export** - Add to `src/index.ts`

## Build & Scripts

```bash
pnpm run build        # Compile TypeScript
pnpm run dev          # Watch mode
pnpm run test         # Run tests
pnpm run typecheck    # Type validation
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/core/types.ts` | All type definitions (~600 lines) |
| `src/core/BasePublicAdapter.ts` | Public API base class |
| `src/core/BaseTradeAdapter.ts` | Trade API base class (~400+ lines) |
| `src/core/BaseWsUserDataAdapter.ts` | WebSocket base class |
| `src/exchanges/binance/TradeAdapter.ts` | Binance implementation (~1200+ lines) |
| `src/exchanges/okx/TradeAdapter.ts` | OKX implementation (~700+ lines) |
