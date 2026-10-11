// C-ARC-01: all process semantics live in the Rust core; a binding only converts types and the async model.
// This reads the Node binding's own sources (bindings/node/index.js, bindings/node/src/**/*.rs, bindings/node/build.rs,
// the dependencies of bindings/node/Cargo.toml) and fails when they spawn a process, signal one, or implement a timeout
// themselves. bindings/python joins the list of roots in v0.2.
//
// Scope: these checks catch honest drift by our own contributors (a renamed option, a forgotten README update, a binding
// that starts spawning), not an adversary deliberately evading them.
//
// What it does, exactly:
//   - JavaScript: a raw-text scan of index.js for the spellings in JS_DENIED. It does not strip comments or strings, so a
//     denied word in a comment is a (cheap, one-line) false failure, never a miss. index.js loading another local file
//     (`require("./x")`, `from "./x"`) is refused, since that file would not be read;
//   - JavaScript also: a `require(` or `import(` whose argument is not a string literal is refused (it loads a file this
//     check cannot name);
//   - Rust: a binding that depends on the core and Node-API alone can still spawn through `std::process` (or its
//     `std::os::*::process` extensions), so every path through `std` that reaches a `process` segment is refused, in these
//     spellings: written out (`std::process::Command`, `std :: process`, `::std::process`), imported through any `use`
//     tree (`use std::{process::{self, Command}}`, `use std::{self, process}`, `use std::os::unix::process::..`), or made
//     reachable (`use std::*`, any `std` glob, `use std as s`, `extern crate`). `use` statements are expanded by a small
//     parser and refused when they cannot be read. A binding can also signal or fork through its own FFI (`unsafe` is
//     allowed in bindings, and it could declare `kill`, `fork` or, on Windows, `TerminateProcess` itself), so `extern`
//     blocks and `extern fn`s, `#[link]`, `#[link_name]`, `#[no_mangle]`, `#[export_name]` and `asm!` are refused. Node-API
//     can also run JavaScript (`Env::run_script`), so `run_script` is refused, and every spelling in JS_DENIED is denied
//     in the Rust sources too (it would be a string literal handed to the engine). The other spellings in RUST_DENIED
//     are a raw-text scan;
//   - a file in bindings/node/src that is not `.rs` is refused (this check does not read it);
//   - the binding crate may depend only on the core and Node-API crates (ALLOWED_DEPS), so no crate that wraps the OS's
//     process calls (`libc`, `windows-sys`, `nix`, `tokio` with `process`) is linked. The manifest is read by cargo itself
//     (`cargo metadata --no-deps`), so a `[dependencies.libc]` table, a `[target.'cfg(..)'.dependencies]` one, a dotted
//     key, an inherited `workspace = true` and a renamed dependency (`foo = { package = "libc" }`, checked by its real
//     package name) are all seen; a manifest cargo cannot read exits 2. Dev-dependencies are not shipped in the addon and
//     are not looked at.
// What it does not do: see a spelling it does not list in JavaScript (a computed property name, an alias of `require`,
// `process.binding` through a variable), or Rust written by a macro or with a comment inside a path (`std::/* */process`).
// Timeouts are scanned for in JavaScript only (`setTimeout`, `AbortSignal.timeout`, `timers/promises`, ...): in Rust the
// binding has timers of its own for its housekeeping (exec.rs), and no spelling tells those from a process timeout, so
// that is for review. index.js is under ~200 lines by W13's card; review reads it once. A source it cannot read exits 2,
// never 0.
//
//   node scripts/surface-check/binding.mjs [--root <repository root>]
// Exit: 0 clean · 1 violations (each names file, line and word) · 2 an input cannot be read, or an argument is unknown.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Unreadable, rootArg } from "./dts.mjs";

const NODE = "bindings/node";
const JS_DENIED = [
  "child_process", "process.kill", ".kill(", "setTimeout", "setInterval", "AbortSignal.timeout",
  "Bun.spawn", "Bun.$", "Deno.Command", "Deno.run", "Deno.kill", "process.binding", "internalBinding",
  "cluster", "timers/promises", "scheduler.wait", "getBuiltinModule",
];
/** A `require(` or `import(` whose argument is not a string literal: it could load anything, and is not read. */
const JS_COMPUTED = /\b(?:require|import)\s*\(\s*(?!["'])/;
const JS_LOCAL = /(?:require\(\s*|\bfrom\s+|\bimport\(\s*)["'`]\.{1,2}\//;
const RUST_DENIED = ["tokio::process", "libc", "nix::", "windows_sys", ".kill(", "run_script"];
const ALLOWED_DEPS = { normal: ["hugr-omni", "napi", "napi-derive"], build: ["napi-build"] };

const read = (root, path) => {
  try {
    return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
  } catch (e) {
    throw new Unreadable(`${path}: cannot be read (${e.code ?? e.message})`);
  }
};

/** The files under `dir`: `{ rust, other }`, paths relative to `root`. */
function listing(root, dir) {
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch (e) {
    throw new Unreadable(`${dir}: cannot be listed (${e.code ?? e.message})`);
  }
  const out = { rust: [], other: [] };
  for (const e of entries) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      const sub = listing(root, path);
      out.rust.push(...sub.rust);
      out.other.push(...sub.other);
    } else (e.name.endsWith(".rs") ? out.rust : out.other).push(path);
  }
  return out;
}

/** The paths a `use` tree names, as segment lists: `std::{process::{self, Command}, io}` is `std::process`, `std::process::Command`, `std::io`. */
function expandUse(src, where) {
  const left = src.replace(/::|[{},*]|\w+|\s+/g, "");
  if (left !== "") throw new Unreadable(`${where}: cannot read the use declaration \`use ${src.trim().slice(0, 70)}\``);
  const t = src.match(/::|[{},*]|\w+/g) ?? [];
  let p = 0;
  const fail = () => {
    throw new Unreadable(`${where}: cannot read the use declaration \`use ${src.trim().slice(0, 70)}\``);
  };
  function tree(prefix) {
    if (t[p] === "::") p++;
    const path = [...prefix];
    for (;;) {
      if (t[p] === "{") {
        p++;
        const out = [];
        for (;;) {
          out.push(...tree(path));
          if (t[p] === ",") {
            p++;
            if (t[p] === "}") {
              p++;
              return out;
            }
          } else if (t[p] === "}") {
            p++;
            return out;
          } else fail();
        }
      }
      if (t[p] === "*") {
        p++;
        return [[...path, "*"]];
      }
      if (!/^\w+$/.test(t[p] ?? "")) fail();
      if (!(t[p] === "self" && prefix.length > 0)) path.push(t[p]);
      p++;
      if (t[p] === "::") {
        p++;
        continue;
      }
      if (t[p] === "as") p += 2;
      return [path];
    }
  }
  const paths = tree([]);
  if (p !== t.length) fail();
  return paths;
}

/** What one Rust source's text spawns or could spawn with: `{ line, what }` for each spelling of `std` reaching `process`. */
function rustViolations(text, file) {
  const found = [];
  const lineOf = (index) => text.slice(0, index).split("\n").length;
  for (const m of text.matchAll(/\bstd\s*::(?:\s*\w+\s*::)*?\s*process\b/g)) found.push({ line: lineOf(m.index), what: "std::process" });
  for (const m of text.matchAll(/^[ \t]*(?:pub(?:\([^)]*\))?[ \t]+)?use[ \t]+/gm)) {
    const line = lineOf(m.index);
    const start = m.index + m[0].length;
    const end = text.indexOf(";", start);
    if (end < 0) throw new Unreadable(`${file}:${line}: a use declaration is never closed by \`;\``);
    for (const path of expandUse(text.slice(start, end), `${file}:${line}`)) {
      if (path[0] !== "std") continue;
      if (path.includes("process")) found.push({ line, what: `use ${path.join("::")}` });
      else if (path.length === 1 || path.at(-1) === "*") found.push({ line, what: `use ${path.join("::")} (a root or glob import of std can bring process into scope)` });
    }
  }
  for (const m of text.matchAll(/^[ \t]*extern[ \t]+crate\b/gm)) found.push({ line: lineOf(m.index), what: "extern crate" });
  for (const m of text.matchAll(/\bextern\s*(?:"[^"]*"\s*)?(?:\{|fn\b)/g)) found.push({ line: lineOf(m.index), what: "an extern block or extern fn (the binding's own FFI)" });
  for (const m of text.matchAll(/#\s*\[\s*(?:unsafe\s*\(\s*)?(?:link|link_name|no_mangle|export_name)\b/g)) found.push({ line: lineOf(m.index), what: "#[link], #[no_mangle] or #[export_name] (the binding's own FFI)" });
  for (const m of text.matchAll(/\b(?:global_)?asm\s*!/g)) found.push({ line: lineOf(m.index), what: "asm! (inline assembly can make system calls)" });
  return found;
}

/** The dependencies of the binding crate, as cargo reads them: `{ name, kind }`, `name` the real package (not a rename). */
function dependencies(root) {
  const manifest = join(root, NODE, "Cargo.toml");
  read(root, `${NODE}/Cargo.toml`);
  const r = spawnSync("cargo", ["metadata", "--no-deps", "--offline", "--format-version", "1", "--manifest-path", manifest], {
    encoding: "utf8", cwd: root, maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) throw new Unreadable(`${NODE}/Cargo.toml: cargo cannot be started to read it (${r.error.code ?? r.error.message})`);
  if (r.status !== 0) throw new Unreadable(`${NODE}/Cargo.toml: cargo cannot read it:\n${r.stderr.trim().split("\n").slice(-6).join("\n")}`);
  let meta;
  try {
    meta = JSON.parse(r.stdout);
  } catch {
    throw new Unreadable(`${NODE}/Cargo.toml: cargo metadata did not answer JSON`);
  }
  const real = realpathSync(manifest);
  const pkg = (meta.packages ?? []).find((p) => realpathSync(p.manifest_path) === real);
  if (!pkg) throw new Unreadable(`${NODE}/Cargo.toml: cargo metadata does not list the binding package`);
  return pkg.dependencies.filter((d) => d.kind !== "dev").map((d) => ({ name: d.name, kind: d.kind ?? "normal" }));
}

/** Runs the check; returns the violations. Throws `Unreadable` when a source cannot be read. */
export function check(root) {
  const out = [];
  const why = "process control belongs to the Rust core";
  const scanRaw = (file, text, denied) => {
    text.split("\n").forEach((line, i) => {
      for (const word of denied) if (line.includes(word)) out.push(`${file}:${i + 1}: \`${word}\`: ${why}`);
    });
  };
  const scanRust = (file, text) => {
    scanRaw(file, text, [...RUST_DENIED, ...JS_DENIED]); // JavaScript the binding hands to the engine is a string literal in Rust
    const seen = new Set();
    for (const { line, what } of rustViolations(text, file)) {
      if (!seen.has(line)) out.push(`${file}:${line}: \`${what}\`: ${why}`);
      seen.add(line);
    }
  };

  const js = read(root, `${NODE}/index.js`);
  scanRaw(`${NODE}/index.js`, js, JS_DENIED);
  js.split("\n").forEach((line, i) => {
    if (JS_LOCAL.test(line)) out.push(`${NODE}/index.js:${i + 1}: loads another local file, which this check does not read`);
    if (JS_COMPUTED.test(line)) out.push(`${NODE}/index.js:${i + 1}: a require() or import() whose argument is not a string literal loads a file this check cannot name`);
  });
  const { rust, other } = listing(root, `${NODE}/src`);
  if (rust.length === 0) throw new Unreadable(`${NODE}/src: no .rs file found (the scan came back EMPTY)`);
  for (const f of rust) scanRust(f, read(root, f));
  for (const f of other) out.push(`${f}: a file in the binding's sources that is not .rs; this check does not read it`);
  try {
    scanRust(`${NODE}/build.rs`, read(root, `${NODE}/build.rs`));
  } catch (e) {
    if (!(e instanceof Unreadable) || !/ENOENT/.test(e.message)) throw e; // a binding without a build script is fine
  }
  const deps = dependencies(root);
  if (deps.length === 0) throw new Unreadable(`${NODE}/Cargo.toml: no dependency found (the manifest came back EMPTY)`);
  for (const { name, kind } of deps) {
    if (!ALLOWED_DEPS[kind]?.includes(name)) out.push(`${NODE}/Cargo.toml: ${kind} dependency \`${name}\` is not one of ${(ALLOWED_DEPS[kind] ?? []).join(", ") || "(none)"}`);
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = rootArg(process.argv, resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
    const violations = check(root);
    if (violations.length > 0) {
      for (const v of violations) console.error(`surface-check: FAIL ${v}`);
      console.error(`surface-check: ${violations.length} violation(s)`);
      process.exit(1);
    }
    console.log("surface-check: binding sources OK (no std path reaching process, no extern/FFI item, none of the listed JavaScript spellings; dependencies: the core and Node-API only)");
  } catch (e) {
    console.error(`surface-check: CANNOT READ ${e instanceof Unreadable ? e.message : (e?.stack ?? e)}`);
    process.exit(2);
  }
}
