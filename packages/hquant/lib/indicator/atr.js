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
var atr_exports = {};
__export(atr_exports, {
  ATR: () => ATR
});
module.exports = __toCommonJS(atr_exports);
var import_CircularQueue = require("../common/CircularQueue");
const _ATR = class _ATR {
  constructor({ period, maxHistoryLength }) {
    __publicField(this, "buffer");
    __publicField(this, "period");
    __publicField(this, "result");
    __publicField(this, "maxHistoryLength", 120);
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.period = period;
    this.buffer = new import_CircularQueue.CircularQueue(period);
    this.result = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
  }
  // 计算单个K线的真实波幅
  getTrueRange(curr, prev) {
    if (!prev) return curr.high - curr.low;
    return Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
  }
  add(data) {
    this.buffer.push(data);
    if (this.buffer.size() < this.period) {
      this.result.push(NaN);
      return;
    }
    let trSum = 0;
    for (let i = 0; i < this.period; i++) {
      const curr = this.buffer.get(i);
      const prev = i > 0 ? this.buffer.get(i - 1) : void 0;
      trSum += this.getTrueRange(curr, prev);
    }
    const atr = trSum / this.period;
    this.result.push(atr);
  }
  updateLast(data) {
    if (this.buffer.size() === 0) return;
    this.buffer.update(this.buffer.size() - 1, data);
    this.add(data);
  }
  getValue(index = -1) {
    return this.result.get(index < 0 ? this.result.size() - 1 : index);
  }
};
__name(_ATR, "ATR");
let ATR = _ATR;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ATR
});
