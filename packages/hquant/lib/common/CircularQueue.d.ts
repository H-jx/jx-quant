declare class CircularQueue<T> {
    private readonly maxSize;
    private queue;
    front: number;
    rear: number;
    constructor(maxSize: number);
    push(item: T): boolean;
    shift(): T | undefined;
    pop(): T | undefined;
    update(index: number, item: T): boolean;
    clear(): void;
    size(): number;
    get(index: number): T;
    getLast(): T;
    toArray(): T[];
}

export { CircularQueue };
