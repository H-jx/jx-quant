export class Cache<T> {
  private data: Map<string, { value: T; expiryTime: number }> = new Map();

  constructor(private defaultExpiryTime: number = 1000 * 60) { }

  set(
    key: string,
    value: T,
    expiryTime: number = this.defaultExpiryTime
  ): void {
    const expiryTimestamp = Date.now() + expiryTime;
    this.data.set(key, { value, expiryTime: expiryTimestamp });
  }

  get(key: string): T | undefined {
    // 在获取缓存值之前清理过期项
    this.cleanup();
    const item = this.data.get(key);

    if (item) {
      return item.value;
    } else {
      return undefined;
    }
  }
  clear(): void {
    this.data.clear();
  }
  private cleanup(): void {
    const now = Date.now();
    // 删除所有过期的缓存项
    this.data.forEach((item, key) => {
      if (item.expiryTime <= now) {
        this.data.delete(key);
      }
    });
  }
}
