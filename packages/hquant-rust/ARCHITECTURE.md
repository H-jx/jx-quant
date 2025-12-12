# hquant-core 重构方案

## 目录结构

```
hquant-core/
├── Cargo.toml                    # Rust 包配置
├── src/
│   ├── lib.rs                    # 库入口
│   ├── kline.rs                  # K线数据结构
│   ├── common/                   # 通用数据结构
│   │   ├── mod.rs
│   │   └── ring_buffer.rs        # 高性能环形缓冲区
│   ├── indicators/               # 技术指标
│   │   ├── mod.rs
│   │   ├── ma.rs                 # 移动平均线 (O(1) 优化)
│   │   ├── rsi.rs                # RSI
│   │   ├── boll.rs               # 布林带 (Welford O(1) 算法)
│   │   ├── macd.rs               # MACD
│   │   ├── atr.rs                # ATR
│   │   └── vri.rs                # VRI
│   └── ffi/                      # FFI 接口
│       ├── mod.rs
│       └── c_api.rs              # C FFI (供 Go/Python 调用)
├── bindings/
│   ├── node/                     # Node.js 绑定 (napi-rs)
│   │   ├── package.json
│   │   ├── index.js
│   │   └── index.d.ts
│   └── go/                       # Go 绑定
│       ├── hquant.go
│       └── hquant_test.go
└── benches/
    └── indicators.rs             # 性能基准测试
```

## 核心数据结构设计

### 1. K线数据 - Struct of Arrays (SoA)

**为什么 SoA 比 AoS (Array of Structs) 更好：**

```
AoS (当前 JSON 方式):
[{open, close, high, low, volume, timestamp}, {open, close, high, low, ...}, ...]
              ↓ 内存布局
| o1 c1 h1 l1 v1 t1 | o2 c2 h2 l2 v2 t2 | o3 c3 h3 l3 v3 t3 |

SoA (推荐方式):
{ opens: [o1, o2, o3, ...], closes: [c1, c2, c3, ...], ... }
              ↓ 内存布局
| o1 o2 o3 o4 o5 ... | c1 c2 c3 c4 c5 ... | h1 h2 h3 h4 h5 ... |

优势:
- CPU 缓存命中率更高 (连续访问同类型数据)
- SIMD 向量化计算 (一次处理 4/8 个浮点数)
- 内存占用更小 (无对象开销)
```

### 2. 环形缓冲区

```rust
/// 高性能环形缓冲区 - 固定容量，零分配
pub struct RingBuffer {
    data: Vec<f64>,      // 预分配内存
    capacity: usize,
    head: usize,         // 写入位置
    len: usize,          // 当前长度
    // 增量计算状态
    running_sum: f64,    // 累计和 (用于 O(1) MA)
}
```

### 3. K线列式存储

```rust
/// 列式存储的K线数据
pub struct KlineFrame {
    pub open: RingBuffer,
    pub close: RingBuffer,
    pub high: RingBuffer,
    pub low: RingBuffer,
    pub volume: RingBuffer,
    pub timestamp: Vec<i64>,  // 或 RingBuffer<i64>
    capacity: usize,
}

impl KlineFrame {
    /// 从 JSON 批量导入
    pub fn from_json(json: &str) -> Result<Self, Error>;

    /// 从二进制批量导入 (最快)
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, Error>;

    /// 添加单根K线
    pub fn push(&mut self, kline: &Kline);

    /// 获取最近 n 根K线的 close 价格切片 (零拷贝)
    pub fn close_slice(&self, n: usize) -> &[f64];
}
```

## 算法优化

### 1. MA - O(1) 增量计算

**当前实现 O(period):**
```typescript
// 每次都要遍历整个窗口
getPeriodSum(): number {
  let sum = 0;
  for (let i = 0; i < this.buffer.size(); i++) {
    sum += this.buffer.get(i);
  }
  return sum;
}
```

**优化后 O(1):**
```rust
pub struct MA {
    buffer: RingBuffer,
    period: usize,
    running_sum: f64,   // 维护累计和
    result: RingBuffer,
}

impl MA {
    pub fn add(&mut self, value: f64) -> f64 {
        // O(1): 滑动窗口，减去最老的，加上最新的
        if self.buffer.len() >= self.period {
            self.running_sum -= self.buffer.get_oldest();
        }
        self.running_sum += value;
        self.buffer.push(value);

        let ma = if self.buffer.len() >= self.period {
            self.running_sum / self.period as f64
        } else {
            f64::NAN
        };
        self.result.push(ma);
        ma
    }
}
```

### 2. BOLL - Welford 算法 O(1)

**当前实现 O(period):**
```typescript
// 每次计算标准差都要遍历
calculateStdDev(): number {
  for (let i = 0; i < size; i++) {
    sumSqDiff += diff * diff;  // O(period)
  }
  return Math.sqrt(sumSqDiff / count);
}
```

**Welford 增量算法 O(1):**
```rust
pub struct BOLL {
    ma: MA,
    period: usize,
    std_factor: f64,
    // Welford 状态
    mean: f64,
    m2: f64,        // 平方和的累计差
    count: usize,
    // 用于滑动窗口的历史值
    values: RingBuffer,
    result: RingDataFrame,
}

impl BOLL {
    pub fn add(&mut self, close: f64) {
        let ma_value = self.ma.add(close);

        // Welford 增量更新
        if self.values.len() >= self.period {
            // 移除最老值的贡献
            let old = self.values.get_oldest();
            self.remove_value(old);
        }
        self.add_value(close);
        self.values.push(close);

        let std_dev = (self.m2 / self.count as f64).sqrt();
        self.result.push(BollResult {
            up: ma_value + self.std_factor * std_dev,
            mid: ma_value,
            low: ma_value - self.std_factor * std_dev,
        });
    }

    // Welford 添加值
    fn add_value(&mut self, x: f64) {
        self.count += 1;
        let delta = x - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = x - self.mean;
        self.m2 += delta * delta2;
    }

    // Welford 移除值 (逆操作)
    fn remove_value(&mut self, x: f64) {
        let delta = x - self.mean;
        self.mean = (self.mean * self.count as f64 - x) / (self.count - 1) as f64;
        let delta2 = x - self.mean;
        self.m2 -= delta * delta2;
        self.count -= 1;
    }
}
```

## 内存对比

### 10,000 根 K线 + 5 个指标

| 组件 | TypeScript (当前) | Rust (SoA) | 节省 |
|------|------------------|------------|------|
| K线历史 | ~2.4 MB | ~480 KB | **80%** |
| 指标缓冲区 | ~20 KB | ~16 KB | 20% |
| 运行时开销 | V8 GC 压力 | 零 GC | - |
| **总计** | **~2.5 MB** | **~500 KB** | **80%** |

## FFI 接口设计

### C API (供 Go 调用)

```c
// hquant.h
typedef struct HQuantContext HQuantContext;
typedef struct {
    double open, close, high, low, volume;
    int64_t timestamp;
} HKline;

// 创建/销毁上下文
HQuantContext* hquant_new(size_t history_capacity);
void hquant_free(HQuantContext* ctx);

// 添加指标
int hquant_add_ma(HQuantContext* ctx, const char* name, int period);
int hquant_add_boll(HQuantContext* ctx, const char* name, int period, double std_factor);
int hquant_add_rsi(HQuantContext* ctx, const char* name, int period);
int hquant_add_macd(HQuantContext* ctx, const char* name, int short_period, int long_period, int signal_period);

// 数据操作
void hquant_add_kline(HQuantContext* ctx, const HKline* kline);
void hquant_update_last(HQuantContext* ctx, const HKline* kline);

// 批量导入 (高性能)
int hquant_import_json(HQuantContext* ctx, const char* json, size_t len);
int hquant_import_binary(HQuantContext* ctx, const uint8_t* data, size_t len);

// 获取指标值
double hquant_get_ma(HQuantContext* ctx, const char* name, int index);
int hquant_get_boll(HQuantContext* ctx, const char* name, int index, double* up, double* mid, double* low);
double hquant_get_rsi(HQuantContext* ctx, const char* name, int index);
```

### Node.js API (napi-rs)

```typescript
// index.d.ts
export class HQuant {
    constructor(historyCapacity: number);

    // 指标
    addMA(name: string, period: number): void;
    addBOLL(name: string, period: number, stdFactor: number): void;
    addRSI(name: string, period: number): void;
    addMACD(name: string, shortPeriod: number, longPeriod: number, signalPeriod: number): void;

    // 数据
    addKline(kline: Kline): void;
    updateLast(kline: Kline): void;

    // 批量导入 (推荐)
    importJson(json: string): void;
    importBinary(buffer: Buffer): void;  // 最快

    // 获取指标
    getMA(name: string, index?: number): number;
    getBOLL(name: string, index?: number): { up: number; mid: number; low: number };
    getRSI(name: string, index?: number): number;
}
```

### Go API

```go
package hquant

/*
#cgo LDFLAGS: -L./lib -lhquant_core
#include "hquant.h"
*/
import "C"

type HQuant struct {
    ctx *C.HQuantContext
}

type Kline struct {
    Open, Close, High, Low, Volume float64
    Timestamp                       int64
}

func New(capacity int) *HQuant
func (h *HQuant) Close()

func (h *HQuant) AddMA(name string, period int)
func (h *HQuant) AddBOLL(name string, period int, stdFactor float64)
func (h *HQuant) AddRSI(name string, period int)

func (h *HQuant) AddKline(k Kline)
func (h *HQuant) UpdateLast(k Kline)
func (h *HQuant) ImportJSON(json string) error
func (h *HQuant) ImportBinary(data []byte) error

func (h *HQuant) GetMA(name string, index int) float64
func (h *HQuant) GetBOLL(name string, index int) (up, mid, low float64)
func (h *HQuant) GetRSI(name string, index int) float64
```

## 数据传输格式

### 推荐：二进制列式格式

```
Header (32 bytes):
  magic:    4 bytes  "HQKL"
  version:  1 byte   0x01
  flags:    1 byte   (压缩等)
  columns:  1 byte   (列数，通常 6)
  reserved: 1 byte
  count:    4 bytes  (行数，uint32)
  ts_base:  8 bytes  (基准时间戳，用于差分编码)
  reserved: 12 bytes

Data (列式存储):
  opens:     count × 8 bytes (f64)
  closes:    count × 8 bytes (f64)
  highs:     count × 8 bytes (f64)
  lows:      count × 8 bytes (f64)
  volumes:   count × 8 bytes (f64)
  timestamps: count × 4 bytes (delta from ts_base, i32)

总大小: 32 + count × (8×5 + 4) = 32 + count × 44 bytes
```

**对比：**
| 格式 | 10,000 K线 | 解析速度 |
|------|-----------|---------|
| JSON | ~1.2 MB | 慢 (字符串解析) |
| CSV | ~400 KB | 中等 |
| 二进制列式 | ~440 KB | **最快** (直接内存映射) |

## 性能预期

| 操作 | TypeScript | Rust | 提升 |
|------|-----------|------|------|
| MA 计算 | O(period) | O(1) | **60x** (period=60) |
| BOLL 标准差 | O(period) | O(1) | **20x** (period=20) |
| 10K K线导入 | ~50ms | ~2ms | **25x** |
| 内存占用 | ~2.5MB | ~500KB | **5x** |
| GC 暂停 | 有 | 无 | - |

## 实现步骤

### Phase 1: 核心库 (1-2 周)
1. 实现 RingBuffer
2. 实现 KlineFrame (SoA 存储)
3. 实现优化版 MA, BOLL, RSI, MACD, ATR, VRI
4. 单元测试 + 基准测试

### Phase 2: Node.js 绑定 (3-5 天)
1. 使用 napi-rs 创建绑定
2. 实现 TypeScript 类型定义
3. 发布 npm 包

### Phase 3: Go 绑定 (3-5 天)
1. 生成 C 头文件
2. 编写 Go wrapper
3. 测试 CGO 调用

### Phase 4: 集成 (2-3 天)
1. 替换现有 hquant 中的指标计算
2. 保持 API 兼容
3. 性能对比测试

## 兼容性设计

为了平滑迁移，保持现有 API 不变：

```typescript
// 新的 hquant (wrapper)
import { HQuant as HQuantCore } from '@hquant/core';  // Rust 核心

export class Quant {
    private core: HQuantCore;

    addIndicator(name: string, indicator: Indicator) {
        if (indicator instanceof MA) {
            this.core.addMA(name, indicator.period);
        } else if (indicator instanceof BOLL) {
            this.core.addBOLL(name, indicator.period, indicator.stdDevFactor);
        }
        // ... 其他指标映射
    }

    addData(data: Kline) {
        this.core.addKline(data);
        // 触发策略评估...
    }
}
```

这样现有代码无需修改，只需更新依赖即可获得性能提升。
