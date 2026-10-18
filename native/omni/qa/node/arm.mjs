// The two arms behind one surface, as the Rust runner has them (qa/src/rust/arm.rs): `run` to completion, or `spawn`
// and drive a Proc (expect output, write, stop, wait). `omni` is the hugr-omni package; `std` is child_process the way
// a caller writes it: execFile-like collection, stdin left open (Node's default), a timeout or cancellation sends
// SIGTERM and SIGKILL after the grace to the root, and the result waits for the pipes to close. The only addition: on
// Unix the root is `detached` (its own group), which changes nothing about what kill() reaches but lets the oracle
// find its descendants.

import { spawn as cpSpawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const windows = process.platform === "win32";
const omni = createRequire(import.meta.url)(join(process.env.HUGR_QA_ROOT, "bindings/node/index.js"));

/** `spec`: { program, args, cwd?, env, timeoutMs?, graceMs, input?, cancelAfterMs?, stdinPipe?, maxOutputBytes? } */
export async function run(arm, spec, ctx) {
  return arm === "omni" ? omniRun(spec) : stdRun(spec, ctx);
}

export function spawn(arm, spec, ctx) {
  const from = ctx.now();
  let proc;
  if (arm === "omni") {
    const child = omni.spawn(spec.program, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      graceMs: spec.graceMs,
      stdin: spec.stdinPipe ? "pipe" : "closed",
    });
    proc = new OmniProc(child);
  } else {
    proc = new StdProc(stdChild(spec));
  }
  ctx.root(proc.pid, from);
  return proc;
}

/** omni only: inside a 100 x 30 terminal; `null` when the program is not installed. */
export function spawnPty(spec, ctx) {
  const from = ctx.now();
  let child;
  try {
    child = omni.spawn(spec.program, spec.args, { cwd: spec.cwd, env: spec.env, pty: { cols: 100, rows: 30 } });
  } catch (e) {
    if (e.code === "NOT_FOUND") return null;
    throw e;
  }
  ctx.root(child.pid, from);
  return new OmniProc(child);
}

/** omni `run()` in a terminal (the soak). */
export async function runPty(spec) {
  return omniRun({ ...spec, pty: true });
}

const howOf = { exit: "exit", signal: "signal", killed: "killed", timeout: "timeout", aborted: "aborted" };

async function omniRun(spec) {
  const abort = new AbortController();
  const timer = spec.cancelAfterMs === undefined ? undefined : setTimeout(() => abort.abort(), spec.cancelAfterMs);
  const options = {
    cwd: spec.cwd,
    env: spec.env,
    timeoutMs: spec.timeoutMs,
    graceMs: spec.graceMs,
    text: false,
    signal: abort.signal,
  };
  if (spec.input !== undefined) options.input = spec.input;
  if (spec.maxOutputBytes !== undefined) options.maxOutputBytes = spec.maxOutputBytes;
  if (spec.pty) options.pty = true;
  try {
    const result = await omni.run(spec.program, spec.args, options);
    return ran(howOf[result.reason], result);
  } catch (e) {
    if (e.code === "ABORTED" && e.result) return ran("aborted", e.result);
    if (e.code === "OUTPUT_LIMIT" && e.result) return ran("limit", e.result);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const ran = (how, r) => ({
  how,
  code: r.exitCode,
  out: Buffer.from(r.stdout),
  err: Buffer.from(r.stderr),
});

function stdChild(spec, stdin = "pipe") {
  const npm = windows && spec.program === "npm";
  return cpSpawn(spec.program, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    detached: !windows,
    shell: npm, // Node runs a .cmd only through a shell
    stdio: [stdin, "pipe", "pipe"],
    windowsHide: true,
  });
}

function stdRun(spec, ctx) {
  return new Promise((resolve, reject) => {
    const from = ctx.now();
    const child = stdChild(spec);
    if (child.pid !== undefined) ctx.root(child.pid, from);
    const out = [];
    const err = [];
    let how = "exit";
    const timers = [];
    const end = (why) => () => {
      how = why;
      child.kill("SIGTERM");
      timers.push(setTimeout(() => child.kill("SIGKILL"), spec.graceMs));
    };
    if (spec.timeoutMs !== undefined) timers.push(setTimeout(end("timeout"), spec.timeoutMs));
    if (spec.cancelAfterMs !== undefined) timers.push(setTimeout(end("aborted"), spec.cancelAfterMs));
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    if (spec.input !== undefined) child.stdin.end(spec.input);
    child.stdin.on("error", () => {}); // a child that exits before reading is normal
    child.on("error", (e) => {
      timers.forEach(clearTimeout);
      reject(e);
    });
    // Like execFile: the result is complete once the pipes closed, which a surviving descendant can delay.
    child.on("close", (code, signal) => {
      timers.forEach(clearTimeout);
      if (how === "exit" && signal) how = "signal";
      resolve({ how, code, out: Buffer.concat(out), err: Buffer.concat(err) });
    });
  });
}

/** The output read so far, terminal escapes removed (also across chunks), and where the last match ended. */
class Seen {
  text = "";
  at = 0;
  state = "none";
  push(chunk) {
    for (const c of chunk) {
      const s = this.state;
      if (s === "none") c === "\x1b" ? (this.state = "esc") : (this.text += c);
      else if (s === "esc") this.state = c === "[" ? "csi" : c === "]" ? "osc" : "none";
      else if (s === "csi") this.state = c >= "\x40" && c <= "\x7e" ? "none" : "csi";
      else if (s === "osc") this.state = c === "\x07" ? "none" : c === "\x1b" ? "oscEsc" : "osc";
      else this.state = "none";
    }
  }
  take(needle) {
    const i = this.text.indexOf(needle, this.at);
    if (i < 0) return false;
    this.at = i + needle.length;
    return true;
  }
  rest() {
    const rest = this.text.slice(this.at);
    this.at = this.text.length;
    return rest;
  }
  tail = () => this.text.slice(this.at).slice(-200);
}

const timeout = (ms) => {
  let timer;
  const promise = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("timed out")), ms)));
  return { promise, clear: () => clearTimeout(timer) };
};

class Proc {
  seen = new Seen();
  async expect(needle, withinMs) {
    const until = Date.now() + withinMs;
    while (!this.seen.take(needle)) {
      let more;
      try {
        more = await this.more(until);
      } catch (e) {
        throw new Error(`${e.message} waiting for ${JSON.stringify(needle)}; last output ${JSON.stringify(this.seen.tail())}`);
      }
      if (!more) throw new Error(`the output ended before ${JSON.stringify(needle)}: ${JSON.stringify(this.seen.tail())}`);
    }
  }
  async rest(withinMs) {
    const until = Date.now() + withinMs;
    while (await this.more(until));
    return this.seen.rest();
  }
}

class OmniProc extends Proc {
  #items;
  #pending;
  constructor(child) {
    super();
    this.child = child;
    this.pid = child.pid;
    this.#items = child.output[Symbol.asyncIterator]();
  }
  async more(until) {
    this.#pending ??= this.#items.next(); // a timed-out read stays pending for the next call: no chunk is lost
    const limit = timeout(Math.max(until - Date.now(), 0));
    try {
      const item = await Promise.race([this.#pending, limit.promise]);
      this.#pending = undefined;
      if (item.done) return false;
      this.seen.push(typeof item.value.data === "string" ? item.value.data : Buffer.from(item.value.data).toString());
      return true;
    } finally {
      limit.clear();
    }
  }
  write = (data) => this.child.write(data);
  async stop(graceMs) {
    const t0 = performance.now();
    await this.child.stop({ graceMs });
    return performance.now() - t0;
  }
  async wait(withinMs) {
    const limit = timeout(withinMs);
    try {
      return (await Promise.race([this.child.wait(), limit.promise])).exitCode;
    } finally {
      limit.clear();
    }
  }
}

class StdProc extends Proc {
  #queue = [];
  #wake;
  #open = 2;
  #exit;
  constructor(child) {
    super();
    this.child = child;
    this.pid = child.pid;
    this.#exit = new Promise((resolve, reject) => {
      child.on("exit", (code) => resolve(code));
      child.on("error", reject);
    });
    this.#exit.catch(() => {});
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (d) => this.#push(d));
      stream.on("close", () => this.#push(null));
    }
    child.stdin.on("error", () => {});
  }
  #push(item) {
    this.#queue.push(item);
    this.#wake?.();
  }
  async more(until) {
    for (;;) {
      if (this.#open === 0) return false;
      const item = this.#queue.shift();
      if (item === null) this.#open--;
      else if (item !== undefined) {
        this.seen.push(item.toString());
        return true;
      } else {
        const limit = timeout(Math.max(until - Date.now(), 0));
        try {
          await Promise.race([new Promise((resolve) => (this.#wake = resolve)), limit.promise]);
        } finally {
          limit.clear();
        }
      }
    }
  }
  write = (data) => new Promise((resolve, reject) => this.child.stdin.write(data, (e) => (e ? reject(e) : resolve())));
  /** SIGTERM to the root, SIGKILL after the grace: all child_process can do. */
  async stop(graceMs) {
    const t0 = performance.now();
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGTERM");
      const late = setTimeout(() => this.child.kill("SIGKILL"), graceMs);
      await this.#exit;
      clearTimeout(late);
    }
    return performance.now() - t0;
  }
  async wait(withinMs) {
    const limit = timeout(withinMs);
    try {
      return await Promise.race([this.#exit, limit.promise]);
    } finally {
      limit.clear();
    }
  }
}
