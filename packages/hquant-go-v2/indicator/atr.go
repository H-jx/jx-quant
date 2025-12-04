
package indicator

import (
	"math"

	"hquant-go-v2/common"
"hquant-go-v2/types"
)

// ATR represents the Average True Range indicator.
type ATR struct {
	buffer *common.CircularQueue
	result *common.TypedRingBuffer
	period int
}

// NewATR creates a new ATR indicator.
func NewATR(period, maxHistoryLength int) *ATR {
	return &ATR{
		buffer: common.NewCircularQueue(period),
		result: common.NewTypedRingBuffer(maxHistoryLength),
		period: period,
	}
}

// getTrueRange calculates the true range for a given Kline.
func (a *ATR) getTrueRange(curr hquant.Kline, prev *hquant.Kline) float64 {
	if prev == nil {
		return curr.High - curr.Low
	}
	return math.Max(
		curr.High-curr.Low,
		math.Abs(curr.High-prev.Close),
		math.Abs(curr.Low-prev.Close),
	)
}

// calc calculates the ATR value.
func (a *ATR) calc() float64 {
	trSum := 0.0
	for i := 0; i < a.buffer.Size(); i++ {
		curr := a.buffer.Get(i).(hquant.Kline)
		var prev *hquant.Kline
		if i > 0 {
			p := a.buffer.Get(i - 1).(hquant.Kline)
			prev = &p
		}
		trSum += a.getTrueRange(curr, prev)
	}
	return trSum / float64(a.period)
}

// Add adds a new data point to the indicator.
func (a *ATR) Add(data hquant.Kline) {
	a.buffer.Push(data)
	if a.buffer.Size() < a.period {
		a.result.Push(math.NaN())
		return
	}
	a.result.Push(a.calc())
}

// UpdateLast updates the last data point of the indicator.
func (a *ATR) UpdateLast(data hquant.Kline) {
	if a.buffer.Size() == 0 {
		return
	}
	if a.buffer.Size() < a.period {
		return
	}
	a.buffer.Update(a.buffer.Size()-1, data)
	a.result.Update(a.result.Size()-1, a.calc())
}

// GetValue returns the ATR value at a specific index.
func (a *ATR) GetValue(index int) interface{} {
	return a.result.Get(index)
}
