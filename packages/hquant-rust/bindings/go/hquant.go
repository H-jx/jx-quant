// Package hquant 提供高性能量化交易指标计算
//
// 使用 Rust 核心库通过 CGO 调用
package hquant

/*
#cgo LDFLAGS: -L../../target/release -lhquant_core -ldl -lm
#include <stdlib.h>
#include <stdint.h>

// 类型定义
typedef void* HQuantContext;

typedef struct {
    double open;
    double close;
    double high;
    double low;
    double volume;
    long timestamp;
} HKline;

// 生命周期
extern HQuantContext hquant_new(int capacity);
extern void hquant_free(HQuantContext ctx);

// 添加指标
extern int hquant_add_ma(HQuantContext ctx, const char* name, int period, int max_history);
extern int hquant_add_boll(HQuantContext ctx, const char* name, int period, double std_factor, int max_history);
extern int hquant_add_rsi(HQuantContext ctx, const char* name, int period, int max_history);
extern int hquant_add_macd(HQuantContext ctx, const char* name, int short_period, int long_period, int signal_period, int max_history);
extern int hquant_add_atr(HQuantContext ctx, const char* name, int period, int max_history);
extern int hquant_add_vri(HQuantContext ctx, const char* name, int period, int max_history);

// 数据操作
extern void hquant_add_kline(HQuantContext ctx, const HKline* kline);
extern void hquant_update_last(HQuantContext ctx, const HKline* kline);
extern int hquant_import_json(HQuantContext ctx, const char* json, int len);
extern int hquant_import_binary(HQuantContext ctx, const uint8_t* data, int len);

// 获取指标
extern double hquant_get_ma(HQuantContext ctx, const char* name, int index);
extern double hquant_get_rsi(HQuantContext ctx, const char* name, int index);
extern double hquant_get_atr(HQuantContext ctx, const char* name, int index);
extern double hquant_get_vri(HQuantContext ctx, const char* name, int index);

// 工具
extern int hquant_kline_count(HQuantContext ctx);
extern int hquant_indicator_len(HQuantContext ctx, const char* name);
extern uint8_t* hquant_export_binary(HQuantContext ctx, int* out_len);
extern void hquant_free_bytes(uint8_t* ptr, int len);
*/
import "C"
import (
	"errors"
	"unsafe"
)

// Kline K线数据
type Kline struct {
	Open      float64
	Close     float64
	High      float64
	Low       float64
	Volume    float64
	Timestamp int64
}

// HQuant 量化指标计算引擎
type HQuant struct {
	ctx C.HQuantContext
}

// New 创建 HQuant 实例
func New(capacity int) *HQuant {
	return &HQuant{
		ctx: C.hquant_new(C.int(capacity)),
	}
}

// Close 释放资源
func (h *HQuant) Close() {
	if h.ctx != nil {
		C.hquant_free(h.ctx)
		h.ctx = nil
	}
}

// AddMA 添加移动平均线指标
func (h *HQuant) AddMA(name string, period int, maxHistory int) {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	C.hquant_add_ma(h.ctx, cname, C.int(period), C.int(maxHistory))
}

// AddBOLL 添加布林带指标
func (h *HQuant) AddBOLL(name string, period int, stdFactor float64, maxHistory int) {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	C.hquant_add_boll(h.ctx, cname, C.int(period), C.double(stdFactor), C.int(maxHistory))
}

// AddRSI 添加 RSI 指标
func (h *HQuant) AddRSI(name string, period int, maxHistory int) {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	C.hquant_add_rsi(h.ctx, cname, C.int(period), C.int(maxHistory))
}

// AddMACD 添加 MACD 指标
func (h *HQuant) AddMACD(name string, shortPeriod, longPeriod, signalPeriod, maxHistory int) {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	C.hquant_add_macd(h.ctx, cname, C.int(shortPeriod), C.int(longPeriod), C.int(signalPeriod), C.int(maxHistory))
}

// AddATR 添加 ATR 指标
func (h *HQuant) AddATR(name string, period int, maxHistory int) {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	C.hquant_add_atr(h.ctx, cname, C.int(period), C.int(maxHistory))
}

// AddVRI 添加 VRI 指标
func (h *HQuant) AddVRI(name string, period int, maxHistory int) {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	C.hquant_add_vri(h.ctx, cname, C.int(period), C.int(maxHistory))
}

// AddKline 添加一根K线
func (h *HQuant) AddKline(k Kline) {
	ck := C.HKline{
		open:      C.double(k.Open),
		close:     C.double(k.Close),
		high:      C.double(k.High),
		low:       C.double(k.Low),
		volume:    C.double(k.Volume),
		timestamp: C.long(k.Timestamp),
	}
	C.hquant_add_kline(h.ctx, &ck)
}

// UpdateLast 更新最后一根K线
func (h *HQuant) UpdateLast(k Kline) {
	ck := C.HKline{
		open:      C.double(k.Open),
		close:     C.double(k.Close),
		high:      C.double(k.High),
		low:       C.double(k.Low),
		volume:    C.double(k.Volume),
		timestamp: C.long(k.Timestamp),
	}
	C.hquant_update_last(h.ctx, &ck)
}

// ImportJSON 从 JSON 批量导入
func (h *HQuant) ImportJSON(json string) error {
	cjson := C.CString(json)
	defer C.free(unsafe.Pointer(cjson))

	ret := C.hquant_import_json(h.ctx, cjson, C.int(len(json)))
	if ret != 0 {
		return errors.New("failed to import JSON")
	}
	return nil
}

// ImportBinary 从二进制批量导入
func (h *HQuant) ImportBinary(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	ret := C.hquant_import_binary(h.ctx, (*C.uint8_t)(unsafe.Pointer(&data[0])), C.int(len(data)))
	if ret != 0 {
		return errors.New("failed to import binary")
	}
	return nil
}

// GetMA 获取 MA 值
func (h *HQuant) GetMA(name string, index int) float64 {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	return float64(C.hquant_get_ma(h.ctx, cname, C.int(index)))
}

// GetRSI 获取 RSI 值
func (h *HQuant) GetRSI(name string, index int) float64 {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	return float64(C.hquant_get_rsi(h.ctx, cname, C.int(index)))
}

// GetATR 获取 ATR 值
func (h *HQuant) GetATR(name string, index int) float64 {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	return float64(C.hquant_get_atr(h.ctx, cname, C.int(index)))
}

// GetVRI 获取 VRI 值
func (h *HQuant) GetVRI(name string, index int) float64 {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	return float64(C.hquant_get_vri(h.ctx, cname, C.int(index)))
}

// KlineCount 获取 K 线数量
func (h *HQuant) KlineCount() int {
	return int(C.hquant_kline_count(h.ctx))
}

// IndicatorLen 获取指标历史长度
func (h *HQuant) IndicatorLen(name string) int {
	cname := C.CString(name)
	defer C.free(unsafe.Pointer(cname))
	return int(C.hquant_indicator_len(h.ctx, cname))
}

// ExportBinary 导出为二进制格式
func (h *HQuant) ExportBinary() []byte {
	var length C.int
	ptr := C.hquant_export_binary(h.ctx, &length)
	if ptr == nil {
		return nil
	}
	defer C.hquant_free_bytes(ptr, length)

	// 复制数据
	result := make([]byte, int(length))
	copy(result, (*[1 << 30]byte)(unsafe.Pointer(ptr))[:length:length])
	return result
}
