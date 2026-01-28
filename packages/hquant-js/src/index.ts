import { createRequire } from "node:module";
import * as path from "node:path";

export type Bar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buy_volume?: number;
};

export type Signal = {
  strategy_id: number;
  action: "BUY" | "SELL" | "HOLD";
  timestamp: number;
};

export type ColumnF64 = {
  buffer: ArrayBuffer;
  capacity: number;
  len: number;
  head: number;
};

type Native = {
  HQuant: new (capacity: number) => {
    add_rsi(period: number): number;
    add_ema_close(period: number): number;
    add_strategy(name: string, dsl: string): number;
    push_bar(bar: Bar): void;
    update_last_bar(bar: Bar): void;
    indicator_last(id: number): { kind: number; a: number; b: number; c: number };
    poll_signals(): Signal[];
    close_column(): ColumnF64;
  };
  MultiHQuant: new (capacity: number, periods: string[]) => {
    feed_bar(bar: Bar): void;
    flush(): void;
    add_multi_strategy(name: string, dsl: string): number;
    poll_signals(): Signal[];
  };
};

function loadNative(): Native {
  const req = createRequire(import.meta.url);
  const explicit = process.env.HQUANT_NATIVE_PATH;
  if (explicit) {
    return req(explicit) as Native;
  }
  // Convention: build `packages/hquant-node` and rename the cdylib to `hquant.node`,
  // then point HQUANT_NATIVE_PATH to it.
  //
  // We keep auto-discovery minimal to avoid brittle platform-specific paths.
  const guess = path.resolve(process.cwd(), "hquant.node");
  return req(guess) as Native;
}

const native = loadNative();

export class HQuant extends native.HQuant {}
export class MultiHQuant extends native.MultiHQuant {}

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
