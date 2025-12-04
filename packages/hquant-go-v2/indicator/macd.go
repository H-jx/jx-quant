
package indicator

import (
	"math"

	"hquant-go-v2/common"
	"hquant-go-v2/types"
)

// MACDResult represents the result of the MACD indicator.
type MACDResult struct {
	MACD       float64
	SignalLine float64
	Histogram  float64
}

// MACD represents the Moving Average Convergence Divergence indicator.
type MACD struct {
	shortTermMA  *MA
	longTermMA   *MA
	signalLineMA *MA
	macdLine     *common.TypedRingBuffer
	signalLine   *common.TypedRingBuffer
	result       *common.RingDataFrame
}

// NewMACD creates a new MACD indicator.
func NewMACD(shortTermPeriod, longTermPeriod, signalLinePeriod, maxHistoryLength int) (*MACD, error) {
	shortTermMA := NewMA(shortTermPeriod, maxHistoryLength)
	longTermMA := NewMA(longTermPeriod, maxHistoryLength)
	signalLineMA := NewMA(signalLinePeriod, maxHistoryLength)

	macdLine := common.NewTypedRingBuffer(maxHistoryLength)
	signalLine := common.NewTypedRingBuffer(maxHistoryLength)

	schema := common.DataFrameSchema{
		"MACD":       "float",
		"SignalLine": "float",
		"Histogram":  "float",
	}
	result, err := common.NewRingDataFrame(schema, maxHistoryLength)
	if err != nil {
		return nil, err
	}

	return &MACD{
		shortTermMA:  shortTermMA,
		longTermMA:   longTermMA,
	signalLineMA: signalLineMA,
		macdLine:     macdLine,
		signalLine:   signalLine,
		result:       result,
	}, nil
}

// Add adds a new data point to the indicator.
func (m *MACD) Add(data hquant.Kline) {
	m.shortTermMA.Add(data)
	m.longTermMA.Add(data)

	shortTermMAValue := m.shortTermMA.GetValue(-1).(float64)
	longTermMAValue := m.longTermMA.GetValue(-1).(float64)

	macdValue := shortTermMAValue - longTermMAValue
	m.macdLine.Push(macdValue)

	signalLineValue := math.NaN()
	if m.macdLine.Size() >= m.signalLineMA.period {
		m.signalLineMA.Add(hquant.Kline{Close: macdValue}) // Use macdValue as input for signal line MA
		signalLineValue = m.signalLineMA.GetValue(-1).(float64)
		m.signalLine.Push(signalLineValue)
	} else {
		m.signalLine.Push(math.NaN())
	}

	histogram := macdValue - signalLineValue
	m.result.Push(map[string]interface{}{"MACD": macdValue, "SignalLine": signalLineValue, "Histogram": histogram})
}

// UpdateLast updates the last data point of the indicator.
func (m *MACD) UpdateLast(data hquant.Kline) {
	m.shortTermMA.UpdateLast(data)
	m.longTermMA.UpdateLast(data)

	shortTermMAValue := m.shortTermMA.GetValue(-1).(float64)
	longTermMAValue := m.longTermMA.GetValue(-1).(float64)

	macdValue := shortTermMAValue - longTermMAValue
	m.macdLine.Update(m.macdLine.Size()-1, macdValue)

	signalLineValue := math.NaN()
	if m.macdLine.Size() >= m.signalLineMA.period {
		m.signalLineMA.UpdateLast(hquant.Kline{Close: macdValue})
		signalLineValue = m.signalLineMA.GetValue(-1).(float64)
		m.signalLine.Update(m.signalLine.Size()-1, signalLineValue)
	}

	histogram := macdValue - signalLineValue
	m.result.UpdateRow(m.result.Length()-1, map[string]interface{}{"MACD": macdValue, "SignalLine": signalLineValue, "Histogram": histogram})
}

// GetValue returns the MACD value at a specific index.
func (m *MACD) GetValue(index int) interface{} {
	val, _ := m.result.GetRow(index)
	return val
}
