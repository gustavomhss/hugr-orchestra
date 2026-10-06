// The host of the H1 test (WP-H): run as a subprocess by `hardening.mjs`, never by hand, so that a crash of the runtime
// (Bun used to abort with rc 134 here) is the test's observation, not the end of the suite. The main thread loads the
// library and runs a command too (both environments then hold the addon), starts a Worker that loads it again and
// starts a tree (`live`), terminates the Worker, and asks the OS, while this host still runs (its own end would stop the
// tree anyway), whether the tree is gone: it prints `HOST-TERMINATED <pids>` and `HOST-STATES <state per pid>`, and
// returns. The host must then end by itself with exit 0.
//
//   <runtime> worker-host.mjs <live|idle>

import { Worker } from "node:worker_threads";
import { life } from "./runner/os.mjs";
import { binaries, loadApi } from "./support.mjs";

const live = process.argv[2] === "live";
const { fixture } = binaries();
const { run } = loadApi();
await run(fixture, ["out=from-main"]);
const worker = new Worker(new URL("./worker.mjs", import.meta.url), { workerData: { fixture, live } });
const report = await new Promise((resolve, reject) => {
  worker.once("message", resolve);
  worker.once("error", reject);
});
if (report.ran !== "from-worker") throw new Error(`the worker's run() said ${JSON.stringify(report.ran)}`);
await worker.terminate();
const states = await Promise.all(report.pids.map(async (pid) => (await life(pid)).state));
process.stdout.write(`HOST-TERMINATED ${report.pids.length > 0 ? report.pids.join(" ") : "none"}\nHOST-STATES ${states.join(" ") || "none"}\n`);
