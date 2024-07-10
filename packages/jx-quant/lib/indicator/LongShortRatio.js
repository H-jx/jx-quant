var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/indicator/LongShortRatio.ts
__markAsModule(exports);
__export(exports, {
  LongShortRatio: () => LongShortRatio
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

// src/indicator/LongShortRatio.ts
var LongShortRatio = class {
  constructor({period, shortRatio, maxHistoryLength}) {
    this.maxHistoryLength = 1e3;
    this.maxHistoryLength = maxHistoryLength || this.maxHistoryLength;
    this.longProfitQueue = new CircularQueue(this.maxHistoryLength);
    this.shortProfitQueue = new CircularQueue(this.maxHistoryLength);
    this.period = period;
    this.shortRatio = shortRatio;
  }
  add(data) {
    const longProfit = this.calculateLongProfit(data.close);
    const shortProfit = this.calculateShortProfit(data.close);
    this.longProfitQueue.push(longProfit);
    this.shortProfitQueue.push(shortProfit);
  }
  updateLast(data) {
    const longProfit = this.calculateLongProfit(data.close);
    const shortProfit = this.calculateShortProfit(data.close);
    const lastIndex = this.longProfitQueue.size() - 1;
    this.longProfitQueue.update(lastIndex, longProfit);
    this.shortProfitQueue.update(lastIndex, shortProfit);
  }
  getValue(index = -1) {
    const i = index < 0 ? this.longProfitQueue.size() + index : index;
    const longProfit = this.longProfitQueue.get(i);
    const shortProfit = this.shortProfitQueue.get(i);
    const adjustedShortProfit = longProfit * this.shortRatio;
    if (adjustedShortProfit >= shortProfit) {
      return -1;
    } else {
      return 1;
    }
  }
  calculateLongProfit(currentPrice) {
    const highestPrice = Math.max(...this.longProfitQueue.toArray().slice(-this.period));
    return (currentPrice - highestPrice) / highestPrice * 100;
  }
  calculateShortProfit(currentPrice) {
    const lowestPrice = Math.min(...this.shortProfitQueue.toArray().slice(-this.period));
    return (lowestPrice - currentPrice) / lowestPrice * 100;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LongShortRatio
});
