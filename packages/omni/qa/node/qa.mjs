// The TS runner (Node), `node qa/node/qa.mjs <workload> <omni|std>`: the Rust runner's workloads through the hugr-omni
// package (arm `omni`) or child_process (arm `std`), one JSON record per task on stdout, then {"kind":"end"}. Started by
// qa/run (qa/src/plan.rs); this process is the host K7 watches.

const names = ["QA-A", "QA-B", "QA-C", "QA-D", "QA-E", "K4", "K6"];
const [workload, arm] = process.argv.slice(2);
// Exit 3: an error this runner reports itself (a package that does not load included). Anything else that ends it
// early is a host crash (K7).
if (!names.includes(workload) || !["omni", "std"].includes(arm)) {
  process.stderr.write(`usage: node qa/node/qa.mjs <${names.join("|")}> <omni|std>\n`);
  process.exit(3);
}
try {
  const { emit, Runner } = await import("./runner.mjs");
  const { agentLoop, devServer, misbehave, shells, tests } = await import("./workloads.mjs");
  const { soak, spawnOverhead } = await import("./perf.mjs");
  const table = { "QA-A": tests, "QA-B": devServer, "QA-C": shells, "QA-D": misbehave, "QA-E": agentLoop, K4: spawnOverhead, K6: soak };
  await table[workload](new Runner(arm));
  emit({ kind: "end" });
  // Tasks that hung were abandoned, not awaited: they must not keep this runner up.
  process.stdout.write("", () => process.exit(0));
} catch (e) {
  process.stderr.write(`qa runner ${workload}: ${e?.stack ?? e}\n`);
  process.exit(3);
}
