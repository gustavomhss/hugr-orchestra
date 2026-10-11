// Native tree-sitter grammars select prebuilds/<os>-<arch>/*.node by directory name, never by the bytes inside, and
// a packaged Desktop carries those directories in its node_modules. tree-sitter-typescript 0.23.2 and
// tree-sitter-javascript 0.23.1 (latest upstream typescript release, which pins javascript ^0.23.1) publish x86-64 ELF
// files under prebuilds/linux-arm64, so every Linux ARM64 package would ship grammars that cannot load.
// This runs under Node too (electron-builder loads the Desktop config there), so it uses node: APIs only.
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  closeSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs"
import path from "node:path"

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
 * otherwise the build stops with TREE_SITTER_PREBUILD_ARCH_MISMATCH instead of shipping it.
 */
export function prepareTreeSitterPrebuilds(input: { root: string; os: string; arch: string; rebuild?: boolean }) {
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
  const missing = REQUIRED.filter((name) => !packages.some((item) => item.name === name && item.files.length > 0))
  if (missing.length > 0) throw new Error(`TREE_SITTER_PREBUILDS_MISSING: ${target}: ${missing.join(", ")}`)
  const broken = packages.filter((item) => item.files.some((file) => !nativeMachines(file).includes(machine)))
  const rebuild = input.rebuild ?? (process.platform === input.os && process.arch === input.arch)
  if (broken.length > 0 && !rebuild)
    throw new Error(
      `TREE_SITTER_PREBUILD_ARCH_MISMATCH: ${target} needs a ${target} host to rebuild ` +
        broken.flatMap((item) => item.files.filter((file) => !nativeMachines(file).includes(machine))).join(", "),
    )
  broken.forEach((item) => rebuildPackage(input.root, item.dir, item.files, machine))
  return {
    target,
    checked: packages.flatMap((item) => item.files),
    rebuilt: broken.map((item) => item.name),
  }
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
  const modules = path.join(root, "node_modules")
  const store = path.join(modules, ".bun")
  const parents = [
    modules,
    ...entries(store).map((name) => path.join(store, name, "node_modules")),
    ...grammars(modules).map((dir) => path.join(dir, "node_modules")),
    ...entries(path.join(root, "packages")).map((name) => path.join(root, "packages", name, "node_modules")),
  ]
  return [...new Set(parents.flatMap(grammars).map((dir) => realpathSync(dir)))]
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

/** The lockfile's node-gyp entry script under `root`, in the hoisted or the isolated (.bun store) layout. */
export function lockfileNodeGyp(root: string) {
  return [
    path.join(root, "node_modules", "node-gyp", "bin", "node-gyp.js"),
    ...entries(path.join(root, "node_modules", ".bun"))
      .filter((name) => name.startsWith("node-gyp@"))
      .map((name) => path.join(root, "node_modules", ".bun", name, "node_modules", "node-gyp", "bin", "node-gyp.js")),
  ].find((file) => existsSync(file))
}

function rebuildPackage(root: string, dir: string, files: string[], machine: number) {
  const gyp = lockfileNodeGyp(root)
  if (!gyp) throw new Error(`TREE_SITTER_REBUILD_UNAVAILABLE: no lockfile node-gyp under ${root}`)
  const build = path.join(dir, "build")
  // node-gyp-build loads build/Release before prebuilds; a tree this step did not make is not its to replace.
  if (existsSync(build)) throw new Error(`TREE_SITTER_REBUILD_FAILED: ${build} already exists`)
  try {
    const result = spawnSync("node", [gyp, "rebuild", "--release", "--jobs=max"], { cwd: dir, stdio: "inherit" })
    if (result.status !== 0)
      throw new Error(`TREE_SITTER_REBUILD_FAILED: node-gyp exited ${result.status} in ${dir}`, { cause: result.error })
    const outputs = entries(path.join(build, "Release")).filter((name) => name.endsWith(".node"))
    const output = path.join(build, "Release", outputs[0] ?? "")
    if (outputs.length !== 1 || !nativeMachines(output).includes(machine))
      throw new Error(
        `TREE_SITTER_REBUILD_FAILED: ${dir} built ${outputs.join(", ") || "nothing"} for the wrong target`,
      )
    files.forEach((file) => {
      // Bun links store files to its global cache; unlink first so the copy never rewrites the cached bytes.
      rmSync(file)
      copyFileSync(output, file)
    })
  } finally {
    rmSync(build, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const [os, arch] = process.argv.slice(2)
  if (!os || !arch) throw new Error("Usage: tree-sitter-prebuilds.ts <os> <arch>")
  console.log(
    JSON.stringify(prepareTreeSitterPrebuilds({ root: path.resolve(import.meta.dirname, "../../.."), os, arch })),
  )
}
