package hquant

import (
	"math"
	"testing"
)

func TestBasicUsage(t *testing.T) {
	h := New(1000)
	defer h.Close()

	// 添加指标
	h.AddMA("ma5", 5, 120)
	h.AddRSI("rsi14", 14, 120)

	// 添加数据
	prices := []float64{100, 102, 101, 103, 105, 104, 106, 108, 107, 109}
	for i, p := range prices {
		h.AddKline(Kline{
			Open:      p - 1,
			Close:     p,
			High:      p + 1,
			Low:       p - 2,
			Volume:    1000,
			Timestamp: int64(1700000000 + i*60),
		})
	}

	// 获取 MA
	ma := h.GetMA("ma5", -1)
	if math.IsNaN(ma) {
		t.Error("MA should not be NaN")
	}
	t.Logf("MA5: %.2f", ma)

	// 获取 RSI
	rsi := h.GetRSI("rsi14", -1)
	t.Logf("RSI14: %.2f", rsi)
}

func TestJSONImport(t *testing.T) {
	h := New(1000)
	defer h.Close()

	h.AddMA("ma3", 3, 120)

	json := `[
		{"open": 100, "close": 102, "high": 103, "low": 99, "volume": 1000, "timestamp": 1700000000},
		{"open": 102, "close": 104, "high": 105, "low": 101, "volume": 1100, "timestamp": 1700000060},
		{"open": 104, "close": 103, "high": 106, "low": 102, "volume": 1200, "timestamp": 1700000120}
	]`

	err := h.ImportJSON(json)
	if err != nil {
		t.Fatalf("Import JSON failed: %v", err)
	}

	if h.KlineCount() != 3 {
		t.Errorf("Expected 3 klines, got %d", h.KlineCount())
	}

	ma := h.GetMA("ma3", -1)
	// MA = (102 + 104 + 103) / 3 = 103
	expected := 103.0
	if math.Abs(ma-expected) > 0.01 {
		t.Errorf("Expected MA %.2f, got %.2f", expected, ma)
	}
}

func BenchmarkAddKline(b *testing.B) {
	h := New(100000)
	defer h.Close()

	h.AddMA("ma60", 60, 1000)
	h.AddBOLL("boll", 20, 2.0, 1000)
	h.AddRSI("rsi", 14, 1000)

	k := Kline{
		Open:      100,
		Close:     102,
		High:      103,
		Low:       99,
		Volume:    1000,
		Timestamp: 1700000000,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		k.Close = 100 + float64(i%10)
		h.AddKline(k)
	}
}
