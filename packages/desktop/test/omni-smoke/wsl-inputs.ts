// Repair: supply native GNU inputs to the unchanged Windows three-target prebuild.
// Extension: closed regular-file inventories bind source, locks and same-run custody.
import { createHash } from "node:crypto"
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { requireTreeSitterBundle, treeSitterBundle } from "../../../script/src/tree-sitter-prebuilds"

const root = path.resolve(import.meta.dirname, "../../../..")
const evidence = path.join(root, "packages/desktop/.omni-desktop-evidence")
const targets = ["linux-x64-gnu", "linux-arm64-gnu"] as const
type Target = typeof targets[number]
type Inventory = Record<string, string>
type Source = { sourceSHA: string; sourceTree: string; locks: Inventory; run: string; attempt: string; sourceHashes: Inventory }
type Descriptor = Omit<Source, "sourceHashes"> & { schema: 1; target: Target; host: string; files: Inventory }

function fail(predicate: string, detail: string): never {
  throw new Error(`${predicate}: ${detail}`)
}

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, timeout: 30_000 })
  if (result.exitCode !== 0) fail("WSL_INPUT_GIT", result.stderr.toString())
  return result.stdout.toString().trim()
}

export const hashFile = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex")

// Inspect directories too: a linked ancestor or an unexpected empty directory is not a regular-file inventory.
export function inventory(directory: string): Inventory {
  const walk = (dir: string, prefix = ""): [string, string][] => {
    const stat = lstatSync(dir, { throwIfNoEntry: false })
    if (!stat) fail("WSL_INPUT_MISSING", dir)
    if (stat.isSymbolicLink()) fail("WSL_INPUT_SYMLINK", dir)
    if (!stat.isDirectory()) fail("WSL_INPUT_REGULAR", dir)
    const entries = readdirSync(dir).sort()
    if (!entries.length) fail("WSL_INPUT_EMPTY", dir)
    return entries.flatMap((name): [string, string][] => {
      const relative = prefix + name
      const file = path.join(dir, name)
      const entry = lstatSync(file)
      if (entry.isSymbolicLink()) fail("WSL_INPUT_SYMLINK", relative)
      if (entry.isDirectory()) return walk(file, relative + "/")
      if (!entry.isFile() || entry.nlink !== 1) fail("WSL_INPUT_REGULAR", relative)
      if (!entry.size) fail("WSL_INPUT_EMPTY", relative)
      return [[relative, hashFile(file)]]
    })
  }
  return Object.fromEntries(walk(directory))
}

export function matchInventory(actual: Inventory, expected: Inventory, bytePredicate = "WSL_INPUT_BYTE_MISMATCH") {
  if (!Object.keys(expected).length || !Object.keys(actual).length) fail("WSL_INPUT_EMPTY", "inventory")
  Object.keys(expected).forEach((file) => {
    if (!(file in actual)) fail("WSL_INPUT_MISSING", file)
  })
  Object.keys(actual).forEach((file) => {
    if (!(file in expected)) fail("WSL_INPUT_EXTRA", file)
    if (actual[file] !== expected[file]) fail(bytePredicate, file)
  })
}

function hosted() {
  if (process.env.GITHUB_ACTIONS !== "true" || !process.env.CI || !process.env.DESKTOP_SOURCE_SHA ||
      !process.env.GITHUB_RUN_ID || !process.env.GITHUB_RUN_ATTEMPT) fail("WSL_INPUT_HOSTED", "current source/run/attempt required")
}

export function sourcePin(begin = false): Source {
  hosted()
  const sourceSHA = git("rev-parse", "HEAD")
  const sourceTree = git("rev-parse", "HEAD^{tree}")
  if (sourceSHA !== process.env.DESKTOP_SOURCE_SHA || git("status", "--porcelain", "--untracked-files=no"))
    fail("WSL_INPUT_SOURCE", "exact clean checkout required")
  // Bind canonical Git lock bytes, not Windows checkout's possible CRLF conversion.
  const locks = Object.fromEntries(["bun.lock", "packages/omni/Cargo.lock"].map((file) => {
    const blob = Bun.spawnSync(["git", "show", `HEAD:${file}`], { cwd: root, timeout: 30_000 })
    if (blob.exitCode !== 0) fail("WSL_INPUT_LOCK", file)
    return [file, createHash("sha256").update(blob.stdout).digest("hex")]
  }))
  const files = git("ls-files", "-z").split("\0").filter(Boolean)
  if (!files.includes("bun.lock") || !files.includes("packages/omni/Cargo.lock")) fail("WSL_INPUT_SOURCE", "source inventory incomplete")
  const current = { sourceSHA, sourceTree, locks, run: process.env.GITHUB_RUN_ID!, attempt: process.env.GITHUB_RUN_ATTEMPT!,
    sourceHashes: Object.fromEntries(files.map((file) => [file, hashFile(path.join(root, file))])) }
  if (begin) {
    mkdirSync(evidence, { recursive: true })
    if (existsSync(path.join(evidence, "source-pin.json"))) fail("WSL_INPUT_IMMUTABLE", "source pin already exists")
    writeFileSync(path.join(evidence, "source-pin.json"), JSON.stringify(current, null, 2))
    writeFileSync(path.join(evidence, "source-sha.txt"), sourceSHA + "\n")
    return current
  }
  const pinned = JSON.parse(readFileSync(path.join(evidence, "source-pin.json"), "utf8")) as Source
  if (pinned.sourceSHA !== sourceSHA || pinned.sourceTree !== sourceTree) fail("WSL_INPUT_SOURCE", "checkout changed")
  if (pinned.run !== current.run || pinned.attempt !== current.attempt) fail("WSL_INPUT_RUN", "source pin run/attempt changed")
  matchInventory(current.locks, pinned.locks, "WSL_INPUT_LOCK")
  matchInventory(current.sourceHashes, pinned.sourceHashes, "WSL_INPUT_SOURCE")
  return current
}

function tuple(target: string) {
  if (!targets.includes(target as Target)) fail("WSL_INPUT_TARGET", target)
  const arch = target === "linux-x64-gnu" ? "x64" : "arm64"
  return { target: target as Target, os: "linux", arch, host: `linux-${arch}` }
}

function payloadPaths(target: string) {
  return ["omni/hugr_omni.node", "omni/hugr-omni-supervisor", "omni/proof.json",
    ...treeSitterBundle(tuple(target)).map((file) => `tree-sitter/${file}`)].sort()
}

function proof(directory: string, descriptor: Descriptor) {
  const native = JSON.parse(readFileSync(path.join(directory, "omni/proof.json"), "utf8")) as {
    id: string; source: { headSHA: string; treeHash: string; omniTreeHash: string }; host: { os: string; cpu: string }; sha256: Inventory
  }
  if (native.id !== descriptor.target) fail("WSL_INPUT_TARGET", "native proof")
  if (native.source?.headSHA !== descriptor.sourceSHA || native.source?.treeHash !== descriptor.sourceTree ||
      native.source?.omniTreeHash !== git("rev-parse", "HEAD:packages/omni")) fail("WSL_INPUT_SOURCE", "native proof")
  if (`${native.host?.os}-${native.host?.cpu}` !== descriptor.host) fail("WSL_INPUT_HOST", "native proof")
  matchInventory(Object.fromEntries(["hugr_omni.node", "hugr-omni-supervisor"].map((file) => [file, hashFile(path.join(directory, "omni", file))])), native.sha256)
  requireTreeSitterBundle(path.join(directory, "tree-sitter"), tuple(descriptor.target))
}

export function verifyInputs(directory: string, target: string, source = sourcePin()) {
  const actual = inventory(directory)
  if (!("descriptor.json" in actual)) fail("WSL_INPUT_MISSING", "descriptor.json")
  const descriptor = JSON.parse(readFileSync(path.join(directory, "descriptor.json"), "utf8")) as Descriptor
  if (!descriptor || descriptor.schema !== 1 || Object.keys(descriptor).sort().join(",") !==
      "attempt,files,host,locks,run,schema,sourceSHA,sourceTree,target") fail("WSL_INPUT_SCHEMA", "descriptor")
  if (descriptor.sourceSHA !== source.sourceSHA || descriptor.sourceTree !== source.sourceTree) fail("WSL_INPUT_SOURCE", target)
  if (descriptor.run !== source.run || descriptor.attempt !== source.attempt) fail("WSL_INPUT_RUN", target)
  if (descriptor.target !== tuple(target).target) fail("WSL_INPUT_TARGET", target)
  if (descriptor.host !== tuple(target).host) fail("WSL_INPUT_HOST", target)
  if (!descriptor.locks || typeof descriptor.locks !== "object" || Array.isArray(descriptor.locks)) fail("WSL_INPUT_SCHEMA", "locks")
  matchInventory(descriptor.locks, source.locks, "WSL_INPUT_LOCK")
  if (!descriptor.files || typeof descriptor.files !== "object" || Array.isArray(descriptor.files)) fail("WSL_INPUT_SCHEMA", "files")
  const expected = payloadPaths(target)
  if (Object.keys(descriptor.files).length !== expected.length || !expected.every((file) => /^[a-f0-9]{64}$/.test(descriptor.files[file] ?? "")))
    fail("WSL_INPUT_SCHEMA", "complete payload inventory required")
  matchInventory(Object.fromEntries(Object.entries(actual).filter(([file]) => file !== "descriptor.json")), descriptor.files)
  proof(directory, descriptor)
  return descriptor
}

export function sealInputs(target: string, omni: string, treeSitter: string, destination: string) {
  const source = sourcePin()
  if (`${process.platform}-${process.arch}` !== tuple(target).host) fail("WSL_INPUT_HOST", target)
  if (existsSync(destination)) fail("WSL_INPUT_IMMUTABLE", destination)
  const native = inventory(omni)
  const grammar = inventory(treeSitter)
  const files = Object.fromEntries([...Object.entries(native).map(([file, hash]) => [`omni/${file}`, hash]),
    ...Object.entries(grammar).map(([file, hash]) => [`tree-sitter/${file}`, hash])])
  if (Object.keys(files).sort().join("\n") !== payloadPaths(target).join("\n")) fail("WSL_INPUT_SCHEMA", "producer payload inventory")
  const descriptor: Descriptor = { schema: 1, sourceSHA: source.sourceSHA, sourceTree: source.sourceTree,
    locks: source.locks, run: source.run, attempt: source.attempt, target: tuple(target).target, host: tuple(target).host, files }
  mkdirSync(destination, { recursive: true })
  Object.keys(files).forEach((file) => {
    mkdirSync(path.dirname(path.join(destination, file)), { recursive: true })
    copyFileSync(path.join(file.startsWith("omni/") ? omni : treeSitter, file.slice(file.indexOf("/") + 1)), path.join(destination, file))
  })
  writeFileSync(path.join(destination, "descriptor.json"), JSON.stringify(descriptor, null, 2))
  verifyInputs(destination, target, source)
  sourcePin()
}

export function importInputs(directory: string, target: string, omniRoot: string, treeRoot: string) {
  const descriptor = verifyInputs(directory, target)
  const native = path.join(omniRoot, target)
  const grammar = path.join(treeRoot, tuple(target).host)
  if (existsSync(native) || existsSync(grammar)) fail("WSL_INPUT_IMMUTABLE", target)
  Object.keys(descriptor.files).forEach((file) => {
    const destination = path.join(file.startsWith("omni/") ? native : grammar, file.slice(file.indexOf("/") + 1))
    mkdirSync(path.dirname(destination), { recursive: true })
    copyFileSync(path.join(directory, file), destination)
    if (hashFile(destination) !== descriptor.files[file]) fail("WSL_INPUT_COPY_MISMATCH", file)
  })
  matchInventory(inventory(native), Object.fromEntries(Object.entries(descriptor.files).filter(([file]) => file.startsWith("omni/")).map(([file, hash]) => [file.slice(5), hash])), "WSL_INPUT_COPY_MISMATCH")
  matchInventory(inventory(grammar), Object.fromEntries(Object.entries(descriptor.files).filter(([file]) => file.startsWith("tree-sitter/")).map(([file, hash]) => [file.slice(12), hash])), "WSL_INPUT_COPY_MISMATCH")
  verifyInputs(directory, target)
  writeFileSync(path.join(evidence, `${target}-import.json`), JSON.stringify(descriptor, null, 2))
  return descriptor
}

// Hosted controls use the downloaded real payload and the exact verifier used by import, never mock binaries.
export function custodyControls(directory: string, target: string) {
  const source = sourcePin()
  const baseline = verifyInputs(directory, target, source)
  const scratch = mkdtempSync(path.join(evidence, "custody-"))
  const results: { control: string; predicate: string; status: string }[] = [{ control: "clean-baseline", predicate: "accepted", status: "passed" }]
  const controls = [
    ["no-op", "accepted"], ["wrong-source", "WSL_INPUT_SOURCE"], ["wrong-run", "WSL_INPUT_RUN"],
    ["wrong-attempt", "WSL_INPUT_RUN"], ["wrong-target", "WSL_INPUT_TARGET"], ["wrong-host", "WSL_INPUT_HOST"],
    ["wrong-lock", "WSL_INPUT_LOCK"], ["empty", "WSL_INPUT_EMPTY"], ["missing", "WSL_INPUT_MISSING"],
    ["extra", "WSL_INPUT_EXTRA"], ["corruption", "WSL_INPUT_BYTE_MISMATCH"], ["symlink", "WSL_INPUT_SYMLINK"],
  ]
  try {
    controls.forEach(([control, predicate]) => {
      const mutant = path.join(scratch, control!)
      cpSync(directory, mutant, { recursive: true })
      const descriptor = structuredClone(baseline)
      if (control === "wrong-source") descriptor.sourceSHA = "0".repeat(40)
      if (control === "wrong-run") descriptor.run = "0"
      if (control === "wrong-attempt") descriptor.attempt = "0"
      if (control === "wrong-target") descriptor.target = target === targets[0] ? targets[1] : targets[0]
      if (control === "wrong-host") descriptor.host = "win32-x64"
      if (control === "wrong-lock") descriptor.locks["bun.lock"] = "0".repeat(64)
      // JSON whitespace is a semantic no-op, not a bypass of a payload digest.
      writeFileSync(path.join(mutant, "descriptor.json"), JSON.stringify(descriptor))
      const file = path.join(mutant, "omni/hugr_omni.node")
      if (control === "empty") {
        rmSync(mutant, { recursive: true })
        mkdirSync(mutant)
      }
      if (control === "missing") rmSync(file)
      if (control === "extra") writeFileSync(path.join(mutant, "extra.bin"), "extra")
      if (control === "corruption") {
        const bytes = readFileSync(file)
        bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1
        writeFileSync(file, bytes)
      }
      if (control === "symlink") {
        rmSync(file)
        symlinkSync(path.join(directory, "omni/hugr_omni.node"), file, "file")
      }
      const observed = (() => {
        try { verifyInputs(mutant, target, source); return "accepted" }
        catch (error) { return error instanceof Error ? error.message.split(":")[0] : "unknown-error" }
      })()
      results.push({ control: control!, predicate: observed!, status: observed === predicate ? "passed" : "failed" })
      if (observed !== predicate) fail("WSL_INPUT_CONTROL", `${control}: expected ${predicate}, observed ${observed}`)
    })
    verifyInputs(directory, target, source)
  } finally {
    writeFileSync(path.join(evidence, `${target}-custody-controls.json`), JSON.stringify(results, null, 2))
    rmSync(scratch, { recursive: true, force: true })
  }
  console.log("WSL_INPUT_CONTROLS " + JSON.stringify({ target, results }))
}

if (import.meta.main) {
  const [action, target, first, second, third] = process.argv.slice(2)
  switch (action) {
    case "begin": sourcePin(true); break
    case "assert": sourcePin(); break
    case "seal":
      if (!target || !first || !second || !third) fail("WSL_INPUT_USAGE", "seal target omni tree destination")
      sealInputs(target, path.resolve(first), path.resolve(second), path.resolve(third)); break
    case "controls":
      if (!target || !first) fail("WSL_INPUT_USAGE", "controls target directory")
      custodyControls(path.resolve(first), target); break
    case "import":
      if (!target || !first || !second || !third) fail("WSL_INPUT_USAGE", "import target directory omniRoot treeRoot")
      importInputs(path.resolve(first), target, path.resolve(second), path.resolve(third)); break
    default: fail("WSL_INPUT_USAGE", "begin | assert | seal | controls | import")
  }
}
