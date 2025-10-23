package backtest

import (
	"github.com/yourname/hquant-go/quant"
)

type Options struct {
	Balance     float64
	Volume      float64
	TradeVolume float64
}

type Trade struct {
	Price  float64
	Volume float64
	Action quant.Signal
}

type Backtest struct {
	opts      Options
	balance   float64
	volume    float64
	lastPrice float64
	trades    []Trade
}

func NewBacktest(opts Options) *Backtest {
	b := &Backtest{opts: opts}
	b.Reset()
	return b
}

func (b *Backtest) Reset() {
	b.balance = b.opts.Balance
	b.volume = b.opts.Volume
	b.trades = nil
}

func (b *Backtest) MockTrade(d struct {
	quant.Kline
	Action quant.Signal
}) {
	if d.Action == "" {
		b.lastPrice = d.Kline.Close
		return
	}
	vol := b.opts.TradeVolume
	if d.Action == quant.SignalBuy {
		cost := vol * d.Kline.Close
		if b.balance >= cost {
			b.balance -= cost
			b.volume += vol
			b.trades = append(b.trades, Trade{Price: d.Kline.Close, Volume: vol, Action: d.Action})
		}
	} else if d.Action == quant.SignalSell {
		if b.volume >= vol {
			b.volume -= vol
			b.balance += vol * d.Kline.Close
			b.trades = append(b.trades, Trade{Price: d.Kline.Close, Volume: vol, Action: d.Action})
		}
	}
	b.lastPrice = d.Kline.Close
}

func (b *Backtest) Run(data []struct {
	quant.Kline
	Action quant.Signal
}) {
	for _, d := range data {
		b.MockTrade(d)
	}
}

func (b *Backtest) Result() (profit float64) {
	initial := b.opts.Balance + b.opts.Volume*b.opts.Balance
	current := b.balance + b.volume*b.lastPrice
	return current - initial
}
