declare class SharedBufferQueue {
    private buffer;
    private readonly maxSize;
    private front;
    private rear;
    private filled;
    constructor(maxSize: number);
    push(item: number): boolean;
    get(index: number): number;
    size(): number;
    clear(): void;
    toArray(): number[];
}

export { SharedBufferQueue };
