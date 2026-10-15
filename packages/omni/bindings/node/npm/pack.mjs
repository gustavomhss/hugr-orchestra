// Assembles and packs the nine npm packages of hugr-omni (ADR-0004, W14) from binaries Cargo already built. It builds
// nothing and publishes nothing. Run it on a POSIX host (the supervisor must keep its execute bit in the tarball).
//
//   node bindings/node/npm/pack.mjs <out-dir> [platform ...]
//
// Reads `<CARGO_TARGET_DIR | ./target>/<triple>/release/...` (built with an explicit `--target`), writes the tarballs
// to `<out-dir>/tarballs` and the staged package directories to `<out-dir>/stage`. With no platform, all eight are
// required; naming some packs only those (a partial run, for a machine that builds only some of them).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nodeDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(nodeDir, "../..");
const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");

/**
 * The platform packages: the Rust triples of what each carries. The Linux supervisor is always the static musl build;
 * a musl addon is a cdylib linked against musl dynamically (built with `-C target-feature=-crt-static`), so a musl
 * Node or Bun can dlopen it.
 */
export const PLATFORMS = {
  "win32-x64-msvc": { os: "win32", cpu: "x64", addon: "x86_64-pc-windows-msvc", supervisor: "x86_64-pc-windows-msvc", lib: "hugr_omni_node.dll" },
  "win32-arm64-msvc": { os: "win32", cpu: "arm64", addon: "aarch64-pc-windows-msvc", supervisor: "aarch64-pc-windows-msvc", lib: "hugr_omni_node.dll" },
  "darwin-arm64": { os: "darwin", cpu: "arm64", addon: "aarch64-apple-darwin", supervisor: "aarch64-apple-darwin", lib: "libhugr_omni_node.dylib" },
  "darwin-x64": { os: "darwin", cpu: "x64", addon: "x86_64-apple-darwin", supervisor: "x86_64-apple-darwin", lib: "libhugr_omni_node.dylib" },
  "linux-x64-gnu": { os: "linux", cpu: "x64", libc: "glibc", addon: "x86_64-unknown-linux-gnu", supervisor: "x86_64-unknown-linux-musl", lib: "libhugr_omni_node.so" },
  "linux-arm64-gnu": { os: "linux", cpu: "arm64", libc: "glibc", addon: "aarch64-unknown-linux-gnu", supervisor: "aarch64-unknown-linux-musl", lib: "libhugr_omni_node.so" },
  "linux-x64-musl": { os: "linux", cpu: "x64", libc: "musl", addon: "x86_64-unknown-linux-musl", supervisor: "x86_64-unknown-linux-musl", lib: "libhugr_omni_node.so" },
  "linux-arm64-musl": { os: "linux", cpu: "arm64", libc: "musl", addon: "aarch64-unknown-linux-musl", supervisor: "aarch64-unknown-linux-musl", lib: "libhugr_omni_node.so" },
};
const FORMAT = { win32: "pe", darwin: "macho", linux: "elf" };
const licenses = Object.fromEntries(["LICENSE-MIT", "LICENSE-APACHE"].map((name) => [name, join(root, name)]));

/** What a binary is, from its headers: format, CPU and, for ELF, the libraries it needs (its DT_NEEDED names) and
 * whether it is statically linked: no PT_INTERP and no DT_NEEDED in its dynamic table (a static-pie keeps a PT_DYNAMIC
 * for its own relocations, with no DT_NEEDED). */
export function inspect(file) {
  const b = readFileSync(file);
  assert(b.length >= 64, `${file}: empty or truncated binary (${b.length} bytes)`);
  if (b.readUInt32BE(0) === 0x7f454c46 && b[4] === 2) {
    assert.equal(b[5], 1, `${file}: expected little-endian ELF`);
    const [phoff, size, count] = [Number(b.readBigUInt64LE(32)), b.readUInt16LE(54), b.readUInt16LE(56)];
    const headers = Array.from({ length: count }, (_, i) => phoff + i * size);
    assert(count > 0 && size >= 56 && phoff + count * size <= b.length, `${file}: empty or truncated ELF program headers`);
    const interp = headers.some((h) => b.readUInt32LE(h) === 3);
    // A virtual address to a file offset, through the PT_LOAD segment that maps it.
    const offset = (addr) => {
      const load = headers.find((h) => {
        const [vaddr, filesz] = [b.readBigUInt64LE(h + 16), b.readBigUInt64LE(h + 32)];
        return b.readUInt32LE(h) === 1 && addr >= vaddr && addr < vaddr + filesz;
      });
      assert(load !== undefined, `${file}: address ${addr} is in no PT_LOAD segment`);
      return Number(addr - b.readBigUInt64LE(load + 16) + b.readBigUInt64LE(load + 8));
    };
    const needed = [];
    let strtab;
    for (const h of headers.filter((h) => b.readUInt32LE(h) === 2)) {
      const [at, len] = [Number(b.readBigUInt64LE(h + 8)), Number(b.readBigUInt64LE(h + 32))];
      for (let e = at; e + 16 <= at + len; e += 16) {
        const tag = b.readBigInt64LE(e);
        if (tag === 0n) break;
        if (tag === 1n) needed.push(b.readBigUInt64LE(e + 8));
        if (tag === 5n) strtab = b.readBigUInt64LE(e + 8);
      }
    }
    assert(needed.length === 0 || strtab !== undefined, `${file}: DT_NEEDED without a DT_STRTAB`);
    const names = needed.map((n) => {
      const from = offset(strtab) + Number(n);
      return b.toString("latin1", from, b.indexOf(0, from));
    });
    return { format: "elf", cpu: { 62: "x64", 183: "arm64" }[b.readUInt16LE(18)], static: !interp && names.length === 0, needed: names };
  }
  if (b.readUInt32LE(0) === 0xfeedfacf) return { format: "macho", cpu: { 0x01000007: "x64", 0x0100000c: "arm64" }[b.readUInt32LE(4)] };
  if (b.readUInt16LE(0) === 0x5a4d) {
    const at = b.readUInt32LE(0x3c);
    assert.equal(b.readUInt32LE(at), 0x4550, `${file}: missing PE signature`);
    assert.equal(b.readUInt16LE(at + 24), 0x20b, `${file}: not a PE32+ image`);
    return { format: "pe", cpu: { 0x8664: "x64", 0xaa64: "arm64" }[b.readUInt16LE(at + 4)] };
  }
  throw new Error(`${file}: unknown binary format`);
}

/** Checks the actual shipped bytes, shared by build, pack and clean-install proofs. */
export function validateBinaries(id, addon, supervisor) {
  const p = PLATFORMS[id];
  assert(p, `unknown platform ${id}`);
  for (const file of [addon, supervisor]) assert(existsSync(file), `${file} is missing: build it first (npm/README.md)`);
  const want = { format: FORMAT[p.os], cpu: p.cpu };
  const lib = inspect(addon);
  assert.deepEqual({ format: lib.format, cpu: lib.cpu }, want, `${addon} is not a ${id} addon`);
  const sup = inspect(supervisor);
  assert.deepEqual({ format: sup.format, cpu: sup.cpu }, want, `${supervisor} is not a ${id} supervisor`);
  if (p.os === "linux") {
    assert(sup.static, `${supervisor} is dynamically linked: the Linux supervisor is the static musl build`);
    const musl = lib.needed.filter((n) => /^libc\.musl-|^ld-musl-|^libc\.so$/.test(n));
    const glibc = lib.needed.filter((n) => n === "libc.so.6");
    assert.equal(
      p.libc === "musl" ? musl.length > 0 && glibc.length === 0 : glibc.length > 0 && musl.length === 0,
      true,
      `${addon} is not a ${p.libc} addon: it needs ${JSON.stringify(lib.needed)}${p.libc === "musl" ? " (build it with RUSTFLAGS=\"-C target-feature=-crt-static\")" : ""}`,
    );
  }
  return { addon: lib, supervisor: sup };
}

export function validateRuntimeIdentity(identity, runtime, id) {
  assert(PLATFORMS[id], `unknown platform ${id}`);
  assert.equal(identity.runtime, runtime, `launcher did not execute ${runtime}`);
  assert.equal(identity.os, PLATFORMS[id].os, `${runtime}: wrong runtime OS for ${id}`);
  assert.equal(identity.cpu, PLATFORMS[id].cpu, `${runtime}: wrong runtime CPU for ${id}`);
  assert(identity.version && identity.execPath, `${runtime}: empty runtime identity`);
}

/** `npm` with `args` in `cwd` (no spaces in any argument; `npm` is a `.cmd` on Windows). */
const npm = (args, cwd) => execFileSync("npm", args, { cwd, encoding: "utf8", shell: process.platform === "win32" });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const [outArg, ...wanted] = process.argv.slice(2);
assert(outArg, "usage: node pack.mjs <out-dir> [platform ...]");
const out = resolve(outArg);
const ids = wanted.length > 0 ? wanted : Object.keys(PLATFORMS);
for (const id of ids) assert(PLATFORMS[id], `unknown platform ${id} (one of ${Object.keys(PLATFORMS).join(", ")})`);

// The main package: static optionalDependencies, exactly the eight platform packages at its own version, no scripts.
const main = JSON.parse(readFileSync(join(nodeDir, "package.json"), "utf8"));
assert.equal(main.scripts, undefined, "the main package has no scripts (no lifecycle script, ever)");
assert.deepEqual(
  main.optionalDependencies,
  Object.fromEntries(Object.keys(PLATFORMS).map((id) => [`hugr-omni-${id}`, main.version])),
  `package.json: optionalDependencies must be the ${Object.keys(PLATFORMS).length} platform packages, each at version ${main.version}`,
);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "tarballs"), { recursive: true });

/** Stages `files` (name in the package -> source) with `json` as its package.json, packs it, and checks the tarball. */
function pack(json, files, supervisor) {
  const dir = join(out, "stage", json.name);
  mkdirSync(dir, { recursive: true });
  for (const [name, from] of Object.entries(files)) copyFileSync(from, join(dir, name));
  if (supervisor) chmodSync(join(dir, supervisor), 0o755);
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(json, null, 2)}\n`);
  npm(["pack", "--silent", "--pack-destination", "../../tarballs"], dir);

  // The tarball as it is: exactly these files, the supervisor executable, no scripts. (`tar` runs next to it: GNU tar
  // reads `C:\...` as a remote host.)
  const tgz = `${json.name}-${json.version}.tgz`;
  const tar = (...args) => execFileSync("tar", args, { cwd: join(out, "tarballs"), encoding: "utf8" });
  const listing = tar("-tvzf", tgz).trim().split("\n").map((l) => l.split(/\s+/));
  assert.deepEqual(listing.map((l) => l.at(-1)).sort(), ["package.json", ...Object.keys(files)].map((n) => `package/${n}`).sort(), `${tgz}: unexpected contents`);
  if (supervisor && process.platform !== "win32") {
    assert(listing.find((l) => l.at(-1) === `package/${supervisor}`)[0].startsWith("-rwx"), `${supervisor} lost its execute bit in ${tgz}`);
  }
  assert.equal(JSON.parse(tar("-xzOf", tgz, "package/package.json")).scripts, undefined, `${tgz} has scripts`);
  console.log(`packed ${join(out, "tarballs", tgz)}`);
}

for (const id of ids) {
  const p = PLATFORMS[id];
  const exe = `hugr-omni-supervisor${p.os === "win32" ? ".exe" : ""}`;
  const addon = join(target, p.addon, "release", p.lib);
  const supervisor = join(target, p.supervisor, "release", exe);
  console.log(`binary proof ${id}: ${JSON.stringify(validateBinaries(id, addon, supervisor))}`);

  pack(
    {
      name: `hugr-omni-${id}`,
      version: main.version,
      description: `The native addon and the supervisor of hugr-omni for ${id}. Install hugr-omni, not this package.`,
      license: main.license,
      repository: main.repository,
      homepage: main.homepage,
      bugs: main.bugs,
      os: [p.os],
      cpu: [p.cpu],
      ...(p.libc && { libc: [p.libc] }),
      main: "hugr-omni.node",
      files: ["hugr-omni.node", exe, ...Object.keys(licenses)],
      engines: main.engines,
    },
    { "hugr-omni.node": addon, [exe]: supervisor, ...licenses },
    exe,
  );
}

// The main package is bindings/node/package.json plus the licenses (npm itself adds a README, once W18 writes one).
const readme = join(nodeDir, "README.md");
pack({ ...main, files: [...main.files, ...Object.keys(licenses)] }, {
  ...Object.fromEntries(main.files.map((f) => [f, join(nodeDir, f)])),
  ...licenses,
  ...(existsSync(readme) && { "README.md": readme }),
});
}
