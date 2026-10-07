// Bundled for Node by sdk-runtime.test.ts, the way the desktop sidecar bundles the server.
import { pathToFileURL } from "url"
import { tool } from "@orchestra/plugin/tool"
import { PluginSdkRuntime } from "../../src/plugin/sdk-runtime"

// The control run skips the install to show that the test can see a plugin reach the copy on disk.
if (process.env.SKIP_SDK_RUNTIME !== "1") await PluginSdkRuntime.install()
const results = await Promise.all(
  process.argv.slice(2).map((file) =>
    import(pathToFileURL(file).href).then(
      (mod) => ({ bundled: mod.sdkTool === tool, description: mod.hello?.description }),
      (error) => ({ error: String(error) }),
    ),
  ),
)
console.log(JSON.stringify(results))
