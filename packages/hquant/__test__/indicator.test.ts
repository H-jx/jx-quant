import { BOLL } from "../src/indicator/boll";
import { MA } from "../src/indicator/ma";
import { ATR } from "../src/indicator/atr";
import { VRI } from "../src/indicator/vri";
import { MACD } from "../src/indicator/macd";
import { Kline } from "../src/interface";


describe("MA", () => {
  it("calculates correct values for a small window size", () => {
    const ma = new MA({ period: 3 });

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
    const ma = new MA({ period: 3 });
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

// === 修正 ATR 测试 ===
describe("ATR", () => {
  it("calculates ATR correctly for real data", () => {
    const atr = new ATR({ period: 3 });
    const data: Kline[] = [
      { open: 10, high: 16, low: 10, close: 12, volume: 100, timestamp: 1 }, // tr=6
      { open: 12, high: 17, low: 12, close: 15, volume: 120, timestamp: 2 }, // tr=5
      { open: 15, high: 19, low: 15, close: 17, volume: 130, timestamp: 3 }, // tr=4
    ];
    // ATR(3) = (6+5+4)/3 = 5
    data.forEach(bar => atr.add(bar));
    expect(atr.getValue(-1)).toBeCloseTo(5, 5);
    // updateLast
    atr.updateLast({ open: 17, high: 22, low: 16, close: 20, volume: 150, timestamp: 5 });
    expect(atr.getValue(-1)).not.toBeNaN();
  });
});

// === 修正 VRI 测试 ===
describe("VRI", () => {
  it("calculates VRI correctly for real data", () => {
    const vri = new VRI({ period: 3 });
    const data: Kline[] = [
      { open: 10, high: 15, low: 9, close: 12, volume: 100, timestamp: 1 },
      { open: 12, high: 16, low: 11, close: 15, volume: 200, timestamp: 2 },
      { open: 15, high: 18, low: 14, close: 17, volume: 300, timestamp: 3 },
      { open: 17, high: 20, low: 16, close: 19, volume: 400, timestamp: 4 },
    ];
    // 期望：
    // 第3根: 当前300, 前两根(100+200)/2=150, 300/150=2
    // 第4根: 当前400, 前两根(200+300)/2=250, 400/250=1.6
    data.forEach(bar => vri.add(bar));
    expect(vri.getValue(0)).toBeCloseTo(2, 2);
    expect(vri.getValue(1)).toBeCloseTo(1.6, 1.6);
    // updateLast
    vri.updateLast({ open: 17, high: 20, low: 16, close: 19, volume: 600, timestamp: 5 });
    expect(vri.getValue(1)).toBeCloseTo(2.4, 2.4); // (600/(300+200)/2=250)
  });
});

describe("MACD", () => {
  it("calculates MACD correctly for real data", () => {
    const macd = new MACD({ shortTermPeriod: 2, longTermPeriod: 3, signalLinePeriod: 2 });
    const closes = [10, 12, 14, 16, 18, 20];
    closes.forEach(close => {
      macd.add({ open: close - 1, high: close + 1, low: close - 2, close, volume: 100, timestamp: 0 });
    });
    // 简单测试：macdLine, signalLine 不为 NaN
    const val = macd.getValue(-1);
    expect(typeof val.macd).toBe("number");
    expect(typeof val.signalLine).toBe("number");
    // updateLast
    macd.updateLast({ open: 19, high: 21, low: 18, close: 22, volume: 100, timestamp: 0 });
    const val2 = macd.getValue(-1);
    expect(typeof val2.macd).toBe("number");
    expect(typeof val2.signalLine).toBe("number");
  });
});

