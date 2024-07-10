var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};
var __reExport = (target, module2, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && key !== "default")
        __defProp(target, key, {get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable});
  }
  return target;
};
var __toModule = (module2) => {
  return __reExport(__markAsModule(__defProp(module2 != null ? __create(__getProtoOf(module2)) : {}, "default", module2 && module2.__esModule && "default" in module2 ? {get: () => module2.default, enumerable: true} : {value: module2, enumerable: true})), module2);
};

// src/Quant.ts
__markAsModule(exports);
__export(exports, {
  Quant: () => Quant
});
var import_events = __toModule(require("events"));

// src/common/CircularQueue.ts
var CircularQueue = class {
  constructor(maxSize) {
    this.front = 0;
    this.rear = 0;
    this.maxSize = maxSize;
    this.queue = new Array(maxSize);
  }
  push(item) {
    if (this.rear == this.front && this.queue[this.front] !== void 0) {
      this.front = (this.front + 1) % this.maxSize;
    }
    this.queue[this.rear] = item;
    this.rear = (this.rear + 1) % this.maxSize;
    return true;
  }
  shift() {
    if (this.size() == 0) {
      return void 0;
    }
    const item = this.queue[this.front];
    this.front = (this.front + 1) % this.maxSize;
    return item;
  }
  pop() {
    if (this.size() == 0) {
      return void 0;
    }
    const item = this.queue[this.rear - 1];
    this.rear = (this.rear - 1) % this.maxSize;
    return item;
  }
  update(index, item) {
    if (index < 0 || index >= this.maxSize) {
      return false;
    }
    const i = (this.front + index) % this.maxSize;
    this.queue[i] = item;
    return true;
  }
  clear() {
    this.queue = new Array(this.maxSize);
    this.front = 0;
    this.rear = 0;
  }
  size() {
    if (this.queue[0] === void 0) {
      return 0;
    }
    return this.front >= this.rear ? this.maxSize - this.front + this.rear : this.rear - this.front;
  }
  get(index) {
    const i = (this.front + index) % this.maxSize;
    return this.queue[i];
  }
  getLast() {
    return this.get(this.size() - 1);
  }
  toArray() {
    const res = [];
    let size = this.size();
    let i = this.front;
    while (size > 0 && this.queue[i] !== void 0) {
      res.push(this.queue[i]);
      i = (i + 1) % this.maxSize;
      size--;
    }
    return res;
  }
};

// src/util.ts
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

// src/Quant.ts
var Quant = class {
  constructor({maxHistoryLength = 2e3} = {}) {
    this.eventEmitter = new import_events.EventEmitter();
    this.indicators = new Map();
    this.strategies = new Map();
    this.signals = new Map();
    this.maxHistoryLength = maxHistoryLength;
    this.history = new CircularQueue(maxHistoryLength);
  }
  static tramsformData(data) {
    return data.map((item) => {
      return {
        open: autoToFixed(item.open),
        close: autoToFixed(item.close),
        low: autoToFixed(item.low),
        high: autoToFixed(item.high),
        volume: autoToFixed(item.volume),
        sell: item.sell ? autoToFixed(item.sell) : void 0,
        buy: item.buy ? autoToFixed(item.buy) : void 0,
        timestamp: item.timestamp
      };
    });
  }
  getSignal(name) {
    return this.signals.get(name);
  }
  getIndicator(name) {
    return this.indicators.get(name);
  }
  getIndicators() {
    return this.indicators;
  }
  getStrategies() {
    return this.strategies;
  }
  addIndicator(name, indicator) {
    indicator.maxHistoryLength = this.maxHistoryLength;
    indicator._quant = this;
    this.indicators.set(name, indicator);
  }
  addStrategy(name, strategy) {
    this.strategies.set(name, strategy);
  }
  removeIndicator(name) {
    this.indicators.delete(name);
  }
  removeStrategy(name) {
    this.strategies.delete(name);
  }
  addData(data) {
    this.history.push(data);
    this.currentData = data;
    this.updateIndicators(data);
    this.updateStrategies();
  }
  updateLastData(data) {
    if (this.history.size() > 0) {
      this.currentData = data;
      this.history.update(this.history.size() - 1, data);
      this.updateIndicators(data, true);
      this.updateStrategies();
    }
  }
  updateIndicators(data, updateLast = false) {
    try {
      for (const [name, indicator] of this.indicators) {
        if (updateLast) {
          indicator.updateLast(data);
        } else {
          indicator.add(data);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }
  updateStrategies() {
    for (const [name, strategy] of this.strategies) {
      try {
        const currentSignal = strategy(this.indicators, this.currentData);
        this.signals.set(name, currentSignal);
        if (currentSignal) {
          this.eventEmitter.emit(name, currentSignal, this.currentData);
        }
      } catch (error) {
        console.error(error);
      }
    }
    this.eventEmitter.emit("all", this.signals, this.currentData);
  }
  onSignal(name, callback) {
    this.eventEmitter.on(name, callback);
  }
  triggerSignal(name, signal) {
    this.signals.set(name, signal);
    this.eventEmitter.emit(name, signal, this.currentData);
  }
  destroy() {
    this.indicators.clear();
    this.strategies.clear();
    this.signals.clear();
    this.history.clear();
    this.currentData = void 0;
    this.eventEmitter.removeAllListeners();
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Quant
});
