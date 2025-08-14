import { SharedBufferQueue } from '../src/common/SharedBufferQueue';

describe('SharedBufferQueue', () => {
  it('should push and get values correctly', () => {
    const queue = new SharedBufferQueue(3);
    expect(queue.size()).toBe(0);
    queue.push(1);
    queue.push(2);
    expect(queue.size()).toBe(2);
    expect(queue.get(0)).toBe(1);
    expect(queue.get(1)).toBe(2);
  });

  it('should overwrite oldest value when full', () => {
    const queue = new SharedBufferQueue(2);
    queue.push(1);
    queue.push(2);
    queue.push(3);
    expect(queue.size()).toBe(2);
    expect(queue.get(0)).toBe(2);
    expect(queue.get(1)).toBe(3);
  });

  it('should clear values', () => {
    const queue = new SharedBufferQueue(2);
    queue.push(1);
    queue.push(2);
    queue.clear();
    expect(queue.size()).toBe(0);
    expect(() => queue.get(0)).toThrow();
  });

  it('should convert to array', () => {
    const queue = new SharedBufferQueue(3);
    queue.push(1);
    queue.push(2);
    queue.push(3);
    expect(queue.toArray()).toEqual([1,2,3]);
    queue.push(4);
    expect(queue.toArray()).toEqual([2,3,4]);
  });
});
