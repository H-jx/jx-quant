var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/indicator/rsi.ts
__markAsModule(exports);
__export(exports, {
  RSI: () => RSI
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
  RSI
});
