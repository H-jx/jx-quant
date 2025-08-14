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
var ma_exports = {};
__export(ma_exports, {
  MA: () => MA
});
module.exports = __toCommonJS(ma_exports);
var import_CircularQueue = require("../common/CircularQueue");
const _MA = class _MA {
  constructor({ period, maxHistoryLength, key }) {
    __publicField(this, "buffer");
    __publicField(this, "period");
    __publicField(this, "result");
    __publicField(this, "maxHistoryLength", 120);
    __publicField(this, "key");
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.period = period;
    this.key = key || "close";
    this.buffer = new import_CircularQueue.CircularQueue(period);
    this.result = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
  }
  getPeriodSum() {
    let sum = 0;
    for (let i = 0; i < this.buffer.size(); i++) {
      const value = this.buffer.get(i) || 0;
      sum += value;
    }
    return sum;
  }
  add(data) {
    const value = typeof data === "number" ? data : data[this.key];
    if (typeof value !== "number") {
      console.warn("ma", this.key, data[this.key]);
    }
    this.buffer.push(value);
    const size = Math.min(this.period, this.buffer.size());
    const ma = this.buffer.size() < this.period ? NaN : this.getPeriodSum() / size;
    this.result.push(ma);
    return ma;
  }
  updateLast(data) {
    const value = typeof data === "number" ? data : data[this.key];
    this.buffer.update(this.buffer.size() - 1, value);
    const size = Math.min(this.period, this.buffer.size());
    const ma = this.getPeriodSum() / size;
    this.result.update(this.result.size() - 1, ma);
    return ma;
  }
  getValue(index = -1) {
    if (index < 0) {
      return this.result.get(this.result.size() + index);
    }
    return this.result.get(index);
  }
};
__name(_MA, "MA");
let MA = _MA;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MA
});
