//! QA-C: shells and REPLs in a terminal (`qa/workloads/shells.json`): a command, Ctrl-C on a long one, `exit`.
//! omni only: the stdlib has no terminal.

use std::collections::BTreeMap;
use std::time::Duration;

use serde::Deserialize;

use super::arm::{self, Arm};
use super::{Outcome, Runner, Task};

#[derive(Debug, Clone, Deserialize)]
pub struct Shell {
    pub name: String,
    pub os: Vec<String>,
    pub program: String,
    pub args: Vec<String>,
    pub env: BTreeMap<String, String>,
    pub prompt: String,
    pub say: String,
    pub said: String,
    pub long: String,
    pub longing: String,
    pub exit: String,
}

#[derive(Deserialize)]
struct Shells {
    shells: Vec<Shell>,
}

const STEP: Duration = Duration::from_secs(20);
const GRACE: Duration = Duration::from_secs(1);

pub fn load(root: &std::path::Path) -> Result<Vec<Shell>, String> {
    let path = root.join("qa/workloads/shells.json");
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let all: Shells = serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    let os = crate::os_name();
    Ok(all
        .shells
        .into_iter()
        .filter(|s| s.os.iter().any(|o| o == os))
        .collect())
}

pub async fn shells(runner: &mut Runner) -> Result<(), String> {
    if runner.arm != Arm::Omni {
        return Err("QA-C has no std arm: the stdlib has no terminal".into());
    }
    for shell in load(&runner.setup.root)? {
        let ctx = runner.ctx();
        let name = shell.name.clone();
        let body = Box::pin({
            let ctx = ctx.clone();
            async move {
                let args: Vec<&str> = shell.args.iter().map(String::as_str).collect();
                let mut spec = ctx.spec(&shell.program, &args);
                spec.env.extend(shell.env.clone());
                let Some(mut sh) = arm::spawn_pty(spec, &ctx)? else {
                    return Ok(Outcome {
                        skip: Some(format!("{} is not installed", shell.program)),
                        ..Outcome::default()
                    });
                };
                sh.expect(&shell.prompt, STEP).await?;
                sh.write(&shell.say).await?;
                sh.expect(&shell.said, STEP).await?;
                sh.expect(&shell.prompt, STEP).await?;
                let fixture = ctx.setup.fixture.to_string_lossy();
                sh.write(&shell.long.replace("${FIXTURE}", &fixture)).await?;
                sh.expect(&shell.longing, STEP).await?;
                sh.write("\u{3}").await?;
                sh.expect(&shell.prompt, STEP)
                    .await
                    .map_err(|e| format!("Ctrl-C: {e}"))?;
                sh.write(&shell.exit).await?;
                let code = sh.wait(STEP).await?;
                sh.stop(GRACE).await?;
                match code {
                    Some(0) => Ok(Outcome {
                        keep: Some(sh),
                        ..Outcome::default()
                    }),
                    code => Err(format!("{} exited {code:?}", shell.name)),
                }
            }
        });
        let bound = STEP * 8;
        runner.task("QA-C", Task { name, ctx, bound, body }).await?;
    }
    Ok(())
}
