import { Indicator, Kline } from '../interface.js';

/**
 * MACD指标
 */
declare class MACD implements Indicator {
    private shortTermMA;
    private longTermMA;
    private signalLineMA;
    private macdLine;
    private signalLine;
    maxHistoryLength: number;
    constructor({ shortTermPeriod, longTermPeriod, signalLinePeriod, maxHistoryLength }: {
        shortTermPeriod: number;
        longTermPeriod: number;
        signalLinePeriod: number;
        maxHistoryLength?: number;
    });
    add(data: Kline): void;
    updateLast(data: Kline): void;
    getValue(index?: number): {
        macd: number;
        signalLine: number;
    };
}

export { MACD };
