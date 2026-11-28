use super::spawn::{Fail, Prepared};
use super::trees::{Exec, MAX_TREES};
use super::{Closed, Sup, fork, spawn};
use omni_proto::{FailCode, Msg, Slot, Spawn};
use std::os::fd::{AsFd, OwnedFd};
use std::time::Instant;

#[cfg(target_os = "linux")]
type Member = super::isolated::Member;
#[cfg(target_os = "macos")]
type Member = ();

impl Sup {
    pub(super) fn spawn(&mut self, s: Spawn) -> Result<(), Closed> {
        #[cfg(target_os = "linux")]
        let mut s = s;
        let pipes = usize::from(s.stdin == Slot::Pipe) + 1 + usize::from(s.stderr == Slot::Pipe);
        let fds = self.chan.take_fds(if s.pty.is_some() { 0 } else { pipes })?;
        let req = s.req;
        #[cfg(target_os = "linux")]
        if self.executable_policy.is_some() {
            s.env.clear();
        }
        let started = if !self.trees.admits() {
            let msg = format!("the supervisor already holds {MAX_TREES} trees (live or not yet released)");
            Err(Fail::new(FailCode::Io, 0, msg))
        } else {
            Prepared::new(&s).and_then(|p| {
                #[cfg(target_os = "linux")]
                let mut p = p;
                #[cfg(target_os = "linux")]
                if let Some(policy) = &self.executable_policy {
                    policy.admit(&p.program)?;
                    p.restrict();
                }
                match s.pty {
                    None => {
                        let mut it = fds.iter().map(AsFd::as_fd);
                        let stdin = if s.stdin == Slot::Pipe { it.next() } else { None };
                        let (stdout, stderr) = (it.next(), it.next());
                        let stdout = stdout.ok_or_else(|| Fail::new(FailCode::Invalid, 0, "no stdout".into()))?;
                        #[cfg(target_os = "linux")]
                        if let Some(isolation) = &self.isolation {
                            let (pid, member) = isolation.spawn(&p, stdin, stdout, stderr.unwrap_or(stdout))?;
                            return Ok((pid, None, Exec::Running, Some(member)));
                        }
                        let pid = spawn::spawn_pipe(&p, stdin, stdout, stderr.unwrap_or(stdout))?;
                        Ok((pid, None, Exec::Running, None::<Member>))
                    }
                    Some((cols, rows)) => {
                        #[cfg(target_os = "linux")]
                        if self.isolation.is_some() {
                            return Err(Fail::new(
                                FailCode::Invalid,
                                0,
                                "isolated mode does not admit PTY commands".into(),
                            ));
                        }
                        let (pid, master, held) = fork::spawn_pty(&p, cols, rows)?;
                        Ok((pid, Some(master), Exec::Held(held), None))
                    }
                }
            })
        };
        drop(fds); // the child holds its own copies now
        let (pid, master, exec, member) = match started {
            Ok(child) => child,
            Err(f) => return self.fail(req, f),
        };
        // Registered before anything that can notice host death, so the child always gets its stop.
        let id = self.trees.insert(pid, master, s.grace_ms, exec);
        #[cfg(target_os = "linux")]
        if let Some(tree) = self.trees.map.get_mut(&id) {
            tree.member = member;
        }
        #[cfg(target_os = "macos")]
        let _ = member;
        let host_end = match self.trees.master(id).map(OwnedFd::try_clone).transpose() {
            Ok(end) => end,
            Err(e) => {
                self.trees.stop(None, id, 0, Instant::now(), &mut Vec::new());
                self.trees.release(0, id, &mut Vec::new());
                let errno = e.raw_os_error().unwrap_or(0);
                return self.fail(req, Fail::new(FailCode::Io, errno, format!("dup: {e}")));
            }
        };
        // Replies to earlier requests go first: queued, not flushed (only the end of the turn flushes).
        self.queue_out();
        let pty_ends = [u64::from(host_end.is_some()), 0];
        let msg = Msg::Spawned {
            req,
            id,
            pid: pid.cast_unsigned(),
            pty_ends,
        };
        self.chan.send(&msg, host_end).map_err(|e| Closed::Proto(e.0))
    }
}
