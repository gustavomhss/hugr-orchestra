//! The program under test: a real root with a real fixture descendant that inherits no output descriptor.

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Never runs in the ordinary suite process; only the supervisor starts this exact test as its child.
#[test]
fn root() {
    let Some(directory) = std::env::var_os("OMNI_N2_ACTOR_DIR").map(PathBuf::from) else {
        return;
    };
    let mode = std::env::var("OMNI_N2_ACTOR_MODE").expect("actor mode");
    let mut cmd = Command::new(std::env::var_os("OMNI_N2_FIXTURE").expect("real fixture"));
    cmd.arg(format!("pidlog={}", directory.join("descendant.pids").display()));
    match mode.as_str() {
        "rss" => {
            cmd.args([
                format!("watch=stdout:1:{}", directory.join("grow").display()),
                format!("pidlog={}", directory.join("allocating.pids").display()),
                "alloc=256".to_owned(),
                format!("pidlog={}", directory.join("allocated.pids").display()),
                "hang".to_owned(),
            ]);
        }
        "normal" => {
            cmd.args([
                format!("watch=stdout:1:{}", directory.join("finish").display()),
                "exit=0".to_owned(),
            ]);
        }
        "hang" => {
            cmd.arg("hang");
        }
        _ => panic!("unknown actor mode {mode}"),
    }
    // A child of this actual supervised root, not a stand-in PID or a shell descendant.
    let _child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("fixture descendant");
    std::fs::write(directory.join("root-ready"), format!("{}\n", std::process::id())).expect("root marker");
    let until = Instant::now() + Duration::from_secs(20);
    while !std::fs::read_to_string(directory.join("root-exit")).is_ok_and(|s| s.ends_with('\n')) {
        assert!(Instant::now() < until, "root exit gate was never released");
        std::thread::sleep(Duration::from_millis(5));
    }
    // std::process::Child Drop closes its handle, leaving the descendant for the real supervisor to track.
}
