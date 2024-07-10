import { CircularQueue } from "../common/CircularQueue";
import { Kline, Indicator } from "../interface";
import { keepDecimalFixed } from "../util";
import { MA } from "./ma";


/**
 * boll指标
 */
export class BOLL implements Indicator {
  private ma: MA;
  private stdDevQueue: CircularQueue<number>;
  private upperBand: CircularQueue<number>;
  private midBand: CircularQueue<number>;
  private lowerBand: CircularQueue<number>;
  private stdDevFactor: number;
  maxHistoryLength = 1000;

  constructor({period, stdDevFactor, maxHistoryLength}: {period: number, stdDevFactor: number, maxHistoryLength?: number}) {
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.ma = new MA({period, maxHistoryLength: this.maxHistoryLength, key: undefined});
    this.stdDevQueue = new CircularQueue(period);
    this.upperBand = new CircularQueue(this.maxHistoryLength);
    this.midBand = new CircularQueue(this.maxHistoryLength);
    this.lowerBand = new CircularQueue(this.maxHistoryLength);
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
      up: keepDecimalFixed(this.upperBand.get(i), 4),
      mid: keepDecimalFixed(this.midBand.get(i), 4),
      low: keepDecimalFixed(this.lowerBand.get(i), 4)
    };
  }

  private calculateStdDev(): number {
    const values = this.stdDevQueue.toArray();
    const validValues = values.filter(v => v != null);
    if (validValues.length < this.stdDevFactor) {
      return NaN;
    }
    const avg = this.ma.getValue(-1);
    const squareDiffs = values.map(value => {
      const diff = value - avg;
      return diff * diff;
    });
    const avgSquareDiff =
      squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }
}