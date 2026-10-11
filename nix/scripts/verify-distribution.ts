#!/usr/bin/env bun
// Deferred native output check. Uses the shipped consumer admission, then checks
// actual image headers and execution. No GUI, service, OAuth or arbitrary-CPU claim.
import { spawnSync } from "node:child_process"
import { closeSync, mkdtempSync, openSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { parseArgs } from "node:util"
import { cliTreeSitterTarget, nativeCliTarget, readCliManifest, verifyCliArtifact } from "../../packages/desktop/src/main/cli-artifacts"
import { requireTreeSitterBundle } from "../../packages/script/src/tree-sitter-prebuilds"

const args = parseArgs({
  options: {
    source: { type: "string" },
    cli: { type: "string" },
    desktop: { type: "string" },
    system: { type: "string" },
    version: { type: "string" },
    "electron-version": { type: "string" },
  },
  strict: true,
  allowPositionals: false,
}).values
const source = args.source
const cli = args.cli
const desktop = args.desktop
const system = args.system
const version = args.version
const electronVersion = args["electron-version"]
if (!source || !cli || !desktop || !system || !version || !electronVersion) fail("MISSING_OUTPUT_ARGUMENT")
async function verify() {
const manifest = await Bun.file(join(source, "nix/toolchain-sources.json")).json()
if (!(system in manifest.bun.sources)) fail(`UNSUPPORTED_SYSTEM:${system}`)
const platform = system.endsWith("-darwin") ? "darwin" : "linux"
const arch = system.startsWith("aarch64-") ? "arm64" : "x64"
if (process.platform !== platform || process.arch !== arch) fail(`NATIVE_HOST_MISMATCH:${system}`)
const target = nativeCliTarget(platform, arch)
const resources = platform === "darwin"
  ? join(desktop, "Applications/HuGR Orchestra.app/Contents/Resources")
  : join(desktop, "opt/orchestra-desktop/resources")
const executable = platform === "darwin"
  ? join(desktop, "Applications/HuGR Orchestra.app/Contents/MacOS/HuGR Orchestra")
  : join(desktop, "opt/orchestra-desktop/ai.hugr.orchestra")
const artifacts = await Promise.all([join(cli, "share/orchestra/cli"), join(resources, "cli")].map(async (directory) => {
  const receipt = await readCliManifest(directory)
  if (receipt.version !== version || receipt.artifacts.length !== 1 || receipt.artifacts[0].target !== target)
    fail(`ARTIFACT_TUPLE_MISMATCH:${directory}`)
  const artifact = await verifyCliArtifact(directory, target)
  await image(artifact.path)
  return { directory, path: artifact.path, ...receipt }
}))
// The compiled CLI resolves omni next to realpath(process.execPath) (packages/core/src/omni.ts); artifact.path is
// real. Checked before any CLI runs, so a CLI whose omni preflight fails is still named by the omni failure.
const omniCli = await omni(dirname(artifacts[0].path), process.execPath, {})
// The packaged CLI (Resources/cli) resolves Resources/omni through ../omni: check it before that CLI runs too.
// Resources/omni is outside app.asar.unpacked, so the addon scan below never sees it; packaged Electron loads it here.
const omniDesktop = await omni(join(resources, "omni"), executable, { ELECTRON_RUN_AS_NODE: "1" })
// maestro-arsenal in the compiled CLI loads tree-sitter/ beside realpath(process.execPath). The desktop stages its
// bundle from the CLI output's tree-sitter-<target>/ and ships it in Resources/cli for the CLI it installs.
const treeSitterBundles = {
  cli: await treeSitter(join(dirname(artifacts[0].path), "tree-sitter"), process.execPath, {}),
  cliStaged: await treeSitter(join(dirname(artifacts[0].path), `tree-sitter-${target}`), process.execPath, {}),
  desktop: await treeSitter(join(resources, "cli", `tree-sitter-${target}`), executable, { ELECTRON_RUN_AS_NODE: "1" }),
}
artifacts.forEach((artifact) => {
  const reported = execute(artifact.path, ["--version"]).trim()
  if (![version, `orchestra v${version}`].includes(reported)) fail(`RAW_CLI_VERSION:${artifact.directory}:${reported}`)
})
const wrapped = execute(join(cli, "bin/orchestra"), ["--version"]).trim()
if (![version, `orchestra v${version}`].includes(wrapped)) fail(`WRAPPED_CLI_VERSION:${wrapped}`)
await Promise.all([
  join(cli, "share/orchestra/schema.json"),
  join(cli, "share/bash-completion/completions/orchestra.bash"),
  join(cli, "share/zsh/site-functions/_orchestra"),
  join(resources, "app.asar"), join(resources, "icons/icon.png"),
].map(async (file) => {
  if (!(await Bun.file(file).size)) fail(`MISSING_OR_EMPTY_OUTPUT:${file}`)
}))
const schema = await Bun.file(join(cli, "share/orchestra/schema.json")).json()
if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") fail("SCHEMA_DRAFT_MISMATCH")
await image(executable)
const runtime = JSON.parse(execute(executable, ["-p", "JSON.stringify(process.versions)"], true))
if (runtime.electron !== electronVersion) fail(`PACKAGED_ELECTRON_VERSION:${runtime.electron}`)
const pty = packagedPty(executable, resources)
// Ask Electron's loader, not a duplicated ABI table. This proves addon loading;
// PTY operations and full desktop startup still belong to the product batch.
const addons = await nativeAddons(join(resources, "app.asar.unpacked"))
if (!addons.length) fail("EMPTY_PACKAGED_NATIVE_ADDON_LIST")
addons.forEach((file) => {
  const loaded = execute(executable, ["-e", "require(process.argv[1]); console.log('NATIVE_ADDON_LOAD_OK')", file], true)
  if (loaded.trim() !== "NATIVE_ADDON_LOAD_OK") fail(`NATIVE_ADDON_LOAD_EVIDENCE:${file}`)
})
if (platform === "linux") {
  const entry = await Bun.file(join(desktop, "share/applications/ai.hugr.orchestra.desktop")).text()
  Array.of("StartupWMClass=ai.hugr.orchestra", "Icon=ai.hugr.orchestra", "Exec=").forEach((property) => {
    if (!entry.split("\n").some((line) => line.startsWith(property))) fail(`DESKTOP_ENTRY:${property}`)
  })
  if (!(await Bun.file(join(desktop, "share/metainfo/ai.hugr.orchestra.metainfo.xml")).size)) fail("MISSING_METAINFO")
}
return { system, version, target, artifacts, executable, runtime, pty, addons,
  omni: { cli: omniCli, desktop: omniDesktop }, treeSitter: treeSitterBundles, status: "NATIVE_OUTPUT_CHECK_OK" }

async function image(file: string, code = "NATIVE_IMAGE_MISMATCH") {
  const header = Buffer.from(await Bun.file(file).slice(0, 64).arrayBuffer())
  if (header.length < 64) fail(`SHORT_NATIVE_IMAGE:${file}`)
  const valid = platform === "linux"
    ? header.subarray(0, 6).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]))
      && header.readUInt16LE(18) === (arch === "x64" ? 62 : 183)
    : header.readUInt32LE(0) === 0xfeedfacf && header.readUInt32LE(4) === (arch === "x64" ? 0x1000007 : 0x100000c)
  if (!valid) fail(`${code}:${file}:${system}`)
}

// Both shipped omni files must be real, native and live: the supervisor runs on this host, and the product loader
// (packages/omni/bindings/node/index.js, which calls process.dlopen) loads the addon inside the given runtime.
async function omni(directory: string, runtime: string, env: Record<string, string>) {
  const addon = join(directory, "hugr_omni.node")
  const supervisor = join(directory, "hugr-omni-supervisor")
  const present = async (file: string) => {
    const info = await stat(file).catch(() => undefined)
    return Boolean(info?.isFile() && info.size > 0)
  }
  if (!(await present(addon))) fail(`OMNI_ADDON_MISSING:${addon}`)
  if (!(await present(supervisor))) fail(`OMNI_SUPERVISOR_MISSING:${supervisor}`)
  await image(addon, "OMNI_IMAGE_MISMATCH")
  await image(supervisor, "OMNI_IMAGE_MISMATCH")
  // No --version/--help: with no arguments it must refuse its command line (exit 2), which only a native run can do.
  const started = captured(supervisor, [], { encoding: "utf8", timeout: 30_000 })
  if (started.error || started.status !== 2 || !started.stderr.startsWith("hugr-omni-supervisor: missing --host-pid"))
    fail(`OMNI_SUPERVISOR_EXECUTION:${supervisor}:${started.error?.message ?? `${started.status}:${started.signal}:${started.stderr}`}`)
  // Inherited HUGR_OMNI_* would let the native side pick another supervisor than the shipped one.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("HUGR_OMNI_")))
  const loaded = captured(runtime, ["-e", String.raw`
    const dlopen = process.dlopen
    const opened = []
    process.dlopen = function (module, file, ...rest) { opened.push(file); return dlopen.call(this, module, file, ...rest) }
    const omni = require(process.env.NIX_OMNI_LOADER)
    omni.configure({ addon: process.env.NIX_OMNI_ADDON, supervisor: process.env.NIX_OMNI_SUPERVISOR })
    console.log("OMNI_LOAD_OK " + JSON.stringify({ opened, exports: Object.keys(omni),
      runtime: process.versions.electron ? "electron " + process.versions.electron : "bun " + process.versions.bun }))
  `], {
    env: { ...inherited, ...env, NIX_OMNI_LOADER: join(source!, "packages/omni/bindings/node/index.js"),
      NIX_OMNI_ADDON: addon, NIX_OMNI_SUPERVISOR: supervisor },
    encoding: "utf8", timeout: 60_000,
  })
  const line = loaded.stdout?.trim() ?? ""
  if (loaded.error || loaded.status !== 0 || !line.startsWith("OMNI_LOAD_OK {") || line.includes("\n"))
    fail(`OMNI_ADDON_LOAD:${addon}:${loaded.error?.message ?? `${loaded.status}:${loaded.signal}:${loaded.stderr}`}`)
  const evidence: { opened: string[]; exports: string[]; runtime: string } = JSON.parse(line.slice("OMNI_LOAD_OK ".length))
  if (evidence.opened.length !== 1 || evidence.opened[0] !== addon || !evidence.exports.includes("configure"))
    fail(`OMNI_ADDON_LOAD:${addon}:${line}`)
  return { addon, supervisor, supervisorExit: started.status, ...evidence, status: "OMNI_OK" }
}

// Each host binding must be a real native image that loads in the given runtime: Bun loads the shipped package
// entries and parses, as arsenal does in the compiled CLI; Electron as node dlopens each binding directly.
async function treeSitter(directory: string, runtime: string, env: Record<string, string>) {
  const bindings = ["tree-sitter", "tree-sitter-typescript", "tree-sitter-python"]
    .map((name) => join(directory, name, "prebuilds", `${platform}-${arch}`, `${name}.node`))
  for (const file of bindings) {
    const info = await lstat(file).catch(() => undefined)
    if (!info?.isFile() || !info.size) fail(`TREE_SITTER_BUNDLE_MISSING:${file}`)
    await image(file, "TREE_SITTER_BUNDLE_IMAGE_MISMATCH")
  }
  await Promise.resolve().then(() => requireTreeSitterBundle(directory, cliTreeSitterTarget(target)))
    .catch((error: unknown) => fail(`TREE_SITTER_BUNDLE_INCOMPLETE:${error instanceof Error ? error.message : error}`))
  const result = join(mkdtempSync(join(tmpdir(), "nix-tree-sitter-")), "result")
  const loaded = captured(runtime, ["-e", String.raw`
    const path = require("node:path")
    const dir = process.env.NIX_TREE_SITTER_DIR
    const dlopen = process.dlopen
    const opened = []
    process.dlopen = function (module, file, ...rest) { opened.push(file); return dlopen.call(this, module, file, ...rest) }
    const parse = (language, source) => {
      const Parser = require(path.join(dir, "tree-sitter"))
      const parser = new Parser()
      parser.setLanguage(language)
      return parser.parse(source).rootNode.type
    }
    const parsed = process.versions.bun
      ? [parse(require(path.join(dir, "tree-sitter-typescript")).typescript, "export const a = 1"),
        parse(require(path.join(dir, "tree-sitter-python")), "a = 1")]
      : JSON.parse(process.env.NIX_TREE_SITTER_BINDINGS).map((file) => Object.getOwnPropertyNames(require(file)).length)
    // A synchronous file write: buffered stdout from Bun can be lost when a native module's teardown ends the process.
    require("node:fs").writeFileSync(process.env.NIX_TREE_SITTER_RESULT, "TREE_SITTER_LOAD_OK " + JSON.stringify({ opened, parsed,
      runtime: process.versions.electron ? "electron " + process.versions.electron : "bun " + process.versions.bun }))
  `], {
    env: { ...process.env, ...env, NIX_TREE_SITTER_DIR: directory, NIX_TREE_SITTER_BINDINGS: JSON.stringify(bindings),
      NIX_TREE_SITTER_RESULT: result },
    encoding: "utf8", timeout: 60_000,
  })
  const line = (await readFile(result, "utf8").catch(() => "")).trim()
  if (loaded.error || loaded.status !== 0 || !line.startsWith("TREE_SITTER_LOAD_OK {") || line.includes("\n"))
    fail(`TREE_SITTER_BUNDLE_LOAD:${directory}:${loaded.error?.message ?? `${loaded.status}:${loaded.signal}:${loaded.stderr}`}`)
  const evidence: { opened: string[]; parsed: unknown[]; runtime: string } = JSON.parse(line.slice("TREE_SITTER_LOAD_OK ".length))
  // require() opens the real path, so a symlinked evidence directory must not fail a valid bundle.
  const real = await Promise.all(bindings.map((file) => realpath(file)))
  if (evidence.runtime.startsWith("electron ")
    ? JSON.stringify(evidence.opened) !== JSON.stringify(real) || evidence.parsed.some((count) => !count)
    : JSON.stringify(evidence.parsed) !== JSON.stringify(["program", "module"]))
    fail(`TREE_SITTER_BUNDLE_LOAD:${directory}:${line}`)
  return { directory, bindings, ...evidence, status: "TREE_SITTER_OK" }
}
}

verify().then((result) => console.log(JSON.stringify(result, null, 2)), (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  const code = message.startsWith("NIX_DISTRIBUTION_FAILURE:") ? message.split(":")[1]
    : message === "Invalid CLI manifest schema/version/artifacts" ? "INVALID_ARTIFACT_LIST"
    : message.startsWith("CLI artifact digest mismatch:") ? "ARTIFACT_DIGEST_MISMATCH"
    : "SETUP_OR_UNEXPECTED_FAILURE"
  console.log(JSON.stringify({ status: "NATIVE_OUTPUT_CHECK_FAILED", failureCode: code, detail: message }))
  process.exitCode = 1
})

function fail(label: string): never {
  throw new Error(`NIX_DISTRIBUTION_FAILURE:${label}`)
}

function execute(file: string, argv: string[], electron = false) {
  const result = captured(file, argv, {
    env: { ...process.env, ORCHESTRA_DISABLE_MODELS_FETCH: "1", ...(electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}) },
    encoding: "utf8", timeout: 60_000,
  })
  if (result.error || result.status !== 0) fail(`EXECUTION:${file}:${result.error?.message ?? result.stderr}`)
  return result.stdout
}

function packagedPty(executable: string, resources: string) {
  // electron-vite rewrites @lydell/node-pty to this platform package. Use the
  // same createRequire context as its packaged main bundle, not a .node shortcut.
  const result = captured(executable, ["-e", String.raw`
    const { createRequire } = require("node:module")
    const fs = require("node:fs")
    const path = require("node:path")
    const resources = process.argv[1]
    const specifier = "@lydell/node-pty-" + process.platform + "-" + process.arch
    const stop = (failureCode, detail) => {
      console.log(JSON.stringify({ status: "PACKAGED_PTY_FAILED", failureCode, detail }))
      process.exit(1)
    }
    const archive = path.join(resources, "app.asar")
    const app = JSON.parse(fs.readFileSync(path.join(archive, "package.json"), "utf8"))
    if (typeof app.main !== "string") stop("PTY_ORACLE_PROTOCOL", "packaged main missing")
    const anchor = path.resolve(archive, app.main)
    if (!anchor.startsWith(archive + path.sep) || !fs.existsSync(anchor)) stop("PTY_ORACLE_PROTOCOL", "packaged main missing")
    const scoped = createRequire(anchor)
    let resolved
    try { resolved = scoped.resolve(specifier) } catch (error) {
      stop(fs.existsSync(path.join(resources, "app.asar/node_modules", specifier, "package.json"))
        ? "PTY_ENTRYPOINT_BROKEN" : "PTY_PACKAGE_MISSING", String(error))
    }
    if (!["app.asar", "app.asar.unpacked"].some((dir) => resolved.startsWith(path.join(resources, dir) + path.sep)))
      stop("PTY_PACKAGE_ESCAPE", resolved)
    let root = path.dirname(resolved)
    while (!fs.existsSync(path.join(root, "package.json")) && root !== path.dirname(root)) root = path.dirname(root)
    const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    if (metadata.name !== specifier) stop("PTY_ENTRYPOINT_BROKEN", "package identity mismatch")
    const native = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name)
      return entry.isDirectory() ? native(file) : entry.name.endsWith(".node") ? [file] : []
    })
    const declared = native(root)
    const physical = (file) => file.replace(path.join(resources, "app.asar") + path.sep,
      path.join(resources, "app.asar.unpacked") + path.sep)
    if (!declared.length || declared.some((file) => !fs.existsSync(physical(file)))) stop("PTY_BINDING_MISSING", root)
    let api
    try { api = scoped(specifier) } catch (error) { stop("PTY_ENTRYPOINT_BROKEN", String(error)) }
    if (typeof api.spawn !== "function") stop("PTY_ENTRYPOINT_BROKEN", "spawn export missing")
    const bindings = Object.values(require.cache).map((entry) => entry.filename)
      .filter((file) => [root, physical(root)].some((dir) => file.startsWith(dir + path.sep)) && file.endsWith(".node"))
    if (!bindings.length) stop("PTY_BINDING_MISSING", "entrypoint loaded no native binding")
    console.log(JSON.stringify({ status: "PACKAGED_PTY_OK", package: specifier, anchor, resolved, bindings,
      exports: { spawn: typeof api.spawn }, electron: process.versions.electron }))
  `, resources], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", timeout: 60_000 })
  if (result.error || result.status === null) fail("PTY_ORACLE_EXECUTION")
  const value: unknown = JSON.parse(result.stdout)
  if (!value || typeof value !== "object" || !("status" in value)) fail("PTY_ORACLE_PROTOCOL")
  if (result.status !== 0 && value.status === "PACKAGED_PTY_FAILED" && "failureCode" in value
    && typeof value.failureCode === "string"
    && ["PTY_PACKAGE_MISSING", "PTY_BINDING_MISSING", "PTY_ENTRYPOINT_BROKEN", "PTY_PACKAGE_ESCAPE"].includes(value.failureCode))
    fail(value.failureCode)
  if (result.status !== 0 || value.status !== "PACKAGED_PTY_OK" || !("bindings" in value)
    || !Array.isArray(value.bindings) || !value.bindings.length) fail("PTY_ORACLE_PROTOCOL")
  return value
}

async function nativeAddons(directory: string): Promise<string[]> {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map((entry) => {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) return nativeAddons(file)
    return entry.isFile() && entry.name.endsWith(".node") ? [file] : []
  }))).flat()
}

// Every child writes to files, never pipes: on Linux, Electron's crash handler inherits the pipes and keeps them open
// after a crashing load, so a piped spawnSync would wait forever instead of reporting the failure. SIGKILL ends hangs.
function captured(command: string, args: string[], options: { env?: Record<string, string | undefined>; timeout: number; encoding?: string }) {
  const logs = mkdtempSync(join(tmpdir(), "nix-verify-"))
  const out = openSync(join(logs, "stdout"), "w")
  const err = openSync(join(logs, "stderr"), "w")
  const result = spawnSync(command, args, { env: options.env, timeout: options.timeout, stdio: ["ignore", out, err], killSignal: "SIGKILL" })
  closeSync(out)
  closeSync(err)
  return { error: result.error, status: result.status, signal: result.signal,
    stdout: readFileSync(join(logs, "stdout"), "utf8"), stderr: readFileSync(join(logs, "stderr"), "utf8") }
}
