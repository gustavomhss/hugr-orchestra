// K4 and K6 for the TS runner, as the Rust runner measures them (qa/src/rust/perf.rs): a trivial child through each
// arm, interleaved, timed to the pid and to the exit; and the 1000-task omni soak, with this host's and its
// supervisor's descriptors and memory before and after. Both within this runner's bound: past it, a K2 record.

import { spawn as cpSpawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { run, runPty, spawn } from "./arm.mjs";
import { emit, hung, oracle, ownBoundMs, setup } from "./runner.mjs";

const omni = createRequire(import.meta.url)(join(setup.root, "bindings/node/index.js"));

/** `promise`, or `null` once `untilMs` (a `Date.now()` instant) has passed. */
function before(promise, untilMs) {
  let timer;
  const late = new Promise((resolve) => (timer = setTimeout(() => resolve(null), Math.max(untilMs - Date.now(), 0))));
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export async function spawnOverhead() {
  const boundMs = ownBoundMs();
  const until = Date.now() + boundMs;
  const samples = { omni: [[], []], std: [[], []] };
  const n = setup.sizes.samples;
  for (let i = 0; i < setup.sizes.k4Warm + n; i++) {
    for (const arm of i % 2 === 0 ? ["omni", "std"] : ["std", "omni"]) {
      const t0 = performance.now();
      let tPid;
      let exited;
      if (arm === "omni") {
        const child = omni.spawn(setup.fixture, ["exit=0"]);
        tPid = performance.now();
        exited = child.wait();
      } else {
        const child = cpSpawn(setup.fixture, ["exit=0"], { stdio: ["ignore", "pipe", "pipe"] });
        tPid = performance.now();
        exited = new Promise((resolve, reject) => child.on("exit", resolve).on("error", reject));
      }
      if ((await before(exited.then(() => true), until)) === null) {
        emit(hung("K4", "spawn-exit", boundMs));
        return;
      }
      const tExit = performance.now();
      if (i >= setup.sizes.k4Warm) {
        samples[arm][0].push((tPid - t0) * 1000);
        samples[arm][1].push((tExit - t0) * 1000);
      }
    }
  }
  const p50 = (v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
  for (const arm of ["omni", "std"]) {
    const [pid, rt] = samples[arm];
    emit({ kind: "k4", workload: "K4", name: "spawn-exit", arm, pid_p50_us: p50(pid), rt_p50_us: p50(rt), samples: n });
  }
}

/** One soak task's own bound (each takes milliseconds). */
const ONE_MS = 10_000;

export async function soak(runner) {
  if (runner.arm !== "omni") throw new Error("K6 measures the library: omni only");
  const ctx = runner.ctx();
  // Room is kept for the K1 check after the soak.
  const boundMs = ownBoundMs() - 20_000;
  const until = Date.now() + boundMs;
  let record;
  const each = async (i) => {
    const done = await before(one(i, ctx).then(() => true), Math.min(Date.now() + ONE_MS, until));
    if (done === null) record ??= hung("K6", `soak-task-${i}`, ONE_MS);
    return done !== null;
  };
  let before0;
  let after;
  let ms;
  soaking: {
    for (let i = 0; i < setup.sizes.soakWarm; i++) if (!(await each(i))) break soaking;
    before0 = await oracle.usage();
    const t0 = performance.now();
    for (let i = 0; i < setup.sizes.soak; i++) if (!(await each(i))) break soaking;
    ms = Math.round(performance.now() - t0);
    // Pumps and replies of the last tasks may still be closing: give the counts up to 3 s to come back.
    const settle = Date.now() + 3000;
    const back = (now) =>
      now.host.fds <= before0.host.fds && (!now.supervisor || !before0.supervisor || now.supervisor.fds <= before0.supervisor.fds);
    after = await oracle.usage();
    while (!back(after) && Date.now() < settle) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      after = await oracle.usage();
    }
    record = { kind: "k6", workload: "K6", name: "soak", arm: "omni", ms, orphans: 0, incomplete: 0, lost: 0, samples: setup.sizes.soak, before: before0, after };
  }
  try {
    const found = await oracle.check(ctx.probe(), true, ctx.since);
    record.orphans = found.proven.length + found.batch.length;
    record.incomplete = found.incomplete.length;
  } catch (e) {
    record.unobserved = true;
    record.fail = `K1 not observed: ${e.message}`;
  }
  emit(record);
}

/** Soak task `i`: a run, a tree spawned and stopped, or a run in a terminal, in turn. */
async function one(i, ctx) {
  if (i % 3 === 0) {
    const r = await run("omni", ctx.fixture(["out=x", "exit=0"]), ctx);
    if (r.how !== "exit" || r.code !== 0 || r.out.toString() !== "x") throw new Error(`unexpected result ${JSON.stringify(r)}`);
  } else if (i % 3 === 1) {
    const proc = spawn("omni", ctx.fixture(["tree=1", "hang"]), ctx);
    await proc.expect("PID 1 ", 10_000);
    await proc.stop(100);
  } else {
    const r = await runPty(ctx.fixture(["out=x", "exit=0"]));
    if (r.how !== "exit" || r.code !== 0 || !r.out.toString().includes("x")) throw new Error(`unexpected result ${JSON.stringify(r)}`);
  }
}
