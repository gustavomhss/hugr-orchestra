// The clean-install proof of C-PKG-01 / K9 (W14): installs the packed tarballs into an empty project with one package
// manager, with no HUGR_OMNI_* variable and no compiler involved, and runs the TS quickstart (bindings/node/examples).
//
//   node bindings/node/npm/verify.mjs <tarballs-dir> <node|bun|deno>     (node: npm installs, node runs)
//
// The tarballs (from pack.mjs) are served by a read-only registry on 127.0.0.1, so each package manager resolves the
// optionalDependencies with its own os/cpu/libc logic; nothing is published. The directory needs hugr-omni and the
// package of the platform this runs on; the other platform packages are answered with a bare packument (Deno reads all
// five, and never fetches the ones that do not match). Bun and Deno come from HUGR_BUN / HUGR_DENO (default `bun`,
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

const IDS = { "win32-x64": "win32-x64-msvc", "darwin-arm64": "darwin-arm64", "darwin-x64": "darwin-x64", "linux-x64": "linux-x64-gnu", "linux-arm64": "linux-arm64-gnu" };
const [tarballs, runtime] = process.argv.slice(2);
assert(tarballs && ["node", "bun", "deno"].includes(runtime), "usage: node verify.mjs <tarballs-dir> <node|bun|deno>");
const id = IDS[`${process.platform}-${process.arch}`];
assert(id, `${process.platform}-${process.arch} is not a hugr-omni platform`);
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
const absent = Object.entries(IDS).filter(([, other]) => !names.includes(`hugr-omni-${other}`));

const registry = http.createServer((req, res) => {
  const base = `http://${req.headers.host}`;
  const path = decodeURIComponent(new URL(req.url, base).pathname).slice(1);
  const tarball = (e) => `-/${e.json.name}-${e.json.version}.tgz`;
  const entry = entries.find((e) => e.json.name === path || tarball(e) === path);
  const bare = absent.find(([, other]) => `hugr-omni-${other}` === path);
  const packument = (json, dist) => JSON.stringify({ name: json.name, "dist-tags": { latest: version }, versions: { [version]: { ...json, dist } } });
  if (req.method !== "GET" || (!entry && !bare)) return void res.writeHead(404).end("{}");
  if (bare) {
    const [key, other] = bare;
    const [os, cpu] = key.split("-");
    const json = { name: `hugr-omni-${other}`, version, os: [os], cpu: [cpu], ...(os === "linux" && { libc: ["glibc"] }) };
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

const tmp = mkdtempSync(join(tmpdir(), "hugr-omni-k9-"));
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

try {
  // `npx -y deno@2` run in the project would read its .npmrc (the fixture registry): the binary itself runs there.
  const launcher = { bun: [process.env.HUGR_BUN ?? "bun", "-e", `"console.log(process.execPath)"`], deno: [process.env.HUGR_DENO ?? "deno", "eval", `"console.log(Deno.execPath())"`] }[runtime];
  const exe = launcher ? `"${(await sh(launcher.join(" "), { cwd: tmp, env })).stdout.trim()}"` : "node";
  const install = {
    node: ["npm install --no-audit --no-fund --foreground-scripts --loglevel=verbose", { npm_config_cache: join(tmp, "cache") }],
    bun: [`${exe} install`, { BUN_INSTALL_CACHE_DIR: join(tmp, "cache") }],
    deno: [`${exe} install`, { DENO_DIR: join(tmp, "cache") }],
  }[runtime];
  const installed = await timed(...install);

  // Installed: the main package and only this platform's, no lifecycle script, nothing compiled, supervisor next to the addon.
  const main = createRequire(join(project, "package.json")).resolve("hugr-omni");
  const addon = createRequire(main).resolve(`hugr-omni-${id}`);
  for (const other of Object.values(IDS).filter((o) => o !== id)) {
    assert.throws(() => createRequire(main).resolve(`hugr-omni-${other}`), `hugr-omni-${other} must not be installed on ${id}`);
  }
  assert(existsSync(join(dirname(addon), process.platform === "win32" ? "hugr-omni-supervisor.exe" : "hugr-omni-supervisor")), "the supervisor is not next to the addon");
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

  if (runtime === "node") {
    // The loader's messages, from the package alone (no platform package, no checkout): unsupported, and not installed.
    const alone = join(tmp, "alone");
    cpSync(dirname(main), join(alone, "node_modules", "hugr-omni"), { recursive: true });
    writeFileSync(join(alone, "probe.cjs"), `if (process.argv[2]) Object.defineProperty(process, "platform", { value: process.argv[2] });\ntry { require("hugr-omni"); console.log("LOADED"); } catch (e) { console.log(e.message); }\n`);
    const probe = (...args) => execFileSync(process.execPath, ["probe.cjs", ...args], { cwd: alone, env, encoding: "utf8" });
    const unsupported = probe("freebsd");
    for (const supported of Object.values(IDS)) assert(unsupported.includes(supported), `the unsupported-platform message does not list ${supported}: ${unsupported}`);
    assert(unsupported.includes(`freebsd-${process.arch}`), `the unsupported-platform message does not name the platform: ${unsupported}`);
    assert.match(probe(), new RegExp(`hugr-omni-${id} .* is not installed`), "the missing-package message does not name the package");
  }
} finally {
  registry.close();
  rmSync(tmp, { recursive: true, force: true });
}
