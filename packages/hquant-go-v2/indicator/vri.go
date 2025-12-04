
package indicator

import (
	"hquant-go-v2/common"
	"hquant-go-v2/types"
)

// VRI represents the Volume Ratio Indicator.
type VRI struct {
	period int
	buffer *common.CircularQueue
	result *common.TypedRingBuffer
}

// NewVRI creates a new VRI indicator.
func NewVRI(period, maxHistoryLength int) *VRI {
	return &VRI{
		period: period,
		buffer: common.NewCircularQueue(period),
		result: common.NewTypedRingBuffer(maxHistoryLength),
	}
}

// calcVRI calculates the VRI value.
func (v *VRI) calcVRI() float64 {
	size := v.buffer.Size()
	if size < 2 {
		return 0
	}
	currVolume := 0.0
	sumVolume := 0.0
	for i := 0; i < size; i++ {
		kline := v.buffer.Get(i).(hquant.Kline)
		if i == size-1 {
			currVolume = kline.Volume
		} else {
			sumVolume += kline.Volume
		}
	}
	avgVolume := sumVolume / float64(size-1)
	ratio := 0.0
	if avgVolume > 0 {
		ratio = currVolume / avgVolume
	}
	return ratio
}

// Add adds a new data point to the indicator.
func (v *VRI) Add(data hquant.Kline) {
	v.buffer.Push(data)
	if v.buffer.Size() == v.period {
		v.result.Push(v.calcVRI())
	}
}

// UpdateLast updates the last data point of the indicator.
func (v *VRI) UpdateLast(data hquant.Kline) {
	if v.buffer.Size() > 0 {
		v.buffer.Update(v.buffer.Size()-1, data)
		if v.buffer.Size() == v.period {
			v.result.Update(v.result.Size()-1, v.calcVRI())
		}
	}
}

// GetValue returns the VRI value at a specific index.
func (v *VRI) GetValue(index int) interface{} {
	return v.result.Get(index)
}
