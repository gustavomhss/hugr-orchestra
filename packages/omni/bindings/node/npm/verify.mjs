// The clean-install proof of C-PKG-01 / K9 (W14): installs the packed tarballs into an empty project with one package
// manager, with no HUGR_OMNI_* variable and no compiler involved, and runs the TS quickstart (bindings/node/examples).
//
//   node bindings/node/npm/verify.mjs <tarballs-dir> <node|bun|deno>     (node: npm installs, node runs)
//
// The tarballs (from pack.mjs) are served by a read-only registry on 127.0.0.1, so each package manager resolves the
// optionalDependencies with its own os/cpu/libc logic; nothing is published. The directory needs hugr-omni and the
// package of the platform this runs on; the other platform packages are answered with a bare packument (Deno reads all
// eight, and never fetches the ones that do not match). Deno has no musl build: on musl (Alpine) only node and bun run. Bun and Deno come from HUGR_BUN / HUGR_DENO (default `bun`,
// `deno`; e.g. `npx -y deno@2`). Any failure throws, and so does an install or a quickstart that takes 30 s.

import assert from "node:assert/strict";
import { exec, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inspect, validateBinaries, validateRuntimeIdentity } from "./pack.mjs";

/** The platform packages by id, with the `os`, `cpu` and (Linux) `libc` each declares. */
const PLATFORMS = {
  "win32-x64-msvc": { os: "win32", cpu: "x64" },
  "win32-arm64-msvc": { os: "win32", cpu: "arm64" },
  "darwin-arm64": { os: "darwin", cpu: "arm64" },
  "darwin-x64": { os: "darwin", cpu: "x64" },
  "linux-x64-gnu": { os: "linux", cpu: "x64", libc: "glibc" },
  "linux-arm64-gnu": { os: "linux", cpu: "arm64", libc: "glibc" },
  "linux-x64-musl": { os: "linux", cpu: "x64", libc: "musl" },
  "linux-arm64-musl": { os: "linux", cpu: "arm64", libc: "musl" },
};
const [tarballs, runtime] = process.argv.slice(2);
assert(tarballs && ["node", "bun", "deno"].includes(runtime), "usage: node verify.mjs <tarballs-dir> <node|bun|deno>");
// This script runs on Node, whose report names the glibc it runs on; a musl Node has none.
const libc = process.platform === "linux" ? (process.report.getReport().header.glibcVersionRuntime ? "glibc" : "musl") : undefined;
const id = Object.keys(PLATFORMS).find((k) => {
  const p = PLATFORMS[k];
  return p.os === process.platform && p.cpu === process.arch && p.libc === libc;
});
assert(id, `${process.platform}-${process.arch}${libc ? `-${libc}` : ""} is not a hugr-omni platform`);
if (process.env.HUGR_PROOF_ID) assert.equal(id, process.env.HUGR_PROOF_ID, "verification host does not match requested target");
assert(!(runtime === "deno" && libc === "musl"), "Deno has no musl build: on musl, verify with node and bun only");
const quickstart = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "quickstart.ts");

// The registry: the packuments of the tarballs in the directory, and the tarballs themselves.
const entries = readdirSync(tarballs)
  .filter((f) => f.endsWith(".tgz"))
  .map((f) => {
    const file = resolve(tarballs, f);
    // (`tar` runs next to the file: GNU tar reads `C:\...` as a remote host)
    return { file, json: JSON.parse(execFileSync("tar", ["-xzOf", f, "package/package.json"], { cwd: tarballs, encoding: "utf8" })) };
  });
const names = entries.map((e) => e.json.name);
assert(names.includes("hugr-omni") && names.includes(`hugr-omni-${id}`), `${tarballs} needs hugr-omni and hugr-omni-${id}`);
const version = entries.find((e) => e.json.name === "hugr-omni").json.version;
const absent = Object.keys(PLATFORMS).filter((other) => !names.includes(`hugr-omni-${other}`));
const tmp = mkdtempSync(join(tmpdir(), "hugr-omni-k9-"));

// A package that only its `libc` keeps off this machine (the other libc's package, same os and cpu) gets a stub tarball
// (its package.json, no addon): Bun and Deno do not read `libc` (measured: bun 1.x, deno 2.x) and install it, as they
// will install the published one. npm must skip it; under Bun and Deno the loader must still pick this machine's package
// (the stub has no addon, and the decoy below would fail the quickstart).
const libcOnly = absent.filter((other) => PLATFORMS[other].os === process.platform && PLATFORMS[other].cpu === process.arch);
for (const other of libcOnly) {
  const { os, cpu, libc: lib } = PLATFORMS[other];
  const dir = join(tmp, "stubs", other);
  mkdirSync(join(dir, "package"), { recursive: true });
  const json = { name: `hugr-omni-${other}`, version, os: [os], cpu: [cpu], libc: [lib], main: "hugr-omni.node" };
  writeFileSync(join(dir, "package", "package.json"), JSON.stringify(json));
  execFileSync("tar", ["-czf", "stub.tgz", "package"], { cwd: dir });
  entries.push({ file: join(dir, "stub.tgz"), json });
}

const registry = http.createServer((req, res) => {
  const base = `http://${req.headers.host}`;
  const path = decodeURIComponent(new URL(req.url, base).pathname).slice(1);
  const tarball = (e) => `-/${e.json.name}-${e.json.version}.tgz`;
  const entry = entries.find((e) => e.json.name === path || tarball(e) === path);
  const bare = absent.find((other) => !libcOnly.includes(other) && `hugr-omni-${other}` === path);
  const packument = (json, dist) => JSON.stringify({ name: json.name, "dist-tags": { latest: version }, versions: { [version]: { ...json, dist } } });
  if (req.method !== "GET" || (!entry && !bare)) return void res.writeHead(404).end("{}");
  if (bare) {
    const { os, cpu, libc: lib } = PLATFORMS[bare];
    const json = { name: `hugr-omni-${bare}`, version, os: [os], cpu: [cpu], ...(lib && { libc: [lib] }) };
    return void res.writeHead(200, { "content-type": "application/json" }).end(packument(json, { tarball: `${base}/-/never-fetched.tgz` }));
  }
  const bytes = readFileSync(entry.file);
  if (path === tarball(entry)) return void res.writeHead(200, { "content-type": "application/octet-stream" }).end(bytes);
  const dist = {
    tarball: `${base}/${tarball(entry)}`,
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    shasum: createHash("sha1").update(bytes).digest("hex"),
  };
  res.writeHead(200, { "content-type": "application/json" }).end(packument(entry.json, dist));
});
await new Promise((ready) => registry.listen(0, "127.0.0.1", ready));

const project = join(tmp, "project");
mkdirSync(project);
writeFileSync(join(project, ".npmrc"), `registry=http://127.0.0.1:${registry.address().port}/\n`);
writeFileSync(
  join(project, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    scripts: { dev: `node -e "console.log('ready'); setInterval(function () {}, 1000)"` },
    dependencies: { "hugr-omni": version },
  }),
);
copyFileSync(quickstart, join(project, "quickstart.ts"));
execFileSync("git", ["init", "-q"], { cwd: project }); // the quickstart runs `git status`

// Nothing that points at a checkout; a clean cache for the package manager under test.
const env = { ...process.env };
for (const v of ["HUGR_OMNI_ADDON", "HUGR_OMNI_SUPERVISOR", "CARGO_TARGET_DIR"]) delete env[v];
const sh = promisify(exec);
async function timed(command, extraEnv) {
  const start = performance.now();
  const { stdout, stderr } = await sh(command, { cwd: project, env: { ...env, ...extraEnv }, timeout: 30_000, killSignal: "SIGKILL" });
  return { out: stdout + stderr, seconds: (performance.now() - start) / 1000 };
}

/**
 * The DLLs a PE file (`.exe`, `.dll`, `.node`) imports, eagerly and delay-loaded: what `dumpbin /dependents` lists, read
 * from the file itself so no Visual Studio prompt is needed. Throws on anything that is not a PE32+ image it can read.
 */
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

try {
  // `npx -y deno@2` run in the project would read its .npmrc (the fixture registry): the binary itself runs there.
  const launcher = { bun: [process.env.HUGR_BUN ?? "bun", "-e", `"console.log(process.execPath)"`], deno: [process.env.HUGR_DENO ?? "deno", "eval", `"console.log(Deno.execPath())"`] }[runtime];
  const execPath = launcher ? (await sh(launcher.join(" "), { cwd: tmp, env, timeout: 120_000 })).stdout.trim() : process.execPath;
  const exe = `"${execPath}"`;
  writeFileSync(join(project, "identity.cjs"), `console.log(JSON.stringify({runtime:globalThis.Deno?'deno':process.versions.bun?'bun':'node',os:process.platform,cpu:process.arch,version:globalThis.Deno?Deno.version.deno:process.versions.bun||process.versions.node,execPath:process.execPath}));\n`);
  const identity = JSON.parse((await timed(`${exe} ${runtime === "deno" ? "run --allow-env --allow-read " : ""}identity.cjs`)).out.trim());
  validateRuntimeIdentity(identity, runtime, id);
  const runtimeBinary = inspect(execPath);
  assert.equal(runtimeBinary.cpu, process.arch, "runtime binary header CPU differs from executing runtime");
  if (runtime === "bun" && libc === "musl") {
    assert(runtimeBinary.needed.some((n) => /^libc\.musl-|^ld-musl-|^libc\.so$/.test(n)), `Bun is not a musl runtime: ${JSON.stringify(runtimeBinary)}`);
    assert(!runtimeBinary.needed.includes("libc.so.6"), "Bun is a glibc build on musl");
  }
  console.log(`runtime proof ${JSON.stringify({ id, identity, runtimeBinary })}`);
  const install = {
    node: ["npm install --no-audit --no-fund --foreground-scripts --loglevel=verbose", { npm_config_cache: join(tmp, "cache") }],
    bun: [`${exe} install`, { BUN_INSTALL_CACHE_DIR: join(tmp, "cache") }],
    deno: [`${exe} install`, { DENO_DIR: join(tmp, "cache") }],
  }[runtime];
  const installed = await timed(...install);

  // Installed: the main package and only this platform's, no lifecycle script, nothing compiled, supervisor next to the addon.
  const main = createRequire(join(project, "package.json")).resolve("hugr-omni");
  const addon = createRequire(main).resolve(`hugr-omni-${id}`);
  for (const other of Object.keys(PLATFORMS).filter((o) => o !== id)) {
    if (runtime !== "node" && libcOnly.includes(other)) continue; // declared: Bun and Deno do not read `libc`
    assert.throws(() => createRequire(main).resolve(`hugr-omni-${other}/package.json`), `hugr-omni-${other} must not be installed on ${id}`);
  }
  const supervisor = join(dirname(addon), process.platform === "win32" ? "hugr-omni-supervisor.exe" : "hugr-omni-supervisor");
  assert(existsSync(supervisor), "the supervisor is not next to the addon");
  const binaries = validateBinaries(id, addon, supervisor);
  if (process.platform === "win32") {
    // H5 (x64 and arm64): built with a static C runtime, so no Visual C++ Redistributable is needed. KERNEL32 is the
    // positive control: an import table read as empty would otherwise pass.
    for (const file of [addon, supervisor]) {
      const dlls = peImports(readFileSync(file));
      assert(dlls.some((d) => /^kernel32\.dll$/i.test(d)), `${file}: its import table reads ${JSON.stringify(dlls)}, without KERNEL32.dll`);
      const crt = dlls.filter((d) => /^(vcruntime|msvcp)/i.test(d));
      assert.deepEqual(crt, [], `${file} needs the Visual C++ runtime (${crt.join(", ")}): build it with +crt-static (.cargo/config.toml)`);
    }
  }
  for (const dir of [dirname(main), dirname(addon)]) assert.equal(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts, undefined, `${dir} has scripts`);
  assert.match(installed.out, /hugr-omni/, "the install log is empty: the check below would pass on nothing");
  assert.doesNotMatch(installed.out, /node-gyp|gyp ERR|cargo (build|install)|rustc|maturin/i, "the install compiled something");

  // The quickstart, as written. Node 22 has no `await using` and no .ts: tsc (typing it against the installed index.d.ts) lowers it.
  const run = {
    node: "node out/quickstart.js",
    bun: `${exe} quickstart.ts`,
    deno: `${exe} run --allow-ffi --allow-env --allow-read quickstart.ts`,
  }[runtime];
  if (runtime === "node") {
    // (from tmp: the project's .npmrc names the fixture registry, which has no typescript)
    await sh("npx -y -p typescript@5 tsc project/quickstart.ts --outDir project/out --target es2022 --module es2022 --moduleResolution bundler --lib es2022,esnext.disposable,dom", { cwd: tmp, env });
  }
  // The platform package comes before a Cargo build: a decoy build where the loader would look (<project>/target) must not matter.
  mkdirSync(join(project, "target", "debug"), { recursive: true });
  writeFileSync(join(project, "target", "debug", { darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" }[process.platform] ?? "libhugr_omni_node.so"), "not a library");
  const hello = await timed(run);
  assert.match(hello.out, /^true /, "run() of the quickstart did not succeed");
  assert.match(hello.out, /parentPid/, "processes() of the quickstart listed nothing");
  console.log(`K9 ok  ${runtime}  ${id}  install ${installed.seconds.toFixed(1)} s  quickstart ${hello.seconds.toFixed(1)} s`);
  const proofs = resolve(tarballs, "..", "proofs");
  mkdirSync(proofs, { recursive: true });
  writeFileSync(join(proofs, `${id}-${runtime}.json`), JSON.stringify({
    id, identity, runtimeBinary, binaries,
    tarballs: entries.filter((e) => names.includes(e.json.name)).map((e) => ({ name: e.json.name, sha256: createHash("sha256").update(readFileSync(e.file)).digest("hex") })),
    installSeconds: installed.seconds, quickstartSeconds: hello.seconds, quickstart: hello.out,
  }, null, 2));

  if (runtime === "node") {
    // The loader's messages, from the package alone (no platform package, no checkout): unsupported, and not installed.
    const alone = join(tmp, "alone");
    cpSync(dirname(main), join(alone, "node_modules", "hugr-omni"), { recursive: true });
    // The addon loads at the first use (WP-H), so the probe uses it: spawn() throws the loader's message.
    writeFileSync(join(alone, "probe.cjs"), `if (process.argv[2]) Object.defineProperty(process, "platform", { value: process.argv[2] });\ntry { require("hugr-omni").spawn("x"); console.log("LOADED"); } catch (e) { console.log(e.message); }\n`);
    const probe = (...args) => execFileSync(process.execPath, ["probe.cjs", ...args], { cwd: alone, env, encoding: "utf8" });
    const unsupported = probe("freebsd");
    for (const supported of Object.keys(PLATFORMS)) assert(unsupported.includes(supported), `the unsupported-platform message does not list ${supported}: ${unsupported}`);
    assert(unsupported.includes(`freebsd-${process.arch}`), `the unsupported-platform message does not name the platform: ${unsupported}`);
    assert.match(probe(), new RegExp(`hugr-omni-${id} .* is not installed`), "the missing-package message does not name the package");
  }
} finally {
  registry.close();
  rmSync(tmp, { recursive: true, force: true });
}
