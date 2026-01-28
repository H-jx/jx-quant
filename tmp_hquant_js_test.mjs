import { HQuant, orderedF64Slices } from './packages/hquant-js/dist/index.js';

const hq = new HQuant(16);
hq.addRsi(3);
hq.addStrategy('s', 'IF RSI(3) < 30 THEN BUY');

for (let i = 0; i < 10; i++) {
  const c = 100 - i;
  hq.pushBar({ timestamp: i, open: c, high: c, low: c, close: c, volume: 1 });
}

console.log('signals', hq.pollSignals().slice(0, 3));

const col = hq.closeColumn();
const [a, b] = orderedF64Slices(col);
console.log('close', { cap: col.capacity, len: col.len, head: col.head, aLen: a.length, bLen: b.length });
