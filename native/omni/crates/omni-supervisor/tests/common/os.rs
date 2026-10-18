//! The OS oracle: liveness and descriptors asked of the OS, never of the supervisor.

use std::time::{Duration, Instant};

/// Polls `f` until it holds or `within` passes. A bound for an OS condition, not a synchronization sleep.
pub fn wait_until(within: Duration, mut f: impl FnMut() -> bool) -> bool {
    let end = Instant::now() + within;
    loop {
        if f() {
            return true;
        }
        if Instant::now() >= end {
            return false;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
}

/// The process exists (alive or a zombie). Permission errors count as existing.
pub fn exists(pid: i32) -> bool {
    // SAFETY: signal 0 only checks for existence.
    unsafe { libc::kill(pid, 0) == 0 || *errno() == libc::EPERM }
}

/// The process exists and is not a zombie. A zombie thread-group leader whose other threads still run is
/// alive: every task of `/proc/<pid>/task` is asked. An observation that cannot be made fails the test.
#[cfg(target_os = "linux")]
pub fn alive(pid: i32) -> bool {
    match state(&format!("/proc/{pid}/stat")) {
        None | Some(b'X') => false,
        Some(b'Z') => {
            let tasks = match std::fs::read_dir(format!("/proc/{pid}/task")) {
                Ok(dir) => dir,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return false,
                Err(e) => panic!("cannot list the threads of {pid}: {e}"),
            };
            tasks
                .map(|t| {
                    t.unwrap_or_else(|e| panic!("cannot list the threads of {pid}: {e}"))
                        .file_name()
                })
                .filter_map(|tid| state(&format!("/proc/{pid}/task/{}/stat", tid.to_string_lossy())))
                .any(|s| !matches!(s, b'Z' | b'X'))
        }
        Some(_) => true,
    }
}

/// The state letter of a `stat` file; `None` when the process or thread is gone.
#[cfg(target_os = "linux")]
fn state(path: &str) -> Option<u8> {
    match std::fs::read_to_string(path) {
        Ok(s) => Some(
            *s.rsplit_once(')')
                .unwrap_or_else(|| panic!("unparsable {path}"))
                .1
                .trim_start()
                .as_bytes()
                .first()
                .unwrap(),
        ),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound || e.raw_os_error() == Some(libc::ESRCH) => None,
        Err(e) => panic!("cannot read {path}: {e}"),
    }
}

/// The process exists and is not a zombie. A process being torn down (after SIGKILL, before it is a
/// zombie) counts as alive: `getsid` and `proc_pidinfo` already fail for it, so only the kernel's process
/// table (`sysctl(KERN_PROC_PID)`) can tell (Codex/lead r4: an exiting process is not gone).
#[cfg(target_os = "macos")]
pub fn alive(pid: i32) -> bool {
    // kinfo_proc (<sys/sysctl.h>, 648 bytes on LP64): kp_proc.p_stat at 36, kp_proc.p_pid at 40.
    let mut mib = [libc::CTL_KERN, libc::KERN_PROC, libc::KERN_PROC_PID, pid];
    let mut buf = [0u8; 648];
    let mut len: libc::size_t = buf.len();
    // SAFETY: `buf` has `len` writable bytes.
    let r = unsafe {
        libc::sysctl(
            mib.as_mut_ptr(),
            4,
            buf.as_mut_ptr().cast(),
            &raw mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    assert_eq!(r, 0, "sysctl(KERN_PROC_PID, {pid}) failed");
    len == buf.len() && i32::from_ne_bytes(buf[40..44].try_into().unwrap()) == pid && u32::from(buf[36]) != libc::SZOMB
}

/// The process is stopped (SIGSTOP/SIGTSTP).
#[cfg(target_os = "linux")]
pub fn stopped(pid: i32) -> bool {
    std::fs::read_to_string(format!("/proc/{pid}/stat")).is_ok_and(|s| {
        s.rsplit_once(')')
            .is_some_and(|(_, rest)| matches!(rest.trim_start().as_bytes().first(), Some(b'T' | b't')))
    })
}

/// The process is stopped (SIGSTOP/SIGTSTP).
#[cfg(target_os = "macos")]
pub fn stopped(pid: i32) -> bool {
    // SAFETY: plain old data filled by proc_pidinfo.
    let mut info: libc::proc_bsdshortinfo = unsafe { std::mem::zeroed() };
    let size = std::mem::size_of_val(&info) as libc::c_int;
    // SAFETY: `info` has `size` writable bytes.
    let n = unsafe { libc::proc_pidinfo(pid, libc::PROC_PIDT_SHORTBSDINFO, 0, (&raw mut info).cast(), size) };
    n == size && info.pbsi_status == libc::SSTOP
}

/// A zombie: exists but is not alive (e.g. a root pinned by the supervisor).
pub fn zombie(pid: i32) -> bool {
    exists(pid) && !alive(pid)
}

pub fn sid(pid: i32) -> i32 {
    // SAFETY: plain integer argument.
    unsafe { libc::getsid(pid) }
}

pub fn pgid(pid: i32) -> i32 {
    // SAFETY: plain integer argument.
    unsafe { libc::getpgid(pid) }
}

/// Open descriptor numbers of another process of ours.
#[cfg(target_os = "linux")]
pub fn fds_of(pid: u32) -> Vec<i32> {
    let mut v: Vec<i32> = std::fs::read_dir(format!("/proc/{pid}/fd"))
        .unwrap()
        .filter_map(|e| e.ok()?.file_name().to_str()?.parse().ok())
        .collect();
    v.sort_unstable();
    v
}

/// Open descriptor numbers of another process of ours.
#[cfg(target_os = "macos")]
pub fn fds_of(pid: u32) -> Vec<i32> {
    // SAFETY: plain old data, written by proc_pidinfo up to the given size.
    let mut buf: Vec<libc::proc_fdinfo> = vec![unsafe { std::mem::zeroed() }; 4096];
    let bytes = (buf.len() * std::mem::size_of::<libc::proc_fdinfo>()) as libc::c_int;
    // SAFETY: `buf` has `bytes` writable bytes.
    let n = unsafe { libc::proc_pidinfo(pid as i32, libc::PROC_PIDLISTFDS, 0, buf.as_mut_ptr().cast(), bytes) };
    assert!(n > 0, "proc_pidinfo(PROC_PIDLISTFDS) of {pid} failed");
    let count = n as usize / std::mem::size_of::<libc::proc_fdinfo>();
    let mut v: Vec<i32> = buf.iter().take(count).map(|f| f.proc_fd).collect();
    v.sort_unstable();
    v
}

pub fn kill(pid: i32, sig: i32) {
    // SAFETY: plain integer arguments.
    unsafe { libc::kill(pid, sig) };
}

/// A pipe whose buffer is already full; whoever writes to the write end next blocks (nobody reads).
pub fn full_pipe() -> (std::io::PipeReader, std::io::PipeWriter) {
    use std::io::Write;
    use std::os::fd::AsRawFd;
    let (r, mut w) = std::io::pipe().unwrap();
    let fd = w.as_raw_fd();
    // SAFETY: F_GETFL/F_SETFL on our own pipe end.
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    // SAFETY: as above.
    assert_eq!(unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) }, 0);
    let chunk = [b'x'; 4096];
    loop {
        match w.write(&chunk) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
            Err(e) => panic!("filling the pipe: {e}"),
        }
    }
    // Blocking again (the flag belongs to the shared open file, so the next owner blocks on it).
    // SAFETY: as above.
    assert_eq!(unsafe { libc::fcntl(fd, libc::F_SETFL, flags) }, 0);
    (r, w)
}

pub fn killpg(pgid: i32, sig: i32) {
    // SAFETY: plain integer arguments.
    unsafe { libc::killpg(pgid, sig) };
}

/// Sets another process's soft descriptor limit (Linux `prlimit`); returns the previous soft limit.
#[cfg(target_os = "linux")]
pub fn set_nofile(pid: i32, soft: u64) -> u64 {
    let mut old = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    // SAFETY: reads the current limits into `old`.
    let r = unsafe { libc::prlimit(pid, libc::RLIMIT_NOFILE, std::ptr::null(), &raw mut old) };
    assert_eq!(r, 0);
    let new = libc::rlimit {
        rlim_cur: soft,
        rlim_max: old.rlim_max,
    };
    // SAFETY: `new` is a valid limit (soft <= hard).
    let r = unsafe { libc::prlimit(pid, libc::RLIMIT_NOFILE, &raw const new, std::ptr::null_mut()) };
    assert_eq!(r, 0);
    old.rlim_cur
}

#[cfg(target_os = "linux")]
fn errno() -> *mut libc::c_int {
    // SAFETY: this thread's errno.
    unsafe { libc::__errno_location() }
}

#[cfg(target_os = "macos")]
fn errno() -> *mut libc::c_int {
    // SAFETY: this thread's errno.
    unsafe { libc::__error() }
}

/// A hostile parent for the next exec (runs between fork and exec): leaks fd 99 without close-on-exec,
/// ignores SIGINT/SIGHUP/SIGTERM/SIGUSR1 and SIGCHLD (auto-reap!), and blocks SIGUSR2.
pub fn hostile(cmd: &mut std::process::Command) {
    use std::os::unix::process::CommandExt;
    let hook = || {
        // SAFETY: async-signal-safe calls on locals, in the child before exec.
        unsafe {
            if libc::dup2(2, 99) != 99 {
                return Err(std::io::Error::last_os_error());
            }
            for sig in [libc::SIGINT, libc::SIGHUP, libc::SIGTERM, libc::SIGUSR1, libc::SIGCHLD] {
                libc::signal(sig, libc::SIG_IGN);
            }
            let mut set: libc::sigset_t = std::mem::zeroed();
            libc::sigemptyset(&raw mut set);
            libc::sigaddset(&raw mut set, libc::SIGUSR2);
            libc::sigprocmask(libc::SIG_BLOCK, &raw const set, std::ptr::null_mut());
        }
        Ok(())
    };
    // SAFETY: the hook only makes async-signal-safe calls.
    unsafe { cmd.pre_exec(hook) };
}

/// Simulates a kernel without pidfd for the next exec: `pidfd_open` and `pidfd_send_signal` fail with
/// ENOSYS, exactly as on Linux < 5.3. The product binary has no switch for it.
#[cfg(target_os = "linux")]
pub fn without_pidfd(cmd: &mut std::process::Command) {
    deny(cmd, &[libc::SYS_pidfd_open, libc::SYS_pidfd_send_signal]);
}

/// Simulates Linux < 5.9 for the next exec: `close_range` fails with ENOSYS.
#[cfg(target_os = "linux")]
pub fn without_close_range(cmd: &mut std::process::Command) {
    deny(cmd, &[libc::SYS_close_range]);
}

/// A seccomp filter for the next exec that makes the given syscalls fail with ENOSYS.
#[cfg(target_os = "linux")]
fn deny(cmd: &mut std::process::Command, syscalls: &[libc::c_long]) {
    use std::os::unix::process::CommandExt;
    let stmt = |code: u32, k: u32| libc::sock_filter {
        code: code as u16,
        jt: 0,
        jf: 0,
        k,
    };
    let n = syscalls.len();
    let mut filter = vec![stmt(libc::BPF_LD | libc::BPF_W | libc::BPF_ABS, 0)]; // the syscall number
    for (i, &nr) in syscalls.iter().enumerate() {
        let to_deny = (n - i) as u8; // skip the remaining checks and the ALLOW
        filter.push(libc::sock_filter {
            code: (libc::BPF_JMP | libc::BPF_JEQ | libc::BPF_K) as u16,
            jt: to_deny,
            jf: 0,
            k: nr as u32,
        });
    }
    filter.push(stmt(libc::BPF_RET | libc::BPF_K, libc::SECCOMP_RET_ALLOW));
    filter.push(stmt(
        libc::BPF_RET | libc::BPF_K,
        libc::SECCOMP_RET_ERRNO | libc::ENOSYS as u32,
    ));
    // Built before the fork: the hook below only reads it.
    let hook = move || {
        let prog = libc::sock_fprog {
            len: filter.len() as u16,
            filter: filter.as_ptr().cast_mut(),
        };
        // SAFETY: prctl with plain arguments and a pointer to a live filter program; no allocation.
        unsafe {
            if libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
                || libc::prctl(libc::PR_SET_SECCOMP, libc::SECCOMP_MODE_FILTER, &raw const prog) != 0
            {
                return Err(std::io::Error::last_os_error());
            }
        }
        Ok(())
    };
    // SAFETY: the hook only makes async-signal-safe calls.
    unsafe { cmd.pre_exec(hook) };
}
