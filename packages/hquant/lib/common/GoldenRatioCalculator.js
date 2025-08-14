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
var GoldenRatioCalculator_exports = {};
__export(GoldenRatioCalculator_exports, {
  GoldenRatioCalculator: () => GoldenRatioCalculator
});
module.exports = __toCommonJS(GoldenRatioCalculator_exports);
const _GoldenRatioCalculator = class _GoldenRatioCalculator {
  constructor(ratio = 0.618) {
    __publicField(this, "ratio");
    this.ratio = ratio;
  }
  calculate({ value, min }) {
    const result = [];
    let remainingValue = value;
    while (remainingValue > min) {
      const nextValue = remainingValue * this.ratio;
      result.push(nextValue);
      remainingValue -= nextValue;
    }
    return result;
  }
};
__name(_GoldenRatioCalculator, "GoldenRatioCalculator");
let GoldenRatioCalculator = _GoldenRatioCalculator;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GoldenRatioCalculator
});
