import { Backtest } from "../src/Backtest";
import { FuturesBacktest, Trade } from '../src/FuturesBacktest';

describe("Backtest", () => {
  it("Backtest profit", () => {
    const backtest = new Backtest({
      balance: 1400,
      volume: 0,
    });
    backtest.mockTrade({
      close: 100,
      action: "BUY",
      timestamp: Date.now(),
      volume: 0.5,
    })

    backtest.mockTrade({
      close: 200,
      action: "SELL",
      timestamp: Date.now(),
      volume: 0.5,
    })
    const { profit } = backtest.getResult()

    const newProfit = 99 / 1400 * 100;
    // 大于90%的利润
    expect(profit).toBeGreaterThan(newProfit);

  });

  it("Backtest maxDrawdownRate", () => {
    const backtest = new Backtest({
      balance: 1400,
      volume: 0,
    });
    backtest.mockTrade({
      close: 1300,
      action: "BUY",
      timestamp: Date.now(),
      volume: 1,
    })

    backtest.mockTrade({
      close: 700,
      action: "SELL",
      timestamp: Date.now(),
      volume: 1,
    })
    backtest.mockTrade({
      close: 900,
      action: "BUY",
      timestamp: Date.now(),
      volume: 1,
    })
    backtest.mockTrade({
      close: 800,
      action: "SELL",
      timestamp: Date.now(),
      volume: 1,
    })
    const { profit, maxDrawdownRate } = backtest.getResult()
    expect(profit).toBeLessThan(0);
    expect(maxDrawdownRate).toBeLessThan(0.4);

  });
});


describe('FuturesBacktest', () => {
  test('mockTrade should open a LONG position and hold', () => {
    const backtestParams = {
      accountValue: 200,
    };
    const backtest = new FuturesBacktest(backtestParams);
    const trades: Trade[] = [
      {
        time: 1,
        price: 100,
        volume: 1,
        side: 'BUY',
        positionSide: 'LONG',
      },
      {
        time: 2,
        price: 200,
        volume: 0,
        side: undefined,
        positionSide: undefined,
      }
    ]
    trades.forEach((trade) => {
      backtest.mockTrade(trade)
    })

    expect(backtest.getResult().profitRate).toBe(0.485);
  });


  test('mockTrade should open a SHORT position and hold', () => {
    const backtestParams = {
      accountValue: 200,
    };
    const backtest = new FuturesBacktest(backtestParams);
    const trades: Trade[] = [
      {
        time: 1,
        price: 200,
        volume: 1,
        side: 'SELL',
        positionSide: 'SHORT',
      },
      {
        time: 2,
        price: 100,
        volume: 0,
        side: undefined,
        positionSide: undefined,
      }
    ]
    trades.forEach((trade) => {
      backtest.mockTrade(trade)
    })
  
    expect(backtest.getResult().profitRate).toBe(0.47);
  });

  test('open a Long * 2', () => {
    const backtestParams = {
      accountValue: 200,
    };
    const backtest = new FuturesBacktest(backtestParams);
    const trades: Trade[] = [
      {
        time: 1,
        price: 100,
        volume: 0.5,
        side: 'BUY',
        positionSide: 'LONG',
      },
      {
        time: 2,
        price: 60,
        volume: 1,
        side: 'BUY',
        positionSide: 'LONG',
      },
      {
        time: 3,
        price: 120,
        volume: 0,
        side: undefined,
        positionSide: undefined,
      }
    ]
    trades.forEach((trade) => {
      backtest.mockTrade(trade)
    })
  
    expect(backtest.getResult().profitRate).toBeGreaterThanOrEqual(0.33);
  });
  test('Liquidation', () => {

    const backtest = new FuturesBacktest({
      accountValue: 200,
      leverage: 1,
      makerFee: 0.001,
      takerFee: 0.001,
    });
    const trades: Trade[] = [
      {
        time: 1,
        price: 100,
        volume: 2,
        side: 'BUY',
        positionSide: 'LONG',
      },
 
      {
        time: 1,
        price: 70,
        volume: 0,
        side: undefined,
        positionSide: undefined,
      },
      {
        time: 1,
        price: 50,
        volume: 0,
        side: undefined,
        positionSide: undefined,
      },
      {
        time: 1,
        price: 30,
        volume: 0,
        side: undefined,
        positionSide: undefined,
      },
    ]
    trades.forEach((trade) => {
      backtest.mockTrade(trade)
    })

    console.log(backtest.getResult())
    expect(backtest.mockTrade.bind(backtest, {
      time: 3,
      price: 20,
      volume: 0,
      side: undefined,
      positionSide: undefined,
    })).toThrow('Liquidation');

  });
});