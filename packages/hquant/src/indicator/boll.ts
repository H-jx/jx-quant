import { RingDataFrame } from "../common/RingDataFrame";
import { TypedRingBuffer } from "../common/TypedRingBuffer";
import { Kline, Indicator } from "../interface";
import { keepDecimalFixed } from "../util";
import { MA } from "./ma";

export type BOLLResult = {
  up: number;
  mid: number;
  low: number;
}
/**
 * boll指标
 */
export class BOLL implements Indicator {
  private ma: MA;
  private stdDevQueue: TypedRingBuffer;
  private stdDevFactor: number;
  maxHistoryLength = 120;
  result: RingDataFrame<BOLLResult>;
  constructor({ period, stdDevFactor, maxHistoryLength }: { period: number, stdDevFactor: number, maxHistoryLength?: number }) {
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.ma = new MA({ period, maxHistoryLength: this.maxHistoryLength, key: undefined });
    this.stdDevQueue = new TypedRingBuffer('float', period);
    this.result = new RingDataFrame<BOLLResult>({
      up: 'float',
      mid: 'float',
      low: 'float'
    }, this.maxHistoryLength);
    this.stdDevFactor = stdDevFactor;
  }

  add(data: Kline): void {
    const maValue = this.ma.add(data.close);
    this.stdDevQueue.push(data.close);
    const stdDev = this.calculateStdDev();
    if (isNaN(stdDev)) {
      this.result.push({ up: NaN, mid: NaN, low: NaN });
    } else {
      const upperBand = maValue + this.stdDevFactor * stdDev;
      const midBand = maValue;
      const lowerBand = maValue - this.stdDevFactor * stdDev;
      this.result.push({ up: upperBand, mid: midBand, low: lowerBand });
    }
  }

  updateLast(data: Kline): void {
    const maValue = this.ma.updateLast(data.close);
    const stdDev = this.calculateStdDev();
    if (isNaN(stdDev)) {
      const lastIndex = this.result.length - 1;
      this.result.update(lastIndex, { up: NaN, mid: NaN, low: NaN });
    } else {
      const upperBand = maValue + this.stdDevFactor * stdDev;
      const midBand = maValue;
      const lowerBand = maValue - this.stdDevFactor * stdDev;
      const lastIndex = this.result.length - 1;
      this.result.update(lastIndex, { up: upperBand, mid: midBand, low: lowerBand });
    }
  }

  getValue(index = -1) {
    const i = index < 0 ? this.result.length + index : index;
    return this.result.get(i);
  }

  private calculateStdDev(): number {
    const size = this.stdDevQueue.size();
    if (size < this.stdDevFactor) {
      return NaN;
    }
    const avg = this.ma.getValue(-1);
    let sumSqDiff = 0;
    let count = 0;
    for (let i = 0; i < size; i++) {
      const value = this.stdDevQueue.get(i);
      if (value != null) {
        const diff = value - avg;
        sumSqDiff += diff * diff;
        count++;
      }
    }
    if (count === 0) return NaN;
    return Math.sqrt(sumSqDiff / count);
  }
}