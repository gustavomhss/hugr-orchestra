//! Run processes and terminals with identical, tested behavior on Windows, macOS and Linux.
//!
//! Every child is created and contained by a small supervisor process (ADR-0005), so stopping a child
//! ends its **whole tree**, and output is always drained so a child never blocks on it. The promises
//! are listed in `docs/api-contract.md`; their per-OS evidence is in `GUARANTEES.md`.
//!
//! ```no_run
//! # async fn demo() -> Result<(), hugr_omni::Error> {
//! use std::time::Duration;
//! use hugr_omni::Command;
//!
//! // The 80% case: run to completion, collect the output.
//! let out = Command::new("git").args(["status", "--short"]).run().await?;
//! println!("{} {}", out.exit.success(), out.stdout);
//!
//! // Streaming: a dev server, stopped together with everything it started.
//! let server = Command::new("npm").args(["run", "dev"]).timeout(Duration::from_secs(60)).spawn()?;
//! let mut lines = server.lines()?;
//! while let Some(line) = lines.next().await {
//!     if line?.text.contains("ready") {
//!         break;
//!     }
//! }
//! server.stop(None).await?;
//! # Ok(())
//! # }
//! ```

// W00 scaffold: seams are declared before their callers exist. The lead removes this when B2 lands.
#![allow(dead_code)]

mod api;
#[doc(hidden)]
pub mod binding;
mod client;
mod error;
mod io;
mod process;
mod pty;
mod spawn;
mod types;

pub use api::*;
pub use error::{Error, ErrorCode};
