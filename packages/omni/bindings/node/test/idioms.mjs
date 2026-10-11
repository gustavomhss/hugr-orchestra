// C-TS-01, the TS idiom tests (ACC-02): what is specific to TypeScript in the public API, through `bindings/node` and the
// fixture, with no framework. RED until W13 replaces the W00 stub (every `spawn` throws `IO: not implemented yet`); they
// cover `for await`, `await using` (disposal awaits `stop()`), `AbortSignal`, `OmniError.code`, the PipeChild/PtyChild
// split and zero `any`; and the host's lifecycle (`host.mjs`, run as a subprocess under this runtime): a live Child keeps
// the event loop alive, the GC never kills a child, and a host that ends or dies in any way leaves no tree behind
// (GUARANTEES.md). The overload types themselves are `overloads.ts`, checked by `tsc -p test/tsconfig.json`.
//
//   node bindings/node/test/idioms.mjs     (or bun / deno run -A); needs `cargo build --workspace --bins`

import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withHost } from "./hosts.mjs";
import { runTests, test } from "./mini.mjs";
import { OS, expectLife, life } from "./runner/os.mjs";
import { binaries, loadApi, root } from "./support.mjs";

const { fixture } = binaries();
const { run, spawn, OmniError } = loadApi();

/** What `fn` throws, which must be an `OmniError` with `code`. */
const thrown = (fn, code) => {
  try {
    fn();
  } catch (e) {
    return isOmni(e, code);
  }
  throw new Error(`expected ${code} to be thrown, but nothing was`);
};
/** What a promise rejects with, which must be an `OmniError` with `code`. */
const rejects = (promise, code) =>
  promise.then(
    () => assert.fail(`expected ${code}, but it resolved`),
    (e) => isOmni(e, code),
  );
function isOmni(e, code) {
  assert.ok(e instanceof OmniError && e instanceof Error, `want an OmniError, got ${e?.stack ?? e}`);
  assert.ok(e.code === code, `want ${code}, got ${e.code}: ${e.message}`);
  return e;
}

/** `fn(child)` with the fixture running, and its tree stopped afterwards whatever happens. */
async function withChild(args, options, fn) {
  const child = spawn(fixture, args, options);
  try {
    return await fn(child);
  } finally {
    await child.stop({ graceMs: 0 }).catch(() => {});
  }
}

/** Reads lines until `PID 1 <pid>` and `READY` (a `tree=1 ready` fixture) have both been seen; returns the descendant's pid. */
async function untilReady(child) {
  let pid;
  let ready = false;
  for await (const { text } of child.lines()) {
    const found = /^PID 1 (\d+)$/.exec(text);
    if (found) pid = Number(found[1]);
    ready ||= text === "READY";
    if (ready && pid !== undefined) break;
  }
  assert.ok(ready && pid !== undefined, "the output ended before the fixture was ready");
  return pid;
}

test("for await reads `output` chunk by chunk until the child ends", () =>
  withChild(["out=a\\n", "err=b\\n", "out=c\\n"], undefined, async (child) => {
    const got = { stdout: "", stderr: "" };
    for await (const chunk of child.output) {
      assert.equal(typeof chunk.data, "string");
      got[chunk.stream] += chunk.data;
    }
    assert.deepEqual(got, { stdout: "a\nc\n", stderr: "b\n" });
    assert.equal((await child.wait()).reason, "exit");
  }));

test("leaving a for await loop detaches the single consumer for good (lines() and output are one consumer)", () =>
  withChild(["out=one\\n", "out=two\\n", "hang"], undefined, async (child) => {
    for await (const line of child.lines()) {
      assert.deepEqual([line.stream, line.text], ["stdout", "one"]);
      break;
    }
    await rejects((async () => { for await (const _ of child.lines()) break; })(), "INVALID_ARGUMENT");
    await rejects((async () => { for await (const _ of child.output) break; })(), "INVALID_ARGUMENT");
  }));

test("await using: disposal is `stop()`, and the whole tree is gone when it resolves", async () => {
  assert.equal(typeof Symbol.asyncDispose, "symbol", "this runtime has no Symbol.asyncDispose");
  const child = spawn(fixture, ["tree=1", "ready", "hang"]);
  try {
    const descendant = await untilReady(child);
    assert.equal(typeof child[Symbol.asyncDispose], "function");
    await child[Symbol.asyncDispose]();
    // No polling: what `await using` awaits is a stop that returns only once the tree is confirmed gone.
    for (const pid of [child.pid, descendant]) assert.equal((await life(pid)).state, "dead", `pid ${pid} survived the disposal`);
    assert.deepEqual(await child.processes(), []);
  } finally {
    await child.stop({ graceMs: 0 }).catch(() => {});
  }
});

test("AbortSignal: one already aborted throws or rejects ABORTED, and nothing runs", async () => {
  const signal = AbortSignal.abort();
  thrown(() => spawn(fixture, ["out=X"], { signal }), "ABORTED");
  await rejects(run(fixture, ["out=X"], { signal }), "ABORTED");
});

test("AbortSignal: aborting a launched child stops its tree and `wait()` reports `aborted`", async () => {
  const controller = new AbortController();
  const child = spawn(fixture, ["tree=1", "ready", "hang"], { signal: controller.signal });
  try {
    const descendant = await untilReady(child);
    controller.abort();
    const exit = await child.wait();
    assert.deepEqual([exit.reason, exit.success], ["aborted", false]);
    await expectLife([child.pid, descendant], false, 5000);
  } finally {
    await child.stop({ graceMs: 0 }).catch(() => {});
  }
});

test("AbortSignal: aborting a `run` rejects it with ABORTED", async () => {
  const controller = new AbortController();
  const done = run(fixture, ["out=PART\\n", "hang"], { signal: controller.signal });
  controller.abort();
  await rejects(done, "ABORTED");
});

test("OmniError: an Error with a `code`, thrown synchronously by spawn and rejecting run", async () => {
  const program = "omni-no-such-program-xyz";
  const sync = thrown(() => spawn(program), "NOT_FOUND");
  assert.ok(sync.message.includes(program), sync.message);
  const rejected = await rejects(run(program), "NOT_FOUND");
  assert.ok(rejected.message.includes(program), rejected.message);
  thrown(() => spawn(fixture, [], { timeoutMs: -1 }), "INVALID_ARGUMENT");
});

test("PipeChild and PtyChild: only a pipe child has closeStdin, only a terminal child has resize", async () => {
  await withChild(["ready", "hang"], undefined, (child) => {
    assert.equal(typeof child.closeStdin, "function", "a pipe child has closeStdin");
    assert.equal(child.resize, undefined, "a pipe child has no resize");
  });
  await withChild(["ready", "hang"], { pty: true }, (child) => {
    assert.equal(typeof child.resize, "function", "a terminal child has resize");
    assert.equal(child.closeStdin, undefined, "a terminal child has no closeStdin");
  });
});

test("a value index.d.ts does not allow is INVALID_ARGUMENT naming the field and the value: thrown by spawn, rejected by run and the methods", async () => {
  const options = [
    [{ stdin: "bogus" }, 'stdin is "bogus"'],
    [{ timeoutMs: "x" }, 'timeoutMs is "x"'],
    [{ env: { OMNI_K: 1 } }, "env.OMNI_K is 1"],
    [{ pty: { cols: "80" } }, 'pty.cols is "80"'],
    [{ signal: {} }, "signal is an object"],
  ];
  for (const [given, says] of options) {
    for (const e of [thrown(() => spawn(fixture, [], given), "INVALID_ARGUMENT"), await rejects(run(fixture, [], given), "INVALID_ARGUMENT")]) {
      assert.ok(e.message.includes(says) && e.message.includes("pass "), e.message);
    }
  }
  assert.ok(thrown(() => spawn(fixture, ["ok", 5]), "INVALID_ARGUMENT").message.includes("args[1] is 5"));
  await withChild(["hang"], { stdin: "pipe" }, async (child) => {
    assert.ok((await rejects(child.write(5), "INVALID_ARGUMENT")).message.includes("data is 5"));
    assert.ok((await rejects(child.stop({ graceMs: "soon" }), "INVALID_ARGUMENT")).message.includes('graceMs is "soon"'));
  });
  // What the caller's own code throws is not the library's to rename.
  const own = new Error("thrown by a getter");
  assert.throws(() => spawn(fixture, [], { get cwd() { throw own; } }), (e) => e === own);
});

test("zero `any` in index.d.ts", () => {
  const types = readFileSync(join(root, "bindings/node/index.d.ts"), "utf8");
  assert.doesNotMatch(types.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /\bany\b/);
});

const BOUND = 5000; // the tree's grace is 500 ms; once the host is gone nothing of its trees may run after that

/** [how the host ends, what it says about it]: every one leaves a root and two descendants running when it ends. */
const ENDINGS = [
  ["end", "ends normally, with nothing left to wait for"],
  ["exit", "calls process.exit()"],
  ["throw", "dies of an uncaught exception"],
  ["SIGINT", "is sent SIGINT"],
  ["SIGTERM", "is sent SIGTERM"],
  ["SIGKILL", "is hard killed (SIGKILL; TerminateProcess on Windows)"],
];
for (const [ending, how] of ENDINGS) {
  const signal = ending.startsWith("SIG");
  test(`host: when it ${how}, its whole tree is gone within ${BOUND} ms`, () =>
    withHost(signal ? "wait" : ending, async (host, release) => {
      const tree = await host.marker("READY", 3); // the root, then its two descendants
      await expectLife(tree, true, 0); // all running now
      if (ending === "end") appendFileSync(release, "go\n"); // the root exits; the host has nothing left to wait for
      if (signal) host.kill(ending);
      else if (ending === "exit" || ending === "throw") host.go(); // the host waited for this: it ends only after the check above
      const stuck = "after wait() resolved, a Child with no consumer attached must not keep the event loop alive, whatever its orphans hold";
      const end = await host.end(10_000, ending === "end" ? stuck : "");
      // The library changes nothing about how the host itself ends (GUARANTEES.md: Ctrl-C and SIGTERM stay the host's own).
      if (signal && OS !== "windows") assert.equal(end.signal, ending, `the host ended as ${JSON.stringify(end)}`);
      else if (ending === "throw") assert.ok(end.signal === null && end.code !== 0, `the host ended as ${JSON.stringify(end)}`);
      else if (!signal) assert.deepEqual([end.code, end.signal], [0, null]);
      await expectLife(tree, false, BOUND);
    }));
}

test("a live Child keeps the event loop alive: a host that spawns and never awaits runs until the child ends, then ends by itself", () =>
  withHost("retain", async (host, release) => {
    const [child] = await host.marker("SPAWNED", 1);
    await expectLife([child], true, 0);
    assert.equal(host.ended, null, "the host ended while its child was still running");
    const released = performance.now();
    appendFileSync(release, "go\n"); // the child exits
    const end = await host.end();
    assert.deepEqual([end.code, end.signal], [0, null]);
    assert.ok(end.at > released, "the host ended before its child was let go");
    await expectLife([child], false, BOUND);
  }));

test("GC never kills a child: every reference dropped and a collection forced, the child still runs, until the host dies", () =>
  withHost("gc", async (host) => {
    const [child] = await host.marker("DROPPED", 1);
    await expectLife([child], true, 0);
    host.kill("SIGKILL");
    await host.end();
    await expectLife([child], false, BOUND); // the host's death ended it, not the collector
  }, { gc: true }));

test("GC never kills a child after its root exited: the collected Child's live descendant still runs, until the host dies", () =>
  withHost("orphan", async (host) => {
    const [descendant] = await host.marker("ORPHANED", 1);
    await expectLife([descendant], true, 0);
    host.kill("SIGKILL");
    await host.end();
    await expectLife([descendant], false, BOUND); // the host's death ended it (the supervisor's stop), not the collector
  }, { gc: true }));

await runTests("idioms", 60_000);
