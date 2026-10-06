// WP-H, the hardening of the TS binding: a terminated Worker leaves no tree and no crash (H1), configure() and the
// environment JS sees (H4, H8), and output a fast consumer never loses (H7). With no framework, like `idioms.mjs`.
//
//   node bindings/node/test/hardening.mjs     (or bun / deno run -A); needs `cargo build --workspace --bins`

import assert from "node:assert/strict";
import { spawn as launch } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runTests, test } from "./mini.mjs";
import { parseMarker } from "./markers.mjs";
import { OS } from "./runner/os.mjs";
import { binaries, hostCommand, loadApi } from "./support.mjs";

const { fixture } = binaries();
const { run, spawn, configure, OmniError } = loadApi();
const here = dirname(fileURLToPath(import.meta.url));
const MIB = 1 << 20;

/** Runs `script` under this runtime to its end (at most `ms`): `{ code, signal, out, err }`. */
function host(script, args, ms = 30_000) {
  const [command, argv] = hostCommand(join(here, script), args);
  return new Promise((resolve, reject) => {
    const proc = launch(command, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let [out, err] = ["", ""];
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`${script} ${args.join(" ")} did not end within ${ms} ms: ${err.trim().split("\n").at(-1)}`));
    }, ms);
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, out, err });
    });
  });
}

for (const [mode, what] of [["live", "with a live tree"], ["idle", "with nothing running"]]) {
  test(`H1: terminating a Worker that loaded the library (${what}) neither crashes the host nor leaves its tree`, async () => {
    const end = await host("worker-host.mjs", [mode]);
    assert.doesNotMatch(end.err, /panicked|fatal runtime error|Abort/i, end.err);
    assert.deepEqual([end.code, end.signal], [0, null], `the host ended as ${JSON.stringify([end.code, end.signal])}: ${end.err}`);
    if (mode === "idle") return assert.match(end.out, /^HOST-TERMINATED none$/m, end.out);
    const pids = parseMarker(end.out, "TERMINATED", 2);
    assert.ok(Array.isArray(pids), `no HOST-TERMINATED line with the tree's pids: ${end.out} ${end.err}`);
    // Asked by the host while it still ran: the Worker's teardown stopped its tree before terminate() resolved.
    assert.match(end.out, /^HOST-STATES dead dead$/m, `the terminated Worker's tree outlived it: ${end.out}`);
  });
}

/** The JSON line of `configure-host.mjs <which>`. */
async function configured(which) {
  const end = await host("configure-host.mjs", [which]);
  assert.deepEqual([end.code, end.signal], [0, null], end.err);
  return JSON.parse(end.out.trim().split("\n").at(-1)).outcomes;
}

test("H4: configure() paths win, a loaded addon cannot change, and configure() after spawn() is INVALID_ARGUMENT", async () => {
  const [load, other, spawned, late, bad] = await configured("order");
  assert.deepEqual(load, ["configure", "ok"]);
  assert.deepEqual(other.slice(0, 2), ["configure other addon", "INVALID_ARGUMENT"]);
  assert.match(other[2], /already loaded/);
  // The configured supervisor, not HUGR_OMNI_SUPERVISOR (which names a real one), is what spawn() tried to start.
  assert.deepEqual(spawned.slice(0, 2), ["spawn", "IO"]);
  assert.match(spawned[2], /omni-wph/);
  assert.deepEqual(late.slice(0, 2), ["configure after spawn", "INVALID_ARGUMENT"]);
  assert.match(late[2], /before the first run\(\) or spawn\(\)/);
  assert.deepEqual(bad.slice(0, 2), ["configure bad field", "INVALID_ARGUMENT"]);
  assert.match(bad[2], /supervisor is 5/);
});

test("H4: an explicit addon that is missing fails loudly; nothing falls back to this checkout's build", async () => {
  const [missing] = await configured("no-fallback");
  assert.equal(missing[0], "configure missing addon");
  assert.notEqual(missing[1], "ok", "a missing explicit addon loaded something");
  assert.match(missing[2], /omni-wph/);
  const [fromEnv] = await configured("env-addon");
  assert.notEqual(fromEnv[1], "ok", "HUGR_OMNI_ADDON set through process.env was not the addon tried");
  assert.match(fromEnv[2], /from-env/);
});

test("H4: a variable set through process.env at run time reaches the child; inheritEnv: false still starts clean", async () => {
  const outcomes = Object.fromEntries(await configured("env-run"));
  assert.equal(outcomes.inherited, 'OMNI_WPH_LATE="set-at-run-time"\n');
  assert.equal(outcomes.clean, "OMNI_WPH_LATE unset\n");
});

test("H4: process.env in this process, overridden and removed by env", async () => {
  process.env.OMNI_WPH_HERE = "here";
  process.env.OMNI_WPH_GONE = "gone";
  const got = await run(fixture, ["getenv=OMNI_WPH_HERE", "getenv=OMNI_WPH_GONE", "getenv=OMNI_WPH_SET"], { env: { OMNI_WPH_GONE: null, OMNI_WPH_SET: "set" } });
  assert.equal(got.stdout, 'OMNI_WPH_HERE="here"\nOMNI_WPH_GONE unset\nOMNI_WPH_SET="set"\n');
});

test("H8: one PATH reaches the child, however env spells it (Windows compares names ignoring case)", async () => {
  const spelled = OS === "windows" ? "path" : "PATH";
  const got = await run(fixture, ["getenv=PATH"], { env: { [spelled]: process.env.PATH ?? "" } });
  const lines = got.stdout.trim().split("\n");
  assert.equal(lines.length, OS === "windows" ? 1 : lines.filter((l) => /^PATH=/i.test(l)).length, got.stdout);
  if (OS === "windows") assert.match(lines[0], /^path=/, "env's own spelling is the one that reaches the child");
});

test("configure() is refused here too: this process has already spawned", () => {
  assert.throws(() => configure({ supervisor: "/elsewhere" }), (e) => e instanceof OmniError && e.code === "INVALID_ARGUMENT");
});

/** Blocks the event loop for `ms` (the stimulus: a consumer that falls behind). */
function stall(ms) {
  const until = performance.now() + ms;
  while (performance.now() < until);
}

/** 64 MiB of the fixture's alphabet; `onFirst` runs at the first chunk. Returns what arrived and every `lostBefore`. */
async function flood(options, onFirst) {
  const total = 64 * MIB;
  const child = spawn(fixture, [`bytes=stdout:${total}`], { ...options, text: false });
  let [got, first] = [0, true];
  const lost = [];
  let exact = true;
  for await (const chunk of child.output) {
    if (first) [first] = [false, onFirst(child)];
    if (chunk.lostBefore) lost.push(chunk.lostBefore);
    for (let i = 0; i < chunk.data.length && exact && lost.length === 0; i++) exact = chunk.data[i] === 97 + ((got + i) % 26);
    got += chunk.data.length;
  }
  assert.equal((await child.wait()).success, true);
  return { total, got, lost, exact, dropped: child.droppedBytes.stdout };
}

test("H7: with backpressure, a consumer that blocks the event loop for 200 ms gets all 64 MiB, byte-exact, no gap", async () => {
  const r = await flood({ backpressure: true }, () => stall(200));
  assert.deepEqual([r.got, r.lost, r.dropped, r.exact], [r.total, [], 0, true]);
});

test("H7: without backpressure, a consumer that falls behind loses output, reported as lostBefore", async () => {
  const r = await flood({}, (child) => {
    // Deterministic: the loop stays blocked until the library has had to drop (or 20 s say it never does).
    const until = performance.now() + 20_000;
    while (child.droppedBytes.stdout === 0 && performance.now() < until);
  });
  assert.ok(r.dropped > 0, "nothing was dropped");
  assert.equal(r.got + r.lost.reduce((a, b) => a + b, 0), r.total, "what arrived plus what was reported lost is not the whole");
});

await runTests("hardening", 60_000);
