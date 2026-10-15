// Runs the blocks of the docs for real (C-DOC-01): first the `sh` blocks, then `ts`, then `rust`, each `ts` and `rust`
// block in its own copy of fixture/ (a small project with a `dev` and a `test` script), so `npm run dev` in a block means
// what it means to a reader.
//
// sh    simple commands (blocks.mjs), run without a shell in the repository root, as in a checkout, with CARGO_TARGET_DIR
//       pointing into this run's scratch directory: `cargo build --release -p omni-supervisor` in the README builds the
//       supervisor there, and nothing already in target/ is relied on.
// ts    type-checked against bindings/node/index.d.ts and the Node 22 types (`@types/node`, as in a reader's project) and
//       compiled by TypeScript 5 (npm installs both once into a cache dir; `await using` does not parse on Node 22
//       otherwise), then run by the `node` that runs this script, with
//       HUGR_OMNI_SUPERVISOR pointing at this checkout's debug build. `hugr-omni` resolves to bindings/node/index.js
//       through a shim package.
// rust  a throwaway crate outside the workspace whose [dependencies] are the README's own `toml` block before the block
//       (hugr-omni by git URL, tokio with its features), except that hugr-omni's git URL is swapped for crates/hugr-omni
//       in this checkout; built with the repository's Cargo.lock and toolchain, so a feature the README forgot fails the build. It runs from its own directory with HUGR_OMNI_SUPERVISOR removed, and the supervisor the README's
//       `sh` block built placed next to the executable, the way the README tells a reader to: only the README's steps.
// A block passes when it exits 0 within the deadline. A timeout is a failure, never a skip. A `ts` or `rust` block that
// leaves a process behind also fails: fixture/dev.js writes `dev.pid`, and that pid must be gone, or only a zombie,
// when the block has ended; a pid whose state cannot be inspected fails too. What the runner needs and does not find
// (npm, cargo, a command of a `sh` block, the supervisor and the addon built) exits 2, never "skipped".

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commands } from "./blocks.mjs";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixture");
const EXE = process.platform === "win32" ? ".exe" : "";

/** A tool or input the runner needs is missing: exit 2. */
export class Unrunnable extends Error {}

const tail = (s) => s.trim().split("\n").slice(-12).join("\n");
const fwd = (p) => p.replaceAll("\\", "/");

function sh(cmd, args, options) {
  // npm is `npm.cmd` on Windows, which Node refuses to start without a shell: there it goes as one quoted command line
  // (the arguments are fixed by this script, not user input).
  const quote = (a) => (/[\s&|<>^"]/.test(a) ? `"${a}"` : a);
  const r =
    process.platform === "win32" && cmd === "npm"
      ? spawnSync(["npm", ...args.map(quote)].join(" "), { encoding: "utf8", shell: true, ...options })
      : spawnSync(cmd, args, { encoding: "utf8", ...options });
  if (r.error && r.error.code !== "ETIMEDOUT") throw new Unrunnable(`${cmd}: cannot be started (${r.error.code ?? r.error.message})`);
  return r;
}

/**
 * Is `pid` a live process? A zombie (exited, not yet reaped) is not: `kill(pid, 0)` succeeds on it, so the state is read
 * from the OS instead: /proc on Linux, `ps -o stat=` on macOS and other Unix, `tasklist` on Windows. A pid the OS does not
 * know is gone; anything the inspection cannot answer throws.
 */
export function isAlive(pid) {
  if (process.platform === "win32") {
    const r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
    if (r.error || r.status !== 0) throw new Error(`tasklist failed (${r.error?.code ?? r.status}): ${r.stderr.trim()}`);
    return r.stdout.split("\n").some((row) => row.split(",")[1]?.replaceAll('"', "").trim() === String(pid));
  }
  if (process.platform === "linux") {
    let stat;
    try {
      stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "ESRCH") return false;
      throw new Error(`/proc/${pid}/stat cannot be read (${e.code ?? e.message})`);
    }
    const state = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0];
    if (!/^[A-Za-z]$/.test(state)) throw new Error(`/proc/${pid}/stat has no state: ${stat.slice(0, 60)}`);
    return state !== "Z" && state !== "X";
  }
  const r = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
  if (r.error) throw new Error(`ps cannot be started (${r.error.code ?? r.error.message})`);
  const state = r.stdout.trim();
  if (r.status === 1 && state === "" && r.stderr.trim() === "") return false; // ps: no such process
  if (r.status !== 0 || state === "") throw new Error(`ps failed (${r.status}): ${r.stderr.trim() || "no state"}`);
  return !state.startsWith("Z");
}

/**
 * The pid files a block left in its project directory: `running` are alive (each one is ended), `unknown` cannot be
 * proven gone (not a pid, or the inspection failed). `alive` is the inspection, replaceable by a test.
 */
export function survivors(dir, alive = isAlive) {
  const running = [];
  const unknown = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".pid"))) {
    const pid = Number(readFileSync(join(dir, name), "utf8").trim());
    if (!Number.isInteger(pid) || pid <= 1) {
      unknown.push(`${name} (not a pid)`); // never signal 0 or 1: that reaches a whole group
      continue;
    }
    let live;
    try {
      live = alive(pid);
    } catch (e) {
      unknown.push(`${name} (pid ${pid}: cannot be inspected: ${e.message})`);
      continue;
    }
    if (!live) continue;
    running.push(`${name} (pid ${pid})`);
    try {
      process.kill(pid);
    } catch {
      // gone in between
    }
  }
  return { running, unknown };
}

/** Runs `cmd` in `cwd` for one `ts` or `rust` block; returns a violation text or null. `hint` is appended to a failure. */
function execute(block, cmd, args, cwd, env, ms, hint = "") {
  const where = `${block.file}:${block.line}`;
  const r = sh(cmd, args, { cwd, env, timeout: ms, killSignal: "SIGKILL" });
  const { running, unknown } = survivors(cwd);
  if (r.error?.code === "ETIMEDOUT") return `${where}: the ${block.lang} block did not finish in ${ms} ms (a hang is a failure)${hint}`;
  if (r.status !== 0) return `${where}: the ${block.lang} block exited ${r.status ?? r.signal}\n${tail(`${r.stdout}\n${r.stderr}`)}${hint}`;
  if (unknown.length > 0) return `${where}: the block ended, but it cannot be proven that it left nothing running: ${unknown.join(", ")}`;
  if (running.length > 0) return `${where}: the block ended but left running: ${running.join(", ")} (its tree was not stopped)`;
  return null;
}

/** The `sh` blocks, one simple command at a time, in the repository root. */
function runSh(blocks, work, env, ms, repo) {
  const out = [];
  const shEnv = { ...env, CARGO_TARGET_DIR: join(work, "target") };
  for (const b of blocks) {
    for (const c of commands(b.code)) {
      const [program, ...args] = c.argv;
      const r = sh(program, args, { cwd: repo, env: shEnv, timeout: Math.max(ms, 600_000), killSignal: "SIGKILL" });
      const failed =
        r.error?.code === "ETIMEDOUT" ? "did not finish in time (a hang is a failure)" : r.status !== 0 ? `exited ${r.status ?? r.signal}\n${tail(`${r.stdout}\n${r.stderr}`)}` : null;
      if (failed) {
        out.push(`${b.file}:${b.line}: the sh block's \`${c.line}\` ${failed}`);
        break;
      }
    }
  }
  return out;
}

/** TypeScript 5 and the Node 22 types, installed once into `cache`: a reader's project has `@types/node`, so a block may use `process` and `node:*`. */
const TS_PACKAGES = ["typescript@5", "@types/node@22"];

function typescript(cache) {
  const tsc = join(cache, "node_modules", "typescript", "bin", "tsc");
  const typeRoot = join(cache, "node_modules", "@types");
  const installed = () => existsSync(tsc) && existsSync(join(typeRoot, "node"));
  if (!installed()) {
    mkdirSync(cache, { recursive: true });
    const r = sh("npm", ["install", "--no-audit", "--no-fund", "--no-save", "--prefix", cache, ...TS_PACKAGES], { timeout: 300_000 });
    if (r.status !== 0 || !installed()) throw new Unrunnable(`npm cannot install ${TS_PACKAGES.join(" and ")} into ${cache} (network?):\n${tail(`${r.stdout}\n${r.stderr}`)}`);
  }
  return { tsc, typeRoot };
}

/** Runs the TypeScript blocks; returns the violations. */
function runTs(blocks, work, env, ms, repo, cache) {
  const supervisor = env.HUGR_OMNI_SUPERVISOR ?? join(process.env.CARGO_TARGET_DIR ?? join(repo, "target"), "debug", `hugr-omni-supervisor${EXE}`);
  if (!existsSync(supervisor)) {
    throw new Unrunnable(`${supervisor} is missing: run \`cargo build --workspace --bins\` and \`cargo build -p hugr-omni-node\` first`);
  }
  const tsEnv = { ...env, HUGR_OMNI_SUPERVISOR: supervisor };
  const out = [];
  const { tsc, typeRoot } = typescript(cache);
  const dirs = blocks.map((b, i) => {
    const dir = join(work, `p${i}`);
    cpSync(fixture, dir, { recursive: true });
    writeFileSync(join(dir, "block.mts"), b.code.endsWith("\n") ? b.code : `${b.code}\n`);
    return dir;
  });
  const shim = join(work, "node_modules", "hugr-omni");
  mkdirSync(shim, { recursive: true });
  writeFileSync(join(shim, "package.json"), JSON.stringify({ name: "hugr-omni", version: "0.0.0", main: "index.js" }));
  writeFileSync(join(shim, "index.js"), `module.exports = require(${JSON.stringify(join(repo, "bindings", "node", "index.js"))});\n`);
  writeFileSync(
    join(work, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler", types: ["node"], typeRoots: [fwd(typeRoot)],
        lib: ["es2022", "esnext.disposable", "dom"], paths: { "hugr-omni": [fwd(join(repo, "bindings", "node", "index.d.ts"))] },
      },
      include: ["p*/block.mts"],
    }),
  );
  const compiled = sh(process.execPath, [tsc, "-p", join(work, "tsconfig.json")], { cwd: work });
  if (compiled.status !== 0) {
    const text = `${compiled.stdout}${compiled.stderr}`.replace(/p(\d+)\/block\.mts\((\d+),/g, (_, i, n) => {
      const b = blocks[Number(i)];
      return `${b.file}:${b.line + Number(n)}:`; // the fence is one line above the first line of code
    });
    return [`TypeScript refused the blocks:\n${tail(text)}`];
  }
  blocks.forEach((b, i) => {
    const failure = execute(b, process.execPath, ["block.mjs"], dirs[i], tsEnv, ms);
    if (failure) out.push(failure);
  });
  return out;
}

/** Runs the Rust blocks; returns the violations. */
function runRust(blocks, work, env, ms, repo) {
  const out = [];
  const target = process.env.CARGO_TARGET_DIR ?? join(repo, "target");
  const supervisor = join(work, "target", "release", `hugr-omni-supervisor${EXE}`); // built by the README's `sh` block
  const runEnv = { ...env };
  delete runEnv.HUGR_OMNI_SUPERVISOR;
  blocks.forEach((b, i) => {
    const project = join(work, `r${i}`);
    cpSync(fixture, project, { recursive: true });
    const crate = join(work, `crate${i}`);
    mkdirSync(join(crate, "src"), { recursive: true });
    writeFileSync(join(crate, "src", "main.rs"), `${b.code}\n`);
    // The dependencies are the README's own `toml` block; the only change is hugr-omni's git URL, swapped for this checkout.
    const deps = b.deps.replace(/(^[ \t]*hugr-omni\s*=\s*\{[^}\n]*?)\bgit\s*=\s*"[^"\n]+"/m, `$1path = "${fwd(join(repo, "crates", "hugr-omni"))}"`);
    if (deps === b.deps) throw new Unrunnable(`${b.file}:${b.line}: the toml block before the rust block has no hugr-omni git dependency to point at this checkout`);
    writeFileSync(
      join(crate, "Cargo.toml"),
      `[package]\nname = "readme-block-${i}"\nversion = "0.0.0"\nedition = "2024"\npublish = false\n\n${deps.trim()}\n\n[workspace]\n`,
    );
    cpSync(join(repo, "Cargo.lock"), join(crate, "Cargo.lock"));
    // cwd = the repository, so rustup picks its rust-toolchain.toml; the crate is found by --manifest-path.
    const built = sh("cargo", ["build", "--quiet", "--manifest-path", join(crate, "Cargo.toml")], {
      cwd: repo, env: { ...runEnv, CARGO_TARGET_DIR: target }, timeout: 1_800_000,
    });
    if (built.status !== 0) {
      out.push(`${b.file}:${b.line}: the rust block does not build\n${tail(`${built.stdout}\n${built.stderr}`)}`);
      return;
    }
    // Next to its own copy of the executable, as the README says, and nowhere else: not the debug supervisor in target/.
    const bin = join(work, `bin${i}`);
    mkdirSync(bin);
    const exe = join(bin, `readme-block-${i}${EXE}`);
    copyFileSync(join(target, "debug", `readme-block-${i}${EXE}`), exe);
    const placed = existsSync(supervisor);
    if (placed) copyFileSync(supervisor, join(bin, `hugr-omni-supervisor${EXE}`));
    const hint = placed ? "" : "\n(no sh block of the docs built target/release/hugr-omni-supervisor, which the Rust example needs: cargo build --release -p omni-supervisor)";
    const failure = execute(b, exe, [], project, runEnv, ms, hint);
    if (failure) out.push(failure);
  });
  return out;
}

/** Runs every block it is given (`sh`, `ts`, `rust`); returns the violations. Throws `Unrunnable` when a tool or build is missing. */
export function runBlocks(blocks, { repo, timeoutMs, cache }) {
  const work = mkdtempSync(join(tmpdir(), "readme-check-"));
  try {
    const pick = (lang) => blocks.filter((b) => b.lang === lang);
    const out = [];
    if (pick("sh").length) out.push(...runSh(pick("sh"), work, process.env, timeoutMs, repo));
    if (pick("ts").length) out.push(...runTs(pick("ts"), work, process.env, timeoutMs, repo, cache));
    if (pick("rust").length) out.push(...runRust(pick("rust"), work, process.env, timeoutMs, repo));
    return out;
  } finally {
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // a temp directory some process still holds (Windows) is not worth failing the run for
    }
  }
}
