import { CircularQueue } from "./CircularQueue";



export class AverageQueue {
  queue: CircularQueue<number>;
  constructor(maxLen: number) {
    this.queue = new CircularQueue(maxLen);
  }
  push(value: number) {
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
}