import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { PluginSdkRuntime } from "@orchestra/core/plugin/sdk-runtime"
import { PluginSdkPackage } from "@orchestra/core/plugin/sdk-package"
import type { IntegrationDraft, IntegrationHooks } from "@orchestra/plugin/v2/effect/integration"

// Package typecheck must resolve these public types and their field shapes.
export type IntegrationFields = [IntegrationDraft["method"]["update"], IntegrationHooks["connection"]["resolve"], IntegrationHooks["transform"]]

async function run() {
  const entry = process.argv[2]
  assert.ok(entry, "missing external entry")
  await PluginSdkRuntime.prepareExternalImport(entry)
  await PluginSdkRuntime.install()
  const expected: Record<string, Record<string, unknown>> = Object.fromEntries(await Promise.all(
    Object.entries(PluginSdkRuntime.modules).map(async ([key, load]) => [key, await load()]),
  ))
  const specifiers = Object.keys(PluginSdkPackage.manifest.exports).map((key) => PluginSdkPackage.manifest.name + (key === "." ? "" : key.slice(1)))
  assert.equal(specifiers.length, 7, "frozen A06 public surface")
  assert.deepEqual(Object.keys(expected), specifiers)
  if (process.argv[3] === "mutant") {
    assert.ok(typeof Bun !== "undefined", "registration mutant requires Bun")
    const root = PluginSdkPackage.manifest.name
    assert.ok(Object.hasOwn(expected[root], "tool"), "mutant must preserve export keys")
    const exports = { ...expected[root], tool: function mutatedTool() {} }
    Bun.plugin({
      name: "sdk-final-registration-mutant",
      setup(build) {
        build.module(root, () => ({ exports, loader: "object" }))
        build.module("orchestra-plugin-sdk:" + root, () => ({ exports, loader: "object" }))
      },
    })
  }
  const plugin = await import(pathToFileURL(entry).href)
  const require = createRequire(pathToFileURL(entry))
  const compare = (value: Record<string, unknown>, specifier: string) => {
    const keys = Object.keys(expected[specifier]).sort()
    assert.deepEqual(Object.keys(value).sort(), keys, `keys:${specifier}`)
    if (specifier === PluginSdkPackage.manifest.name + "/v2/effect/integration") {
      assert.deepEqual(keys, [], "integration is type-only")
      return
    }
    assert.ok(keys.length > 0, `empty runtime:${specifier}`)
    keys.forEach((key) => assert.strictEqual(value[key], expected[specifier][key], `identity:${specifier}:${key}`))
  }
  const rows = await Promise.all(specifiers.flatMap((specifier) => [specifier, "sdk-alias" + specifier.slice(PluginSdkPackage.manifest.name.length)]).map(async (specifier) => {
    const canonical = specifier.startsWith("sdk-alias") ? PluginSdkPackage.manifest.name + specifier.slice("sdk-alias".length) : specifier
    compare(await plugin.load(specifier), canonical)
    compare(require(specifier), canonical)
    return specifier
  }))
  const rejected = await Promise.all([PluginSdkPackage.manifest.name, "sdk-alias"].flatMap((name) =>
    ["/unknown", "/src/tool.ts", "/v2/effect/deep"].map((suffix) => name + suffix)).map(async (specifier) => {
    await assert.rejects(() => plugin.load(specifier), specifier)
    assert.throws(() => require(specifier), specifier)
    return specifier
  }))
  const optional = async (specifier: string, check: (value: Record<string, unknown>) => void) => {
    const imported = await plugin.load(specifier).then((value: Record<string, unknown>) => ({ value }), () => undefined)
    if (imported) check(imported.value)
    const required = await Promise.resolve().then(() => require(specifier) as Record<string, unknown>).then((value) => ({ value }), () => undefined)
    if (required) check(required.value)
    return { specifier, imported: !!imported, required: !!required }
  }
  const retries = typeof Bun === "undefined" ? [] : await Promise.all(Object.entries(PluginSdkPackage.manifest.exports).flatMap(([key, file]) =>
    [PluginSdkPackage.manifest.name, "sdk-alias"].map((name) => optional(name + "/" + file.slice(2),
      (value) => compare(value, PluginSdkPackage.manifest.name + (key === "." ? "" : key.slice(1)))))))
  const metadata = await Promise.all([PluginSdkPackage.manifest.name, "sdk-alias"].map((name) =>
    optional(name + "/package.json", (value) => {
      assert.deepEqual(value.default ?? value, PluginSdkPackage.manifest)
      if (!("default" in value)) return
      Object.entries(value).filter(([key]) => key !== "default").forEach(([key, item]) => {
        assert.ok(Object.hasOwn(PluginSdkPackage.manifest, key), `foreign metadata:${key}`)
        assert.deepEqual(item, Reflect.get(PluginSdkPackage.manifest, key))
      })
    })))
  assert.equal((await plugin.load("ordinary")).ordinary, 42)
  return { rows, rejected, retries, metadata }
}

await run().then(
  (result) => console.log("sdk-final:" + JSON.stringify({ ok: true, ...result })),
  (error: unknown) => {
    console.error(String(error))
    console.log("sdk-final:" + JSON.stringify({ ok: false, error: String(error) }))
    process.exitCode = 1
  },
)
