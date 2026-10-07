import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { PluginSdkRuntime } from "../../src/plugin/sdk-runtime"

if (process.env.SKIP_SDK_RUNTIME !== "1") await PluginSdkRuntime.install()
const expected = Object.fromEntries(await Promise.all(Object.entries(PluginSdkRuntime.modules).map(async ([key, load]) => [key, await load()])))
const require = createRequire(pathToFileURL(process.argv[2]).href)
const results = await Promise.all(process.argv.slice(3).map(async (specifier) => {
  const module = await import(pathToFileURL(process.argv[2]).href + `?sdk=${encodeURIComponent(specifier)}`)
  return module.load(specifier).then((value: Record<string, unknown>) => ({
    specifier,
    bundled: Object.keys(expected[specifier] ?? {}).every((name) => value[name] === expected[specifier]?.[name]),
    require: Object.keys(expected[specifier] ?? {}).every((name) => require(specifier)[name] === expected[specifier]?.[name]),
    exports: Object.keys(value),
  }), (error: unknown) => ({ specifier, error: String(error) }))
}))
console.log(JSON.stringify(results))
