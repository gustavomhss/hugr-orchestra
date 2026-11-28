//! Watches the isolated child's pre-exec report without waiting on it in the control loop.

use std::collections::VecDeque;
use std::fs::File;
use std::io::{self, Read};
use std::os::fd::AsRawFd;
use std::time::{Duration, Instant};

use omni_proto::FailCode;

use super::isolated::Member;
use super::spawn::{Fail, exec_code};
use super::trees::Exec;
use super::{Closed, Sup, pollfd, sweep};

// Leave time to send a typed failure before the native client's ten-second request deadline.
const BOOTSTRAP_WITHIN: Duration = Duration::from_secs(5);

struct Pending {
    member: Member,
    report: File,
    req: u64,
    grace_ms: u32,
    deadline: Instant,
}

#[derive(Default)]
pub(super) struct Bootstraps {
    pending: VecDeque<Pending>,
    // Keep the leaf owned until each rejected child is reaped, even if SIGKILL cannot wake it.
    rejected: Vec<Member>,
}

impl Bootstraps {
    pub(super) fn push(&mut self, member: Member, report: File, req: u64, grace_ms: u32) {
        self.pending.push_back(Pending {
            member,
            report,
            req,
            grace_ms,
            deadline: Instant::now() + BOOTSTRAP_WITHIN,
        });
    }

    pub(super) fn len(&self) -> usize {
        self.pending.len() + self.rejected.len()
    }

    pub(super) fn reply_count(&self) -> usize {
        self.pending.len()
    }

    pub(super) fn watch(&self, fds: &mut Vec<libc::pollfd>) -> Option<Instant> {
        fds.extend(self.pending.iter().map(|p| pollfd(p.report.as_raw_fd(), libc::POLLIN)));
        self.pending.front().map(|p| p.deadline)
    }

    pub(super) fn cancel(&mut self) {
        while let Some(p) = self.pending.pop_front() {
            self.reject(p.member);
        }
    }

    fn reject(&mut self, member: Member) {
        // SAFETY: this is our direct unreaped clone child. Its positive PID is pinned until reap.
        unsafe { libc::kill(member.pid, libc::SIGKILL) };
        self.rejected.push(member);
    }

    fn advance(&mut self, now: Instant) -> Vec<(u64, u32, Result<Member, Fail>)> {
        let mut ready = Vec::new();
        for _ in 0..self.pending.len() {
            let Some(mut p) = self.pending.pop_front() else { break };
            let Some(result) = report_result(&mut p.report, p.deadline, now) else {
                self.pending.push_back(p);
                continue;
            };
            let result = match result {
                Ok(()) => Ok(p.member),
                Err(fail) => {
                    self.reject(p.member);
                    Err(fail)
                }
            };
            ready.push((p.req, p.grace_ms, result));
        }
        self.rejected.retain(|member| !sweep::reap(member.pid));
        ready
    }
}

impl Sup {
    pub(super) fn advance_isolated(&mut self, now: Instant) -> Result<(), Closed> {
        let Some(isolation) = &mut self.isolation else {
            return Ok(());
        };
        let mut sent = Ok(());
        let mut announced = false;
        for (req, grace_ms, result) in isolation.bootstraps.advance(now) {
            // Register every successful child even if one reply fails.
            sent = sent.and(match result {
                Ok(member) => {
                    announced = true;
                    self.announce_spawn(req, member.pid, None, grace_ms, Exec::Running, Some(member))
                }
                Err(fail) => self.fail(req, fail),
            });
        }
        if announced {
            // A fast exit may already have had its SIGCHLD drained before the tree was registered.
            self.trees.observe_exits(&mut self.out);
        }
        sent
    }
}

fn report_result(report: &mut File, deadline: Instant, now: Instant) -> Option<Result<(), Fail>> {
    let mut buf = [0u8; 5];
    // The child writes at most one atomic five-byte report. EOF also covers a successful fast exit.
    let outcome = match (report.read(&mut buf), buf) {
        (Ok(0), _) => Ok(()),
        (Ok(5), [stage, a, b, c, d]) => {
            let errno = i32::from_le_bytes([a, b, c, d]);
            let code = match stage {
                5 => FailCode::BadCwd,
                7 => exec_code(errno),
                _ => FailCode::Io,
            };
            let os = io::Error::from_raw_os_error(errno);
            Err(Fail::new(code, errno, format!("isolated child stage {stage}: {os}")))
        }
        (Ok(n), _) => Err(Fail::new(FailCode::Io, 0, format!("incomplete isolated child report ({n} bytes)"))),
        (Err(e), _) if matches!(e.kind(), io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted) => {
            if now < deadline {
                return None;
            }
            Err(Fail::new(
                FailCode::Io,
                libc::ETIMEDOUT,
                "isolated child bootstrap timed out".into(),
            ))
        }
        (Err(e), _) => Err(Fail::new(
            FailCode::Io,
            e.raw_os_error().unwrap_or(0),
            format!("isolated child report: {e}"),
        )),
    };
    Some(outcome)
}

#[cfg(test)]
mod tests {
    use std::os::fd::AsFd;

    use super::{BOOTSTRAP_WITHIN, Fail, FailCode, File, Instant, io, report_result};
    use crate::unix::sys;

    #[test]
    fn open_isolated_report_pipe_is_pending_until_bootstrap_deadline() -> io::Result<()> {
        let (read, _write) = sys::pipe()?;
        sys::set_nonblock(read.as_fd())?;
        let mut report = File::from(read);
        let now = Instant::now();
        let deadline = now + BOOTSTRAP_WITHIN;
        assert!(report_result(&mut report, deadline, now).is_none());
        assert!(matches!(
            report_result(&mut report, deadline, deadline),
            Some(Err(Fail {
                code: FailCode::Io,
                errno: libc::ETIMEDOUT,
                ..
            }))
        ));
        Ok(())
    }

    #[test]
    fn ready_isolated_report_eof_is_success_at_bootstrap_deadline() -> io::Result<()> {
        let (read, write) = sys::pipe()?;
        sys::set_nonblock(read.as_fd())?;
        drop(write);
        let deadline = Instant::now();
        assert!(matches!(
            report_result(&mut File::from(read), deadline, deadline),
            Some(Ok(()))
        ));
        Ok(())
    }
}
