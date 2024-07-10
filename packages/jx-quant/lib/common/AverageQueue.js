var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/common/AverageQueue.ts
__markAsModule(exports);
__export(exports, {
  AverageQueue: () => AverageQueue
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AverageQueue
});
