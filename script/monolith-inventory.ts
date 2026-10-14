// Captures declarations and pins. Cargo resolution, import reachability and runtime qualification are separate checks.
import path from "node:path"
import { readdir, realpath } from "node:fs/promises"

const producerHash = hash(await Bun.file(import.meta.filename).bytes())

export async function monolithInventory(directory: string, revision?: string) {
  const source = await captureSource(directory, revision)
  const read = async (file: string, format: "json" | "toml" = "json") => {
    const captured = await source.read(file)
    const value: unknown = await Promise.resolve().then(() => {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(captured.bytes)
      return format === "json" ? JSON.parse(text) : Bun.TOML.parse(text)
    }).catch((cause: unknown) => { throw new Error(`BASELINE_INVALID_MANIFEST:${file}`, { cause }) })
    return { value: record(value, file), sha256: captured.sha256 }
  }
  const workspace = await read("package.json")
  const atlas = await read("foundation/atlas/package.json")
  const cargo = await read("packages/omni/Cargo.toml", "toml")
  const qa = await read("packages/omni/qa/Cargo.toml", "toml")
  const domains = [
    { kind: "bun" as const, scope: ".", patterns: list(Array.isArray(workspace.value.workspaces) ? workspace.value.workspaces : record(workspace.value.workspaces, "package.json workspaces").packages, "Bun workspaces") },
    { kind: "npm" as const, scope: "foundation/atlas", patterns: list(atlas.value.workspaces, "Atlas workspaces") },
    { kind: "cargo" as const, scope: "packages/omni", patterns: list(record(cargo.value.workspace, "Cargo workspace").members, "Cargo members") },
  ]
  const modules = (await Promise.all(domains.map(async (domain) => {
    const manifest = domain.kind === "cargo" ? "Cargo.toml" : "package.json"
    const files = [...new Set((await Promise.all(domain.patterns.map(async (pattern) => {
      relative(pattern)
      const matches = await source.scan(domain.scope, `${pattern}/${manifest}`)
      if (!matches.length) throw new Error(`BASELINE_EMPTY_PATTERN:${domain.scope}:${pattern}`)
      return matches.map((file) => path.posix.join(domain.scope, file))
    }))).flat())].sort()
    return Promise.all(files.map(async (file) => moduleRecord(domain.kind, domain.scope, file, await read(file, domain.kind === "cargo" ? "toml" : "json"))))
  }))).flat()
  modules.push(moduleRecord("cargo", "packages/omni/qa", "packages/omni/qa/Cargo.toml", qa))
  const identities = modules.map((module) => `${module.kind}:${module.scope}:${module.name}`)
  const duplicate = identities.find((identity, index) => identities.indexOf(identity) !== index)
  if (duplicate) throw new Error(`BASELINE_DUPLICATE_IDENTITY:${duplicate}`)
  if (!modules.length) throw new Error("BASELINE_EMPTY_MODULES")
  cargoDependencies(record(cargo.value.workspace, "Cargo workspace"), "packages/omni/Cargo.toml workspace")

  const assets = await Promise.all((await source.directories("packages"))
    .filter((name) => !modules.some((module) => module.path === `packages/${name}` || module.path.startsWith(`packages/${name}/`)))
    .map(async (name) => {
      const directory = `packages/${name}`
      const files = await source.scan(directory, "**/*")
      if (!files.length) throw new Error(`BASELINE_EMPTY_ASSET_MODULE:${directory}`)
      return { path: directory, files: await Promise.all(files.map((file) => fingerprintInput(source, `${directory}/${file}`))) }
    }))
  const patches = Object.values(record(workspace.value.patchedDependencies === undefined ? {} : workspace.value.patchedDependencies, "patchedDependencies"))
  if (!patches.every((value): value is string => typeof value === "string")) throw new Error("BASELINE_INVALID_PATCH_PATH")
  const roots = [moduleRecord("bun", ".", "package.json", workspace), moduleRecord("npm", "foundation/atlas", "foundation/atlas/package.json", atlas)]
  const vendors = [...roots, ...modules].filter((module) => module.kind !== "cargo").flatMap((module) => Object.values(module.dependencies).flatMap((dependencies) =>
    Object.values(dependencies).filter((value): value is string => typeof value === "string" && value.startsWith("file:")).map((value) => {
      const referenced = value.slice(5).replaceAll("\\", "/")
      if (path.posix.isAbsolute(referenced) || path.win32.isAbsolute(referenced)) throw new Error(`BASELINE_INVALID_PATH:${value}`)
      const file = path.posix.normalize(path.posix.join(module.path, referenced))
      relative(file)
      return file
    }),
  ))
  const inputs = await Promise.all([...new Set([
    "package.json", "bun.lock", "foundation/atlas/package.json", "foundation/atlas/package-lock.json",
    "packages/omni/Cargo.toml", "packages/omni/Cargo.lock", "packages/omni/qa/Cargo.toml", "packages/omni/qa/Cargo.lock",
    ...patches, ...vendors,
  ])].sort().map((file) => fingerprintInput(source, file)))
  const captured = {
    format: 1, scope: "declared-manifests-assets-and-pins", source: source.identity,
    qualification: "syntax-and-declaration-shape-only",
    producerHash,
    modules: modules.sort((left, right) => left.manifest < right.manifest ? -1 : left.manifest > right.manifest ? 1 : 0),
    assets: assets.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0), inputs,
  }
  await source.verify()
  return { ...captured, fingerprint: hash(JSON.stringify(captured)) }
}

function moduleRecord(kind: "bun" | "npm" | "cargo", scope: string, file: string, input: { value: Record<string, unknown>; sha256: string }) {
  const manifest = kind === "cargo" ? record(input.value.package, file) : input.value
  if (typeof manifest.name !== "string" || !manifest.name.trim()) throw new Error(`BASELINE_MISSING_NAME:${file}`)
  const dependencies = kind === "cargo" ? cargoDependencies(input.value, file) : Object.fromEntries(
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].map((field) => {
      const declared = manifest[field]
      const values = record(declared === undefined ? {} : declared, `${file} ${field}`)
      if (!Object.values(values).every((value) => typeof value === "string")) throw new Error(`BASELINE_INVALID_DEPENDENCIES:${file}:${field}`)
      return [field, values] as const
    }),
  )
  return {
    kind, scope, name: manifest.name, path: path.posix.dirname(file), manifest: file, manifestHash: input.sha256,
    version: manifest.version ?? null, type: manifest.type ?? null, main: manifest.main ?? null, types: manifest.types ?? null,
    exports: manifest.exports ?? null, imports: manifest.imports ?? null,
    bin: (kind === "cargo" ? input.value.bin : manifest.bin) ?? null, lib: kind === "cargo" ? input.value.lib ?? null : null,
    scripts: manifest.scripts ?? null, dependencies,
  }
}

function cargoDependencies(value: Record<string, unknown>, file: string): Record<string, Record<string, unknown>> {
  const dependencies = Object.fromEntries(["dependencies", "dev-dependencies", "build-dependencies"].map((field) => {
    const entries = record(value[field] === undefined ? {} : value[field], `${file} ${field}`)
    Object.entries(entries).forEach(([name, declaration]) => {
      if (typeof declaration === "string") return
      const entry = record(declaration, `${file} ${field} ${name}`)
      Object.entries(entry).forEach(([key, item]) => {
        const valid = ["version", "path", "git", "branch", "tag", "rev", "registry", "registry-index", "package", "target"].includes(key)
          ? typeof item === "string"
          : ["workspace", "optional", "default-features", "default_features", "public", "lib"].includes(key)
            ? typeof item === "boolean"
            : key === "features" ? Array.isArray(item) && item.every((feature) => typeof feature === "string")
              : key === "artifact" ? typeof item === "string" || Array.isArray(item) && item.every((artifact) => typeof artifact === "string")
                : true // Preserve unknown declaration fields; Cargo, not this collector, decides their semantics.
        if (!valid) throw new Error(`BASELINE_INVALID_CARGO_DEPENDENCY:${file}:${field}:${name}:${key}`)
      })
    })
    return [field, entries] as const
  }))
  if (value.target === undefined) return dependencies
  const targets = record(value.target, `${file} target`)
  Object.entries(targets).forEach(([target, declaration]) => cargoDependencies(record(declaration, `${file} target ${target}`), `${file} target ${target}`))
  return { ...dependencies, target: targets }
}

async function captureSource(directory: string, revision?: string) {
  const root = await realpath(directory)
  const identity = revision === undefined ? { mode: "working-tree" as const } : (() => {
    const commit = git(root, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`]).toString().trim()
    const tree = git(root, ["rev-parse", `${commit}^{tree}`]).toString().trim()
    return { mode: "git" as const, revision: commit, tree }
  })()
  const entries = identity.mode === "git" ? new Map(git(root, ["ls-tree", "-r", "-z", identity.revision]).toString().split("\0").filter(Boolean).map((entry) => {
    const split = entry.indexOf("\t")
    const fields = entry.slice(0, split).split(" ")
    return [entry.slice(split + 1), { mode: fields[0], sha: fields[2] }] as const
  })) : undefined
  const cache = new Map<string, Promise<{ path: string; sha256: string; bytes: Uint8Array }>>()
  const scans = new Map<string, string[]>()
  const directories = new Map<string, string[]>()
  const read = (file: string) => {
    relative(file)
    const pending = cache.get(file)
    if (pending) return pending
    const captured = Promise.resolve().then(async () => {
      const entry = entries?.get(file)
      if (entries && !entry) throw new Error(`BASELINE_MISSING_INPUT:${file}`)
      if (entry?.mode === "120000") throw new Error(`BASELINE_SYMLINK_INPUT:${file}`)
      const bytes = entry ? git(root, ["cat-file", "blob", entry.sha]) : await input(root, file)
      if (!bytes.length) throw new Error(`BASELINE_EMPTY_INPUT:${file}`)
      return { path: file, sha256: hash(bytes), bytes }
    })
    cache.set(file, captured)
    return captured
  }
  const scan = async (directory: string, pattern: string) => {
    relative(directory)
    relative(pattern)
    const prefix = directory === "." ? "" : `${directory}/`
    const matcher = new Bun.Glob(pattern)
    const files = entries ? [...entries.keys()].filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length)).filter((file) => matcher.match(file))
      : await Array.fromAsync(matcher.scan({ cwd: path.join(root, directory), onlyFiles: true, followSymlinks: false, dot: true }))
    return files.map((file) => file.replaceAll("\\", "/")).sort()
  }
  const listDirectories = async (directory: string) => entries
    ? [...new Set([...entries.keys()].filter((file) => file.startsWith(`${directory}/`)).map((file) => file.slice(directory.length + 1)).filter((file) => file.includes("/")).map((file) => file.split("/")[0]))].sort()
    : (await readdir(path.join(root, directory), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  return {
    identity, read,
    scan: async (directory: string, pattern: string) => {
      const files = await scan(directory, pattern)
      scans.set(JSON.stringify([directory, pattern]), files)
      return files
    },
    directories: async (directory: string) => {
      const names = await listDirectories(directory)
      directories.set(directory, names)
      return names
    },
    verify: async () => {
      if (entries) return
      await Promise.all([...cache].map(async ([file, captured]) => {
        if (hash(await input(root, file)) !== (await captured).sha256) throw new Error(`BASELINE_INPUT_DRIFT:${file}`)
      }))
      await Promise.all([...scans].map(async ([key, files]) => {
        const [directory, pattern] = JSON.parse(key) as [string, string]
        if (JSON.stringify(await scan(directory, pattern)) !== JSON.stringify(files)) throw new Error(`BASELINE_DISCOVERY_DRIFT:${key}`)
      }))
      await Promise.all([...directories].map(async ([directory, names]) => {
        if (JSON.stringify(await listDirectories(directory)) !== JSON.stringify(names)) throw new Error(`BASELINE_DIRECTORY_DRIFT:${directory}`)
      }))
    },
  }
}

async function input(root: string, file: string) {
  relative(file)
  const source = await realpath(path.join(root, file)).catch((cause: unknown) => { throw new Error(`BASELINE_MISSING_INPUT:${file}`, { cause }) })
  if (!source.startsWith(root + path.sep)) throw new Error(`BASELINE_EXTERNAL_INPUT:${file}`)
  return Bun.file(source).bytes().catch((cause: unknown) => { throw new Error(`BASELINE_UNREADABLE_INPUT:${file}`, { cause }) })
}

async function fingerprintInput(source: Awaited<ReturnType<typeof captureSource>>, file: string) {
  const captured = await source.read(file)
  return { path: captured.path, sha256: captured.sha256 }
}

function record(value: unknown, source: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`BASELINE_INVALID_RECORD:${source}`)
  return value as Record<string, unknown>
}

function list(value: unknown, source: string) {
  if (!Array.isArray(value) || !value.length || !value.every((entry): entry is string => typeof entry === "string" && !!entry.trim())) throw new Error(`BASELINE_INVALID_LIST:${source}`)
  return value
}

function relative(file: string) {
  if (!file || path.isAbsolute(file) || path.win32.isAbsolute(file) || file.replaceAll("\\", "/").split("/").some((part) => part === "..")) throw new Error(`BASELINE_INVALID_PATH:${file}`)
}

function hash(value: string | Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function git(root: string, args: string[]) {
  const result = Bun.spawnSync(["git", "--no-replace-objects", ...args], { cwd: root })
  if (result.exitCode !== 0) throw new Error(`BASELINE_GIT_COMMAND:${args[0]}:${result.stderr.toString().trim()}`)
  return result.stdout
}

if (import.meta.main) {
  const directory = path.resolve(process.argv[2] ?? path.join(import.meta.dir, ".."))
  const inventory = await monolithInventory(directory, process.argv[3] ?? "HEAD")
  console.log(JSON.stringify({ runtime: { bun: process.versions.bun, platform: process.platform, arch: process.arch }, inventory }, null, 2))
}
