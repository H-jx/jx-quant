
package types

// Kline represents a single candlestick data point.
type Kline struct {
	Open      float64
	Close     float64
	Low       float64
	High      float64
	Volume    float64
	Timestamp int64
}

// Signal represents a trading signal.
type Signal string

const (
	Buy  Signal = "BUY"
	Sell Signal = "SELL"
)

// SignalEvent represents a signal event.
type SignalEvent struct {
	Name   string
	Signal Signal
	Bar    Kline
}
