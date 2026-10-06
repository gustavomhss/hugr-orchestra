//! Starting a pipe root (ADR-0005 §2): `posix_spawn` with `POSIX_SPAWN_SETSID`, every signal at its default,
//! an empty mask and explicit fd actions, so the child holds exactly fds 0..=2. macOS adds
//! `POSIX_SPAWN_CLOEXEC_DEFAULT`; on Linux every descriptor of the supervisor is close-on-exec already
//! (`sys`), which is equivalent when only this thread spawns. Exec failures come back from `posix_spawn`
//! itself (glibc, musl and macOS all report them), so a pipe root needs no error pipe.

use std::ffi::{CStr, CString, OsStr};
use std::os::fd::{AsRawFd, BorrowedFd};
use std::os::unix::ffi::OsStrExt;

use omni_proto::{FailCode, Spawn};

/// Why a spawn failed, as reported in `SpawnFailed`.
#[derive(Debug)]
pub(super) struct Fail {
    pub code: FailCode,
    pub errno: i32,
    pub msg: String,
}

impl Fail {
    pub(super) fn new(code: FailCode, errno: i32, msg: String) -> Fail {
        Fail { code, errno, msg }
    }
}

/// A validated request as C strings, built before any process exists.
pub(super) struct Prepared {
    pub program: CString,
    argv: Vec<CString>,
    envp: Vec<CString>,
    pub cwd: CString,
}

impl Prepared {
    pub(super) fn new(s: &Spawn) -> Result<Prepared, Fail> {
        let invalid = |what: &str| Fail::new(FailCode::Invalid, 0, what.to_owned());
        let c = |b: &[u8], what: &str| CString::new(b).map_err(|_| invalid(&format!("{what} contains a NUL byte")));
        if s.program.first() != Some(&b'/') {
            return Err(invalid("the program path is not absolute"));
        }
        if s.cwd.first() != Some(&b'/') {
            return Err(invalid("the working directory is not absolute"));
        }
        if s.argv.is_empty() {
            return Err(invalid("argv is empty"));
        }
        let mut envp = Vec::with_capacity(s.env.len());
        for (k, v) in &s.env {
            if k.is_empty() || k.contains(&b'=') {
                return Err(invalid("an environment name is empty or contains '='"));
            }
            envp.push(c(&[k.as_slice(), b"=", v.as_slice()].concat(), "an environment entry")?);
        }
        Ok(Prepared {
            program: c(&s.program, "the program path")?,
            argv: s.argv.iter().map(|a| c(a, "an argument")).collect::<Result<_, _>>()?,
            envp,
            cwd: c(&s.cwd, "the working directory")?,
        })
    }

    /// NULL-terminated pointer arrays for `execve`/`posix_spawn`; valid while `self` lives.
    pub(super) fn ptrs(&self) -> (Vec<*mut libc::c_char>, Vec<*mut libc::c_char>) {
        let list = |v: &[CString]| {
            let mut p: Vec<*mut libc::c_char> = v.iter().map(|s| s.as_ptr().cast_mut()).collect();
            p.push(std::ptr::null_mut());
            p
        };
        (list(&self.argv), list(&self.envp))
    }

    /// Maps an exec-stage errno to a typed failure: an unusable cwd wins, since `chdir` runs first.
    pub(super) fn exec_fail(&self, errno: i32, stage: &str) -> Fail {
        let os = std::io::Error::from_raw_os_error(errno);
        if !usable_dir(&self.cwd) {
            return Fail::new(
                FailCode::BadCwd,
                errno,
                format!("working directory {}: {os}", show(&self.cwd)),
            );
        }
        Fail::new(
            exec_code(errno),
            errno,
            format!("{stage} {}: {os}", show(&self.program)),
        )
    }
}

/// The failure code of an `execve` errno.
pub(super) fn exec_code(errno: i32) -> FailCode {
    match errno {
        libc::ENOENT | libc::ENOTDIR => FailCode::NotFound,
        libc::EACCES | libc::EPERM | libc::ENOEXEC | libc::EISDIR => FailCode::NotExecutable,
        libc::E2BIG => FailCode::Invalid,
        _ => FailCode::Io,
    }
}

pub(super) fn show(c: &CStr) -> String {
    c.to_string_lossy().into_owned()
}

fn usable_dir(dir: &CStr) -> bool {
    let is_dir = std::fs::metadata(OsStr::from_bytes(dir.to_bytes())).is_ok_and(|m| m.is_dir());
    // SAFETY: a NUL-terminated path; access only reads it.
    is_dir && unsafe { libc::access(dir.as_ptr(), libc::X_OK) } == 0
}

#[cfg(target_os = "macos")]
const SPAWN_FLAGS: libc::c_int =
    POSIX_SPAWN_SETSID | libc::POSIX_SPAWN_SETSIGDEF | libc::POSIX_SPAWN_SETSIGMASK | libc::POSIX_SPAWN_CLOEXEC_DEFAULT;
#[cfg(target_os = "linux")]
const SPAWN_FLAGS: libc::c_int =
    libc::POSIX_SPAWN_SETSID as libc::c_int | libc::POSIX_SPAWN_SETSIGDEF | libc::POSIX_SPAWN_SETSIGMASK;

/// `<spawn.h>` on macOS 10.15+; the libc crate does not export it.
#[cfg(target_os = "macos")]
const POSIX_SPAWN_SETSID: libc::c_int = 0x0400;

#[cfg(target_os = "macos")]
unsafe extern "C" {
    /// `<spawn.h>` on macOS 10.15+; the libc crate does not declare it for Apple targets.
    fn posix_spawn_file_actions_addchdir_np(
        actions: *mut libc::posix_spawn_file_actions_t,
        path: *const libc::c_char,
    ) -> libc::c_int;
}
#[cfg(target_os = "linux")]
use libc::posix_spawn_file_actions_addchdir_np;

struct Attr(libc::posix_spawnattr_t);
impl Drop for Attr {
    fn drop(&mut self) {
        // SAFETY: initialized by posix_spawnattr_init (the value is only built after it succeeded).
        unsafe { libc::posix_spawnattr_destroy(&raw mut self.0) };
    }
}

struct Actions(libc::posix_spawn_file_actions_t);
impl Drop for Actions {
    fn drop(&mut self) {
        // SAFETY: initialized by posix_spawn_file_actions_init (only built after it succeeded).
        unsafe { libc::posix_spawn_file_actions_destroy(&raw mut self.0) };
    }
}

/// Starts a pipe root in a new session. `stdin` `None` = the null device; `stderr` may be `stdout` (merge).
pub(super) fn spawn_pipe(
    p: &Prepared,
    stdin: Option<BorrowedFd<'_>>,
    stdout: BorrowedFd<'_>,
    stderr: BorrowedFd<'_>,
) -> Result<i32, Fail> {
    let io = |e: libc::c_int, what: &str| {
        Fail::new(
            FailCode::Io,
            e,
            format!("{what}: {}", std::io::Error::from_raw_os_error(e)),
        )
    };
    let check = |e: libc::c_int, what: &str| if e == 0 { Ok(()) } else { Err(io(e, what)) };

    // SAFETY: plain old data, initialized by the call below before any other use.
    let mut raw: libc::posix_spawnattr_t = unsafe { std::mem::zeroed() };
    // SAFETY: `raw` is writable storage for the attribute object.
    let r = unsafe { libc::posix_spawnattr_init(&raw mut raw) };
    check(r, "posix_spawnattr_init")?;
    let mut attr = Attr(raw);
    // SAFETY: plain old data, initialized by the call below before any other use.
    let mut raw: libc::posix_spawn_file_actions_t = unsafe { std::mem::zeroed() };
    // SAFETY: `raw` is writable storage for the actions object.
    let r = unsafe { libc::posix_spawn_file_actions_init(&raw mut raw) };
    check(r, "posix_spawn_file_actions_init")?;
    let mut fa = Actions(raw);

    let flags = libc::c_short::try_from(SPAWN_FLAGS).map_err(|_| io(libc::EINVAL, "spawn flags"))?;
    // SAFETY: sigset_t is plain old data; sigfillset/sigemptyset initialize it.
    let (mut all, mut none): (libc::sigset_t, libc::sigset_t) = unsafe { (std::mem::zeroed(), std::mem::zeroed()) };
    // SAFETY: every pointer is to a live, initialized object of the expected type, and every path is NUL-terminated.
    unsafe {
        check(libc::sigfillset(&raw mut all), "sigfillset")?;
        check(libc::sigemptyset(&raw mut none), "sigemptyset")?;
        check(
            libc::posix_spawnattr_setflags(&raw mut attr.0, flags),
            "posix_spawnattr_setflags",
        )?;
        check(
            libc::posix_spawnattr_setsigdefault(&raw mut attr.0, &raw const all),
            "setsigdefault",
        )?;
        check(
            libc::posix_spawnattr_setsigmask(&raw mut attr.0, &raw const none),
            "setsigmask",
        )?;
        let fa = &raw mut fa.0;
        match stdin {
            Some(fd) => check(
                libc::posix_spawn_file_actions_adddup2(fa, fd.as_raw_fd(), 0),
                "dup2 stdin",
            )?,
            None => check(
                libc::posix_spawn_file_actions_addopen(fa, 0, c"/dev/null".as_ptr(), libc::O_RDONLY, 0),
                "open /dev/null",
            )?,
        }
        check(
            libc::posix_spawn_file_actions_adddup2(fa, stdout.as_raw_fd(), 1),
            "dup2 stdout",
        )?;
        check(
            libc::posix_spawn_file_actions_adddup2(fa, stderr.as_raw_fd(), 2),
            "dup2 stderr",
        )?;
        check(posix_spawn_file_actions_addchdir_np(fa, p.cwd.as_ptr()), "chdir action")?;
    }
    let (argv, envp) = p.ptrs();
    let mut pid: libc::pid_t = 0;
    // SAFETY: `argv`/`envp` are NULL-terminated arrays of C strings owned by `p`, alive for the call;
    // the attribute and action objects are initialized.
    let r = unsafe {
        libc::posix_spawn(
            &raw mut pid,
            p.program.as_ptr(),
            &raw const fa.0,
            &raw const attr.0,
            argv.as_ptr(),
            envp.as_ptr(),
        )
    };
    if r != 0 {
        return Err(p.exec_fail(r, "posix_spawn"));
    }
    Ok(pid)
}
