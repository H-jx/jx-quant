import { Indicator, Kline } from '../interface.js';

declare class RSI implements Indicator {
    private readonly period;
    private readonly values;
    private avgGain;
    private avgLoss;
    maxHistoryLength: number;
    constructor({ period }: {
        period: number;
    });
    add(data: Kline): void;
    updateLast(data: Kline): void;
    getValue(index?: number): number;
}

export { RSI };
