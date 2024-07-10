var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/indicator/boll.ts
__markAsModule(exports);
__export(exports, {
  BOLL: () => BOLL
});

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BOLL
});
