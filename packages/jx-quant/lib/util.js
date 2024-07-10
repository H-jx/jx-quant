var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/util.ts
__markAsModule(exports);
__export(exports, {
  autoToFixed: () => autoToFixed,
  keepDecimalFixed: () => keepDecimalFixed
});
var keepDecimalFixed = (value, digits = 2) => {
  const unit = Math.pow(10, digits);
  const val = typeof value === "number" ? value : Number(value);
  return Math.trunc(val * unit) / unit;
};
var decimalZeroDigitsReg = /^-?(\d+)\.?([0]*)/;
function autoToFixed(value) {
  value = typeof value === "string" ? value : String(value);
  const match = value.match(decimalZeroDigitsReg);
  const recommendDigit = 5 - (match ? match[1].length : 0);
  return keepDecimalFixed(value, recommendDigit < 2 ? 1 : recommendDigit);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  autoToFixed,
  keepDecimalFixed
});
