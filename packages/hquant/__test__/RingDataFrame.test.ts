import { RingDataFrame } from '../src/common/RingDataFrame';

describe('RingDataFrame', () => {
  it('should append and retrieve rows/columns correctly', () => {
    const df = new RingDataFrame({ open: 'float', close: 'float', volume: 'int' }, 10);
    df.append({ open: 1.1, close: 1.2, volume: 100 });
    df.append({ open: 2.1, close: 2.2, volume: 200 });

    expect(df.length).toBe(2);
    expect(df.getCol('close')!.get(0)).toBeCloseTo(1.2);
    expect(df.getCol('volume')!.get(1)).toBe(200);
    expect(df.getRow(0)).toEqual({ open: 1.1, close: 1.2, volume: 100 });
    expect(df.getRow(1)).toEqual({ open: 2.1, close: 2.2, volume: 200 });
  });


  it('should clear data', () => {
    const df = new RingDataFrame({ a: 'float', b: 'int' }, 5);
    df.append({ a: 1, b: 2 });
    df.clear();
    expect(df.length).toBe(0);
    expect(df.getCol('a')!.get(0)).toBe(undefined);
    expect(df.getCol('b')!.get(0)).toBe(undefined);
  });
});
