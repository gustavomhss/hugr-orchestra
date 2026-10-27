import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join, parse, resolve, sep } from "node:path"
import { prepareDistribution, verifyDistribution } from "./distribution-payload"
import { artifactNative } from "./artifact-fs"
import type { ArtifactDirectory } from "./artifact-native"

type Tree = Map<string, { bytes: Buffer; executable: boolean } | null>

// Stable producer-owned source, staging and publication namespace only. Captured
// bytes/identity checks do not protect against authorized concurrent rewrites.
// Shares docs/specs/runtime-closure/PRODUCER-BOUNDARY.md, including owned-path cleanup.
export async function prepareNpmDistribution(input: { payloads: string[]; out: string }) {
  if (!input.payloads.length) throw new Error("At least one verified payload is required")
  if ([...input.payloads, input.out].some((path) => !path || path.includes("\0") || path.split(/[\\/]/).includes("..")))
    throw new Error("Unsafe npm distribution location")
  if (process.platform === "win32") {
    const { requireOrdinaryWindowsPath } = await import("./artifact-windows-root")
    ;[...input.payloads, input.out].forEach(requireOrdinaryWindowsPath)
  }
  const manifests = []
  for (const payload of input.payloads) manifests.push(await verifyDistribution(payload))
  const version = manifests[0]!.version
  if (manifests.some((manifest) => manifest.version !== version)) throw new Error("Payload versions do not match")
  const targets = manifests.map((manifest) => manifest.target)
  if (new Set(targets).size !== targets.length) throw new Error("Duplicate payload target")
  manifests.forEach((manifest) => manifest.files.forEach((file) => requireNpmPath(file.path)))
  const out = resolve(input.out)
  const native = await artifactNative()
  const pins: { directory: ArtifactDirectory; parent?: ArtifactDirectory; name?: string }[] = []
  const state = { scratch: "", stage: "", published: false }
  const pin = (parent: ArtifactDirectory, name: string, options = {}) => {
    const directory = native.directory(parent, name, options)
    pins.push({ directory, parent, name })
    return directory
  }
  const walk = (path: string, missing = false) => {
    const absolute = resolve(path)
    const root = parse(absolute).root
    const start = native.root(root)
    pins.push({ directory: start })
    const ancestors = [start]
    const parts = absolute.slice(root.length).split(sep).filter(Boolean)
    for (const [index, name] of parts.entries()) {
      try { ancestors.push(pin(ancestors.at(-1)!, name)) }
      catch (error) {
        if (missing && isMissing(error)) return { ancestors, missing: parts.slice(index) }
        throw error
      }
    }
    return { ancestors, missing: [] as string[] }
  }
  const validate = () => pins.forEach((entry) => {
    entry.directory.validateRoot?.()
    if (!entry.parent || !entry.name) return
    const current = native.directory(entry.parent, entry.name)
    try {
      if (current.identity !== entry.directory.identity) throw new Error("Npm directory identity changed")
    } finally { native.closeDirectory(current) }
  })
  try {
    const sources = input.payloads.map((payload) => walk(payload))
    const destination = walk(out, true)
    if (sources.some((source) => destination.ancestors.some((entry) => entry.identity === source.ancestors.at(-1)!.identity) ||
      (!destination.missing.length && source.ancestors.some((entry) => entry.identity === destination.ancestors.at(-1)!.identity))))
      throw new Error("Npm source/output overlap")
    // Only create missing parents after alias/overlap admission.
    const parent = destination.missing.length
      ? destination.missing.slice(0, -1).reduce((parent, name) => pin(parent, name, { create: true }), destination.ancestors.at(-1)!)
      : pins.find((entry) => entry.directory === destination.ancestors.at(-1)!)!.parent!
    if (!parent) throw new Error("Npm output requires a non-root destination")
    validate()
    state.scratch = await mkdtemp(join(dirname(out), ".npm-payloads-"))
    const expected: Tree = new Map()
    for (const [index, payload] of input.payloads.entries()) {
      const manifest = manifests[index]!
      const target = manifest.target
      const source = join(state.scratch, "dist", `cli-${target}`)
      const captured = await captureTree(resolve(payload))
      if (JSON.stringify(await verifyDistribution(payload, { version, target })) !== JSON.stringify(manifest) || manifest.files.some((file) => {
        const value = captured.get(file.path)
        return !value || createHash("sha256").update(value.bytes).digest("hex") !== file.sha256 || value.executable !== file.executable
      })) throw new Error("Npm source changed after verification")
      for (const [file, value] of captured) {
        if (!value || !file.startsWith("bin/")) continue
        const location = join(source, file)
        await mkdir(dirname(location), { recursive: true })
        await writeFile(location, value.bytes, { flag: "wx", mode: value.executable ? 0o755 : 0o644 })
      }
      const metadata = JSON.parse(captured.get("package.json")!.bytes.toString("utf8"))
      await writeFile(join(source, "package.json"), JSON.stringify({
        name: `@humanguardrail/cli-${target}`, version, license: "MIT", repository: repository(),
        os: metadata.os, cpu: metadata.cpu,
        files: [...manifest.files.map((file) => file.path), "distribution.json", "checksums.sha256"].sort(),
      }, null, 2))
      const prepared = join(state.scratch, `prepared-${target}`)
      await prepareDistribution({ dist: join(state.scratch, "dist"), out: prepared, version, target })
      await verifyDistribution(prepared)
      expected.set(`cli-${target}`, null)
      for (const [file, value] of await captureTree(prepared)) expected.set(`cli-${target}/${file}`, value)
    }
    const launcher = await captureTree(resolve(import.meta.dirname, "../bin"))
    expected.set("cli", null)
    expected.set("cli/bin", null)
    // This generated wrapper uses producer-host modes; NTFS has no Unix executable bit.
    // npm bin linking normalizes a CRLF shebang. Emit that canonical first line
    // before packing so installation preserves the generated wrapper bytes.
    expected.set("cli/bin/orchestra.cjs", {
      bytes: Buffer.from(launcher.get("orchestra.cjs")!.bytes.toString("utf8").replace(/^#!([^\r\n]*)\r\n/, "#!$1\n")),
      executable: process.platform !== "win32",
    })
    // The wrapper is the package people install and read, so it carries the repository licence and notice.
    for (const notice of ["LICENSE", "NOTICE"])
      expected.set(`cli/${notice}`, { bytes: Buffer.from(await Bun.file(resolve(import.meta.dirname, "../../..", notice)).bytes()), executable: false })
    expected.set("cli/package.json", { bytes: Buffer.from(JSON.stringify({
      name: "@humanguardrail/cli", version, type: "module", license: "MIT", repository: repository(),
      bin: { orchestra: "./bin/orchestra.cjs" }, files: ["bin/orchestra.cjs", "LICENSE", "NOTICE"], engines: { node: ">=22" },
      optionalDependencies: Object.fromEntries(targets.toSorted().map((target) => [`@humanguardrail/cli-${target}`, version])),
    }, null, 2)), executable: false })
    const requireSame = async () => {
      const existing = pin(parent, basename(out))
      const actual = await captureTree(out)
      if (actual.size !== expected.size || [...expected].some(([file, value]) => {
        const entry = actual.get(file)
        return value === null ? entry !== null : !entry || !entry.bytes.equals(value.bytes) || entry.executable !== value.executable
      })) throw new Error("Npm publication conflict")
      existing.validateRoot?.()
      validate()
    }
    if (!destination.missing.length) { await requireSame(); return { version, wrapper: join(out, "cli"), platforms: targets } }
    const name = `.cli-npm-${randomUUID()}`
    const stage = pin(parent, name, { create: true, exclusive: true, removable: true })
    state.stage = join(dirname(out), name)
    const retained = pins.length
    const directories = new Map([["", stage]])
    for (const [file, value] of expected) {
      const parts = file.split("/")
      const directory = directories.get(parts.slice(0, -1).join("/"))!
      if (value === null) {
        const child = pin(directory, parts.at(-1)!, { create: true, exclusive: true, removable: true })
        directories.set(file, child)
        continue
      }
      native.write(directory, parts.at(-1)!, value.bytes, value.executable)
    }
    const staged = await captureTree(state.stage)
    if (staged.size !== expected.size || [...expected].some(([file, value]) => {
      const actual = staged.get(file)
      return value === null ? actual !== null : !actual || !actual.bytes.equals(value.bytes) || actual.executable !== value.executable
    })) throw new Error("Npm staged copy mismatch")
    validate()
    // All writes and integrity checks are complete. Release only owned stage
    // descendants, retaining source/parent/root pins and the DELETE-capable stage.
    // Removing closed entries also keeps conflict/reuse validation on live pins.
    while (pins.length > retained) {
      native.closeDirectory(pins.at(-1)!.directory)
      pins.pop()
    }
    try { native.publish(parent, name, stage, basename(out)); state.published = true }
    catch (error) { if (!(await exists(out))) throw error; await requireSame() }
    return { version, wrapper: join(out, "cli"), platforms: targets }
  } finally {
    const errors: unknown[] = []
    pins.reverse().forEach((entry) => {
      try { native.closeDirectory(entry.directory) } catch (error) { errors.push(error) }
    })
    try { native.close() } catch (error) { errors.push(error) }
    try {
      if (errors.length) throw new AggregateError(errors, "Npm directory closure failed")
      // No closed handle is reused for cleanup; only this invocation's unpublished
      // stage path is removed, after every handle closes under the producer boundary.
      if (state.stage && !state.published) await rm(state.stage, { recursive: true, force: true })
    } finally {
      if (state.scratch) await rm(state.scratch, { recursive: true, force: true })
    }
  }
}

function requireNpmPath(path: string) {
  if (/[\[\]{}!()]/.test(path) || path.split("/").some((part) => part.startsWith(".") ||
    /^(node_modules|cvs|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|pnpm-lock\.yaml|config\.gypi|npm-debug\.log)$/i.test(part) ||
    /^(?:npm-debug\.log)(?:\.|$)/i.test(part) || /(?:\.lock|\.orig|\.rej|\.swp|~)$/i.test(part))) throw new Error(`Npm-special payload path: ${path}`)
}

async function captureTree(directory: string): Promise<Tree> {
  const files: Tree = new Map()
  const walk = async (relative: string) => {
    const location = join(directory, relative)
    const before = await lstat(location)
    if (!before.isDirectory()) throw new Error(`Not a real npm directory: ${location}`)
    const names = (await readdir(location)).sort()
    for (const name of names) {
      const file = relative ? `${relative}/${name}` : name
      const path = join(directory, file)
      const info = await lstat(path)
      if (info.isDirectory()) { files.set(file, null); await walk(file); continue }
      if (!info.isFile() || info.nlink !== 1 || !info.size) throw new Error(`Not a nonempty unlinked npm file: ${file}`)
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
      try {
        const pinned = await handle.stat()
        const bytes = await handle.readFile()
        if (!same(info, pinned) || !same(pinned, await handle.stat()) || !same(pinned, await lstat(path)) || bytes.length !== pinned.size)
          throw new Error(`Npm file changed during capture: ${file}`)
        files.set(file, { bytes, executable: Boolean(pinned.mode & 0o111) })
      } finally { await handle.close() }
    }
    if (!same(before, await lstat(location)) || names.join("\n") !== (await readdir(location)).sort().join("\n"))
      throw new Error(`Npm directory changed during capture: ${location}`)
  }
  await walk("")
  return files
}
function same(a: Awaited<ReturnType<typeof lstat>>, b: Awaited<ReturnType<typeof lstat>>) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.nlink === b.nlink && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs
}
function isMissing(error: unknown) { return error && typeof error === "object" && "code" in error && error.code === "ENOENT" }
async function exists(path: string) { return lstat(path).then(() => true, (error: unknown) => { if (isMissing(error)) return false; throw error }) }
function repository() { return { type: "git", url: "git+https://github.com/gustavomhss/hugr-orchestra.git" } }
