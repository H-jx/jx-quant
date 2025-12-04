package indicator

import (
	"sync"

	"github.com/yourname/hquant-go/common"
	"github.com/yourname/hquant-go/quant"
)

// MA computes simple moving average
type MA struct {
	period   int
	buf      *common.FloatRingBuffer
	sum      float64
	mu       sync.RWMutex
	quantRef *quant.Quant
}

func NewMA(period int) *MA {
	if period <= 0 {
		period = 1
	}
	return &MA{period: period, buf: common.NewFloatRingBuffer(period)}
}

func (m *MA) SetQuant(q *quant.Quant)   { m.quantRef = q }
func (m *MA) SetMaxHistoryLength(n int) {}

func (m *MA) Add(k quant.Kline) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// push new close
	if m.buf.Len() < m.period {
		m.buf.Push(k.Close)
		m.sum += k.Close
		return
	}
	// buffer full: subtract oldest and push
	oldest, _ := m.buf.Get(0)
	m.sum -= oldest
	m.buf.Push(k.Close)
	m.sum += k.Close
}

func (m *MA) UpdateLast(k quant.Kline) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.buf.Len() == 0 {
		return
	}
	// replace last
	lastIdx := m.buf.Len() - 1
	last, _ := m.buf.Get(lastIdx)
	m.sum += (k.Close - last)
	m.buf.UpdateLast(k.Close)
}

func (m *MA) GetValue(index int) (float64, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.buf.Len() < m.period {
		return 0, false
	}
	return m.sum / float64(m.period), true
}
