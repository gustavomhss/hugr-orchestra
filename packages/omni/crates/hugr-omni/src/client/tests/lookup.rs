//! WP-H: where the supervisor comes from. A configured path wins and cannot change once a supervisor started
//! (H4); a module directory others can write to is no candidate (H2); a symlinked executable also finds the
//! supervisor next to its real file (H3).

use std::path::PathBuf;
use std::sync::Mutex;

use crate::client::start::configure_in;
use crate::error::ErrorCode;

#[cfg(unix)]
fn dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("omni-wph-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn a_configured_supervisor_is_set_before_the_start_and_never_changed_after_it() {
    let slot = Mutex::new(None);
    let (a, b) = (PathBuf::from("/opt/a/sup"), PathBuf::from("/opt/b/sup"));
    configure_in(&slot, a.clone(), false).unwrap();
    configure_in(&slot, b.clone(), false).unwrap(); // not started yet: the last one wins
    assert_eq!(slot.lock().unwrap().clone(), Some(b.clone()));
    configure_in(&slot, b.clone(), true).unwrap(); // the same path again after the start is fine
    let late = configure_in(&slot, a, true).unwrap_err();
    assert_eq!(late.code(), ErrorCode::InvalidArgument, "{late}");
    assert!(late.to_string().contains("before the first run() or spawn()"), "{late}");
    assert_eq!(slot.lock().unwrap().clone(), Some(b));
    let empty = configure_in(&slot, PathBuf::new(), false).unwrap_err();
    assert_eq!(empty.code(), ErrorCode::InvalidArgument, "{empty}");
}

#[cfg(unix)]
#[test]
fn a_module_directory_others_can_write_to_supplies_no_supervisor() {
    use crate::client::start::{EXE, trusted};
    use std::os::unix::fs::PermissionsExt;
    let set = |p: &PathBuf, mode: u32| std::fs::set_permissions(p, std::fs::Permissions::from_mode(mode)).unwrap();
    let d = dir("trust");
    set(&d, 0o755);
    assert!(trusted(&d), "an own directory, 0755, with no supervisor in it");
    std::fs::write(d.join(EXE), b"").unwrap();
    set(&d.join(EXE), 0o755);
    assert!(trusted(&d), "an own directory and binary, both 0755");
    set(&d.join(EXE), 0o777);
    assert!(!trusted(&d), "a binary anybody can overwrite");
    set(&d.join(EXE), 0o755);
    for mode in [0o777, 0o775, 0o1777] {
        set(&d, mode);
        assert!(!trusted(&d), "a directory with mode {mode:o}");
    }
    assert!(!trusted(&d.join("missing")), "a directory that does not exist");
    set(&d, 0o755);
    std::fs::remove_dir_all(&d).unwrap();
}

#[cfg(unix)]
#[test]
fn a_symlinked_executable_also_looks_next_to_its_real_file() {
    use crate::client::start::exe_dirs;
    let (real, link) = (dir("real"), dir("link"));
    std::fs::write(real.join("app"), b"").unwrap();
    std::os::unix::fs::symlink(real.join("app"), link.join("app")).unwrap();
    let [raw, canonical] = exe_dirs(Some(link.join("app")));
    assert_eq!(raw, Some(link.clone()));
    assert_eq!(canonical, Some(std::fs::canonicalize(&real).unwrap()));
    // A plain file: one candidate, not the same directory twice.
    let plain = std::fs::canonicalize(&real).unwrap().join("app");
    assert_eq!(
        exe_dirs(Some(plain)),
        [Some(std::fs::canonicalize(&real).unwrap()), None]
    );
    assert_eq!(exe_dirs(None), [None, None]);
    for d in [real, link] {
        std::fs::remove_dir_all(d).unwrap();
    }
}
