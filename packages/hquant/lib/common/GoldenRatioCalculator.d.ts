declare class GoldenRatioCalculator {
    private readonly ratio;
    constructor(ratio?: number);
    calculate({ value, min }: {
        value: number;
        min: number;
    }): number[];
}

export { GoldenRatioCalculator };
