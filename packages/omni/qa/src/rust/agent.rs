//! QA-E: an agent's loop of real commands (git, grep, build, test, install) with cancellations at arbitrary moments
//! (`qa/workloads/agent.json`).

use std::path::PathBuf;
use std::time::Duration;

use serde::Deserialize;

use super::arm::{self, Arm, How};
use super::{Outcome, Runner, Task};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Loop {
    concurrency: usize,
    timeout_ms: u64,
    cancel_every: u64,
    cancel_within_ms: u64,
    commands: Vec<Command>,
}

#[derive(Debug, Clone, Deserialize)]
struct Command {
    name: String,
    cwd: String,
    program: String,
    args: Vec<String>,
}

const SLACK: Duration = Duration::from_secs(10);

pub async fn agent_loop(runner: &mut Runner) -> Result<(), String> {
    let path = runner.setup.root.join("qa/workloads/agent.json");
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let plan: Loop = serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    let total = u64::from(runner.setup.mode.commands());
    let timeout = Duration::from_millis(plan.timeout_ms);
    let indexes: Vec<u64> = (0..total).collect();
    for chunk in indexes.chunks(plan.concurrency.max(1)) {
        let mut tasks = Vec::new();
        let mut scratch = Vec::new();
        for &i in chunk {
            let Some(cmd) = usize::try_from(i)
                .ok()
                .and_then(|i| plan.commands.get(i % plan.commands.len()))
            else {
                return Err("agent.json lists no commands".into());
            };
            let ctx = runner.ctx();
            let args: Vec<&str> = cmd.args.iter().map(String::as_str).collect();
            let mut spec = ctx.spec(&cmd.program, &args);
            spec.cwd = Some(if cmd.cwd == "@tmp" {
                let dir = empty_project(&ctx.tag)?;
                scratch.push(dir.clone());
                dir
            } else {
                runner.setup.cache.join(&cmd.cwd)
            });
            spec.timeout = Some(timeout);
            let cancelled = i % plan.cancel_every == plan.cancel_every - 1;
            if cancelled {
                spec.cancel_after = Some(Duration::from_millis(spread(i) % plan.cancel_within_ms));
            }
            let arm = runner.arm;
            let body = Box::pin({
                let ctx = ctx.clone();
                async move {
                    let ran = arm::run(arm, spec, &ctx).await?;
                    match (cancelled, arm) {
                        (false, _) if !ran.ok() => Err(format!(
                            "{:?} {:?}: {}",
                            ran.how,
                            ran.code,
                            super::suites::tail(&ran.text())
                        )),
                        (true, Arm::Omni) if !(ran.ok() || ran.how == How::Aborted) => {
                            Err(format!("cancelled, it ended as {:?} {:?}", ran.how, ran.code))
                        }
                        _ => Ok(Outcome::default()),
                    }
                }
            });
            let name = format!("{}{}", cmd.name, if cancelled { "-cancelled" } else { "" });
            tasks.push(Task {
                name,
                ctx,
                bound: timeout + SLACK,
                body,
            });
        }
        runner.batch("QA-E", tasks).await?;
        for dir in scratch {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
    Ok(())
}

/// A fixed spread of `i`, the same in every runner: `(i * 2654435761) mod 2^32`.
pub fn spread(i: u64) -> u64 {
    i.wrapping_mul(2_654_435_761) % (1 << 32)
}

/// A fresh directory holding an empty npm project.
fn empty_project(tag: &str) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!("omni-qa-{tag}"));
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    std::fs::write(dir.join("package.json"), "{}\n").map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(dir)
}
