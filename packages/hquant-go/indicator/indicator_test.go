package indicator_test

import (
	"testing"

	"github.com/yourname/hquant-go/indicator"
	"github.com/yourname/hquant-go/quant"
)

func TestMAValues(t *testing.T) {
	ma := indicator.NewMA(3)
	data := []quant.Kline{{Close: 11}, {Close: 12}, {Close: 13}, {Close: 14}, {Close: 20}, {Close: 16}}
	expected := []float64{0, 0, (11 + 12 + 13) / 3.0, (12 + 13 + 14) / 3.0, (13 + 14 + 20) / 3.0, (14 + 20 + 16) / 3.0}
	for i, d := range data {
		ma.Add(d)
		v, ok := ma.GetValue(-1)
		if i < 2 {
			if ok {
				t.Fatalf("expected not ready for index %d", i)
			}
			continue
		}
		if !ok || v != expected[i] {
			t.Fatalf("ma mismatch at %d got %v expected %v", i, v, expected[i])
		}
	}
}

func TestATR(t *testing.T) {
	atr := indicator.NewATR(3)
	data := []quant.Kline{{High: 16, Low: 10}, {High: 17, Low: 12}, {High: 19, Low: 15}}
	for _, d := range data {
		atr.Add(d)
	}
	v, ok := atr.GetValue(-1)
	if !ok {
		t.Fatalf("atr not ready")
	}
	if v < 4.9 || v > 5.1 {
		t.Fatalf("atr expected ~5 got %v", v)
	}
}
