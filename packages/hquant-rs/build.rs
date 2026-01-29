fn main() {
    // When building the Node addon (`--features ffi-node`), let napi-build configure
    // platform-specific linker flags and generate binding metadata.
    #[cfg(feature = "ffi-node")]
    napi_build::setup();

    // When building the Python extension (`--features ffi-python`) on macOS, resolve
    // Python symbols at load time (matches common wheel behavior).
    #[cfg(all(feature = "ffi-python", target_os = "macos"))]
    {
        println!("cargo:rustc-link-arg=-undefined");
        println!("cargo:rustc-link-arg=dynamic_lookup");
    }
}

