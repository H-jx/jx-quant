Quant.ts 管理指标、策略、信号、事件、历史数据，需要 Go 版提供 AddData/UpdateLastData、事件广播、策略回调、信号缓存等完整功能。
指标接口要求 add / updateLast / getValue，并注入 _quant、maxHistoryLength，Go 版需设计统一接口并支持多个返回值结构。
common 内的结构（CircularQueue、TypedRingBuffer、SharedObjectRingBuffer 等）提供零拷贝、高性能滑动窗口，Go 版需实现等价的泛型/typed 数组和共享内存能力。
Backtest.ts、FuturesBacktest.ts 实现现货/合约回测，Go 版需提供类似计算流程、手续费、回撤、爆仓判定等。
indicator 目录实现 MA/BOLL/RSI/ATR/MACD 等指标，依赖 TypedRingBuffer 与 Indicator 接口；Go 版要重建这些指标，保持行为一致。
util.ts 的数值截断、自动精度逻辑在回测和指标中被大量复用，Go 版需提供等价工具函数。
待处理文件与操作说明

hquant-go/common/circular_queue.go：重写为无零值歧义的泛型环形缓冲区，提供 Push/Shift/Pop/Update/Get/Size/Clear/Iter 等并避免 *new(T) 判满漏洞。
hquant-go/common/typed_ring_buffer.go（新增）：实现 float64/int64 等 typed ring buffer，支持容量覆盖、Update、GetLast、迭代器，用于指标计算。
hquant-go/common/shared_object_ring_buffer.go（新增）：参考 SharedObjectRingBuffer.ts，用 Go sync.Mutex + unsafe/reflect 或 encoding/binary + sync/atomic 实现结构化零拷贝共享（可选先给出接口与内存模型）。
hquant-go/util/math.go（新增）：实现 KeepDecimalFixed、AutoToFixed、NumLen 等函数，确保回测和指标输出一致。
hquant-go/quant/types.go（新增或拆分）：定义 KlineIn、Kline、Signal、Indicator 接口（含 Add、UpdateLast、Value）、Strategy 签名，保留 MaxHistoryLength/BindQuant 等字段。
hquant-go/quant/quant.go：重写为完整框架，包含：
历史队列（环形缓冲）、当前数据、信号 map；
AddIndicator 时注入 MaxHistoryLength、Quant 引用；
AddData 与 UpdateLastData 区分新增/更新逻辑；
事件系统（onSignal, emit, triggerSignal）可用 map[string][]chan 或回调注册；
并发安全设计，必要时读写锁 + 事件异步。
hquant-go/indicator/ma.go：利用 TypedRingBuffer 实现 Add/UpdateLast/GetValue，支持 key 选择、NaN 初期值。
hquant-go/indicator/boll.go：返回结构体或 map（三个轨道），需要与 TS 版同格式；引入方差缓存提高性能。
hquant-go/indicator/rsi.go：维护增减均值，支持 UpdateLast 修正；sum 改缓存避免重复遍历。
hquant-go/indicator/macd.go、atr.go、slope.go、vri.go：新增文件，对照 TS 实现完整指标集合。
hquant-go/common/average_queue.go、ring_data_frame.go、shared_object_ring_buffer.go：根据 src/common 目录补齐数据结构（Typed/Shared ring buffers、数据帧）。
hquant-go/backtest/spot.go：重写 Backtest.ts 逻辑，封装手续费、收益、回撤计算；提供 Run, MockTrade, Result, Trades.
hquant-go/backtest/futures.go：重写 FuturesBacktest.ts，实现保证金、杠杆、强平价、费率等。
hquant-go/index.go：导出 Quant、Backtest、指标注册器等入口，模仿 src/index.ts.
hquant-go/main.go：改为示例入口（加载数据、添加指标策略、打印信号），不要再仅打印字符串。
hquant-go/tests/*：拆分单元测试，覆盖指标、Quant 框架、回测（使用 Go testing 和基准测试提高性能验证）。
hquant-go/go.mod：更新 module 名称（若需发布），添加依赖（github.com/samber/lo 等可选库）。
hquant-go/README.md：完善快速开始、API 说明、示例代码（引用新的入口与测试说明）。
hquant-go/docs/ARCHITECTURE.md（新增）：总结设计、与 hquant 差异、后续扩展建议，方便协作。
以上任务完成后，再次检查 lint/test（go fmt、golangci-lint、go test [jx-trader](http://_vscodecontentref_/28).）并补充示例数据或基准测试以验证性能。