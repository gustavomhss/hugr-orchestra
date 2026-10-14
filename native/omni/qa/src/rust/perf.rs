//! K4, spawn overhead: a trivial child (`omni-fixture exit=0`) through each arm, interleaved, measured from the call
//! to the pid and to the exit seen. K6, the soak: 1000 omni tasks (run, spawn + stop of a tree, run in a terminal),
//! then the host's and the supervisor's descriptors and memory compared with their values after a warm-up.

use std::path::Path;
use std::time::{Duration, Instant};

use super::arm::{self, Arm};
use super::ask::Oracle;
use super::{Ctx, Runner, hung, millis, own_bound};
use crate::oracle::HostUsage;
use crate::record::Record;
use crate::setup::{K4_WARM, SOAK, SOAK_WARM};

pub async fn spawn_overhead(runner: &Runner) -> Result<(), String> {
    let fixture = runner.setup.fixture.clone();
    let n = runner.setup.mode.samples();
    let handle = tokio::runtime::Handle::current();
    let (tx, rx) = tokio::sync::oneshot::channel();
    // Timed on a thread of its own, outside the runtime's workers: std's calls block, omni's are driven to the end.
    std::thread::spawn(move || {
        let _ = tx.send(measure(&handle, &fixture, n));
    });
    let bound = own_bound();
    let [omni, std] = match tokio::time::timeout(bound, rx).await {
        Ok(measured) => measured.map_err(|e| e.to_string())??,
        Err(_) => {
            hung("K4", "spawn-exit", bound).emit();
            return Ok(());
        }
    };
    for (arm, (mut pid, mut rt)) in [(Arm::Omni, omni), (Arm::Std, std)] {
        Record {
            kind: "k4".into(),
            workload: "K4".into(),
            name: "spawn-exit".into(),
            arm: arm.name().into(),
            pid_p50_us: Some(p50(&mut pid)),
            rt_p50_us: Some(p50(&mut rt)),
            samples: Some(n),
            ..Record::default()
        }
        .emit();
    }
    Ok(())
}

type Samples = (Vec<f64>, Vec<f64>);

fn measure(rt: &tokio::runtime::Handle, fixture: &Path, n: u32) -> Result<[Samples; 2], String> {
    let (mut omni, mut std) = (Samples::default(), Samples::default());
    for i in 0..K4_WARM + n {
        let order = if i % 2 == 0 {
            [Arm::Omni, Arm::Std]
        } else {
            [Arm::Std, Arm::Omni]
        };
        for arm in order {
            let (pid, exit) = match arm {
                Arm::Omni => rt.block_on(omni_once(fixture))?,
                Arm::Std => std_once(fixture)?,
            };
            let into = if arm == Arm::Omni { &mut omni } else { &mut std };
            if i >= K4_WARM {
                into.0.push(pid.as_secs_f64() * 1e6);
                into.1.push(exit.as_secs_f64() * 1e6);
            }
        }
    }
    Ok([omni, std])
}

async fn omni_once(fixture: &Path) -> Result<(Duration, Duration), String> {
    let t0 = Instant::now();
    let child = hugr_omni::Command::new(fixture)
        .arg("exit=0")
        .spawn()
        .map_err(|e| e.to_string())?;
    let pid = t0.elapsed();
    child.wait().await.map_err(|e| e.to_string())?;
    Ok((pid, t0.elapsed()))
}

/// std with its pipes, as omni has them (stdout and stderr captured, stdin at its end).
fn std_once(fixture: &Path) -> Result<(Duration, Duration), String> {
    use std::process::Stdio;
    let t0 = Instant::now();
    let mut child = std::process::Command::new(fixture)
        .arg("exit=0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let pid = t0.elapsed();
    child.wait().map_err(|e| e.to_string())?;
    Ok((pid, t0.elapsed()))
}

fn p50(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    values.get(values.len() / 2).copied().unwrap_or(f64::NAN)
}

pub async fn soak(runner: &mut Runner) -> Result<(), String> {
    if runner.arm != Arm::Omni {
        return Err("K6 measures the library: omni only".into());
    }
    let ctx = runner.ctx();
    // Room is kept for the K1 check after the soak.
    let bound = own_bound().saturating_sub(Duration::from_secs(20));
    let soaked = tokio::time::timeout(bound, soak_tasks(&ctx, &runner.oracle)).await;
    let found = runner.oracle.check(&ctx.probe(), true, ctx.since).await;
    let mut record = match soaked {
        Ok(Ok((before, after, took))) => Record {
            kind: "k6".into(),
            workload: "K6".into(),
            name: "soak".into(),
            arm: Arm::Omni.name().into(),
            ms: millis(took),
            samples: Some(SOAK),
            before: Some(before),
            after: Some(after),
            ..Record::default()
        },
        Ok(Err(Soak::Failed(e))) => return Err(e),
        Ok(Err(Soak::Hung(i))) => hung("K6", &format!("soak-task-{i}"), ONE),
        Err(_) => hung("K6", "soak", bound),
    };
    match found {
        Ok(found) => {
            record.orphans = u32::try_from(found.proven.len() + found.batch.len()).unwrap_or(u32::MAX);
            record.incomplete = u32::try_from(found.incomplete.len()).unwrap_or(u32::MAX);
        }
        Err(e) => {
            record.unobserved = true;
            record.fail = Some(format!("K1 not observed: {e}"));
        }
    }
    record.emit();
    Ok(())
}

/// One soak task's own bound (each takes milliseconds).
const ONE: Duration = Duration::from_secs(10);

enum Soak {
    Failed(String),
    Hung(u32),
}

/// The warm-up, the figures, the soak, the figures again: `(before, after, how long the soak took)`.
async fn soak_tasks(ctx: &Ctx, oracle: &Oracle) -> Result<(HostUsage, HostUsage, Duration), Soak> {
    let one = |i: u32| async move {
        match tokio::time::timeout(ONE, one(i, ctx)).await {
            Ok(done) => done.map_err(|e| Soak::Failed(format!("soak task {i}: {e}"))),
            Err(_) => Err(Soak::Hung(i)),
        }
    };
    for i in 0..SOAK_WARM {
        one(i).await?;
    }
    let before = oracle.usage().await.map_err(Soak::Failed)?;
    let t0 = Instant::now();
    for i in 0..SOAK {
        one(i).await?;
    }
    let took = t0.elapsed();
    // Pumps and replies of the last tasks may still be closing: give the counts up to 3 s to come back.
    let settle = Instant::now() + Duration::from_secs(3);
    let after = loop {
        let now = oracle.usage().await.map_err(Soak::Failed)?;
        let back = now.host.fds <= before.host.fds
            && now
                .supervisor
                .zip(before.supervisor)
                .is_none_or(|(n, b)| n.fds <= b.fds);
        if back || Instant::now() >= settle {
            break now;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    };
    Ok((before, after, took))
}
/// Soak task `i`: a run, a tree spawned and stopped, or a run in a terminal, in turn.
async fn one(i: u32, ctx: &Ctx) -> Result<(), String> {
    match i % 3 {
        0 => {
            let ran = arm::run(Arm::Omni, ctx.fixture(&["out=x", "exit=0"]), ctx).await?;
            check(ran.ok() && ran.out == b"x", &ran)
        }
        1 => {
            let mut proc = arm::spawn(Arm::Omni, ctx.fixture(&["tree=1", "hang"]), ctx)?;
            proc.expect("PID 1 ", Duration::from_secs(10)).await?;
            proc.stop(Duration::from_millis(100)).await.map(drop)
        }
        _ => {
            let mut spec = ctx.fixture(&["out=x", "exit=0"]);
            spec.pty = true;
            let ran = arm::run(Arm::Omni, spec, ctx).await?;
            check(ran.ok() && ran.out.contains(&b'x'), &ran)
        }
    }
}

fn check(ok: bool, ran: &arm::Ran) -> Result<(), String> {
    if ok {
        Ok(())
    } else {
        Err(format!("unexpected result: {ran:?}"))
    }
}
