package indicator

import (
	"github.com/yourname/hquant-go/common"
	"github.com/yourname/hquant-go/quant"
	"github.com/yourname/hquant-go/util"
)

type VRI struct {
	period int
	buf    *common.CircularQueue[quant.Kline]
	result *common.FloatRingBuffer
}

func NewVRI(period int) *VRI {
	if period <= 0 {
		period = 3
	}
	return &VRI{period: period, buf: common.NewCircularQueue[quant.Kline](period), result: common.NewFloatRingBuffer(120)}
}

func (v *VRI) SetQuant(q *quant.Quant)   {}
func (v *VRI) SetMaxHistoryLength(n int) {}

func (v *VRI) Add(k quant.Kline) {
	v.buf.Push(k)
	if v.buf.Size() == v.period {
		v.result.Push(v.calcVRI())
	}
}

func (v *VRI) UpdateLast(k quant.Kline) {
	if v.buf.Size() > 0 {
		v.buf.Update(v.buf.Size()-1, k)
		if v.buf.Size() == v.period {
			v.result.UpdateLast(v.calcVRI())
		}
	}
}

func (v *VRI) calcVRI() float64 {
	size := v.buf.Size()
	if size < 2 {
		return 0
	}
	curr := 0.0
	sum := 0.0
	for i := 0; i < size; i++ {
		k, _ := v.buf.Get(i)
		if i == size-1 {
			curr = k.Volume
		} else {
			sum += k.Volume
		}
	}
	avg := sum / float64(size-1)
	ratio := 0.0
	if avg > 0 {
		ratio = curr / avg
	}
	return util.KeepDecimalFixed(ratio, 2)
}

func (v *VRI) GetValue(index int) (float64, bool) {
	if index < 0 {
		idx := v.result.Len() + index
		if idx < 0 {
			return 0, false
		}
		return v.result.Get(idx)
	}
	return v.result.Get(index)
}
