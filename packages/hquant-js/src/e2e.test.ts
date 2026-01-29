import assert from "node:assert/strict";
import test from "node:test";

import { FuturesBacktest, HQuant } from "./index.js";

const hasNative = !!process.env.HQUANT_NATIVE_PATH;

test("e2e: addStrategy + futures backtest", { skip: !hasNative }, () => {
  const hq = new HQuant(64);
  hq.addRsi(3);

  const dsl = `
    IF RSI(3) < 30 THEN BUY
    IF RSI(3) > 70 THEN SELL
  `;
  const sid = hq.addStrategy("s", dsl);
  assert.ok(sid > 0);

  const bt = new FuturesBacktest({
    initialMargin: 1000,
    leverage: 10,
    contractSize: 1,
    makerFeeRate: 0.0004,
    takerFeeRate: 0.0004,
    maintenanceMarginRate: 0.005,
  });

  // Drive RSI low, then high.
  let close = 100;
  for (let i = 0; i < 40; i++) {
    close -= 1;
    hq.pushBar({
      timestamp: i,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    });
    for (const sig of hq.pollSignals()) {
      bt.applySignal(sig.action, close, 100);
    }
  }
  for (let i = 40; i < 80; i++) {
    close += 1;
    hq.pushBar({
      timestamp: i,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    });
    for (const sig of hq.pollSignals()) {
      bt.applySignal(sig.action, close, 100);
    }
  }

  const r = bt.result(close);
  assert.ok(Number.isFinite(r.equity));
  assert.ok(Number.isFinite(r.profit));
});

