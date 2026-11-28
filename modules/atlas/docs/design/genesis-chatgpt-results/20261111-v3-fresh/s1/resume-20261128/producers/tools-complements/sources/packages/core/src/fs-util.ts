import { NodeFileSystem } from "@effect/platform-node"
import { dirname, isAbsolute, join, relative, resolve as pathResolve, sep } from "path"
import { realpathSync } from "fs"
import * as NFS from "fs/promises"
import { lookup } from "mime-types"
import { Context, Effect, FileSystem, Layer, Schema } from "effect"
import { systemError, type PlatformError } from "effect/PlatformError"
import { Glob } from "./util/glob"
import { PhysicalPath } from "./util/physical-path"
import { serviceUse } from "./effect/service-use"
import { makeGlobalNode } from "./effect/app-node"
import { filesystem } from "./effect/app-node-platform"

export namespace FSUtil {
  export class FileSystemError extends Schema.TaggedErrorClass<FileSystemError>()("FileSystemError", {
    method: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  }) {
    override get message() {
      const detail = this.cause instanceof Error ? this.cause.message : this.cause && String(this.cause)
      return `Filesystem operation failed: ${this.method}${detail ? `: ${detail}` : ""}`
    }
  }

  export type Error = PlatformError | FileSystemError

  export interface DirEntry {
    readonly name: string
    readonly type: "file" | "directory" | "symlink" | "other"
  }

  export interface Interface extends FileSystem.FileSystem {
    readonly isDir: (path: string) => Effect.Effect<boolean>
    readonly isFile: (path: string) => Effect.Effect<boolean>
    readonly existsSafe: (path: string) => Effect.Effect<boolean>
    readonly readFileStringSafe: (path: string) => Effect.Effect<string | undefined, Error>
    readonly readJson: (path: string) => Effect.Effect<unknown, Error>
    readonly writeJson: (path: string, data: unknown, mode?: number) => Effect.Effect<void, Error>
    readonly ensureDir: (path: string) => Effect.Effect<void, Error>
    /** Writes through a temp file in the same directory and renames it over `path`, so readers never see a partial file. */
    readonly writeAtomic: (path: string, content: string, mode?: number) => Effect.Effect<void, Error>
    readonly writeWithDirs: (path: string, content: string | Uint8Array, mode?: number) => Effect.Effect<void, Error>
    /** Write to a path already resolved to its real location, refusing any link found there at write time. */
    readonly writePhysical: (
      path: string,
      content: string | Uint8Array,
      options?: { exclusive?: boolean },
    ) => Effect.Effect<void, Error>
    readonly readDirectoryEntries: (path: string) => Effect.Effect<DirEntry[], Error>
    readonly resolve: (path: string) => Effect.Effect<string>
    readonly findUp: (target: string, start: string, stop?: string) => Effect.Effect<string[], Error>
    readonly up: (options: { targets: string[]; start: string; stop?: string }) => Effect.Effect<string[], Error>
    readonly globUp: (pattern: string, start: string, stop?: string) => Effect.Effect<string[], Error>
    readonly glob: (pattern: string, options?: Glob.Options) => Effect.Effect<string[], Error>
    readonly globMatch: (pattern: string, filepath: string) => boolean
  }

  export class Service extends Context.Service<Service, Interface>()("@orchestra/FileSystem") {}

  export const use = serviceUse(Service)

  const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem

      const existsSafe = Effect.fn("FileSystem.existsSafe")(function* (path: string) {
        return yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false))
      })

      const readFileStringSafe = Effect.fn("FileSystem.readFileStringSafe")(function* (path: string) {
        return yield* fs.readFileString(path).pipe(
          Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
          Effect.catchReason("PlatformError", "PermissionDenied", () => Effect.succeed(undefined)),
        )
      })

      const isDir = Effect.fn("FileSystem.isDir")(function* (path: string) {
        const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void))
        return info?.type === "Directory"
      })

      const isFile = Effect.fn("FileSystem.isFile")(function* (path: string) {
        const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void))
        return info?.type === "File"
      })

      const readDirectoryEntries = Effect.fn("FileSystem.readDirectoryEntries")(function* (dirPath: string) {
        return yield* Effect.tryPromise({
          try: async () => {
            const entries = await NFS.readdir(dirPath, { withFileTypes: true })
            return entries.map(
              (e): DirEntry => ({
                name: e.name,
                type: e.isDirectory() ? "directory" : e.isSymbolicLink() ? "symlink" : e.isFile() ? "file" : "other",
              }),
            )
          },
          catch: (cause) => new FileSystemError({ method: "readDirectoryEntries", cause }),
        })
      })

      const resolve = Effect.fn("FileSystem.resolve")(function* (path: string) {
        const resolved = pathResolve(windowsPath(path))
        return yield* fs.realPath(resolved).pipe(
          Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(resolved)),
          Effect.orDie,
        )
      })

      const readJson = Effect.fn("FileSystem.readJson")(function* (path: string) {
        const text = yield* fs.readFileString(path)
        return yield* Effect.try({
          try: () => JSON.parse(text),
          catch: (cause) => new FileSystemError({ method: "readJson", cause }),
        })
      })

      const writeAtomic = Effect.fn("FileSystem.writeAtomic")(function* (path: string, content: string, mode?: number) {
        // Write to the real file when the path is a symlink, so the link survives the rename.
        const target = yield* fs.realPath(path).pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(path)))
        const temp = `${target}.${process.pid}.${Date.now()}.tmp`
        yield* fs.writeFileString(temp, content).pipe(
          Effect.andThen(mode ? fs.chmod(temp, mode) : Effect.void),
          Effect.andThen(fs.rename(temp, target)),
          Effect.tapError(() => fs.remove(temp, { force: true }).pipe(Effect.ignore)),
        )
      })

      const writeJson = Effect.fn("FileSystem.writeJson")(function* (path: string, data: unknown, mode?: number) {
        yield* writeAtomic(path, JSON.stringify(data, null, 2), mode)
      })

      const ensureDir = Effect.fn("FileSystem.ensureDir")(function* (path: string) {
        yield* fs.makeDirectory(path, { recursive: true }).pipe(
          // Bun on Windows can throw EEXIST here despite recursive mode.
          // https://github.com/oven-sh/bun/issues/21901
          Effect.catchIf(
            (error) => error.reason._tag === "AlreadyExists",
            (error) => isDir(path).pipe(Effect.flatMap((exists) => (exists ? Effect.void : Effect.fail(error)))),
          ),
        )
      })

      const writeWithDirs = Effect.fn("FileSystem.writeWithDirs")(function* (
        path: string,
        content: string | Uint8Array,
        mode?: number,
      ) {
        const write = typeof content === "string" ? fs.writeFileString(path, content) : fs.writeFile(path, content)

        yield* write.pipe(
          Effect.catchIf(
            (e) => e.reason._tag === "NotFound",
            () =>
              Effect.gen(function* () {
                yield* fs.makeDirectory(dirname(path), { recursive: true })
                yield* write
              }),
          ),
        )
        if (mode) yield* fs.chmod(path, mode)
      })

      const writePhysical = Effect.fn("FileSystem.writePhysical")(function* (
        path: string,
        content: string | Uint8Array,
        options?: { exclusive?: boolean },
      ) {
        yield* Effect.tryPromise({
          try: () => PhysicalPath.writePhysical(path, content, options),
          catch: (cause) =>
            systemError({
              _tag: cause instanceof Error && "code" in cause && cause.code === "EEXIST" ? "AlreadyExists" : "Unknown",
              module: "FileSystem",
              method: "writePhysical",
              pathOrDescriptor: path,
              cause,
            }),
        })
      })

      const glob = Effect.fn("FileSystem.glob")(function* (pattern: string, options?: Glob.Options) {
        return yield* Effect.tryPromise({
          try: () => Glob.scan(pattern, options),
          catch: (cause) => new FileSystemError({ method: "glob", cause }),
        })
      })

      const findUp = Effect.fn("FileSystem.findUp")(function* (target: string, start: string, stop?: string) {
        const result: string[] = []
        let current = start
        while (true) {
          const search = join(current, target)
          if (yield* fs.exists(search)) result.push(search)
          if (stop === current) break
          const parent = dirname(current)
          if (parent === current) break
          current = parent
        }
        return result
      })

      const up = Effect.fn("FileSystem.up")(function* (options: { targets: string[]; start: string; stop?: string }) {
        const result: string[] = []
        let current = options.start
        while (true) {
          for (const target of options.targets) {
            const search = join(current, target)
            if (yield* fs.exists(search)) result.push(search)
          }
          if (options.stop === current) break
          const parent = dirname(current)
          if (parent === current) break
          current = parent
        }
        return result
      })

      const globUp = Effect.fn("FileSystem.globUp")(function* (pattern: string, start: string, stop?: string) {
        const result: string[] = []
        let current = start
        while (true) {
          const matches = yield* glob(pattern, { cwd: current, absolute: true, include: "file", dot: true }).pipe(
            Effect.catch(() => Effect.succeed([] as string[])),
          )
          result.push(...matches)
          if (stop === current) break
          const parent = dirname(current)
          if (parent === current) break
          current = parent
        }
        return result
      })

      return Service.of({
        ...fs,
        existsSafe,
        readFileStringSafe,
        isDir,
        isFile,
        readDirectoryEntries,
        resolve,
        readJson,
        writeJson,
        writeAtomic,
        ensureDir,
        writeWithDirs,
        writePhysical,
        findUp,
        up,
        globUp,
        glob,
        globMatch: Glob.match,
      })
    }),
  )

  export const node = makeGlobalNode({ service: Service, layer: layer, deps: [filesystem] })

  // Pure helpers that don't need Effect (path manipulation, sync operations)
  export function mimeType(p: string): string {
    return lookup(p) || "application/octet-stream"
  }

  export function normalizePath(p: string): string {
    if (process.platform !== "win32") return p
    const resolved = pathResolve(windowsPath(p))
    try {
      return realpathSync.native(resolved)
    } catch {
      return resolved
    }
  }

  export function normalizePathPattern(p: string): string {
    if (process.platform !== "win32") return p
    if (p === "*") return p
    const match = p.match(/^(.*)[\\/]\*$/)
    if (!match) return normalizePath(p)
    const dir = /^[A-Za-z]:$/.test(match[1]) ? match[1] + "\\" : match[1]
    return join(normalizePath(dir), "*")
  }

  export function resolve(p: string): string {
    const resolved = pathResolve(windowsPath(p))
    try {
      return normalizePath(realpathSync(resolved))
    } catch (e: any) {
      if (e?.code === "ENOENT") return normalizePath(resolved)
      throw e
    }
  }

  export function windowsPath(p: string): string {
    if (process.platform !== "win32") return p
    return p
      .replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/cygdrive\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/mnt\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
  }

  export function overlaps(a: string, b: string) {
    return contains(a, b) || contains(b, a)
  }

  export function contains(parent: string, child: string) {
    const result = relative(parent, child)
    return result === "" || (!isAbsolute(result) && result !== ".." && !result.startsWith(`..${sep}`))
  }
}
