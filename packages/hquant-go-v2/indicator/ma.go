
package indicator

import (
	"hquant-go-v2/common"
"hquant-go-v2/types"
)

// MA represents the Moving Average indicator.
type MA struct {
	buffer *common.TypedRingBuffer
	result *common.TypedRingBuffer
	period int
}

// NewMA creates a new MA indicator.
func NewMA(period, maxHistoryLength int) *MA {
	return &MA{
		buffer: common.NewTypedRingBuffer(period),
		result: common.NewTypedRingBuffer(maxHistoryLength),
		period: period,
	}
}

// Add adds a new data point to the indicator.
func (m *MA) Add(data hquant.Kline) {
	value := data.Close // Assuming 'close' price for MA calculation
	m.buffer.Push(value)

	if m.buffer.Size() < m.period {
		m.result.Push(0) // Or NaN, depending on desired behavior
		return
	}

	sum := 0.0
	for i := 0; i < m.buffer.Size(); i++ {
		sum += m.buffer.Get(i)
	}
	ma := sum / float64(m.buffer.Size())
	m.result.Push(ma)
}

// UpdateLast updates the last data point of the indicator.
func (m *MA) UpdateLast(data hquant.Kline) {
	value := data.Close
	m.buffer.Update(m.buffer.Size()-1, value)

	if m.buffer.Size() < m.period {
		return
	}

	sum := 0.0
	for i := 0; i < m.buffer.Size(); i++ {
		sum += m.buffer.Get(i)
	}
	ma := sum / float64(m.buffer.Size())
	m.result.Update(m.result.Size()-1, ma)
}

// GetValue returns the MA value at a specific index.
func (m *MA) GetValue(index int) interface{} {
	return m.result.Get(index)
}
