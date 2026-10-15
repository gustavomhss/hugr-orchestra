import assert from "node:assert/strict"
import { createRuntimePlugin } from "@opentui/core/runtime-plugin"
import { PluginSdkRuntime } from "@orchestra/core/plugin/sdk-runtime"
import { tool } from "@orchestra/plugin/tool"
import { define } from "@orchestra/plugin/v2/effect"
import { createBindingLookup } from "@orchestra/plugin/tui"
import { tuiRuntimeModules } from "../../../src/plugin/tui/runtime-modules"

const mode = process.argv[2]
assert.ok(mode === "normal" || mode === "control")
const entry = process.argv[3]
assert.ok(entry)
const promise = await PluginSdkRuntime.modules["@orchestra/plugin/v2/promise"]()
const additional = Object.fromEntries(
  Object.entries(tuiRuntimeModules).filter(
    ([specifier]) => mode === "normal" || !(specifier in PluginSdkRuntime.modules),
  ),
)
const registered = Object.entries(PluginSdkRuntime.modules).every(([specifier, load]) => additional[specifier] === load)
assert.equal(registered, mode === "normal")

// No test preload: each child owns its hook order, even when the parent suite preloads plugin support.
await PluginSdkRuntime.install()
Bun.plugin(createRuntimePlugin({ additional }))
await import(entry).then(
  async (plugin) => {
    const identities = {
      root: plugin.tool === tool,
      tool: plugin.subpathTool === tool,
      effect: plugin.effectDefine === define,
      effectPlugin: plugin.pluginDefine === define,
      promise: plugin.promiseDefine === promise.define,
      tui: plugin.createBindingLookup === createBindingLookup,
    }
    assert.deepEqual(Object.values(identities), [true, true, true, true, true, true])
    assert.equal(await plugin.greet.execute({ name: "SDK" }, {}), "hello SDK")
    console.log("sdk-tui-result:" + JSON.stringify({ mode, outcome: "bundled", registered, identities }))
  },
  (error: unknown) => {
    if (mode !== "control" || !(error instanceof Error) || error.message !== "planted SDK copy ran") throw error
    console.log("sdk-tui-result:" + JSON.stringify({ mode, outcome: "planted", registered }))
  },
)
