
package hquant

import (
	"sync"
)

// Quant is the main struct for the quantitative framework.
type Quant struct {
	indicators     map[string]Indicator
	strategies     map[string]Strategy
	history        *common.CircularQueue
	maxHistoryLength int
	currentData    Kline // To store the last added/updated data
	signals        map[string]Signal
	mutex          sync.RWMutex
	signalCh       chan SignalEvent
}

// SignalEvent represents a signal event.
type SignalEvent struct {
	Name   string
	Signal Signal
	Bar    Kline
}

// NewQuant creates a new Quant instance.
func NewQuant(maxHistoryLength int) *Quant {
	return &Quant{
		indicators:     make(map[string]Indicator),
		strategies:     make(map[string]Strategy),
		history:        common.NewCircularQueue(maxHistoryLength),
		maxHistoryLength: maxHistoryLength,
		signals:        make(map[string]Signal),
		signalCh:       make(chan SignalEvent, 100),
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

func (q *Quant) AddData(data Kline) {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	q.history.Push(data)
	q.currentData = data

	q.updateIndicators(data, false)
	q.updateStrategies(data)
}

// UpdateLastData updates the last data point and recalculates indicators and strategies.
func (q *Quant) UpdateLastData(data Kline) {
	q.mutex.Lock()
	defer q.mutex.Unlock()

	if q.history.Size() > 0 {
		q.history.Update(q.history.Size()-1, data)
		q.currentData = data
		q.updateIndicators(data, true)
		q.updateStrategies(data)
	}
}

func (q *Quant) updateIndicators(data Kline, updateLast bool) {
	for _, indicator := range q.indicators {
		if updateLast {
			indicator.UpdateLast(data)
		} else {
			indicator.Add(data)
		}
	}
}

func (q *Quant) updateStrategies(data Kline) {
	for name, strategy := range q.strategies {
		signal := strategy(q.indicators, data)
		q.signals[name] = signal
		if signal != "" {
			q.signalCh <- SignalEvent{Name: name, Signal: signal, Bar: data}
		}
	}
}

// OnSignal returns a channel for receiving signal events.
func (q *Quant) OnSignal() <-chan SignalEvent {
	return q.signalCh
}

// GetIndicator returns an indicator by name.
func (q *Quant) GetIndicator(name string) Indicator {
	q.mutex.RLock()
	defer q.mutex.RUnlock()
	return q.indicators[name]
}

// GetSignal returns a signal by name.
func (q *Quant) GetSignal(name string) Signal {
	q.mutex.RLock()
	defer q.mutex.RUnlock()
	return q.signals[name]
}

// History returns the historical data.
func (q *Quant) History() []Kline {
	q.mutex.RLock()
	defer q.mutex.RUnlock()
	// Return a copy to prevent modification
	historyCopy := make([]Kline, q.history.Size())
	for i := 0; i < q.history.Size(); i++ {
		historyCopy[i] = q.history.Get(i).(Kline)
	}
	return historyCopy
}

