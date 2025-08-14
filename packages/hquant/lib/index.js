"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
__export(index_exports, {
  AverageQueue: () => import_AverageQueue.AverageQueue,
  CircularQueue: () => import_CircularQueue.CircularQueue,
  GoldenRatioCalculator: () => import_GoldenRatioCalculator.GoldenRatioCalculator,
  Quant: () => import_Quant.Quant,
  SharedBufferQueue: () => import_SharedBufferQueue.SharedBufferQueue
});
module.exports = __toCommonJS(index_exports);
var import_Quant = require("./Quant");
var import_CircularQueue = require("./common/CircularQueue");
var import_AverageQueue = require("./common/AverageQueue");
var import_GoldenRatioCalculator = require("./common/GoldenRatioCalculator");
var import_SharedBufferQueue = require("./common/SharedBufferQueue");
__reExport(index_exports, require("./interface"), module.exports);
__reExport(index_exports, require("./indicator/slope"), module.exports);
__reExport(index_exports, require("./indicator/boll"), module.exports);
__reExport(index_exports, require("./indicator/ma"), module.exports);
__reExport(index_exports, require("./indicator/rsi"), module.exports);
__reExport(index_exports, require("./indicator/atr"), module.exports);
__reExport(index_exports, require("./indicator/vri"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AverageQueue,
  CircularQueue,
  GoldenRatioCalculator,
  Quant,
  SharedBufferQueue,
  ...require("./interface"),
  ...require("./indicator/slope"),
  ...require("./indicator/boll"),
  ...require("./indicator/ma"),
  ...require("./indicator/rsi"),
  ...require("./indicator/atr"),
  ...require("./indicator/vri")
});
