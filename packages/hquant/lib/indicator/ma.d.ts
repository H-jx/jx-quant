import { CircularQueue } from '../common/CircularQueue.js';
import { Indicator, Kline } from '../interface.js';

/**
 * 均线指标
 */
declare class MA implements Indicator {
    buffer: CircularQueue<number>;
    period: number;
    result: CircularQueue<number>;
    maxHistoryLength: number;
    key: keyof Kline;
    constructor({ period, maxHistoryLength, key }: {
        period: number;
        maxHistoryLength?: number;
        key?: keyof Kline;
    });
    getPeriodSum(): number;
    add(data: Kline | number): number;
    updateLast(data: Kline | number): number;
    getValue(index?: number): number;
}

export { MA };
