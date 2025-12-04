package quant

import (
	"sync"

	"github.com/yourname/hquant-go/common"
)

// Quant is the core framework. It's concurrency-safe for reads/writes to signals and indicators.
type Quant struct {
	indicators map[string]Indicator
	strategies map[string]Strategy
	signals    map[string]Signal

	history    *common.CircularQueue[Kline]
	maxHistory int

	mu sync.RWMutex
	// simple event callbacks: name -> []callbacks
	callbacks map[string][]func(Signal, Kline)
	current   Kline
}

func NewQuant(maxHistory int) *Quant {
	if maxHistory <= 0 {
		maxHistory = 240
	}
	return &Quant{
		indicators: make(map[string]Indicator),
		strategies: make(map[string]Strategy),
		signals:    make(map[string]Signal),
		history:    common.NewCircularQueue[Kline](maxHistory),
		maxHistory: maxHistory,
		callbacks:  make(map[string][]func(Signal, Kline)),
	}
}

func (q *Quant) AddIndicator(name string, ind Indicator) {
	ind.SetMaxHistoryLength(q.maxHistory)
	ind.SetQuant(q)
	q.mu.Lock()
	defer q.mu.Unlock()
	q.indicators[name] = ind
}

func (q *Quant) AddStrategy(name string, s Strategy) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.strategies[name] = s
}

func (q *Quant) AddData(k Kline) {
	q.mu.Lock()
	q.history.Push(k)
	q.current = k
	// update indicators
	for _, ind := range q.indicators {
		ind.Add(k)
	}
	// run strategies
	for name, strat := range q.strategies {
		go func(n string, s Strategy) {
			defer func() { recover() }()
			sig := s(q.indicators, k)
			if sig != "" {
				q.mu.Lock()
				q.signals[n] = sig
				cbs := q.callbacks[n]
				q.mu.Unlock()
				for _, cb := range cbs {
					cb(sig, k)
				}
			}
		}(name, strat)
	}
	q.mu.Unlock()
	// broadcast all
	q.mu.RLock()
	cbs := q.callbacks["all"]
	q.mu.RUnlock()
	for _, cb := range cbs {
		cb(q.signals[""], k)
	}
}

func (q *Quant) UpdateLastData(k Kline) {
	q.mu.Lock()
	if q.history.Size() > 0 {
		q.history.Update(q.history.Size()-1, k)
		q.current = k
		for _, ind := range q.indicators {
			ind.UpdateLast(k)
		}
		for name, strat := range q.strategies {
			go func(n string, s Strategy) {
				defer func() { recover() }()
				sig := s(q.indicators, k)
				if sig != "" {
					q.mu.Lock()
					q.signals[n] = sig
					cbs := q.callbacks[n]
					q.mu.Unlock()
					for _, cb := range cbs {
						cb(sig, k)
					}
				}
			}(name, strat)
		}
	}
	q.mu.Unlock()
}

func (q *Quant) OnSignal(name string, cb func(Signal, Kline)) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.callbacks[name] = append(q.callbacks[name], cb)
}

func (q *Quant) GetIndicator(name string) (Indicator, bool) {
	q.mu.RLock()
	defer q.mu.RUnlock()
	ind, ok := q.indicators[name]
	return ind, ok
}
