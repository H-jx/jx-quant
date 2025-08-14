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
var SharedBufferQueue_exports = {};
__export(SharedBufferQueue_exports, {
  SharedBufferQueue: () => SharedBufferQueue
});
module.exports = __toCommonJS(SharedBufferQueue_exports);
const _SharedBufferQueue = class _SharedBufferQueue {
  constructor(maxSize) {
    __publicField(this, "buffer");
    __publicField(this, "maxSize");
    __publicField(this, "front", 0);
    __publicField(this, "rear", 0);
    __publicField(this, "filled", false);
    this.maxSize = maxSize;
    const sab = new SharedArrayBuffer(maxSize * Float64Array.BYTES_PER_ELEMENT);
    this.buffer = new Float64Array(sab);
  }
  push(item) {
    this.buffer[this.rear] = item;
    this.rear = (this.rear + 1) % this.maxSize;
    if (this.filled) {
      this.front = (this.front + 1) % this.maxSize;
    } else if (this.rear === this.front) {
      this.filled = true;
    }
    return true;
  }
  get(index) {
    if (!this.filled && index >= this.rear) throw new RangeError("Index out of range");
    const i = (this.front + index) % this.maxSize;
    return this.buffer[i];
  }
  size() {
    return this.filled ? this.maxSize : this.rear;
  }
  clear() {
    this.front = 0;
    this.rear = 0;
    this.filled = false;
    this.buffer.fill(0);
  }
  toArray() {
    const res = [];
    let size = this.size();
    let i = this.front;
    while (size > 0) {
      res.push(this.buffer[i]);
      i = (i + 1) % this.maxSize;
      size--;
    }
    return res;
  }
};
__name(_SharedBufferQueue, "SharedBufferQueue");
let SharedBufferQueue = _SharedBufferQueue;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SharedBufferQueue
});
