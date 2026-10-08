import { pathToFileURL } from "node:url"
import { PluginLoader } from "../../../src/plugin/loader"
import { PluginSdkRuntime } from "@orchestra/core/plugin/sdk-runtime"
import { tool } from "@orchestra/plugin/tool"

const mode = process.argv[2]
const entry = process.argv[3]
if (!entry) throw new Error("missing admission fixture entry")
if (mode === "tui") {
  const { createRuntimePlugin } = await import("@opentui/core/runtime-plugin")
  const { tuiRuntimeModules } = await import("../../../src/plugin/tui/runtime-modules")
  Bun.plugin(createRuntimePlugin({ additional: tuiRuntimeModules }))
}
const load = async () => {
  if (mode === "control") {
    await PluginSdkRuntime.install()
    return import(pathToFileURL(entry).href)
  }
  if (mode === "config") {
    const { ConfigExternalPlugin } = await import("@orchestra/core/config/plugin/external")
    await ConfigExternalPlugin.loadExternalPlugin(pathToFileURL(entry).href)
    return { configured: true }
  }
  if (mode === "tool") {
    const { loadExternalTool } = await import("../../../src/tool/registry")
    return loadExternalTool(entry)
  }
  if (mode === "configured") {
    const failures: unknown[] = []
    const loaded = await PluginLoader.loadExternal({
      items: [{ spec: pathToFileURL(entry).href, source: entry, scope: "local" }],
      kind: "server",
      report: { error: (_candidate, _retry, _stage, error) => failures.push(error) },
    })
    if (failures.length) throw failures[0]
    if (loaded.length !== 1) throw new Error("configured plugin was not loaded")
    return loaded[0].mod
  }
  const result = await PluginLoader.load({ spec: entry, entry: pathToFileURL(entry).href, target: entry, source: "file", deprecated: false, options: undefined })
  if (!result.ok) throw result.error
  return result.value.mod
}
await load().then(
  async (mod) => {
    const identities = async (values: Record<string, unknown>[] | undefined) => {
      if (!values) return
      return Promise.all(Object.values(PluginSdkRuntime.modules).map(async (load, index) => {
        const expected: Record<string, unknown> = await load()
        return JSON.stringify(Object.keys(values[index]).sort()) === JSON.stringify(Object.keys(expected).sort()) &&
          Object.keys(expected).every((key) => values[index][key] === expected[key])
      }))
    }
    console.log("sdk-admission:" + JSON.stringify({ ok: true, bundled: mod.sdkTool === tool, alias: mod.aliasTool === tool, public: await identities(mod.publicSDK), aliases: await identities(mod.aliasSDK), unknown: mod.unknown, configured: mod.configured }))
  },
  (error: unknown) => console.log("sdk-admission:" + JSON.stringify({ ok: false, error: String(error) })),
)
