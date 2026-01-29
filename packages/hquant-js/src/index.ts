import { createRequire } from "node:module";

export type Bar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume?: number;
};

export type Signal = {
  strategyId: number;
  action: "BUY" | "SELL" | "HOLD";
  timestamp: number;
};

export type BacktestParams = {
  initialMargin: number;
  leverage: number;
  contractSize: number;
  makerFeeRate: number;
  takerFeeRate: number;
  maintenanceMarginRate: number;
};

export type BacktestResult = {
  equity: number;
  profit: number;
  profitRate: number;
  maxDrawdownRate: number;
  liquidated: boolean;
};

export type ColumnF64 = {
  buffer: ArrayBuffer;
  capacity: number;
  len: number;
  head: number;
};

type Native = {
  HQuant: new (capacity: number) => {
    addRsi(period: number): number;
    addEmaClose(period: number): number;
    addStrategy(name: string, dsl: string): number;
    pushBar(bar: Bar): void;
    updateLastBar(bar: Bar): void;
    indicatorLast(id: number): { kind: number; a: number; b: number; c: number };
    pollSignals(): Signal[];
    len(): number;
    capacity(): number;
    closeColumn(): ColumnF64;
    openColumn(): ColumnF64;
    highColumn(): ColumnF64;
    lowColumn(): ColumnF64;
    volumeColumn(): ColumnF64;
    buyVolumeColumn(): ColumnF64;
  };
  MultiHQuant: new (capacity: number, periods: string[]) => {
    feedBar(bar: Bar): void;
    flush(): void;
    addMultiStrategy(name: string, dsl: string): number;
    pollSignals(): Signal[];
  };
  FuturesBacktest: new (params: {
    initialMargin: number;
    leverage: number;
    contractSize: number;
    makerFeeRate: number;
    takerFeeRate: number;
    maintenanceMarginRate: number;
  }) => {
    applySignal(action: "BUY" | "SELL" | "HOLD", price: number, margin: number): void;
    onPrice(price: number): void;
    result(price: number): BacktestResult;
  };
};

function loadNative(): Native {
  const req = createRequire(import.meta.url);
  const explicit = process.env.HQUANT_NATIVE_PATH;
  if (explicit) {
    return req(explicit) as Native;
  }
  throw new Error(
    [
      "hquant-js: missing native binding.",
      "Build `packages/hquant-node` and set `HQUANT_NATIVE_PATH` to the produced .node/.dylib file (renamed to .node).",
      "Example (macOS):",
      "  packages/hquant-node/scripts/dev-build-macos.sh",
      "  export HQUANT_NATIVE_PATH=$PWD/hquant.node",
    ].join("\n"),
  );
}

let native: Native | null = null;

function nativeOrThrow(): Native {
  if (native) return native;
  native = loadNative();
  return native;
}

export class HQuant {
  private readonly inner: InstanceType<Native["HQuant"]>;

  constructor(capacity: number) {
    this.inner = new (nativeOrThrow().HQuant)(capacity);
  }

  addRsi(period: number): number {
    return this.inner.addRsi(period);
  }

  addEmaClose(period: number): number {
    return this.inner.addEmaClose(period);
  }

  addStrategy(name: string, dsl: string): number {
    return this.inner.addStrategy(name, dsl);
  }

  pushBar(bar: Bar): void {
    this.inner.pushBar(bar);
  }

  updateLastBar(bar: Bar): void {
    this.inner.updateLastBar(bar);
  }

  indicatorLast(id: number): { kind: number; a: number; b: number; c: number } {
    return this.inner.indicatorLast(id);
  }

  pollSignals(): Signal[] {
    return this.inner.pollSignals();
  }

  len(): number {
    return this.inner.len();
  }

  capacity(): number {
    return this.inner.capacity();
  }

  closeColumn(): ColumnF64 {
    return this.inner.closeColumn();
  }

  openColumn(): ColumnF64 {
    return this.inner.openColumn();
  }

  highColumn(): ColumnF64 {
    return this.inner.highColumn();
  }

  lowColumn(): ColumnF64 {
    return this.inner.lowColumn();
  }

  volumeColumn(): ColumnF64 {
    return this.inner.volumeColumn();
  }

  buyVolumeColumn(): ColumnF64 {
    return this.inner.buyVolumeColumn();
  }
}

export class MultiHQuant {
  private readonly inner: InstanceType<Native["MultiHQuant"]>;

  constructor(capacity: number, periods: string[]) {
    this.inner = new (nativeOrThrow().MultiHQuant)(capacity, periods);
  }

  feedBar(bar: Bar): void {
    this.inner.feedBar(bar);
  }

  flush(): void {
    this.inner.flush();
  }

  addMultiStrategy(name: string, dsl: string): number {
    return this.inner.addMultiStrategy(name, dsl);
  }

  pollSignals(): Signal[] {
    return this.inner.pollSignals();
  }
}

export class FuturesBacktest {
  private readonly inner: InstanceType<Native["FuturesBacktest"]>;

  constructor(params: BacktestParams) {
    this.inner = new (nativeOrThrow().FuturesBacktest)(params);
  }

  applySignal(action: "BUY" | "SELL" | "HOLD", price: number, margin: number): void {
    this.inner.applySignal(action, price, margin);
  }

  onPrice(price: number): void {
    this.inner.onPrice(price);
  }

  result(price: number): BacktestResult {
    return this.inner.result(price);
  }
}

// Helpers for ring-buffer column ordering (zero-copy; may return 2 views).
export function orderedF64Slices(col: ColumnF64): [Float64Array, Float64Array] {
  if (col.len <= 0 || col.capacity <= 0) return [new Float64Array(), new Float64Array()];
  const cap = col.capacity | 0;
  const len = col.len | 0;
  const head = col.head | 0;
  const start = (head + cap - len) % cap;
  const end = start + len;
  const buf = col.buffer;
  if (end <= cap) {
    return [new Float64Array(buf, start * 8, len), new Float64Array(buf, 0, 0)];
  }
  return [new Float64Array(buf, start * 8, cap - start), new Float64Array(buf, 0, end - cap)];
}
