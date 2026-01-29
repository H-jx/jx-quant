use hquant_rs::engine::HQuant as CoreHQuant;
use hquant_rs::indicator::IndicatorSpec;
use hquant_rs::backtest::{BacktestParams as CoreBacktestParams, FuturesBacktest as CoreFuturesBacktest};
use hquant_rs::Bar as CoreBar;
use numpy::PyArray1;
use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::sync::{Arc, Mutex};

#[pyclass(unsendable)]
struct HQuant {
    inner: Arc<Mutex<CoreHQuant>>,
}

#[pyclass(unsendable)]
struct FuturesBacktest {
    inner: Mutex<CoreFuturesBacktest>,
}

#[pymethods]
impl HQuant {
    #[new]
    fn new(capacity: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(CoreHQuant::new(capacity))),
        }
    }

    fn add_rsi(&self, period: usize) -> PyResult<u32> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned"))?;
        Ok(hq.add_indicator(IndicatorSpec::Rsi { period }).0)
    }

    fn add_strategy(&self, name: &str, dsl: &str) -> PyResult<u32> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned"))?;
        hq.add_strategy(name, dsl).map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyValueError, _>(format!("{e:?}"))
        })
    }

    fn push_bar(
        &self,
        timestamp: i64,
        open: f64,
        high: f64,
        low: f64,
        close: f64,
        volume: f64,
        buy_volume: Option<f64>,
    ) -> PyResult<()> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned"))?;
        hq.push_kline(CoreBar::new(
            timestamp,
            open,
            high,
            low,
            close,
            volume,
            buy_volume.unwrap_or(0.0),
        ));
        Ok(())
    }

    fn update_last_bar(
        &self,
        timestamp: i64,
        open: f64,
        high: f64,
        low: f64,
        close: f64,
        volume: f64,
        buy_volume: Option<f64>,
    ) -> PyResult<()> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned"))?;
        hq.update_last(CoreBar::new(
            timestamp,
            open,
            high,
            low,
            close,
            volume,
            buy_volume.unwrap_or(0.0),
        ));
        Ok(())
    }

    fn indicator_last(&self, id: u32) -> PyResult<f64> {
        let hq = self
            .inner
            .lock()
            .map_err(|_| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned"))?;
        Ok(hq
            .indicator_last(hquant_rs::indicator::IndicatorId(id))
            .map(|v| v.a)
            .unwrap_or(f64::NAN))
    }

    fn poll_signals<'py>(&self, py: Python<'py>) -> PyResult<Vec<PyObject>> {
        let mut hq = self
            .inner
            .lock()
            .map_err(|_| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned"))?;
        let sigs = hq.poll_signals();
        let mut out = Vec::with_capacity(sigs.len());
        for s in sigs {
            let action = match s.action {
                hquant_rs::Action::Buy => "BUY",
                hquant_rs::Action::Sell => "SELL",
                hquant_rs::Action::Hold => "HOLD",
            };
            let d = PyDict::new_bound(py);
            d.set_item("strategy_id", s.strategy_id)?;
            d.set_item("action", action)?;
            d.set_item("timestamp", s.timestamp)?;
            out.push(d.into_any().unbind().into());
        }
        Ok(out)
    }

    /// Zero-copy view of the backing close ring buffer.
    ///
    /// Returns (array, capacity, len, head). Chronological order may wrap.
    fn close_column<'py>(
        slf: PyRef<'py, Self>,
        py: Python<'py>,
    ) -> PyResult<(Py<PyArray1<f64>>, usize, usize, usize)> {
        // The `numpy` Rust crate relies on the Python `numpy` package being importable at runtime.
        // Import it explicitly to return a Python exception instead of panicking deep in the C-API init.
        py.import_bound("numpy").map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyImportError, _>(format!(
                "numpy is required for close_column(): {e}"
            ))
        })?;

        let (ptr, cap, len, head) = {
            let hq = slf
                .inner
                .lock()
                .map_err(|_| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned"))?;
            hq.bars().close().raw_parts()
        };

        // Create an ndarray view over the ring backing storage with `self` as base object.
        // SAFETY: the backing Vec<f64> is fixed-capacity and will not be reallocated.
        let view = unsafe { numpy::ndarray::ArrayView1::from_shape_ptr(cap, ptr) };
        let base = slf.into_py(py).into_bound(py);
        let arr = unsafe { PyArray1::borrow_from_array_bound(&view, base) };
        Ok((arr.unbind(), cap, len, head))
    }
}

fn parse_action_str(s: &str) -> Option<hquant_rs::Action> {
    match s.to_ascii_uppercase().as_str() {
        "BUY" => Some(hquant_rs::Action::Buy),
        "SELL" => Some(hquant_rs::Action::Sell),
        "HOLD" => Some(hquant_rs::Action::Hold),
        _ => None,
    }
}

#[pymethods]
impl FuturesBacktest {
    #[new]
    fn new(
        initial_margin: f64,
        leverage: f64,
        contract_size: f64,
        maker_fee_rate: f64,
        taker_fee_rate: f64,
        maintenance_margin_rate: f64,
    ) -> PyResult<Self> {
        let params = CoreBacktestParams {
            initial_margin,
            leverage,
            contract_size,
            maker_fee_rate,
            taker_fee_rate,
            maintenance_margin_rate,
        };
        if !params.is_valid() {
            return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                "invalid backtest params",
            ));
        }
        Ok(Self {
            inner: Mutex::new(CoreFuturesBacktest::new(params)),
        })
    }

    fn apply_signal(&self, action: &str, price: f64, margin: f64) -> PyResult<()> {
        let a = parse_action_str(action).ok_or_else(|| {
            PyErr::new::<pyo3::exceptions::PyValueError, _>("invalid action")
        })?;
        let mut bt = self.inner.lock().map_err(|_| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned")
        })?;
        bt.apply_signal(a, price, margin);
        Ok(())
    }

    fn on_price(&self, price: f64) -> PyResult<()> {
        let mut bt = self.inner.lock().map_err(|_| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned")
        })?;
        bt.on_price(price);
        Ok(())
    }

    fn result<'py>(&self, py: Python<'py>, price: f64) -> PyResult<PyObject> {
        let bt = self.inner.lock().map_err(|_| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("lock poisoned")
        })?;
        let r = bt.result(price);
        let d = PyDict::new_bound(py);
        d.set_item("equity", r.equity)?;
        d.set_item("profit", r.profit)?;
        d.set_item("profit_rate", r.profit_rate)?;
        d.set_item("max_drawdown_rate", r.max_drawdown_rate)?;
        d.set_item("liquidated", r.liquidated)?;
        Ok(d.into_any().unbind().into())
    }
}

#[pymodule]
fn hquant_py_native(_py: Python, m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<HQuant>()?;
    m.add_class::<FuturesBacktest>()?;
    Ok(())
}
