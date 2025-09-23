import { CircularQueue } from "../common/CircularQueue";
import { TypedRingBuffer } from "../common/TypedRingBuffer";
import { Kline, Indicator } from "../interface";

/**
 * 平均真实波幅（ATR）指标
 */
export class ATR implements Indicator {
  buffer: CircularQueue<Kline>;
  period: number;
  result: TypedRingBuffer;
  maxHistoryLength = 120;

  constructor({ period, maxHistoryLength }: { period: number; maxHistoryLength?: number }) {
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.period = period;
    this.buffer = new CircularQueue<Kline>(period);
    this.result = new TypedRingBuffer('float', this.maxHistoryLength);
  }

  // 计算单个K线的真实波幅
  private getTrueRange(curr: Kline, prev?: Kline): number {
    if (!prev) return curr.high - curr.low;
    return Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
  }
  calc(): number {
    let trSum = 0;
    for (let i = 0; i < this.period; i++) {
      const curr = this.buffer.get(i);
      const prev = i > 0 ? this.buffer.get(i - 1) : undefined;
      trSum += this.getTrueRange(curr, prev);
    }
    const atr = trSum / this.period;
    return atr;
  }
  add(data: Kline) {
    this.buffer.push(data);
    if (this.buffer.size() < this.period) {
      this.result.push(NaN);
      return;
    }
    this.result.push(this.calc());
  }

  updateLast(data: Kline) {
    if (this.buffer.size() === 0) return;
    this.buffer.update(this.buffer.size() - 1, data);
    this.result.update(this.result.size() - 1, this.calc());
  }

  getValue(index: number = -1): number {
    return this.result.get(index < 0 ? this.result.size() - 1 : index);
  }
}
