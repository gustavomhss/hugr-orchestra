//! Explicitly provisioned Linux cgroup-v2 single-task pipe members.
use std::ffi::CString;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, BorrowedFd, FromRawFd, OwnedFd, RawFd};
use std::os::unix::ffi::OsStrExt;
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use super::spawn::{Fail, Prepared};
use super::sys;
use omni_proto::FailCode;

#[path = "isolated_child.rs"]
mod child;
use child::Plan;

const CLONE_INTO_CGROUP: u64 = 0x2_0000_0000;
static NEXT: AtomicU64 = AtomicU64::new(0);

#[repr(C)]
struct CloneArgs {
    flags: u64,
    pidfd: u64,
    child_tid: u64,
    parent_tid: u64,
    exit_signal: u64,
    stack: u64,
    stack_size: u64,
    tls: u64,
    set_tid: u64,
    set_tid_size: u64,
    cgroup: u64,
}

pub(super) struct Isolation {
    root: OwnedFd,
    uid: u32,
    gid: u32,
}
pub(super) struct Member {
    root: OwnedFd,
    leaf: OwnedFd,
    name: CString,
    pid: i32,
    frozen: Option<bool>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PauseResult {
    Changed,
    Refused,
    Unknown,
}

fn open_at(dir: RawFd, name: &std::ffi::CStr, flags: i32) -> io::Result<OwnedFd> {
    // SAFETY: name is a C string and the returned descriptor is exclusively owned.
    let fd = unsafe { libc::openat(dir, name.as_ptr(), flags | libc::O_CLOEXEC | libc::O_NOFOLLOW) };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: openat returned a new, nonnegative descriptor.
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
fn protected(fd: RawFd, kind: libc::mode_t) -> io::Result<()> {
    // SAFETY: all-zero storage is valid for the output struct.
    let mut st: libc::stat = unsafe { std::mem::zeroed() };
    // SAFETY: fstat initializes a live stat buffer for this descriptor.
    if unsafe { libc::fstat(fd, &mut st) } != 0 {
        return Err(io::Error::last_os_error());
    }
    if st.st_uid != 0 || st.st_mode & libc::S_IFMT != kind || st.st_mode & 0o022 != 0 {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "unprotected isolation path",
        ));
    }
    Ok(())
}
fn protected_migration(dir: RawFd) -> io::Result<()> {
    let procs = open_at(dir, c"cgroup.procs", libc::O_RDONLY)?;
    protected(procs.as_raw_fd(), libc::S_IFREG)
}

fn unified_path(path: &Path) -> io::Result<()> {
    let mount = Path::new("/sys/fs/cgroup");
    let invalid = || io::Error::other("isolation root must be below the full unified cgroup mount");
    if !path.starts_with(mount) || path == mount {
        return Err(invalid());
    }
    let info = fs::read_to_string("/proc/self/mountinfo")?;
    let mut unified = false;
    for line in info.lines() {
        let Some((prefix, suffix)) = line.split_once(" - ") else {
            return Err(invalid());
        };
        let mut fields = prefix.split_whitespace().skip(3);
        let (Some(root), Some(point)) = (fields.next(), fields.next()) else {
            return Err(invalid());
        };
        if Path::new(point) == mount {
            if unified || root != "/" || suffix.split_whitespace().next() != Some("cgroup2") {
                return Err(invalid());
            }
            unified = true;
        } else if Path::new(point).starts_with(mount) && path.starts_with(point) {
            return Err(invalid());
        }
    }
    if !unified {
        return Err(invalid());
    }
    Ok(())
}
impl Isolation {
    pub(super) fn load() -> io::Result<Option<Self>> {
        let root = std::env::var_os("HUGR_OMNI_ISOLATION_ROOT");
        let uid = std::env::var("HUGR_OMNI_ISOLATION_UID");
        let gid = std::env::var("HUGR_OMNI_ISOLATION_GID");
        if root.is_none() && uid.is_err() && gid.is_err() {
            return Ok(None);
        }
        let invalid = || {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "incomplete or invalid isolation provisioning",
            )
        };
        let root = root.ok_or_else(invalid)?;
        let uid: u32 = uid.map_err(|_| invalid())?.parse().map_err(|_| invalid())?;
        let gid: u32 = gid.map_err(|_| invalid())?.parse().map_err(|_| invalid())?;
        // SAFETY: geteuid takes no arguments.
        if unsafe { libc::geteuid() } != 0 || uid == 0 || gid == 0 || uid == u32::MAX || gid == u32::MAX || uid == gid {
            return Err(invalid());
        }
        let path = Path::new(&root);
        unified_path(path)?;
        let mut dir = open_at(libc::AT_FDCWD, c"/", libc::O_RDONLY | libc::O_DIRECTORY)?;
        protected(dir.as_raw_fd(), libc::S_IFDIR)?;
        let mut current = std::path::PathBuf::from("/");
        for part in path.components() {
            match part {
                Component::RootDir => (),
                Component::Normal(s) => {
                    let name = CString::new(s.as_bytes()).map_err(|_| invalid())?;
                    dir = open_at(dir.as_raw_fd(), &name, libc::O_RDONLY | libc::O_DIRECTORY)?;
                    protected(dir.as_raw_fd(), libc::S_IFDIR)?;
                    current.push(s);
                    // Migration, including direct clone into another cgroup, requires writable
                    // cgroup.procs at the common ancestor. Include the full mount root.
                    if current.starts_with("/sys/fs/cgroup") {
                        protected_migration(dir.as_raw_fd())?;
                    }
                }
                _ => return Err(invalid()),
            }
        }
        // SAFETY: all-zero storage is valid for the output struct.
        let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
        // SAFETY: a live descriptor and a valid writable statfs buffer.
        if unsafe { libc::fstatfs(dir.as_raw_fd(), &mut stat) } != 0 {
            return Err(io::Error::last_os_error());
        }
        if stat.f_type as u64 != 0x6367_7270
            || !read_at(dir.as_raw_fd(), c"cgroup.procs")?.trim().is_empty()
            || !read_at(dir.as_raw_fd(), c"cgroup.subtree_control")?
                .split_whitespace()
                .any(|v| v == "pids")
        {
            return Err(invalid());
        }
        Ok(Some(Self { root: dir, uid, gid }))
    }
    pub(super) fn spawn(
        &self,
        p: &Prepared,
        stdin: Option<BorrowedFd<'_>>,
        stdout: BorrowedFd<'_>,
        stderr: BorrowedFd<'_>,
    ) -> Result<(i32, Member), Fail> {
        let fail =
            |what: &str, e: io::Error| Fail::new(FailCode::Io, e.raw_os_error().unwrap_or(0), format!("{what}: {e}"));
        let name = CString::new(format!(
            "omni-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ))
        .map_err(|_| fail("leaf name", io::Error::from_raw_os_error(libc::EINVAL)))?;
        // SAFETY: the root descriptor and C name are live.
        if unsafe { libc::mkdirat(self.root.as_raw_fd(), name.as_ptr(), 0o700) } != 0 {
            return Err(fail("create isolation leaf", io::Error::last_os_error()));
        }
        let result = (|| -> io::Result<Member> {
            let root = self.root.try_clone()?;
            let leaf = open_at(root.as_raw_fd(), &name, libc::O_RDONLY | libc::O_DIRECTORY)?;
            protected(leaf.as_raw_fd(), libc::S_IFDIR)?;
            protected_migration(leaf.as_raw_fd())?;
            if read_at(leaf.as_raw_fd(), c"cgroup.type")?.trim() != "domain" {
                return Err(io::Error::other("invalid isolation leaf type"));
            }
            write_at(leaf.as_raw_fd(), c"pids.max", "1")?;
            if read_at(leaf.as_raw_fd(), c"pids.max")?.trim() != "1"
                || !read_at(leaf.as_raw_fd(), c"cgroup.procs")?.trim().is_empty()
            {
                return Err(io::Error::other("invalid isolation leaf"));
            }
            Ok(Member {
                root,
                leaf,
                name: name.clone(),
                pid: 0,
                frozen: Some(false),
            })
        })();
        let mut member = match result {
            Ok(m) => m,
            Err(e) => {
                // SAFETY: the new leaf name is valid and anchored to our retained root.
                unsafe {
                    libc::unlinkat(self.root.as_raw_fd(), name.as_ptr(), libc::AT_REMOVEDIR);
                }
                return Err(fail("prepare isolation leaf", e));
            }
        };
        let (err_r, err_w) = sys::pipe().map_err(|e| fail("error pipe", e))?;
        // Duplicate above stdio so simultaneous fd remapping cannot clobber another source.
        let dup = |fd: RawFd| -> io::Result<OwnedFd> {
            // SAFETY: fcntl duplicates a live descriptor.
            let n = unsafe { libc::fcntl(fd, libc::F_DUPFD_CLOEXEC, 3) };
            if n < 0 {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: the successful duplicate returned a new owned descriptor.
            Ok(unsafe { OwnedFd::from_raw_fd(n) })
        };
        let report_fd = dup(err_w.as_raw_fd()).map_err(|e| fail("duplicate report", e))?;
        let input = match stdin {
            Some(fd) => dup(fd.as_raw_fd()),
            None => open_at(libc::AT_FDCWD, c"/dev/null", libc::O_RDONLY).and_then(|fd| dup(fd.as_raw_fd())),
        }
        .map_err(|e| fail("duplicate stdin", e))?;
        let output = dup(stdout.as_raw_fd()).map_err(|e| fail("duplicate stdout", e))?;
        let error = dup(stderr.as_raw_fd()).map_err(|e| fail("duplicate stderr", e))?;
        let (argv, envp) = p.ptrs();
        // SAFETY: getpid takes no arguments.
        let parent = unsafe { libc::getpid() };
        let plan = Plan {
            input: input.as_raw_fd(),
            output: output.as_raw_fd(),
            error: error.as_raw_fd(),
            report: report_fd.as_raw_fd(),
            leaf: member.leaf.as_raw_fd(),
            uid: self.uid,
            gid: self.gid,
            parent,
            cwd: p.cwd.as_ptr(),
            program: p.program.as_ptr(),
            argv: argv.as_ptr(),
            envp: envp.as_ptr(),
        };
        let args = CloneArgs {
            flags: CLONE_INTO_CGROUP,
            pidfd: 0,
            child_tid: 0,
            parent_tid: 0,
            exit_signal: libc::SIGCHLD as u64,
            stack: 0,
            stack_size: 0,
            tls: 0,
            set_tid: 0,
            set_tid_size: 0,
            cgroup: member.leaf.as_raw_fd() as u64,
        };
        // SAFETY: clone3 consumes a live initialized Linux clone_args with its exact size.
        let pid = unsafe { libc::syscall(libc::SYS_clone3, &args, std::mem::size_of::<CloneArgs>()) as i32 };
        if pid == 0 {
            // SAFETY: only the clone child runs this syscall-only, nonreturning path.
            unsafe { child::run(&plan) }
        }
        if pid < 0 {
            return Err(fail("clone3", io::Error::last_os_error()));
        }
        member.pid = pid;
        drop(err_w);
        drop(report_fd);
        let mut report = [0u8; 5];
        let mut reader = File::from(err_r);
        let outcome = reader.read(&mut report);
        match outcome {
            // The clone already placed the child atomically; a successful short command may have exited.
            Ok(0) => Ok((pid, member)),
            other => {
                // SAFETY: this is our direct, unreaped child from clone3.
                unsafe {
                    libc::kill(pid, libc::SIGKILL);
                    while libc::waitpid(pid, std::ptr::null_mut(), 0) < 0 && *libc::__errno_location() == libc::EINTR {}
                }
                match other {
                    Ok(5) => {
                        let errno = i32::from_le_bytes([report[1], report[2], report[3], report[4]]);
                        Err(p.exec_fail(errno, "isolated child"))
                    }
                    Ok(_) => Err(fail(
                        "isolated child report",
                        io::Error::other("incomplete report or lost membership"),
                    )),
                    Err(e) => Err(fail("isolated child report", e)),
                }
            }
        }
    }
}
impl Member {
    pub(super) fn matches(&self, pid: i32) -> bool {
        pid == self.pid
            && read_at(self.leaf.as_raw_fd(), c"cgroup.procs").is_ok_and(|v| v.trim() == pid.to_string())
            && read_at(self.leaf.as_raw_fd(), c"pids.current").is_ok_and(|v| v.trim() == "1")
    }
    pub(super) fn set_paused(&mut self, paused: bool) -> PauseResult {
        let Some(previous) = self.frozen else {
            return PauseResult::Unknown;
        };
        if previous == paused || !self.matches(self.pid) {
            return PauseResult::Refused;
        }
        if write_at(self.leaf.as_raw_fd(), c"cgroup.freeze", if paused { "1" } else { "0" }).is_err() {
            self.frozen = None;
            return PauseResult::Unknown;
        }
        let end = Instant::now() + Duration::from_secs(5);
        loop {
            if !self.matches(self.pid) {
                self.frozen = None;
                return PauseResult::Unknown;
            }
            match read_at(self.leaf.as_raw_fd(), c"cgroup.events") {
                Ok(events)
                    if events
                        .lines()
                        .any(|l| l == if paused { "frozen 1" } else { "frozen 0" }) =>
                {
                    self.frozen = Some(paused);
                    return PauseResult::Changed;
                }
                Err(_) => {
                    self.frozen = None;
                    return PauseResult::Unknown;
                }
                _ if Instant::now() >= end => {
                    self.frozen = None;
                    return PauseResult::Unknown;
                }
                _ => std::thread::sleep(Duration::from_millis(10)),
            }
        }
    }
}
impl Drop for Member {
    fn drop(&mut self) {
        // SAFETY: both the root descriptor and its member name are owned here.
        unsafe {
            libc::unlinkat(self.root.as_raw_fd(), self.name.as_ptr(), libc::AT_REMOVEDIR);
        }
    }
}
