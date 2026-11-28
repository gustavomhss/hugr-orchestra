//! Queuing and budgeting deferred replies.

use omni_proto::Msg;

use super::{Closed, Sup, spawn::Fail};

/// Reserved reply bytes per deferred stop or observation request.
const RESERVE_PER_WAITER: usize = 32;
/// Budget for either result of an isolated bootstrap, including its short failure message.
#[cfg(target_os = "linux")]
const RESERVE_PER_BOOTSTRAP: usize = 128;

impl Sup {
    /// Stops reading requests when queued and deferred replies would fill the queue budget.
    pub(super) fn backlogged(&self) -> bool {
        let reserved = RESERVE_PER_WAITER * (self.trees.waiters() + usize::from(self.observation.pending()));
        #[cfg(target_os = "linux")]
        let reserved = reserved
            + RESERVE_PER_BOOTSTRAP * self.isolation.as_ref().map_or(0, |isolation| isolation.bootstraps.reply_count());
        self.chan.backlogged(reserved)
    }

    pub(super) fn fail(&mut self, req: u64, f: Fail) -> Result<(), Closed> {
        let msg = Msg::SpawnFailed {
            req,
            code: f.code,
            errno: f.errno,
            msg: f.msg,
        };
        self.chan.send(&msg, None).map_err(|e| Closed::Proto(e.0))
    }
}
