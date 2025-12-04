package hquantlib

import (
	"hquant-go-v2/types"
)

// Indicator is the interface for all technical indicators.
type Indicator interface {
	Add(data types.Kline)
	UpdateLast(data types.Kline)
	GetValue(index int) interface{}
}

// Strategy is a function that takes indicators and a Kline, and returns a Signal.
type Strategy func(indicators map[string]Indicator, bar types.Kline) types.Signal