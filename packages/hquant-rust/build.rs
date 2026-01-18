fn main() {
    // Configure link args for N-API
    #[cfg(feature = "ffi-node")]
    {
        napi_build::setup();
    }

    // Configure dynamic lookup for PyO3 extension modules (esp. macOS)
    #[cfg(feature = "ffi-python")]
    {
        pyo3_build_config::add_extension_module_link_args();
    }
}
