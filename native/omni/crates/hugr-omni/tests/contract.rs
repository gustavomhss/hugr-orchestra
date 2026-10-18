//! The contract suite (C-RS-02): every scenario of `conformance/scenarios` meant for this OS and for Rust,
//! run through the public Rust API. One line per scenario, then `contract: N passed, M pending, K failed`; only
//! K > 0 fails. Items listed in `conformance/pending.txt` cannot pass yet: their product failures are `pending`.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod runner;

use std::path::{Path, PathBuf};

/// The only test of this binary: `use_supervisor` runs before any thread exists (AGENTS.md).
#[test]
fn contract() {
    use_supervisor();
    let fixture = binary("omni-fixture", "omni-fixture");
    // Warm-up, not synchronization: an OS may validate a freshly built executable on its first exec (seconds on
    // macOS under load), which must not eat into the first scenario's step timeout.
    let warm = std::process::Command::new(&fixture).status();
    assert!(
        warm.as_ref().is_ok_and(|s| s.success()),
        "{} does not run: {warm:?}",
        fixture.display()
    );
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../conformance");
    let ledger_path = root.join("pending.txt");
    let ledger = std::fs::read_to_string(&ledger_path).unwrap_or_else(|e| panic!("{}: {e}", ledger_path.display()));
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("tokio runtime");
    let sum = runtime.block_on(runner::suite(&root.join("scenarios"), &ledger, &fixture));
    println!(
        "contract: {} passed, {} pending, {} failed ({} scenarios run on {}/rust; {} files, {} for other OSes or \
         languages)",
        sum.passed,
        sum.pending,
        sum.errors.len(),
        sum.ran,
        runner::os::OS,
        sum.files,
        sum.other
    );
    assert_eq!(
        sum.ran + sum.other,
        sum.files,
        "every scenario file is run or not meant for this OS/language"
    );
    assert!(sum.errors.is_empty(), "{} contract failures", sum.errors.len());
}

/// Binary `name` of workspace package `package`, from this test's own target dir (`target/<profile>/deps/..`).
/// A missing binary fails the suite; it is never skipped.
fn binary(package: &str, name: &str) -> PathBuf {
    let exe = std::env::current_exe().expect("current_exe");
    let dir = exe.parent().and_then(Path::parent).expect("target/<profile>");
    let path = dir.join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    assert!(
        path.is_file(),
        "{} is missing: build it first: cargo build -p {package}",
        path.display()
    );
    path
}

/// Points the library at this target dir's supervisor (`target/<profile>/hugr-omni-supervisor`) unless
/// `HUGR_OMNI_SUPERVISOR` is set: a test binary lives in `target/<profile>/deps`, where the library does not look.
fn use_supervisor() {
    if std::env::var_os("HUGR_OMNI_SUPERVISOR").is_some() {
        return;
    }
    let path = binary("omni-supervisor", "hugr-omni-supervisor");
    // SAFETY: called first in `contract`, the only test of this binary, before the runtime or any other thread of
    // the runner exists; libtest's main thread only waits for that test. No other thread reads or writes the
    // environment, which is what `set_var` requires (AGENTS.md allows this one call).
    unsafe { std::env::set_var("HUGR_OMNI_SUPERVISOR", path) };
}
