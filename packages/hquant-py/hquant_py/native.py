from __future__ import annotations

from typing import Optional, List, Tuple

import numpy as np

from .api import Bar


class HQuant:
    """
    Thin Pythonic adapter over the PyO3 extension module `hquant_py_native`.

    This keeps the same `Bar` dataclass interface as the ctypes wrapper, while the
    heavy lifting runs inside Rust.
    """

    def __init__(self, capacity: int):
        import hquant_py_native  # type: ignore

        self._native = hquant_py_native.HQuant(int(capacity))

    def add_rsi(self, period: int) -> int:
        return int(self._native.add_rsi(int(period)))

    def add_strategy(self, name: str, dsl: str) -> int:
        return int(self._native.add_strategy(name, dsl))

    def push_bar(self, bar: Bar) -> None:
        self._native.push_bar(
            int(bar.ts),
            float(bar.open),
            float(bar.high),
            float(bar.low),
            float(bar.close),
            float(bar.volume),
            None if bar.buy_volume is None else float(bar.buy_volume),
        )

    def update_last_bar(self, bar: Bar) -> None:
        self._native.update_last_bar(
            int(bar.ts),
            float(bar.open),
            float(bar.high),
            float(bar.low),
            float(bar.close),
            float(bar.volume),
            None if bar.buy_volume is None else float(bar.buy_volume),
        )

    def indicator_last(self, indicator_id: int) -> float:
        return float(self._native.indicator_last(int(indicator_id)))

    def poll_signals(self) -> List[dict]:
        return list(self._native.poll_signals())

    def close_column(self) -> Tuple[np.ndarray, int, int, int]:
        arr, cap, length, head = self._native.close_column()
        return np.asarray(arr), int(cap), int(length), int(head)

