//! QA-A, real test suites (pinned, offline): `cargo test` of semver and `npm test` of commander (jest with its
//! workers, then tsd and tsc), each run to the end and cut by a timeout midway. QA-B, a dev server: Vite through
//! `npm run dev`, up until it serves, then stopped.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use super::arm::{self, Arm};
use super::{Outcome, Runner, Task};
use crate::setup::Mode;

/// A whole suite: far above its usual run (< 60 s).
const SUITE: Duration = Duration::from_secs(180);
/// Bound beyond a task's own timeout before it counts as hung (K2): its grace plus room for a loaded machine.
const SLACK: Duration = Duration::from_secs(10);

pub async fn tests(runner: &mut Runner) -> Result<(), String> {
    let suites: [(&str, &str, &[&str], Duration, &str); 2] = [
        (
            "cargo-test",
            "cargo",
            &["test", "--offline", "--locked", "-q"],
            Duration::from_millis(500),
            "test result: ok",
        ),
        ("npm-test", "npm", &["test"], Duration::from_millis(3000), "Tests:"),
    ];
    // --quick runs the whole suites through omni only (they take most of its time); --full through both arms.
    let both = runner.arm == Arm::Omni || runner.setup.mode == Mode::Full;
    for _ in 0..runner.setup.mode.reps() {
        for (name, program, args, cut, passed) in suites {
            let dir = runner
                .setup
                .cache
                .join(if program == "cargo" { "semver" } else { "commander" });
            let runs = [(name.to_owned(), SUITE), (format!("{name}-cut"), cut)];
            for (task, timeout) in runs.into_iter().filter(|(_, t)| both || *t != SUITE) {
                let ctx = runner.ctx();
                let mut spec = ctx.spec(program, args);
                spec.cwd = Some(dir.clone());
                spec.timeout = Some(timeout);
                let arm = runner.arm;
                let whole = timeout == SUITE;
                let body = Box::pin({
                    let ctx = ctx.clone();
                    let task = task.clone();
                    async move {
                        let ran = arm::run(arm, spec, &ctx).await?;
                        let text = ran.text();
                        // A cut run is judged by K1/K2 only (on a fast machine it can end before its cut).
                        if whole && (!ran.ok() || !text.contains(passed)) {
                            eprintln!("{task} failed; its whole output:\n{text}");
                            return Err(format!(
                                "the suite failed: {:?} {:?}: {}",
                                ran.how,
                                ran.code,
                                tail(&text)
                            ));
                        }
                        Ok(Outcome::default())
                    }
                });
                let bound = timeout + SLACK;
                runner
                    .task(
                        "QA-A",
                        Task {
                            name: task.clone(),
                            ctx,
                            bound,
                            body,
                        },
                    )
                    .await?;
            }
        }
    }
    Ok(())
}

pub async fn dev_server(runner: &mut Runner) -> Result<(), String> {
    let base: u16 = if runner.arm == super::Arm::Omni { 41100 } else { 41300 };
    for round in 0..runner.setup.mode.rounds() {
        let ctx = runner.ctx();
        let port = (base + u16::try_from(round).unwrap_or(0)).to_string();
        let args = [
            "run",
            "dev",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            &port,
            "--strictPort",
        ];
        let mut spec = ctx.spec("npm", &args);
        spec.cwd = Some(runner.setup.cache.join("vite"));
        let grace = Duration::from_secs(2);
        let arm = runner.arm;
        let body = Box::pin({
            let ctx = ctx.clone();
            async move {
                let mut server = arm::spawn(arm, spec, &ctx)?;
                server.expect("ready in", Duration::from_secs(60)).await?;
                let got = tokio::task::spawn_blocking(move || get(&port, "/@vite/client"))
                    .await
                    .map_err(|e| e.to_string())??;
                if !got.starts_with("HTTP/1.1 200") {
                    return Err(format!("the dev server answered {:?}", tail(&got)));
                }
                let took = server.stop(grace).await?;
                Ok(Outcome {
                    stop: Some((took, grace)),
                    keep: Some(server),
                    ..Outcome::default()
                })
            }
        });
        let bound = Duration::from_secs(60) + grace + SLACK;
        runner
            .task(
                "QA-B",
                Task {
                    name: format!("vite-{round}"),
                    ctx,
                    bound,
                    body,
                },
            )
            .await?;
    }
    Ok(())
}

/// A plain HTTP/1.1 GET on 127.0.0.1 (the response head and as much body as arrives before the server closes).
fn get(port: &str, path: &str) -> Result<String, String> {
    let mut conn = TcpStream::connect(format!("127.0.0.1:{port}")).map_err(|e| format!("connect {port}: {e}"))?;
    conn.set_read_timeout(Some(Duration::from_secs(20)))
        .map_err(|e| e.to_string())?;
    write!(
        conn,
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    )
    .map_err(|e| e.to_string())?;
    let mut answer = Vec::new();
    conn.read_to_end(&mut answer).map_err(|e| format!("read {port}: {e}"))?;
    Ok(String::from_utf8_lossy(&answer).into_owned())
}

/// The last lines of `text`, for a failure message.
pub fn tail(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(8)..].join("\n")
}
