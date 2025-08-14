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
var Quant_exports = {};
__export(Quant_exports, {
  Quant: () => Quant
});
module.exports = __toCommonJS(Quant_exports);
var import_events = require("events");
var import_CircularQueue = require("./common/CircularQueue");
var import_util = require("./util");
const _Quant = class _Quant {
  // A constructor that initializes the maps
  constructor({ maxHistoryLength = 240 } = {}) {
    // A map of technical indicators by name
    __publicField(this, "indicators");
    // A map of trading strategies by name
    __publicField(this, "strategies");
    __publicField(this, "eventEmitter", new import_events.EventEmitter());
    __publicField(this, "history");
    // The current data that the framework is processing
    __publicField(this, "currentData");
    __publicField(this, "signals");
    __publicField(this, "maxHistoryLength");
    this.indicators = /* @__PURE__ */ new Map();
    this.strategies = /* @__PURE__ */ new Map();
    this.signals = /* @__PURE__ */ new Map();
    this.maxHistoryLength = maxHistoryLength;
    this.history = new import_CircularQueue.CircularQueue(maxHistoryLength);
  }
  static tramsformData(data) {
    return data.map((item) => {
      return {
        open: (0, import_util.autoToFixed)(item.open),
        close: (0, import_util.autoToFixed)(item.close),
        low: (0, import_util.autoToFixed)(item.low),
        high: (0, import_util.autoToFixed)(item.high),
        volume: (0, import_util.autoToFixed)(item.volume),
        sell: item.sell ? (0, import_util.autoToFixed)(item.sell) : void 0,
        buy: item.buy ? (0, import_util.autoToFixed)(item.buy) : void 0,
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
  // A method that adds a technical indicator to the framework
  addIndicator(name, indicator) {
    indicator.maxHistoryLength = this.maxHistoryLength;
    indicator._quant = this;
    this.indicators.set(name, indicator);
  }
  // A method that adds a trading strategy to the framework
  addStrategy(name, strategy) {
    this.strategies.set(name, strategy);
  }
  // A method that removes a technical indicator from the framework
  removeIndicator(name) {
    this.indicators.delete(name);
  }
  // A method that removes a trading strategy from the framework
  removeStrategy(name) {
    this.strategies.delete(name);
  }
  /** 添加新数据 */
  addData(data) {
    this.history.push(data);
    this.currentData = data;
    this.updateIndicators(data);
    this.updateStrategies();
  }
  /** 更新最后一条数据 */
  updateLastData(data) {
    if (this.history.size() > 0) {
      this.currentData = data;
      this.history.update(this.history.size() - 1, data);
      this.updateIndicators(data, true);
      this.updateStrategies();
    }
  }
  /** 更新所有指标 */
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
  /** 更新所有交易策略，并根据结果发射的信号 */
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
  // A method that destroys the framework and frees up resources
  destroy() {
    this.indicators.clear();
    this.strategies.clear();
    this.signals.clear();
    this.history.clear();
    this.currentData = void 0;
    this.eventEmitter.removeAllListeners();
  }
};
__name(_Quant, "Quant");
let Quant = _Quant;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Quant
});
