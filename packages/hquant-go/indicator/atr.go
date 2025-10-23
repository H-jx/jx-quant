package indicator

import (
	"sync"

	"github.com/yourname/hquant-go/common"
	"github.com/yourname/hquant-go/quant"
)

// ATR computes average true range
type ATR struct {
	period int
	buf    *common.FloatRingBuffer
	sum    float64
	mu     sync.RWMutex
}

func NewATR(period int) *ATR {
	if period <= 0 {
		period = 14
	}
	return &ATR{period: period, buf: common.NewFloatRingBuffer(period)}
}

func (a *ATR) SetQuant(q *quant.Quant)   {}
func (a *ATR) SetMaxHistoryLength(n int) {}

func (a *ATR) Add(k quant.Kline) {
	a.mu.Lock()
	defer a.mu.Unlock()
	// For simplicity: approximate tr = high-low
	tr := k.High - k.Low
	if a.buf.Len() < a.period {
		a.buf.Push(tr)
		a.sum += tr
		return
	}
	oldest, _ := a.buf.Get(0)
	a.sum -= oldest
	a.buf.Push(tr)
	a.sum += tr
}

func (a *ATR) UpdateLast(k quant.Kline) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.buf.Len() == 0 {
		return
	}
	lastIdx := a.buf.Len() - 1
	last, _ := a.buf.Get(lastIdx)
	tr := k.High - k.Low
	a.sum += (tr - last)
	a.buf.UpdateLast(tr)
}

func (a *ATR) GetValue(index int) (float64, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.buf.Len() < a.period {
		return 0, false
	}
	return a.sum / float64(a.period), true
}
