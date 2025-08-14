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
var macd_exports = {};
__export(macd_exports, {
  MACD: () => MACD
});
module.exports = __toCommonJS(macd_exports);
var import_CircularQueue = require("../common/CircularQueue");
var import_ma = require("./ma");
const _MACD = class _MACD {
  constructor({ shortTermPeriod, longTermPeriod, signalLinePeriod, maxHistoryLength }) {
    __publicField(this, "shortTermMA");
    __publicField(this, "longTermMA");
    __publicField(this, "signalLineMA");
    __publicField(this, "macdLine");
    __publicField(this, "signalLine");
    __publicField(this, "maxHistoryLength", 120);
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.shortTermMA = new import_ma.MA({
      period: shortTermPeriod,
      maxHistoryLength: this.maxHistoryLength,
      key: void 0
    });
    this.longTermMA = new import_ma.MA({
      period: longTermPeriod,
      maxHistoryLength: this.maxHistoryLength,
      key: void 0
    });
    this.signalLineMA = new import_ma.MA({
      period: signalLinePeriod,
      maxHistoryLength: this.maxHistoryLength,
      key: void 0
    });
    this.macdLine = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
    this.signalLine = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
  }
  add(data) {
    const shortTermMAValue = this.shortTermMA.add(data.close);
    const longTermMAValue = this.longTermMA.add(data.close);
    const macdValue = shortTermMAValue - longTermMAValue;
    this.macdLine.push(macdValue);
    if (this.macdLine.size() >= this.signalLineMA.getValue()) {
      const signalLineValue = this.signalLineMA.add(macdValue);
      this.signalLine.push(signalLineValue);
    }
  }
  updateLast(data) {
    const shortTermMAValue = this.shortTermMA.updateLast(data.close);
    const longTermMAValue = this.longTermMA.updateLast(data.close);
    const macdValue = shortTermMAValue - longTermMAValue;
    const lastIndex = this.macdLine.size() - 1;
    this.macdLine.update(lastIndex, macdValue);
    if (this.macdLine.size() >= this.signalLineMA.getValue()) {
      const signalLineValue = this.signalLineMA.updateLast(macdValue);
      this.signalLine.update(lastIndex, signalLineValue);
    }
  }
  getValue(index = -1) {
    const i = index < 0 ? this.macdLine.size() + index : index;
    return {
      macd: this.macdLine.get(i),
      signalLine: this.signalLine.get(i)
    };
  }
};
__name(_MACD, "MACD");
let MACD = _MACD;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MACD
});
