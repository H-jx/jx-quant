var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/indicator/macd.ts
__markAsModule(exports);
__export(exports, {
  MACD: () => MACD
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

// src/indicator/macd.ts
var MACD = class {
  constructor({shortTermPeriod, longTermPeriod, signalLinePeriod, maxHistoryLength}) {
    this.maxHistoryLength = 1e3;
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.shortTermMA = new MA({period: shortTermPeriod, maxHistoryLength: this.maxHistoryLength, key: void 0});
    this.longTermMA = new MA({period: longTermPeriod, maxHistoryLength: this.maxHistoryLength, key: void 0});
    this.signalLineMA = new MA({period: signalLinePeriod, maxHistoryLength: this.maxHistoryLength, key: void 0});
    this.macdLine = new CircularQueue(this.maxHistoryLength);
    this.signalLine = new CircularQueue(this.maxHistoryLength);
  }
  add(data) {
    const shortTermMAValue = this.shortTermMA.add(data.close);
    const longTermMAValue = this.longTermMA.add(data.close);
    const macdValue = shortTermMAValue - longTermMAValue;
    this.macdLine.push(macdValue);
    if (this.macdLine.size() >= this.signalLineMA.getValue()) {
      const signalLineValue = this.signalLineMA.add(macdValue);
      this.signalLine.push(signalLineValue);
    }
  }
  updateLast(data) {
    const shortTermMAValue = this.shortTermMA.updateLast(data.close);
    const longTermMAValue = this.longTermMA.updateLast(data.close);
    const macdValue = shortTermMAValue - longTermMAValue;
    const lastIndex = this.macdLine.size() - 1;
    this.macdLine.update(lastIndex, macdValue);
    if (this.macdLine.size() >= this.signalLineMA.getValue()) {
      const signalLineValue = this.signalLineMA.updateLast(macdValue);
      this.signalLine.update(lastIndex, signalLineValue);
    }
  }
  getValue(index = -1) {
    const i = index < 0 ? this.macdLine.size() + index : index;
    return {
      macd: this.macdLine.get(i),
      signalLine: this.signalLine.get(i)
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MACD
});
