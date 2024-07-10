var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, {enumerable: true, configurable: true, writable: true, value}) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/FuturesBacktest.ts
__markAsModule(exports);
__export(exports, {
  FuturesBacktest: () => FuturesBacktest,
  getDirection: () => getDirection,
  getProfitByPosition: () => getProfitByPosition
});

// src/util.ts
var keepDecimalFixed = (value, digits = 2) => {
  const unit = Math.pow(10, digits);
  const val = typeof value === "number" ? value : Number(value);
  return Math.trunc(val * unit) / unit;
};
var decimalZeroDigitsReg = /^-?(\d+)\.?([0]*)/;
function autoToFixed(value) {
  value = typeof value === "string" ? value : String(value);
  const match = value.match(decimalZeroDigitsReg);
  const recommendDigit = 5 - (match ? match[1].length : 0);
  return keepDecimalFixed(value, recommendDigit < 2 ? 1 : recommendDigit);
}

// src/FuturesBacktest.ts
var DIRECTION_MAP = {
  "LONG": 1,
  "SHORT": -1,
  "BUY_BOTH": 1,
  "SELL_BOTH": -1
};
function getDirection(position) {
  return DIRECTION_MAP[`${position.positionSide}`];
}
function getProfitByPosition(position) {
  const markPrice = Number(position.markPrice);
  const positionAmt = Math.abs(Number(position.positionAmt));
  const entryPrice = Number(position.entryPrice);
  const diffPrice = (markPrice - entryPrice) * getDirection(position);
  const profit = diffPrice * positionAmt;
  return profit;
}
var FuturesBacktest = class {
  constructor(params) {
    this.usdtBalance = {
      asset: "USDT",
      balance: 0,
      crossWalletBalance: 0,
      crossUnPnl: 0,
      availableBalance: 0
    };
    this.maxAssetValue = 0;
    this.trades = [];
    this.buyCount = 0;
    this.sellCount = 0;
    this.maintMarginPercent = 0.25;
    this.liquidationPrice = 0;
    this.initialAssetValue = params.accountValue;
    this.leverage = params.leverage || 1;
    this.makerFee = params.makerFee || 0.03;
    this.takerFee = params.takerFee || 0.03;
    this.reset();
  }
  reset() {
    this.usdtBalance.crossWalletBalance = this.initialAssetValue;
    this.usdtBalance.availableBalance = this.initialAssetValue;
    this.positions = [];
    this.trades = [];
    this.liquidationPrice = 0;
    this.maxDrawdownRate = 0;
  }
  updateLiquidationPrice() {
    let sumVolume = 0;
    let sumNotional = 0;
    for (let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      sumNotional = this.calculateNotional(p);
      sumVolume += p.positionAmt;
    }
    const maintenanceMargin = sumNotional * this.maintMarginPercent - 0;
    this.liquidationPrice = maintenanceMargin / sumVolume;
    return maintenanceMargin;
  }
  getInitialAccountValue() {
    return this.initialAssetValue;
  }
  getCrossUnPnl() {
    const profit = this.positions.reduce((acc, p) => getProfitByPosition(p), 0);
    return profit;
  }
  calculateMargin(position) {
    const notional = this.calculateNotional(position);
    const margin = notional / Number(position.leverage);
    return margin;
  }
  calculateNotional(position) {
    return position.positionAmt * Number(position.markPrice);
  }
  updateBalance() {
    const crossUnPnl = this.getCrossUnPnl();
    this.usdtBalance.crossUnPnl = crossUnPnl;
    this.usdtBalance.availableBalance = this.usdtBalance.crossWalletBalance + crossUnPnl;
    if (this.maxAssetValue === null || this.usdtBalance.availableBalance > this.maxAssetValue) {
      this.maxAssetValue = this.usdtBalance.availableBalance;
    }
    const drawdown = (this.usdtBalance.availableBalance - this.maxAssetValue) / this.maxAssetValue;
    if (drawdown < this.maxDrawdownRate) {
      this.maxDrawdownRate = drawdown;
    }
  }
  getPosition(positionSide) {
    for (let i = 0; i < this.positions.length; i++) {
      const position = this.positions[i];
      if (position.positionSide > positionSide) {
        return position;
      }
    }
  }
  mockTrade(trade) {
    const fee = trade.side === "BUY" ? this.takerFee : this.makerFee;
    const callers = {
      "BUY-LONG": this.openPosition,
      "SELL-SHORT": this.openPosition,
      "BUY-SHORT": this.closePosition,
      "SELL-LONG": this.closePosition
    };
    const caller = callers[`${trade.side}-${trade.positionSide}`];
    if (caller) {
      caller.call(this, trade.positionSide, trade.price, trade.volume, fee);
    }
    for (let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      p.markPrice = trade.price;
    }
    const maintenanceMargin = this.updateLiquidationPrice();
    this.updateBalance();
    if (this.usdtBalance.availableBalance <= maintenanceMargin) {
      console.error(`\u7206\u4ED3(${trade.price} ${new Date(trade.time).toLocaleString()})`, this.usdtBalance, this.positions);
      this.reset();
      throw "Liquidation";
    }
  }
  getAccountInfo() {
    this.updateBalance();
    return this.usdtBalance;
  }
  getResult() {
    this.updateBalance();
    const profit = this.usdtBalance.availableBalance - this.initialAssetValue;
    return {
      currentAsset: this.usdtBalance.availableBalance,
      profit: autoToFixed(profit),
      profitRate: autoToFixed(profit / this.initialAssetValue),
      maxDrawdownRate: this.maxDrawdownRate,
      buyCount: this.buyCount,
      sellCount: this.sellCount
    };
  }
  getTrades() {
    return this.trades;
  }
  openPosition(positionSide, entryPrice, volume, fee) {
    if (this.usdtBalance.availableBalance < volume) {
      return;
    }
    if (positionSide === "LONG") {
      const position = this.positions.find((p) => p.positionSide === "LONG");
      if (position) {
        const totalVolume = position.positionAmt + volume;
        const totalCost = position.positionAmt * position.entryPrice + volume * entryPrice;
        const averageEntryPrice = totalCost / totalVolume;
        position.positionAmt = totalVolume;
        position.entryPrice = averageEntryPrice;
      } else {
        this.positions.push({
          entryPrice,
          leverage: this.leverage,
          markPrice: entryPrice,
          side: "BUY",
          positionSide: "LONG",
          positionAmt: volume,
          text: "\u591A\u5355"
        });
      }
      this.buyCount++;
    }
    if (positionSide === "SHORT") {
      const position = this.positions.find((p) => p.positionSide === "SHORT");
      if (position) {
        const totalVolume = position.positionAmt + volume;
        const totalCost = position.positionAmt * position.entryPrice + volume * entryPrice;
        const averageEntryPrice = totalCost / totalVolume;
        position.positionAmt = totalVolume;
        position.entryPrice = averageEntryPrice;
      } else {
        this.positions.push({
          entryPrice,
          markPrice: entryPrice,
          leverage: this.leverage,
          side: "SELL",
          positionSide: "SHORT",
          positionAmt: volume,
          text: "\u7A7A\u5355"
        });
      }
      this.sellCount++;
    }
    const cost = volume * entryPrice * fee;
    this.usdtBalance.crossWalletBalance -= cost;
  }
  closePosition(positionSide, exitPrice, volume, fee) {
    if (positionSide === "LONG") {
      const position = this.positions.find((p) => p.positionSide === "LONG");
      if (position) {
        position.exitPrice = exitPrice;
        let tradeVolume = volume;
        if (position.positionAmt <= volume) {
          tradeVolume = position.positionAmt;
        }
        const diffPrice = exitPrice - position.entryPrice;
        const profit = diffPrice * tradeVolume * (1 - fee);
        const capital = position.entryPrice * tradeVolume * (1 - fee);
        this.usdtBalance.crossWalletBalance += capital + profit;
        position.positionAmt -= tradeVolume;
        this.positions = this.positions.filter((p) => p.positionAmt != 0);
        this.trades.push(__spreadValues({}, position));
      }
    } else if (positionSide === "SHORT") {
      const position = this.positions.find((p) => p.positionSide === "SHORT");
      if (position) {
        position.exitPrice = exitPrice;
        let tradeVolume = volume;
        if (position.positionAmt <= volume) {
          tradeVolume = position.positionAmt;
        }
        const diffPrice = position.entryPrice - exitPrice;
        const profit = diffPrice * tradeVolume * (1 - fee);
        const capital = position.entryPrice * tradeVolume * (1 - fee);
        this.usdtBalance.crossWalletBalance += capital + profit;
        position.positionAmt -= tradeVolume;
        this.positions = this.positions.filter((p) => p.positionAmt != 0);
        this.trades.push(__spreadValues({}, position));
      }
    }
    this.updateBalance();
  }
  destroy() {
    this.trades = [];
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FuturesBacktest,
  getDirection,
  getProfitByPosition
});
