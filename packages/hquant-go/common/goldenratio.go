package common

type GoldenRatioCalculator struct{ ratio float64 }

func NewGoldenRatioCalculator() *GoldenRatioCalculator { return &GoldenRatioCalculator{ratio: 0.618} }

func (g *GoldenRatioCalculator) Calculate(value float64, min float64) []float64 {
	var res []float64
	remaining := value
	for remaining > min {
		next := remaining * g.ratio
		res = append(res, next)
		remaining -= next
	}
	return res
}
