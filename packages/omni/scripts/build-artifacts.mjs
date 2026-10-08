#!/usr/bin/env node
// Builds one platform's shipped binaries, the addon and the supervisor, exactly as the npm packages carry them, and
// copies them out under one name per platform. The release workflow (.github/workflows/release.yml) and Orchestra's
// omni-artifacts workflow both call it; packing and proving stay with bindings/node/npm/{pack,verify}.mjs.
//
//   node scripts/build-artifacts.mjs <id> [--out <dir>]      (default --out: dist/omni, under this repository)
//
// writes <out>/<id>/hugr_omni.node and <out>/<id>/hugr-omni-supervisor[.exe]. The Cargo outputs stay where pack.mjs
// reads them: <CARGO_TARGET_DIR | ./target>/<triple>/release. Per id (the build column of bindings/node/npm/README.md):
//   zig     glibc Linux: the addon at the glibc 2.17 floor (cargo zigbuild, floor checked with objdump), the supervisor
//           static musl. Needs zig and cargo-zigbuild on the PATH.
//   alpine  musl Linux, inside rust:1-alpine (Docker) on a host of that CPU: the supervisor static (the target's
//           default), the addon with -crt-static so it links musl dynamically (checked with readelf).
//   native  macOS and Windows; on Windows the C runtime is static (.cargo/config.toml), checked in the import table.
// Run it from anywhere; Cargo runs in this repository (its .cargo/config.toml and rust-toolchain.toml apply). Any
// failure exits non-zero with the reason.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS, validateBinaries } from "../bindings/node/npm/pack.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");

/** The platforms: how each is built and the Rust triples of what it carries (the same triples as pack.mjs). */
const BUILDS = {
  "linux-x64-gnu": { build: "zig", addon: "x86_64-unknown-linux-gnu", supervisor: "x86_64-unknown-linux-musl" },
  "linux-arm64-gnu": { build: "zig", addon: "aarch64-unknown-linux-gnu", supervisor: "aarch64-unknown-linux-musl" },
  "linux-x64-musl": { build: "alpine", addon: "x86_64-unknown-linux-musl", supervisor: "x86_64-unknown-linux-musl" },
  "linux-arm64-musl": { build: "alpine", addon: "aarch64-unknown-linux-musl", supervisor: "aarch64-unknown-linux-musl" },
  "darwin-arm64": { build: "native", addon: "aarch64-apple-darwin", supervisor: "aarch64-apple-darwin" },
  "darwin-x64": { build: "native", addon: "x86_64-apple-darwin", supervisor: "x86_64-apple-darwin" },
  "win32-x64-msvc": { build: "native", addon: "x86_64-pc-windows-msvc", supervisor: "x86_64-pc-windows-msvc" },
  "win32-arm64-msvc": { build: "native", addon: "aarch64-pc-windows-msvc", supervisor: "aarch64-pc-windows-msvc" },
};

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = resolve(root, outAt >= 0 ? (args.splice(outAt, 2)[1] ?? "") : "dist/omni");
assert(outAt < 0 || out !== root, "--out needs a directory");
const [id, ...extra] = args;
assert(id && extra.length === 0, `usage: node scripts/build-artifacts.mjs <id> [--out <dir>] (id: one of ${Object.keys(PLATFORMS).join(", ")})`);
const p = BUILDS[id];
assert(p, `unknown platform ${id} (one of ${Object.keys(PLATFORMS).join(", ")})`);
assert.equal(process.platform, PLATFORMS[id].os, `${id} requires its native OS`);
assert.equal(process.arch, PLATFORMS[id].cpu, `${id} requires its native CPU`);

/** Runs `cmd` in this repository with its output on ours; a non-zero exit throws. */
function run(cmd, cmdArgs, env = {}) {
  console.log(`$ ${[cmd, ...cmdArgs].join(" ")}`);
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
}
/** The output of `cmd` run in this repository. */
const read = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8" });
const source = {
  headSHA: read("git", ["rev-parse", "HEAD"]).trim(),
  treeHash: read("git", ["rev-parse", "HEAD^{tree}"]).trim(),
  omniTreeHash: read("git", ["rev-parse", "HEAD:packages/omni"]).trim(),
};
if (process.env.HUGR_PROOF_HEAD) assert.equal(source.headSHA, process.env.HUGR_PROOF_HEAD, "checkout is not the current PR head");
console.log(`source proof ${JSON.stringify(source)}`);

const windows = id.startsWith("win32-");
const lib = windows ? "hugr_omni_node.dll" : id.startsWith("darwin-") ? "libhugr_omni_node.dylib" : "libhugr_omni_node.so";
const exe = `hugr-omni-supervisor${windows ? ".exe" : ""}`;
const addon = join(target, p.addon, "release", lib);
const supervisor = join(target, p.supervisor, "release", exe);

if (p.build !== "alpine") {
  // The toolchain rust-toolchain.toml names, with the targets this platform needs (the musl rows install theirs in Alpine).
  run("rustup", ["toolchain", "install", "--no-self-update"]);
  run("rustup", ["target", "add", ...new Set([p.addon, p.supervisor])]);
}

if (p.build === "zig") {
  // glibc Linux: the addon at the glibc 2.17 floor (zig), the supervisor static (musl).
  run("cargo", ["zigbuild", "--release", "-p", "hugr-omni-node", "--target", `${p.addon}.2.17`]);
  run("cargo", ["build", "--release", "-p", "omni-supervisor", "--target", p.supervisor]);
  // The highest GLIBC_ version the addon's dynamic symbols need. The positive control is that one is named at all.
  const versions = read("objdump", ["-T", addon]).match(/GLIBC_[0-9.]*/g) ?? [];
  const floor = versions.map((v) => [v, v.slice(6).split(".").map(Number)]).sort(([, a], [, b]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
    return 0;
  }).at(-1)?.[0];
  assert.equal(floor, "GLIBC_2.17", `the addon needs ${floor ?? "no GLIBC_ version (objdump read nothing)"}, not the 2.17 floor`);
} else if (p.build === "alpine") {
  // musl Linux, natively on Alpine (as napi-rs builds it): the supervisor static (the target's default), the addon a
  // cdylib that links musl dynamically (-crt-static, set here and not in .cargo/config.toml: it must not reach the
  // supervisor), so a musl Node or Bun can dlopen it. The container's CPU is the host's. The image writes ./target.
  assert(target === join(root, "target"), "the alpine build writes ./target: unset CARGO_TARGET_DIR");
  run("docker", ["run", "--rm", "-v", `${root}:/w`, "-w", "/w", "rust:1-alpine", "sh", "-euc", `
    apk add --no-cache gcc musl-dev >/dev/null
    rustup toolchain install
    cargo build --release -p omni-supervisor --target ${p.supervisor}
    RUSTFLAGS="-C target-feature=-crt-static" cargo build --release -p hugr-omni-node --target ${p.addon}`]);
  const dynamic = read("readelf", ["-d", addon]);
  console.log(dynamic);
  assert.match(dynamic, /NEEDED.*\[(libc\.musl-[^\]]*|libc\.so)\]/, "the addon does not link musl dynamically");
} else {
  run("cargo", ["build", "--release", "-p", "hugr-omni-node", "-p", "omni-supervisor", "--target", p.addon]);
  if (windows) {
    // H5: a static C runtime, so no Visual C++ Redistributable is needed (verify.mjs checks the installed files the
    // same way). KERNEL32 is the positive control: an import table read as empty would otherwise pass.
    for (const file of [addon, supervisor]) {
      const dlls = peImports(readFileSync(file));
      console.log(`CRT proof ${file}: ${JSON.stringify(dlls)}`);
      assert(dlls.some((d) => /^kernel32\.dll$/i.test(d)), `${file}: its import table reads ${JSON.stringify(dlls)}, without KERNEL32.dll`);
      const crt = dlls.filter((d) => /^(vcruntime|msvcp)/i.test(d));
      assert.deepEqual(crt, [], `${file} needs the Visual C++ runtime (${crt.join(", ")}): build it with +crt-static (.cargo/config.toml)`);
    }
  }
}

// The artifact: the two files under the names the packages and Orchestra's loader use.
const dir = join(out, id);
const binaries = validateBinaries(id, addon, supervisor);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
copyFileSync(addon, join(dir, "hugr_omni.node"));
copyFileSync(supervisor, join(dir, exe));
if (!windows) chmodSync(join(dir, exe), 0o755);
writeFileSync(join(dir, "proof.json"), JSON.stringify({
  id, source, host: { os: process.platform, cpu: process.arch }, binaries,
  sha256: Object.fromEntries(["hugr_omni.node", exe].map((name) => [name, createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")])),
  deno: p.build === "alpine" ? "N/A: Deno has no musl build" : "required clean-install proof",
}, null, 2));
console.log(`built ${id}: ${join(dir, "hugr_omni.node")} ${join(dir, exe)}`);

/** The DLL names a PE file imports (directly and delay-loaded); the same reader as verify.mjs. */
function peImports(pe) {
  const at = pe.readUInt32LE(0x3c);
  assert(pe.readUInt16LE(0) === 0x5a4d && pe.readUInt32LE(at) === 0x4550, "not a PE file");
  const coff = at + 4;
  const sections = pe.readUInt16LE(coff + 2);
  const optional = coff + 20;
  assert(pe.readUInt16LE(optional) === 0x20b, "not a PE32+ (64-bit) image");
  const table = optional + pe.readUInt16LE(coff + 16);
  const offset = (rva) => {
    for (let i = 0; i < sections; i++) {
      const s = table + i * 40;
      const [va, size, raw] = [pe.readUInt32LE(s + 12), Math.max(pe.readUInt32LE(s + 8), pe.readUInt32LE(s + 16)), pe.readUInt32LE(s + 20)];
      if (rva >= va && rva < va + size) return rva - va + raw;
    }
    throw new Error(`RVA ${rva} is in no section`);
  };
  const name = (rva) => {
    const from = offset(rva);
    return pe.toString("latin1", from, pe.indexOf(0, from));
  };
  const dlls = [];
  // Data directories 1 (imports, 20-byte descriptors, name at +12) and 13 (delay imports, 32-byte, name at +4).
  for (const [dir, size, nameAt] of [[1, 20, 12], [13, 32, 4]]) {
    const rva = pe.readUInt32LE(optional + 112 + dir * 8);
    if (rva === 0) continue;
    for (let d = offset(rva); pe.readUInt32LE(d + nameAt) !== 0; d += size) dlls.push(name(pe.readUInt32LE(d + nameAt)));
  }
  return dlls;
}
