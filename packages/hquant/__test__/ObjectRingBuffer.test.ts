// ObjectRingBuffer.test.ts

import { SharedObjectRingBuffer } from '../src/common/SharedObjectRingBuffer'; // 请根据实际路径调整

type Tick = {
  price: number;
  amount: number;
}

describe('SharedObjectRingBuffer', () => {
  let buf: SharedObjectRingBuffer<Tick>;

  beforeEach(() => {
    buf = new SharedObjectRingBuffer<Tick>(
      { price: Float64Array, amount: Float64Array },
      4
    );
  });

  describe('constructor', () => {
    it('should initialize with correct capacity', () => {
      expect(buf.maxLength).toBe(4);
      expect(buf.length).toBe(0);
    });

    it('should throw if capacity <= 0', () => {
      expect(() => new SharedObjectRingBuffer({ price: Float64Array }, 0)).toThrow();
      expect(() => new SharedObjectRingBuffer({ price: Float64Array }, -1)).toThrow();
    });
  });

  describe('push & get', () => {
    it('should push and get items in order', () => {
      buf.push({ price: 1, amount: 10 });
      buf.push({ price: 2, amount: 20 });

      expect(buf.get(0)).toEqual({ price: 1, amount: 10 });
      expect(buf.get(1)).toEqual({ price: 2, amount: 20 });
      expect(buf.length).toBe(2);
    });

    it('should overwrite oldest when full (circular)', () => {
      for (let i = 1; i <= 5; i++) {
        buf.push({ price: i, amount: i * 10 });
      }

      // capacity=4, 所以第5个覆盖第1个
      expect(buf.length).toBe(4);
      expect(buf.get(0)).toEqual({ price: 2, amount: 20 }); // 最早
      expect(buf.get(3)).toEqual({ price: 5, amount: 50 }); // 最新
    });

    it('should return undefined for invalid index', () => {
      buf.push({ price: 1, amount: 10 });
      expect(buf.get(-1)).toBeUndefined();
      expect(buf.get(1)).toBeUndefined(); // only 1 item
      expect(buf.get(100)).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update existing item', () => {
      buf.push({ price: 1, amount: 10 });
      buf.push({ price: 2, amount: 20 });

      expect(buf.update(0, { price: 99, amount: 990 })).toBe(true);
      expect(buf.get(0)).toEqual({ price: 99, amount: 990 });

      expect(buf.update(1, { price: 88, amount: 880 })).toBe(true);
      expect(buf.get(1)).toEqual({ price: 88, amount: 880 });
    });

    it('should return false for invalid index', () => {
      buf.push({ price: 1, amount: 10 });
      expect(buf.update(1, { price: 0, amount: 0 })).toBe(false);
      expect(buf.update(-1, { price: 0, amount: 0 })).toBe(false);
    });
  });

  describe('clear', () => {
    it('should reset buffer', () => {
      buf.push({ price: 1, amount: 10 });
      buf.push({ price: 2, amount: 20 });
      expect(buf.length).toBe(2);

      buf.clear();
      expect(buf.length).toBe(0);
      expect(buf.get(0)).toBeUndefined();
    });
  });

  describe('latest & oldest', () => {
    it('should return correct latest and oldest', () => {
      buf.push({ price: 1, amount: 10 });
      buf.push({ price: 2, amount: 20 });
      buf.push({ price: 3, amount: 30 });

      expect(buf.oldest()).toEqual({ price: 1, amount: 10 });
      expect(buf.latest()).toEqual({ price: 3, amount: 30 });
    });

    it('should return undefined if empty', () => {
      expect(buf.oldest()).toBeUndefined();
      expect(buf.latest()).toBeUndefined();
    });
  });

  describe('toArray', () => {
    it('should return array copy of buffer', () => {
      buf.push({ price: 1, amount: 10 });
      buf.push({ price: 2, amount: 20 });

      const arr = buf.toArray();
      expect(arr).toHaveLength(2);
      expect(arr[0]).toEqual({ price: 1, amount: 10 });
      expect(arr[1]).toEqual({ price: 2, amount: 20 });

      // 修改原 buffer 不应影响已导出数组（因为是值拷贝）
      buf.push({ price: 3, amount: 30 });
      expect(arr).toHaveLength(2); // 仍是旧数据
    });
  });

  describe('iterator', () => {
    it('should support for...of iteration', () => {
      buf.push({ price: 1, amount: 10 });
      buf.push({ price: 2, amount: 20 });

      const result: Tick[] = [];
      for (const item of buf) {
        result.push(item);
      }

      expect(result).toEqual([
        { price: 1, amount: 10 },
        { price: 2, amount: 20 },
      ]);
    });
  });

  describe('exportMeta & importMeta', () => {
    it('should export and import correctly', () => {
      buf.push({ price: 1, amount: 10 });
      buf.push({ price: 2, amount: 20 });

      const meta = buf.exportMeta();
      const imported = SharedObjectRingBuffer.importMeta<Tick>(meta);

      expect(imported.length).toBe(2);
      expect(imported.get(0)).toEqual({ price: 1, amount: 10 });
      expect(imported.get(1)).toEqual({ price: 2, amount: 20 });
      expect(imported.maxLength).toBe(4);

      // 修改原 buffer，应影响导入的（因为共享内存）
      buf.push({ price: 3, amount: 30 });
      expect(imported.length).toBe(3);
      expect(imported.get(2)).toEqual({ price: 3, amount: 30 });
    });
  });

  describe('fromArray', () => {
    it('should initialize from array (truncate if needed)', () => {
      const arr = [
        { price: 1, amount: 10 },
        { price: 2, amount: 20 },
        { price: 3, amount: 30 },
        { price: 4, amount: 40 },
        { price: 5, amount: 50 }, // 超出容量，前面的被丢弃
      ];

      const buf = SharedObjectRingBuffer.fromArray<Tick>(
        { price: Float64Array, amount: Float64Array },
        3,
        arr
      );

      expect(buf.length).toBe(3);
      expect(buf.get(0)).toEqual({ price: 3, amount: 30 });
      expect(buf.get(1)).toEqual({ price: 4, amount: 40 });
      expect(buf.get(2)).toEqual({ price: 5, amount: 50 });
    });

    it('should pad if array smaller than capacity', () => {
      const arr = [{ price: 1, amount: 10 }];

      const buf = SharedObjectRingBuffer.fromArray<Tick>(
        { price: Float64Array, amount: Float64Array },
        3,
        arr
      );

      expect(buf.length).toBe(1);
      expect(buf.get(0)).toEqual({ price: 1, amount: 10 });
    });
  });
});