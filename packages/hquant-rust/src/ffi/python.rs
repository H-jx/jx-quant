use std::sync::Mutex;

use pyo3::prelude::*;

use crate::{Bar, MAType, QuantEngine, Signal, Side};

fn to_bar(bar: &PyBar) -> Bar {
    Bar {
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
    }
}

fn parse_ma_type(ma_type: &str) -> PyResult<MAType> {
    match ma_type.to_uppercase().as_str() {
        "SMA" => Ok(MAType::SMA),
        "EMA" => Ok(MAType::EMA),
        "WMA" => Ok(MAType::WMA),
        other => Err(pyo3::exceptions::PyValueError::new_err(format!(
            "Unknown MA type: {}",
            other
        ))),
    }
}

fn signal_to_output(signal: &Signal) -> PySignal {
    PySignal {
        side: match signal.side {
            Side::Buy => "BUY".to_string(),
            Side::Sell => "SELL".to_string(),
            Side::Hold => "HOLD".to_string(),
        },
        strength: signal.strength,
        reason: signal.reason.clone(),
        timestamp: signal.timestamp,
    }
}

#[pyclass]
#[derive(Clone)]
pub struct PyBar {
    #[pyo3(get, set)]
    pub timestamp: i64,
    #[pyo3(get, set)]
    pub open: f64,
    #[pyo3(get, set)]
    pub high: f64,
    #[pyo3(get, set)]
    pub low: f64,
    #[pyo3(get, set)]
    pub close: f64,
    #[pyo3(get, set)]
    pub volume: f64,
}

#[pymethods]
impl PyBar {
    #[new]
    pub fn new(timestamp: i64, open: f64, high: f64, low: f64, close: f64, volume: f64) -> Self {
        Self {
            timestamp,
            open,
            high,
            low,
            close,
            volume,
        }
    }
}

#[pyclass]
#[derive(Clone)]
pub struct PySignal {
    #[pyo3(get)]
    pub side: String,
    #[pyo3(get)]
    pub strength: f64,
    #[pyo3(get)]
    pub reason: String,
    #[pyo3(get)]
    pub timestamp: i64,
}

#[pyclass]
pub struct PyEngine {
    inner: Mutex<QuantEngine>,
}

#[pymethods]
impl PyEngine {
    #[new]
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Mutex::new(QuantEngine::new(capacity)),
        }
    }

    pub fn add_ma(&self, name: String, period: usize, ma_type: String) -> PyResult<()> {
        let mut engine = self.inner.lock().unwrap();
        let ty = parse_ma_type(&ma_type)?;
        engine.add_ma(name, period, ty);
        Ok(())
    }

    pub fn append_bar(&self, bar: PyBar) -> PyResult<Vec<PySignal>> {
        let mut engine = self.inner.lock().unwrap();
        let signals: Vec<PySignal> = engine
            .append_bar(&to_bar(&bar))
            .iter()
            .map(signal_to_output)
            .collect();
        Ok(signals)
    }

    pub fn update_last_bar(&self, bar: PyBar) -> PyResult<()> {
        let mut engine = self.inner.lock().unwrap();
        engine.update_last_bar(&to_bar(&bar));
        Ok(())
    }

    pub fn load_history(&self, bars: Vec<PyBar>) -> PyResult<()> {
        let mut engine = self.inner.lock().unwrap();
        let rust_bars: Vec<Bar> = bars.iter().map(to_bar).collect();
        engine.load_history(&rust_bars);
        Ok(())
    }

    pub fn indicator_value(&self, name: String) -> Option<f64> {
        let engine = self.inner.lock().unwrap();
        engine.indicator_value(&name)
    }

    pub fn indicator_ready(&self, name: String) -> bool {
        let engine = self.inner.lock().unwrap();
        engine.indicator_ready(&name)
    }

    pub fn reset(&self) {
        let mut engine = self.inner.lock().unwrap();
        engine.reset();
    }
}

#[pymodule]
pub fn hquant_py(_py: Python<'_>, m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyEngine>()?;
    m.add_class::<PyBar>()?;
    m.add_class::<PySignal>()?;
    Ok(())
}
