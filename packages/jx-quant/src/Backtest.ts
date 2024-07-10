
import { Kline, Signal } from "./interface";
import { keepDecimalFixed } from "./util";

interface Options {
  balance: number;
  volume: number;
  tradeVolume?: number | ((price: number) => number);
}

export interface Trade {
  timestamp?: number;
  time?: string;
  price: number;
  volume: number;
  action: Signal;
  profit?: number;
}

export interface BacktestResult {
  maxDrawdownRate: number;
  profit: number;
}
export interface Data extends Pick<Kline, 'close' | 'timestamp'> {
  action: Signal;
  volume?: number;
}


export class Backtest {
  /**
  * 交易费率
  */
  private transactFeeRate = {
    "makerFeeRate": 0.00044,
    "takerFeeRate": 0.00044,
  };
  private tradeVolume:  number | ((price: number) => number);
  private trades: Trade[];
  private currentData = {
    balance: 0,
    volume: 0,
    lastPrice: 0,
    maxDrawdownRate: 0,
    maxAssetValue: 0,
    buyCount: 0,
    sellCount: 0,
  }
  private initData = {
    balance: 0,
    volume: 0,
    startPrice: 0,
  }
  constructor(options: Options) {

    this.initData.balance = options.balance;
    this.initData.volume = options.volume;
    this.tradeVolume = options.tradeVolume;
    this.reset();
  }
  reset() {
    this.currentData.balance = this.initData.balance;
    this.currentData.volume = this.initData.volume;
    this.currentData.maxDrawdownRate = 0;
    this.currentData.maxAssetValue = 0;
    this.trades = [];
  }

  public mockTrade(data: Data & {tradeVolume?: number}) {
    if (this.initData.startPrice === 0) {
      this.initData.startPrice = data.close;
    }
    this.currentData.lastPrice = data.close;
    const bar = data;
    const signal = bar.action;
    if (signal) {
      const price = bar.close;
      const volume = typeof this.tradeVolume === 'function' ? this.tradeVolume(price) : data.volume;

      const action = bar.action;
      let cost = volume * price;
      if (action === 'BUY' && this.currentData.balance >= cost) {
        this.currentData.balance -= (cost + this.transactFeeRate['makerFeeRate'] * cost);
        this.currentData.volume += volume;
        this.currentData.buyCount += 1;
      } else if (action === 'SELL' && this.currentData.volume >= volume) {
        const tradeVolume = this.currentData.volume >= volume ? volume : this.currentData.volume;
        cost = tradeVolume * price;
        this.currentData.balance += (cost - this.transactFeeRate['makerFeeRate'] * cost);
        this.currentData.volume -= volume;
        this.currentData.sellCount += 1;
      }
      this.trades.push({ timestamp: bar.timestamp, price, volume, action, profit: this.getProfit()[1] });
    }
    const [profit, profitRate] = this.getProfit();
  }
  public run(data: Data[]): BacktestResult {
    this.currentData.lastPrice = data[0].close;
    for (let i = 0; i < data.length; i++) {
      const bar = data[i];
      this.mockTrade(bar);
    }
    const [profit, profitRate] = this.getProfit()
    return { maxDrawdownRate: this.currentData.maxDrawdownRate, profit: profit };
  }
  /** 获取收益*/
  public getProfit() {
    const currentAsset = this.currentData.balance + this.currentData.volume * this.currentData.lastPrice;
    const initialAsset = this.initData.balance + this.initData.volume * this.initData.startPrice;

    const profit = keepDecimalFixed((currentAsset - initialAsset), 4)
    const profitRate = keepDecimalFixed((profit / initialAsset), 4);

    if (currentAsset > this.currentData.maxAssetValue) {
      this.currentData.maxAssetValue = currentAsset;
    }
    const drawdown = (currentAsset - this.currentData.maxAssetValue) / this.currentData.maxAssetValue;

    // 求最大回测，考虑负数
    if (drawdown < this.currentData.maxDrawdownRate) {
      this.currentData.maxDrawdownRate = drawdown;
    }
    return [profit, profitRate];
  }
  public getResult() {
    const [profit, profitRate] = this.getProfit();
    return { 
      maxDrawdownRate: this.currentData.maxDrawdownRate,
      profit: profit, 
      profitRate: profitRate,
      buyCount: this.currentData.buyCount, 
      sellCount: this.currentData.sellCount 
    };
  }
  public getTrades() {
    return this.trades;
  }
  public destroy() {
    this.trades = [];
  }
}


