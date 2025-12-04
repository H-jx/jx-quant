package indicator

import (
	"sync"

	"github.com/yourname/hquant-go/common"
	"github.com/yourname/hquant-go/quant"
	"github.com/yourname/hquant-go/util"
)

// RSI computes relative strength index
type RSI struct {
	period  int
	gains   *common.FloatRingBuffer
	losses  *common.FloatRingBuffer
	avgGain float64
	avgLoss float64
	mu      sync.RWMutex
}

func NewRSI(period int) *RSI {
	if period <= 0 {
		period = 14
	}
	return &RSI{period: period, gains: common.NewFloatRingBuffer(period), losses: common.NewFloatRingBuffer(period), avgGain: 0, avgLoss: 0}
}

func (r *RSI) SetQuant(q *quant.Quant)   {}
func (r *RSI) SetMaxHistoryLength(n int) {}

func (r *RSI) Add(k quant.Kline) {
	r.mu.Lock()
	defer r.mu.Unlock()
	change := k.Close - k.Open
	if change > 0 {
		r.avgGain = (r.avgGain*float64(r.period-1) + change) / float64(r.period)
		r.avgLoss = (r.avgLoss * float64(r.period-1)) / float64(r.period)
	} else {
		r.avgGain = (r.avgGain * float64(r.period-1)) / float64(r.period)
		r.avgLoss = (r.avgLoss*float64(r.period-1) - change) / float64(r.period)
	}

	rs := 0.0
	if r.avgLoss != 0 {
		rs = r.avgGain / r.avgLoss
	}
	rsi := util.KeepDecimalFixed(100-100/(1+rs), 2)
	r.gains.Push(rsi)
}

func (r *RSI) UpdateLast(k quant.Kline) {
	r.mu.Lock()
	defer r.mu.Unlock()
	change := k.Close - k.Open
	var avgGain, avgLoss float64
	if change > 0 {
		avgGain = (r.avgGain*float64(r.period-1) + change) / float64(r.period)
		avgLoss = (r.avgLoss * float64(r.period-1)) / float64(r.period)
	} else {
		avgGain = (r.avgGain * float64(r.period-1)) / float64(r.period)
		avgLoss = (r.avgLoss*float64(r.period-1) - change) / float64(r.period)
	}
	rs := 0.0
	if avgLoss != 0 {
		rs = avgGain / avgLoss
	}
	rsi := util.KeepDecimalFixed(100-100/(1+rs), 2)
	if r.gains.Len() > 0 {
		r.gains.UpdateLast(rsi)
	}
}

func (r *RSI) GetValue(index int) (float64, bool) {
	if index < 0 {
		idx := r.gains.Len() + index
		if idx < 0 {
			return 0, false
		}
		return r.gains.Get(idx)
	}
	return r.gains.Get(index)
}
