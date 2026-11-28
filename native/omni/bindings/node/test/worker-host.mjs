// The host of the H1 test (WP-H): run as a subprocess by `hardening.mjs`, never by hand, so that a crash of the runtime
// (Bun used to abort with rc 134 here) is the test's observation, not the end of the suite. The main thread loads the
// library and runs a command too (both environments then hold the addon), starts a Worker that loads it again and
// starts a tree (`live`), terminates the Worker, and asks the OS, while this host still runs (its own end would stop the
// tree anyway), whether the tree is gone: it prints `HOST-TERMINATED <pids>` and `HOST-STATES <state per pid>`, and
// returns. The host must then end by itself with exit 0.
//
//   <runtime> worker-host.mjs <live|idle|pending-run>

import { Worker } from "node:worker_threads";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { loggedTree } from "./pidlog.mjs";
import { life, tmp } from "./runner/os.mjs";
import { binaries, loadApi } from "./support.mjs";

const live = process.argv[2] === "live";
const { fixture } = binaries();
const { run } = loadApi();
await run(fixture, ["out=from-main"]);
await main();

async function main() {
  if (process.argv[2] === "pending-run") return pendingRun();
  const worker = new Worker(new URL("./worker.mjs", import.meta.url), { workerData: { fixture, live } });
  const report = await new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
  });
  if (report.ran !== "from-worker") throw new Error(`the worker's run() said ${JSON.stringify(report.ran)}`);
  await worker.terminate();
  const states = await Promise.all(report.pids.map(async (pid) => (await life(pid)).state));
  process.stdout.write(`HOST-TERMINATED ${report.pids.length > 0 ? report.pids.join(" ") : "none"}\nHOST-STATES ${states.join(" ") || "none"}\n`);
}

async function pendingRun() {
  const directory = tmp("worker-pending-run");
  const controller = new AbortController();
  const control = { pending: true, pids: [] };
  const owner = { worker: undefined, terminated: false };
  const mainRun = run(fixture, [`pidlog=${join(directory, "main.pids")}`, "tree=1", "ready", "hang"], { signal: controller.signal }).then(
    (result) => { control.pending = false; return { result }; },
    (error) => { control.pending = false; return { error }; },
  );
  const states = (pids) => Promise.all(pids.map(async (pid) => (await life(pid)).state));
  const say = (marker, ...values) => process.stdout.write(`HOST-${marker} ${values.join(" ")}\n`);
  try {
    control.pids = await loggedTree(join(directory, "main.pids"));
    owner.worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: { fixture, mode: "pending-run", pidlog: join(directory, "worker.pids") },
    });
    const report = await new Promise((resolve, reject) => {
      owner.worker.once("message", resolve);
      owner.worker.once("error", reject);
    });
    if (report.ran !== "from-worker" || report.pending !== true) throw new Error(`worker was not running: ${JSON.stringify(report)}`);
    const [workerBefore, mainBefore] = await Promise.all([states(report.pids), states(control.pids)]);
    say("RUN-PENDING", ...report.pids);
    say("MAIN-PENDING", ...control.pids);
    say("WORKER-BEFORE", ...workerBefore);
    say("MAIN-BEFORE", ...mainBefore);
    const started = performance.now();
    await owner.worker.terminate();
    owner.terminated = true;
    const elapsed = performance.now() - started;
    const [workerAfter, mainAfter] = await Promise.all([states(report.pids), states(control.pids)]);
    // These observations precede the main control's abort and this host's exit.
    say("TERMINATED", ...report.pids);
    say("STATES", ...workerAfter);
    say("MAIN-STATES", ...mainAfter);
    say("PENDING", report.pending, control.pending);
    say("WORKER-TERMINATE-MS", Math.ceil(elapsed));
  } finally {
    controller.abort();
    try {
      const outcome = await mainRun;
      if (owner.worker && !owner.terminated) await owner.worker.terminate();
      if (outcome.error?.code !== "ABORTED") throw new Error(`main run did not observe its own cleanup abort: ${JSON.stringify(outcome)}`);
      say("MAIN-CLEANUP", ...(await states(control.pids)));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
