import { CircularQueue } from "../common/CircularQueue";
import { Kline, Indicator } from "../interface";

export enum KlineState {
  AcceleratingUp = 3,     // 加速上涨
  SteadyUp = 2,           // 匀速上涨
  DeceleratingUp = 1,     // 减速上涨
  AcceleratingDown = -3,  // 加速下跌
  SteadyDown = -2,        // 匀速下跌
  DeceleratingDown = -1,  // 减速下跌
  Mixed = 0               // 混合 / 无法归类
}



function calculatePrices(klineList: Kline[]): number[] {
  return klineList.map(k => (k.high + k.low + k.close) / 3);
}

export class Slope implements Indicator {
  buffer: CircularQueue<Kline>;
  result: CircularQueue<number>;
  period = 6;
  maxHistoryLength = 60;
  epsilon = 0.2;
  key: keyof Kline = 'close';

  constructor({
    epsilon,
    maxHistoryLength,
  }: {
    maxHistoryLength?: number;
    epsilon: number;
  }) {
    this.epsilon = epsilon;
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.buffer = new CircularQueue(3);
    this.result = new CircularQueue(this.maxHistoryLength);
  }

  private calculateSlope(): number {
    if (this.buffer.size() < this.period) {
      return KlineState.Mixed;
    }
    const raw = this.buffer.toArray();
    const prices = calculatePrices(raw);
    if (prices.length < 3) return KlineState.Mixed;

    const P0 = prices[0];
    const P1 = prices[Math.floor(prices.length / 2)];
    const P2= prices[prices.length - 1];
    const slope1 = P1 - P0;
    const slope2 = P2 - P1;
    const deltaSlope = slope2 - slope1;

    const epsilon = this.epsilon || 1e-6;

    const absS1 = Math.abs(slope1);
    const absS2 = Math.abs(slope2);

    const isUp = slope1 >= -epsilon && slope2 > epsilon;
    const isDown = slope1 <= epsilon && slope2 < -epsilon;

    if (isUp && absS1 > epsilon && absS2 > epsilon) {
      if (deltaSlope > epsilon) return KlineState.AcceleratingUp;
      if (Math.abs(deltaSlope) <= epsilon) return KlineState.SteadyUp;
      return KlineState.DeceleratingUp;
    }

    if (isDown && absS1 > epsilon && absS2 > epsilon) {
      if (deltaSlope < -epsilon) return KlineState.AcceleratingDown;
      if (Math.abs(deltaSlope) <= epsilon) return KlineState.SteadyDown;
      return KlineState.DeceleratingDown;
    }

    return KlineState.Mixed;
  }

  add(data: Kline) {

    this.buffer.push(data);
    const slope = this.calculateSlope();
    this.result.push(slope);
    return slope;
  }

  updateLast(data: Kline) {
    this.buffer.update(this.buffer.size() - 1, data);
    const slope = this.calculateSlope();
    this.result.update(this.result.size() - 1, slope);
    return slope;
  }

  getValue(index = -1): number {
    if (index < 0) {
      return this.result.get(this.result.size() + index);
    }
    return this.result.get(index);
  }
}
