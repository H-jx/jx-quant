from .api import Bar

# Prefer the PyO3 native extension if available; fall back to ctypes wrapper.
try:
    from .native import HQuant, FuturesBacktest  # type: ignore
except Exception:
    from .api import HQuant, FuturesBacktest  # type: ignore

__all__ = ["HQuant", "FuturesBacktest", "Bar"]
