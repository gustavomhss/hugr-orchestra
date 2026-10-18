//! The pinned workloads, fetched once per OS into the cache (the network is used here only), then run offline:
//! semver (QA-A Rust suite), commander (QA-A npm suite) and a Vite project (QA-B), with their dependencies on the
//! cache's own Cargo and npm stores. A stamp file records what each step installed; a matching stamp skips it.

use std::path::{Path, PathBuf};
use std::process::Command;

/// A repository at a commit.
struct Pin {
    name: &'static str,
    url: &'static str,
    commit: &'static str,
}

/// semver 1.0.26 (tag `1.0.26`).
const SEMVER: Pin = Pin {
    name: "semver",
    url: "https://github.com/dtolnay/semver",
    commit: "3e64fdbfce78bfbd2eb97bdbdc50ce4d62c9831b",
};

/// commander 14.0.1 (tag `v14.0.1`), with its own `package-lock.json`.
const COMMANDER: Pin = Pin {
    name: "commander",
    url: "https://github.com/tj/commander.js",
    commit: "bd4ae263f6966183f3c9e8b105fb5ae3c568c047",
};

/// The cache: `HUGR_QA_CACHE`, else `qa/.cache/<os>-<arch>` (per OS: the npm packages hold native binaries).
pub fn cache_dir(root: &Path) -> PathBuf {
    match std::env::var_os("HUGR_QA_CACHE") {
        Some(dir) => PathBuf::from(dir),
        None => root
            .join("qa/.cache")
            .join(format!("{}-{}", crate::os_name(), std::env::consts::ARCH)),
    }
}

pub fn ensure(root: &Path, cache: &Path) -> Result<(), String> {
    std::fs::create_dir_all(cache).map_err(|e| format!("{}: {e}", cache.display()))?;
    for pin in [&SEMVER, &COMMANDER] {
        checkout(cache, pin)?;
    }
    // semver joins a workspace of its own at the cache root, locked by qa/pins (its repository has no lock file).
    let lock = std::fs::read_to_string(root.join("qa/pins/semver-workspace.lock")).map_err(|e| e.to_string())?;
    write(
        &cache.join("Cargo.toml"),
        "[workspace]\nmembers = [\"semver\"]\nresolver = \"2\"\n",
    )?;
    write(&cache.join("Cargo.lock"), &lock)?;
    stamped(
        &cache.join("target/.qa-pin"),
        &format!("{}{lock}", SEMVER.commit),
        || {
            for args in [
                &["fetch", "--locked"][..],
                &["test", "--no-run", "--offline", "--locked"],
                &["build", "--offline", "--locked"],
            ] {
                let out = Command::new("cargo")
                    .args(args)
                    .current_dir(cache)
                    .env("CARGO_HOME", cache.join("cargo-home"))
                    .env("CARGO_TARGET_DIR", cache.join("target"))
                    .output()
                    .map_err(|e| format!("cargo: {e}"))?;
                if !out.status.success() {
                    return Err(format!(
                        "cargo {args:?}: {}",
                        String::from_utf8_lossy(&out.stderr).trim()
                    ));
                }
            }
            Ok(())
        },
    )?;
    let commander = cache.join(COMMANDER.name);
    stamped(&commander.join("node_modules/.qa-pin"), COMMANDER.commit, || {
        npm(
            cache,
            &commander,
            &["ci", "--no-audit", "--no-fund", "--ignore-scripts"],
        )
    })?;
    let vite = cache.join("vite");
    std::fs::create_dir_all(&vite).map_err(|e| e.to_string())?;
    let mut pin = String::new();
    for file in ["package.json", "package-lock.json"] {
        let text = std::fs::read_to_string(root.join("qa/vite").join(file)).map_err(|e| e.to_string())?;
        write(&vite.join(file), &text)?;
        pin.push_str(&text);
    }
    // QA-E installs this package offline: its registry entry must be in the cache too, not only its tarball.
    pin.push_str(INSTALLED);
    stamped(&vite.join("node_modules/.qa-pin"), &pin, || {
        npm(cache, &vite, &["ci", "--no-audit", "--no-fund", "--ignore-scripts"])?;
        npm(cache, &vite, &["cache", "add", INSTALLED])
    })
}

/// The package QA-E's `npm install` installs (`qa/workloads/agent.json`).
const INSTALLED: &str = "picocolors@1.1.1";

/// `pin.url` at `pin.commit` in `cache/pin.name` (a shallow fetch of that one commit).
fn checkout(cache: &Path, pin: &Pin) -> Result<(), String> {
    let dir = cache.join(pin.name);
    let git = |args: &[&str]| tool(&dir, "git", args);
    if git(&["rev-parse", "HEAD"]).is_ok_and(|head| head.trim() == pin.commit) {
        return Ok(());
    }
    eprintln!("omni-qa: fetching {} at {}", pin.url, pin.commit);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    git(&["init", "-q"])?;
    git(&["fetch", "-q", "--depth", "1", pin.url, pin.commit])?;
    git(&["checkout", "-q", "--detach", "FETCH_HEAD"])?;
    match git(&["rev-parse", "HEAD"]) {
        Ok(head) if head.trim() == pin.commit => Ok(()),
        other => Err(format!("{} is at {other:?}, not {}", dir.display(), pin.commit)),
    }
}

/// `npm <args>` in `dir`, on the cache's npm store.
fn npm(cache: &Path, dir: &Path, args: &[&str]) -> Result<(), String> {
    let npm = if cfg!(windows) { "npm.cmd" } else { "npm" };
    let store = cache.join("npm-cache").to_string_lossy().into_owned();
    tool(dir, npm, &[args, &["--cache", &store]].concat()).map(drop)
}

/// Runs `step` unless `stamp` already holds `pin`; records `pin` once it succeeded.
fn stamped(stamp: &Path, pin: &str, step: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
    if std::fs::read_to_string(stamp).is_ok_and(|s| s == pin) {
        return Ok(());
    }
    eprintln!("omni-qa: preparing {}", stamp.parent().map_or(stamp, |p| p).display());
    step()?;
    if let Some(dir) = stamp.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    write(stamp, pin)
}

fn write(path: &Path, text: &str) -> Result<(), String> {
    if std::fs::read_to_string(path).is_ok_and(|s| s == text) {
        return Ok(());
    }
    std::fs::write(path, text).map_err(|e| format!("{}: {e}", path.display()))
}

/// Runs `program` in `dir`, returning its stdout; a failing exit is an error carrying its stderr.
fn tool(dir: &Path, program: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(program)
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("{program}: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("{program} {args:?} in {}: {}", dir.display(), err.trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}
