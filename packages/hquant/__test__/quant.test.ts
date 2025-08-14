import { Quant } from "../src";
import { MA } from "../src/indicator/ma";



describe('Quant', () => {
  let quant: Quant;

  beforeEach(() => {
    quant = new Quant();
  });

  afterEach(() => {
    quant.destroy();
  });

  it('should add and remove indicators correctly', () => {
    const sma = new MA({period: 3});
    expect(quant.getIndicators().size).toBe(0);

    quant.addIndicator('MA', sma);
    expect(quant.getIndicators().size).toBe(1);
    expect(quant.getIndicators().get('MA')).toBe(sma);

    quant.removeIndicator('MA');
    expect(quant.getIndicators().size).toBe(0);
  });

  it('should add and remove strategies correctly', () => {
    const strategy = jest.fn();
    expect(quant.getStrategies().size).toBe(0);

    quant.addStrategy('Strategy', strategy);
    expect(quant.getStrategies().size).toBe(1);
    expect(quant.getStrategies().get('Strategy')).toBe(strategy);

    quant.removeStrategy('Strategy');
    expect(quant.getStrategies().size).toBe(0);
  });

  it('should add data and update indicators and strategies correctly', () => {
    const sma = new MA({period: 3});
    quant.addIndicator('MA', sma);

    const strategy = jest.fn();
    quant.addStrategy('Strategy', strategy);

    const data = { 
      open: 100,
      close: 100,
      low: 100,
      high: 100,
      volume: 1,
      timestamp: Date.now(),
    };
    quant.addData(data);
    quant.addData(data);
    quant.addData(data);
    expect(quant.getIndicators().get('MA')?.getValue()).toEqual(100);
    expect(strategy).toHaveBeenCalled();
    quant.updateLastData({ 
      open: 100,
      close: 190,
      low: 100,
      high: 100,
      volume: 1,
      timestamp: Date.now(),
    });
    expect(quant.getIndicators().get('MA')?.getValue()).toEqual(130);
    expect(quant.getIndicators().get('MA')?.getValue(2)).toEqual(130);
    
  });


  it('should trigger signals correctly', () => {
    const signal = 'BUY';
    const callback = jest.fn();
    quant.onSignal('Signal1', callback);

    quant.triggerSignal('Signal1', "BUY");
    expect(callback).toHaveBeenCalledWith(signal, undefined);
  });
});