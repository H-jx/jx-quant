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
var boll_exports = {};
__export(boll_exports, {
  BOLL: () => BOLL
});
module.exports = __toCommonJS(boll_exports);
var import_CircularQueue = require("../common/CircularQueue");
var import_util = require("../util");
var import_ma = require("./ma");
const _BOLL = class _BOLL {
  constructor({ period, stdDevFactor, maxHistoryLength }) {
    __publicField(this, "ma");
    __publicField(this, "stdDevQueue");
    __publicField(this, "upperBand");
    __publicField(this, "midBand");
    __publicField(this, "lowerBand");
    __publicField(this, "stdDevFactor");
    __publicField(this, "maxHistoryLength", 120);
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.ma = new import_ma.MA({
      period,
      maxHistoryLength: this.maxHistoryLength,
      key: void 0
    });
    this.stdDevQueue = new import_CircularQueue.CircularQueue(period);
    this.upperBand = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
    this.midBand = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
    this.lowerBand = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
    this.stdDevFactor = stdDevFactor;
  }
  add(data) {
    const maValue = this.ma.add(data.close);
    this.stdDevQueue.push(data.close);
    const stdDev = this.calculateStdDev();
    if (isNaN(stdDev)) {
      this.upperBand.push(NaN);
      this.midBand.push(NaN);
      this.lowerBand.push(NaN);
    } else {
      const upperBand = maValue + this.stdDevFactor * stdDev;
      const midBand = maValue;
      const lowerBand = maValue - this.stdDevFactor * stdDev;
      this.upperBand.push(upperBand);
      this.midBand.push(midBand);
      this.lowerBand.push(lowerBand);
    }
  }
  updateLast(data) {
    const maValue = this.ma.updateLast(data.close);
    const stdDev = this.calculateStdDev();
    if (isNaN(stdDev)) {
      const lastIndex = this.upperBand.size() - 1;
      this.upperBand.update(lastIndex, NaN);
      this.midBand.update(lastIndex, NaN);
      this.lowerBand.update(lastIndex, NaN);
    } else {
      const upperBand = maValue + this.stdDevFactor * stdDev;
      const midBand = maValue;
      const lowerBand = maValue - this.stdDevFactor * stdDev;
      const lastIndex = this.upperBand.size() - 1;
      this.upperBand.update(lastIndex, upperBand);
      this.midBand.update(lastIndex, midBand);
      this.lowerBand.update(lastIndex, lowerBand);
    }
  }
  getValue(index = -1) {
    const i = index < 0 ? this.upperBand.size() + index : index;
    return {
      up: (0, import_util.keepDecimalFixed)(this.upperBand.get(i), 4),
      mid: (0, import_util.keepDecimalFixed)(this.midBand.get(i), 4),
      low: (0, import_util.keepDecimalFixed)(this.lowerBand.get(i), 4)
    };
  }
  calculateStdDev() {
    const values = this.stdDevQueue.toArray();
    const validValues = values.filter((v) => v != null);
    if (validValues.length < this.stdDevFactor) {
      return NaN;
    }
    const avg = this.ma.getValue(-1);
    const squareDiffs = values.map((value) => {
      const diff = value - avg;
      return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }
};
__name(_BOLL, "BOLL");
let BOLL = _BOLL;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BOLL
});
