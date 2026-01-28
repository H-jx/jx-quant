fn main() {
    // For Python extension modules on macOS, resolve Python symbols at load time.
    // This avoids linking against a specific libpython and matches how wheels are commonly built.
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-arg=-undefined");
        println!("cargo:rustc-link-arg=dynamic_lookup");
    }
}

