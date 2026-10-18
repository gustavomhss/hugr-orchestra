//! The memory cap of a tree (`max_rss_bytes`): while the tree lives, its resident memory is sampled every
//! `PERIOD`, and above the cap the whole tree is killed with the cause `MemoryExceeded`, apart from `Timeout` and
//! the root's own `Exit`. Like the deadline, it is armed for every child (`spawn()` and `run()` alike), never blocks
//! an executor, and holds nothing once the child is dropped or its tree is gone.

use std::sync::{Arc, Weak};
use std::time::Duration;

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tokio::runtime::Handle;

use super::child::Inner;
use crate::types::Reason;

/// How often the tree's resident memory is read.
const PERIOD: Duration = Duration::from_millis(250);

/// Starts watching a started child; nothing without a cap.
pub(super) fn arm(rt: &Handle, inner: &Arc<Inner>, cap: Option<u64>) {
    if let Some(cap) = cap {
        rt.spawn(watch(Arc::downgrade(inner), cap));
    }
}

/// Holds the child only while it samples, so a dropped child (whose drop kills the tree) ends the watch. It ends
/// too once the tree lists nothing (stopped, or ended on its own) or the supervisor cannot list it.
async fn watch(child: Weak<Inner>, cap: u64) {
    loop {
        tokio::time::sleep(PERIOD).await;
        let Some(inner) = child.upgrade() else {
            return;
        };
        let Ok(members) = inner.life.processes().await else {
            return;
        };
        if members.is_empty() {
            return;
        }
        let pids: Vec<Pid> = members.iter().map(|m| Pid::from_u32(m.pid)).collect();
        // Reading the OS' tables is blocking work: off the runtime's workers.
        let Ok(rss) = tokio::task::spawn_blocking(move || resident(&pids)).await else {
            return;
        };
        if rss > cap {
            // Forced at once (no grace): a tree growing past its cap gets no time to grow further. A failure here
            // (the supervisor is gone) also reaches every waiter of the child on its own.
            let _ = inner.stop_with(Reason::MemoryExceeded, Duration::ZERO).await;
            return;
        }
    }
}

/// The resident bytes of `pids` together; a process that is gone by now counts 0.
fn resident(pids: &[Pid]) -> u64 {
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(pids),
        true,
        ProcessRefreshKind::nothing().with_memory(),
    );
    pids.iter()
        .filter_map(|pid| system.process(*pid))
        .map(sysinfo::Process::memory)
        .sum()
}
