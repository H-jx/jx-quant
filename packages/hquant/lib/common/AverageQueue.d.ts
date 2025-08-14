import { CircularQueue } from './CircularQueue.js';

declare class AverageQueue {
    queue: CircularQueue<number>;
    constructor(maxLen: number);
    push(value: number): void;
    calc(): number;
}

export { AverageQueue };
