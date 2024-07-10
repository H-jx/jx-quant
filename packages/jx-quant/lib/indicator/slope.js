var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/indicator/slope.ts
__markAsModule(exports);
__export(exports, {
  KlineState: () => KlineState,
  Slope: () => Slope
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KlineState,
  Slope
});
