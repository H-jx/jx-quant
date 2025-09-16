import { TypedRingBuffer } from '../src/common/TypedRingBuffer';

describe('TypedRingBuffer', () => {
  it('should push and get values correctly', () => {
    const buf = new TypedRingBuffer('float', 3);
    buf.push(1.1);
    buf.push(2.2);
    buf.push(3.3);
    expect(buf.size()).toBe(3);
    expect(buf.get(0)).toBeCloseTo(1.1);
    expect(buf.get(2)).toBeCloseTo(3.3);
  });

  it('should overwrite oldest when full', () => {
    const buf = new TypedRingBuffer('int', 2);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size()).toBe(2);
    expect(buf.get(0)).toBe(2);
    expect(buf.get(1)).toBe(3);
  });

  it('should shift and pop values', () => {
    const buf = new TypedRingBuffer('float', 2);
    buf.push(1.5);
    buf.push(2.5);
    expect(buf.shift()).toBeCloseTo(1.5);
    expect(buf.size()).toBe(1);
    buf.push(3.5);

    expect(buf.pop()).toBeCloseTo(3.5);
    expect(buf.size()).toBe(1);
    expect(buf.get(0)).toBeCloseTo(2.5);
    expect(buf.shift()).toBeCloseTo(2.5);
    expect(buf.size()).toBe(0);
  });

  it('should update and getLast', () => {
    const buf = new TypedRingBuffer('int', 3);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    buf.update(1, 99);
    expect(buf.get(1)).toBe(99);
    expect(buf.getLast()).toBe(30);
  });

  it('should clear and iterator', () => {
    const buf = new TypedRingBuffer('float', 2);
    buf.push(1.1);
    buf.push(2.2);
    buf.clear();
    expect(buf.size()).toBe(0);
    buf.push(3.3);
    for (const val of buf) {
      expect(val).toBeCloseTo(3.3);
    }
  });
});
