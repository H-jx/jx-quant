import { CircularQueue } from "../common/CircularQueue";
import { Kline, Indicator } from "../interface";

/**
 * LongShortRatio指标
 */
export class LongShortRatio implements Indicator {
  private longProfitQueue: CircularQueue<number>;
  private shortProfitQueue: CircularQueue<number>;
  private period: number;
  private shortRatio: number;
  maxHistoryLength = 120;

  constructor({ period, shortRatio, maxHistoryLength }: { period: number, shortRatio: number, maxHistoryLength?: number }) {
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.longProfitQueue = new CircularQueue(this.maxHistoryLength);
    this.shortProfitQueue = new CircularQueue(this.maxHistoryLength);
    this.period = period;
    this.shortRatio = shortRatio;
  }

  add(data: Kline): void {
    const longProfit = this.calculateLongProfit(data.close);
    const shortProfit = this.calculateShortProfit(data.close);

    this.longProfitQueue.push(longProfit);
    this.shortProfitQueue.push(shortProfit);
  }

  updateLast(data: Kline): void {
    const longProfit = this.calculateLongProfit(data.close);
    const shortProfit = this.calculateShortProfit(data.close);
    const lastIndex = this.longProfitQueue.size() - 1;

    this.longProfitQueue.update(lastIndex, longProfit);
    this.shortProfitQueue.update(lastIndex, shortProfit);
  }

  getValue(index = -1): number {
    const i = index < 0 ? this.longProfitQueue.size() + index : index;
    const longProfit = this.longProfitQueue.get(i);
    const shortProfit = this.shortProfitQueue.get(i);

    const adjustedShortProfit = longProfit * this.shortRatio;
    if (adjustedShortProfit >= shortProfit) {
      return -1;
    } else {
      return 1;
    }
  }

  private calculateLongProfit(currentPrice: number): number {
    const highestPrice = Math.max(...this.longProfitQueue.toArray().slice(-this.period));
    return ((currentPrice - highestPrice) / highestPrice) * 100;
  }

  private calculateShortProfit(currentPrice: number): number {
    const lowestPrice = Math.min(...this.shortProfitQueue.toArray().slice(-this.period));
    return ((lowestPrice - currentPrice) / lowestPrice) * 100;
  }
}
