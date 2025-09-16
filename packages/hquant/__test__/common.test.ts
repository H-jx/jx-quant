import { CircularQueue } from "../src/common/CircularQueue";
import { GoldenRatioCalculator } from "../src/common/GoldenRatioCalculator";


describe("CircularQueue", () => {
  it("CircularQueue nofull", () => {
    const queue = new CircularQueue(6);
    for (let i = 0; i < 5; i++) {
      queue.push(i);
    }
    expect(queue.front).toBe(0);
    expect(queue.rear).toBe(5);
    expect(queue.size()).toBe(5);
    expect(queue.get(0)).toBe(0);
    expect(queue.get(queue.size() - 1)).toBe(4);
  });

  it("CircularQueue just full", () => {
    const queue = new CircularQueue(5);
    for (let i = 0; i < 5; i++) {
      queue.push(i);
    }
    expect(Array.from(queue)).toEqual([0, 1, 2, 3, 4]);
    expect(queue.size()).toBe(5);
    expect(queue.get(0)).toBe(0);
    expect(queue.getLast()).toBe(4);
    expect(queue.get(queue.size() - 1)).toBe(4);
  });

  it("CircularQueue full", () => {
    const queue = new CircularQueue(10);
    for (let i = 0; i < 21; i++) {
      queue.push(i);
    }
    expect(Array.from(queue)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(queue.size()).toBe(10);
    // 顶部的会被覆盖
    expect(queue.get(0)).toBe(11);
    expect(queue.get(9)).toBe(20);
    expect(queue.getLast()).toBe(20);
  });

  it("CircularQueue full pop shift", () => {
    const queue = new CircularQueue(10);
    for (let i = 0; i < 21; i++) {
      queue.push(i);
    }
    expect(Array.from(queue)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(queue.pop()).toBe(20);
    expect(queue.size()).toBe(9);
    expect(queue.shift()).toBe(11);
    expect(queue.size()).toBe(8);
  });
});
describe("GoldenRatioCalculator", () => {
  it("GoldenRatioCalculator base", () => {

    const calculator = new GoldenRatioCalculator();

    const result = calculator.calculate({
      value: 100,
      min: 0.02,
    });

    expect(result[0]).toEqual(61.8);
    expect(result[1]).toEqual(23.6076);
  });
});
