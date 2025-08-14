"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var util_exports = {};
__export(util_exports, {
  autoToFixed: () => autoToFixed,
  keepDecimalFixed: () => keepDecimalFixed
});
module.exports = __toCommonJS(util_exports);
const keepDecimalFixed = /* @__PURE__ */ __name((value, digits = 2) => {
  const unit = Math.pow(10, digits);
  const val = typeof value === "number" ? value : Number(value);
  return Math.trunc(val * unit) / unit;
}, "keepDecimalFixed");
function numlen(num) {
  let len = 0;
  let value = num;
  while (value >= 10) {
    len++;
    value /= 10;
  }
  return len;
}
__name(numlen, "numlen");
const decimalZeroDigitsReg = /^-?(\d+)\.?([0]*)/;
function autoToFixed(value) {
  value = typeof value === "string" ? value : String(value);
  const match = value.match(decimalZeroDigitsReg);
  const recommendDigit = 5 - (match ? match[1].length : 0);
  return keepDecimalFixed(value, recommendDigit < 2 ? 1 : recommendDigit);
}
__name(autoToFixed, "autoToFixed");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  autoToFixed,
  keepDecimalFixed
});
