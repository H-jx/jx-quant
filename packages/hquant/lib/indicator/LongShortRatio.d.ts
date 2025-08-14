import { Indicator, Kline } from '../interface.js';

/**
 * LongShortRatio指标
 */
declare class LongShortRatio implements Indicator {
    private longProfitQueue;
    private shortProfitQueue;
    private period;
    private shortRatio;
    maxHistoryLength: number;
    constructor({ period, shortRatio, maxHistoryLength }: {
        period: number;
        shortRatio: number;
        maxHistoryLength?: number;
    });
    add(data: Kline): void;
    updateLast(data: Kline): void;
    getValue(index?: number): number;
    private calculateLongProfit;
    private calculateShortProfit;
}

export { LongShortRatio };
