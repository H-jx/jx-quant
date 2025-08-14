import { CircularQueue } from "../common/CircularQueue";
import { Kline, Indicator } from "../interface";
import { keepDecimalFixed } from "../util";

export class VRI implements Indicator<Kline> {
  private readonly period: number;
  private buffer: CircularQueue<Kline>;
  result: CircularQueue<number>;
  maxHistoryLength = 120;

  constructor({ period }: { period: number }) {
    this.period = period;
    this.buffer = new CircularQueue<Kline>(period);
    this.result = new CircularQueue<number>(this.maxHistoryLength);
  }

  private calcTrueRange(curr: Kline, prevClose: number): number {
    const highLow = curr.high - curr.low;
    const highClose = Math.abs(curr.high - prevClose);
    const lowClose = Math.abs(curr.low - prevClose);
    return Math.max(highLow, highClose, lowClose);
  }

  add(data: Kline): void {
    this.buffer.push(data);
    if (this.buffer.size() === this.period) {
        this.result.push(this.calcVRI());
    }
  }
  
  updateLast(data: Kline): void {
    if (this.buffer.size() > 0) {
      this.buffer.update(this.buffer.size() - 1, data);
      if (this.buffer.size() === this.period) {
        this.result.update(this.result.size() - 1, this.calcVRI());
      }
    }
  }

  private calcVRI(): number {

    let totalTR = 0;
    for (let i = 0; i < this.buffer.size(); i++) {
      const curr = this.buffer.get(i);
      const prevClose = i === 0 ? curr.open : this.buffer.get(i - 1).close;
      totalTR += this.calcTrueRange(curr, prevClose);
    }
  
    const netMove = Math.abs(this.buffer.get(this.buffer.size()- 1).close - this.buffer.get(0).open) || 1e-6;
    const ratio = Math.min(1, netMove / totalTR);
    return keepDecimalFixed((1 - ratio) * 100, 2);
  }
  getValue(index = -1): number {
    if (index < 0) {
        return this.result.get(this.result.size() + index);
      }
      return this.result.get(index);
  }
}
