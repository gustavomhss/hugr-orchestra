//! Host-side guard for project config under the AppContainer. For the command's lifetime an existing guarded file or
//! directory (`orchestra.json(c)`, `tui.json(c)`, `.orchestra`) is made read-only to the container and restored
//! afterwards; a guarded name that does not exist yet gets a locked empty placeholder directory, so the container
//! cannot create that name. A small journal under the `--journal` directory makes both crash-safe: an aborted run
//! leaves a `g-<hash>.state` file that the next launch (or `--recover`) replays, restoring the ACL or deleting the
//! placeholder. Concurrent confined commands in the same directory share one protection through per-holder `.own`
//! marker files, each locked for its holder's lifetime; protection is undone only once no marker is still locked, and
//! a dead holder's lock is released by the OS, so a crash never pins a path read-only.

use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self};
use std::io::{Read, Write};
use std::os::windows::io::{AsRawHandle, OwnedHandle};
use std::path::{Path, PathBuf};

use windows_sys::Win32::Foundation::{ERROR_LOCK_VIOLATION, HANDLE};
use windows_sys::Win32::Storage::FileSystem::{
    LOCKFILE_EXCLUSIVE_LOCK, LOCKFILE_FAIL_IMMEDIATELY, LockFileEx, UnlockFileEx,
};
use windows_sys::Win32::System::IO::OVERLAPPED;
use windows_sys::Win32::System::Threading::GetCurrentProcessId;

use super::acl::{self, Identity, Sid};

/// What keeps this command's protection alive: the locked marker files (dropping them releases the OS locks) and the
/// directory pins (held-open handles that block any parent from being renamed or deleted).
pub(super) struct Held {
    markers: Vec<(File, PathBuf)>,
    pins: Vec<OwnedHandle>,
}

/// Protects every guarded path under its containing write root, returning the holds to release when the command
/// exits. Stale state from a crashed run is reconciled first, under the same directory lock, so a new hold never races
/// recovery. `acl::protect` runs for this command's SID on every path — first or joining — so a second profile whose
/// write grant was copied in by an earlier command's detach is stripped to read-only too.
pub(super) fn protect(journal: &Path, paths: &[PathBuf], roots: &[PathBuf], sid: &Sid) -> io::Result<Held> {
    fs::create_dir_all(journal)?;
    let _lock = DirLock::acquire(journal)?;
    reconcile(journal)?;
    // SAFETY: GetCurrentProcessId reads only this process's id and cannot fail.
    let pid = unsafe { GetCurrentProcessId() };
    let mut markers = Vec::new();
    let mut pins = Vec::new();
    let mut pinned: HashSet<PathBuf> = HashSet::new();
    let mut seen: HashSet<Identity> = HashSet::new();
    for (index, path) in paths.iter().enumerate() {
        // Dedupe guards that resolve to the same object, so restoration is order-independent and never leaves a file
        // read-only. A missing name has no identity yet and cannot collide with another name.
        if path.exists() {
            match acl::identity(path) {
                Ok(id) if !seen.insert(id) => continue,
                _ => {}
            }
        }
        let hash = hash(path);
        let state = journal.join(format!("g-{hash}.state"));
        if !state.exists() {
            let content = if path.exists() {
                let sddl = acl::capture(path)?;
                acl::protect(path, sid)?;
                format!("E\n{}\n{}", path.display(), sddl)
            } else {
                fs::create_dir(path)?;
                acl::protect(path, sid)?;
                format!("P\n{}\n", path.display())
            };
            write_atomic(&state, &content)?;
        } else {
            // A joining command still strips its own profile to read-only on an already-protected path.
            acl::protect(path, sid)?;
        }
        // Pin every directory from the path up to its write root so the container cannot move a parent aside.
        for ancestor in ancestors_to_root(path, roots) {
            if !pinned.insert(ancestor.clone()) {
                continue;
            }
            if let Ok(handle) = acl::pin(&ancestor) {
                pins.push(handle);
            }
        }
        let marker = journal.join(format!("o-{hash}-{pid}-{index}.own"));
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .read(true)
            .write(true)
            .open(&marker)?;
        lock(&file, false)?;
        markers.push((file, marker));
    }
    Ok(Held { markers, pins })
}

/// Every directory from `path`'s parent up to and including the write root that contains it (the longest matching
/// root), bottom-up. Empty when no root contains the path.
fn ancestors_to_root(path: &Path, roots: &[PathBuf]) -> Vec<PathBuf> {
    let Some(root) = roots
        .iter()
        .filter(|root| path.starts_with(root))
        .max_by_key(|root| root.components().count())
    else {
        return Vec::new();
    };
    let mut result = Vec::new();
    let mut current = path.parent();
    while let Some(dir) = current {
        result.push(dir.to_path_buf());
        if dir == root {
            break;
        }
        current = dir.parent();
    }
    result
}

/// Releases this command's holds, then restores every path no other live holder still protects.
pub(super) fn release(held: Held, journal: &Path) -> io::Result<()> {
    let _lock = DirLock::acquire(journal)?;
    for (file, marker) in held.markers {
        let _ = unlock(&file);
        drop(file);
        let _ = fs::remove_file(&marker);
    }
    // Release the parent pins before restoring, so a placeholder's directory can be removed.
    drop(held.pins);
    reconcile(journal)
}

/// Replays any leftover state: restores or drops every guarded path with no live holder. Idempotent.
pub(super) fn recover(journal: &Path) -> io::Result<()> {
    if !journal.exists() {
        return Ok(());
    }
    let _lock = DirLock::acquire(journal)?;
    reconcile(journal)
}

/// Restores every state file whose holders are all gone. The caller holds the directory lock.
fn reconcile(journal: &Path) -> io::Result<()> {
    let states: Vec<(String, PathBuf)> = read_names(journal)
        .into_iter()
        .filter_map(|(name, path)| {
            name.strip_prefix("g-")
                .and_then(|rest| rest.strip_suffix(".state"))
                .map(|hash| (hash.to_owned(), path))
        })
        .collect();
    for (hash, state) in states {
        let prefix = format!("o-{hash}-");
        let owners: Vec<PathBuf> = read_names(journal)
            .into_iter()
            .filter(|(name, _)| name.starts_with(&prefix) && name.ends_with(".own"))
            .map(|(_, path)| path)
            .collect();
        let mut dead = Vec::new();
        let mut live = false;
        for owner in owners {
            if held_by_other(&owner) {
                live = true;
            } else {
                dead.push(owner);
            }
        }
        if live {
            continue;
        }
        if let Ok(mut file) = File::open(&state) {
            let mut text = String::new();
            if file.read_to_string(&mut text).is_ok() {
                let mut parts = text.splitn(3, '\n');
                let kind = parts.next().unwrap_or("");
                let path = parts.next().unwrap_or("");
                let sddl = parts.next().unwrap_or("");
                if !path.is_empty() {
                    let target = PathBuf::from(path);
                    match kind {
                        "E" => {
                            let _ = acl::restore(&target, sddl);
                        }
                        // Only ever remove the empty placeholder this guard created. If something is inside it, it is
                        // host content: leave it and report, never delete it.
                        "P" => {
                            if let Err(error) = fs::remove_dir(&target) {
                                let _ = writeln!(
                                    io::stderr().lock(),
                                    "hugr-omni-supervisor: appcontainer: leaving placeholder {}: {error}",
                                    target.display(),
                                );
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        let _ = fs::remove_file(&state);
        for owner in dead {
            let _ = fs::remove_file(owner);
        }
    }
    Ok(())
}

/// Whether a live process still holds the marker's lock. A dead holder's lock is already released by the OS, so this
/// acquires it and reports the marker free.
fn held_by_other(marker: &Path) -> bool {
    let Ok(file) = OpenOptions::new().read(true).write(true).open(marker) else {
        return false;
    };
    match lock(&file, true) {
        Ok(()) => {
            let _ = unlock(&file);
            false
        }
        Err(error) => error.raw_os_error() == Some(ERROR_LOCK_VIOLATION as i32),
    }
}

fn read_names(dir: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| (entry.file_name().to_string_lossy().into_owned(), entry.path()))
        .collect()
}

fn write_atomic(path: &Path, content: &str) -> io::Result<()> {
    let temp = path.with_extension("tmp");
    File::create(&temp)?.write_all(content.as_bytes())?;
    fs::rename(&temp, path)
}

/// A 128-bit FNV-1a of the lowercased path (the filesystem is case-insensitive), as hex: a short, collision-safe,
/// filename-legal key for one path's state and marker files.
fn hash(path: &Path) -> String {
    let text = path.to_string_lossy().to_lowercase();
    let bytes = text.as_bytes();
    let mut forward: u64 = 0xcbf2_9ce4_8422_2325;
    for &byte in bytes {
        forward = (forward ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3);
    }
    let mut backward: u64 = 0x8422_2325_cbf2_9ce4;
    for &byte in bytes.iter().rev() {
        backward = (backward ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{forward:016x}{backward:016x}")
}

/// The directory lock: a short, blocking, exclusive lock around every read-modify-write of the journal.
struct DirLock(File);

impl DirLock {
    fn acquire(journal: &Path) -> io::Result<DirLock> {
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .read(true)
            .write(true)
            .open(journal.join(".dirlock"))?;
        lock(&file, false)?;
        Ok(DirLock(file))
    }
}

impl Drop for DirLock {
    fn drop(&mut self) {
        let _ = unlock(&self.0);
    }
}

fn lock(file: &File, immediate: bool) -> io::Result<()> {
    // SAFETY: OVERLAPPED is plain data; a zeroed value means offset 0 and no event, as LockFileEx expects.
    let mut overlapped: OVERLAPPED = unsafe { std::mem::zeroed() };
    let flags = LOCKFILE_EXCLUSIVE_LOCK | if immediate { LOCKFILE_FAIL_IMMEDIATELY } else { 0 };
    // SAFETY: a handle we own and a zeroed OVERLAPPED; the one-byte region is released by `unlock` or on close.
    let ok = unsafe { LockFileEx(file.as_raw_handle() as HANDLE, flags, 0, 1, 0, &mut overlapped) };
    if ok == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn unlock(file: &File) -> io::Result<()> {
    // SAFETY: OVERLAPPED is plain data; a zeroed value means offset 0, as UnlockFileEx expects.
    let mut overlapped: OVERLAPPED = unsafe { std::mem::zeroed() };
    // SAFETY: a handle we own and a zeroed OVERLAPPED; unlocks the one-byte region `lock` took.
    let ok = unsafe { UnlockFileEx(file.as_raw_handle() as HANDLE, 0, 1, 0, &mut overlapped) };
    if ok == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}
