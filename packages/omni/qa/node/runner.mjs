// What the TS runner's workloads share (the Rust runner's twin is qa/src/rust/{mod,ask}.rs): the setup qa/run hands
// down in HUGR_QA_* variables, task contexts (marker, roots, start), the oracle protocol (asks on stdout like
// records, answers on stdin), and the batch that bounds each task (K2), has the oracle check it as soon as it returns
// (K1), and prints one JSON record per task.

import { spawn as cpSpawn } from "node:child_process";
import { createInterface } from "node:readline";

const env = process.env;
export const setup = {
  root: env.HUGR_QA_ROOT,
  fixture: env.HUGR_QA_FIXTURE,
  cache: env.HUGR_QA_CACHE,
  run: env.HUGR_QA_RUN,
  inject: env.HUGR_QA_INJECT_ORPHAN === "1",
  taskEnv: JSON.parse(env.HUGR_QA_TASK_ENV ?? "{}"),
  sizes: JSON.parse(env.HUGR_QA_SIZES ?? "{}"),
  os: { darwin: "macos", win32: "windows" }[process.platform] ?? "linux",
};

/** What this runner may spend (`HUGR_QA_BOUND_MS`, set by qa/run), less a margin to report a hang itself. */
export const ownBoundMs = () => Math.max(Number(env.HUGR_QA_BOUND_MS ?? 600_000) - 10_000, 5_000);

export const emit = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);

/** A time in ms since 1970 in Windows FILETIME units (100 ns since 1601): comparable with process creation times. */
const filetime = (ms) => ms * 10000 + 116444736000000000;
/** Now, a millisecond early. */
const filetimeNow = () => filetime(Date.now() - 1);

/** An answer takes one snapshot started after the ask (each OS tool bounded) and the kill. */
const ANSWER_MS = 90_000;
const waiting = new Map();
let nextId = 1;
let answers;

/** Asks the oracle; rejects when it reports an error or does not answer within `ANSWER_MS`. */
function ask(line) {
  answers ??= createInterface({ input: process.stdin }).on("line", (text) => {
    let answer;
    try {
      answer = JSON.parse(text);
    } catch {
      return;
    }
    const pending = waiting.get(answer.id);
    if (!pending) return;
    waiting.delete(answer.id);
    if (answer.error !== undefined) pending.reject(new Error(answer.error));
    else pending.resolve(answer.ok);
  });
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error(`the oracle did not answer within ${ANSWER_MS} ms`));
    }, ANSWER_MS);
    const settle = (f) => (value) => {
      clearTimeout(timer);
      f(value);
    };
    waiting.set(id, { resolve: settle(resolve), reject: settle(reject) });
    emit({ ...line, id });
  });
}

export const oracle = {
  /** K1 for a task that returned; `last`: no other task of its batch is running. */
  check: (probe, last, batchSince) => ask({ kind: "check", probe, last, batch_since: batchSince }),
  /** K6's figures for this process and its supervisor. */
  usage: () => ask({ kind: "usage" }),
  /** A batch starts (`true`) or has ended (`false`). */
  arm: (on) => emit({ kind: "arm", on }),
};

export class Runner {
  constructor(arm) {
    this.arm = arm;
    this.next = 0;
    this.injected = false;
  }

  /**
   * A fresh task context: its marker, the roots it starts, and its start. A root is recorded with its spawn call's
   * window (`from = ctx.now()` read before the call, to just after it), which binds its pid to its identity.
   */
  ctx() {
    const tag = `${setup.run}-${this.arm}-${++this.next}-`;
    const roots = [];
    const since = filetimeNow();
    return {
      tag,
      since,
      env: { ...setup.taskEnv, HUGR_QA_TASK: tag },
      now: filetimeNow,
      root: (pid, from) => roots.push({ pid, from, to: filetime(Date.now() + 1) }),
      probe: () => ({ tag, roots, since }),
      spec(program, args, more = {}) {
        return { program, args, env: this.env, graceMs: 2000, ...more };
      },
      fixture(args, more = {}) {
        return this.spec(setup.fixture, args, more);
      },
    };
  }

  task(workload, task) {
    return this.batch(workload, [task]);
  }

  /**
   * Runs `tasks` ({ name, ctx, boundMs, body }) at once. Each, as soon as it returns or runs out of its bound (K2), is
   * checked by the oracle (K1: a snapshot taken after that moment, so a short-lived leftover cannot outlive the batch
   * unseen), which kills what it proves the task's. Then a record per task, in order. An outcome's `keep` (the child
   * it stopped) stays referenced until then: nothing may end its tree before the OS was asked.
   */
  async batch(workload, tasks) {
    // On Windows the omni arm runs them one at a time: a root of `run()` is known there only as the supervisor's child,
    // which no concurrent task could be told apart from, so each such task is a batch of its own, checked at once.
    if (setup.os === "windows" && this.arm === "omni" && tasks.length > 1) {
      for (const task of tasks) await this.batch(workload, [task]);
      return;
    }
    if (setup.inject && this.arm === "omni" && !this.injected && tasks.length > 0) {
      this.injected = true;
      injectOrphan(tasks[0].ctx);
    }
    const batchSince = Math.min(...tasks.map((t) => t.ctx.since));
    let left = tasks.length;
    oracle.arm(true);
    const done = await Promise.all(
      tasks.map(async (t) => {
        const t0 = performance.now();
        let timer;
        const bound = new Promise((resolve) => (timer = setTimeout(() => resolve({ hung: true }), t.boundMs)));
        const ran = t.body().then(
          (outcome) => ({ outcome }),
          (e) => ({ fail: e?.stack ?? String(e) }),
        );
        const result = await Promise.race([ran, bound]);
        clearTimeout(timer);
        const ms = performance.now() - t0;
        const last = --left === 0;
        const found = await oracle.check(t.ctx.probe(), last, batchSince).then(
          (found) => ({ found }),
          (e) => ({ unobserved: e.message }),
        );
        return { ...result, ...found, ms };
      }),
    );
    oracle.arm(false);
    tasks.forEach((t, i) => {
      const r = done[i];
      const record = { kind: "task", workload, name: t.name, arm: this.arm, ms: Math.round(r.ms), hung: !!r.hung, orphans: 0, incomplete: 0, lost: 0 };
      const fails = [];
      if (r.hung) fails.push(`no return within ${t.boundMs} ms`);
      if (r.fail) fails.push(r.fail);
      if (r.unobserved) {
        record.unobserved = true;
        fails.push(`K1 not observed: ${r.unobserved}`);
      }
      if (r.found) {
        record.orphans = r.found.proven.length + r.found.batch.length;
        record.incomplete = r.found.incomplete.length;
      }
      if (r.outcome) {
        const o = r.outcome;
        if (o.stopMs !== undefined) Object.assign(record, { stop_ms: Math.round(o.stopMs), grace_ms: o.graceMs });
        if (o.lost) record.lost = o.lost;
        if (o.skip) record.skip = o.skip;
      }
      if (fails.length > 0) record.fail = fails.join("; ");
      emit(record);
    });
  }
}

/** A record of a measurement that did not return within `boundMs` (K2), for those that are not batches (K4, K6). */
export const hung = (workload, name, boundMs) => ({
  kind: "task",
  workload,
  name,
  arm: "omni",
  ms: boundMs,
  hung: true,
  orphans: 0,
  incomplete: 0,
  lost: 0,
  fail: `no result within ${boundMs} ms`,
});

/** `--inject-orphan`: a process the task starts and never ends, with its marker and in its own group. K1 must count it. */
function injectOrphan(ctx) {
  const from = ctx.now();
  const leak = cpSpawn(setup.fixture, ["hang"], {
    env: { ...env, ...ctx.env },
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  ctx.root(leak.pid, from);
  leak.unref();
  process.stderr.write(`qa: --inject-orphan left pid ${leak.pid} behind\n`);
}

/** K5: bytes missing from `got`, different in it, or extra in it, against `want` (Buffers). */
export function lost(want, got) {
  let altered = 0;
  const n = Math.min(want.length, got.length);
  for (let i = 0; i < n; i++) if (want[i] !== got[i]) altered++;
  return altered + Math.abs(want.length - got.length);
}
