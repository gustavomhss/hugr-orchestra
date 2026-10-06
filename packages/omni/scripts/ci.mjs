#!/usr/bin/env node
// The CI gate: one step list for every OS, run the same way by GitHub Actions (.github/workflows/ci.yml) and by hand.
//
//   node scripts/ci.mjs            the fast gate (every push to main and bundle/*): static checks, clippy, the Rust suite
//                                  with the contract, and the contract and idioms through the TS binding on Node 22
//   node scripts/ci.mjs --release  adds what only a release needs: the musl supervisor, Node 24, Bun and Deno, every
//                                  docs block run for real, K4 on a release build and the npm packages (K9)
//
// A v* tag or RELEASE=1 means --release. TEST_FILTER is passed to `cargo test`. Stops at the first failing step and
// prints how long each step took.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const os = { linux: "linux", darwin: "darwin", win32: "windows" }[process.platform];
const release = process.argv.includes("--release") || process.env.RELEASE === "1" || /^v/.test(process.env.CI_COMMIT_TAG ?? "");
const target = process.env.CARGO_TARGET_DIR ?? "target";
const filter = (process.env.TEST_FILTER ?? "").split(" ").filter(Boolean);
const lint = ["linux"];
const npx = (...a) => ["npx", "-y", ...a];
const tsc = (p) => npx("-p", "typescript@5", "tsc", "-p", p);

function host() {
  return spawnSync("rustc", ["-vV"], { encoding: "utf8" }).stdout.match(/^host: (.+)$/m)[1];
}

// Each step: a name, a command (array, run without a shell) or a function, the OSes it runs on, and whether only a
// release runs it.
const steps = [
  // Static checks: the same on every OS, so only Linux runs them.
  { name: "file-size guard", on: lint, cmd: ["python3", "scripts/file-size-guard.py"] },
  { name: "file-size guard (own tests)", on: lint, cmd: ["python3", "scripts/test_file_size_guard.py"] },
  { name: "plan sections", on: lint, cmd: ["python3", "scripts/plan-sections-check.py"] },
  { name: "rustfmt", on: lint, cmd: ["cargo", "fmt", "--all", "--", "--check"] },
  { name: "surface checks (own tests)", on: lint, release: true, cmd: ["node", "--test", "scripts/surface-check/surface.test.mjs", "scripts/guarantees-check/check.test.mjs"] },
  { name: "surface parity", on: lint, cmd: ["node", "scripts/surface-check/parity.mjs"] },
  { name: "binding surface", on: lint, cmd: ["node", "scripts/surface-check/binding.mjs"] },
  { name: "guarantees ledger", on: lint, cmd: ["node", "scripts/guarantees-check/check.mjs"] },
  { name: "docs blocks (static)", on: lint, cmd: ["node", "scripts/readme-check/check.mjs", "--static"] },
  { name: "tsc", on: lint, cmd: tsc("bindings/node/tsconfig.json") },
  { name: "tsc (tests)", on: lint, cmd: tsc("bindings/node/test/tsconfig.json") },
  { name: "clippy", cmd: ["cargo", "clippy", "--workspace", "--all-targets", "--", "-D", "warnings"] },

  // The suite on this OS.
  { name: "build", cmd: ["cargo", "build", "--workspace", "--bins"] },
  { name: "build addon", cmd: ["cargo", "build", "-p", "hugr-omni-node"] },
  { name: "cargo test", cmd: ["cargo", "test", "--workspace", "--no-fail-fast", "--", ...filter] },
  { name: "TS runner teeth", cmd: ["node", "bindings/node/test/teeth.mjs"] },
  { name: "TS contract (node 22)", cmd: ["node", "bindings/node/test/contract.mjs"] },
  { name: "TS idioms (node 22)", cmd: ["node", "bindings/node/test/idioms.mjs"] },

  // Release only.
  { name: "musl supervisor", on: ["linux"], release: true, cmd: ["cargo", "build", "--release", "-p", "omni-supervisor", "--target", "x86_64-unknown-linux-musl"] },
  { name: "musl supervisor is static", on: ["linux"], release: true, run: () => {
    const elf = spawnSync("readelf", ["-l", join(target, "x86_64-unknown-linux-musl/release/hugr-omni-supervisor")], { encoding: "utf8" });
    return elf.status === 0 && !elf.stdout.includes("INTERP") ? null : "the supervisor is dynamically linked (or readelf failed)";
  } },
  { name: "supervisor suite (musl)", on: ["linux"], release: true, cmd: ["cargo", "test", "-p", "omni-supervisor", "--no-fail-fast"],
    env: () => ({ HUGR_OMNI_SUPERVISOR: join(process.cwd(), target, "x86_64-unknown-linux-musl/release/hugr-omni-supervisor") }) },
  ...["contract", "idioms"].flatMap((t) => [
    { name: `TS ${t} (node 24)`, release: true, cmd: npx("node@24", `bindings/node/test/${t}.mjs`) },
    { name: `TS ${t} (bun)`, release: true, cmd: npx("bun@1", `bindings/node/test/${t}.mjs`) },
    { name: `TS ${t} (deno)`, release: true, cmd: npx("deno@2", "run", "-A", `bindings/node/test/${t}.mjs`) },
  ]),
  { name: "docs blocks (run)", release: true, cmd: ["node", "scripts/readme-check/check.mjs"] },
  { name: "K4 (release build)", release: true, cmd: ["cargo", "build", "--release", "--workspace", "--bins"] },
  { name: "K4", release: true, cmd: ["cargo", "test", "--release", "-p", "hugr-omni", "--no-fail-fast", "--", "k4"] },
  ...packageSteps(),
];

// K9: the npm package of this OS, built as it ships and installed clean with npm, Bun and Deno.
function packageSteps() {
  const verify = (rt) => ({ name: `K9 verify (${rt})`, release: true, cmd: ["node", "bindings/node/npm/verify.mjs", "dist/tarballs", rt],
    env: () => ({ HUGR_BUN: "npx -y bun@1", HUGR_DENO: "npx -y deno@2" }) });
  const linux = "x86_64-unknown-linux-gnu";
  return [
    // Linux: built against glibc 2.17 with zig, and the floor checked.
    { name: "K9 zig", on: ["linux"], release: true, run: () => {
      for (const c of [["pip", "install", "--break-system-packages", "-q", "ziglang"], ["cargo", "install", "--locked", "-q", "cargo-zigbuild"]]) {
        if (spawnSync(c[0], c.slice(1), { stdio: "inherit" }).status !== 0) return `${c.join(" ")} failed`;
      }
      return null;
    } },
    { name: "K9 build", on: ["linux"], release: true, cmd: ["cargo", "zigbuild", "--release", "-p", "hugr-omni-node", "--target", `${linux}.2.17`] },
    { name: "K9 glibc floor", on: ["linux"], release: true, run: () => {
      const dump = spawnSync("objdump", ["-T", join(target, linux, "release/libhugr_omni_node.so")], { encoding: "utf8" }).stdout ?? "";
      const top = [...dump.matchAll(/GLIBC_([0-9.]+)/g)].map((m) => m[1]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
      return top === "2.17" ? null : `the addon needs GLIBC_${top}, above the 2.17 floor`;
    } },
    { name: "K9 pack", on: ["linux"], release: true, cmd: ["node", "bindings/node/npm/pack.mjs", "dist", "linux-x64-gnu"] },
    // macOS and Windows: this machine's triple.
    { name: "K9 build", on: ["darwin", "windows"], release: true, cmd: () => ["cargo", "build", "--release", "-p", "hugr-omni-node", "-p", "omni-supervisor", "--target", host()] },
    { name: "K9 pack", on: ["darwin", "windows"], release: true,
      cmd: () => ["node", "bindings/node/npm/pack.mjs", "dist", { darwin: host().startsWith("aarch64") ? "darwin-arm64" : "darwin-x64", windows: "win32-x64-msvc" }[os]] },
    ...["node", "bun", "deno"].map(verify),
  ];
}

const plan = steps.filter((s) => (!s.on || s.on.includes(os)) && (!s.release || release));
console.log(`ci: ${plan.length} steps on ${os}${release ? " (release)" : ""}`);
const times = [];
for (const s of plan) {
  console.log(`\n=== ${s.name}`);
  const t0 = Date.now();
  let failure = null;
  if (s.run) failure = s.run();
  else {
    const cmd = typeof s.cmd === "function" ? s.cmd() : s.cmd;
    // npx is a .cmd script on Windows, which Node starts only through a shell; its arguments here have no spaces.
    const shell = os === "windows" && cmd[0] === "npx";
    const r = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit", shell, env: { ...process.env, ...s.env?.() } });
    if (r.status !== 0) failure = `exit ${r.status ?? r.signal ?? r.error?.message}`;
  }
  times.push([s.name, (Date.now() - t0) / 1000]);
  if (failure) {
    report();
    console.error(`\nci: FAILED at "${s.name}": ${failure}`);
    process.exit(1);
  }
}
report();
console.log("\nci: green");

function report() {
  const total = times.reduce((a, [, t]) => a + t, 0);
  console.log("\n--- step times");
  for (const [n, t] of times) console.log(`${t.toFixed(1).padStart(7)} s  ${n}`);
  console.log(`${total.toFixed(1).padStart(7)} s  total`);
}
