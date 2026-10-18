// Teeth of the contract runner itself (the TS counterpart of `crates/hugr-omni/tests/teeth.rs`, plus a positive
// control): against the W00 stub every scenario is red, so only a fake library can show that the runner can also say
// "ok", and that each way of being wrong is a failure of the right kind (`product` may be pending; `harness` never).
//
//   node bindings/node/test/teeth.mjs     (or bun / deno run -A)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, runTests } from "./mini.mjs";
import { parseMarker, untilTree } from "./markers.mjs";
import { Ledger, item } from "./runner/ledger.mjs";
import { life, psLife, statLife, tasklistLife } from "./runner/os.mjs";
import { checkTable, pattern } from "./runner/pattern.mjs";
import { Scenario } from "./runner/scenario.mjs";
import { suite } from "./runner/suite.mjs";
import { runScenario } from "./runner/steps.mjs";

class FakeError extends Error {
  constructor(code, message, result) {
    super(message);
    this.code = code;
    this.result = result;
  }
}
const EXIT = { exitCode: 0, signal: null, reason: "exit", success: true };
const CHUNKS = ["PID 4242\n", "RE", "ADY\nmore\n", "tail"].map((data) => ({ stream: "stdout", data }));
const LINES = [{ stream: "stdout", text: "a" }, { stream: "stdout", text: "bb", continues: true }, { stream: "stdout", text: "c" }, { stream: "stdout", text: "", lostBefore: 5 }];

/**
 * A scripted child: its output and `wait`; the consumer is single and claimed for good, like the real one (a second
 * claim is refused at once, or at the first `next()` when `lazy`), and `released` says whether `return()` reached it.
 */
function fakeChild({ chunks = CHUNKS, wait = async () => EXIT, lazy = false } = {}) {
  let claimed = false;
  const child = { released: false };
  const refused = () => new FakeError("INVALID_ARGUMENT", "the consumer is already claimed");
  const claim = (items) => {
    if (claimed && !lazy) throw refused();
    const failing = claimed;
    claimed = true;
    return (async function* () {
      if (failing) throw refused();
      try {
        yield* items;
      } finally {
        child.released = true;
      }
    })();
  };
  return Object.assign(child, {
    pid: process.pid,
    output: { [Symbol.asyncIterator]: () => claim(chunks) },
    lines: () => ({ [Symbol.asyncIterator]: () => claim(LINES) }),
    droppedBytes: { stdout: 3, stderr: 0 },
    write: async () => {},
    closeStdin: async () => {},
    resize() {},
    wait,
    stop: async () => ({ ...EXIT, reason: "killed", success: false }),
    processes: async () => [{ pid: 4242, parentPid: null, name: "fake" }, { pid: 4243, parentPid: 4242, name: "fake2" }],
  });
}

/** The library: a `run` that checks how the runner mapped the options, a `spawn`, and what a test overrides. */
const fakeApi = (over = {}, child = {}, made = []) => ({
  OmniError: FakeError,
  async run(_command, _args, opts) {
    if (opts.signal.aborted) throw new FakeError("ABORTED", "aborted");
    if (Number.isNaN(opts.timeoutMs)) throw new FakeError("INVALID_ARGUMENT", "timeout must be finite");
    if (opts.text === false) {
      if (!(opts.input instanceof Uint8Array)) throw new FakeError("INVALID_ARGUMENT", "input must be bytes");
      return { ...EXIT, stdout: opts.input, stderr: new Uint8Array(0) };
    }
    return { ...EXIT, stdout: "hi\n", stderr: "" };
  },
  spawn(command) {
    if (command.startsWith("/omni-no-such-dir")) throw new FakeError("NOT_FOUND", `${command} was not found`);
    made.push(fakeChild(child));
    return made.at(-1);
  },
  ...over,
});

let seq = 9000;
const load = (steps, rest = {}) => new Scenario(JSON.stringify({ id: "C-TEETH-01.t", ...rest, steps }), "C-TEETH-01.t");
/** The failure of a scenario run (`null` when it passes). */
const failure = (api, steps) => runScenario(api, load(steps), "fixture", ++seq).then(() => null, (e) => e);

test("positive control: a correct library passes a scenario that uses every kind of step and matcher", async () => {
  const gone = spawnSync(process.execPath, ["--version"]).pid; // reaped: the OS says dead
  const steps = [
    { run: ["x", "a"], options: { env: { K: "v" }, timeoutMs: 5 }, expect: { ...EXIT, stdout: { hex: "68690a" }, stderr: { length: 0 }, elapsedMs: { gte: 0, lt: 5000 } } },
    { run: ["x"], expect: { stdout: { contains: "i\n" }, stderr: { regex: "^$" }, exitCode: { gte: 0, lt: 1 } } },
    { run: ["x"], options: { timeoutMs: { $number: "NaN" } }, expect: { error: "INVALID_ARGUMENT", message: ["timeout"] } },
    { run: ["x"], options: { text: false, input: { hex: "00ff" } }, expect: { stdout: { hex: "00ff" } } },
    { spawn: ["x"], as: "c" },
    { read: "c", until: { match: "^READY$" }, capture: { p: "^PID (\\d+)$" }, expect: { stdout: "PID 4242\nREADY\nmore\n", chunks: 3, droppedBytes: { stdout: 3 } } },
    { processes: "c", capture: "all", expect: { entries: [{ pid: 4243, parentPid: "${p}", name: { regex: "^fake\\d$" } }, { pid: "${p}", parentPid: null, name: "fake" }] } },
    { os: "alive", pids: ["${c.pid}"] },
    { os: "dead", pids: [gone] },
    { read: "c", until: "end", detach: true, expect: { stdout: "tail", chunks: 1 } },
    { read: "c", until: "end", expect: { error: "INVALID_ARGUMENT" } },
    { stop: "c", graceMs: 10, expect: { reason: "killed", success: false } },
    { spawn: ["x"], as: "d" },
    { read: "d", lines: true, until: "end", expect: { stdout: "a\nbbc\n\n", chunks: 4, continues: 1, lostBefore: 5, pieces: { stdout: [{ bytes: 1, continues: false }, { bytes: 2, continues: true }, { bytes: 1, continues: false }, { bytes: 0, continues: false }] } } },
    { abort: "d" },
    { run: ["x"], expect: { error: "ABORTED" } },
  ];
  assert.equal(await failure(fakeApi(), steps), null);
});

/** [what is wrong, the library, the steps, what the failure says]: each is a `product` failure, which may be pending. */
const MUTANTS = [
  ["a wrong exit code", { run: async () => ({ ...EXIT, exitCode: 1, success: false, stdout: "", stderr: "" }) }, [{ run: ["x"], expect: { exitCode: 0 } }], "exitCode: expected 0, got 1"],
  ["a field that is undefined, not null", { run: async () => ({ ...EXIT, signal: undefined, stdout: "", stderr: "" }) }, [{ run: ["x"], expect: { signal: null } }], "signal: expected null"],
  ["an error that never comes", {}, [{ run: ["x"], expect: { error: "NOT_FOUND" } }], "expected error"],
  ["the wrong error code", { run: async () => { throw new FakeError("IO", "boom"); } }, [{ run: ["x"], expect: { error: "NOT_FOUND" } }], "expected error NOT_FOUND, got IO"],
  ["a message without the fix", { run: async () => { throw new FakeError("NOT_FOUND", "nope"); } }, [{ run: ["x"], expect: { error: "NOT_FOUND", message: ["Check the path"] } }], "lacks"],
  ["an error that is not an OmniError", { run: async () => { throw new TypeError("x"); } }, [{ run: ["x"] }], "not an OmniError"],
  ["output that ends before the marker", {}, [{ spawn: ["x"], as: "c" }, { read: "c", until: { match: "^NEVER$" } }], "output ended after 0 of 1"],
  ["a marker found in half a line", {}, [{ spawn: ["x"], as: "c" }, { read: "c", until: { match: "^RE$" } }], "output ended after 0 of 1"],
  ["a process list with the wrong parent", {}, [{ spawn: ["x"], as: "c" }, { processes: "c", expect: { entries: [{ pid: 4242, parentPid: null }, { pid: 4243, parentPid: null }] } }], "entries: expected"],
  ["an extra process in the list", {}, [{ spawn: ["x"], as: "c" }, { processes: "c", expect: { entries: [{ pid: 4242 }] } }], "entries: expected"],
  ["one process matched by two entries", {}, [{ spawn: ["x"], as: "c" }, { processes: "c", expect: { entries: [{ pid: 4242 }, { pid: 4242 }] } }], "entries: expected"],
  ["a process list with the wrong pids", {}, [{ spawn: ["x"], as: "c" }, { processes: "c", expect: { entries: [{ pid: 1 }, { pid: 2 }] } }], "entries: expected"],
  ["a read that saw another chunk count", {}, [{ spawn: ["x"], as: "c" }, { read: "c", until: { match: "^READY$" }, expect: { chunks: 2 } }], "chunks: expected 2, got 3"],
  ["lines with a wrong piece flag", {}, [{ spawn: ["x"], as: "c" }, { read: "c", lines: true, until: "end", expect: { pieces: { stdout: [{ bytes: 1, continues: true }] } } }], "pieces"],
  ["a process the OS says is alive", {}, [{ spawn: ["x"], as: "c" }, { os: "dead", pids: ["${c.pid}"] }], "expected dead per the OS"],
  ["an error nobody expected", { run: async () => { throw new FakeError("IO", "boom"); } }, [{ run: ["x"] }], "unexpected error IO"],
  ["a wait that never ends", {}, [{ spawn: ["x"], as: "c" }, { wait: "c", timeoutMs: 50 }], "timed out after 50 ms"],
];
/** Each of these is wrong about what `run` returns (`hi\n`, exit 0, no signal): a matcher that lets one pass is broken. */
const WRONG = [
  { stdout: "nope" }, { stdout: { contains: "zzz" } }, { stdout: { regex: "^z" } }, { stdout: { hex: "00" } }, { stdout: { length: 9 } },
  { stdout: null }, { success: false }, { reason: "killed" }, { signal: "SIGTERM" }, { exitCode: 1 }, { exitCode: null },
  { exitCode: { gt: 0 } }, { exitCode: { lt: 0 } }, { exitCode: { gte: 1 } }, { exitCode: { lte: -1 } }, { elapsedMs: { gt: 100000 } },
];
test("every wrong expectation about a result is a product failure, whatever the matcher", async () => {
  for (const expect of WRONG) {
    const e = await failure(fakeApi(), [{ run: ["x"], expect }]);
    assert.ok(e && e.kind === "product", `${JSON.stringify(expect)} was accepted`);
  }
});

/** [field, what the scenario expects, what the library returned instead]: a different kind of value never matches. */
const OTHER_TYPES = [
  ["success", true, 42], ["success", true, 1], ["success", true, "true"], ["success", false, 0], ["success", false, null], ["success", true, undefined],
  ["stdout", "", 0], ["stdout", "0", 0], ["stdout", "", false], ["stdout", "", null], ["stdout", "", undefined], ["stdout", "", {}],
  ["stdout", { contains: "" }, 0], ["stdout", { regex: "^$" }, 0], ["stdout", { length: 0 }, 0], ["stdout", { hex: "" }, 0], ["stdout", { hex: "00" }, 0],
  ["exitCode", 0, "0"], ["exitCode", 0, false], ["exitCode", 0, undefined], ["exitCode", { gte: 0 }, "5"], ["exitCode", { gt: 1 }, "5"],
  ["exitCode", { lt: 10 }, true], ["exitCode", { gte: 0 }, null], ["exitCode", { gte: 0 }, ""],
  ["signal", null, 0], ["signal", null, ""], ["signal", null, false], ["signal", "SIGTERM", 15],
  ["reason", "exit", 0],
];
test("a value of another type never matches: a number is not `true`, not \"\", not a string matcher's text", async () => {
  for (const [name, expect, actual] of OTHER_TYPES) {
    const run = async () => ({ ...EXIT, stdout: "", stderr: "", [name]: actual });
    const e = await failure(fakeApi({ run }), [{ run: ["x"], expect: { [name]: expect } }]);
    assert.ok(e && e.kind === "product", `${name}: ${JSON.stringify(expect)} accepted ${String(actual)} (${typeof actual})`);
  }
});

for (const [what, over, steps, says] of MUTANTS) {
  test(`mutant: ${what} is a product failure naming the step and expected vs got`, async () => {
    const api = fakeApi(over, what === "a wait that never ends" ? { wait: () => new Promise(() => {}) } : {});
    const e = await failure(api, steps);
    assert.ok(e, "the scenario passed");
    assert.equal(e.kind, "product", e.message);
    assert.match(e.message, /^step \d+ \(\w+\): /);
    assert.ok(e.message.includes(says), `${JSON.stringify(e.message)} lacks ${JSON.stringify(says)}`);
  });
}

test("a read keeps the consumer between steps, and only `detach` lets go of it", async () => {
  const read = { read: "c", until: { match: "^READY$" } };
  for (const [steps, released] of [[[read], false], [[{ ...read, detach: true }], true]]) {
    const made = [];
    assert.equal(await failure(fakeApi({}, {}, made), [{ spawn: ["x"], as: "c" }, ...steps]), null);
    assert.equal(made[0].released, released, released ? "detach must leave the loop" : "a read must not leave the loop");
  }
});

test("a refused claim leaves the old consumer in place, and a gap ends the partial line", async () => {
  const gapped = [{ stream: "stdout", data: "ab" }, { stream: "stdout", data: "c\n", lostBefore: 3 }];
  const steps = [
    { spawn: ["x"], as: "c" },
    { read: "c", until: { match: "^READY$" } },
    { read: "c", lines: true, until: "end", expect: { error: "INVALID_ARGUMENT" } },
    { read: "c", until: "end", expect: { stdout: "tail" } },
    { spawn: ["x"], as: "d" },
    { read: "d", until: { match: "^ab$" }, expect: { lostBefore: 3 } },
  ];
  const kids = [{ lazy: true }, { chunks: gapped }]; // the first refuses a second claim only at its first `next()`
  assert.equal(await failure(fakeApi({ spawn: () => fakeChild(kids.shift()) }), steps), null);
});

test("harness failures are never pending: every scenario mistake fails the suite, wherever it is", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omni-teeth-"));
  // The library cannot start this program: a product failure, so a pending item stops there as `pending`.
  const fails = '{"spawn": ["/omni-no-such-dir/omni-nope"], "options": {"pty": true}, "as": "c"}';
  const cases = {
    "broken-json": "{",
    "bad-regex": `{"steps": [${fails}, {"read": "c", "until": {"match": "(?!x)"}}]}`,
    "unknown-var": '{"steps": [{"spawn": ["${NOPE}"]}]}',
    "bad-matcher": '{"steps": [{"run": ["/omni-no-such-dir/x"], "expect": {"exitCode": {"bogus": 0}}}]}',
    "late-no-rows": `{"steps": [${fails}, {"resize": "c", "cols": 80}]}`,
    "late-bad-files": `{"files": ["x"], "steps": [${fails}]}`,
    "late-no-handle": `{"steps": [${fails}, {"wait": "nope"}]}`,
    "late-unknown-var": `{"steps": [${fails}, {"os": "dead", "pids": "\${nope}"}]}`,
    "late-close-pty": `{"steps": [${fails}, {"write": "c"}]}`,
    "late-no-pids": `{"steps": [${fails}, {"os": "dead", "pids": []}]}`,
    product: `{"steps": [${fails}, {"resize": "c", "cols": 80, "rows": 24}]}`,
  };
  try {
    for (const [name, body] of Object.entries(cases)) {
      writeFileSync(join(dir, `C-KILL-01.${name}.json`), body === "{" ? body : `{"id": "C-KILL-01.${name}", ${body.slice(1)}`);
    }
    const sum = await suite({ dir, ledgerText: "C-KILL-01 W07\n", fixture: "none", api: fakeApi(), log: () => {} });
    assert.deepEqual([sum.passed, sum.pending, sum.ran, sum.files], [0, 1, 11, 11], JSON.stringify(sum.errors));
    assert.equal(sum.errors.length, 10, JSON.stringify(sum.errors));
    for (const name of Object.keys(cases).filter((n) => n !== "product")) {
      const line = sum.errors.find((e) => e.startsWith(`C-KILL-01.${name}:`));
      assert.ok(line?.includes("bad scenario"), `${name}: ${JSON.stringify(sum.errors)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the ledger: a pending item that passes, an unknown ID, a repeated ID and a malformed line fail the suite", async () => {
  const dir = mkdtempSync(join(tmpdir(), "omni-teeth-"));
  try {
    writeFileSync(join(dir, "C-TEETH-01.t.json"), JSON.stringify({ id: "C-TEETH-01.t", steps: [{ run: ["x"], expect: { exitCode: 0 } }] }));
    const run = (ledgerText) => suite({ dir, ledgerText, fixture: "none", api: fakeApi(), log: () => {} });
    assert.equal((await run("# only a comment\n")).errors.length, 0);
    const passes = await run("C-TEETH-01 W99\n");
    assert.ok(passes.errors.length === 1 && passes.errors[0].includes("remove it from conformance/pending.txt"), String(passes.errors));
    const unknown = await run("C-NOPE-01 W99\n");
    assert.ok(unknown.errors.length === 1 && unknown.errors[0].includes("no scenario proves it"), String(unknown.errors));
    assert.ok(new Ledger("C-KILL-01 W07\nC-KILL-01 W07\n").errors[0].includes("twice"));
    assert.equal(new Ledger("C-KILL-01\nkill W07\nC-KILL-01 W07 extra\n").errors.length, 3);
    assert.equal(new Ledger("# c\n\nC-KILL-01 W07\nC-PTY-02 W12w\n").errors.length, 0);
    assert.equal(item("C-KILL-01.tree"), "C-KILL-01");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the regex table check can fail, and the engine is the subset (JS `u` flag, by code point)", () => {
  assert.equal(checkTable({ accepted: [{ pattern: "^a$", match: ["a"], nomatch: ["b"], group1: {} }], refused: ["(?=a)"] }).length, 0);
  const bad = checkTable({ accepted: [{ pattern: "^(a)$", match: ["b"], nomatch: ["a"], group1: { a: "x" } }, { pattern: "\\s" }], refused: ["^a$"] });
  assert.equal(bad.length, 5, bad.join("\n"));
  assert.ok(checkTable({ accepted: [], refused: [] }).length > 0, "an empty table must not pass");
  assert.throws(() => pattern("^(?!x)"), /outside the JS\/Rust subset/);
  assert.ok(pattern("^\\d+$").test("123") && !pattern("^\\d+$").test("٣"));
  assert.ok(pattern("^.$").test("\u{1F600}") && !pattern("^.$").test("\n"));
});

test("the OS oracle tells a live process from a gone one", async () => {
  assert.equal((await life(process.pid)).state, "alive");
  assert.equal((await life(spawnSync(process.execPath, ["--version"]).pid)).state, "dead");
});

test("the OS oracle's reading of /proc, ps and tasklist: gone or a zombie is dead, anything unclear is unknown", () => {
  const states = (...lives) => lives.map((l) => l.state);
  const out = (stdout, code = 0, stderr = "") => ({ code, stdout, stderr });
  assert.deepEqual(states(
    statLife(7, "7 (node) S 1 7 7 0 -1"), statLife(7, "7 (a b) c) Z 1 7"), statLife(7, "8 (node) S 1"), statLife(7, "garbage"), statLife(7, "7 (x) Q 1"),
  ), ["alive", "dead", "unknown", "unknown", "unknown"]);
  assert.deepEqual(states(
    psLife(7, out("    7 Ss\n")), psLife(7, out("    7 Z+\n")), psLife(7, out("", 1)),
    psLife(7, out("", 1, "ps: Invalid process id: 7\n")), psLife(7, out("", "ENOENT")), psLife(7, out("    8 Ss\n")),
  ), ["alive", "dead", "dead", "unknown", "unknown", "unknown"]);
  assert.deepEqual(states(
    tasklistLife(7, out('"node.exe","7","Console","1","30,000 K"\r\n')), tasklistLife(7, out("INFO: No tasks are running which match the specified criteria.\r\n")),
    tasklistLife(7, out("")), tasklistLife(7, out("", 1)), tasklistLife(7, out('"node.exe","8","Console"\r\n')),
  ), ["alive", "dead", "unknown", "unknown", "unknown"]);
});

test("a host marker is read from complete lines only, with exactly the pids it promises", () => {
  assert.equal(parseMarker("HOST-READY 101", "READY", 3), undefined, "a line without its newline is not a line yet");
  assert.equal(parseMarker("HOST-READY 101 2", "READY", 3), undefined);
  // delivered in two pieces, split inside its pids
  assert.deepEqual(parseMarker("HOST-READY 101" + " 202 303\n", "READY", 3), [101, 202, 303]);
  assert.deepEqual(parseMarker("noise\nHOST-SPAWNED 7\nHOST-READY 1 2 3\nHOST-REA", "READY", 3), [1, 2, 3]);
  assert.equal(parseMarker("HOST-READYX 1 2 3\n", "READY", 3), undefined, "another marker's name");
  for (const bad of [
    "HOST-READY 101\n", "HOST-READY 101 202\n", "HOST-READY 101 202 303 404\n", "HOST-READY 1 2 3 3\n", "HOST-READY 101 101 303\n",
    "HOST-READY 101  202 303\n", "HOST-READY 0 2 3\n", "HOST-READY a b c\n", "HOST-READY -1 2 3\n", "HOST-READY 1.5 2 3\n", "HOST-READY \n",
  ]) {
    assert.ok(parseMarker(bad, "READY", 3) instanceof Error, `${JSON.stringify(bad)} was accepted`);
  }
});

const output = (...texts) => ({
  async *[Symbol.asyncIterator]() {
    for (const text of texts) yield { stream: "stdout", text };
  },
});

test("the host learns its tree only once READY and every level have been seen, and then leaves the loop", async () => {
  assert.deepEqual(await untilTree(output("PID 2 22", "READY", "PID 1 11", "after"), 2), [11, 22]);
  for (const partial of [[], ["READY"], ["READY", "PID 1 11"], ["PID 1 11", "PID 2 22"], ["PID 1 11", "PID 1 11", "READY"], ["PID 2 22", "PID 3 33", "READY"]]) {
    await assert.rejects(untilTree(output(...partial), 2), /ended before READY/, JSON.stringify(partial));
  }
  let released = false;
  const watched = { async *[Symbol.asyncIterator]() { try { yield { text: "READY" }; yield { text: "PID 1 11" }; yield { text: "never read" }; } finally { released = true; } } };
  assert.deepEqual(await untilTree(watched, 1), [11]);
  assert.ok(released, "the consumer must be left (detached) once the tree is known");
});

await runTests("teeth");
