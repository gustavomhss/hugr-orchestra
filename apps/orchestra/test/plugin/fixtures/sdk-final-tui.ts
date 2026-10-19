import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { PluginSdkRuntime } from "@orchestra/core/plugin/sdk-runtime"

const entry = process.argv[2]
assert.ok(entry)
await PluginSdkRuntime.prepareExternalImport(entry)
await PluginSdkRuntime.install()
const { createRuntimePlugin } = await import("@opentui/core/runtime-plugin")
const { tuiRuntimeModules } = await import("../../../src/plugin/tui/runtime-modules")
Bun.plugin(createRuntimePlugin({ additional: tuiRuntimeModules }))
const plugin = await import(pathToFileURL(entry).href)
const expected: Record<string, Record<string, unknown>> = Object.fromEntries(await Promise.all(
  Object.entries(PluginSdkRuntime.modules).map(async ([key, load]) => [key, await load()]),
))
assert.equal(Object.keys(expected).length, 7, "frozen A06 TUI public surface")
for (const values of [plugin.publicSDK, plugin.aliasSDK] as Record<string, unknown>[][]) {
  assert.equal(values.length, Object.keys(expected).length)
  Object.entries(expected).forEach(([specifier, module], index) => {
    const keys = Object.keys(module).sort()
    assert.deepEqual(Object.keys(values[index]).sort(), keys)
    if (specifier === "@orchestra/plugin" + "/v2/effect/integration") return assert.deepEqual(keys, [])
    assert.ok(keys.length > 0)
    keys.forEach((key) => assert.strictEqual(values[index][key], module[key], `identity:${specifier}:${key}`))
  })
}
const fields = { tool: "", subpathTool: "/tool", effectDefine: "/v2/effect", pluginDefine: "/v2/effect/plugin", promiseDefine: "/v2/promise", createBindingLookup: "/tui" }
Object.entries(fields).forEach(([field, suffix]) => assert.strictEqual(plugin[field],
  expected["@orchestra/plugin" + suffix][field.includes("Define") ? "define" : field === "subpathTool" ? "tool" : field]))
assert.equal(await plugin.greet.execute({ name: "SDK" }, {}), "hello SDK")
console.log("sdk-final:" + JSON.stringify({ ok: true, mixed: true, rows: plugin.publicSDK.length + plugin.aliasSDK.length }))
