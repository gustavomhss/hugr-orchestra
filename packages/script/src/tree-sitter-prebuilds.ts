// Native tree-sitter grammars select prebuilds/<os>-<arch>/*.node by directory name, never by the bytes inside, and
// a packaged Desktop carries those directories in its node_modules. tree-sitter-typescript 0.23.2 and
// tree-sitter-javascript 0.23.1 (latest upstream typescript release, which pins javascript ^0.23.1) publish x86-64 ELF
// files under prebuilds/linux-arm64, so every Linux ARM64 package would ship grammars that cannot load.
// The core `tree-sitter` package publishes no prebuilds at all; only its install script compiles a binding, which
// --ignore-scripts installs (Nix, the release lanes) skip. Bun loads nothing but prebuilds/<os>-<arch>/tree-sitter.node
// and node-gyp-build finds that file too, so packaging materializes it for the target.
// Only the Desktop ships node_modules. A compiled CLI (apps/cli, nix/orchestra.nix) bundles
// maestro-arsenal, which loads tree-sitter through createRequire at runtime, and has no node_modules to resolve it
// from: both builds ship the packages arsenal parses with in bin/tree-sitter/ (resolveTreeSitter, copyTreeSitter), and
// arsenal loads them from beside realpath(execPath). A cross build takes another target's bundle from
// TREE_SITTER_ARTIFACTS, exported on that target's own host, since only that host can build its core binding.
// This runs under Node too (electron-builder loads the Desktop config there), so it uses node: APIs only.
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { machine } from "node:os"
import { Elf } from "@orchestra/schema/elf"
import { WorkspacePaths } from "./workspace-paths.ts"

// ELF e_machine, Mach-O cputype, PE machine. The three numbering spaces do not collide for these targets.
export const NATIVE_MACHINES: Record<string, number> = {
  "linux-x64": 62,
  "linux-arm64": 183,
  "darwin-x64": 0x01000007,
  "darwin-arm64": 0x0100000c,
  "win32-x64": 0x8664,
  "win32-arm64": 0xaa64,
}

// The grammars the workspace loads natively (maestro-arsenal). Finding none of one is a broken install, not a pass.
const REQUIRED = ["tree-sitter-javascript", "tree-sitter-python", "tree-sitter-typescript"]

/**
 * Checks every tree-sitter prebuild for `os`/`arch` under `root`'s node_modules. A mislabeled one is rebuilt from the
 * package's own binding.gyp when this host is that target (N-API addons load in Node, Bun and Electron alike);
 * otherwise the build stops with TREE_SITTER_PREBUILD_ARCH_MISMATCH instead of shipping it. The core binding is
 * built the same way when the target has none, or the build stops with TREE_SITTER_CORE_BINDING_MISSING.
 */
export function prepareTreeSitterPrebuilds(input: Target & { root: string; rebuild?: boolean }) {
  treeSitterArtifactKey(input)
  const target = `${input.os}-${input.arch}`
  const machine = NATIVE_MACHINES[target]
  if (machine === undefined) throw new Error(`TREE_SITTER_TARGET_UNSUPPORTED: ${target}`)
  const packages = grammarPackages(input.root).map((dir) => ({
    dir,
    name: String(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).name),
    files: entries(path.join(dir, "prebuilds", target))
      .filter((name) => name.endsWith(".node"))
      .map((name) => path.join(dir, "prebuilds", target, name)),
  }))
  const cores = packages.filter((item) => item.name === "tree-sitter")
  const missing = [
    ...(cores.length > 0 ? [] : ["tree-sitter"]),
    ...REQUIRED.filter((name) => !packages.some((item) => item.name === name && item.files.length > 0)),
  ]
  if (missing.length > 0) throw new Error(`TREE_SITTER_PREBUILDS_MISSING: ${target}: ${missing.join(", ")}`)
  if (input.abi === "musl") {
    if (input.os !== "linux" || input.arch !== process.arch || process.platform !== "linux" ||
        input.rebuild === false || linuxRuntimeLibc().kind !== "musl")
      throw new Error(`TREE_SITTER_NATIVE_MUSL_BUILD_REQUIRED: ${treeSitterArtifactKey(input)}`)
    // Same-CPU upstream prebuilds are glibc. Rebuild every core and grammar from
    // source, including packages with apparently correct headers; never reuse a
    // lifecycle build/Release (node-gyp-build gives it priority over prebuilds).
    packages.forEach((item) => {
      const files = item.files.length ? item.files : [path.join(item.dir, "prebuilds", target, `${item.name}.node`)]
      files.forEach((file) => mkdirSync(path.dirname(file), { recursive: true }))
      rebuildPackage(input.root, item.dir, files, machine, "musl")
    })
    return { target: treeSitterArtifactKey(input), checked: packages.flatMap((item) =>
      nodeFiles(path.join(item.dir, "prebuilds", target))), rebuilt: packages.map((item) => item.name) }
  }
  const broken = packages.filter((item) => item.files.some((file) => !nativeMachines(file).includes(machine)))
  const rebuild = input.rebuild ?? (process.platform === input.os && process.arch === input.arch)
  if (rebuild && input.os === "linux" && process.platform === "linux" && linuxRuntimeLibc().kind !== "glibc")
    throw new Error(`TREE_SITTER_NATIVE_GLIBC_BUILD_REQUIRED: ${target}`)
  if (broken.length > 0 && !rebuild)
    throw new Error(
      `TREE_SITTER_PREBUILD_ARCH_MISMATCH: ${target} needs a ${target} host to rebuild ` +
        broken.flatMap((item) => item.files.filter((file) => !nativeMachines(file).includes(machine))).join(", "),
    )
  // node-gyp-build loads build/Release before prebuilds, so an install-script build for another CPU would win at runtime.
  const stale = cores
    .flatMap((item) => nodeFiles(path.join(item.dir, "build", "Release")))
    .filter((file) => !nativeMachines(file).includes(machine))
  if (stale.length > 0) throw new Error(`TREE_SITTER_CORE_BUILD_STALE: ${target}: ${stale.join(", ")}`)
  const preferred = packages.flatMap((item) => nodeFiles(path.join(item.dir, "build", "Release")))
  const foreignPreferred = preferred.filter((file) => !nativeMachines(file).includes(machine))
  if (foreignPreferred.length) throw new Error(`TREE_SITTER_PREFERRED_BUILD_STALE: ${target}: ${foreignPreferred.join(", ")}`)
  // Preflight every reusable binding, including node-gyp-build's preferred
  // build/Release in grammars. Refuse before any other package is rebuilt/copied.
  if (input.os === "linux") {
    [...packages.flatMap((item) => item.files), ...preferred]
      .filter((file) => nativeMachines(file).includes(machine))
      .forEach((file) => requireElfLibc(file, "glibc"))
    if (rebuild && (process.platform !== "linux" || process.arch !== input.arch || linuxRuntimeLibc().kind !== "glibc"))
      throw new Error(`TREE_SITTER_NATIVE_GLIBC_BUILD_REQUIRED: ${target}`)
  }
  const unbound = cores.filter((item) => item.files.length === 0)
  if (unbound.length > 0 && !rebuild)
    throw new Error(
      `TREE_SITTER_CORE_BINDING_MISSING: ${target} needs a ${target} host to build ` +
        unbound.map((item) => path.join(item.dir, "prebuilds", target, "tree-sitter.node")).join(", "),
    )
  broken.forEach((item) => rebuildPackage(input.root, item.dir, item.files, machine, input.os === "linux" ? "glibc" : undefined))
  unbound.forEach((item) => {
    const file = path.join(item.dir, "prebuilds", target, "tree-sitter.node")
    // The install script's own build, already checked against the target above, needs no second compile.
    const built = nodeFiles(path.join(item.dir, "build", "Release"))
    mkdirSync(path.dirname(file), { recursive: true })
    const binding = built[0]
    if (built.length === 1 && binding) return copyFileSync(binding, file)
    rebuildPackage(input.root, item.dir, [file], machine, input.os === "linux" ? "glibc" : undefined)
  })
  return {
    target,
    checked: packages.flatMap((item) => item.files),
    rebuilt: [...broken, ...unbound].map((item) => item.name),
  }
}

// What a compiled CLI ships in bin/tree-sitter/: each package maestro-arsenal parses with (onboard/extract.ts), cut to
// the files its Bun entry reads. That entry requires prebuilds/<os>-<arch>/<name>.node beside itself, so the target's
// binding keeps that path. Arsenal parses JavaScript with the typescript grammar, so tree-sitter-javascript stays out.
const SHIPPED: Record<string, string[]> = {
  "tree-sitter": ["package.json", "LICENSE", "index.js"],
  "tree-sitter-python": ["package.json", "LICENSE", "bindings/node/index.js", "src/node-types.json"],
  "tree-sitter-typescript": [
    "package.json",
    "LICENSE",
    "bindings/node/index.js",
    "typescript/src/node-types.json",
    "tsx/src/node-types.json",
  ],
}

type Target = { os: string; arch: string; abi?: string }

export function treeSitterArtifactKey(input: Target) {
  if (input.abi !== undefined && (input.abi !== "musl" || input.os !== "linux"))
    throw new Error(`TREE_SITTER_ABI_UNSUPPORTED: ${input.os}-${input.arch}-${input.abi}`)
  return `${input.os}-${input.arch}${input.abi === "musl" ? "-musl" : ""}`
}

/**
 * The paths inside bin/tree-sitter retain upstream OS/CPU names. ABI belongs to
 * the external artifact key, not the binding paths the bundled consumer loads.
 */
export function treeSitterBundle(input: Target) {
  treeSitterArtifactKey(input)
  return Object.entries(SHIPPED).flatMap(([name, files]) =>
    [...files, `prebuilds/${input.os}-${input.arch}/${name}.node`].map((file) => `${name}/${file}`),
  )
}

/**
 * Where each bin/tree-sitter/ file of a build comes from. `artifacts` (TREE_SITTER_ARTIFACTS, as OMNI_ARTIFACTS for
 * omni) holds bundles exported on each target's own host (`tree-sitter-prebuilds-cli.ts <os> <arch> --out <artifacts>`),
 * one per treeSitterArtifactKey directory; every binding's CPU and Linux libc must match.
 * A target without one takes maestro-arsenal's own dependencies under `root`, once prepareTreeSitterPrebuilds has
 * repaired or built its bindings, or stops with that function's named error (another target's core binding cannot be
 * built on this host). Resolve every build before building any.
 */
export function resolveTreeSitter(input: Target & { root: string; artifacts?: string }) {
  const files = treeSitterBundle(input)
  const exported = input.artifacts ? path.join(input.artifacts, treeSitterArtifactKey(input)) : ""
  if (files.length > 0 && exported && existsSync(exported)) {
    requireTreeSitterBundle(exported, input)
    return files.map((file) => ({ from: path.join(exported, ...file.split("/")), to: file }))
  }
  if (files.length > 0) prepareTreeSitterPrebuilds(input)
  if (files.length === 0) return []
  const resolve = createRequire(path.join(WorkspacePaths.make(input.root).module("maestro-arsenal"), "package.json")).resolve
  const resolved = files.map((file) => {
    const [name, ...rest] = file.split("/")
    return { from: path.join(realpathSync(path.dirname(resolve(`${name}/package.json`))), ...rest), to: file }
  })
  resolved.filter((file) => input.os === "linux" && file.to.endsWith(".node"))
    .forEach((file) => requireElfLibc(file.from, input.abi === "musl" ? "musl" : "glibc"))
  return resolved
}

/**
 * Exports to `out`/treeSitterArtifactKey for a cross build's TREE_SITTER_ARTIFACTS. Run it on the
 * target's own host: anywhere else resolveTreeSitter stops with its named error rather than export another CPU's
 * bindings.
 */
export function exportTreeSitter(input: Target & { root: string; out: string }) {
  const dir = path.join(path.resolve(input.out), treeSitterArtifactKey(input))
  const files = resolveTreeSitter({ root: input.root, os: input.os, arch: input.arch, abi: input.abi })
  rmSync(dir, { recursive: true, force: true })
  copyTreeSitter(files, dir, input)
  return { target: treeSitterArtifactKey(input), exported: dir, files: files.map((file) => file.to) }
}

/** Copies resolved files into `dir` (a build's bin/tree-sitter) and checks the result as every consumer does. */
export function copyTreeSitter(files: { from: string; to: string }[], dir: string, target: Target) {
  files.forEach((file) => {
    const destination = path.join(dir, ...file.to.split("/"))
    mkdirSync(path.dirname(destination), { recursive: true })
    copyFileSync(file.from, destination)
  })
  requireTreeSitterBundle(dir, target)
}

/**
 * Stops with TREE_SITTER_BUNDLE_INCOMPLETE unless `dir` holds every bin/tree-sitter/ file of the target as a regular
 * file, each binding built for the target's CPU.
 */
export function requireTreeSitterBundle(dir: string, input: Target) {
  const target = `${input.os}-${input.arch}`
  const machine = NATIVE_MACHINES[target]
  if (machine === undefined) throw new Error(`TREE_SITTER_TARGET_UNSUPPORTED: ${target}`)
  const problems = treeSitterBundle(input).flatMap((file) => {
    const full = path.join(dir, ...file.split("/"))
    if (!lstatSync(full, { throwIfNoEntry: false })?.isFile()) return [`${file} is missing`]
    if (file.endsWith(".node") && !nativeMachines(full).includes(machine)) return [`${file} is not a ${target} binary`]
    if (file.endsWith(".node") && input.os === "linux")
      requireElfLibc(full, input.abi === "musl" ? "musl" : "glibc")
    return []
  })
  if (problems.length > 0) throw new Error(`TREE_SITTER_BUNDLE_INCOMPLETE: ${target} in ${dir}: ${problems.join(", ")}`)
}

/** The CPU identifiers a native image declares (every slice of a universal Mach-O); empty for anything else. */
export function nativeMachines(file: string) {
  const bytes = Buffer.alloc(4096)
  const fd = openSync(file, "r")
  const length = (() => {
    try {
      return readSync(fd, bytes, 0, bytes.length, 0)
    } finally {
      closeSync(fd)
    }
  })()
  const data = bytes.subarray(0, length)
  if (length >= 20 && data.readUInt32BE(0) === 0x7f454c46)
    return [data[5] === 2 ? data.readUInt16BE(18) : data.readUInt16LE(18)]
  if (length >= 8 && [0xfeedface, 0xfeedfacf].includes(data.readUInt32LE(0))) return [data.readUInt32LE(4)]
  if (length >= 8 && [0xcafebabe, 0xcafebabf].includes(data.readUInt32BE(0))) {
    const size = data.readUInt32BE(0) === 0xcafebabe ? 20 : 32
    return Array.from({ length: data.readUInt32BE(4) }, (_, index) => 8 + index * size)
      .filter((offset) => offset + 4 <= length)
      .map((offset) => data.readUInt32BE(offset))
  }
  if (length >= 64 && data.readUInt16LE(0) === 0x5a4d) {
    const header = data.readUInt32LE(0x3c)
    if (header + 6 <= length && data.readUInt32BE(header) === 0x50450000) return [data.readUInt16LE(header + 4)]
  }
  return []
}

// Isolated (.bun store), hoisted and per-workspace layouts; symlinked copies collapse to one real directory.
function grammarPackages(root: string) {
  const workspace = WorkspacePaths.make(root)
  const modules = path.join(workspace.root, "node_modules")
  const store = path.join(modules, ".bun")
  const parents = [
    modules,
    ...entries(store).map((name) => path.join(store, name, "node_modules")),
    ...grammars(modules).map((dir) => path.join(dir, "node_modules")),
    ...workspace.entries.map((entry) => path.join(entry.path, "node_modules")),
  ]
  // existsSync follows links, so a dangling grammar symlink drops out before realpathSync would throw on it.
  return [...new Set(parents.flatMap(grammars).filter((dir) => existsSync(dir)).map((dir) => realpathSync(dir)))]
    .filter((dir) => existsSync(path.join(dir, "package.json")))
    .sort()
}

function grammars(parent: string) {
  return entries(parent)
    .filter((name) => name.startsWith("tree-sitter"))
    .map((name) => path.join(parent, name))
}

function entries(dir: string) {
  return existsSync(dir) ? readdirSync(dir) : []
}

function nodeFiles(dir: string) {
  return entries(dir)
    .filter((name) => name.endsWith(".node"))
    .map((name) => path.join(dir, name))
}

/** The lockfile's node-gyp entry script under `root`, in the hoisted or the isolated (.bun store) layout. */
export function lockfileNodeGyp(root: string) {
  return [
    path.join(root, "node_modules", "node-gyp", "bin", "node-gyp.js"),
    ...entries(path.join(root, "node_modules", ".bun"))
      .filter((name) => name.startsWith("node-gyp@"))
      .map((name) => path.join(root, "node_modules", ".bun", name, "node_modules", "node-gyp", "bin", "node-gyp.js")),
  ].find((file) => existsSync(file))
}

function rebuildPackage(root: string, dir: string, files: string[], machine: number, libc?: "musl" | "glibc") {
  const gyp = lockfileNodeGyp(root)
  if (!gyp) throw new Error(`TREE_SITTER_REBUILD_UNAVAILABLE: no lockfile node-gyp under ${root}`)
  const build = path.join(dir, "build")
  // node-gyp-build loads build/Release before prebuilds; a tree this step did not make is not its to replace.
  if (existsSync(build)) throw new Error(`TREE_SITTER_REBUILD_FAILED: ${build} already exists`)
  // gyp also stamps targets of dependency .gyp files outside the tree (node-addon-api) into the package directory.
  const before = new Set(entries(dir))
  try {
    const result = spawnSync("node", [gyp, "rebuild", "--release", "--jobs=max"], { cwd: dir, stdio: "inherit" })
    if (result.status !== 0)
      throw new Error(`TREE_SITTER_REBUILD_FAILED: node-gyp exited ${result.status} in ${dir}`, { cause: result.error })
    const outputs = nodeFiles(path.join(build, "Release"))
    const output = outputs[0] ?? ""
    if (outputs.length !== 1 || !nativeMachines(output).includes(machine))
      throw new Error(
        `TREE_SITTER_REBUILD_FAILED: ${dir} built ${outputs.join(", ") || "nothing"} for the wrong target`,
      )
    if (libc) requireElfLibc(output, libc)
    files.forEach((file) => {
      // Bun links store files to its global cache; unlink first so the copy never rewrites the cached bytes.
      rmSync(file, { force: true })
      copyFileSync(output, file)
    })
  } finally {
    entries(dir)
      .filter((name) => !before.has(name))
      .forEach((name) => rmSync(path.join(dir, name), { recursive: true, force: true }))
  }
}

// ELF64 program headers and dynamic entries, not byte-string sniffing. Bounds
// apply before every indirect access; missing/unknown libc is a named refusal.
export function inspectElf(file: string) {
  return Elf.inspect(readFileSync(file), file)
}

export function requireElfLibc(file: string, expected: "musl" | "glibc") {
  return Elf.requireLibc(readFileSync(file), expected, file)
}

// Match running ELF interpreter to an actual executable libc mapping, including
// inode and device identity. Merely having a musl loader on disk proves nothing.
export function linuxRuntimeLibc() {
  if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch)) throw new Error("NATIVE_LINUX_RUNTIME_REQUIRED")
  const elf = inspectElf("/proc/self/exe")
  const cpu = process.arch === "x64" ? "x86_64" : "aarch64"
  if (elf.machine !== NATIVE_MACHINES[`linux-${process.arch}`] || ![cpu, process.arch].includes(machine()))
    throw new Error("NATIVE_LINUX_RUNTIME_CPU_MISMATCH")
  const kind = path.basename(elf.interpreter ?? "") === `ld-musl-${cpu}.so.1` ? "musl" :
    path.basename(elf.interpreter ?? "") === (process.arch === "x64" ? "ld-linux-x86-64.so.2" : "ld-linux-aarch64.so.1") ? "glibc" : undefined
  if (!kind || !elf.interpreter?.startsWith("/")) throw new Error("NATIVE_LINUX_RUNTIME_INTERPRETER_UNKNOWN")
  const mappings = readFileSync("/proc/self/maps", "utf8").trim().split("\n").map((line) => {
    const match = /^([0-9a-f]+)-([0-9a-f]+)\s+([rwxps-]{4})\s+[0-9a-f]+\s+([0-9a-f]+):([0-9a-f]+)\s+(\d+)(?:\s+(.*))?$/.exec(line)
    if (!match) throw new Error("NATIVE_LINUX_RUNTIME_MAPS_INVALID")
    return { permissions: match[3]!, major: parseInt(match[4]!, 16), minor: parseInt(match[5]!, 16), inode: BigInt(match[6]!), path: match[7] }
  })
  if (!mappings.length) throw new Error("NATIVE_LINUX_RUNTIME_MAPS_EMPTY")
  const loaded = mappings.filter((m) => m.path?.startsWith("/") &&
    /^(?:libc\.so\.6|libc\.musl-.*|ld-musl-.*|libgcompat.*)$/.test(path.basename(m.path)))
  if (!loaded.length || loaded.some((m) => /gcompat|\(deleted\)/.test(m.path!)) ||
      (kind === "musl" && loaded.some((m) => path.basename(m.path!) === "libc.so.6")) ||
      (kind === "glibc" && loaded.some((m) => /musl/.test(path.basename(m.path!)))))
    throw new Error("NATIVE_LINUX_RUNTIME_LIBC_MAPPING_MISMATCH")
  if (mappings.some((m) => m.path && /(?:qemu|gcompat)/.test(path.basename(m.path))))
    throw new Error("NATIVE_LINUX_RUNTIME_COMPAT_OR_EMULATION_REFUSED")
  const library = kind === "musl" ? realpathSync(elf.interpreter) : realpathSync(loaded.find((m) => path.basename(m.path!) === "libc.so.6")!.path!)
  const stat = statSync(library, { bigint: true })
  const major = Number((stat.dev >> 8n & 0xfffn) | (stat.dev >> 32n & 0xfffff000n))
  const minor = Number((stat.dev & 0xffn) | (stat.dev >> 12n & 0xffffff00n))
  if (!mappings.some((m) => m.path === library && m.permissions.includes("x") && m.inode === stat.ino && m.major === major && m.minor === minor))
    throw new Error("NATIVE_LINUX_RUNTIME_LIBC_NOT_LOADED")
  return { kind, interpreter: elf.interpreter, library, machine: elf.machine, inode: String(stat.ino), device: `${major}:${minor}` }
}
