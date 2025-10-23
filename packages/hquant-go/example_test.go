package quant_test

import (
	"testing"

	"github.com/yourname/hquant-go/quant"
)

// minimal moving-average-like indicator implementing quant.Indicator
type simpleInd struct{ vals []float64 }

func (s *simpleInd) SetQuant(_ *quant.Quant)   {}
func (s *simpleInd) SetMaxHistoryLength(_ int) {}
func (s *simpleInd) Add(k quant.Kline)         { s.vals = append(s.vals, k.Close) }
func (s *simpleInd) UpdateLast(k quant.Kline) {
	if len(s.vals) > 0 {
		s.vals[len(s.vals)-1] = k.Close
	}
}
func (s *simpleInd) GetValue(index int) (float64, bool) {
	if len(s.vals) == 0 {
		return 0, false
	}
	return s.vals[len(s.vals)-1], true
}

func TestQuantMA(t *testing.T) {
	q := quant.NewQuant(10)
	ma := &simpleInd{}
	q.AddIndicator("ma3", ma)

	// simple strategy: buy when close > ma
	q.AddStrategy("maBuy", func(inds map[string]quant.Indicator, bar quant.Kline) quant.Signal {
		ind := inds["ma3"]
		if ind == nil {
			return ""
		}
		if v, ok := ind.GetValue(0); ok {
			if bar.Close > v {
				return quant.SignalBuy
			}
			if bar.Close < v {
				return quant.SignalSell
			}
		}
		return ""
	})

	bars := []quant.Kline{
		{Close: 1}, {Close: 2}, {Close: 3}, {Close: 4}, {Close: 5},
	}
	for _, b := range bars {
		q.AddData(b)
	}
}
