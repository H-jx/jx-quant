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
var AverageQueue_exports = {};
__export(AverageQueue_exports, {
  AverageQueue: () => AverageQueue
});
module.exports = __toCommonJS(AverageQueue_exports);
var import_CircularQueue = require("./CircularQueue");
const _AverageQueue = class _AverageQueue {
  constructor(maxLen) {
    __publicField(this, "queue");
    this.queue = new import_CircularQueue.CircularQueue(maxLen);
  }
  push(value) {
    this.queue.push(value);
  }
  calc() {
    let sum = 0;
    for (let i = 0; i < this.queue.size(); i++) {
      const element = this.queue.get(i);
      sum += element;
    }
    return sum / this.queue.size();
  }
};
__name(_AverageQueue, "AverageQueue");
let AverageQueue = _AverageQueue;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AverageQueue
});
