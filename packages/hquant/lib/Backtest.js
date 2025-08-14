"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var Backtest_exports = {};
__export(Backtest_exports, {
  Backtest: () => Backtest
});
module.exports = __toCommonJS(Backtest_exports);
var import_dayjs = __toESM(require("dayjs"));
var import_util = require("./util");
const _Backtest = class _Backtest {
  constructor(options) {
    /**
    * 交易费率
    */
    __publicField(this, "transactFeeRate", {
      "makerFeeRate": 44e-5,
      "takerFeeRate": 44e-5
    });
    __publicField(this, "tradeVolume");
    __publicField(this, "trades", []);
    __publicField(this, "currentData", {
      balance: 0,
      volume: 0,
      lastPrice: 0,
      maxDrawdownRate: 0,
      maxAssetValue: 0,
      buyCount: 0,
      sellCount: 0
    });
    __publicField(this, "initData", {
      balance: 0,
      volume: 0,
      startPrice: 0
    });
    this.initData.balance = options.balance;
    this.initData.volume = options.volume;
    this.tradeVolume = options.tradeVolume || 0;
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
      const volume = typeof this.tradeVolume === "function" ? this.tradeVolume(price) : data.volume || 0;
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
      this.trades.push({
        time: (0, import_dayjs.default)(bar.timestamp).format("YYYY-MM-DD HH:mm:ss"),
        price,
        volume,
        action,
        profit: this.getProfit()[1]
      });
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
    return {
      maxDrawdownRate: this.currentData.maxDrawdownRate,
      profit
    };
  }
  /** 获取收益*/
  getProfit() {
    const currentAsset = this.currentData.balance + this.currentData.volume * this.currentData.lastPrice;
    const initialAsset = this.initData.balance + this.initData.volume * this.initData.startPrice;
    const profit = (0, import_util.keepDecimalFixed)(currentAsset - initialAsset, 4);
    const profitRate = (0, import_util.keepDecimalFixed)(profit / initialAsset, 4);
    if (currentAsset > this.currentData.maxAssetValue) {
      this.currentData.maxAssetValue = currentAsset;
    }
    const drawdown = (currentAsset - this.currentData.maxAssetValue) / this.currentData.maxAssetValue;
    if (drawdown < this.currentData.maxDrawdownRate) {
      this.currentData.maxDrawdownRate = drawdown;
    }
    return [
      profit,
      profitRate
    ];
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
__name(_Backtest, "Backtest");
let Backtest = _Backtest;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Backtest
});
