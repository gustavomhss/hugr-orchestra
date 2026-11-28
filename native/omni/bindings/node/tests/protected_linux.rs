//! Protected quarantine exercises real Linux filesystem operations as the privileged sidecar.
#![cfg(target_os = "linux")]
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
use hugr_omni::binding::quarantine_protected_linux as protected_linux;
use std::os::unix::fs::{PermissionsExt, symlink};

#[test]
#[ignore = "requires a root-owned fixture on a supported Linux filesystem"]
fn protected_quarantine() {
    let root = format!("/var/lib/omni-quarantine-test-{}", std::process::id());
    let base = std::path::Path::new(&root);
    std::fs::create_dir(base).unwrap();
    std::fs::set_permissions(base, std::fs::Permissions::from_mode(0o700)).unwrap();
    for dir in ["worktrees", "worktrees/one", "worktrees/one/.turbo", "quarantine"] {
        let path = base.join(dir);
        std::fs::create_dir(&path).unwrap();
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    let source = format!("{root}/worktrees/one/.turbo");
    let destination = format!("{root}/quarantine/q-{}", "a".repeat(64));
    let invalid = format!("{root}/quarantine/q-one");
    assert!(protected_linux::available(&root).unwrap());
    assert_eq!(protected_linux::inspect(&root, &destination).unwrap(), None);
    let id = protected_linux::inspect(&root, &source).unwrap().unwrap();
    assert_eq!(protected_linux::rename(&root, &source, &invalid, &id), "refused");
    assert!(protected_linux::inspect(&root, &invalid).is_err());
    let uppercase = format!("{root}/quarantine/q-{}", "A".repeat(64));
    assert_eq!(protected_linux::rename(&root, &source, &uppercase, &id), "refused");
    assert_eq!(protected_linux::rename(&root, &source, &destination, "0:0"), "refused");
    std::fs::create_dir(&destination).unwrap();
    assert_eq!(protected_linux::rename(&root, &source, &destination, &id), "refused");
    std::fs::remove_dir(&destination).unwrap();
    std::fs::set_permissions(&source, std::fs::Permissions::from_mode(0o777)).unwrap();
    assert!(protected_linux::inspect(&root, &source).is_err());
    assert_eq!(protected_linux::rename(&root, &source, &destination, &id), "refused");
    std::fs::set_permissions(&source, std::fs::Permissions::from_mode(0o700)).unwrap();
    assert_eq!(protected_linux::rename(&root, &source, &destination, &id), "accepted");
    assert_eq!(protected_linux::inspect(&root, &source).unwrap(), None);
    assert_eq!(protected_linux::inspect(&root, &destination).unwrap(), Some(id));
    symlink(&destination, &source).unwrap();
    assert!(protected_linux::inspect(&root, &source).is_err());
    assert_eq!(
        protected_linux::rename(
            &root,
            &source,
            &format!("{root}/quarantine/q-{}", "b".repeat(64)),
            "0:0"
        ),
        "refused"
    );
    std::fs::remove_dir_all(base).unwrap();
}
