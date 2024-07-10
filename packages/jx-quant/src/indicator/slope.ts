import { CircularQueue } from "../common/CircularQueue";
import { Kline, Indicator } from "../interface";


export enum KlineState {
  /** 减速上涨（一阶导数为正且逐渐减小，二阶导数为负） */
  DeceleratingRise = 2,
  /** 加速上涨（一阶导数为正且逐渐增大，二阶导数为正） */
  AcceleratingRise = 3,
  /**  匀速上涨（一阶导数为正且稳定，二阶导数为零） */
  UniformRise = 1,
  /** 无涨幅 */
  Uniform = 0,
  /** 匀速下跌（一阶导数为负且稳定，二阶导数为零） */
  UniformFall = -1,
  /** 加速下跌（一阶导数为负且逐渐减小，二阶导数为负） */
  AcceleratingFall = -3,
  /** 减速下跌（一阶导数为负且逐渐增大，二阶导数为正） */
  DeceleratingFall = -2,

}

const firstDerivative = (y2: number, y1: number, x2: number, x1: number) => (y2 - y1) / (x2 - x1);
const secondDerivative = (firstDerivative2: number, firstDerivative1: number, x2: number, x1: number) => (firstDerivative2 - firstDerivative1) / (x2 - x1);

function selectSixPoints(kLines: number[], count = 4): number[] {
  if (kLines.length < count) {
    return kLines;
  }

  const selectedPoints: number[] = [kLines[kLines.length - 1]]; // 最后一个点  
  // 计算初始间隔，并尝试调整以确保能取到足够的点  
  const interval = Math.max(1, Math.floor((kLines.length - 1) / (count - 1)));
  let currentIndex = kLines.length - 1 - interval;

  // 尝试添加剩余的点，尽可能保持平均间隔  
  while (currentIndex > 0 && selectedPoints.length < count) {
    selectedPoints.unshift(kLines[currentIndex]);
    currentIndex -= interval;
  }
  return selectedPoints;
}

function calculatePairwiseAverage(data: number[]): number[] {  
  const result: number[] = [];  
    
  // 遍历数组中的每对相邻元素  
  for (let i = 1; i < data.length; i++) {  
    // 计算平均值并添加到结果数组中  
    const average = (data[i - 1] + data[i]) / 2;  
    result.push(average);  
  }  
    
  return result;  
}  
/**
 * 斜率指标
 * period要保证是奇数
 */
export class Slope implements Indicator {
  buffer: CircularQueue<number>;
  period: number;
  result: CircularQueue<number>;
  maxHistoryLength = 1000;
  slopeTolerant = 0.2;
  key: keyof Kline;

  constructor({ maxHistoryLength, key, period, slopeTolerant }: { period: number, maxHistoryLength?: number; key?: keyof Kline, slopeTolerant?: number }) {
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.slopeTolerant = slopeTolerant || 0.2;
    this.period = period;
    this.key = key || 'close';
    this.buffer = new CircularQueue(this.period); // Additional space for the previous value
    this.result = new CircularQueue(this.maxHistoryLength);
  }

  private calculateSlope(): number {
    if (this.buffer.size() < this.period) {
      return KlineState.Uniform; // Not enough data to determine the state
    }

    const firstDerivatives: number[] = [];
    const secondDerivatives: number[] = [];
    const buffers = this.buffer.toArray();
    const filters = selectSixPoints(calculatePairwiseAverage(buffers), 3);
    
    let max = buffers[0];
    let min = buffers[0];
    for (let i = 1; i < buffers.length; i++) {
      if (buffers[i] > max) {
        max = buffers[i]
      }
      if (buffers[i] < min) {
        min = buffers[i]
      }
    }

    const DIS = max - min;

    for (let i = 1; i < filters.length; i++) {
      const firstDerivativeValue = firstDerivative(
        filters[i],
        filters[i - 1],
        i,
        i - 1
      );
      firstDerivatives.push(firstDerivativeValue);
    }
    for (let i = 1; i < firstDerivatives.length; i++) {
      const secondDerivativeValue = secondDerivative(
        firstDerivatives[i],
        firstDerivatives[i - 1],
        i,
        i - 1
      );
      secondDerivatives.push(secondDerivativeValue);
    }

    // const avgChange = firstDerivatives.reduce((sum, derivative) => sum + derivative, 0) / firstDerivatives.length; 
    // const avgSlope = secondDerivatives.reduce((sum, derivative) => sum + derivative, 0) / secondDerivatives.length;
    const changeRage = (this.buffer.getLast() - this.buffer.get(0)) / this.buffer.get(0);
    const slopeValue = secondDerivatives[0] / DIS;
    const tolerant = 0.002;
    const slopeTolerant = this.slopeTolerant;


    // 增长
    if (changeRage > tolerant) {
      // return slopeValue
      // 加速增长
      if (slopeValue > slopeTolerant) {
        return KlineState.AcceleratingRise
      } else if (slopeValue < -slopeTolerant) {
        return KlineState.DeceleratingRise
      } else {
        return KlineState.UniformRise
      }
    } else if (changeRage < -tolerant) {
      // return slopeValue
      // 加速下跌(凸)
      if (slopeValue < -slopeTolerant) {
        return KlineState.AcceleratingFall
      } else if (slopeValue > slopeTolerant) {
        // 减速下跌(凹)
        return KlineState.DeceleratingFall
      } else {
        return KlineState.UniformFall
      }
    } else {
      return KlineState.Uniform;
    }
  }

  add(data: Kline | number) {
    const value = typeof data === 'number' ? data : data[this.key];
    if (typeof value !== 'number') {
      console.warn(value, this.key, data);
    }

    this.buffer.push(value);

    const slope = this.calculateSlope();
    this.result.push(slope);
    return slope;
  }

  updateLast(data: Kline | number) {
    const value = typeof data === 'number' ? data : data[this.key];
    this.buffer.update(this.buffer.size() - 1, value);

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

