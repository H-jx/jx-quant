var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/common/GoldenRatioCalculator.ts
__markAsModule(exports);
__export(exports, {
  GoldenRatioCalculator: () => GoldenRatioCalculator
});
var GoldenRatioCalculator = class {
  constructor(ratio = 0.618) {
    this.ratio = ratio;
  }
  calculate({value, min}) {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GoldenRatioCalculator
});
