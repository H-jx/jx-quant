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
    buy_volume: float = 0.0


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
                buy_volume=float(bar.buy_volume),
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
                buy_volume=float(bar.buy_volume),
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
            out.append(
                {
                    "strategy_id": int(s.strategy_id),
                    "action": int(s.action),
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
