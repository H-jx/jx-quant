
export class GoldenRatioCalculator {
  private readonly ratio: number;

  constructor(ratio = 0.618) {
    this.ratio = ratio;
  }
  calculate({value, min}: {value: number, min: number}): number[] {
    const result: number[] = [];
    let remainingValue = value;
    while (remainingValue > min) {
      const nextValue = remainingValue * this.ratio;
      result.push(nextValue);
      remainingValue -= nextValue;
    }
    return result;
  }
}
