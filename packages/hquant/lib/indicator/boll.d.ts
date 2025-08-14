import { Indicator, Kline } from '../interface.js';

/**
 * boll指标
 */
declare class BOLL implements Indicator {
    private ma;
    private stdDevQueue;
    private upperBand;
    private midBand;
    private lowerBand;
    private stdDevFactor;
    maxHistoryLength: number;
    constructor({ period, stdDevFactor, maxHistoryLength }: {
        period: number;
        stdDevFactor: number;
        maxHistoryLength?: number;
    });
    add(data: Kline): void;
    updateLast(data: Kline): void;
    getValue(index?: number): {
        up: number;
        mid: number;
        low: number;
    };
    private calculateStdDev;
}

export { BOLL };
