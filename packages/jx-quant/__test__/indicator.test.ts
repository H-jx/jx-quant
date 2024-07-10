import { BOLL } from "../indicator/boll";
import { MA } from "../indicator/ma";
import { Slope, KlineState } from "../indicator/slope";
import { Kline } from "../interface";


describe("MA", () => {
  it("calculates correct values for a small window size", () => {
    const ma = new MA({period: 3});

    const data: Kline[] = [
      { open: 10, close: 11, high: 12, low: 9, volume: 100, timestamp: 0 },
      { open: 11, close: 12, high: 13, low: 10, volume: 150, timestamp: 0 },
      { open: 12, close: 13, high: 14, low: 11, volume: 200, timestamp: 0 },
      { open: 13, close: 14, high: 15, low: 12, volume: 250, timestamp: 0 },
      { open: 14, close: 20, high: 15, low: 12, volume: 250, timestamp: 0 },
      { open: 15, close: 16, high: 15, low: 12, volume: 250, timestamp: 0 },
    ];

    const expectedValues = [
        NaN,
        NaN,
      (11 + 12 + 13) / 3,
      (12 + 13 + 14) / 3,
      (13 + 14 + 20) / 3,
      (14 + 20 + 16) / 3,
    ];

    data.forEach((bar, i) => {
      ma.add(bar);
      expect(ma.getValue(-1)).toEqual(expectedValues[i]);
    });
  });

  it("calculates correct values after updating last value", () => {
    const ma = new MA({period: 3});
    ma.add({ open: 10, close: 12, low: 8, high: 14, volume: 100, timestamp: 1 });
    ma.add({ open: 12, close: 14, low: 10, high: 16, volume: 200, timestamp: 2 });
    ma.add({ open: 14, close: 16, low: 12, high: 18, volume: 150, timestamp: 3 });
    const oldValue = ma.getValue(-1);
    ma.updateLast({ open: 16, close: 18, low: 14, high: 20, volume: 120, timestamp: 4 });
    const newValue = ma.getValue(-1);
    
    expect(oldValue).toEqual((12 + 14 + 16) / 3);
    expect(newValue).toEqual((12 + 14 + 18) / 3);
  });
})

describe('BOLL', () => {
    it('should calculate BOLL correctly', () => {
      const boll = new BOLL({ period: 3, stdDevFactor: 1 });
  
      const data: any[] = [
        { close: 10 },
        { close: 20 },
        { close: 15 },
        { close: 25 },
        { close: 30 },
      ];
      
      const expectedValues = [
        { up: NaN, mid: NaN, low: NaN },
        { up: NaN, mid: NaN, low: NaN },
        { up: 19.0824, mid: 15, low: 10.9175 },
        { up: 24.0824, mid: 20, low: 15.9175 },
        { up: 29.5694, mid: 23.3333, low: 17.0972 },
      ];
  
      data.forEach((d, i) => {
        boll.add(d);
        const values = boll.getValue(i);
        expect(values).toEqual(expectedValues[i]);
      });
    });
});


describe('Slope', () => {
  it('匀速上涨', () => {
    
    // 示例用法
    const klines: Kline[] = [
      { open: 100, close: 10, low: 95, high: 115, volume: 1000, timestamp: 1 },
      { open: 110, close: 11, low: 100, high: 115, volume: 1200, timestamp: 2 },
      { open: 105, close: 12, low: 100, high: 125, volume: 800, timestamp: 3 },
      { open: 105, close: 13, low: 100, high: 125, volume: 800, timestamp: 4 },
      { open: 105, close: 14, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 105, close: 15, low: 100, high: 125, volume: 800, timestamp: 6 },
      { open: 105, close: 16, low: 100, high: 125, volume: 800, timestamp: 7 }
      // 添加更多 K 线数据...
    ];
    const slope = new Slope({ period: 3 });
    let slopeValue = KlineState.Uniform;
    klines.forEach(kline => {
      slopeValue = slope.add(kline);
    })
    expect(slopeValue).toEqual(KlineState.UniformRise);
  });
  it('加速上涨', () => {
    
    // 示例用法
    const klines: Kline[] = [
      { open: 105, close: 1657, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 100, close: 1659, low: 95, high: 115, volume: 1000, timestamp: 1 },
      { open: 110, close: 1659, low: 100, high: 115, volume: 1200, timestamp: 2 },
      { open: 105, close: 1659.82, low: 100, high: 125, volume: 800, timestamp: 3 },
      { open: 105, close: 1662, low: 100, high: 125, volume: 800, timestamp: 4 },
      { open: 105, close: 1680, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 105, close: 1686, low: 100, high: 125, volume: 800, timestamp: 5 },

      // 添加更多 K 线数据...
    ];
    const slope = new Slope({ period: 7 });
    let slopeValue = KlineState.Uniform;
    klines.forEach(kline => {
      slopeValue = slope.add(kline);
    })
    expect(slopeValue).toEqual(KlineState.AcceleratingRise);
  });
  it('减速上涨', () => {
    
    // 示例用法
    const klines: Kline[] = [
      { open: 100, close: 1655, low: 95, high: 115, volume: 1000, timestamp: 1 },
      { open: 110, close: 1657, low: 100, high: 115, volume: 1200, timestamp: 2 },
      { open: 105, close: 1659, low: 100, high: 125, volume: 800, timestamp: 3 },
      { open: 105, close: 1660, low: 100, high: 125, volume: 800, timestamp: 4 },
      { open: 105, close: 1661, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 105, close: 1662, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 105, close: 1663, low: 100, high: 125, volume: 800, timestamp: 5 }
      // 添加更多 K 线数据...
    ];
    const slope = new Slope({ period: 7 });
    let slopeValue = KlineState.Uniform;
    klines.forEach(kline => {
      slopeValue = slope.add(kline);
    })
    expect(slopeValue).toEqual(KlineState.UniformRise);
  });
  it('加速下跌', () => {
    
    // 示例用法
    const klines: Kline[] = [
      { open: 105, close: 2040, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 100, close: 2036, low: 95, high: 115, volume: 1000, timestamp: 1 },
      { open: 110, close: 2023, low: 100, high: 115, volume: 1200, timestamp: 2 },
      { open: 105, close: 2008, low: 100, high: 125, volume: 800, timestamp: 3 },
      { open: 105, close: 2015, low: 100, high: 125, volume: 800, timestamp: 4 },
      { open: 105, close: 1996, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 105, close: 1966, low: 100, high: 125, volume: 800, timestamp: 5 },
      // 添加更多 K 线数据...
    ];
    const slope = new Slope({ period: 7, slopeTolerant: 0.1 });
    let slopeValue = KlineState.Uniform;
    klines.forEach(kline => {
      slopeValue = slope.add(kline);
    })
    expect(slopeValue).toEqual(KlineState.AcceleratingFall);
  });
  it('减速下跌', () => {
    
    // 示例用法
    const klines: Kline[] = [
      { open: 100, close: 1626, low: 95, high: 115, volume: 1000, timestamp: 1 },
      { open: 110, close: 1620, low: 100, high: 115, volume: 1200, timestamp: 2 },
      { open: 105, close: 1618, low: 100, high: 125, volume: 800, timestamp: 3 },
      { open: 105, close: 1617, low: 100, high: 125, volume: 800, timestamp: 4 },
      { open: 105, close: 1616, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 105, close: 1616, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 105, close: 1615, low: 100, high: 125, volume: 800, timestamp: 5 },
      // 添加更多 K 线数据...
    ];
    const slope = new Slope({ period: 7, slopeTolerant: 0.1 });
    let slopeValue = KlineState.Uniform;
    klines.forEach(kline => {
      slopeValue = slope.add(kline);
    })
    expect(slopeValue).toEqual(KlineState.DeceleratingFall);
  });
  it('匀速下跌', () => {
    
    // 示例用法
    const klines: Kline[] = [
      { open: 100, close: 2058, low: 95, high: 115, volume: 1000, timestamp: 1 },
      { open: 110, close: 2054, low: 100, high: 115, volume: 1200, timestamp: 2 },
      { open: 105, close: 2050, low: 100, high: 125, volume: 800, timestamp: 3 },
      { open: 105, close: 2046, low: 100, high: 125, volume: 800, timestamp: 4 },
      { open: 105, close: 2042, low: 100, high: 125, volume: 800, timestamp: 5 },
      { open: 105, close: 2038, low: 100, high: 125, volume: 800, timestamp: 6 },
      { open: 105, close: 2032, low: 100, high: 125, volume: 800, timestamp: 7 }
      // 添加更多 K 线数据...
    ];
    const slope = new Slope({ period: 7 });
    let slopeValue = KlineState.Uniform;
    klines.forEach(kline => {
      slopeValue = slope.add(kline);
    })
    expect(slopeValue).toEqual(KlineState.UniformFall);
  });
});
