
package indicator

import (
	"math"

	"hquant-go-v2/common"
"hquant-go-v2/types"
)

// RSI represents the Relative Strength Index indicator.
type RSI struct {
	period  int
	values  *common.TypedRingBuffer
	avgGain float64
	avgLoss float64
}

// NewRSI creates a new RSI indicator.
func NewRSI(period, maxHistoryLength int) *RSI {
	return &RSI{
		period: period,
		values: common.NewTypedRingBuffer(maxHistoryLength),
	}
}

// Add adds a new data point to the indicator.
func (r *RSI) Add(data hquant.Kline) {
	change := data.Close - data.Open

	if change > 0 {
		r.avgGain = (r.avgGain*float64(r.period-1) + change) / float64(r.period)
		r.avgLoss = (r.avgLoss*float64(r.period-1)) / float64(r.period)
	} else {
		r.avgGain = (r.avgGain*float64(r.period-1)) / float64(r.period)
		r.avgLoss = (r.avgLoss*float64(r.period-1) - change) / float64(r.period)
	}

	rs := 0.0
	if r.avgLoss != 0 {
		rs = r.avgGain / r.avgLoss
	}

	rsi := 100 - 100/(1+rs)
	r.values.Push(rsi)
}

// UpdateLast updates the last data point of the indicator.
func (r *RSI) UpdateLast(data hquant.Kline) {
	change := data.Close - data.Open

	avgGain := 0.0
	avgLoss := 0.0

	if change > 0 {
		avgGain = (r.avgGain*float64(r.period-1) + change) / float64(r.period)
		avgLoss = (r.avgLoss*float64(r.period-1)) / float64(r.period)
	} else {
		avgGain = (r.avgGain*float64(r.period-1)) / float64(r.period)
		avgLoss = (r.avgLoss*float64(r.period-1) - change) / float64(r.period)
	}

	rs := 0.0
	if avgLoss != 0 {
		rs = avgGain / avgLoss
	}

	rsi := 100 - 100/(1+rs)

	if r.values.Size() > 0 {
		r.values.Update(r.values.Size()-1, rsi)
	}
}

// GetValue returns the RSI value at a specific index.
func (r *RSI) GetValue(index int) interface{} {
	return r.values.Get(index)
}
