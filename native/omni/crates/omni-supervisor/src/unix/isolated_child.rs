use std::os::fd::RawFd;

pub(super) struct Plan {
    pub(super) input: RawFd,
    pub(super) output: RawFd,
    pub(super) error: RawFd,
    pub(super) report: RawFd,
    pub(super) leaf: RawFd,
    pub(super) uid: u32,
    pub(super) gid: u32,
    pub(super) parent: i32,
    pub(super) cwd: *const libc::c_char,
    pub(super) program: *const libc::c_char,
    pub(super) argv: *const *mut libc::c_char,
    pub(super) envp: *const *mut libc::c_char,
}

// After clone the child uses only syscall-style operations and never returns to Rust runtime.
pub(super) unsafe fn run(p: &Plan) -> ! {
    let die = |stage: u8| -> ! {
        // SAFETY: errno is thread-local and set by the failed operation.
        let errno = unsafe { *libc::__errno_location() }.to_le_bytes();
        let report = [stage, errno[0], errno[1], errno[2], errno[3]];
        // SAFETY: the fixed report and inherited error pipe are live until exec.
        unsafe {
            libc::write(p.report, report.as_ptr().cast(), report.len());
            libc::_exit(127)
        }
    };
    // SAFETY: all pointers and descriptors were prepared before clone, and this branch never returns.
    unsafe {
        let mut mask: libc::sigset_t = std::mem::zeroed();
        if libc::sigemptyset(&raw mut mask) != 0
            || libc::sigprocmask(libc::SIG_SETMASK, &raw const mask, std::ptr::null_mut()) != 0
        {
            die(1);
        }
        let default: libc::sigaction = std::mem::zeroed();
        for sig in 1..65 {
            libc::sigaction(sig, &raw const default, std::ptr::null_mut());
        }
        if libc::setsid() < 0 {
            die(2);
        }
        if libc::dup2(p.input, 0) < 0 || libc::dup2(p.output, 1) < 0 || libc::dup2(p.error, 2) < 0 {
            die(3);
        }
        if libc::setgroups(0, std::ptr::null()) != 0
            || libc::setresgid(p.gid, p.gid, p.gid) != 0
            || libc::setresuid(p.uid, p.uid, p.uid) != 0
        {
            die(4);
        }
        let (mut ruid, mut euid, mut suid) = (0, 0, 0);
        let (mut rgid, mut egid, mut sgid) = (0, 0, 0);
        if libc::getresuid(&raw mut ruid, &raw mut euid, &raw mut suid) != 0
            || libc::getresgid(&raw mut rgid, &raw mut egid, &raw mut sgid) != 0
            || ruid != p.uid
            || euid != p.uid
            || suid != p.uid
            || rgid != p.gid
            || egid != p.gid
            || sgid != p.gid
            || libc::getgroups(0, std::ptr::null_mut()) != 0
        {
            *libc::__errno_location() = libc::EPERM;
            die(4);
        }
        // Explicitly clear all capability sets, including inherited and ambient capabilities.
        let mut header = CapHeader {
            version: 0x20080522,
            pid: 0,
        };
        let caps = [
            CapData {
                effective: 0,
                permitted: 0,
                inheritable: 0,
            },
            CapData {
                effective: 0,
                permitted: 0,
                inheritable: 0,
            },
        ];
        if libc::syscall(libc::SYS_capset, &raw mut header, caps.as_ptr()) != 0
            || libc::prctl(libc::PR_CAP_AMBIENT, libc::PR_CAP_AMBIENT_CLEAR_ALL, 0, 0, 0) != 0
            || libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
            || libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL, 0, 0, 0) != 0
            || libc::getppid() != p.parent
        {
            *libc::__errno_location() = libc::EPERM;
            die(4);
        }
        // Check the actual leaf under the dropped identity, including ACL-granted access.
        for name in [c"cgroup.procs", c"cgroup.freeze", c"pids.max"] {
            let fd = libc::openat(
                p.leaf,
                name.as_ptr(),
                libc::O_WRONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            );
            if fd >= 0 {
                libc::close(fd);
                *libc::__errno_location() = libc::EPERM;
                die(4);
            }
            if *libc::__errno_location() != libc::EACCES && *libc::__errno_location() != libc::EPERM {
                die(4);
            }
        }
        if libc::chdir(p.cwd) != 0 {
            die(5);
        }
        // close_range is required: no inherited privileged control or supervisor descriptors reach exec.
        if p.report > 3 && libc::syscall(libc::SYS_close_range, 3u32, (p.report - 1) as u32, 0u32) != 0 {
            die(6);
        }
        if libc::syscall(libc::SYS_close_range, (p.report + 1) as u32, u32::MAX, 0u32) != 0 {
            die(6);
        }
        libc::execve(p.program, p.argv.cast(), p.envp.cast());
        die(7)
    }
}

#[repr(C)]
struct CapHeader {
    version: u32,
    pid: i32,
}
#[repr(C)]
struct CapData {
    effective: u32,
    permitted: u32,
    inheritable: u32,
}
