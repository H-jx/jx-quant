import { CircularQueue } from "../common/CircularQueue";
import { Kline, Indicator } from "../interface";
import { MA } from "./ma";

/**
 * MACD指标
 */
export class MACD implements Indicator {
  private shortTermMA: MA;
  private longTermMA: MA;
  private signalLineMA: MA;
  private macdLine: CircularQueue<number>;
  private signalLine: CircularQueue<number>;
  maxHistoryLength = 1000;

  constructor({ shortTermPeriod, longTermPeriod, signalLinePeriod, maxHistoryLength }: { shortTermPeriod: number, longTermPeriod: number, signalLinePeriod: number, maxHistoryLength?: number }) {
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.shortTermMA = new MA({ period: shortTermPeriod, maxHistoryLength: this.maxHistoryLength, key: undefined });
    this.longTermMA = new MA({ period: longTermPeriod, maxHistoryLength: this.maxHistoryLength, key: undefined });
    this.signalLineMA = new MA({ period: signalLinePeriod, maxHistoryLength: this.maxHistoryLength, key: undefined });
    this.macdLine = new CircularQueue(this.maxHistoryLength);
    this.signalLine = new CircularQueue(this.maxHistoryLength);
  }

  add(data: Kline): void {
    const shortTermMAValue = this.shortTermMA.add(data.close);
    const longTermMAValue = this.longTermMA.add(data.close);
    const macdValue = shortTermMAValue - longTermMAValue;
    this.macdLine.push(macdValue);

    if (this.macdLine.size() >= this.signalLineMA.getValue()) {
      const signalLineValue = this.signalLineMA.add(macdValue);
      this.signalLine.push(signalLineValue);
    }
  }

  updateLast(data: Kline): void {
    const shortTermMAValue = this.shortTermMA.updateLast(data.close);
    const longTermMAValue = this.longTermMA.updateLast(data.close);
    const macdValue = shortTermMAValue - longTermMAValue;
    const lastIndex = this.macdLine.size() - 1;
    this.macdLine.update(lastIndex, macdValue);

    if (this.macdLine.size() >= this.signalLineMA.getValue()) {
      const signalLineValue = this.signalLineMA.updateLast(macdValue);
      this.signalLine.update(lastIndex, signalLineValue);
    }
  }

  getValue(index = -1) {
    const i = index < 0 ? this.macdLine.size() + index : index;
    return {
      macd: this.macdLine.get(i),
      signalLine: this.signalLine.get(i),
    };
  }
}
