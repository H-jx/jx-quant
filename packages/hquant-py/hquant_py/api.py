import os
import sys
import ctypes
from dataclasses import dataclass
from typing import Optional, List

import numpy as np


@dataclass(frozen=True)
class Bar:
    ts: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    buy_volume: Optional[float] = 0.0


class _BarC(ctypes.Structure):
    _fields_ = [
        ("timestamp", ctypes.c_int64),
        ("open", ctypes.c_double),
        ("high", ctypes.c_double),
        ("low", ctypes.c_double),
        ("close", ctypes.c_double),
        ("volume", ctypes.c_double),
        ("buy_volume", ctypes.c_double),
    ]


class _SignalC(ctypes.Structure):
    _fields_ = [
        ("strategy_id", ctypes.c_uint32),
        ("action", ctypes.c_uint8),
        ("timestamp", ctypes.c_int64),
    ]


class _IndicatorValueC(ctypes.Structure):
    _fields_ = [
        ("kind", ctypes.c_uint8),
        ("a", ctypes.c_double),
        ("b", ctypes.c_double),
        ("c", ctypes.c_double),
    ]


class _HqColumnF64(ctypes.Structure):
    _fields_ = [
        ("ptr", ctypes.POINTER(ctypes.c_double)),
        ("capacity", ctypes.c_size_t),
        ("len", ctypes.c_size_t),
        ("head", ctypes.c_size_t),
    ]

class _BacktestParamsC(ctypes.Structure):
    _fields_ = [
        ("initial_margin", ctypes.c_double),
        ("leverage", ctypes.c_double),
        ("contract_size", ctypes.c_double),
        ("maker_fee_rate", ctypes.c_double),
        ("taker_fee_rate", ctypes.c_double),
        ("maintenance_margin_rate", ctypes.c_double),
    ]


class _BacktestResultC(ctypes.Structure):
    _fields_ = [
        ("equity", ctypes.c_double),
        ("profit", ctypes.c_double),
        ("profit_rate", ctypes.c_double),
        ("max_drawdown_rate", ctypes.c_double),
        ("liquidated", ctypes.c_uint8),
    ]


def _default_lib_name() -> str:
    if sys.platform == "darwin":
        return "libhquant_rs.dylib"
    if sys.platform.startswith("linux"):
        return "libhquant_rs.so"
    if sys.platform == "win32":
        return "hquant_rs.dll"
    raise RuntimeError(f"unsupported platform: {sys.platform}")


def _load_lib(path: Optional[str] = None) -> ctypes.CDLL:
    if path is None:
        path = os.environ.get("HQUANT_RS_LIB")
    if not path:
        # Try current working directory / default name.
        path = _default_lib_name()
    return ctypes.CDLL(path)


class HQuant:
    def __init__(self, capacity: int, lib_path: Optional[str] = None):
        self._lib = _load_lib(lib_path)
        self._bind(self._lib)
        self._ptr = self._lib.hquant_new(ctypes.c_size_t(capacity))
        if not self._ptr:
            raise MemoryError("hquant_new returned NULL")

    def close(self) -> None:
        if getattr(self, "_ptr", None):
            self._lib.hquant_free(self._ptr)
            self._ptr = None

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    @staticmethod
    def _bind(lib: ctypes.CDLL) -> None:
        # Constructors
        lib.hquant_new.argtypes = [ctypes.c_size_t]
        lib.hquant_new.restype = ctypes.c_void_p
        lib.hquant_free.argtypes = [ctypes.c_void_p]
        lib.hquant_free.restype = None

        # Indicators
        lib.hquant_add_rsi.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
        lib.hquant_add_rsi.restype = ctypes.c_uint32
        lib.hquant_add_strategy.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_uint8),
            ctypes.c_size_t,
            ctypes.POINTER(ctypes.c_uint8),
            ctypes.c_size_t,
        ]
        lib.hquant_add_strategy.restype = ctypes.c_uint32

        # Data feed
        lib.hquant_push_bar.argtypes = [ctypes.c_void_p, _BarC]
        lib.hquant_push_bar.restype = None
        lib.hquant_update_last_bar.argtypes = [ctypes.c_void_p, _BarC]
        lib.hquant_update_last_bar.restype = None

        # Values / signals
        lib.hquant_indicator_last.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        lib.hquant_indicator_last.restype = _IndicatorValueC

        lib.hquant_signals_len.argtypes = [ctypes.c_void_p]
        lib.hquant_signals_len.restype = ctypes.c_size_t
        lib.hquant_poll_signals.argtypes = [ctypes.c_void_p, ctypes.POINTER(_SignalC), ctypes.c_size_t]
        lib.hquant_poll_signals.restype = ctypes.c_size_t

        # Zero-copy columns
        lib.hquant_close_column.argtypes = [ctypes.c_void_p]
        lib.hquant_close_column.restype = _HqColumnF64

    def add_rsi(self, period: int) -> int:
        return int(self._lib.hquant_add_rsi(self._ptr, ctypes.c_size_t(period)))

    def add_strategy(self, name: str, dsl: str) -> int:
        name_b = name.encode("utf-8")
        dsl_b = dsl.encode("utf-8")
        name_buf = ctypes.create_string_buffer(name_b)
        dsl_buf = ctypes.create_string_buffer(dsl_b)
        return int(
            self._lib.hquant_add_strategy(
                self._ptr,
                ctypes.cast(name_buf, ctypes.POINTER(ctypes.c_uint8)),
                ctypes.c_size_t(len(name_b)),
                ctypes.cast(dsl_buf, ctypes.POINTER(ctypes.c_uint8)),
                ctypes.c_size_t(len(dsl_b)),
            )
        )

    def push_bar(self, bar: Bar) -> None:
        self._lib.hquant_push_bar(
            self._ptr,
            _BarC(
                timestamp=int(bar.ts),
                open=float(bar.open),
                high=float(bar.high),
                low=float(bar.low),
                close=float(bar.close),
                volume=float(bar.volume),
                buy_volume=float(0.0 if bar.buy_volume is None else bar.buy_volume),
            ),
        )

    def update_last_bar(self, bar: Bar) -> None:
        self._lib.hquant_update_last_bar(
            self._ptr,
            _BarC(
                timestamp=int(bar.ts),
                open=float(bar.open),
                high=float(bar.high),
                low=float(bar.low),
                close=float(bar.close),
                volume=float(bar.volume),
                buy_volume=float(0.0 if bar.buy_volume is None else bar.buy_volume),
            ),
        )

    def indicator_last(self, indicator_id: int) -> float:
        v = self._lib.hquant_indicator_last(self._ptr, ctypes.c_uint32(indicator_id))
        return float(v.a)

    def poll_signals(self) -> List[dict]:
        n = int(self._lib.hquant_signals_len(self._ptr))
        if n <= 0:
            return []
        buf = (_SignalC * n)()
        got = int(self._lib.hquant_poll_signals(self._ptr, buf, n))
        out = []
        for i in range(got):
            s = buf[i]
            action = int(s.action)
            action_str = "HOLD"
            if action == 1:
                action_str = "BUY"
            elif action == 2:
                action_str = "SELL"
            out.append(
                {
                    "strategy_id": int(s.strategy_id),
                    "action": action_str,
                    "timestamp": int(s.timestamp),
                }
            )
        return out

    def close_raw(self) -> np.ndarray:
        """
        Zero-copy view of the *backing ring buffer* (length == capacity).
        Chronological order may be wrapped; use returned metadata from C if you need ordering.
        """
        col = self._lib.hquant_close_column(self._ptr)
        if not col.ptr:
            return np.array([], dtype=np.float64)
        arr = np.ctypeslib.as_array(col.ptr, shape=(int(col.capacity),))
        return arr

    def close_ordered_slices(self):
        """
        Returns two zero-copy NumPy slices (a, b) that together represent the chronological
        close series (oldest -> newest).

        If the ring hasn't wrapped, `b` will be an empty slice.
        """
        col = self._lib.hquant_close_column(self._ptr)
        if not col.ptr or int(col.len) == 0:
            empty = np.array([], dtype=np.float64)
            return empty, empty
        buf = np.ctypeslib.as_array(col.ptr, shape=(int(col.capacity),))
        cap = int(col.capacity)
        length = int(col.len)
        head = int(col.head)
        start = (head + cap - length) % cap
        end = start + length
        if end <= cap:
            return buf[start:end], buf[:0]
        return buf[start:], buf[: end - cap]


class FuturesBacktest:
    ACTION_BUY = 1
    ACTION_SELL = 2
    ACTION_HOLD = 3

    def __init__(
        self,
        *,
        initial_margin: float,
        leverage: float,
        contract_size: float,
        maker_fee_rate: float,
        taker_fee_rate: float,
        maintenance_margin_rate: float,
        lib_path: Optional[str] = None,
    ):
        self._lib = _load_lib(lib_path)
        self._bind(self._lib)
        params = _BacktestParamsC(
            initial_margin=float(initial_margin),
            leverage=float(leverage),
            contract_size=float(contract_size),
            maker_fee_rate=float(maker_fee_rate),
            taker_fee_rate=float(taker_fee_rate),
            maintenance_margin_rate=float(maintenance_margin_rate),
        )
        self._ptr = self._lib.hq_backtest_new(params)
        if not self._ptr:
            raise ValueError("hq_backtest_new returned NULL (invalid params?)")

    def close(self) -> None:
        if getattr(self, "_ptr", None):
            self._lib.hq_backtest_free(self._ptr)
            self._ptr = None

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    @staticmethod
    def _bind(lib: ctypes.CDLL) -> None:
        lib.hq_backtest_new.argtypes = [_BacktestParamsC]
        lib.hq_backtest_new.restype = ctypes.c_void_p
        lib.hq_backtest_free.argtypes = [ctypes.c_void_p]
        lib.hq_backtest_free.restype = None
        lib.hq_backtest_apply_signal.argtypes = [ctypes.c_void_p, ctypes.c_uint8, ctypes.c_double, ctypes.c_double]
        lib.hq_backtest_apply_signal.restype = None
        lib.hq_backtest_on_price.argtypes = [ctypes.c_void_p, ctypes.c_double]
        lib.hq_backtest_on_price.restype = None
        lib.hq_backtest_result.argtypes = [ctypes.c_void_p, ctypes.c_double]
        lib.hq_backtest_result.restype = _BacktestResultC

    @staticmethod
    def _action_to_u8(action: str) -> int:
        a = action.upper()
        if a == "BUY":
            return FuturesBacktest.ACTION_BUY
        if a == "SELL":
            return FuturesBacktest.ACTION_SELL
        if a == "HOLD":
            return FuturesBacktest.ACTION_HOLD
        raise ValueError(f"invalid action: {action}")

    def apply_signal(self, action: str, price: float, margin: float) -> None:
        self._lib.hq_backtest_apply_signal(
            self._ptr,
            ctypes.c_uint8(self._action_to_u8(action)),
            ctypes.c_double(float(price)),
            ctypes.c_double(float(margin)),
        )

    def on_price(self, price: float) -> None:
        self._lib.hq_backtest_on_price(self._ptr, ctypes.c_double(float(price)))

    def result(self, price: float) -> dict:
        r = self._lib.hq_backtest_result(self._ptr, ctypes.c_double(float(price)))
        return {
            "equity": float(r.equity),
            "profit": float(r.profit),
            "profit_rate": float(r.profit_rate),
            "max_drawdown_rate": float(r.max_drawdown_rate),
            "liquidated": bool(int(r.liquidated)),
        }
