package main

import (
	"fmt"
	"time"

	"hquant-go-v2/hquantlib"
	"hquant-go-v2/indicator"
	"hquant-go-v2/types"
)

func main() {
	// Create a new Quant instance
	q := hquantlib.NewQuant(10)

	// Add indicators
	ma := indicator.NewMA(5, 10)
	q.AddIndicator("ma5", ma)

	rsi := indicator.NewRSI(5, 10)
	q.AddIndicator("rsi5", rsi)

	boll, _ := indicator.NewBOLL(5, 2.0, 10)
	q.AddIndicator("boll", boll)

	macd, _ := indicator.NewMACD(12, 26, 9, 10)
	q.AddIndicator("macd", macd)

	atr := indicator.NewATR(5, 10)
	q.AddIndicator("atr", atr)

	vri := indicator.NewVRI(5, 10)
	q.AddIndicator("vri", vri)

	// Add a strategy
	q.AddStrategy("simple_rsi_strategy", func(indicators map[string]hquantlib.Indicator, bar types.Kline) types.Signal {
		rsiVal := indicators["rsi5"].GetValue(-1).(float64)
		if rsiVal < 30 {
			return types.Buy
		}
		if rsiVal > 70 {
			return types.Sell
		}
		return ""
	})

	// Listen for signals
	go func() {
		for signalEvent := range q.OnSignal() {
			fmt.Printf("Signal: %s, Type: %s, Bar: %+v\n", signalEvent.Name, signalEvent.Signal, signalEvent.Bar)
		}
	}()

	// Add some dummy data
	for i := 0; i < 15; i++ {
		kline := types.Kline{
			Open:      float64(100 + i),
				Close:     float64(100 + i + 1),
				Low:       float64(99 + i),
				High:      float64(102 + i),
				Volume:    float64(1000 + i*100),
				Timestamp: time.Now().UnixNano() / int64(time.Millisecond),
		}
		q.AddData(kline)

		// Print indicator values
		if i >= 4 { // MA and RSI need at least 5 data points
			fmt.Printf("MA(5): %.2f, ", q.GetIndicator("ma5").GetValue(-1).(float64))
			fmt.Printf("RSI(5): %.2f, ", q.GetIndicator("rsi5").GetValue(-1).(float64))
			bollVal := q.GetIndicator("boll").GetValue(-1).(map[string]interface{})
			fmt.Printf("BOLL: Up=%.2f, Mid=%.2f, Low=%.2f, ", bollVal["up"].(float64), bollVal["mid"].(float64), bollVal["low"].(float64))
			macdVal := q.GetIndicator("macd").GetValue(-1).(map[string]interface{})
			fmt.Printf("MACD: MACD=%.2f, Signal=%.2f, Hist=%.2f, ", macdVal["MACD"].(float64), macdVal["SignalLine"].(float64), macdVal["Histogram"].(float64))
			atrVal := q.GetIndicator("atr").GetValue(-1).(float64)
			fmt.Printf("ATR(5): %.2f, ", atrVal)
			vriVal := q.GetIndicator("vri").GetValue(-1).(float64)
			fmt.Printf("VRI(5): %.2f\n", vriVal)
		}
	}

	// Give some time for signals to be processed
	time.Sleep(100 * time.Millisecond)

	fmt.Println("History:", q.History())
}