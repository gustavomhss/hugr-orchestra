//! Explicitly provisioned Linux cgroup-v2 single-task pipe members.
use std::ffi::CString;
use std::fs::File;
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, BorrowedFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::OsStrExt;
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use omni_proto::FailCode;
use super::spawn::{Fail, Prepared};
use super::sys;

const CLONE_INTO_CGROUP: u64 = 0x2_0000_0000;
static NEXT: AtomicU64 = AtomicU64::new(0);

#[repr(C)]
struct CloneArgs {
    flags: u64, pidfd: u64, child_tid: u64, parent_tid: u64, exit_signal: u64,
    stack: u64, stack_size: u64, tls: u64, set_tid: u64, set_tid_size: u64, cgroup: u64,
}

pub(super) struct Isolation { root: OwnedFd, uid: u32, gid: u32 }
pub(super) struct Member { root: OwnedFd, leaf: OwnedFd, name: CString, pid: i32, frozen: Option<bool> }
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PauseResult { Changed, Refused, Unknown }

fn open_at(dir: RawFd, name: &std::ffi::CStr, flags: i32) -> io::Result<OwnedFd> {
    let fd = unsafe { libc::openat(dir, name.as_ptr(), flags | libc::O_CLOEXEC | libc::O_NOFOLLOW) };
    if fd < 0 { return Err(io::Error::last_os_error()); }
    Ok(unsafe { OwnedFd::from_raw_fd(fd) })
}
fn read_at(dir: RawFd, name: &std::ffi::CStr) -> io::Result<String> {
    let mut out = String::new();
    File::from(open_at(dir, name, libc::O_RDONLY)?).read_to_string(&mut out)?;
    Ok(out)
}
fn write_at(dir: RawFd, name: &std::ffi::CStr, value: &str) -> io::Result<()> {
    File::from(open_at(dir, name, libc::O_WRONLY)?).write_all(value.as_bytes())
}
fn protected_dir(fd: RawFd) -> io::Result<()> {
    let mut st: libc::stat = unsafe { std::mem::zeroed() };
    if unsafe { libc::fstat(fd, &mut st) } != 0 { return Err(io::Error::last_os_error()); }
    if st.st_uid != 0 || st.st_mode & libc::S_IFMT != libc::S_IFDIR || st.st_mode & 0o022 != 0 {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "unprotected isolation path"));
    }
    Ok(())
}
impl Isolation {
    pub(super) fn load() -> io::Result<Option<Self>> {
        let root = std::env::var_os("HUGR_OMNI_ISOLATION_ROOT");
        let uid = std::env::var("HUGR_OMNI_ISOLATION_UID");
        let gid = std::env::var("HUGR_OMNI_ISOLATION_GID");
        if root.is_none() && uid.is_err() && gid.is_err() { return Ok(None); }
        let invalid = || io::Error::new(io::ErrorKind::InvalidInput, "incomplete or invalid isolation provisioning");
        let root = root.ok_or_else(invalid)?;
        let uid: u32 = uid.map_err(|_| invalid())?.parse().map_err(|_| invalid())?;
        let gid: u32 = gid.map_err(|_| invalid())?.parse().map_err(|_| invalid())?;
        if unsafe { libc::geteuid() } != 0 || uid == 0 || gid == 0 || uid == u32::MAX || gid == u32::MAX || uid == gid { return Err(invalid()); }
        let path = Path::new(&root);
        if !path.is_absolute() { return Err(invalid()); }
        let mut dir = open_at(libc::AT_FDCWD, c"/", libc::O_RDONLY | libc::O_DIRECTORY)?;
        protected_dir(dir.as_raw_fd())?;
        for part in path.components() {
            match part {
                Component::RootDir => (),
                Component::Normal(s) => {
                    let name = CString::new(s.as_bytes()).map_err(|_| invalid())?;
                    dir = open_at(dir.as_raw_fd(), &name, libc::O_RDONLY | libc::O_DIRECTORY)?;
                    protected_dir(dir.as_raw_fd())?;
                }
                _ => return Err(invalid()),
            }
        }
        let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
        if unsafe { libc::fstatfs(dir.as_raw_fd(), &mut stat) } != 0 { return Err(io::Error::last_os_error()); }
        if stat.f_type as u64 != 0x6367_7270 || !read_at(dir.as_raw_fd(), c"cgroup.procs")?.trim().is_empty()
            || !read_at(dir.as_raw_fd(), c"cgroup.subtree_control")?.split_whitespace().any(|v| v == "pids") {
            return Err(invalid());
        }
        Ok(Some(Self { root: dir, uid, gid }))
    }
    pub(super) fn spawn(&self, p: &Prepared, stdin: Option<BorrowedFd<'_>>, stdout: BorrowedFd<'_>, stderr: BorrowedFd<'_>) -> Result<(i32, Member), Fail> {
        let fail = |what: &str, e: io::Error| Fail::new(FailCode::Io, e.raw_os_error().unwrap_or(0), format!("{what}: {e}"));
        let name = CString::new(format!("omni-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))).map_err(|_| fail("leaf name", io::Error::from_raw_os_error(libc::EINVAL)))?;
        if unsafe { libc::mkdirat(self.root.as_raw_fd(), name.as_ptr(), 0o700) } != 0 { return Err(fail("create isolation leaf", io::Error::last_os_error())); }
        let result = (|| -> io::Result<Member> {
            let root = self.root.try_clone()?;
            let leaf = open_at(root.as_raw_fd(), &name, libc::O_RDONLY | libc::O_DIRECTORY)?;
            protected_dir(leaf.as_raw_fd())?;
            write_at(leaf.as_raw_fd(), c"pids.max", "1")?;
            if read_at(leaf.as_raw_fd(), c"pids.max")?.trim() != "1" || !read_at(leaf.as_raw_fd(), c"cgroup.procs")?.trim().is_empty() { return Err(io::Error::other("invalid isolation leaf")); }
            Ok(Member { root, leaf, name: name.clone(), pid: 0, frozen: Some(false) })
        })();
        let mut member = match result { Ok(m) => m, Err(e) => { unsafe { libc::unlinkat(self.root.as_raw_fd(), name.as_ptr(), libc::AT_REMOVEDIR); } return Err(fail("prepare isolation leaf", e)); } };
        let (err_r, err_w) = sys::pipe().map_err(|e| fail("error pipe", e))?;
        let null = if stdin.is_none() { Some(open_at(libc::AT_FDCWD, c"/dev/null", libc::O_RDONLY).map_err(|e| fail("open null", e))?) } else { None };
        // Duplicate above stdio so simultaneous fd remapping cannot clobber another source.
        let dup = |fd: RawFd| -> io::Result<OwnedFd> { let n = unsafe { libc::fcntl(fd, libc::F_DUPFD_CLOEXEC, 3) }; if n < 0 { return Err(io::Error::last_os_error()); } Ok(unsafe { OwnedFd::from_raw_fd(n) }) };
        let report_fd = dup(err_w.as_raw_fd()).map_err(|e| fail("duplicate report", e))?;
        let input = dup(stdin.map_or_else(|| null.as_ref().unwrap().as_raw_fd(), |f| f.as_raw_fd())).map_err(|e| fail("duplicate stdin", e))?;
        let output = dup(stdout.as_raw_fd()).map_err(|e| fail("duplicate stdout", e))?;
        let error = dup(stderr.as_raw_fd()).map_err(|e| fail("duplicate stderr", e))?;
        let (argv, envp) = p.ptrs();
        let plan = Plan { input: input.as_raw_fd(), output: output.as_raw_fd(), error: error.as_raw_fd(), report: report_fd.as_raw_fd(), leaf: member.leaf.as_raw_fd(), uid: self.uid, gid: self.gid, parent: unsafe { libc::getpid() }, cwd: p.cwd.as_ptr(), program: p.program.as_ptr(), argv: argv.as_ptr(), envp: envp.as_ptr() };
        let args = CloneArgs { flags: CLONE_INTO_CGROUP, pidfd: 0, child_tid: 0, parent_tid: 0, exit_signal: libc::SIGCHLD as u64, stack: 0, stack_size: 0, tls: 0, set_tid: 0, set_tid_size: 0, cgroup: member.leaf.as_raw_fd() as u64 };
        let pid = unsafe { libc::syscall(libc::SYS_clone3, &args, std::mem::size_of::<CloneArgs>()) as i32 };
        if pid == 0 { unsafe { child(&plan) } }
        if pid < 0 { return Err(fail("clone3", io::Error::last_os_error())); }
        member.pid = pid;
        drop(err_w);
        drop(report_fd);
        let mut report = [0u8; 5];
        let mut reader = File::from(err_r);
        let outcome = reader.read(&mut report);
        match outcome {
            Ok(0) if member.matches(pid) => Ok((pid, member)),
            other => {
                unsafe { libc::kill(pid, libc::SIGKILL); while libc::waitpid(pid, std::ptr::null_mut(), 0) < 0 && *libc::__errno_location() == libc::EINTR {} }
                match other {
                    Ok(5) => { let errno = i32::from_le_bytes([report[1], report[2], report[3], report[4]]); Err(p.exec_fail(errno, "isolated child")) }
                    Ok(_) => Err(fail("isolated child report", io::Error::other("incomplete report or lost membership"))),
                    Err(e) => Err(fail("isolated child report", e)),
                }
            }
        }
    }
}
impl Member {
    pub(super) fn matches(&self, pid: i32) -> bool {
        pid == self.pid && read_at(self.leaf.as_raw_fd(), c"cgroup.procs").is_ok_and(|v| v.trim() == pid.to_string())
            && read_at(self.leaf.as_raw_fd(), c"pids.current").is_ok_and(|v| v.trim() == "1")
    }
    pub(super) fn set_paused(&mut self, paused: bool) -> PauseResult {
        let Some(previous) = self.frozen else { return PauseResult::Unknown; };
        if previous == paused || !self.matches(self.pid) { return PauseResult::Refused; }
        if write_at(self.leaf.as_raw_fd(), c"cgroup.freeze", if paused { "1" } else { "0" }).is_err() { self.frozen = None; return PauseResult::Unknown; }
        let end = Instant::now() + Duration::from_secs(5);
        loop {
            if !self.matches(self.pid) { self.frozen = None; return PauseResult::Unknown; }
            match read_at(self.leaf.as_raw_fd(), c"cgroup.events") {
                Ok(events) if events.lines().any(|l| l == if paused { "frozen 1" } else { "frozen 0" }) => { self.frozen = Some(paused); return PauseResult::Changed; }
                Err(_) => { self.frozen = None; return PauseResult::Unknown; }
                _ if Instant::now() >= end => { self.frozen = None; return PauseResult::Unknown; }
                _ => std::thread::sleep(Duration::from_millis(10)),
            }
        }
    }
}
impl Drop for Member {
    fn drop(&mut self) { unsafe { libc::unlinkat(self.root.as_raw_fd(), self.name.as_ptr(), libc::AT_REMOVEDIR); } }
}

struct Plan {
    input: RawFd, output: RawFd, error: RawFd, report: RawFd, leaf: RawFd,
    uid: u32, gid: u32, parent: i32,
    cwd: *const libc::c_char, program: *const libc::c_char,
    argv: *const *mut libc::c_char, envp: *const *mut libc::c_char,
}

// After clone the child uses only syscall-style operations and never returns to Rust runtime.
unsafe fn child(p: &Plan) -> ! {
    let die = |stage: u8| -> ! {
        let errno = unsafe { *libc::__errno_location() }.to_le_bytes();
        let report = [stage, errno[0], errno[1], errno[2], errno[3]];
        unsafe { libc::write(p.report, report.as_ptr().cast(), report.len()); libc::_exit(127) }
    };
    unsafe {
        let mut mask: libc::sigset_t = std::mem::zeroed();
        if libc::sigemptyset(&raw mut mask) != 0 || libc::sigprocmask(libc::SIG_SETMASK, &raw const mask, std::ptr::null_mut()) != 0 { die(1); }
        let default: libc::sigaction = std::mem::zeroed();
        for sig in 1..65 { libc::sigaction(sig, &raw const default, std::ptr::null_mut()); }
        if libc::setsid() < 0 { die(2); }
        if libc::dup2(p.input, 0) < 0 || libc::dup2(p.output, 1) < 0 || libc::dup2(p.error, 2) < 0 { die(3); }
        if libc::setgroups(0, std::ptr::null()) != 0 || libc::setresgid(p.gid, p.gid, p.gid) != 0 || libc::setresuid(p.uid, p.uid, p.uid) != 0 { die(4); }
        let (mut ruid, mut euid, mut suid) = (0, 0, 0);
        let (mut rgid, mut egid, mut sgid) = (0, 0, 0);
        if libc::getresuid(&raw mut ruid, &raw mut euid, &raw mut suid) != 0
            || libc::getresgid(&raw mut rgid, &raw mut egid, &raw mut sgid) != 0
            || ruid != p.uid || euid != p.uid || suid != p.uid || rgid != p.gid || egid != p.gid || sgid != p.gid
            || libc::getgroups(0, std::ptr::null_mut()) != 0 { *libc::__errno_location() = libc::EPERM; die(4); }
        // Explicitly clear all capability sets, including inherited and ambient capabilities.
        let mut header = CapHeader { version: 0x20080522, pid: 0 };
        let caps = [CapData { effective: 0, permitted: 0, inheritable: 0 }, CapData { effective: 0, permitted: 0, inheritable: 0 }];
        if libc::syscall(libc::SYS_capset, &raw mut header, caps.as_ptr()) != 0
            || libc::prctl(libc::PR_CAP_AMBIENT, libc::PR_CAP_AMBIENT_CLEAR_ALL, 0, 0, 0) != 0
            || libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
            || libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL, 0, 0, 0) != 0
            || libc::getppid() != p.parent { *libc::__errno_location() = libc::EPERM; die(4); }
        // Check the actual leaf under the dropped identity, including ACL-granted access.
        for name in [c"cgroup.procs", c"cgroup.freeze", c"pids.max"] {
            let fd = libc::openat(p.leaf, name.as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW);
            if fd >= 0 { libc::close(fd); *libc::__errno_location() = libc::EPERM; die(4); }
            if *libc::__errno_location() != libc::EACCES && *libc::__errno_location() != libc::EPERM { die(4); }
        }
        if libc::chdir(p.cwd) != 0 { die(5); }
        // close_range is required: no inherited privileged control or supervisor descriptors reach exec.
        if p.report > 3 && libc::syscall(libc::SYS_close_range, 3u32, (p.report - 1) as u32, 0u32) != 0 { die(6); }
        if libc::syscall(libc::SYS_close_range, (p.report + 1) as u32, u32::MAX, 0u32) != 0 { die(6); }
        libc::execve(p.program, p.argv.cast(), p.envp.cast());
        die(7)
    }
}

#[repr(C)]
struct CapHeader { version: u32, pid: i32 }
#[repr(C)]
struct CapData { effective: u32, permitted: u32, inheritable: u32 }
