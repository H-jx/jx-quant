"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
module.exports = __toCommonJS(index_exports);
__reExport(index_exports, require("./Quant"), module.exports);
__reExport(index_exports, require("./common/CircularQueue"), module.exports);
__reExport(index_exports, require("./common/AverageQueue"), module.exports);
__reExport(index_exports, require("./interface"), module.exports);
__reExport(index_exports, require("./indicator/slope"), module.exports);
__reExport(index_exports, require("./indicator/boll"), module.exports);
__reExport(index_exports, require("./indicator/ma"), module.exports);
__reExport(index_exports, require("./indicator/rsi"), module.exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ...require("./Quant"),
  ...require("./common/CircularQueue"),
  ...require("./common/AverageQueue"),
  ...require("./interface"),
  ...require("./indicator/slope"),
  ...require("./indicator/boll"),
  ...require("./indicator/ma"),
  ...require("./indicator/rsi")
});
