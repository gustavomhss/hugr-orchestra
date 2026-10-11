//! AppContainer launch mode: `hugr-omni-supervisor --appcontainer <profile> [grants] --app <exe> --line <cmdline>`.
//!
//! The host runs this as an ordinary managed child (so output, exit and stop work as for any root). It creates or
//! reuses the named AppContainer profile, applies the grants, starts the exact-endpoint broker, then runs `--app`
//! with the command line `--line`, verbatim, as an AppContainer process with no network capability inside its
//! own `KILL_ON_JOB_CLOSE` Job, nested in the host's. It inherits only its standard handles, waits for that root and
//! exits with its exit code; the Job's last handle closes with this process, so no confined descendant outlives it.
//!
//! Grants: `--read <path>` and `--write <path>` (inherited by a directory's subtree), `--route <port>=<socket>` (the
//! broker; the socket's folder gets a write grant). `--revoke` instead removes the profile's ACEs from every named path and deletes the profile.
//!
//! Every container also holds the `orchestraToolchainRead` capability. `--appcontainer <profile> --toolchain <path>…`,
//! with no command, grants each folder read to that capability (not to a profile) and exits: once per folder for every
//! profile, best effort, since a folder that cannot take the ACE only stays unreadable. A first grant walks the
//! folder's whole tree (~200k files took minutes on windows-latest), so the host runs it beside commands, never
//! inside one's deadline; a walk cut short leaves its folder's ACE in place and the rest of its tree unreadable.
//! A launcher failure exits 125 with one `hugr-omni-supervisor: appcontainer: …` line on stderr.

mod acl;
mod broker;
mod guard;

#[cfg(test)]
mod tests;

use std::ffi::OsStr;
use std::io::{self, Write};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::path::{Path, PathBuf};

use windows_sys::Win32::Foundation::{HANDLE, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE, SetHandleInformation};
use windows_sys::Win32::Security::{SECURITY_CAPABILITIES, SID_AND_ATTRIBUTES};
use windows_sys::Win32::System::Console::{GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE};
use windows_sys::Win32::System::Threading::{
    CreateProcessW, EXTENDED_STARTUPINFO_PRESENT, GetExitCodeProcess, INFINITE, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
    PROC_THREAD_ATTRIBUTE_JOB_LIST, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, PROCESS_INFORMATION,
    STARTF_USESTDHANDLES, STARTUPINFOEXW, WaitForSingleObject,
};

use acl::Grant;
use broker::Route;

/// Exit code of a launcher that could not start its confined root.
const FAILED: i32 = 125;

/// The custom capability toolchain folders are granted to.
const TOOLCHAIN: &str = "orchestraToolchainRead";

/// `SE_GROUP_ENABLED` (winnt.h): a capability in the token takes part in access checks only when enabled.
const ENABLED: u32 = 0x4;

/// The parsed launch request.
#[derive(Debug, Default)]
struct Request {
    name: String,
    grants: Vec<(PathBuf, Grant)>,
    toolchain: Vec<PathBuf>,
    routes: Vec<Route>,
    /// Project-config paths made read-only to the container for the command's lifetime; a missing one gets a locked
    /// placeholder directory. Protection is journalled under `journal`, so `--recover` can undo a crashed run.
    guards: Vec<PathBuf>,
    journal: Option<PathBuf>,
    app: Option<String>,
    line: Option<String>,
    revoke: bool,
    recover: bool,
}

/// Runs the launch mode; `args` follow `--appcontainer`. Never returns.
pub(crate) fn main(args: impl Iterator<Item = String>) -> ! {
    let code = match parse(args).and_then(|request| run(&request)) {
        Ok(code) => code,
        Err(e) => {
            let _ = writeln!(io::stderr().lock(), "hugr-omni-supervisor: appcontainer: {e}");
            FAILED
        }
    };
    // Exiting closes the Job's only handle: KILL_ON_JOB_CLOSE ends every confined process left.
    std::process::exit(code)
}

fn parse(mut it: impl Iterator<Item = String>) -> Result<Request, String> {
    let name = it.next().ok_or("missing profile name")?;
    // Profile names: at most 64 characters; keep to a portable set.
    if name.is_empty() || name.len() > 64 || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)) {
        return Err(format!("bad profile name {name}"));
    }
    let mut request = Request {
        name,
        ..Request::default()
    };
    while let Some(flag) = it.next() {
        if flag == "--revoke" {
            request.revoke = true;
            continue;
        }
        if flag == "--recover" {
            request.recover = true;
            continue;
        }
        let value = it.next().ok_or_else(|| format!("{flag} needs a value"))?;
        let grant = |kind| (PathBuf::from(&value), kind);
        match flag.as_str() {
            "--read" => request.grants.push(grant(Grant::Read)),
            "--write" => request.grants.push(grant(Grant::Write)),
            "--toolchain" => request.toolchain.push(PathBuf::from(&value)),
            "--guard" => request.guards.push(PathBuf::from(&value)),
            "--journal" => request.journal = Some(PathBuf::from(&value)),
            "--route" => {
                let (port, socket) = value.split_once('=').ok_or_else(|| format!("bad --route {value}"))?;
                let port = port
                    .parse::<u16>()
                    .ok()
                    .filter(|&p| p > 0)
                    .ok_or_else(|| format!("bad --route {value}"))?;
                request.routes.push(Route {
                    port,
                    socket: PathBuf::from(socket),
                });
            }
            "--app" => request.app = Some(value),
            "--line" => request.line = Some(value),
            _ => return Err(format!("unknown argument {flag}")),
        }
    }
    if request
        .grants
        .iter()
        .map(|g| &g.0)
        .chain(&request.toolchain)
        .chain(request.routes.iter().map(|r| &r.socket))
        .chain(request.guards.iter())
        .chain(request.journal.iter())
        .any(|p| !p.is_absolute())
    {
        return Err("every path must be absolute".into());
    }
    if !request.toolchain.is_empty() {
        let alone = request.grants.is_empty()
            && request.routes.is_empty()
            && request.guards.is_empty()
            && request.journal.is_none()
            && request.app.is_none()
            && request.line.is_none();
        if request.revoke || request.recover || !alone {
            return Err("--toolchain takes no command and no other grant".into());
        }
        return Ok(request);
    }
    if (!request.guards.is_empty() || request.recover) && request.journal.is_none() {
        return Err("--guard and --recover need --journal".into());
    }
    if !request.revoke && !request.recover && (request.app.is_none() || request.line.is_none()) {
        return Err("missing --app or --line".into());
    }
    Ok(request)
}

fn run(request: &Request) -> Result<i32, String> {
    let toolchain = acl::capability(TOOLCHAIN).map_err(|e| format!("capability {TOOLCHAIN}: {e}"))?;
    if !request.toolchain.is_empty() {
        for path in &request.toolchain {
            let _ = acl::apply(path, &toolchain, Grant::Read);
        }
        return Ok(0);
    }
    // Recovery needs no profile: it only restores ACLs captured by an earlier run and removes stale placeholders.
    if request.recover {
        let journal = request.journal.as_deref().unwrap_or_else(|| Path::new(""));
        guard::recover(journal).map_err(|e| format!("recover {}: {e}", journal.display()))?;
        return Ok(0);
    }
    let sid = acl::profile(&request.name).map_err(|e| format!("profile {}: {e}", request.name))?;
    let folders = request
        .routes
        .iter()
        .filter_map(|r| r.socket.parent().map(|p| (p.to_path_buf(), Grant::Write)));
    let grants: Vec<_> = request.grants.iter().cloned().chain(folders).collect();
    if request.revoke {
        for (path, _) in &grants {
            acl::revoke(path, &sid).map_err(|e| format!("revoke {}: {e}", path.display()))?;
        }
        acl::delete(&request.name).map_err(|e| format!("delete profile {}: {e}", request.name))?;
        return Ok(0);
    }
    for (path, grant) in &grants {
        acl::apply(path, &sid, *grant).map_err(|e| format!("grant {grant:?} {}: {e}", path.display()))?;
    }
    broker::start(&request.routes).map_err(|e| format!("broker: {e}"))?;
    // Protection brackets only the launch, and its holds are released whether the command succeeds or fails. A crash
    // between here and release leaves a journal that the next launch (reconciled in `protect`) or `--recover` replays.
    let journal = request.journal.clone();
    let write_roots: Vec<PathBuf> = grants
        .iter()
        .filter(|(_, grant)| matches!(grant, Grant::Write))
        .map(|(path, _)| path.clone())
        .collect();
    let held = match &journal {
        Some(dir) => Some(guard::protect(dir, &request.guards, &write_roots, &sid).map_err(|e| format!("guard: {e}"))?),
        None => None,
    };
    let (app, line) = (
        request.app.as_deref().unwrap_or_default(),
        request.line.as_deref().unwrap_or_default(),
    );
    let code = launch(app, line, &sid, &toolchain).map_err(|e| format!("start {app}: {e}"));
    if let (Some(held), Some(dir)) = (held, &journal) {
        let _ = guard::release(held, dir);
    }
    for route in &request.routes {
        let _ = std::fs::remove_file(&route.socket);
    }
    code
}

/// Starts `app` confined to the profile, in a new kill-on-close Job, and waits for it.
fn launch(app: &str, line: &str, sid: &acl::Sid, toolchain: &acl::Sid) -> io::Result<i32> {
    let job = super::job::create()?;
    let jobs: [HANDLE; 1] = [job.as_raw_handle()];
    let mut held = [SID_AND_ATTRIBUTES {
        Sid: toolchain.raw(),
        Attributes: ENABLED,
    }];
    let mut capabilities = SECURITY_CAPABILITIES {
        AppContainerSid: sid.raw(),
        Capabilities: held.as_mut_ptr(),
        CapabilityCount: 1,
        ..SECURITY_CAPABILITIES::default()
    };
    let mut inherit: Vec<HANDLE> = Vec::new();
    let mut si = STARTUPINFOEXW::default();
    si.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    let std = [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE].map(|which| {
        // SAFETY: GetStdHandle only reads this process's standard handle.
        let handle = unsafe { GetStdHandle(which) };
        let usable = !handle.is_null() && handle != INVALID_HANDLE_VALUE;
        // SAFETY: our own standard handle, made inheritable; HANDLE_LIST keeps every other handle out.
        let inheritable =
            usable && unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) } != 0;
        if inheritable && !inherit.contains(&handle) {
            inherit.push(handle);
        }
        handle
    });
    (
        si.StartupInfo.hStdInput,
        si.StartupInfo.hStdOutput,
        si.StartupInfo.hStdError,
    ) = (std[0], std[1], std[2]);
    let mut attrs = super::create::Attributes::new(if inherit.is_empty() { 2 } else { 3 })?;
    // SAFETY: `jobs`, `capabilities` (and the SIDs it names, `held`) and `inherit` outlive `attrs` and do not move.
    unsafe {
        attrs.set(
            PROC_THREAD_ATTRIBUTE_JOB_LIST as usize,
            jobs.as_ptr().cast(),
            size_of_val(&jobs),
        )?;
        attrs.set(
            PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,
            (&raw mut capabilities).cast_const().cast(),
            size_of::<SECURITY_CAPABILITIES>(),
        )?;
        if !inherit.is_empty() {
            attrs.set(
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
                inherit.as_ptr().cast(),
                size_of_val(inherit.as_slice()),
            )?;
        }
    }
    si.lpAttributeList = attrs.list();
    let app = wide(app);
    let mut line = wide(line);
    let mut pi = PROCESS_INFORMATION::default();
    // SAFETY: NUL-terminated strings, a writable command line, an initialized STARTUPINFOEXW whose attribute list
    // is alive; null environment and directory inherit this process's.
    let ok = unsafe {
        CreateProcessW(
            app.as_ptr(),
            line.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            i32::from(!inherit.is_empty()),
            EXTENDED_STARTUPINFO_PRESENT,
            std::ptr::null(),
            std::ptr::null(),
            &si.StartupInfo,
            &mut pi,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: both handles are fresh from CreateProcessW and owned by nobody else.
    let (process, _thread) = unsafe {
        (
            OwnedHandle::from_raw_handle(pi.hProcess),
            OwnedHandle::from_raw_handle(pi.hThread),
        )
    };
    let mut code = 0u32;
    // SAFETY: a live process handle.
    let waited = unsafe { WaitForSingleObject(process.as_raw_handle(), INFINITE) };
    // SAFETY: a live process handle and an out value.
    if waited != 0 || unsafe { GetExitCodeProcess(process.as_raw_handle(), &mut code) } == 0 {
        return Err(io::Error::last_os_error());
    }
    // Kill any confined descendant the root left behind and wait until the Job is empty before the caller restores
    // ACLs — a process still alive could otherwise write a guarded path during the restore window.
    super::job::terminate(&job);
    for _ in 0..200 {
        if matches!(super::job::active(&job), None | Some(0)) {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    drop(job);
    Ok(code as i32)
}

/// A NUL-terminated UTF-16 copy.
fn wide(text: &str) -> Vec<u16> {
    OsStr::new(text).encode_wide().chain([0]).collect()
}

/// For `acl`: a path as a NUL-terminated UTF-16 string.
fn wide_path(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain([0]).collect()
}
