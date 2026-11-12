export * as InstallationHttp from "./installation-http"
import type { HttpExtension } from "@orchestra/server/routes"
import { Effect } from "effect"
import path from "node:path"
import { pathToFileURL } from "node:url"

export type Installation = HttpExtension & { dispose: () => Promise<void> }
export type InstallationContext = { origin: string }

export function load(file: string, context: InstallationContext): Effect.Effect<Installation, Error> {
  return Effect.gen(function* () {
    if (!path.isAbsolute(file) || file.startsWith("//") || file.startsWith("\\\\") ||
      ![".ts", ".mts", ".js", ".mjs"].includes(path.extname(file))) {
      return yield* Effect.fail(new Error("Installation requires an absolute local .ts, .mts, .js or .mjs file"))
    }
    const descriptor: unknown = yield* Effect.tryPromise({
      try: async () => {
        const module = await import(pathToFileURL(file).href)
        if (typeof module.default !== "function") throw new Error("Invalid installation factory")
        return module.default(context)
      },
      catch: () => new Error("Installation module could not be loaded"),
    })
    return yield* Effect.try({
      try: () => requireInstallation(descriptor),
      catch: () => new Error("Installation returned an invalid HTTP extension"),
    }).pipe(Effect.onError(() => Effect.tryPromise({
      try: async () => {
        if (descriptor !== null && (typeof descriptor === "object" || typeof descriptor === "function") &&
          "dispose" in descriptor && typeof descriptor.dispose === "function") await descriptor.dispose()
      },
      catch: () => new Error("Installation cleanup failed"),
    }).pipe(Effect.ignore)))
  })
}

function requireInstallation(value: unknown): Installation {
  if (value === null || typeof value !== "object" ||
    !("mount" in value) || typeof value.mount !== "string" ||
    !("handler" in value) || typeof value.handler !== "function" ||
    !("dispose" in value) || typeof value.dispose !== "function") {
    throw new Error("Invalid installation descriptor")
  }
  // Match the server mount grammar before startup so rejected descriptors are disposed.
  const mount = value.mount
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(mount) ||
    ["/api", "/openapi.json"].some((reserved) => mount === reserved || mount.startsWith(`${reserved}/`))) {
    throw new Error("Invalid installation mount")
  }
  return value as Installation
}
