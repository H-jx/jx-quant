import { CircularQueue } from '../common/CircularQueue.js';
import { Indicator, Kline } from '../interface.js';

/**
 * VRI 量比指标：当前周期成交量与历史平均成交量的比值
 */
declare class VRI implements Indicator<Kline> {
    private readonly period;
    private buffer;
    result: CircularQueue<number>;
    maxHistoryLength: number;
    constructor({ period }: {
        period: number;
    });
    add(data: Kline): void;
    updateLast(data: Kline): void;
    /**
     * 量比 = 当前周期成交量 / 历史平均成交量
     */
    private calcVRI;
    getValue(index?: number): number;
}

export { VRI };
