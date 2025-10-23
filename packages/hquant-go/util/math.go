package util

import "math"

// KeepDecimalFixed rounds value to n decimal places
func KeepDecimalFixed(v float64, n int) float64 {
	if n < 0 {
		return v
	}
	mul := math.Pow(10, float64(n))
	return math.Round(v*mul) / mul
}

// AutoToFixed converts numeric-like input to float64 with safe parsing (for now accept float64)
func AutoToFixed(v float64) float64 {
	return v
}
