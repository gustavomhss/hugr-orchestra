export * as PluginSdkRuntime from "./sdk-runtime"

import { lazy } from "../util/lazy"

// Local plugins, custom tools and npm plugins import the plugin SDK by its package name. Orchestra never installs
// that package from a registry, because anyone could publish under the name. Instead every import of these
// specifiers resolves to the SDK bundled with the running Orchestra, ahead of any copy on disk.
const modules = {
  // The package root re-exports tool.ts and adds only types, whose declarations core cannot compile.
  "@orchestra/plugin": () => import("@orchestra/plugin/tool"),
  "@orchestra/plugin/tool": () => import("@orchestra/plugin/tool"),
  "@orchestra/plugin/v2/effect": () => import("@orchestra/plugin/v2/effect"),
  "@orchestra/plugin/v2/effect/integration": () => import("@orchestra/plugin/v2/effect/integration"),
  "@orchestra/plugin/v2/effect/plugin": () => import("@orchestra/plugin/v2/effect/plugin"),
  "@orchestra/plugin/v2/promise": () => import("@orchestra/plugin/v2/promise"),
}

const URL_PREFIX = "orchestra-plugin-sdk:"
const GLOBAL_KEY = Symbol.for("orchestra.plugin-sdk")

// Call before importing any external plugin or tool. Registration is process-wide and happens once.
export const install = lazy(async () => {
  const loaded: Record<string, Record<string, unknown>> = Object.fromEntries(
    await Promise.all(Object.entries(modules).map(async ([specifier, load]) => [specifier, await load()] as const)),
  )
  if (typeof Bun !== "undefined") {
    Bun.plugin({
      name: "orchestra-plugin-sdk",
      setup(build) {
        for (const [specifier, exports] of Object.entries(loaded))
          build.module(specifier, () => ({ exports, loader: "object" }))
      },
    })
    return
  }
  const { registerHooks } = await import("node:module")
  if (typeof registerHooks !== "function") throw new Error("Bundled plugin SDK requires Node.js 22.15 or later")
  // A module that a load hook generates can reach objects from this one only through a global.
  Object.assign(globalThis, { [GLOBAL_KEY]: loaded })
  registerHooks({
    resolve: (specifier, context, nextResolve) =>
      Object.hasOwn(loaded, specifier)
        ? { url: URL_PREFIX + specifier, shortCircuit: true }
        : nextResolve(specifier, context),
    load: (url, context, nextLoad) =>
      url.startsWith(URL_PREFIX)
        ? { format: "module", source: nodeSource(url.slice(URL_PREFIX.length), loaded), shortCircuit: true }
        : nextLoad(url, context),
  })
})

function nodeSource(specifier: string, loaded: Record<string, Record<string, unknown>>) {
  return [
    `const sdk = globalThis[Symbol.for("orchestra.plugin-sdk")][${JSON.stringify(specifier)}]`,
    ...Object.keys(loaded[specifier] ?? {}).map(
      (name, index) =>
        `const v${index} = sdk[${JSON.stringify(name)}]\nexport { v${index} as ${JSON.stringify(name)} }`,
    ),
  ].join("\n")
}
