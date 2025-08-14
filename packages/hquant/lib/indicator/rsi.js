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
var rsi_exports = {};
__export(rsi_exports, {
  RSI: () => RSI
});
module.exports = __toCommonJS(rsi_exports);
var import_CircularQueue = require("../common/CircularQueue");
var import_util = require("../util");
const _RSI = class _RSI {
  constructor({ period }) {
    __publicField(this, "period");
    __publicField(this, "values");
    __publicField(this, "avgGain", 0);
    __publicField(this, "avgLoss", 0);
    __publicField(this, "maxHistoryLength", 120);
    this.period = period;
    this.values = new import_CircularQueue.CircularQueue(period);
  }
  add(data) {
    const change = data.close - data.open;
    if (change > 0) {
      this.avgGain = (this.avgGain * (this.period - 1) + change) / this.period;
      this.avgLoss = this.avgLoss * (this.period - 1) / this.period;
    } else {
      this.avgGain = this.avgGain * (this.period - 1) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) - change) / this.period;
    }
    const rs = this.avgGain / this.avgLoss;
    const rsi = (0, import_util.keepDecimalFixed)(100 - 100 / (1 + rs), 2);
    this.values.push(rsi);
  }
  updateLast(data) {
    const change = data.close - data.open;
    let avgGain = 0;
    let avgLoss = 0;
    if (change > 0) {
      avgGain = (this.avgGain * (this.period - 1) + change) / this.period;
      avgLoss = this.avgLoss * (this.period - 1) / this.period;
    } else {
      avgGain = this.avgGain * (this.period - 1) / this.period;
      avgLoss = (this.avgLoss * (this.period - 1) - change) / this.period;
    }
    const rs = avgGain / avgLoss;
    const rsi = (0, import_util.keepDecimalFixed)(100 - 100 / (1 + rs), 2);
    if (this.values.size() > 1) {
      this.values.update(this.values.size() - 1, rsi);
    }
  }
  getValue(index = -1) {
    if (index < 0) {
      return this.values.get(this.values.size() + index);
    }
    return this.values.get(index);
  }
};
__name(_RSI, "RSI");
let RSI = _RSI;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RSI
});
