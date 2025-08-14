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
var vri_exports = {};
__export(vri_exports, {
  VRI: () => VRI
});
module.exports = __toCommonJS(vri_exports);
var import_CircularQueue = require("../common/CircularQueue");
var import_util = require("../util");
const _VRI = class _VRI {
  constructor({ period }) {
    __publicField(this, "period");
    __publicField(this, "buffer");
    __publicField(this, "result");
    __publicField(this, "maxHistoryLength", 120);
    this.period = period;
    this.buffer = new import_CircularQueue.CircularQueue(period);
    this.result = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
  }
  add(data) {
    this.buffer.push(data);
    if (this.buffer.size() === this.period) {
      this.result.push(this.calcVRI());
    }
  }
  updateLast(data) {
    if (this.buffer.size() > 0) {
      this.buffer.update(this.buffer.size() - 1, data);
      if (this.buffer.size() === this.period) {
        this.result.update(this.result.size() - 1, this.calcVRI());
      }
    }
  }
  /**
  * 量比 = 当前周期成交量 / 历史平均成交量
  */
  calcVRI() {
    const size = this.buffer.size();
    if (size < 2) return 0;
    let currVolume = 0;
    let sumVolume = 0;
    for (let i = 0; i < size; i++) {
      const v = this.buffer.get(i).volume;
      if (i === size - 1) {
        currVolume = v;
      } else {
        sumVolume += v;
      }
    }
    const avgVolume = sumVolume / (size - 1);
    const ratio = avgVolume > 0 ? currVolume / avgVolume : 0;
    return (0, import_util.keepDecimalFixed)(ratio, 2);
  }
  getValue(index = -1) {
    if (index < 0) {
      return this.result.get(this.result.size() + index);
    }
    return this.result.get(index);
  }
};
__name(_VRI, "VRI");
let VRI = _VRI;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VRI
});
