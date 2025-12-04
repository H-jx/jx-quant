package backtest_test

import (
	"testing"

	bt "github.com/yourname/hquant-go/backtest"
	"github.com/yourname/hquant-go/quant"
)

func TestBacktestProfit(t *testing.T) {
	b := bt.NewBacktest(bt.Options{Balance: 1400, Volume: 0, TradeVolume: 0.5})
	b.MockTrade(struct {
		quant.Kline
		Action quant.Signal
	}{quant.Kline{Close: 100}, quant.SignalBuy})
	b.MockTrade(struct {
		quant.Kline
		Action quant.Signal
	}{quant.Kline{Close: 200}, quant.SignalSell})
	profit := b.Result()
	if profit <= 0 {
		t.Fatalf("expected positive profit got %v", profit)
	}
}

func TestBacktestDrawdown(t *testing.T) {
	b := bt.NewBacktest(bt.Options{Balance: 1400, Volume: 0, TradeVolume: 1})
	b.MockTrade(struct {
		quant.Kline
		Action quant.Signal
	}{quant.Kline{Close: 1300}, quant.SignalBuy})
	b.MockTrade(struct {
		quant.Kline
		Action quant.Signal
	}{quant.Kline{Close: 700}, quant.SignalSell})
	b.MockTrade(struct {
		quant.Kline
		Action quant.Signal
	}{quant.Kline{Close: 900}, quant.SignalBuy})
	b.MockTrade(struct {
		quant.Kline
		Action quant.Signal
	}{quant.Kline{Close: 800}, quant.SignalSell})
	profit := b.Result()
	if profit >= 0 {
		t.Fatalf("expected loss got %v", profit)
	}
}
