//! Link settings of a Node-API addon (macOS: Node-API symbols resolve from the host at load time).

fn main() {
    napi_build::setup();
    // A prefix-independent ID lets Homebrew preserve the checksum-verified addon.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg-cdylib=-Wl,-install_name,@rpath/hugr_omni.node");
    }
}
