import { CircularQueue } from "../common/CircularQueue";
import { Kline, Indicator } from "../interface";
import { autoToFixed } from "../util";

/**
 * 均线指标
 */
export class MA implements Indicator {
  buffer: CircularQueue<number>;
  period: number;
  result: CircularQueue<number>;
  maxHistoryLength = 1000;
  key: keyof Kline;
  constructor({period, maxHistoryLength, key}: {period: number, maxHistoryLength?: number, key?: keyof Kline}) {
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.period = period;
    this.key = key || 'close';
    this.buffer = new CircularQueue(period);
    this.result = new CircularQueue(this.maxHistoryLength);
  }

  getPeriodSum(): number {
    let sum = 0;
    //  最新的period个数据求和
    for (let i = 0; i < this.buffer.size(); i++) {
      const value = this.buffer.get(i) || 0;
      sum += value
    }
    return sum;
  }
  add(data: Kline | number) {
    const value = typeof data === 'number' ? data : data[this.key];
    if (typeof value !== 'number') {
      console.warn(value, this.key, data)
    }
    // 添加到临时数组中
    this.buffer.push(value);

    const size = Math.min(this.period, this.buffer.size());
    const ma = this.buffer.size() < this.period ? NaN : this.getPeriodSum() / size;
 
    this.result.push(ma);
    return ma;
  }

  updateLast(data: Kline | number) {
    const value = typeof data === 'number' ? data : data[this.key];
    this.buffer.update(this.buffer.size() - 1, value);
    const size = Math.min(this.period, this.buffer.size());
    const ma = this.getPeriodSum() / size;
    // 更新最后一个
    this.result.update(this.result.size() - 1, ma);
    return ma;
  }

  getValue(index = -1): number {
    if (index < 0) {
      return this.result.get(this.result.size() + index);
    }
    return this.result.get(index);
  }
}