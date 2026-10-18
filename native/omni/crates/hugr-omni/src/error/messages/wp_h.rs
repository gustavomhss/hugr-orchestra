//! WP-H: texts of the supervisor a binding configures.
//! Part of the shared, append-only error texts (see `messages`).

use crate::error::Error;

use super::invalid;

/// WP-H: the supervisor a binding configures.
impl Error {
    /// `configure({ supervisor: "" })`.
    pub(crate) fn supervisor_path_empty() -> Error {
        invalid(
            "configure() got an empty supervisor path. Pass the full path of hugr-omni-supervisor, or leave \
             supervisor out to use the one next to the addon.",
        )
    }

    /// A different supervisor after one was started in this process.
    pub(crate) fn supervisor_configured_late(path: &std::path::Path) -> Error {
        invalid(&format!(
            "configure() got the supervisor \"{}\", but this process already started a supervisor with another \
             path, and every child of a process shares one. Call configure() before the first run() or spawn().",
            path.display()
        ))
    }
}
