import { CircularQueue } from '../common/CircularQueue.js';
import { Indicator, Kline } from '../interface.js';

declare class VRI implements Indicator<Kline> {
    private readonly period;
    private buffer;
    result: CircularQueue<number>;
    maxHistoryLength: number;
    constructor({ period }: {
        period: number;
    });
    private calcTrueRange;
    add(data: Kline): void;
    updateLast(data: Kline): void;
    private calcVRI;
    getValue(index?: number): number;
}

export { VRI };
