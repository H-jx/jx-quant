import { TypedRingBuffer } from "../common/TypedRingBuffer";
import { Kline, Indicator } from "../interface";
import { keepDecimalFixed } from "../util";

//使用typscript实现 RSI指标算法并支持Indicator接口

export class RSI implements Indicator {
  private readonly period: number;
  private readonly values: TypedRingBuffer;
  private avgGain = 0;
  private avgLoss = 0;
  maxHistoryLength = 120;

  constructor({ period }: { period: number }) {
    this.period = period;
    this.values = new TypedRingBuffer('float', period)
  }

  add(data: Kline): void {
    const change = data.close - data.open;
    if (change > 0) {
      this.avgGain = (this.avgGain * (this.period - 1) + change) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1)) / this.period;
    } else {
      this.avgGain = (this.avgGain * (this.period - 1)) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) - change) / this.period;
    }

    const rs = this.avgGain / this.avgLoss;
    const rsi = keepDecimalFixed(100 - 100 / (1 + rs), 2);
    this.values.push(rsi);
  }

  updateLast(data: Kline): void {
    const change = data.close - data.open;
    let avgGain = 0;
    let avgLoss = 0;
    if (change > 0) {
      avgGain = (this.avgGain * (this.period - 1) + change) / this.period;
      avgLoss = (this.avgLoss * (this.period - 1)) / this.period;
    } else {
      avgGain = (this.avgGain * (this.period - 1)) / this.period;
      avgLoss = (this.avgLoss * (this.period - 1) - change) / this.period;
    }

    const rs = avgGain / avgLoss;
    const rsi = keepDecimalFixed(100 - 100 / (1 + rs), 2);
    if (this.values.size() > 1) {
      this.values.update(this.values.size() - 1, rsi)
    }
  }

  getValue(index = -1): number {
    if (index < 0) {
      return this.values.get(this.values.size() + index);
    }
    return this.values.get(index);
  }
}
