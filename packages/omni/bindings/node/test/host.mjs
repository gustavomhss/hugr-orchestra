// The host of the C-TS-01 lifecycle idioms. `idioms.mjs` runs it as a subprocess under the same runtime (never by hand): it
// starts a fixture tree through the library, prints a `HOST-<marker> <numbers>` line once the tree is up, then does what its
// mode says. It installs no signal handler and no exit hook: how it dies is nobody's business but the library's.
//
// Modes: `end` (the root exits when `release` gets a line; then this script just returns), `exit` (process.exit()) and
// `throw` (an uncaught exception), both once the parent has written a line to this process's stdin, `wait` (idle until the
// parent signals it), `retain` (spawn and never await), `gc` (drop every reference, force a collection), `orphan` (the
// same once the root has exited and its descendant lives on).

import { untilTree } from "./markers.mjs";
import { binaries, loadApi } from "./support.mjs";

const [mode, release] = process.argv.slice(2);
const { fixture } = binaries();
const { spawn } = loadApi();
const say = (marker, ...numbers) => process.stdout.write(`HOST-${marker} ${numbers.join(" ")}\n`);

/** Resolves when the parent writes a line to this process's stdin (or closes it): the parent's say-so, not a delay. */
const goAhead = () =>
  new Promise((resolve) => {
    let seen = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (seen += chunk).includes("\n") && resolve());
    process.stdin.on("end", resolve);
  });

/** Forces full collections, letting finalizers run between them. */
async function collectAll() {
  const collect = globalThis.Bun ? () => globalThis.Bun.gc(true) : globalThis.gc;
  if (!collect) throw new Error("no way to force a garbage collection: run with --expose-gc (node), --v8-flags=--expose-gc (deno) or bun");
  for (let round = 0; round < 10; round++) {
    collect();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const tree = ["ignore-term", "tree=2:resist", "ready"]; // a root and two descendants that all ignore the polite stop
if (mode === "retain") {
  const child = spawn(fixture, [`watch=stdout:1:${release}`, "exit=0"]);
  say("SPAWNED", child.pid); // and nothing else: no await, no timer, no listener
} else if (mode === "gc") {
  const pid = (() => spawn(fixture, ["hang"]).pid)(); // the Child is unreachable from here on
  await collectAll();
  say("DROPPED", pid);
  setInterval(() => {}, 2 ** 30); // keeps this process up on its own account: the parent ends it
} else if (mode === "orphan") {
  const descendant = await (async () => {
    const child = spawn(fixture, ["tree=1:resist", "ready", "exit=0"], { graceMs: 500 });
    const [pid] = await untilTree(child.lines(), 1);
    await child.wait(); // the root has exited; its descendant, which ignores a polite stop, lives on
    return pid;
  })(); // the Child is unreachable from here on
  await collectAll();
  // A round trip through the same supervisor after the collection: whatever stop it caused was sent before this ends.
  await spawn(fixture, ["exit=0"]).wait();
  say("ORPHANED", descendant);
  setInterval(() => {}, 2 ** 30); // keeps this process up on its own account: the parent ends it
} else {
  const child =
    mode === "end"
      ? spawn(fixture, [...tree, `watch=stdout:1:${release}`, "exit=0"], { graceMs: 500 })
      : spawn(fixture, [...tree, "hang"], { graceMs: 500 });
  say("READY", child.pid, ...(await untilTree(child.lines(), 2))); // only once all three pids are known
  if (mode === "end") await child.wait(); // the root exits, its descendants are orphaned, and nothing is left to wait for
  else if (mode === "exit" || mode === "throw") {
    await goAhead(); // the parent has looked at the tree; now end
    if (mode === "exit") process.exit(0);
    setImmediate(() => {
      throw new Error("uncaught, on purpose");
    });
  }
}
