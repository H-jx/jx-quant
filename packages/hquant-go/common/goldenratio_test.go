package common_test

import (
	"testing"

	"github.com/yourname/hquant-go/common"
)

func TestGoldenRatioCalculator(t *testing.T) {
	calc := common.NewGoldenRatioCalculator()
	res := calc.Calculate(100, 0.02)
	if len(res) == 0 {
		t.Fatalf("expected non-empty result")
	}
}
