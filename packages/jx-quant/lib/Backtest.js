var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/Backtest.ts
__markAsModule(exports);
__export(exports, {
  Backtest: () => Backtest
});

// src/util.ts
var keepDecimalFixed = (value, digits = 2) => {
  const unit = Math.pow(10, digits);
  const val = typeof value === "number" ? value : Number(value);
  return Math.trunc(val * unit) / unit;
};

// src/Backtest.ts
var Backtest = class {
  constructor(options) {
    this.transactFeeRate = {
      "makerFeeRate": 44e-5,
      "takerFeeRate": 44e-5
    };
    this.currentData = {
      balance: 0,
      volume: 0,
      lastPrice: 0,
      maxDrawdownRate: 0,
      maxAssetValue: 0,
      buyCount: 0,
      sellCount: 0
    };
    this.initData = {
      balance: 0,
      volume: 0,
      startPrice: 0
    };
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
  mockTrade(data) {
    if (this.initData.startPrice === 0) {
      this.initData.startPrice = data.close;
    }
    this.currentData.lastPrice = data.close;
    const bar = data;
    const signal = bar.action;
    if (signal) {
      const price = bar.close;
      const volume = typeof this.tradeVolume === "function" ? this.tradeVolume(price) : data.volume;
      const action = bar.action;
      let cost = volume * price;
      if (action === "BUY" && this.currentData.balance >= cost) {
        this.currentData.balance -= cost + this.transactFeeRate["makerFeeRate"] * cost;
        this.currentData.volume += volume;
        this.currentData.buyCount += 1;
      } else if (action === "SELL" && this.currentData.volume >= volume) {
        const tradeVolume = this.currentData.volume >= volume ? volume : this.currentData.volume;
        cost = tradeVolume * price;
        this.currentData.balance += cost - this.transactFeeRate["makerFeeRate"] * cost;
        this.currentData.volume -= volume;
        this.currentData.sellCount += 1;
      }
      this.trades.push({timestamp: bar.timestamp, price, volume, action, profit: this.getProfit()[1]});
    }
    const [profit, profitRate] = this.getProfit();
  }
  run(data) {
    this.currentData.lastPrice = data[0].close;
    for (let i = 0; i < data.length; i++) {
      const bar = data[i];
      this.mockTrade(bar);
    }
    const [profit, profitRate] = this.getProfit();
    return {maxDrawdownRate: this.currentData.maxDrawdownRate, profit};
  }
  getProfit() {
    const currentAsset = this.currentData.balance + this.currentData.volume * this.currentData.lastPrice;
    const initialAsset = this.initData.balance + this.initData.volume * this.initData.startPrice;
    const profit = keepDecimalFixed(currentAsset - initialAsset, 4);
    const profitRate = keepDecimalFixed(profit / initialAsset, 4);
    if (currentAsset > this.currentData.maxAssetValue) {
      this.currentData.maxAssetValue = currentAsset;
    }
    const drawdown = (currentAsset - this.currentData.maxAssetValue) / this.currentData.maxAssetValue;
    if (drawdown < this.currentData.maxDrawdownRate) {
      this.currentData.maxDrawdownRate = drawdown;
    }
    return [profit, profitRate];
  }
  getResult() {
    const [profit, profitRate] = this.getProfit();
    return {
      maxDrawdownRate: this.currentData.maxDrawdownRate,
      profit,
      profitRate,
      buyCount: this.currentData.buyCount,
      sellCount: this.currentData.sellCount
    };
  }
  getTrades() {
    return this.trades;
  }
  destroy() {
    this.trades = [];
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Backtest
});
