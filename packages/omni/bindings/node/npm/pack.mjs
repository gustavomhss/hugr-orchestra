// Assembles and packs the six npm packages of hugr-omni (ADR-0004, W14) from binaries Cargo already built. It builds
// nothing and publishes nothing. Run it on a POSIX host (the supervisor must keep its execute bit in the tarball).
//
//   node bindings/node/npm/pack.mjs <out-dir> [platform ...]
//
// Reads `<CARGO_TARGET_DIR | ./target>/<triple>/release/...` (built with an explicit `--target`), writes the tarballs
// to `<out-dir>/tarballs` and the staged package directories to `<out-dir>/stage`. With no platform, all five are
// required; naming some packs only those (a partial run, for a machine that builds only some of them).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nodeDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(nodeDir, "../..");
const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");

/** The platform packages: the Rust triples of what each carries (the Linux supervisor is the static musl build). */
const PLATFORMS = {
  "win32-x64-msvc": { os: "win32", cpu: "x64", addon: "x86_64-pc-windows-msvc", supervisor: "x86_64-pc-windows-msvc", lib: "hugr_omni_node.dll" },
  "darwin-arm64": { os: "darwin", cpu: "arm64", addon: "aarch64-apple-darwin", supervisor: "aarch64-apple-darwin", lib: "libhugr_omni_node.dylib" },
  "darwin-x64": { os: "darwin", cpu: "x64", addon: "x86_64-apple-darwin", supervisor: "x86_64-apple-darwin", lib: "libhugr_omni_node.dylib" },
  "linux-x64-gnu": { os: "linux", cpu: "x64", libc: "glibc", addon: "x86_64-unknown-linux-gnu", supervisor: "x86_64-unknown-linux-musl", lib: "libhugr_omni_node.so" },
  "linux-arm64-gnu": { os: "linux", cpu: "arm64", libc: "glibc", addon: "aarch64-unknown-linux-gnu", supervisor: "aarch64-unknown-linux-musl", lib: "libhugr_omni_node.so" },
};
const FORMAT = { win32: "pe", darwin: "macho", linux: "elf" };
const licenses = Object.fromEntries(["LICENSE-MIT", "LICENSE-APACHE"].map((name) => [name, join(root, name)]));

/** What a binary is, from its headers: format, CPU and, for ELF, whether it is statically linked: no PT_INTERP and
 * no DT_NEEDED in its dynamic table (a static-pie keeps a PT_DYNAMIC for its own relocations, with no DT_NEEDED). */
function inspect(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x7f454c46 && b[4] === 2) {
    const [phoff, size, count] = [Number(b.readBigUInt64LE(32)), b.readUInt16LE(54), b.readUInt16LE(56)];
    const headers = Array.from({ length: count }, (_, i) => phoff + i * size);
    const interp = headers.some((h) => b.readUInt32LE(h) === 3);
    const needed = headers
      .filter((h) => b.readUInt32LE(h) === 2)
      .some((h) => {
        const [at, len] = [Number(b.readBigUInt64LE(h + 8)), Number(b.readBigUInt64LE(h + 32))];
        for (let e = at; e + 16 <= at + len; e += 16) {
          const tag = b.readBigInt64LE(e);
          if (tag === 0n) return false;
          if (tag === 1n) return true;
        }
        return false;
      });
    return { format: "elf", cpu: { 62: "x64", 183: "arm64" }[b.readUInt16LE(18)], static: !interp && !needed };
  }
  if (b.readUInt32LE(0) === 0xfeedfacf) return { format: "macho", cpu: { 0x01000007: "x64", 0x0100000c: "arm64" }[b.readUInt32LE(4)] };
  if (b.readUInt16LE(0) === 0x5a4d) return { format: "pe", cpu: { 0x8664: "x64" }[b.readUInt16LE(b.readUInt32LE(0x3c) + 4)] };
  return {};
}

/** `npm` with `args` in `cwd` (no spaces in any argument; `npm` is a `.cmd` on Windows). */
const npm = (args, cwd) => execFileSync("npm", args, { cwd, encoding: "utf8", shell: process.platform === "win32" });

const [outArg, ...wanted] = process.argv.slice(2);
assert(outArg, "usage: node pack.mjs <out-dir> [platform ...]");
const out = resolve(outArg);
const ids = wanted.length > 0 ? wanted : Object.keys(PLATFORMS);
for (const id of ids) assert(PLATFORMS[id], `unknown platform ${id} (one of ${Object.keys(PLATFORMS).join(", ")})`);

// The main package: static optionalDependencies, exactly the five platform packages at its own version, no scripts.
const main = JSON.parse(readFileSync(join(nodeDir, "package.json"), "utf8"));
assert.equal(main.scripts, undefined, "the main package has no scripts (no lifecycle script, ever)");
assert.deepEqual(
  main.optionalDependencies,
  Object.fromEntries(Object.keys(PLATFORMS).map((id) => [`hugr-omni-${id}`, main.version])),
  `package.json: optionalDependencies must be the five platform packages, each at version ${main.version}`,
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
  for (const file of [addon, supervisor]) assert(existsSync(file), `${file} is missing: build it first (npm/README.md)`);
  const want = { format: FORMAT[p.os], cpu: p.cpu };
  assert.deepEqual({ format: inspect(addon).format, cpu: inspect(addon).cpu }, want, `${addon} is not a ${id} addon`);
  const sup = inspect(supervisor);
  assert.deepEqual({ format: sup.format, cpu: sup.cpu }, want, `${supervisor} is not a ${id} supervisor`);
  if (p.os === "linux") assert(sup.static, `${supervisor} is dynamically linked: the Linux supervisor is the static musl build`);

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
