
package indicator

import (
	"math"

	"hquant-go-v2/common"
	"hquant-go-v2/types"
)

// BOLLResult represents the result of the Bollinger Bands indicator.
type BOLLResult struct {
	Up  float64
	Mid float64
	Low float64
}

// BOLL represents the Bollinger Bands indicator.
type BOLL struct {
	ma          *MA
	stdDevQueue *common.TypedRingBuffer
	stdDevFactor float64
	result      *common.RingDataFrame
}

// NewBOLL creates a new BOLL indicator.
func NewBOLL(period int, stdDevFactor float64, maxHistoryLength int) (*BOLL, error) {
	ma := NewMA(period, maxHistoryLength)
	stdDevQueue := common.NewTypedRingBuffer(period)

	schema := common.DataFrameSchema{
		"up":  "float",
		"mid": "float",
		"low": "float",
	}
	result, err := common.NewRingDataFrame(schema, maxHistoryLength)
	if err != nil {
		return nil, err
	}

	return &BOLL{
		ma:          ma,
		stdDevQueue: stdDevQueue,
		stdDevFactor: stdDevFactor,
		result:      result,
	}, nil
}

// Add adds a new data point to the indicator.
func (b *BOLL) Add(data hquant.Kline) {
	b.ma.Add(data)
	b.stdDevQueue.Push(data.Close)

	stdDev := b.calculateStdDev()
	if math.IsNaN(stdDev) {
		b.result.Push(map[string]interface{}{"up": math.NaN(), "mid": math.NaN(), "low": math.NaN()})
	} else {
		maValue := b.ma.GetValue(-1).(float64)
		upperBand := maValue + b.stdDevFactor*stdDev
		midBand := maValue
		lowerBand := maValue - b.stdDevFactor*stdDev
		b.result.Push(map[string]interface{}{"up": upperBand, "mid": midBand, "low": lowerBand})
	}
}

// UpdateLast updates the last data point of the indicator.
func (b *BOLL) UpdateLast(data hquant.Kline) {
	b.ma.UpdateLast(data)
	b.stdDevQueue.Update(b.stdDevQueue.Size()-1, data.Close)

	stdDev := b.calculateStdDev()
	if math.IsNaN(stdDev) {
		b.result.UpdateRow(b.result.Length()-1, map[string]interface{}{"up": math.NaN(), "mid": math.NaN(), "low": math.NaN()})
	} else {
		maValue := b.ma.GetValue(-1).(float64)
		upperBand := maValue + b.stdDevFactor*stdDev
		midBand := maValue
		lowerBand := maValue - b.stdDevFactor*stdDev
		b.result.UpdateRow(b.result.Length()-1, map[string]interface{}{"up": upperBand, "mid": midBand, "low": lowerBand})
	}
}

// GetValue returns the BOLL value at a specific index.
func (b *BOLL) GetValue(index int) interface{} {
	val, _ := b.result.GetRow(index)
	return val
}

func (b *BOLL) calculateStdDev() float64 {
	size := b.stdDevQueue.Size()
	if size < b.stdDevFactor {
		return math.NaN()
	}
	
	maValue := b.ma.GetValue(-1).(float64)
	sumSqDiff := 0.0
	count := 0
	for i := 0; i < size; i++ {
		value := b.stdDevQueue.Get(i)
		if !math.IsNaN(value) {
			diff := value - maValue
			sumSqDiff += diff * diff
			count++
		}
	}
	if count == 0 {
		return math.NaN()
	}
	return math.Sqrt(sumSqDiff / float64(count))
}
