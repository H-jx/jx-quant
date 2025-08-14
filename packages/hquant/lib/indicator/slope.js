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
var slope_exports = {};
__export(slope_exports, {
  KlineState: () => KlineState,
  Slope: () => Slope
});
module.exports = __toCommonJS(slope_exports);
var import_CircularQueue = require("../common/CircularQueue");
var KlineState = /* @__PURE__ */ (function(KlineState2) {
  KlineState2[KlineState2["AcceleratingUp"] = 3] = "AcceleratingUp";
  KlineState2[KlineState2["SteadyUp"] = 2] = "SteadyUp";
  KlineState2[KlineState2["DeceleratingUp"] = 1] = "DeceleratingUp";
  KlineState2[KlineState2["AcceleratingDown"] = -3] = "AcceleratingDown";
  KlineState2[KlineState2["SteadyDown"] = -2] = "SteadyDown";
  KlineState2[KlineState2["DeceleratingDown"] = -1] = "DeceleratingDown";
  KlineState2[KlineState2["Mixed"] = 0] = "Mixed";
  return KlineState2;
})({});
function calculatePrices(klineList) {
  return klineList.map((k) => (k.high + k.low + k.close) / 3);
}
__name(calculatePrices, "calculatePrices");
const _Slope = class _Slope {
  constructor({ epsilon, maxHistoryLength }) {
    __publicField(this, "buffer");
    __publicField(this, "result");
    __publicField(this, "period", 6);
    __publicField(this, "maxHistoryLength", 60);
    __publicField(this, "epsilon", 0.2);
    __publicField(this, "key", "close");
    this.epsilon = epsilon;
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.buffer = new import_CircularQueue.CircularQueue(3);
    this.result = new import_CircularQueue.CircularQueue(this.maxHistoryLength);
  }
  calculateSlope() {
    if (this.buffer.size() < this.period) {
      return 0;
    }
    const raw = this.buffer.toArray();
    const prices = calculatePrices(raw);
    if (prices.length < 3) return 0;
    const P0 = prices[0];
    const P1 = prices[Math.floor(prices.length / 2)];
    const P2 = prices[prices.length - 1];
    const slope1 = P1 - P0;
    const slope2 = P2 - P1;
    const deltaSlope = slope2 - slope1;
    const epsilon = this.epsilon || 1e-6;
    const absS1 = Math.abs(slope1);
    const absS2 = Math.abs(slope2);
    const isUp = slope1 >= -epsilon && slope2 > epsilon;
    const isDown = slope1 <= epsilon && slope2 < -epsilon;
    if (isUp && absS1 > epsilon && absS2 > epsilon) {
      if (deltaSlope > epsilon) return 3;
      if (Math.abs(deltaSlope) <= epsilon) return 2;
      return 1;
    }
    if (isDown && absS1 > epsilon && absS2 > epsilon) {
      if (deltaSlope < -epsilon) return -3;
      if (Math.abs(deltaSlope) <= epsilon) return -2;
      return -1;
    }
    return 0;
  }
  add(data) {
    this.buffer.push(data);
    const slope = this.calculateSlope();
    this.result.push(slope);
    return slope;
  }
  updateLast(data) {
    this.buffer.update(this.buffer.size() - 1, data);
    const slope = this.calculateSlope();
    this.result.update(this.result.size() - 1, slope);
    return slope;
  }
  getValue(index = -1) {
    if (index < 0) {
      return this.result.get(this.result.size() + index);
    }
    return this.result.get(index);
  }
};
__name(_Slope, "Slope");
let Slope = _Slope;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KlineState,
  Slope
});
