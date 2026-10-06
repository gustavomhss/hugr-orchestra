//! The two arms behind one surface: `run` to completion, or `spawn` and drive a `Proc` (expect output, write,
//! stop, wait). `omni` is `hugr_omni`; `std` is `std::process` as a caller writes it (`stdlib.rs`).

use std::ops::Deref;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use hugr_omni::{
    CancellationToken, Child, Command, Data, ErrorCode, Output, PipeChild, PtyChild, PtySize, Reason, Stdin,
};

use super::Ctx;
use super::stdlib::{self, StdProc};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Arm {
    Omni,
    Std,
}

impl Arm {
    pub fn parse(name: &str) -> Option<Arm> {
        match name {
            "omni" => Some(Arm::Omni),
            "std" => Some(Arm::Std),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Arm::Omni => "omni",
            Arm::Std => "std",
        }
    }
}

/// What to start, and how (the subset of the contract's options the workloads use).
#[derive(Debug, Clone)]
pub struct Spec {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub env: Vec<(String, String)>,
    pub timeout: Option<Duration>,
    pub grace: Duration,
    pub input: Option<Vec<u8>>,
    /// Cancel this long after the start (omni: the cancellation token; std: kill the child).
    pub cancel_after: Option<Duration>,
    pub stdin_pipe: bool,
    pub max_output: Option<usize>,
    /// omni `run()` only: inside a terminal (80 x 24).
    pub pty: bool,
}

impl Default for Spec {
    fn default() -> Spec {
        Spec {
            program: String::new(),
            args: Vec::new(),
            cwd: None,
            env: Vec::new(),
            timeout: None,
            grace: Duration::from_secs(2),
            input: None,
            cancel_after: None,
            stdin_pipe: false,
            max_output: None,
            pty: false,
        }
    }
}

/// How a run ended.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum How {
    Exit,
    Signal,
    Timeout,
    Aborted,
    Killed,
    /// omni only: over `max_output` (`OUTPUT_LIMIT`).
    Limit,
}

#[derive(Debug)]
pub struct Ran {
    pub how: How,
    pub code: Option<i64>,
    pub out: Vec<u8>,
    pub err: Vec<u8>,
}

impl Ran {
    /// stdout and stderr, as text, for checks.
    pub fn text(&self) -> String {
        format!(
            "{}{}",
            String::from_utf8_lossy(&self.out),
            String::from_utf8_lossy(&self.err)
        )
    }

    pub fn ok(&self) -> bool {
        self.how == How::Exit && self.code == Some(0)
    }
}

pub async fn run(arm: Arm, spec: Spec, ctx: &Ctx) -> Result<Ran, String> {
    match arm {
        Arm::Omni => omni_run(spec).await,
        Arm::Std => stdlib::run(spec, ctx).await,
    }
}

pub fn spawn(arm: Arm, spec: Spec, ctx: &Ctx) -> Result<Proc, String> {
    let from = crate::oracle::filetime_now();
    let proc = match arm {
        Arm::Omni => {
            let child = command(&spec).spawn().map_err(|e| e.to_string())?;
            let out = child.output().map_err(|e| e.to_string())?;
            Proc::Omni(OmniProc::new(OmniChild::Pipe(child), out))
        }
        Arm::Std => Proc::Std(stdlib::spawn(&spec)?),
    };
    ctx.spawned(from, proc.pid());
    Ok(proc)
}

/// omni only: inside a 100 x 30 terminal. `None` when the program is not installed.
pub fn spawn_pty(spec: Spec, ctx: &Ctx) -> Result<Option<Proc>, String> {
    let from = crate::oracle::filetime_now();
    let child = match command(&spec).pty(PtySize { cols: 100, rows: 30 }).spawn_pty() {
        Ok(child) => child,
        Err(e) if e.code() == ErrorCode::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let out = child.output().map_err(|e| e.to_string())?;
    ctx.spawned(from, child.pid());
    Ok(Some(Proc::Omni(OmniProc::new(OmniChild::Pty(child), out))))
}

fn command(spec: &Spec) -> Command {
    let mut cmd = Command::new(&spec.program);
    cmd.args(&spec.args).grace(spec.grace);
    for (k, v) in &spec.env {
        cmd.env(k, v);
    }
    if let Some(dir) = &spec.cwd {
        cmd.cwd(dir);
    }
    if let Some(t) = spec.timeout {
        cmd.timeout(t);
    }
    if spec.stdin_pipe {
        cmd.stdin(Stdin::Pipe);
    }
    cmd
}

async fn omni_run(spec: Spec) -> Result<Ran, String> {
    let mut cmd = command(&spec);
    cmd.text(false);
    if let Some(input) = &spec.input {
        cmd.input(input.clone());
    }
    if let Some(max) = spec.max_output {
        cmd.max_output_bytes(max);
    }
    if spec.pty {
        cmd.pty(PtySize::default());
    }
    let token = CancellationToken::new();
    cmd.cancel_on(token.clone());
    if let Some(after) = spec.cancel_after {
        tokio::spawn(async move {
            tokio::time::sleep(after).await;
            token.cancel();
        });
    }
    let (how, out) = match cmd.run().await {
        Ok(out) => (how_of(out.exit.reason), out),
        Err(e) => match (e.code(), e.result()) {
            (ErrorCode::Aborted, Some(r)) => (How::Aborted, r.clone()),
            (ErrorCode::OutputLimit, Some(r)) => (How::Limit, r.clone()),
            _ => return Err(e.to_string()),
        },
    };
    Ok(Ran {
        how,
        code: out.exit.code.map(i64::from),
        out: bytes(out.stdout),
        err: bytes(out.stderr),
    })
}

fn how_of(reason: Reason) -> How {
    match reason {
        Reason::Exit => How::Exit,
        Reason::Signal => How::Signal,
        Reason::Killed => How::Killed,
        Reason::Timeout => How::Timeout,
        Reason::Aborted => How::Aborted,
    }
}

fn bytes(data: Data) -> Vec<u8> {
    match data {
        Data::Text(s) => s.into_bytes(),
        Data::Bytes(b) => b,
    }
}

pub enum OmniChild {
    Pipe(PipeChild),
    Pty(PtyChild),
}

impl Deref for OmniChild {
    type Target = Child;
    fn deref(&self) -> &Child {
        match self {
            OmniChild::Pipe(c) => c,
            OmniChild::Pty(c) => c,
        }
    }
}

pub struct OmniProc {
    child: OmniChild,
    out: Output,
    seen: Seen,
}

impl OmniProc {
    fn new(child: OmniChild, out: Output) -> OmniProc {
        OmniProc {
            child,
            out,
            seen: Seen::default(),
        }
    }

    /// One more chunk into `seen`; `false` at the end of the output.
    async fn more(&mut self, until: Instant) -> Result<bool, String> {
        match tokio::time::timeout_at(until.into(), self.out.next()).await {
            Err(_) => Err("timed out".into()),
            Ok(None) => Ok(false),
            Ok(Some(Err(e))) => Err(e.to_string()),
            Ok(Some(Ok(chunk))) => {
                self.seen.push(&chunk.data.to_string());
                Ok(true)
            }
        }
    }
}

/// A started process of either arm.
pub enum Proc {
    Omni(OmniProc),
    Std(StdProc),
}

impl Proc {
    pub fn pid(&self) -> u32 {
        match self {
            Proc::Omni(p) => p.child.pid(),
            Proc::Std(p) => p.pid(),
        }
    }

    /// Reads until the output (terminal escapes removed) shows `needle` after the last match; fails after `within`.
    pub async fn expect(&mut self, needle: &str, within: Duration) -> Result<(), String> {
        let until = Instant::now() + within;
        loop {
            if self.seen().take(needle) {
                return Ok(());
            }
            let more = match self {
                Proc::Omni(p) => p.more(until).await,
                Proc::Std(p) => p.more(until).await,
            };
            match more {
                Ok(true) => {}
                Ok(false) => return Err(format!("the output ended before {needle:?}: {:?}", self.seen().tail())),
                Err(e) => {
                    return Err(format!(
                        "{e} waiting for {needle:?}; last output {:?}",
                        self.seen().tail()
                    ));
                }
            }
        }
    }

    /// Reads to the end of the output and returns everything not matched yet.
    pub async fn rest(&mut self, within: Duration) -> Result<String, String> {
        let until = Instant::now() + within;
        loop {
            let more = match self {
                Proc::Omni(p) => p.more(until).await,
                Proc::Std(p) => p.more(until).await,
            };
            if !more? {
                return Ok(self.seen().rest());
            }
        }
    }

    pub async fn write(&mut self, data: &str) -> Result<(), String> {
        match self {
            Proc::Omni(p) => p.child.write(data).await.map_err(|e| e.to_string()),
            Proc::Std(p) => p.write(data.as_bytes()),
        }
    }

    /// Ends the tree as each arm can (omni: `stop`; std: graceful where it has one, then kill the root) and returns
    /// how long it took.
    pub async fn stop(&mut self, grace: Duration) -> Result<Duration, String> {
        let t0 = Instant::now();
        match self {
            Proc::Omni(p) => p.child.stop(Some(grace)).await.map(drop).map_err(|e| e.to_string())?,
            Proc::Std(p) => p.stop().await?,
        }
        Ok(t0.elapsed())
    }

    /// The root's exit code (`None`: ended by a signal), within `within`.
    pub async fn wait(&mut self, within: Duration) -> Result<Option<i64>, String> {
        match self {
            Proc::Omni(p) => match tokio::time::timeout(within, p.child.wait()).await {
                Ok(exit) => exit.map(|e| e.code.map(i64::from)).map_err(|e| e.to_string()),
                Err(_) => Err(format!("no exit within {within:?}")),
            },
            Proc::Std(p) => p.wait(within).await,
        }
    }

    fn seen(&mut self) -> &mut Seen {
        match self {
            Proc::Omni(p) => &mut p.seen,
            Proc::Std(p) => &mut p.seen,
        }
    }
}

/// The output read so far, terminal escape sequences removed (also when one is split across chunks), and where the
/// last match ended.
#[derive(Default)]
pub struct Seen {
    text: String,
    at: usize,
    escape: Escape,
}

#[derive(Default, PartialEq)]
enum Escape {
    #[default]
    None,
    Esc,
    Csi,
    Osc,
    OscEsc,
}

impl Seen {
    pub fn push(&mut self, chunk: &str) {
        for c in chunk.chars() {
            self.escape = match (&self.escape, c) {
                (Escape::None, '\u{1b}') => Escape::Esc,
                (Escape::None, c) => {
                    self.text.push(c);
                    Escape::None
                }
                (Escape::Esc, '[') => Escape::Csi,
                (Escape::Esc, ']') => Escape::Osc,
                (Escape::Esc, _) => Escape::None,
                (Escape::Csi, '\u{40}'..='\u{7e}') => Escape::None,
                (Escape::Csi, _) => Escape::Csi,
                (Escape::Osc, '\u{7}') => Escape::None,
                (Escape::Osc, '\u{1b}') => Escape::OscEsc,
                (Escape::Osc, _) => Escape::Osc,
                (Escape::OscEsc, _) => Escape::None,
            };
        }
    }

    fn take(&mut self, needle: &str) -> bool {
        match self.text[self.at..].find(needle) {
            Some(i) => {
                self.at += i + needle.len();
                true
            }
            None => false,
        }
    }

    fn rest(&mut self) -> String {
        let rest = self.text[self.at..].to_owned();
        self.at = self.text.len();
        rest
    }

    fn tail(&self) -> String {
        let text = &self.text[self.at..];
        let start = text.char_indices().rev().nth(200).map_or(0, |(i, _)| i);
        text[start..].to_owned()
    }
}
