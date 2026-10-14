import { afterEach, expect, test } from "bun:test"
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import {
  NATIVE_MACHINES,
  copyTreeSitter,
  exportTreeSitter,
  lockfileNodeGyp,
  nativeMachines,
  prepareTreeSitterPrebuilds,
  requireTreeSitterBundle,
  resolveTreeSitter,
  treeSitterBundle,
  treeSitterArtifactKey,
  inspectElf,
  requireElfLibc,
} from "./tree-sitter-prebuilds"

const root = path.resolve(import.meta.dir, "../../..")
const host = `${process.platform}-${process.arch}`
const fixtures: string[] = []

afterEach(() => fixtures.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

test("the installed linux-arm64 typescript and javascript grammars are x86-64 and the guard refuses them", () => {
  const failure = (() => {
    try {
      prepareTreeSitterPrebuilds({ root, os: "linux", arch: "arm64", rebuild: false })
    } catch (error) {
      return String(error)
    }
  })()
  expect(failure).toContain("TREE_SITTER_PREBUILD_ARCH_MISMATCH")
  expect(failure).toMatch(/tree-sitter-typescript[\\/]prebuilds[\\/]linux-arm64[\\/]tree-sitter-typescript\.node/)
  expect(failure).toMatch(/tree-sitter-javascript[\\/]prebuilds[\\/]linux-arm64[\\/]tree-sitter-javascript\.node/)
  expect(failure).not.toContain("tree-sitter-python.node")
})

// The grammar checks run first, so reaching the core error means every grammar prebuild for the target matched.
// The published core package has no prebuilds; an install with lifecycle scripts adds only a host build/Release, which
// is still no binding for Bun and is stale for every other target.
test.each(["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64", "win32-arm64"])(
  "%s grammar prebuilds all match and the installed core package has no binding for it",
  (target) => {
    const [platform, arch] = target.split("-")
    expect(() => prepareTreeSitterPrebuilds({ root, os: platform!, arch: arch!, rebuild: false })).toThrow(
      new RegExp(`^TREE_SITTER_CORE_(BINDING_MISSING|BUILD_STALE): ${target}`),
    )
  },
)

test("an install without the grammars or the core package is a named failure, not a pass", () => {
  const empty = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-empty-"))
  fixtures.push(empty)
  expect(() => prepareTreeSitterPrebuilds({ root: empty, os: "linux", arch: "x64" })).toThrow(
    "TREE_SITTER_PREBUILDS_MISSING: linux-x64: tree-sitter, tree-sitter-javascript, tree-sitter-python, tree-sitter-typescript",
  )
})

test("a core package without a binding is built for the host, and Node and Bun both parse with it", () => {
  const fixture = grammarFixture("source")
  const core = path.join(fixture, "node_modules", "tree-sitter")
  const binding = path.join(core, "prebuilds", host, "tree-sitter.node")
  const before = readdirSync(core).sort()
  expect(() =>
    prepareTreeSitterPrebuilds({ root: fixture, os: process.platform, arch: process.arch, rebuild: false }),
  ).toThrow(`TREE_SITTER_CORE_BINDING_MISSING: ${host} needs a ${host} host to build ${binding}`)

  const result = prepareTreeSitterPrebuilds({ root: fixture, os: process.platform, arch: process.arch })

  expect(result.rebuilt).toEqual(["tree-sitter"])
  expect(nativeMachines(binding)).toEqual([NATIVE_MACHINES[host]!])
  // Only the binding is left behind: no build/ tree and no gyp stamps for node-addon-api.
  expect(readdirSync(core).sort()).toEqual([...new Set([...before, "prebuilds"])].sort())
  // Node finds the binding through node-gyp-build; Bun requires prebuilds/<os>-<arch>/tree-sitter.node directly.
  const script = `const Parser = require(${JSON.stringify(core)}); const parser = new Parser();
    parser.setLanguage(require(${JSON.stringify(path.join(fixture, "node_modules", "tree-sitter-python"))}));
    console.log(parser.parse("a = 1").rootNode.toString())`
  ;[["node", "-e", script], [process.execPath, "-e", script]].forEach((command) => {
    const run = Bun.spawnSync(command)
    expect({ exit: run.exitCode, stdout: run.stdout.toString().trim() }, run.stderr.toString()).toEqual({
      exit: 0,
      stdout: "(module (expression_statement (assignment left: (identifier) right: (integer))))",
    })
  })
}, 600_000)

test("an install-script core build for another CPU is refused, because node-gyp-build loads it first", () => {
  const fixture = grammarFixture("stub")
  const release = path.join(fixture, "node_modules", "tree-sitter", "build", "Release")
  mkdirSync(release, { recursive: true })
  copyFileSync(foreignPython(), path.join(release, "tree_sitter_runtime_binding.node"))
  expect(() => prepareTreeSitterPrebuilds({ root: fixture, os: process.platform, arch: process.arch })).toThrow(
    `TREE_SITTER_CORE_BUILD_STALE: ${host}: ${path.join(release, "tree_sitter_runtime_binding.node")}`,
  )
})

test("a mislabeled host prebuild is rebuilt from source and loads", () => {
  const fixture = grammarFixture("stub")
  const file = path.join(fixture, "node_modules", "tree-sitter-python", "prebuilds", host, "tree-sitter-python.node")
  rmSync(file)
  copyFileSync(foreignPython(), file)
  expect(nativeMachines(file)).not.toContain(NATIVE_MACHINES[host])
  expect(() =>
    prepareTreeSitterPrebuilds({ root: fixture, os: process.platform, arch: process.arch, rebuild: false }),
  ).toThrow("TREE_SITTER_PREBUILD_ARCH_MISMATCH")

  const result = prepareTreeSitterPrebuilds({ root: fixture, os: process.platform, arch: process.arch })

  expect(result.rebuilt).toEqual(["tree-sitter-python"])
  expect(nativeMachines(file)).toEqual([NATIVE_MACHINES[host]!])
  expect(existsSync(path.join(fixture, "node_modules", "tree-sitter-python", "build"))).toBe(false)
  // A child loads it: the grammar's real consumer is a Node worker, and a DLL loaded here would pin the fixture on Windows.
  const load = Bun.spawnSync(["node", "-e", `console.log(Object.keys(require(${JSON.stringify(file)})).join())`])
  expect({ exit: load.exitCode, stdout: load.stdout.toString().trim() }, load.stderr.toString()).toEqual({
    exit: 0,
    stdout: "language",
  })
}, 600_000)

const resolve = createRequire(path.join(root, "packages", "maestro-arsenal", "package.json")).resolve
const python = path.resolve(path.dirname(resolve("tree-sitter-python/package.json")))

// A real tree-sitter-python beside host-CPU javascript/typescript stubs. The core package is either a stub with a
// host-CPU binding, or the real package as an install without lifecycle scripts leaves it: sources, no binding.
function grammarFixture(core: "stub" | "source") {
  // gyp computes relative paths from the real cwd; macOS tmpdir is behind the /var -> /private/var link.
  const fixture = realpathSync(mkdtempSync(path.join(os.tmpdir(), "tree-sitter-rebuild-")))
  fixtures.push(fixture)
  const modules = path.join(fixture, "node_modules")
  const gyp = lockfileNodeGyp(root)!
  const source = realpathSync(path.dirname(resolve("tree-sitter/package.json")))
  mkdirSync(modules)
  cpSync(realpathSync(python), path.join(modules, "tree-sitter-python"), { recursive: true, dereference: true })
  // gyp cannot reach a dependency .gyp outside the tree it builds, so node-addon-api is copied, not linked.
  // Python and the core package take the same node-addon-api and node-gyp-build.
  ;["node-addon-api", "node-gyp-build"].forEach((name) =>
    cpSync(realpathSync(path.dirname(createRequire(path.join(python, "package.json")).resolve(`${name}/package.json`))), path.join(modules, name), {
      recursive: true,
    }),
  )
  symlinkSync(path.dirname(path.dirname(gyp)), path.join(modules, "node-gyp"), "junction")
  // The stubs only need host-CPU bytes. Python's host prebuild has them everywhere, including linux-arm64.
  const stubs = [
    ["tree-sitter-typescript", "tree-sitter-typescript.node"],
    ["tree-sitter-javascript", "tree-sitter-javascript.node"],
    ...(core === "stub" ? [["tree-sitter", "tree-sitter.node"]] : []),
  ]
  stubs.forEach(([name, file]) => {
    mkdirSync(path.join(modules, name!, "prebuilds", host), { recursive: true })
    writeFileSync(path.join(modules, name!, "package.json"), JSON.stringify({ name }))
    copyFileSync(
      path.join(python, "prebuilds", host, "tree-sitter-python.node"),
      path.join(modules, name!, "prebuilds", host, file!),
    )
  })
  // A CI install runs the core install script, so its build/ is left out along with any binding.
  if (core === "source")
    cpSync(source, path.join(modules, "tree-sitter"), {
      recursive: true,
      dereference: true,
      filter: (file) => !["build", "prebuilds", "node_modules"].includes(path.relative(source, file).split(path.sep)[0]!),
    })
  return fixture
}

// Python's published prebuild for some CPU other than this host's.
function foreignPython() {
  const dir = readdirSync(path.join(python, "prebuilds")).find(
    (name) =>
      !nativeMachines(path.join(python, "prebuilds", name, "tree-sitter-python.node")).includes(NATIVE_MACHINES[host]!),
  )!
  return path.join(python, "prebuilds", dir, "tree-sitter-python.node")
}

// Python's published prebuilds carry the right CPU for every target, so they stand in for each binding of a bundle.
function bundleFixture(target: { os: string; arch: string }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-bundle-"))
  fixtures.push(dir)
  treeSitterBundle(target).forEach((file) => {
    const destination = path.join(dir, ...file.split("/"))
    mkdirSync(path.dirname(destination), { recursive: true })
    if (!file.endsWith(".node")) return writeFileSync(destination, file)
    copyFileSync(path.join(python, "prebuilds", `${target.os}-${target.arch}`, "tree-sitter-python.node"), destination)
  })
  return dir
}

test.each(Object.keys(NATIVE_MACHINES))(
  "the %s CLI bundle names the core, typescript and python bindings, and a gap or a foreign binding is refused",
  (name) => {
    const [platform, arch] = name.split("-")
    const target = { os: platform!, arch: arch! }
    expect(treeSitterBundle(target).filter((file) => file.endsWith(".node"))).toEqual([
      `tree-sitter/prebuilds/${name}/tree-sitter.node`,
      `tree-sitter-python/prebuilds/${name}/tree-sitter-python.node`,
      `tree-sitter-typescript/prebuilds/${name}/tree-sitter-typescript.node`,
    ])
    const dir = bundleFixture(target)
    requireTreeSitterBundle(dir, target)
    // Each file is required: removing any one of them is a named failure.
    treeSitterBundle(target).forEach((file) => {
      const full = path.join(dir, ...file.split("/"))
      renameSync(full, `${full}.away`)
      expect(() => requireTreeSitterBundle(dir, target)).toThrow(
        `TREE_SITTER_BUNDLE_INCOMPLETE: ${name} in ${dir}: ${file} is missing`,
      )
      renameSync(`${full}.away`, full)
    })
    const binding = path.join(dir, "tree-sitter", "prebuilds", name, "tree-sitter.node")
    copyFileSync(foreignTo(name), binding)
    expect(() => requireTreeSitterBundle(dir, target)).toThrow(
      `TREE_SITTER_BUNDLE_INCOMPLETE: ${name} in ${dir}: tree-sitter/prebuilds/${name}/tree-sitter.node is not a ${name} binary`,
    )
  },
)

test("musl artifact keys differ from glibc but keep runtime binding paths; same-CPU glibc exports refuse admission", () => {
  const target = { os: "linux", arch: "x64", abi: "musl" }
  expect(treeSitterArtifactKey(target)).toBe("linux-x64-musl")
  expect(treeSitterArtifactKey({ ...target, abi: undefined })).toBe("linux-x64")
  expect(treeSitterBundle(target)).toEqual(treeSitterBundle({ ...target, abi: undefined }))
  expect(treeSitterBundle(target).filter((file) => file.endsWith(".node"))).toHaveLength(3)
  const artifacts = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-musl-artifacts-"))
  fixtures.push(artifacts)
  renameSync(bundleFixture(target), path.join(artifacts, "linux-x64-musl"))
  expect(() => resolveTreeSitter({ root, ...target, artifacts })).toThrow("ELF_LIBC_MISMATCH")
  expect(() => prepareTreeSitterPrebuilds({ root, ...target, rebuild: false })).toThrow("TREE_SITTER_NATIVE_MUSL_BUILD_REQUIRED")
})

test("parsed ELF dependencies reject truncated, unknown and mixed libc rather than scanning source bytes", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-elf-"))
  fixtures.push(dir)
  const file = path.join(dir, "binding.node")
  writeFileSync(file, Buffer.alloc(0))
  expect(() => inspectElf(file)).toThrow("ELF_TRUNCATED")
  writeFileSync(file, Buffer.alloc(64))
  expect(() => inspectElf(file)).toThrow("ELF64_UNSUPPORTED")
  for (const [names, abi] of [["libc.so.6", "glibc"], ["libc.musl-x86_64.so.1", "musl"], ["libc.so.6,libc.musl-x86_64.so.1", undefined], ["libunknown.so", undefined]] as const) {
    // Inert synthetic ELF only calibrates parser/admission, never native runtime.
    const bytes = elfFixture(names.split(","))
    writeFileSync(file, bytes)
    expect(inspectElf(file).needed).toEqual(names.split(","))
    for (const expected of ["musl", "glibc"] as const) {
      if (abi === expected) expect(requireElfLibc(file, expected).machine).toBe(62)
      if (abi !== expected) expect(() => requireElfLibc(file, expected)).toThrow("ELF_LIBC_MISMATCH")
    }
    writeFileSync(file, bytes.subarray(0, 180))
    expect(() => inspectElf(file)).toThrow("ELF_TRUNCATED")
  }
})

function elfFixture(names: string[], machine = 62) {
  const bytes = Buffer.alloc(512)
  Buffer.from("7f454c46020101", "hex").copy(bytes)
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(machine, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeBigUInt64LE(64n, 32)
  bytes.writeUInt16LE(56, 54)
  bytes.writeUInt16LE(2, 56)
  bytes.writeUInt32LE(1, 64)
  bytes.writeBigUInt64LE(0x1000n, 80)
  bytes.writeBigUInt64LE(512n, 96)
  bytes.writeBigUInt64LE(512n, 104)
  bytes.writeUInt32LE(2, 120)
  bytes.writeBigUInt64LE(176n, 128)
  bytes.writeBigUInt64LE(0x10b0n, 136)
  const strings = Buffer.from(names.join("\0") + "\0")
  strings.copy(bytes, 352)
  const entries = [[5n, 0x1160n], [10n, BigInt(strings.length)], ...names.map((_, i) =>
    [1n, BigInt(names.slice(0, i).reduce((n, s) => n + s.length + 1, 0))]), [0n, 0n]]
  bytes.writeBigUInt64LE(BigInt(entries.length * 16), 152)
  bytes.writeBigUInt64LE(BigInt(entries.length * 16), 160)
  entries.forEach(([tag, value], i) => { bytes.writeBigInt64LE(tag!, 176 + i * 16); bytes.writeBigUInt64LE(value!, 184 + i * 16) })
  return bytes
}

test("ELF dynamic VA wins over off-table opposite-libc decoy; conflicting file offset and indirect bounds refuse", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-elf-mapping-"))
  fixtures.push(dir)
  const file = path.join(dir, "binding.node")
  const actual = elfFixture(["libc.musl-x86_64.so.1"])
  elfFixture(["libc.so.6"]).subarray(176, 240).copy(actual, 256)
  actual.writeBigUInt64LE(0x11c0n, 264)
  Buffer.from("libc.so.6\0").copy(actual, 448)
  writeFileSync(file, actual)
  expect(requireElfLibc(file, "musl").needed).toEqual(["libc.musl-x86_64.so.1"])
  expect(() => requireElfLibc(file, "glibc")).toThrow("ELF_LIBC_MISMATCH")
  for (const [mutate, diagnostic] of [
    [(b: Buffer) => b.writeBigUInt64LE(256n, 128), "ELF_DYNAMIC_OFFSET_MISMATCH"],
    [(b: Buffer) => b.writeBigUInt64LE(0x5000n, 136), "ELF_MAPPING_UNMAPPED"],
    [(b: Buffer) => b.writeBigUInt64LE(511n, 104), "ELF_SEGMENT_MEMORY_INVALID"],
    [(b: Buffer) => { b.writeBigUInt64LE(768n, 104); b.writeBigUInt64LE(0x1200n, 184) }, "ELF_MAPPING_NOT_FILE_BACKED"],
    [(b: Buffer) => b.writeBigUInt64LE(999n, 216), "ELF_STRING_TABLE_INVALID"],
    [(b: Buffer) => b.writeBigUInt64LE(4n, 200), "ELF_STRING_UNTERMINATED"],
    [(b: Buffer) => b.writeBigInt64LE(21n, 224), "ELF_DYNAMIC_UNTERMINATED"],
    [(b: Buffer) => { b.writeUInt16LE(3, 56); b.copy(b, 176, 120, 176) }, "ELF_DYNAMIC_DUPLICATED"],
    [(b: Buffer) => { b.writeUInt16LE(3, 56); b.copy(b, 176, 64, 120) }, "ELF_LOAD_MAPPING_AMBIGUOUS"],
  ] as const) {
    const mutant = Buffer.from(actual)
    mutate(mutant)
    writeFileSync(file, mutant)
    expect(() => inspectElf(file)).toThrow(diagnostic)
  }
  writeFileSync(file, actual)
  expect(requireElfLibc(file, "musl").needed).toEqual(["libc.musl-x86_64.so.1"])
})

test.each(["prebuild", "preferred-core-release", "preferred-grammar-release"])("glibc preparation refuses same-CPU musl %s before modifying any package", (slot) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-prepare-abi-"))
  fixtures.push(root)
  const target = { os: "linux", arch: "x64", rebuild: false }
  const names = ["tree-sitter", "tree-sitter-javascript", "tree-sitter-python", "tree-sitter-typescript"]
  const files = names.map((name) => {
    const dir = path.join(root, "node_modules", name)
    mkdirSync(path.join(dir, "prebuilds/linux-x64"), { recursive: true })
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name }))
    const file = path.join(dir, "prebuilds/linux-x64", `${name}.node`)
    writeFileSync(file, elfFixture(["libc.so.6"]))
    return file
  })
  expect(prepareTreeSitterPrebuilds({ root, ...target }).rebuilt).toEqual([])
  const original = files.map((file) => readFileSync(file))
  const bad = slot === "prebuild" ? files[2]! : path.join(root, "node_modules",
    slot === "preferred-core-release" ? "tree-sitter" : "tree-sitter-python", "build/Release/preferred.node")
  mkdirSync(path.dirname(bad), { recursive: true })
  writeFileSync(bad, elfFixture(["libc.musl-x86_64.so.1"]))
  expect(() => prepareTreeSitterPrebuilds({ root, ...target })).toThrow("ELF_LIBC_MISMATCH")
  files.filter((file) => file !== bad).forEach((file) => expect(readFileSync(file)).toEqual(original[files.indexOf(file)]!))
  rmSync(bad)
  if (slot === "prebuild") writeFileSync(bad, original[2]!)
  expect(prepareTreeSitterPrebuilds({ root, ...target }).rebuilt).toEqual([])
})

test("copyTreeSitter places the bundle under the given directory and checks it there", () => {
  const target = { os: process.platform, arch: process.arch }
  const source = bundleFixture(target)
  const bin = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-bin-"))
  fixtures.push(bin)
  const files = treeSitterBundle(target).map((file) => ({ from: path.join(source, ...file.split("/")), to: file }))
  copyTreeSitter(files, path.join(bin, "tree-sitter"), target)
  requireTreeSitterBundle(path.join(bin, "tree-sitter"), target)
  expect(() => copyTreeSitter(files.slice(1), path.join(bin, "partial"), target)).toThrow(
    `TREE_SITTER_BUNDLE_INCOMPLETE: ${host} in ${path.join(bin, "partial")}: ${files[0]!.to} is missing`,
  )
})

test("a build for a target this host cannot provide stops before resolving any file", () => {
  const foreign = Object.keys(NATIVE_MACHINES).find((name) => name !== host && !name.startsWith(`${process.platform}-`))!
  const [platform, arch] = foreign.split("-")
  expect(() => resolveTreeSitter({ root, os: platform!, arch: arch! })).toThrow(
    /^TREE_SITTER_(CORE_BINDING_MISSING|CORE_BUILD_STALE|PREBUILD_ARCH_MISMATCH): /,
  )
})

test("a cross build ships the target's exported bundle, refuses a foreign binding there, and without one still stops", () => {
  const foreign = Object.keys(NATIVE_MACHINES).find((name) => name !== host && !name.startsWith(`${process.platform}-`))!
  const [platform, arch] = foreign.split("-")
  const target = { os: platform!, arch: arch! }
  const artifacts = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-artifacts-"))
  fixtures.push(artifacts)
  renameSync(bundleFixture(target), path.join(artifacts, foreign))
  expect(resolveTreeSitter({ root, ...target, artifacts })).toEqual(
    treeSitterBundle(target).map((file) => ({ from: path.join(artifacts, foreign, ...file.split("/")), to: file })),
  )
  // Another target's artifacts directory is no bundle for this one: the host path and its named error apply.
  const other = Object.keys(NATIVE_MACHINES).find((name) => name !== foreign && !name.startsWith(`${process.platform}-`))!
  const [otherPlatform, otherArch] = other.split("-")
  expect(() => resolveTreeSitter({ root, os: otherPlatform!, arch: otherArch!, artifacts })).toThrow(
    /^TREE_SITTER_(CORE_BINDING_MISSING|CORE_BUILD_STALE|PREBUILD_ARCH_MISMATCH): /,
  )
  const binding = path.join(artifacts, foreign, "tree-sitter", "prebuilds", foreign, "tree-sitter.node")
  copyFileSync(foreignTo(foreign), binding)
  expect(() => resolveTreeSitter({ root, ...target, artifacts })).toThrow(
    `TREE_SITTER_BUNDLE_INCOMPLETE: ${foreign} in ${path.join(artifacts, foreign)}: tree-sitter/prebuilds/${foreign}/tree-sitter.node is not a ${foreign} binary`,
  )
})

test("exporting a target's bundle on another host stops with the named error and exports nothing", () => {
  const foreign = Object.keys(NATIVE_MACHINES).find((name) => name !== host && !name.startsWith(`${process.platform}-`))!
  const [platform, arch] = foreign.split("-")
  const out = mkdtempSync(path.join(os.tmpdir(), "tree-sitter-export-"))
  fixtures.push(out)
  expect(() => exportTreeSitter({ root, os: platform!, arch: arch!, out })).toThrow(
    /^TREE_SITTER_(CORE_BINDING_MISSING|CORE_BUILD_STALE|PREBUILD_ARCH_MISMATCH): /,
  )
  expect(readdirSync(out)).toEqual([])
})

// The packaged Desktop bundles this module into its main entry, where import.meta.main is true: evaluated as the entry,
// the module itself must run nothing. Its command line lives in tree-sitter-prebuilds-cli.ts.
test("the module evaluated as the process entry runs no command; the CLI file owns the command line", () => {
  const library = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "tree-sitter-prebuilds.ts")])
  expect({ exit: library.exitCode, stdout: library.stdout.toString(), stderr: library.stderr.toString() }).toEqual({
    exit: 0,
    stdout: "",
    stderr: "",
  })
  const cli = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "tree-sitter-prebuilds-cli.ts")])
  expect(cli.exitCode).toBe(1)
  expect(cli.stderr.toString()).toContain("Usage: tree-sitter-prebuilds-cli.ts <os> <arch> [--out <dir>]")
})

// Python's published prebuild for a CPU other than `name`'s.
function foreignTo(name: string) {
  const dir = readdirSync(path.join(python, "prebuilds")).find(
    (other) =>
      !nativeMachines(path.join(python, "prebuilds", other, "tree-sitter-python.node")).includes(NATIVE_MACHINES[name]!),
  )!
  return path.join(python, "prebuilds", dir, "tree-sitter-python.node")
}
