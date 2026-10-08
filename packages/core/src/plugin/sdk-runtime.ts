export * as PluginSdkRuntime from "./sdk-runtime"

import { lazy } from "../util/lazy"

// Known public imports resolve to bundled objects. Prepared external imports also
// receive closed, byte-checked filesystem bridges for aliases and unknown subpaths.
// Bun registration alone is not a process-wide unknown-import guard.
export const modules = {
  // The package root re-exports tool.ts and adds only types, whose declarations core cannot compile.
  "@orchestra/plugin": () => import("@orchestra/plugin/tool"),
  "@orchestra/plugin/tool": () => import("@orchestra/plugin/tool"),
  "@orchestra/plugin/tui": () => import("@orchestra/plugin/tui"),
  "@orchestra/plugin/v2/effect": () => import("@orchestra/plugin/v2/effect"),
  "@orchestra/plugin/v2/effect/integration": () => import("@orchestra/plugin/v2/effect/integration"),
  "@orchestra/plugin/v2/effect/plugin": () => import("@orchestra/plugin/v2/effect/plugin"),
  "@orchestra/plugin/v2/promise": () => import("@orchestra/plugin/v2/promise"),
}

const URL_PREFIX = "orchestra-plugin-sdk:"
const GLOBAL_KEY = Symbol.for("orchestra.plugin-sdk")

function requirePublic(specifier: string, loaded: Record<string, Record<string, unknown>>) {
  if (Object.hasOwn(loaded, specifier)) return true
  if (specifier === "@orchestra/plugin" || specifier.startsWith("@orchestra/plugin/"))
    throw Object.assign(new Error(`Bundled SDK does not export ${specifier}`), { name: "PluginSdkImportError" })
  return false
}

export async function prepareExternalImport(specifier: string) {
  const { PluginSdkAdmission } = await import("./sdk-admission")
  await PluginSdkAdmission.prepare(specifier)
}

// Registration is process-wide and happens once; admission is separate and per import.
export const install = lazy(async () => {
  const loaded: Record<string, Record<string, unknown>> = Object.fromEntries(
    await Promise.all(Object.entries(modules).map(async ([specifier, load]) => [specifier, await load()] as const)),
  )
  if (typeof Bun !== "undefined") {
    Bun.plugin({
      name: "orchestra-plugin-sdk",
      setup(build) {
        for (const [specifier, exports] of Object.entries(loaded)) {
          build.module(specifier, () => ({ exports, loader: "object" }))
          build.module(URL_PREFIX + specifier, () => ({ exports, loader: "object" }))
        }
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
      specifier.startsWith(URL_PREFIX)
        ? (requirePublic(specifier.slice(URL_PREFIX.length), loaded), { url: specifier, shortCircuit: true })
        : requirePublic(specifier, loaded) ? { url: URL_PREFIX + specifier, shortCircuit: true }
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
