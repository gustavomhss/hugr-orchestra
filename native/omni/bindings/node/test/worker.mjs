// The body of the Worker that `worker-host.mjs` starts (H1): it loads the library in its own JS environment, runs a
// command to completion, starts a fixture that hangs (with a descendant, so a tree), and reports the pids. Then it
// waits to be terminated.

import { parentPort, workerData } from "node:worker_threads";
import { untilTree } from "./markers.mjs";
import { loggedTree } from "./pidlog.mjs";
import { loadApi } from "./support.mjs";

const { run, spawn } = loadApi();
const ran = await run(workerData.fixture, ["out=from-worker"]);
if (workerData.mode === "pending-run") {
  const state = { pending: true };
  // No caller signal or timeout: teardown itself must own this still-pending run.
  // A resistant root and descendant with 30 s grace rule out a token-only teardown passing the host watchdog.
  const running = run(workerData.fixture, [`pidlog=${workerData.pidlog}`, "ignore-term", "tree=1:resist", "ready", "hang"], { graceMs: 30_000 });
  running.then(() => { state.pending = false; }, () => { state.pending = false; });
  const pids = await loggedTree(workerData.pidlog);
  if (!state.pending) throw new Error("the worker run settled before its pending-run report");
  parentPort.postMessage({ ran: ran.stdout, pids, pending: state.pending });
} else if (workerData.live) {
  const child = spawn(workerData.fixture, ["tree=1", "ready", "hang"]);
  const [descendant] = await untilTree(child.lines(), 1);
  parentPort.postMessage({ ran: ran.stdout, pids: [child.pid, descendant] });
} else {
  parentPort.postMessage({ ran: ran.stdout, pids: [] });
}
