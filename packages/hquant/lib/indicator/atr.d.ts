import { CircularQueue } from '../common/CircularQueue.js';
import { Indicator, Kline } from '../interface.js';

/**
 * 平均真实波幅（ATR）指标
 */
declare class ATR implements Indicator {
    buffer: CircularQueue<Kline>;
    period: number;
    result: CircularQueue<number>;
    maxHistoryLength: number;
    constructor({ period, maxHistoryLength }: {
        period: number;
        maxHistoryLength?: number;
    });
    private getTrueRange;
    add(data: Kline): void;
    updateLast(data: Kline): void;
    getValue(index?: number): number;
}

export { ATR };
