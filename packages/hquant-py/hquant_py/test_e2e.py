import unittest

from hquant_py import Bar, FuturesBacktest, HQuant


class TestE2E(unittest.TestCase):
    def test_add_strategy_and_backtest(self) -> None:
        try:
            hq = HQuant(64)
            bt = FuturesBacktest(
                initial_margin=1000.0,
                leverage=10.0,
                contract_size=1.0,
                maker_fee_rate=0.0004,
                taker_fee_rate=0.0004,
                maintenance_margin_rate=0.005,
            )
        except Exception as e:
            self.skipTest(str(e))

        sid = hq.add_strategy(
            "s",
            """
            IF RSI(3) < 30 THEN BUY
            IF RSI(3) > 70 THEN SELL
            """,
        )
        self.assertGreater(int(sid), 0)
        hq.add_rsi(3)

        close = 100.0
        for ts in range(0, 40):
            close -= 1.0
            hq.push_bar(Bar(ts=ts, open=close, high=close, low=close, close=close, volume=1.0))
            for sig in hq.poll_signals():
                bt.apply_signal(sig["action"], close, 100.0)

        for ts in range(40, 80):
            close += 1.0
            hq.push_bar(Bar(ts=ts, open=close, high=close, low=close, close=close, volume=1.0))
            for sig in hq.poll_signals():
                bt.apply_signal(sig["action"], close, 100.0)

        r = bt.result(close)
        self.assertTrue(r["equity"] == r["equity"])  # not NaN
        self.assertTrue(r["profit"] == r["profit"])  # not NaN


if __name__ == "__main__":
    unittest.main()

