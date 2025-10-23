package quant

// Core types and interfaces translated from hquant TypeScript definitions.

// Signal type for trading signals
type Signal string

const (
	SignalBuy  Signal = "BUY"
	SignalSell Signal = "SELL"
)

// Kline represents a candlestick / bar
type Kline struct {
	Open      float64
	Close     float64
	Low       float64
	High      float64
	Volume    float64
	Timestamp int64
}

// Indicator is the minimal interface indicators must implement
type Indicator interface {
	// SetQuant injects the parent Quant
	SetQuant(q *Quant)
	// SetMaxHistoryLength tells the indicator how much history it can expect
	SetMaxHistoryLength(n int)
	Add(data Kline)
	UpdateLast(data Kline)
	// GetValue returns (value, ok). ok==false when not enough data
	GetValue(index int) (float64, bool)
}

// Strategy signature
type Strategy func(indicators map[string]Indicator, bar Kline) Signal
