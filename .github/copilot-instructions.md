# GitHub Copilot Instructions for jx-trader

This is a monorepo for quantitative trading, containing TypeScript and Rust packages.

## Project Structure & Architecture

- **Monorepo**: Managed with `pnpm` workspaces, `lerna`, and `turbo`.
- **`packages/hb-trader-adapter`**: Unified crypto exchange adapter (Binance, OKX).
  - **`PublicAdapter`**: No auth required (market data).
  - **`TradeAdapter`**: Auth required (trading, balances).
  - **Design**: Uses a `Result` pattern for errors, not exceptions.
- **`packages/hquant`**: TypeScript quantitative analysis framework.
  - **Core**: `Quant` class manages indicators, strategies, and signals.
  - **Performance**: Uses `CircularQueue` and `SharedObjectRingBuffer` for high-frequency data.
- **`packages/hquant-rust`** (`@hquant/core`): High-performance Rust core.
  - **Design**: Uses Struct of Arrays (SoA) for K-line data.
  - **Bindings**: Node.js (napi-rs) and Go.

## Critical Workflows

- **Build**: `pnpm build` (uses Turbo pipeline).
- **Test**: `pnpm test` (uses Jest/Vitest).
- **Lint**: `pnpm lint`.
- **Dev**: `pnpm dev`.

## Coding Conventions & Patterns

### 1. Error Handling (Adapter Layer)
Use the `Result` type from `hb-trader-adapter/src/core/types.ts`. Do not throw exceptions for API errors.

```typescript
// Correct
const result = await adapter.getPrice('BTC-USDT', 'swap');
if (result.ok) {
  console.log(result.data);
} else {
  console.error(result.error);
}

// Incorrect
try {
  const price = await adapter.getPrice(...); // This returns a Result object
} catch (e) { ... }
```

### 2. Symbol Naming
Always use the unified symbol format:
- **Spot**: `BTC-USDT`
- **Swap (Perp)**: `BTC-USDT-SWAP`
- **Futures**: `BTC-USDT-240329`

### 3. Adapter Usage
Use factory functions to create adapters.

```typescript
import { createPublicAdapter, createTradeAdapter } from '@jx-quant/etrader';

const publicAdapter = createPublicAdapter('binance');
const tradeAdapter = createTradeAdapter('okx', { apiKey: '...', ... });
```

### 4. Quant Strategy (hquant)
Strategies are event-driven callbacks attached to a `Quant` instance.

```typescript
import { Quant } from 'hquant';
const quant = new Quant({ maxHistoryLength: 240 });

quant.addStrategy('my-strategy', (indicators, bar) => {
  // Return signal string or null
  return indicators.get('rsi').getValue() < 30 ? 'BUY' : null;
});
```

### 5. Rust Core (hquant-rust)
When working in Rust, prefer SoA (Struct of Arrays) for K-line data to optimize cache locality.

```rust
// SoA Layout
pub struct KlineData {
    pub opens: Vec<f64>,
    pub closes: Vec<f64>,
    // ...
}
```

## Tech Stack
- **Languages**: TypeScript, Rust.
- **Runtime**: Node.js.
- **Build Tools**: Turbo, Lerna, tsup, napi-rs.
- **Testing**: Jest, Vitest.
