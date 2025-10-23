
package common

// GoldenRatioCalculator calculates values based on the golden ratio.
type GoldenRatioCalculator struct {
	ratio float64
}

// NewGoldenRatioCalculator creates a new GoldenRatioCalculator.
func NewGoldenRatioCalculator(ratio float64) *GoldenRatioCalculator {
	return &GoldenRatioCalculator{
		ratio: ratio,
	}
}

// Calculate calculates a series of values based on the golden ratio.
func (grc *GoldenRatioCalculator) Calculate(value, min float64) []float64 {
	var result []float64
	remainingValue := value
	for remainingValue > min {
		nextValue := remainingValue * grc.ratio
		result = append(result, nextValue)
		remainingValue -= nextValue
	}
	return result
}
