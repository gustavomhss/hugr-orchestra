// The body of the Worker that `worker-host.mjs` starts (H1): it loads the library in its own JS environment, runs a
// command to completion, starts a fixture that hangs (with a descendant, so a tree), and reports the pids. Then it
// waits to be terminated.

import { parentPort, workerData } from "node:worker_threads";
import { untilTree } from "./markers.mjs";
import { loadApi } from "./support.mjs";

const { run, spawn } = loadApi();
const ran = await run(workerData.fixture, ["out=from-worker"]);
if (workerData.live) {
  const child = spawn(workerData.fixture, ["tree=1", "ready", "hang"]);
  const [descendant] = await untilTree(child.lines(), 1);
  parentPort.postMessage({ ran: ran.stdout, pids: [child.pid, descendant] });
} else {
  parentPort.postMessage({ ran: ran.stdout, pids: [] });
}
