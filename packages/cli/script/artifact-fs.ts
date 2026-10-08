import { createHash, randomUUID } from "node:crypto"
import { basename, dirname, parse, resolve, sep } from "node:path"
import type { ArtifactDirectory, ArtifactNative } from "./artifact-native"
import { namedTargets } from "./targets"

export type ArtifactManifest = {
  schema: 1
  version: string
  artifacts: { target: string; file: string; sha256: string }[]
}

export async function artifactNative(): Promise<ArtifactNative> {
  if (!["x64", "arm64"].includes(process.arch)) throw new Error(`Unsupported artifact host CPU: ${process.arch}`)
  if (process.platform === "linux") {
    const { artifactLinux } = await import("./artifact-linux")
    return artifactLinux()
  }
  if (process.platform === "darwin") {
    const { artifactDarwin } = await import("./artifact-darwin")
    return artifactDarwin()
  }
  if (process.platform === "win32") {
    const { artifactWindows } = await import("./artifact-windows")
    return artifactWindows()
  }
  throw new Error(`Unsupported artifact host OS: ${process.platform}`)
}

// Scoped to owned builder outputs. Handles defeat path-component redirection;
// this is not a sandbox against hostile mounts or arbitrary in-place mutation.
export async function admitArtifacts(input: { dist: string; out: string; targets: string[] }) {
  if ([input.dist, input.out].some((path) => !path || path.includes("\0") || path.split(/[\\/]/).includes("..")))
    throw new Error("Ambiguous artifact path traversal")
  if (
    !input.targets.length ||
    new Set(input.targets).size !== input.targets.length ||
    input.targets.some((target) => !namedTargets.some((item) => item.target === target))
  )
    throw new Error("Unsupported or duplicate artifact target")
  const native = await artifactNative()
  const pins: { directory: ArtifactDirectory; parent?: ArtifactDirectory; name?: string }[] = []
  const files: { parent: ArtifactDirectory; name: string; identity: string }[] = []
  const captured = new Map<string, { bytes: Buffer; metadata: Buffer }>()
  const pin = (parent: ArtifactDirectory, name: string, options = {}) => {
    const directory = native.directory(parent, name, options)
    pins.push({ directory, parent, name })
    return directory
  }
  const root = (path: string) => {
    const directory = native.root(path)
    pins.push({ directory })
    return directory
  }
  const walk = (path: string, missing = false) => {
    const absolute = resolve(path)
    const start = parse(absolute).root
    const ancestors = [root(start)]
    const parts = absolute.slice(start.length).split(sep).filter(Boolean)
    for (const [index, name] of parts.entries()) {
      const next = optionalDirectory(ancestors[ancestors.length - 1], name)
      if (!next) {
        if (!missing) throw new Error(`Artifact directory missing: ${absolute}`)
        return { directory: ancestors[ancestors.length - 1], ancestors, missing: parts.slice(index) }
      }
      ancestors.push(next)
    }
    return { directory: ancestors[ancestors.length - 1], ancestors, missing: [] as string[] }
  }
  const optionalDirectory = (parent: ArtifactDirectory, name: string) => {
    try {
      return pin(parent, name)
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }
  const validate = () => {
    pins.forEach((entry) => {
      if (!entry.parent || !entry.name) return
      const current = native.directory(entry.parent, entry.name)
      try {
        if (current.identity !== entry.directory.identity) throw new Error("Artifact directory identity changed")
      } finally {
        native.closeDirectory(current)
      }
    })
    files.forEach((entry) => {
      if (native.fileIdentity(entry.parent, entry.name) !== entry.identity)
        throw new Error("Artifact source file identity changed")
    })
  }
  const cleanup = () => {
    // Reverse acquisition order; every FD/HANDLE belongs to this admission.
    pins
      .slice()
      .reverse()
      .forEach((entry) => native.closeDirectory(entry.directory))
    pins.length = 0
    native.close()
  }
  return Promise.resolve()
    .then(() => {
      const source = walk(input.dist)
      const destination = walk(dirname(resolve(input.out)), true)
      const output = basename(resolve(input.out))
      const existing = destination.missing.length
        ? undefined
        : (() => {
            try {
              return optionalDirectory(destination.directory, output)
            } catch (cause) {
              throw new Error(`Artifact publication conflict: ${input.out}`, { cause })
            }
          })()
      // Compare actual filesystem identities, including a case alias's deepest
      // existing parent. Do this before even creating an output ancestor.
      if (
        destination.ancestors.some((entry) => entry.identity === source.directory.identity) ||
        (existing && source.ancestors.some((entry) => entry.identity === existing.identity))
      )
        throw new Error("Artifact source/output overlap")
      const sources = input.targets.map((target) => {
        const directory = pin(source.directory, `cli-${target}`)
        return { target, directory, bin: pin(directory, "bin") }
      })
      const locateParent = (create = false) =>
        destination.missing.reduce<ArtifactDirectory | undefined>((parent, name) => {
          if (!parent) return undefined
          if (!create) return optionalDirectory(parent, name)
          validate()
          return pin(parent, name, { create: true })
        }, destination.directory)
      const verify = (parent: ArtifactDirectory, manifest: ArtifactManifest) => {
        const directory = (() => {
          try {
            return optionalDirectory(parent, output)
          } catch (cause) {
            throw new Error(`Artifact publication conflict: ${input.out}`, { cause })
          }
        })()
        if (!directory) return false
        try {
          const value: unknown = JSON.parse(native.read(directory, "manifest.json").bytes.toString("utf8"))
          if (
            !value ||
            typeof value !== "object" ||
            Object.keys(value).length !== 3 ||
            !("schema" in value) ||
            value.schema !== 1 ||
            !("version" in value) ||
            value.version !== manifest.version ||
            !("artifacts" in value) ||
            !Array.isArray(value.artifacts) ||
            value.artifacts.length !== manifest.artifacts.length
          )
            throw new Error("Publication descriptor mismatch")
          const targets = new Set<string>()
          value.artifacts.forEach((entry: unknown) => {
            if (
              !entry ||
              typeof entry !== "object" ||
              Object.keys(entry).length !== 3 ||
              !("target" in entry) ||
              !("file" in entry) ||
              !("sha256" in entry)
            )
              throw new Error("Invalid publication artifact")
            const expected = manifest.artifacts.find((item) => item.target === entry.target)
            if (
              !expected ||
              targets.has(expected.target) ||
              entry.file !== expected.file ||
              entry.sha256 !== expected.sha256
            )
              throw new Error("Publication artifact mismatch")
            targets.add(expected.target)
            if (hash(native.read(directory, expected.file).bytes) !== expected.sha256)
              throw new Error("Publication artifact digest mismatch")
          })
          const members = native.list(directory)
          if (
            members.length !== manifest.artifacts.length + 1 ||
            members.some((file) => file !== "manifest.json" && !manifest.artifacts.some((entry) => entry.file === file))
          )
            throw new Error("Publication contains unowned files")
          validate()
          return true
        } catch (cause) {
          throw new Error(`Artifact publication conflict: ${input.out}`, { cause })
        }
      }
      return {
        capture: () => {
          validate()
          return sources.map((source) => {
            const metadata = native.read(source.directory, "package.json")
            const name = `orchestra${source.target.startsWith("windows-") ? ".exe" : ""}`
            const binary = native.read(source.bin, name)
            files.push(
              { parent: source.directory, name: "package.json", identity: metadata.identity },
              { parent: source.bin, name, identity: binary.identity },
            )
            captured.set(source.target, { bytes: binary.bytes, metadata: metadata.bytes })
            validate()
            return { target: source.target, metadata: metadata.bytes, bytes: binary.bytes }
          })
        },
        publish: (manifest: ArtifactManifest) => {
          if (
            manifest.schema !== 1 ||
            manifest.artifacts.length !== sources.length ||
            new Set(manifest.artifacts.map((entry) => entry.target)).size !== sources.length
          )
            throw new Error("Invalid artifact publication descriptor")
          manifest.artifacts.forEach((entry) => {
            const bytes = captured.get(entry.target)?.bytes
            if (
              !bytes ||
              entry.file !== `orchestra-${entry.target}${entry.target.startsWith("windows-") ? ".exe" : ""}` ||
              hash(bytes) !== entry.sha256
            )
              throw new Error("Artifact captured descriptor mismatch")
          })
          validate()
          const current = locateParent()
          if (current && verify(current, manifest)) return manifest
          const parent = locateParent(true)!
          validate()
          const name = `.cli-export-${randomUUID()}`
          const stage = pin(parent, name, { create: true, exclusive: true, removable: true })
          const written: string[] = []
          const state = { published: false }
          try {
            manifest.artifacts.forEach((entry) => {
              validate()
              native.write(stage, entry.file, captured.get(entry.target)!.bytes, !entry.target.startsWith("windows-"))
              written.push(entry.file)
              if (hash(native.read(stage, entry.file).bytes) !== entry.sha256)
                throw new Error("Copied artifact digest mismatch")
            })
            native.write(stage, "manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"), false)
            written.push("manifest.json")
            validate()
            try {
              native.publish(parent, name, stage, output)
              state.published = true
            } catch (error) {
              if (!verify(parent, manifest)) throw error
            }
            return manifest
          } finally {
            // The published handle now names output, so never remove its members.
            if (!state.published) {
              written.forEach((file) => native.removeFile(stage, file))
              native.removeDirectory(parent, name, stage)
            }
          }
        },
        cleanup,
      }
    })
    .catch((error) => {
      cleanup()
      throw error
    })
}

function isMissing(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "ENOENT"
}

function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex")
}
