// hugr-omni for Node, Bun and Deno: the surface of index.d.ts over the native addon (bindings/node/src, W13).
// No process logic lives here (INV-01): every rule is the Rust core's. This file loads the addon, defines OmniError,
// and adapts the JS idioms to it: async iteration over the output, AbortSignal, `await using`. It installs no signal
// handler and no exit hook: when the host dies, the supervisor stops its trees (ADR-0005 §9).
"use strict";

const { existsSync } = require("node:fs");
const { join } = require("node:path");

/** The platform packages `hugr-omni-<id>` (ADR-0004): each holds the addon and, next to it, the supervisor. */
const PLATFORMS = {
  "win32-x64": "win32-x64-msvc",
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64": "linux-x64-gnu",
  "linux-arm64": "linux-arm64-gnu",
};

/** This checkout's Cargo build (`cargo build -p hugr-omni-node`), or `undefined`. */
function checkoutBuild() {
  const file = { darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" }[process.platform] ?? "libhugr_omni_node.so";
  const target = process.env.CARGO_TARGET_DIR ?? join(__dirname, "..", "..", "target");
  return ["debug", "release"].map((profile) => join(target, profile, file)).find((path) => existsSync(path));
}

/** The addon: `HUGR_OMNI_ADDON`, else the installed platform package, else this checkout's Cargo build. */
function addonPath() {
  if (process.env.HUGR_OMNI_ADDON) return process.env.HUGR_OMNI_ADDON;
  const platform = `${process.platform}-${process.arch}`;
  const id = PLATFORMS[platform];
  if (id !== undefined) {
    try {
      return require.resolve(`hugr-omni-${id}`); // its `main` is the addon
    } catch {
      // not installed: a checkout, or the optional dependencies were skipped
    }
  }
  const built = checkoutBuild();
  if (built !== undefined) return built;
  if (id === undefined) {
    throw new Error(`hugr-omni: ${platform} is not supported. Supported: ${Object.values(PLATFORMS).join(", ")} (Linux needs glibc).`);
  }
  throw new Error(
    `hugr-omni: the package hugr-omni-${id} (the native addon for ${platform}) is not installed. Reinstall hugr-omni with optional ` +
      `dependencies enabled (no --omit=optional / --no-optional)${process.platform === "linux" ? "; Linux needs glibc, Alpine (musl) is not supported" : ""}. ` +
      "In a checkout, run `cargo build -p hugr-omni-node`; HUGR_OMNI_ADDON overrides the path.",
  );
}

const addon = { exports: {} };
process.dlopen(addon, addonPath());
const native = addon.exports;

class OmniError extends Error {
  constructor(code, message, result) {
    super(message);
    this.name = "OmniError";
    this.code = code;
    if (result != null) this.result = result;
  }
}
native.setup(OmniError); // the addon throws and rejects with this class

/** A promise for `start()`, which may also throw synchronously (an option refused while the addon converts it). */
function later(start) {
  try {
    return start();
  } catch (e) {
    return Promise.reject(e);
  }
}

/**
 * One native cancellation per AbortSignal (one listener per signal, however many runs and children share it). Any other
 * value is left to the addon, which refuses it as `INVALID_ARGUMENT` naming `signal`.
 */
const cancels = new WeakMap();
function cancelOf(signal) {
  if (typeof signal !== "object" || signal === null || typeof signal.addEventListener !== "function") return undefined;
  let cancel = cancels.get(signal);
  if (cancel === undefined) {
    const made = new native.Cancel();
    if (signal.aborted) made.cancel();
    else signal.addEventListener("abort", () => made.cancel(), { once: true });
    cancels.set(signal, (cancel = made));
  }
  return cancel;
}

/** The single output consumer as an async iterable: claimed when iteration starts, detached for good when it ends. */
const consumer = (child, lines) => ({ [Symbol.asyncIterator]: () => items(child.claim(lines)) });

async function* items(stream) {
  try {
    for (let item = await stream.next(); item !== null; item = await stream.next()) yield item;
  } finally {
    stream.detach();
  }
}

const asyncDispose = Symbol.asyncDispose ?? Symbol.for("Symbol.asyncDispose");

class Child {
  #native;
  #exit;

  constructor(native) {
    this.#native = native;
    // Asked once, at spawn, and handed to every wait(): while it is pending, the child holds the event loop.
    this.#exit = native.exited();
    this.#exit.catch(() => {}); // a failure is for wait() to report, never an unhandled rejection
  }

  get pid() {
    return this.#native.pid;
  }

  get output() {
    return consumer(this.#native, false);
  }

  lines() {
    return consumer(this.#native, true);
  }

  get droppedBytes() {
    return this.#native.droppedBytes();
  }

  write(data) {
    return later(() => this.#native.write(data));
  }

  wait() {
    return this.#exit;
  }

  stop(options) {
    return later(() => this.#native.stop(options?.graceMs));
  }

  processes() {
    return this.#native.processes();
  }

  /** `await using`: leaving the scope awaits `stop()`. */
  [asyncDispose]() {
    return this.stop().then(() => undefined);
  }
}

class PipeChild extends Child {
  #native;

  constructor(native) {
    super(native);
    this.#native = native;
  }

  closeStdin() {
    return this.#native.closeStdin();
  }
}

class PtyChild extends Child {
  #native;

  constructor(native) {
    super(native);
    this.#native = native;
  }

  resize(cols, rows) {
    this.#native.resize(cols, rows);
  }
}

function spawn(command, args, options) {
  const child = native.spawn(command, args ?? [], options, cancelOf(options?.signal));
  return child.isPty ? new PtyChild(child) : new PipeChild(child);
}

function run(command, args, options) {
  return later(() => native.run(command, args ?? [], options, cancelOf(options?.signal)));
}

module.exports = { run, spawn, OmniError };
