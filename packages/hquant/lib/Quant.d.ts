import { CircularQueue } from './common/CircularQueue.js';
import { Kline, KlineIn, Signal, Indicator, Strategy } from './interface.js';

declare class Quant<CustomData extends Kline = Kline> {
    static tramsformData(data: KlineIn[]): Kline[];
    private indicators;
    private strategies;
    private eventEmitter;
    history: CircularQueue<CustomData>;
    currentData?: CustomData;
    private signals;
    private maxHistoryLength;
    constructor({ maxHistoryLength }?: {
        maxHistoryLength?: number | undefined;
    });
    getSignal(name: string): Signal;
    getIndicator(name: string): Indicator<Kline> | undefined;
    getIndicators(): Map<string, Indicator<Kline>>;
    getStrategies(): Map<string, Strategy<CustomData>>;
    addIndicator(name: string, indicator: Indicator): void;
    addStrategy(name: string, strategy: Strategy<CustomData>): void;
    removeIndicator(name: string): void;
    removeStrategy(name: string): void;
    /** 添加新数据 */
    addData(data: CustomData): void;
    /** 更新最后一条数据 */
    updateLastData(data: CustomData): void;
    /** 更新所有指标 */
    private updateIndicators;
    /** 更新所有交易策略，并根据结果发射的信号 */
    private updateStrategies;
    onSignal<T extends string | 'all'>(name: T, callback: (signal: T extends 'all' ? Record<string, Signal> : Signal, bar: CustomData) => void): void;
    triggerSignal(name: any, signal: Signal): void;
    destroy(): void;
}

export { Quant };
