package hquantlib

import (
	"sync"

	"hquant-go-v2/common"
	"hquant-go-v2/types"
)

// Quant is the main struct for the quantitative framework.
type Quant struct {
	indicators     map[string]Indicator
	strategies     map[string]Strategy
	history        *common.CircularQueue
	maxHistoryLength int
	currentData    types.Kline // To store the last added/updated data
	signals        map[string]types.Signal
	mutex          sync.RWMutex
	signalCh       chan types.SignalEvent
}

// NewQuant creates a new Quant instance.
func NewQuant(maxHistoryLength int) *Quant {
	return &Quant{
		indicators:     make(map[string]Indicator),
		strategies:     make(map[string]Strategy),
		history:        common.NewCircularQueue(maxHistoryLength),
		maxHistoryLength: maxHistoryLength,
		signals:        make(map[string]types.Signal),
		signalCh:       make(chan types.SignalEvent, 100),
	}
}

// AddIndicator adds a new indicator to the framework.
func (q *Quant) AddIndicator(name string, indicator Indicator) {
	q.mutex.Lock()
	defer q.mutex.Unlock()
	q.indicators[name] = indicator
}

// RemoveIndicator removes an indicator from the framework.
func (q *Quant) RemoveIndicator(name string) {
	q.mutex.Lock()
	defer q.mutex.Unlock()
	delete(q.indicators, name)
}

// AddStrategy adds a new strategy to the framework.
func (q *Quant) AddStrategy(name string, strategy Strategy) {
	q.mutex.Lock()
	defer q.mutex.Unlock()
	q.strategies[name] = strategy
}

// RemoveStrategy removes a strategy from the framework.
func (q *Quant) RemoveStrategy(name string) {
	q.mutex.Lock()
	defer q.mutex.Unlock()
	delete(q.strategies, name)
}

// AddData adds a new data point to the history and updates indicators and strategies.
func (q *Quant) AddData(data types.Kline) {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	q.history.Push(data)
	q.currentData = data

	q.updateIndicators(data, false)
	q.updateStrategies(data)
}

// UpdateLastData updates the last data point and recalculates indicators and strategies.
func (q *Quant) UpdateLastData(data types.Kline) {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	if q.history.Size() > 0 {
		q.history.Update(q.history.Size()-1, data)
		q.currentData = data
		q.updateIndicators(data, true)
		q.updateStrategies(data)
	}
}

func (q *Quant) updateIndicators(data types.Kline, updateLast bool) {
	for _, indicator := range q.indicators {
		if updateLast {
			indicator.UpdateLast(data)
		} else {
			indicator.Add(data)
		}
	}
}

func (q *Quant) updateStrategies(data types.Kline) {
	for name, strategy := range q.strategies {
		signal := strategy(q.indicators, data)
		q.signals[name] = signal
		if signal != "" {
			q.signalCh <- types.SignalEvent{Name: name, Signal: signal, Bar: data}
		}
	}
}

// OnSignal returns a channel for receiving signal events.
func (q *Quant) OnSignal() <-chan types.SignalEvent {
	return q.signalCh
}

// GetIndicator returns an indicator by name.
func (q *Quant) GetIndicator(name string) Indicator {
	q.mutex.RLock()
	defer q.mutex.RUnlock()
	return q.indicators[name]
}

// GetSignal returns a signal by name.
func (q *Quant) GetSignal(name string) types.Signal {
	q.mutex.RLock()
	defer q.mutex.RUnlock()
	return q.signals[name]
}

// History returns the historical data.
func (q *Quant) History() []types.Kline {
	q.mutex.RLock()
	defer q.mutex.RUnlock()
	// Return a copy to prevent modification
	historyCopy := make([]types.Kline, q.history.Size())
	for i := 0; i < q.history.Size(); i++ {
		historyCopy[i] = q.history.Get(i).(types.Kline)
	}
	return historyCopy
}