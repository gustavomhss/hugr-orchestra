import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { plugin } from "bun"
import { RGBA } from "@opentui/core"
import { createRuntimePlugin, runtimeModuleIdForSpecifier } from "@opentui/core/runtime-plugin"

const runtime = createRuntimePlugin()
const observation = { rewritten: false }
plugin({
  ...runtime,
  setup(build) {
    runtime.setup({
      ...build,
      module: build.module.bind(build),
      onResolve: build.onResolve.bind(build),
      onLoad(options, callback) {
        return build.onLoad(options, async (args) => {
          const output = await callback(args)
          if (args.path === process.argv[2]) {
            assert(output && "contents" in output && typeof output.contents === "string", "late source loader did not run")
            assert(output.contents.includes(`export { RGBA } from ${JSON.stringify(runtimeModuleIdForSpecifier("@opentui/core"))}`),
              "late source literal was not rewritten by the bundled parser")
            observation.rewritten = true
          }
          return output
        })
      },
    })
  },
})
const fixture = await import(pathToFileURL(process.argv[2]!).href)
assert(observation.rewritten, "late source rewrite observation missing")
assert.equal(fixture.RGBA, RGBA)
assert.deepEqual(fixture.prose, ['import { RGBA } from "@opentui/core"', 'require("@opentui/core")', "🦣 café 日本語"])
console.log("COMPILED_RUNTIME_IMPORT_SYNTAX_OK")
