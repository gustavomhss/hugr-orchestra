//! Messages between the hugr-omni host and `hugr-omni-supervisor` (`docs/protocol.md`, ADR-0005).
//!
//! Frozen in W00: the message types and the codec, which is the byte layout of `docs/protocol.md`.
//! Strings that come from the OS (argv, env, paths) travel as bytes: raw on Unix, WTF-8 on Windows.

mod codec;

pub use codec::{decode, encode};

/// Protocol version, sent in `Ready`. The host refuses a supervisor with another version.
pub const VERSION: u32 = 1;
/// Largest frame (length prefix excluded). A bigger or malformed frame ends the connection.
pub const MAX_FRAME: usize = 1 << 20;

/// `Ready.info` bit: the host is watched by an event (pidfd on Linux, kqueue on macOS, a process handle on Windows),
/// not by `getppid` polling.
pub const INFO_PIDFD_HOST: u32 = 1;
/// `Ready.info` bit: session members are signalled through pidfds (Linux) instead of `kill`.
pub const INFO_PIDFD_MEMBERS: u32 = 2;

/// What a child gets on stdin or stderr (stdout is always a pipe).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Slot {
    /// stdin only: end of input at once (the null device, opened for reading by the supervisor: Unix
    /// `/dev/null`, Windows `NUL`).
    Null,
    /// A pipe end sent with the frame (Unix SCM_RIGHTS; Windows a handle value in `Spawn::handles`).
    Pipe,
    /// stderr only: the same pipe as stdout.
    Merge,
}

/// Start one tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spawn {
    /// Request id, echoed by the reply.
    pub req: u64,
    /// Absolute path of the file to execute.
    pub program: Vec<u8>,
    /// `argv[0]` as the user wrote it, then the arguments.
    pub argv: Vec<Vec<u8>>,
    /// The complete environment.
    pub env: Vec<(Vec<u8>, Vec<u8>)>,
    /// Absolute working directory.
    pub cwd: Vec<u8>,
    /// Terminal size (cols, rows) for a PTY root; the stdio slots are then ignored.
    pub pty: Option<(u16, u16)>,
    /// stdin: `Null` or `Pipe`.
    pub stdin: Slot,
    /// stderr: `Pipe` or `Merge`.
    pub stderr: Slot,
    /// This tree's grace, used when the host dies.
    pub grace_ms: u32,
    /// Windows: handle values valid in the supervisor for stdin/stdout/stderr (0 = none). Unix: all 0.
    pub handles: [u64; 3],
}

/// How a root process ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Exit {
    /// Exit code (Windows: the full 32-bit value).
    Code(u32),
    /// Unix signal number.
    Signal(i32),
}

/// Why a spawn failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailCode {
    /// The program does not exist.
    NotFound,
    /// The program cannot be executed.
    NotExecutable,
    /// The working directory is unusable.
    BadCwd,
    /// The request is invalid (e.g. a batch-file argument that cannot be passed safely).
    Invalid,
    /// Any other OS failure.
    Io,
}

/// Result of a request that has no data reply.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ack {
    /// Done.
    Ok,
    /// Unknown or released tree id.
    Unknown,
    /// The operation failed (e.g. an incomplete process inventory).
    Error,
    /// The terminal is closed (resize after root exit).
    Closed,
}

/// One live process of a tree (reply to `List`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcEntry {
    /// Process id.
    pub pid: u32,
    /// Parent pid when the parent is in the same list.
    pub ppid: Option<u32>,
    /// Executable file name without directory, converted lossily to UTF-8 on every OS.
    pub name: Option<String>,
}

/// Every message. Requests carry `req`, echoed by their reply; tree ids are unique for the life of
/// one supervisor (the host adds the supervisor generation).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Msg {
    /// host → supervisor: start a tree. Reply: `Spawned` or `SpawnFailed`.
    Spawn(Spawn),
    /// host → supervisor: a held Unix PTY root may exec (the host reader runs). Reply: `Ack`
    /// (`Ok` once exec succeeded) or `SpawnFailed`.
    Go {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
    },
    /// host → supervisor: end the whole tree with one deadline (`grace_ms` 0 = forced now).
    /// Reply: `Stopped`, only once the tree is gone.
    Stop {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
        /// Grace before forced termination.
        grace_ms: u32,
    },
    /// host → supervisor: resize the terminal. Reply: `Ack`.
    Resize {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
        /// Columns.
        cols: u16,
        /// Rows.
        rows: u16,
    },
    /// host → supervisor: list the live processes `Stop` would reach. Reply: `Processes` or `Ack`.
    List {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
    },
    /// host → supervisor: the host dropped its handle; cleanup duty stays. Reply: `Ack`.
    Release {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
    },
    /// supervisor → host, once, first: ready to serve.
    Ready {
        /// `VERSION` of the supervisor.
        version: u32,
        /// Supervisor pid.
        pid: u32,
        /// `INFO_*` bits.
        info: u32,
    },
    /// supervisor → host: the tree started.
    Spawned {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
        /// Root pid.
        pid: u32,
        /// Terminal ends. Windows: [output read, input write] handle values in the supervisor. Unix: [1, 0]
        /// when the master travels with this frame, else [0, 0].
        pty_ends: [u64; 2],
    },
    /// supervisor → host: the tree did not start; nothing is left running.
    SpawnFailed {
        /// Request id.
        req: u64,
        /// Why.
        code: FailCode,
        /// OS error number (0 if none).
        errno: i32,
        /// Detail for the error message.
        msg: String,
    },
    /// supervisor → host, unsolicited: the root exited (descendants may live on).
    Exited {
        /// Tree id.
        id: u64,
        /// How it ended.
        exit: Exit,
    },
    /// supervisor → host: the tree is gone.
    Stopped {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
    },
    /// supervisor → host: reply to `List` (empty once the tree is gone).
    Processes {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
        /// The live processes, in no particular order.
        list: Vec<ProcEntry>,
    },
    /// supervisor → host: reply without data.
    Ack {
        /// Request id.
        req: u64,
        /// Tree id.
        id: u64,
        /// Result.
        result: Ack,
    },
}

/// A frame that cannot be encoded or decoded. The receiver treats it like the peer's death.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProtoError(pub String);

impl std::fmt::Display for ProtoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "protocol error: {}", self.0)
    }
}

impl std::error::Error for ProtoError {}
