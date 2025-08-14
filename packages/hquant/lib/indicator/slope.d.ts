import { CircularQueue } from '../common/CircularQueue.js';
import { Indicator, Kline } from '../interface.js';

declare enum KlineState {
    AcceleratingUp = 3,
    SteadyUp = 2,
    DeceleratingUp = 1,
    AcceleratingDown = -3,
    SteadyDown = -2,
    DeceleratingDown = -1,
    Mixed = 0
}
declare class Slope implements Indicator {
    buffer: CircularQueue<Kline>;
    result: CircularQueue<number>;
    period: number;
    maxHistoryLength: number;
    epsilon: number;
    key: keyof Kline;
    constructor({ epsilon, maxHistoryLength, }: {
        maxHistoryLength?: number;
        epsilon: number;
    });
    private calculateSlope;
    add(data: Kline): number;
    updateLast(data: Kline): number;
    getValue(index?: number): number;
}

export { KlineState, Slope };
