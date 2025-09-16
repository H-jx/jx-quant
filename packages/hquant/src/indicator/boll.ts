import { TypedRingBuffer } from "../common/TypedRingBuffer";
import { Kline, Indicator } from "../interface";
import { keepDecimalFixed } from "../util";
import { MA } from "./ma";


/**
 * boll指标
 */
export class BOLL implements Indicator {
  private ma: MA;
  private stdDevQueue: TypedRingBuffer;
  private upperBand: TypedRingBuffer;
  private midBand: TypedRingBuffer;
  private lowerBand: TypedRingBuffer;
  private stdDevFactor: number;
  maxHistoryLength = 120;

  constructor({ period, stdDevFactor, maxHistoryLength }: { period: number, stdDevFactor: number, maxHistoryLength?: number }) {
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.ma = new MA({ period, maxHistoryLength: this.maxHistoryLength, key: undefined });
    this.stdDevQueue = new TypedRingBuffer('float', period);
    this.upperBand = new TypedRingBuffer('float', this.maxHistoryLength);
    this.midBand = new TypedRingBuffer('float', this.maxHistoryLength);
    this.lowerBand = new TypedRingBuffer('float', this.maxHistoryLength);
    this.stdDevFactor = stdDevFactor;
  }

  add(data: Kline): void {
    const maValue = this.ma.add(data.close);
    this.stdDevQueue.push(data.close);
    const stdDev = this.calculateStdDev();
    if (isNaN(stdDev)) {
      this.upperBand.push(NaN);
      this.midBand.push(NaN);
      this.lowerBand.push(NaN);
    } else {
      const upperBand = maValue + this.stdDevFactor * stdDev;
      const midBand = maValue;
      const lowerBand = maValue - this.stdDevFactor * stdDev;
      this.upperBand.push(upperBand);
      this.midBand.push(midBand);
      this.lowerBand.push(lowerBand);
    }
  }

  updateLast(data: Kline): void {
    const maValue = this.ma.updateLast(data.close);
    const stdDev = this.calculateStdDev();
    if (isNaN(stdDev)) {
      const lastIndex = this.upperBand.size() - 1;
      this.upperBand.update(lastIndex, NaN);
      this.midBand.update(lastIndex, NaN);
      this.lowerBand.update(lastIndex, NaN);
    } else {
      const upperBand = maValue + this.stdDevFactor * stdDev;
      const midBand = maValue;
      const lowerBand = maValue - this.stdDevFactor * stdDev;
      const lastIndex = this.upperBand.size() - 1;
      this.upperBand.update(lastIndex, upperBand);
      this.midBand.update(lastIndex, midBand);
      this.lowerBand.update(lastIndex, lowerBand);
    }
  }

  getValue(index = -1) {
    const i = index < 0 ? this.upperBand.size() + index : index;
    return {
      up: keepDecimalFixed(this.upperBand.get(i) || NaN, 4),
      mid: keepDecimalFixed(this.midBand.get(i) || NaN, 4),
      low: keepDecimalFixed(this.lowerBand.get(i) || NaN, 4)
    };
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