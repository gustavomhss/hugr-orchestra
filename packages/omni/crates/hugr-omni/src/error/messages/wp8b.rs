//! WP8b: texts of a verbatim Windows command line.
//! Part of the shared, append-only error texts (see `messages`).

use std::ffi::OsStr;
use std::path::Path;

use crate::error::Error;

use super::{invalid, nul};

/// WP8b: a verbatim Windows command line (`windowsVerbatimArgs`, Rust `Command::windows_verbatim_args`).
impl Error {
    /// The option on a system that has no command line to write.
    pub(crate) fn verbatim_not_windows() -> Error {
        invalid(
            "windowsVerbatimArgs is set, but this is not Windows: Unix passes a list of arguments, not a command \
             line, so there is nothing to write verbatim. Set it only on Windows, and pass args elsewhere.",
        )
    }

    /// The option together with `args`.
    pub(crate) fn verbatim_with_args(count: usize) -> Error {
        invalid(&format!(
            "windowsVerbatimArgs is set together with {count} args, but the verbatim text is the whole command line \
             after the program. Put every argument into windowsVerbatimArgs, or pass args without it."
        ))
    }

    /// A NUL in the verbatim text.
    pub(crate) fn nul_in_verbatim(at: usize) -> Error {
        nul(
            "windowsVerbatimArgs (not shown: arguments often carry secrets)",
            "windowsVerbatimArgs",
            at,
        )
    }

    /// The program resolved to a batch file, which Windows would run through `cmd.exe` with the text unescaped.
    pub(crate) fn verbatim_batch(command: &OsStr, resolved: &Path) -> Error {
        invalid(&format!(
            "windowsVerbatimArgs is set, but command {command:?} is the batch file \"{}\", which only cmd.exe can \
             run, and the library never adds cmd.exe to a verbatim command line. Name cmd.exe as the command and \
             write the batch file into windowsVerbatimArgs (e.g. /d /s /c \"\"script.cmd\" arg\"), or pass args \
             without windowsVerbatimArgs to get batch-safe quoting.",
            resolved.display()
        ))
    }
}
