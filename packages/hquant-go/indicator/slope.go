package indicator

import (
	"sync"

	"github.com/yourname/hquant-go/common"
	"github.com/yourname/hquant-go/quant"
)

type Slope struct {
	period int
	buf    *common.FloatRingBuffer
	mu     sync.RWMutex
}

func NewSlope(period int) *Slope {
	if period <= 0 {
		period = 5
	}
	return &Slope{period: period, buf: common.NewFloatRingBuffer(period)}
}
func (s *Slope) SetQuant(q *quant.Quant)   {}
func (s *Slope) SetMaxHistoryLength(n int) {}
func (s *Slope) Add(k quant.Kline)         { s.buf.Push(k.Close) }
func (s *Slope) UpdateLast(k quant.Kline)  { s.buf.UpdateLast(k.Close) }
func (s *Slope) GetValue(index int) (float64, bool) {
	if s.buf.Len() < s.period {
		return 0, false
	}
	// simple slope: last - first
	first, _ := s.buf.Get(0)
	last, _ := s.buf.Get(s.buf.Len() - 1)
	return last - first, true
}
