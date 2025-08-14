"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var LongShortRatio_exports = {};
__export(LongShortRatio_exports, {
  LongShortRatio: () => LongShortRatio
});
module.exports = __toCommonJS(LongShortRatio_exports);
var import_CircularQueue = require("../common/CircularQueue");
const _LongShortRatio = class _LongShortRatio {
  constructor({ period, shortRatio, maxHistoryLength }) {
    __publicField(this, "longProfitQueue");
    __publicField(this, "shortProfitQueue");
    __publicField(this, "period");
    __publicField(this, "shortRatio");
    __publicField(this, "maxHistoryLength", 120);
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.longProfitQueue = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
    this.shortProfitQueue = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
    this.period = period;
    this.shortRatio = shortRatio;
  }
  add(data) {
    const longProfit = this.calculateLongProfit(data.close);
    const shortProfit = this.calculateShortProfit(data.close);
    this.longProfitQueue.push(longProfit);
    this.shortProfitQueue.push(shortProfit);
  }
  updateLast(data) {
    const longProfit = this.calculateLongProfit(data.close);
    const shortProfit = this.calculateShortProfit(data.close);
    const lastIndex = this.longProfitQueue.size() - 1;
    this.longProfitQueue.update(lastIndex, longProfit);
    this.shortProfitQueue.update(lastIndex, shortProfit);
  }
  getValue(index = -1) {
    const i = index < 0 ? this.longProfitQueue.size() + index : index;
    const longProfit = this.longProfitQueue.get(i);
    const shortProfit = this.shortProfitQueue.get(i);
    const adjustedShortProfit = longProfit * this.shortRatio;
    if (adjustedShortProfit >= shortProfit) {
      return -1;
    } else {
      return 1;
    }
  }
  calculateLongProfit(currentPrice) {
    const highestPrice = Math.max(...this.longProfitQueue.toArray().slice(-this.period));
    return (currentPrice - highestPrice) / highestPrice * 100;
  }
  calculateShortProfit(currentPrice) {
    const lowestPrice = Math.min(...this.shortProfitQueue.toArray().slice(-this.period));
    return (lowestPrice - currentPrice) / lowestPrice * 100;
  }
};
__name(_LongShortRatio, "LongShortRatio");
let LongShortRatio = _LongShortRatio;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LongShortRatio
});
