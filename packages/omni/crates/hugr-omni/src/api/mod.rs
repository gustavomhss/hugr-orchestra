//! The public surface (`docs/api-contract.md`). Frozen in W00: names, signatures and docs change only by a
//! lead decision recorded in PLAN. Value types live in `types` (the bottom layer); behavior types next to the
//! module that implements them; this module is the table of contents.

mod command;

pub use crate::io::{Lines, Output};
pub use crate::process::{Child, PipeChild, PtyChild};
pub use crate::types::{Chunk, Data, DroppedBytes, Exit, Line, ProcessInfo, PtySize, Reason, RunOutput, Stdin, Stream};
pub use command::Command;
pub use tokio_util::sync::CancellationToken;
