// What the entry points of this directory share: where things are, which runtime this is, and how a run ends.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OS } from "./runner/os.mjs";

/** `node`, `bun` or `deno`. */
export const runtime = globalThis.Bun ? "bun" : globalThis.Deno ? "deno" : "node";
/** The repository root. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The fixture (`omni-fixture`) and, for the library, the supervisor, from this checkout's Cargo target dir
 * (`cargo build --workspace --bins`) unless `HUGR_OMNI_FIXTURE` / `HUGR_OMNI_SUPERVISOR` say otherwise. A missing
 * binary throws: it is never skipped.
 */
export function binaries() {
  const exe = OS === "windows" ? ".exe" : "";
  const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");
  const find = (variable, name) => {
    const path = process.env[variable] ?? join(target, "debug", name + exe);
    if (!existsSync(path)) throw new Error(`${path} is missing: run \`cargo build --workspace --bins\` (or set ${variable})`);
    return path;
  };
  process.env.HUGR_OMNI_SUPERVISOR = find("HUGR_OMNI_SUPERVISOR", "hugr-omni-supervisor");
  return { fixture: find("HUGR_OMNI_FIXTURE", "omni-fixture") };
}

/** The package under test: `bindings/node/index.js` (CommonJS; `createRequire` reads it the same on Node, Bun and Deno). */
export const loadApi = () => createRequire(import.meta.url)("../index.js");

/** The command line that runs `script` under this runtime; `gc`: with a way to force a garbage collection (Bun has `Bun.gc`). */
export function hostCommand(script, args = [], { gc = false } = {}) {
  const flags = runtime === "deno" ? ["run", "-A", ...(gc ? ["--v8-flags=--expose-gc"] : [])] : runtime === "node" && gc ? ["--expose-gc"] : [];
  return [process.execPath, [...flags, script, ...args]];
}

/** Prints `line`, then ends the process with `code` once it is flushed: a live Child must never keep a finished run waiting. */
export function finish(line, code) {
  process.stdout.write(`${line}\n`, () => process.exit(code));
}
