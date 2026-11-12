//! The life of a child: spawn, `wait`, `stop`, `processes`, the `Exit` and its `reason`, timeout and
//! cancellation, and `run()` (W07: `mod.rs`, `child` and any new file; W09: `deadline`, `run`).
//!
//! SEAM (frozen in W00): `Child`, `PipeChild`, `PtyChild` and their public methods, `Options`, `spawn_pipe`,
//! `spawn_pty` and `run`. Bodies and private fields belong to the owners above.

mod child;
mod deadline;
mod exit;
mod life;
mod memory;
mod owned;
mod run;
#[cfg(test)]
mod tests;

use tokio_util::sync::CancellationToken;

pub use child::{Child, PipeChild, PtyChild};
pub(crate) use child::{spawn_pipe, spawn_pty};
pub use owned::RunHandle;
pub(crate) use run::run_owned;

/// Runs to completion without binding custody (contract §6).
pub(crate) async fn run(
    req: &crate::spawn::Request,
    opts: &Options,
) -> Result<crate::types::RunOutput, crate::error::Error> {
    run_owned(req, opts, |_| {}).await
}

/// Default `max_output_bytes` per stream (contract §6).
pub(crate) const DEFAULT_MAX_OUTPUT: usize = 16 << 20;

/// What `spawn::prepare` does not need (everything validated, incl. `timeout`, is in `spawn::Request`).
#[derive(Debug, Clone)]
pub(crate) struct Options {
    pub cancel: Option<CancellationToken>,
    pub text: bool,
    pub input: Option<Vec<u8>>,
    pub max_output_bytes: usize,
    /// `spawn()` with pipes only (WP-H): an attached consumer that falls behind holds the child back instead of
    /// losing output.
    pub backpressure: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            cancel: None,
            text: true,
            input: None,
            max_output_bytes: DEFAULT_MAX_OUTPUT,
            backpressure: false,
        }
    }
}
