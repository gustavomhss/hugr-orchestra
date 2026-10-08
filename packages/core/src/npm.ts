export * as Npm from "./npm"

import path from "path"
import npa from "npm-package-arg"
import { Effect, Schema, Context, Layer, Option, FileSystem } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { EffectFlock } from "./util/effect-flock"
import { Flock } from "./util/flock"
import { makeGlobalNode } from "./effect/app-node"
import { filesystem } from "./effect/app-node-platform"
import { LayerNode } from "./effect/layer-node"
import { makeRuntime } from "./effect/runtime"
import { NpmConfig } from "./npm-config"
import { PluginSdkPackage } from "./plugin/sdk-package"

export class InstallFailedError extends Schema.TaggedErrorClass<InstallFailedError>()("NpmInstallFailedError", {
  add: Schema.Array(Schema.String).pipe(Schema.optional),
  dir: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export interface EntryPoint {
  readonly directory: string
  readonly entrypoint?: string
}

export interface Interface {
  readonly add: (pkg: string) => Effect.Effect<EntryPoint, InstallFailedError | PluginSdkPackage.VersionError | PluginSdkPackage.SetupError | EffectFlock.LockError>
  readonly install: (
    dir: string,
    input?: {
      add: {
        name: string
        version?: string
      }[]
    },
  ) => Effect.Effect<void, EffectFlock.LockError | InstallFailedError | PluginSdkPackage.VersionError | PluginSdkPackage.SetupError>
  readonly which: (pkg: string, bin?: string) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/Npm") {}

const illegal = process.platform === "win32" ? new Set(["<", ">", ":", '"', "|", "?", "*"]) : undefined

export function sanitize(pkg: string) {
  if (!illegal) return pkg
  return Array.from(pkg, (char) => (illegal.has(char) || char.charCodeAt(0) < 32 ? "_" : char)).join("")
}

const resolveEntryPoint = (name: string, dir: string): EntryPoint => {
  let entrypoint: string | undefined
  try {
    entrypoint = typeof Bun !== "undefined" ? import.meta.resolve(name, dir) : import.meta.resolve(dir)
  } catch {
    entrypoint = undefined
  }
  return {
    directory: dir,
    entrypoint,
  }
}

interface ArboristNode {
  name: string
  path: string
}

interface ArboristTree {
  edgesOut: Map<string, { to?: ArboristNode }>
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const afs = yield* FSUtil.Service
    const global = yield* Global.Service
    const fs = yield* FileSystem.FileSystem
    const directory = (pkg: string) => path.join(global.cache, "packages", sanitize(pkg))
    const validate = (dir: string, add: string[]) => Effect.try({
      try: () => add.forEach((specifier) => PluginSdkPackage.requestSpec(specifier)),
      catch: (cause) => PluginSdkPackage.versionFailure(cause) ?? new InstallFailedError({ cause, add, dir }),
    })
    const reify = (input: { dir: string; add?: string[]; inspect?: boolean }) =>
      Effect.gen(function* () {
        const add = input.add ?? []
        yield* validate(input.dir, add)
        yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: async (signal) => {
              const lease = await Flock.acquire(`npm-install:${input.dir}`, { dir: path.join(global.state, "locks"), signal })
              // An abort racing the final mkdir must not orphan a late lease.
              if (!signal.aborted) return lease
              await lease.release()
              throw signal.reason
            },
            catch: (cause) => new InstallFailedError({ cause, add, dir: input.dir }),
          }).pipe(Effect.interruptible),
          (lease) => Effect.promise(() => lease.release()),
        )
        // Arborist/bridge filesystem promises do not cancel on Effect interruption.
        // Keep their lock and listener alive until they settle; only this acquired
        // critical section is masked, not the caller's outer installation effect.
        return yield* Effect.gen(function* () {
          const { Arborist } = yield* Effect.promise(() => import("@npmcli/arborist"))
          const { PluginSdkRegistry } = yield* Effect.promise(() => import("./plugin/sdk-registry"))
          const { PluginSdkReconcile } = yield* Effect.promise(() => import("./plugin/sdk-reconcile"))
          const sdk = yield* Effect.acquireRelease(Effect.promise(() => PluginSdkRegistry.open()), (sdk) => Effect.promise(() => sdk.close()))
          const npmOptions = yield* NpmConfig.load(input.dir)
          yield* fs.makeDirectory(input.dir, { recursive: true }).pipe(
            Effect.mapError((cause) => new InstallFailedError({ cause, add, dir: input.dir })),
          )
          const options = {
            ...npmOptions,
            path: input.dir,
            binLinks: true,
            progress: false,
            savePrefix: "",
            ignoreScripts: true,
          }
          // The installed runtime accepts its checked LRU SPI; published pacote
          // declarations incorrectly restrict this constructor option to Map.
          Object.assign(options, { packumentCache: sdk.packumentCache })
          const arborist = new Arborist(options)
          return yield* Effect.tryPromise({
            try: async () => {
              const actual = await arborist.loadActual()
              const virtual = await arborist.loadVirtual().catch((error: unknown) => {
                if (error && typeof error === "object" && "code" in error && error.code === "ENOLOCK") return
                throw error
              })
              if (virtual) await PluginSdkReconcile.reconcile(virtual, input.dir, sdk.dist, global.cache)
              await PluginSdkReconcile.reconcile(actual, input.dir, sdk.dist, global.cache)
              if (input.inspect) return actual
              const options = {
                ...npmOptions,
                add,
                save: true,
                saveType: "prod" as const,
                packumentCache: sdk.packumentCache,
              }
              const tree = await arborist.reify(options)
              await PluginSdkReconcile.reconcile(tree, input.dir, sdk.dist, global.cache)
              return tree
            },
            catch: (cause) =>
              PluginSdkPackage.versionFailure(cause) ??
              new InstallFailedError({
                cause,
                add,
                dir: input.dir,
              }),
          }) as Effect.Effect<ArboristTree, InstallFailedError | PluginSdkPackage.VersionError | PluginSdkPackage.SetupError>
        }).pipe(Effect.uninterruptible)
      }).pipe(
        Effect.scoped,
        Effect.withSpan("Npm.reify", {
          attributes: input,
        }),
      )

    const add = Effect.fn("Npm.add")(function* (pkg: string) {
      const dir = directory(pkg)
      const name = (() => {
        try {
          return npa(pkg).name ?? pkg
        } catch {
          return pkg
        }
      })()

      if (yield* afs.existsSafe(path.join(dir, "node_modules", name))) {
        yield* reify({ dir, add: [pkg], inspect: true })
        return resolveEntryPoint(name, path.join(dir, "node_modules", name))
      }

      const tree = yield* reify({ dir, add: [pkg] })
      const first = tree.edgesOut.values().next().value?.to
      if (!first) {
        const result = resolveEntryPoint(name, path.join(dir, "node_modules", name))
        if (result.entrypoint) return result
        return yield* new InstallFailedError({ add: [pkg], dir })
      }
      return resolveEntryPoint(first.name, first.path)
    }, Effect.scoped)

    const install: Interface["install"] = Effect.fn("Npm.install")(function* (dir, input) {
      const add = input?.add.map((pkg) => [pkg.name, pkg.version].filter(Boolean).join("@")) ?? []
      yield* validate(dir, add)
      const canWrite = yield* afs.access(dir, { writable: true }).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      )
      if (!canWrite) return

      if (yield* afs.existsSafe(path.join(dir, "node_modules"))) yield* reify({ dir, add, inspect: true })
      if (
        yield* Effect.gen(function* () {
          const nodeModulesExists = yield* afs.existsSafe(path.join(dir, "node_modules"))
          if (!nodeModulesExists) {
            yield* reify({ add, dir })
            return true
          }
          return false
        }).pipe(Effect.withSpan("Npm.checkNodeModules"))
      )
        return

      yield* Effect.gen(function* () {
        const pkg = yield* afs.readJson(path.join(dir, "package.json")).pipe(Effect.orElseSucceed(() => ({})))
        const lock = yield* afs.readJson(path.join(dir, "package-lock.json")).pipe(Effect.orElseSucceed(() => ({})))

        const pkgAny = pkg as any
        const lockAny = lock as any
        const declared = new Set([
          ...Object.keys(pkgAny?.dependencies || {}),
          ...Object.keys(pkgAny?.devDependencies || {}),
          ...Object.keys(pkgAny?.peerDependencies || {}),
          ...Object.keys(pkgAny?.optionalDependencies || {}),
          ...(input?.add || []).map((pkg) => pkg.name),
        ])

        const root = lockAny?.packages?.[""] || {}
        const locked = new Set([
          ...Object.keys(root?.dependencies || {}),
          ...Object.keys(root?.devDependencies || {}),
          ...Object.keys(root?.peerDependencies || {}),
          ...Object.keys(root?.optionalDependencies || {}),
        ])

        if (add.some((specifier) => {
          if (!PluginSdkPackage.requestSpec(specifier)) return false
          const parsed = npa(specifier)
          return root?.dependencies?.[parsed.name ?? PluginSdkPackage.manifest.name] !== parsed.rawSpec
        })) {
          yield* reify({ dir, add })
          return
        }

        for (const name of declared) {
          if (!locked.has(name)) {
            yield* reify({ dir, add })
            return
          }
        }
      }).pipe(Effect.withSpan("Npm.checkDirty"))

      return
    }, Effect.scoped)

    const which = Effect.fn("Npm.which")(function* (pkg: string, bin?: string) {
      const dir = directory(pkg)
      const binDir = path.join(dir, "node_modules", ".bin")

      const pick = Effect.fnUntraced(function* () {
        const files = yield* fs.readDirectory(binDir).pipe(Effect.catch(() => Effect.succeed([] as string[])))

        if (files.length === 0) return Option.none<string>()
        // Caller picked a specific bin (e.g. pyright exposes both `pyright` and
        // `pyright-langserver`); trust the hint if the package provides it.
        if (bin) return files.includes(bin) ? Option.some(bin) : Option.none<string>()
        if (files.length === 1) return Option.some(files[0])

        const pkgJson = yield* afs.readJson(path.join(dir, "node_modules", pkg, "package.json")).pipe(Effect.option)

        if (Option.isSome(pkgJson)) {
          const parsed = pkgJson.value as { bin?: string | Record<string, string> }
          if (parsed?.bin) {
            const unscoped = pkg.startsWith("@") ? pkg.split("/")[1] : pkg
            const parsedBin = parsed.bin
            if (typeof parsedBin === "string") return Option.some(unscoped)
            const keys = Object.keys(parsedBin)
            if (keys.length === 1) return Option.some(keys[0])
            return parsedBin[unscoped] ? Option.some(unscoped) : Option.some(keys[0])
          }
        }

        return Option.some(files[0])
      })

      return Option.getOrUndefined(
        yield* Effect.gen(function* () {
          const bin = yield* pick()
          if (Option.isSome(bin)) {
            return Option.some(path.join(binDir, bin.value))
          }

          yield* fs.remove(path.join(dir, "package-lock.json")).pipe(Effect.orElseSucceed(() => {}))

          yield* add(pkg)

          const resolved = yield* pick()
          if (Option.isNone(resolved)) return Option.none<string>()
          return Option.some(path.join(binDir, resolved.value))
        }).pipe(
          Effect.scoped,
          Effect.orElseSucceed(() => Option.none<string>()),
        ),
      )
    })

    return Service.of({
      add,
      install,
      which,
    })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer: layer,
  deps: [FSUtil.node, Global.node, filesystem, EffectFlock.node],
})

const { runPromise } = makeRuntime(Service, LayerNode.compile(node))

export async function install(...args: Parameters<Interface["install"]>) {
  return runPromise((svc) => svc.install(...args))
}

export async function add(...args: Parameters<Interface["add"]>) {
  return runPromise((svc) => svc.add(...args))
}

export async function which(...args: Parameters<Interface["which"]>) {
  return runPromise((svc) => svc.which(...args))
}
