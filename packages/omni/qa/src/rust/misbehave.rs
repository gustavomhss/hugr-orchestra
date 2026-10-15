//! QA-D, misbehaving programs (the fixture, plus git): one that leaves a process behind holding the output, one that
//! ignores the polite stop, floods of output, `git commit` opening an editor that waits for input, and a prompt.

use std::path::Path;
use std::time::Duration;

use super::arm::{self, How, Spec};
use super::{Body, Ctx, Outcome, Runner, Task, lost};

/// Each run's own timeout: short, the tasks that need it are stuck by design.
const TIMEOUT: Duration = Duration::from_secs(3);
const GRACE: Duration = Duration::from_millis(500);
/// K2 bound beyond the task's own limits.
const SLACK: Duration = Duration::from_secs(10);
/// 32 MiB, over the 16 MiB default `maxOutputBytes`.
const FLOOD: usize = 32 << 20;
const LINES: usize = 100_000;

pub async fn all(runner: &mut Runner) -> Result<(), String> {
    for _ in 0..runner.setup.mode.reps() {
        for name in ["daemon", "ignore-term", "flood", "lines", "editor", "prompt"] {
            let ctx = runner.ctx();
            let arm = runner.arm;
            let body: Body = match name {
                "daemon" => Box::pin(daemon(arm, ctx.clone())),
                "ignore-term" => Box::pin(ignore_term(arm, ctx.clone())),
                "flood" => Box::pin(flood(arm, ctx.clone())),
                "lines" => Box::pin(lines(arm, ctx.clone())),
                "editor" => Box::pin(editor(arm, ctx.clone())),
                _ => Box::pin(prompt(arm, ctx.clone())),
            };
            let bound = TIMEOUT + GRACE + SLACK;
            runner
                .task(
                    "QA-D",
                    Task {
                        name: name.into(),
                        ctx,
                        bound,
                        body,
                    },
                )
                .await?;
        }
        short_leftover(runner).await?;
    }
    Ok(())
}

/// A batch of two: a tree stopped at once whose descendant (`hold`) would outlive a root-only stop by 2 s, next to a
/// task that runs 4 s. The short-lived leftover must be counted when its own task returns, not missed because it is
/// gone by the time the batch ends.
async fn short_leftover(runner: &mut Runner) -> Result<(), String> {
    let arm = runner.arm;
    let (short, long) = (runner.ctx(), runner.ctx());
    let stopped: Body = Box::pin({
        let ctx = short.clone();
        async move {
            let mut proc = arm::spawn(arm, ctx.fixture(&["hold=2000", "ready", "hang"]), &ctx)?;
            proc.expect("READY", Duration::from_secs(10)).await?;
            let took = proc.stop(GRACE).await?;
            Ok(Outcome {
                stop: Some((took, GRACE)),
                keep: Some(proc),
                ..Outcome::default()
            })
        }
    });
    let slow: Body = Box::pin({
        let ctx = long.clone();
        async move {
            let ran = arm::run(arm, ctx.fixture(&["sleep=4000", "exit=0"]), &ctx).await?;
            match ran.ok() {
                true => Ok(Outcome::default()),
                false => Err(format!("ended as {:?} {:?}", ran.how, ran.code)),
            }
        }
    });
    let bound = Duration::from_secs(4) + TIMEOUT + SLACK;
    let tasks = vec![
        Task {
            name: "short-leftover".into(),
            ctx: short,
            bound,
            body: stopped,
        },
        Task {
            name: "beside-a-long-task".into(),
            ctx: long,
            bound,
            body: slow,
        },
    ];
    runner.batch("QA-D", tasks).await
}

/// The root starts a descendant that keeps the output open, then exits: a run must still end, and nothing remain.
async fn daemon(arm: arm::Arm, ctx: Ctx) -> Result<Outcome, String> {
    let mut spec = ctx.fixture(&["out=up\\n", "tree=1", "exit=0"]);
    spec.timeout = Some(TIMEOUT);
    spec.grace = GRACE;
    let ran = arm::run(arm, spec, &ctx).await?;
    omni_ends(arm, ran.how)?;
    Ok(Outcome::default())
}

/// A tree of three that ignores the graceful request: `stop` must still end it, after the grace.
async fn ignore_term(arm: arm::Arm, ctx: Ctx) -> Result<Outcome, String> {
    let mut proc = arm::spawn(arm, ctx.fixture(&["ignore-term", "tree=2:resist", "hang"]), &ctx)?;
    proc.expect("PID 2 ", Duration::from_secs(10)).await?;
    let took = proc.stop(GRACE).await?;
    Ok(Outcome {
        stop: Some((took, GRACE)),
        keep: Some(proc),
        ..Outcome::default()
    })
}

/// 32 MiB on stdout through `run()`: every byte arrives, in order (K5).
async fn flood(arm: arm::Arm, ctx: Ctx) -> Result<Outcome, String> {
    let n = FLOOD.to_string();
    let mut spec = ctx.fixture(&[&format!("bytes=stdout:{n}"), "exit=0"]);
    spec.max_output = Some(2 * FLOOD);
    spec.timeout = Some(Duration::from_secs(60));
    let ran = arm::run(arm, spec, &ctx).await?;
    let want: Vec<u8> = b"abcdefghijklmnopqrstuvwxyz"
        .iter()
        .copied()
        .cycle()
        .take(FLOOD)
        .collect();
    if ran.how != How::Exit {
        return Err(format!("ended as {:?}", ran.how));
    }
    Ok(Outcome {
        lost: lost(&want, &ran.out),
        ..Outcome::default()
    })
}

/// 100 000 lines read as they come from a spawned child (K5).
async fn lines(arm: arm::Arm, ctx: Ctx) -> Result<Outcome, String> {
    let mut proc = arm::spawn(arm, ctx.fixture(&[&format!("lines=stdout:{LINES}"), "exit=0"]), &ctx)?;
    let got = proc.rest(Duration::from_secs(60)).await?;
    let want: String = (1..=LINES).map(|i| format!("line {i}\n")).collect();
    proc.wait(Duration::from_secs(10)).await?;
    Ok(Outcome {
        lost: lost(want.as_bytes(), got.as_bytes()),
        ..Outcome::default()
    })
}

/// `git commit` without `-m` opens the editor, here one that waits for a line of input (`read-line`) — the classic
/// agent hang. The run must end by its timeout at the latest, and leave neither git's shell nor the editor behind.
async fn editor(arm: arm::Arm, ctx: Ctx) -> Result<Outcome, String> {
    let repo = scratch_repo(&ctx)?;
    // The editor goes through git's `sh`: forward slashes keep a Windows path intact there.
    let fixture = ctx.setup.fixture.to_string_lossy().replace('\\', "/");
    let mut spec = Spec {
        cwd: Some(repo.clone()),
        timeout: Some(TIMEOUT),
        grace: GRACE,
        ..ctx.spec("git", &["commit"])
    };
    spec.env
        .push(("GIT_EDITOR".into(), format!("\"{fixture}\" read-line argv")));
    spec.env.extend(git_env(&repo));
    let ran = arm::run(arm, spec, &ctx).await;
    let _ = std::fs::remove_dir_all(&repo);
    omni_ends(arm, ran?.how)?;
    Ok(Outcome::default())
}

/// A program that prints a prompt without a newline and waits for the answer.
async fn prompt(arm: arm::Arm, ctx: Ctx) -> Result<Outcome, String> {
    let mut spec = ctx.fixture(&["prompt=Name? ", "exit=0"]);
    spec.stdin_pipe = true;
    let mut proc = arm::spawn(arm, spec, &ctx)?;
    proc.expect("Name? ", Duration::from_secs(10)).await?;
    proc.write("qa\n").await?;
    proc.expect("GOT qa", Duration::from_secs(10)).await?;
    match proc.wait(Duration::from_secs(10)).await? {
        Some(0) => Ok(Outcome::default()),
        code => Err(format!("the prompt exited {code:?}")),
    }
}

/// omni's run ends with the root's own exit (contract §6: descendants get the grace, then the tree is stopped);
/// the std arm's outcome is whatever std gives, and only measured.
fn omni_ends(arm: arm::Arm, how: How) -> Result<(), String> {
    match (arm, how) {
        (arm::Arm::Omni, how) if how != How::Exit => Err(format!("ended as {how:?}, not by the root's exit")),
        _ => Ok(()),
    }
}

/// A repository with one staged file, configured only by its own files (no user or system git config).
fn scratch_repo(ctx: &Ctx) -> Result<std::path::PathBuf, String> {
    let repo = std::env::temp_dir().join(format!("omni-qa-{}", ctx.tag));
    std::fs::create_dir_all(&repo).map_err(|e| format!("{}: {e}", repo.display()))?;
    std::fs::write(repo.join("a.txt"), "a\n").map_err(|e| e.to_string())?;
    for args in [&["init", "-q"][..], &["add", "a.txt"]] {
        let status = std::process::Command::new("git")
            .args(args)
            .current_dir(&repo)
            .envs(git_env(&repo))
            .status()
            .map_err(|e| format!("git {args:?}: {e}"))?;
        if !status.success() {
            return Err(format!("git {args:?}: {status}"));
        }
    }
    Ok(repo)
}

fn git_env(repo: &Path) -> Vec<(String, String)> {
    let config = repo.join(".git-qa-config");
    let _ = std::fs::write(&config, "[user]\n\tname = qa\n\temail = qa@example.invalid\n");
    vec![
        ("GIT_CONFIG_NOSYSTEM".into(), "1".into()),
        ("GIT_CONFIG_GLOBAL".into(), config.to_string_lossy().into_owned()),
    ]
}
