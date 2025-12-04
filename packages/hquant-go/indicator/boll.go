package indicator

import (
	"math"
	"sync"

	"github.com/yourname/hquant-go/common"
	"github.com/yourname/hquant-go/quant"
)

type BOLL struct {
	period    int
	stdFactor float64
	buf       *common.FloatRingBuffer
	mu        sync.RWMutex
}

func NewBOLL(period int, stdFactor float64) *BOLL {
	if period <= 0 {
		period = 20
	}
	if stdFactor <= 0 {
		stdFactor = 2
	}
	return &BOLL{period: period, stdFactor: stdFactor, buf: common.NewFloatRingBuffer(period)}
}

func (b *BOLL) SetQuant(q *quant.Quant)   {}
func (b *BOLL) SetMaxHistoryLength(n int) {}

func (b *BOLL) Add(k quant.Kline) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.buf.Len() < b.period {
		b.buf.Push(k.Close)
		return
	}
	b.buf.Push(k.Close)
}

func (b *BOLL) UpdateLast(k quant.Kline) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.buf.Len() == 0 {
		return
	}
	b.buf.UpdateLast(k.Close)
}

func (b *BOLL) GetValue(index int) (float64, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if b.buf.Len() < b.period {
		return 0, false
	}
	// compute mean and std
	sum := 0.0
	n := b.buf.Len()
	for i := 0; i < n; i++ {
		v, _ := b.buf.Get(i)
		sum += v
	}
	mean := sum / float64(n)
	variance := 0.0
	for i := 0; i < n; i++ {
		v, _ := b.buf.Get(i)
		variance += (v - mean) * (v - mean)
	}
	variance /= float64(n)
	_ = math.Sqrt(variance)
	return mean, true
}
