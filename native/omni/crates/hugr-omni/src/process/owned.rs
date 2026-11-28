//! A binding's non-owning custody of a pending run; the run still owns and drives its child.

use std::sync::{Arc, Weak};
use std::time::Duration;

use super::Child;
use super::child::Inner;
use crate::error::Error;
use crate::types::Reason;

/// A non-owning handle for binding environment teardown. Cloning or dropping it never keeps or stops a child.
#[derive(Clone)]
pub struct RunHandle {
    inner: Weak<Inner>,
}

impl RunHandle {
    pub(super) fn new(child: &Child) -> Self {
        Self {
            inner: Arc::downgrade(&child.inner),
        }
    }

    /// Whether the run's shared state still exists, not proof that any OS process is alive or reaped.
    pub fn is_alive(&self) -> bool {
        self.inner.upgrade().is_some()
    }

    /// Requests the existing forced tree stop without user grace. An already-gone shared state needs no stop.
    pub async fn force_stop(&self) -> Result<(), Error> {
        let Some(inner) = self.inner.upgrade() else {
            return Ok(());
        };
        inner.stop_with(Reason::Killed, Duration::ZERO).await.map(|_| ())
    }
}
