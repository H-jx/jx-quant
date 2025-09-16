
import { CircularQueue } from "../common/CircularQueue";
import { TypedRingBuffer } from "../common/TypedRingBuffer";
import { Kline, Indicator } from "../interface";
import { keepDecimalFixed } from "../util";

/**
 * VRI 量比指标：当前周期成交量与历史平均成交量的比值
 */
export class VRI implements Indicator<Kline> {
  private readonly period: number;
  private buffer: CircularQueue<Kline>;
  result: TypedRingBuffer;
  maxHistoryLength = 120;

  constructor({ period }: { period: number }) {
    this.period = period;
    this.buffer = new CircularQueue<Kline>(period);
    this.result = new TypedRingBuffer('float', this.maxHistoryLength);
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

  /**
   * 量比 = 当前周期成交量 / 历史平均成交量
   */
  private calcVRI(): number {
    const size = this.buffer.size();
    if (size < 2) return 0;
    let currVolume = 0;
    let sumVolume = 0;
    for (let i = 0; i < size; i++) {
      const v = this.buffer.get(i).volume;
      if (i === size - 1) {
        currVolume = v;
      } else {
        sumVolume += v;
      }
    }
    const avgVolume = sumVolume / (size - 1);
    const ratio = avgVolume > 0 ? currVolume / avgVolume : 0;
    return keepDecimalFixed(ratio, 2);
  }

  getValue(index = -1): number {
    if (index < 0) {
      return this.result.get(this.result.size() + index);
    }
    return this.result.get(index);
  }
}
