export * as ConfigExternalPlugin from "./external"

import type { Plugin as EffectPlugin } from "@orchestra/plugin/v2/effect"
import type { Plugin as PromisePlugin } from "@orchestra/plugin/v2/promise"
import { Effect, Schema } from "effect"
import path from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { Config } from "../../config"
import { FSUtil } from "../../fs-util"
import { Location } from "../../location"
import { Npm } from "../../npm"
import { define } from "../../plugin/internal"
import { PluginPromise } from "../../plugin/promise"
import { PluginSdkRuntime } from "../../plugin/sdk-runtime"

const PluginModule = Schema.Struct({
  default: Schema.Union([
    Schema.Struct({
      id: Schema.String,
      effect: Schema.declare<EffectPlugin["effect"]>(
        (input): input is EffectPlugin["effect"] => typeof input === "function",
      ),
    }),
    Schema.Struct({
      id: Schema.String,
      setup: Schema.declare<PromisePlugin["setup"]>(
        (input): input is PromisePlugin["setup"] => typeof input === "function",
      ),
    }),
  ]),
})

// The same admission/import boundary is used by directory and npm config plugins.
export async function loadExternalPlugin(entrypoint: string, sourceRoot?: string) {
  await PluginSdkRuntime.prepareExternalImport(entrypoint, sourceRoot)
  await PluginSdkRuntime.install()
  return Schema.decodeUnknownSync(PluginModule)(await import(entrypoint)).default
}

export const Plugin = define({
  id: "config-plugin",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const npm = yield* Npm.Service
    yield* Effect.gen(function* () {
      const configured: { package: string; options?: Record<string, any> }[] = []

      for (const entry of yield* config.entries()) {
        if (entry.type === "document") {
          const directory = entry.path ? path.dirname(entry.path) : location.directory
          for (const item of entry.info.plugins ?? []) {
            const ref = typeof item === "string" ? { package: item } : item
            const packageName = (() => {
              if (ref.package.startsWith("file://")) return fileURLToPath(ref.package)
              if (ref.package.startsWith("./") || ref.package.startsWith("../")) {
                return path.resolve(directory, ref.package)
              }
              return ref.package
            })()
            configured.push({ package: packageName, options: ref.options })
          }
        }

        if (entry.type === "directory") {
          const files = yield* fs
            .glob("{plugin,plugins}/*.{ts,js}", {
              cwd: entry.path,
              absolute: true,
              include: "file",
              dot: true,
              symlink: true,
            })
            .pipe(Effect.orElseSucceed(() => []))
          files.sort()
          for (const file of files) configured.push({ package: file })
        }
      }

      for (const ref of configured) {
        yield* Effect.gen(function* () {
          const entrypoint = path.isAbsolute(ref.package)
            ? pathToFileURL(ref.package).href
            : (yield* npm.add(ref.package)).entrypoint
          if (!entrypoint) return

          const value = yield* Effect.promise(() => loadExternalPlugin(entrypoint, path.isAbsolute(ref.package) ? path.dirname(ref.package) : undefined))
          const plugin = "effect" in value ? value : PluginPromise.fromPromise(value)
          yield* ctx.plugin.add({
            id: plugin.id,
            effect: (host) => plugin.effect({ ...host, options: ref.options ?? {} }),
          })
        }).pipe(Effect.catchCause((cause) => Effect.logError("External plugin setup blocked", cause)))
      }
    }).pipe(Effect.forkScoped({ startImmediately: true }))
  }),
})
