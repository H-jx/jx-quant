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

// src/index.ts
__markAsModule(exports);
__export(exports, {
  AverageQueue: () => AverageQueue,
  BOLL: () => BOLL,
  CircularQueue: () => CircularQueue,
  KlineState: () => KlineState,
  MA: () => MA,
  Quant: () => Quant,
  RSI: () => RSI,
  Slope: () => Slope
});

// src/Quant.ts
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

// src/common/AverageQueue.ts
var AverageQueue = class {
  constructor(maxLen) {
    this.queue = new CircularQueue(maxLen);
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

// src/indicator/slope.ts
var KlineState;
(function(KlineState2) {
  KlineState2[KlineState2["DeceleratingRise"] = 2] = "DeceleratingRise";
  KlineState2[KlineState2["AcceleratingRise"] = 3] = "AcceleratingRise";
  KlineState2[KlineState2["UniformRise"] = 1] = "UniformRise";
  KlineState2[KlineState2["Uniform"] = 0] = "Uniform";
  KlineState2[KlineState2["UniformFall"] = -1] = "UniformFall";
  KlineState2[KlineState2["AcceleratingFall"] = -3] = "AcceleratingFall";
  KlineState2[KlineState2["DeceleratingFall"] = -2] = "DeceleratingFall";
})(KlineState || (KlineState = {}));
var firstDerivative = (y2, y1, x2, x1) => (y2 - y1) / (x2 - x1);
var secondDerivative = (firstDerivative2, firstDerivative1, x2, x1) => (firstDerivative2 - firstDerivative1) / (x2 - x1);
function selectSixPoints(kLines, count = 4) {
  if (kLines.length < count) {
    return kLines;
  }
  const selectedPoints = [kLines[kLines.length - 1]];
  const interval = Math.max(1, Math.floor((kLines.length - 1) / (count - 1)));
  let currentIndex = kLines.length - 1 - interval;
  while (currentIndex > 0 && selectedPoints.length < count) {
    selectedPoints.unshift(kLines[currentIndex]);
    currentIndex -= interval;
  }
  return selectedPoints;
}
function calculatePairwiseAverage(data) {
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const average = (data[i - 1] + data[i]) / 2;
    result.push(average);
  }
  return result;
}
var Slope = class {
  constructor({maxHistoryLength, key, period, slopeTolerant}) {
    this.maxHistoryLength = 1e3;
    this.slopeTolerant = 0.2;
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.slopeTolerant = slopeTolerant || 0.2;
    this.period = period;
    this.key = key || "close";
    this.buffer = new CircularQueue(this.period);
    this.result = new CircularQueue(this.maxHistoryLength);
  }
  calculateSlope() {
    if (this.buffer.size() < this.period) {
      return 0;
    }
    const firstDerivatives = [];
    const secondDerivatives = [];
    const buffers = this.buffer.toArray();
    const filters = selectSixPoints(calculatePairwiseAverage(buffers), 3);
    let max = buffers[0];
    let min = buffers[0];
    for (let i = 1; i < buffers.length; i++) {
      if (buffers[i] > max) {
        max = buffers[i];
      }
      if (buffers[i] < min) {
        min = buffers[i];
      }
    }
    const DIS = max - min;
    for (let i = 1; i < filters.length; i++) {
      const firstDerivativeValue = firstDerivative(filters[i], filters[i - 1], i, i - 1);
      firstDerivatives.push(firstDerivativeValue);
    }
    for (let i = 1; i < firstDerivatives.length; i++) {
      const secondDerivativeValue = secondDerivative(firstDerivatives[i], firstDerivatives[i - 1], i, i - 1);
      secondDerivatives.push(secondDerivativeValue);
    }
    const changeRage = (this.buffer.getLast() - this.buffer.get(0)) / this.buffer.get(0);
    const slopeValue = secondDerivatives[0] / DIS;
    const tolerant = 2e-3;
    const slopeTolerant = this.slopeTolerant;
    if (changeRage > tolerant) {
      if (slopeValue > slopeTolerant) {
        return 3;
      } else if (slopeValue < -slopeTolerant) {
        return 2;
      } else {
        return 1;
      }
    } else if (changeRage < -tolerant) {
      if (slopeValue < -slopeTolerant) {
        return -3;
      } else if (slopeValue > slopeTolerant) {
        return -2;
      } else {
        return -1;
      }
    } else {
      return 0;
    }
  }
  add(data) {
    const value = typeof data === "number" ? data : data[this.key];
    if (typeof value !== "number") {
      console.warn(value, this.key, data);
    }
    this.buffer.push(value);
    const slope = this.calculateSlope();
    this.result.push(slope);
    return slope;
  }
  updateLast(data) {
    const value = typeof data === "number" ? data : data[this.key];
    this.buffer.update(this.buffer.size() - 1, value);
    const slope = this.calculateSlope();
    this.result.update(this.result.size() - 1, slope);
    return slope;
  }
  getValue(index = -1) {
    if (index < 0) {
      return this.result.get(this.result.size() + index);
    }
    return this.result.get(index);
  }
};

// src/indicator/ma.ts
var MA = class {
  constructor({period, maxHistoryLength, key}) {
    this.maxHistoryLength = 1e3;
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.period = period;
    this.key = key || "close";
    this.buffer = new CircularQueue(period);
    this.result = new CircularQueue(this.maxHistoryLength);
  }
  getPeriodSum() {
    let sum = 0;
    for (let i = 0; i < this.buffer.size(); i++) {
      const value = this.buffer.get(i) || 0;
      sum += value;
    }
    return sum;
  }
  add(data) {
    const value = typeof data === "number" ? data : data[this.key];
    if (typeof value !== "number") {
      console.warn(value, this.key, data);
    }
    this.buffer.push(value);
    const size = Math.min(this.period, this.buffer.size());
    const ma = this.buffer.size() < this.period ? NaN : this.getPeriodSum() / size;
    this.result.push(ma);
    return ma;
  }
  updateLast(data) {
    const value = typeof data === "number" ? data : data[this.key];
    this.buffer.update(this.buffer.size() - 1, value);
    const size = Math.min(this.period, this.buffer.size());
    const ma = this.getPeriodSum() / size;
    this.result.update(this.result.size() - 1, ma);
    return ma;
  }
  getValue(index = -1) {
    if (index < 0) {
      return this.result.get(this.result.size() + index);
    }
    return this.result.get(index);
  }
};

// src/indicator/boll.ts
var BOLL = class {
  constructor({period, stdDevFactor, maxHistoryLength}) {
    this.maxHistoryLength = 1e3;
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.ma = new MA({period, maxHistoryLength: this.maxHistoryLength, key: void 0});
    this.stdDevQueue = new CircularQueue(period);
    this.upperBand = new CircularQueue(this.maxHistoryLength);
    this.midBand = new CircularQueue(this.maxHistoryLength);
    this.lowerBand = new CircularQueue(this.maxHistoryLength);
    this.stdDevFactor = stdDevFactor;
  }
  add(data) {
    const maValue = this.ma.add(data.close);
    this.stdDevQueue.push(data.close);
    const stdDev = this.calculateStdDev();
    if (isNaN(stdDev)) {
      this.upperBand.push(NaN);
      this.midBand.push(NaN);
      this.lowerBand.push(NaN);
    } else {
      const upperBand = maValue + this.stdDevFactor * stdDev;
      const midBand = maValue;
      const lowerBand = maValue - this.stdDevFactor * stdDev;
      this.upperBand.push(upperBand);
      this.midBand.push(midBand);
      this.lowerBand.push(lowerBand);
    }
  }
  updateLast(data) {
    const maValue = this.ma.updateLast(data.close);
    const stdDev = this.calculateStdDev();
    if (isNaN(stdDev)) {
      const lastIndex = this.upperBand.size() - 1;
      this.upperBand.update(lastIndex, NaN);
      this.midBand.update(lastIndex, NaN);
      this.lowerBand.update(lastIndex, NaN);
    } else {
      const upperBand = maValue + this.stdDevFactor * stdDev;
      const midBand = maValue;
      const lowerBand = maValue - this.stdDevFactor * stdDev;
      const lastIndex = this.upperBand.size() - 1;
      this.upperBand.update(lastIndex, upperBand);
      this.midBand.update(lastIndex, midBand);
      this.lowerBand.update(lastIndex, lowerBand);
    }
  }
  getValue(index = -1) {
    const i = index < 0 ? this.upperBand.size() + index : index;
    return {
      up: keepDecimalFixed(this.upperBand.get(i), 4),
      mid: keepDecimalFixed(this.midBand.get(i), 4),
      low: keepDecimalFixed(this.lowerBand.get(i), 4)
    };
  }
  calculateStdDev() {
    const values = this.stdDevQueue.toArray();
    const validValues = values.filter((v) => v != null);
    if (validValues.length < this.stdDevFactor) {
      return NaN;
    }
    const avg = this.ma.getValue(-1);
    const squareDiffs = values.map((value) => {
      const diff = value - avg;
      return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }
};

// src/indicator/rsi.ts
var RSI = class {
  constructor({period}) {
    this.avgGain = 0;
    this.avgLoss = 0;
    this.maxHistoryLength = 24;
    this.period = period;
    this.values = new CircularQueue(period);
  }
  add(data) {
    const change = data.close - data.open;
    if (change > 0) {
      this.avgGain = (this.avgGain * (this.period - 1) + change) / this.period;
      this.avgLoss = this.avgLoss * (this.period - 1) / this.period;
    } else {
      this.avgGain = this.avgGain * (this.period - 1) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) - change) / this.period;
    }
    const rs = this.avgGain / this.avgLoss;
    const rsi = keepDecimalFixed(100 - 100 / (1 + rs), 2);
    this.values.push(rsi);
  }
  updateLast(data) {
    const change = data.close - data.open;
    let avgGain = 0;
    let avgLoss = 0;
    if (change > 0) {
      avgGain = (this.avgGain * (this.period - 1) + change) / this.period;
      avgLoss = this.avgLoss * (this.period - 1) / this.period;
    } else {
      avgGain = this.avgGain * (this.period - 1) / this.period;
      avgLoss = (this.avgLoss * (this.period - 1) - change) / this.period;
    }
    const rs = avgGain / avgLoss;
    const rsi = keepDecimalFixed(100 - 100 / (1 + rs), 2);
    if (this.values.size() > 1) {
      this.values.update(this.values.size() - 1, rsi);
    }
  }
  getValue(index = -1) {
    if (index < 0) {
      return this.values.get(this.values.size() + index);
    }
    return this.values.get(index);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AverageQueue,
  BOLL,
  CircularQueue,
  KlineState,
  MA,
  Quant,
  RSI,
  Slope
});
