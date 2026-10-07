// hugr-omni for Node, Bun and Deno: the surface of index.d.ts over the native addon (bindings/node/src, W13).
// No process logic lives here (INV-01): every rule is the Rust core's. This file loads the addon, defines OmniError,
// and adapts the JS idioms to it: async iteration over the output, AbortSignal, `await using`. It installs no signal
// handler and no exit hook: when the host dies, the supervisor stops its trees (ADR-0005 §9).
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

/**
 * The platform packages `hugr-omni-<id>` (ADR-0004), by `<process.platform>-<process.arch>` and, on Linux, the C
 * library: each holds the addon and, next to it, the supervisor.
 */
const PLATFORMS = {
  "win32-x64": "win32-x64-msvc",
  "win32-arm64": "win32-arm64-msvc",
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64-glibc": "linux-x64-gnu",
  "linux-arm64-glibc": "linux-arm64-gnu",
  "linux-x64-musl": "linux-x64-musl",
  "linux-arm64-musl": "linux-arm64-musl",
};

/**
 * The C library this Linux process runs on, `"glibc"` or `"musl"`, the way napi-rs's loader and detect-libc tell them
 * apart, without a child process or a dependency: first the text of `/usr/bin/ldd` (glibc's script names the GNU C
 * Library, Alpine's runs the musl loader); else the diagnostic report, whose `header.glibcVersionRuntime` a glibc runtime
 * fills (Node, Bun and Deno) and a musl one leaves out (Node and Bun on Alpine, measured). With neither, glibc.
 */
function linuxLibc() {
  try {
    const ldd = readFileSync("/usr/bin/ldd", "latin1");
    if (ldd.includes("musl")) return "musl";
    if (ldd.includes("GNU C Library") || ldd.includes("GNU libc")) return "glibc";
  } catch {
    // no ldd (a distroless image), or reading it is denied (Deno without --allow-read): ask the report
  }
  try {
    const header = typeof process.report?.getReport === "function" ? process.report.getReport()?.header : undefined;
    if (header !== undefined && header !== null && typeof header === "object") return header.glibcVersionRuntime ? "glibc" : "musl";
  } catch {
    // no report (Deno without --allow-sys): undecided
  }
  return "glibc";
}

/** This process's key in PLATFORMS: `<platform>-<arch>`, plus `-<libc>` on Linux. */
const platformKey = () => `${process.platform}-${process.arch}${process.platform === "linux" ? `-${linuxLibc()}` : ""}`;

/** This checkout's Cargo build (`cargo build -p hugr-omni-node`), or `undefined`. */
function checkoutBuild() {
  const file = { darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" }[process.platform] ?? "libhugr_omni_node.so";
  const target = process.env.CARGO_TARGET_DIR ?? join(__dirname, "..", "..", "target");
  return ["debug", "release"].map((profile) => join(target, profile, file)).find((path) => existsSync(path));
}

/** The installed platform package's addon, or `undefined` (none installed, or none for this platform). */
function platformPackage(id) {
  if (id === undefined) return undefined;
  try {
    return require.resolve(`hugr-omni-${id}`); // its `main` is the addon
  } catch {
    return undefined; // not installed: a checkout, or the optional dependencies were skipped
  }
}

/** A path given by `configure()` or a variable: an empty string counts as not given. */
const given = (path) => (typeof path === "string" && path !== "" ? path : undefined);

/**
 * The addon, in this order (frozen, WP-H): `configure({ addon })`; `HUGR_OMNI_ADDON` as JS sees it; the installed platform
 * package; this checkout's Cargo build, only when nothing explicit was given (no `configure()` path, no variable), so a
 * bundle that baked a checkout's `__dirname` never picks that checkout up.
 */
function addonPath() {
  const explicit = given(config.addon) ?? given(process.env.HUGR_OMNI_ADDON);
  if (explicit !== undefined) return explicit;
  const platform = platformKey();
  const id = PLATFORMS[platform];
  const installed = platformPackage(id);
  if (installed !== undefined) return installed;
  const built = config.explicit ? undefined : checkoutBuild();
  if (built !== undefined) return built;
  if (id === undefined) {
    throw new Error(`hugr-omni: ${platform} is not supported. Supported: ${Object.values(PLATFORMS).join(", ")}.`);
  }
  throw new Error(
    `hugr-omni: the package hugr-omni-${id} (the native addon for ${platform}) is not installed. Reinstall hugr-omni with optional ` +
      `dependencies enabled (no --omit=optional / --no-optional). ` +
      "In a checkout, run `cargo build -p hugr-omni-node`; configure({ addon }) or HUGR_OMNI_ADDON sets the path.",
  );
}

/** What `configure()` was given; `explicit`: it was given a path, so the checkout fallback is off. */
const config = { addon: undefined, supervisor: undefined, explicit: false };
/** The loaded addon (lazily: at the first `configure()`, `run()` or `spawn()`) and the path it came from. */
let native;
let loadedFrom;
/** A `run()` or `spawn()` happened: `configure()` is refused from then on. */
let started = false;

function load() {
  if (native !== undefined) return native;
  const path = addonPath();
  const addon = { exports: {} };
  process.dlopen(addon, path);
  addon.exports.setup(OmniError); // the addon throws and rejects with this class
  [native, loadedFrom] = [addon.exports, path];
  // The supervisor, in this order: configure({ supervisor }); HUGR_OMNI_SUPERVISOR as JS sees it (Bun's process.env is
  // not the C environment); else the addon looks next to itself and next to the executable.
  const supervisor = given(config.supervisor) ?? given(process.env.HUGR_OMNI_SUPERVISOR);
  if (supervisor !== undefined) native.configure(supervisor);
  return native;
}

/** `INVALID_ARGUMENT` from this file (the addon may not be loaded yet). */
const refused = (message) => new OmniError("INVALID_ARGUMENT", `INVALID_ARGUMENT: ${message}`);

/** Where the addon and the supervisor are (WP-H); only before the first `run()` or `spawn()`. Loads the addon now. */
function configure(options) {
  if (options === null || typeof options !== "object") throw refused("configure() takes an object { addon?, supervisor? }; pass one.");
  for (const field of ["addon", "supervisor"]) {
    const value = options[field];
    if (value !== undefined && (typeof value !== "string" || value === "")) {
      throw refused(`configure(): ${field} is ${JSON.stringify(value) ?? typeof value}, which index.d.ts does not allow there; pass the full path as a non-empty string instead.`);
    }
  }
  if (started) throw refused("configure() was called after run() or spawn(); call it before the first run() or spawn().");
  if (native !== undefined && options.addon !== undefined && options.addon !== loadedFrom) {
    throw refused(`configure(): the addon is already loaded from "${loadedFrom}" and cannot change; call configure() once, before anything else.`);
  }
  if (options.addon !== undefined) config.addon = options.addon;
  if (options.supervisor !== undefined) config.supervisor = options.supervisor;
  config.explicit ||= options.addon !== undefined || options.supervisor !== undefined;
  if (native === undefined) load();
  else if (options.supervisor !== undefined) native.configure(options.supervisor);
}

class OmniError extends Error {
  constructor(code, message, result) {
    super(message);
    this.name = "OmniError";
    this.code = code;
    if (result != null) this.result = result;
  }
}

/**
 * `inheritEnv` (default `true`) inherits the environment JS sees, `process.env` (WP-H): under Bun, writes to it reach
 * neither the C environment nor a child otherwise. The addon gets `inheritEnv: false` with that environment merged under
 * `env`; names are compared ignoring case on Windows, so `Path` and `PATH` never both reach the child (H8). Anything
 * index.d.ts does not allow is passed through unchanged, for the addon to refuse with its usual message.
 */
function withEnv(options = {}) {
  if (options === null || typeof options !== "object" || (options.inheritEnv !== undefined && options.inheritEnv !== true)) return options;
  const own = options.env;
  if (own !== undefined && own !== null && typeof own !== "object") return options;
  const fold = process.platform === "win32" ? (name) => name.toUpperCase() : (name) => name;
  const env = {};
  const spelled = new Map();
  const put = (name, value) => {
    const key = fold(name);
    const before = spelled.get(key);
    if (before !== undefined) delete env[before];
    spelled.set(key, name);
    env[name] = value;
  };
  for (const [name, value] of Object.entries(process.env)) {
    // Names the OS cannot carry as variables (Windows' per-drive `=C:`) stay out.
    if (typeof value === "string" && name !== "" && !name.includes("=") && !name.includes("\0")) put(name, value);
  }
  for (const name of Object.keys(own ?? {})) {
    if (own[name] !== undefined) put(name, own[name]);
  }
  return { ...options, inheritEnv: false, env };
}

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
    const made = new (load().Cancel)();
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
    // Each next() hands over every item queued by then (H7a), so a burst costs one round trip, not one per chunk.
    for (let batch = await stream.next(); batch !== null; batch = await stream.next()) yield* batch;
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
  const native = load();
  started = true;
  const child = native.spawn(command, args ?? [], withEnv(options), cancelOf(options?.signal));
  return child.isPty ? new PtyChild(child) : new PipeChild(child);
}

function run(command, args, options) {
  return later(() => {
    const native = load();
    started = true;
    return native.run(command, args ?? [], withEnv(options), cancelOf(options?.signal));
  });
}

module.exports = { run, spawn, configure, OmniError };
