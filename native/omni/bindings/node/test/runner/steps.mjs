// Runs one scenario of `conformance/scenarios` (DSL: conformance/SPEC.md) through the public TS API (`api`: `run`,
// `spawn`, `OmniError`). `read` lives in `read.mjs`, the matchers in `expect.mjs`, the OS oracle in `os.mjs`.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Fail, asFail, check, exitFields, failure, harness, product, runFields } from "./expect.mjs";
import { OS, expectLife, tmp } from "./os.mjs";
import { read } from "./read.mjs";
import { action } from "./scenario.mjs";
import { hexBytes } from "./schema.mjs";

const STEP_MS = 10_000;
const CLEANUP_MS = 5_000;

/** Runs `sc` in a fresh `${TMP}`; throws the `Fail` that names the step, its action, and expected vs got. */
export async function runScenario(api, sc, fixture, seq) {
  const dir = tmp(seq);
  const ctx = new Ctx(api, fixture, dir);
  try {
    await ctx.steps(sc, dir);
  } finally {
    await ctx.cleanup(dir);
  }
}

/** The state of one scenario run. */
class Ctx {
  constructor(api, fixture, dir) {
    this.api = api;
    this.vars = new Map([["FIXTURE", [fixture]], ["TMP", [dir]], ["EXE", [OS === "windows" ? ".exe" : ""]]]);
    this.kids = new Map(); // handle -> { child, pty }
    this.loose = []; // children spawned without `as`
    this.runs = new Map(); // handle -> the outcome of a `run` with `await: false`, as a promise
    this.readers = new Map();
    this.abort = new AbortController(); // the signal every `run`/`spawn` of the scenario gets
  }

  async steps(sc, dir) {
    for (const [name, content] of sc.files()) {
      const path = join(dir, this.text(name));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, this.text(content));
    }
    for (const [i, s] of sc.steps().entries()) {
      try {
        await this.step(s);
      } catch (e) {
        throw asFail(e).at(`step ${i} (${action(s)[0]})`);
      }
    }
  }

  async step(s) {
    const [name, target] = action(s);
    const limit = s.timeoutMs ?? STEP_MS;
    const started = performance.now();
    let timer;
    const timeout = new Promise((_, reject) => {
      // Every action but `os` waits on the library; an `os` timeout is the oracle hanging.
      const fail = name === "os" ? harness(`the OS oracle timed out after ${limit} ms`) : product(`timed out after ${limit} ms`);
      timer = setTimeout(() => reject(fail), limit);
    });
    const acting = this.act(name, target, s);
    acting.catch(() => {}); // when the timeout wins, a later failure of the step has no one left to tell
    let outcome;
    try {
      outcome = await Promise.race([acting, timeout]);
    } finally {
      clearTimeout(timer);
    }
    check(s.expect === undefined ? {} : this.resolve(s.expect), outcome, performance.now() - started);
  }

  /** The step's outcome: `{ fields }`, or `{ error }` (an `OmniError`). */
  async act(name, target, s) {
    switch (name) {
      case "run": case "spawn": return this.start(name, target, s);
      case "abort":
        this.abort.abort();
        return { fields: {} };
      case "os": return this.os(target, s);
      case "write": return this.write(target, s);
      case "read": return read(this, target, s);
      case "wait": {
        const run = this.runs.get(target);
        if (run !== undefined) {
          this.runs.delete(target);
          return run;
        }
        return this.lib(async () => exitFields(await this.kid(target).child.wait()));
      }
      case "stop": {
        const { child } = this.kid(target);
        const stopped = s.graceMs === undefined ? () => child.stop() : () => child.stop({ graceMs: s.graceMs });
        return this.lib(async () => exitFields(await stopped()));
      }
      case "resize": {
        const { child, pty } = this.kid(target);
        if (!pty) throw harness("`resize` needs a PTY child");
        return this.lib(() => child.resize(s.cols, s.rows) ?? {});
      }
      case "processes": {
        const { child } = this.kid(target);
        const out = await this.lib(async () => {
          const entries = await child.processes();
          if (!Array.isArray(entries)) throw product("processes() did not return a list");
          return { entries };
        });
        if (!out.error && typeof s.capture === "string") {
          const pids = out.fields.entries.map((p) => String(p.pid));
          this.vars.set(s.capture, [...(this.vars.get(s.capture) ?? []), ...pids]);
        }
        return out;
      }
      default: throw harness(`unknown action ${name}`);
    }
  }

  /** `fn` makes one library call: its fields, or the `OmniError` it threw (anything else is the library's failure). */
  async lib(fn) {
    try {
      return { fields: await fn() };
    } catch (e) {
      if (e instanceof Fail) throw e;
      return failure(this.api, e);
    }
  }

  async start(name, target, s) {
    const options = s.options === undefined ? {} : this.resolve(s.options);
    const [command, ...args] = this.resolve(target);
    const opts = { signal: this.abort.signal };
    for (const [key, v] of Object.entries(options)) {
      if (v !== null && typeof v === "object" && "$number" in v) opts[key] = Number(v.$number); // NaN, Infinity, -Infinity
      else opts[key] = key === "input" ? payload(v) : v;
    }
    if (name === "run") {
      const outcome = this.lib(async () => runFields(await this.api.run(command, args, opts)));
      if (s.await !== false) return outcome;
      outcome.catch(() => {}); // a failure surfaces when the scenario waits for it
      this.runs.set(s.as, outcome);
      return { fields: {} };
    }
    let child;
    try {
      child = this.api.spawn(command, args, opts);
    } catch (e) {
      return failure(this.api, e);
    }
    if (s.as === undefined) {
      this.loose.push(child);
    } else {
      this.vars.set(`${s.as}.pid`, [String(child.pid)]);
      this.kids.set(s.as, { child, pty: options.pty !== undefined && options.pty !== false });
    }
    return { fields: {} };
  }

  async write(handle, s) {
    const { child, pty } = this.kid(handle);
    const data = s.data === undefined ? undefined : payload(this.resolve(s.data));
    const close = s.close ?? data === undefined; // SPEC: `write` without `data` only closes stdin
    if (close && pty) throw harness("`write` closes stdin, which a terminal does not have");
    return this.lib(async () => {
      if (data !== undefined) await child.write(data);
      if (close) await child.closeStdin();
      return {};
    });
  }

  /** `os`: every pid alive / dead per the OS, now or within `withinMs`. */
  async os(want, s) {
    const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : [String(v)]);
    const pids = flat(this.resolve(s.pids)).map((p) => {
      if (!/^\d+$/.test(p)) throw harness(`bad pid ${JSON.stringify(p)}`);
      return Number(p);
    });
    if (pids.length === 0) throw harness("no pids to check");
    await expectLife(pids, want === "alive", s.withinMs ?? 0);
    return { fields: {} };
  }

  kid(name) {
    const kid = this.kids.get(name);
    if (kid === undefined) throw harness(`no child named ${JSON.stringify(name)}`);
    return kid;
  }

  /**
   * Substitutes `${...}`: a string that is exactly one capture becomes its list (when it is not one value); inside a
   * longer string, a variable is its first value.
   */
  resolve(v) {
    if (typeof v === "string") {
      const whole = /^\$\{([^}]*)\}$/.exec(v);
      const vals = whole === null ? null : this.var(whole[1]);
      return vals !== null && vals.length !== 1 ? [...vals] : this.text(v);
    }
    if (Array.isArray(v)) return v.map((x) => this.resolve(x));
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.resolve(x)]));
    return v;
  }

  text(s) {
    return s.replace(/\$\{([^}]*)\}/g, (all, name) => {
      const [first] = this.var(name);
      if (first === undefined) throw new Error(`${all} has no value yet`);
      return first;
    });
  }

  var(name) {
    const vals = this.vars.get(name);
    if (vals === undefined) throw new Error(`unknown variable \${${name}}`);
    return vals;
  }

  /** Whatever is left: abort the signal, stop every child (best effort, bounded), remove `${TMP}`. */
  async cleanup(dir) {
    this.abort.abort();
    const children = [...this.kids.values()].map((k) => k.child).concat(this.loose);
    await Promise.all(children.map((c) => within((async () => c.stop({ graceMs: 0 }))(), CLEANUP_MS)));
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Text as is, or the raw bytes of `{ "hex": "..." }`. */
const payload = (v) => (typeof v === "string" ? v : hexBytes(v.hex));

/** Waits for `p` (its failure ignored) for at most `ms`. */
const within = (p, ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    p.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
