import { EventEmitter } from "events";
import { CircularQueue } from "./common/CircularQueue";
import { Kline, KlineIn, Indicator, Signal, Strategy } from "./interface";
import { autoToFixed } from "./util";


export class Quant<CustomData extends Kline = Kline> {
  static tramsformData(data: KlineIn[]): Kline[] {
    return data.map((item) => {
      return {
        open: autoToFixed(item.open),
        close: autoToFixed(item.close),
        low: autoToFixed(item.low),
        high: autoToFixed(item.high),
        volume: autoToFixed(item.volume),
        sell: item.sell ? autoToFixed(item.sell) : undefined,
        buy: item.buy ? autoToFixed(item.buy) : undefined,
        timestamp: item.timestamp,
      };
    });
  }
  // A map of technical indicators by name
  private indicators: Map<string, Indicator>;

  // A map of trading strategies by name
  private strategies: Map<string, Strategy<CustomData>>;

  private eventEmitter = new EventEmitter();

  history: CircularQueue<CustomData>;
  // The current data that the framework is processing
  currentData?: CustomData;
  private signals: Map<string, Signal>;
  private maxHistoryLength: number;
  // A constructor that initializes the maps
  constructor({ maxHistoryLength = 2000 } = {}) {
    this.indicators = new Map();
    this.strategies = new Map();
    this.signals = new Map();
    this.maxHistoryLength = maxHistoryLength;
    this.history = new CircularQueue<CustomData>(maxHistoryLength);
  }
  getSignal(name: string) {
    return this.signals.get(name);
  }
  getIndicator(name: string) {
    return this.indicators.get(name);
  }
  getIndicators() {
    return this.indicators;
  }
  getStrategies() {
    return this.strategies;
  }
  // A method that adds a technical indicator to the framework
  addIndicator(name: string, indicator: Indicator) {
    indicator.maxHistoryLength = this.maxHistoryLength;
    (indicator as any)._quant = this;
    this.indicators.set(name, indicator);
  }

  // A method that adds a trading strategy to the framework
  addStrategy(name: string, strategy: Strategy<CustomData>) {
    this.strategies.set(name, strategy);
  }

  // A method that removes a technical indicator from the framework
  removeIndicator(name: string) {
    this.indicators.delete(name);
  }

  // A method that removes a trading strategy from the framework
  removeStrategy(name: string) {
    this.strategies.delete(name);
  }
  /** 添加新数据 */
  addData(data: CustomData): void {
    // Add the new data to the history
    this.history.push(data);
    // Update the current data
    this.currentData = data;

    this.updateIndicators(data);
    this.updateStrategies();
  }
  /** 更新最后一条数据 */
  updateLastData(data: CustomData): void {
    if (this.history.size() > 0) {
      this.currentData = data;
      this.history.update(this.history.size() - 1, data);
      this.updateIndicators(data, true);
      this.updateStrategies();
    }
  }
  /** 更新所有指标 */
  private updateIndicators(data: CustomData, updateLast = false): void {
    try {
      for (const [name, indicator] of this.indicators) {
        if (updateLast) {
          indicator.updateLast(data);
        } else {
          indicator.add(data);
        }
      }
    } catch (error) {
      console.error(error)
    }
    
  }
  /** 更新所有交易策略，并根据结果发射的信号 */
  private updateStrategies(): void {
    for (const [name, strategy] of this.strategies) {
      try {
        const currentSignal = strategy(this.indicators, this.currentData as CustomData);
        this.signals.set(name, currentSignal);
        if (currentSignal) {
          this.eventEmitter.emit(name, currentSignal, this.currentData as CustomData);
        }
      } catch (error) {
        console.error(error)
      }
    }
    this.eventEmitter.emit("all", this.signals, this.currentData as CustomData);
  }

  onSignal<T extends string | 'all'>(name: T, callback: (signal: T extends 'all' ? Record<string, Signal> : Signal, bar: CustomData) => void) {
    this.eventEmitter.on(name, callback);
  }

  triggerSignal(name, signal: Signal): void {
    this.signals.set(name, signal);
    this.eventEmitter.emit(name, signal, this.currentData as Kline);
  }
  // A method that destroys the framework and frees up resources
  destroy() {
    this.indicators.clear();
    this.strategies.clear();
    this.signals.clear();
    this.history.clear();
    this.currentData = undefined;
    this.eventEmitter.removeAllListeners();
  }
}
