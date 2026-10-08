import { describe, expect, test } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import { tool } from "@orchestra/plugin/tool"
import { PluginSdkRuntime } from "@orchestra/core/plugin/sdk-runtime"
import { tmpdir } from "../fixture/tmpdir"

const plugin = [
  'import { tool } from "@orchestra/plugin"',
  "export const sdkTool = tool",
  "export const hello = tool({ description: 'hi', args: { x: tool.schema.string() }, async execute(args) { return args.x } })",
  "",
].join("\n")

// Three plugins outside any workspace: a local plugin beside a planted registry copy of the SDK, an npm plugin
// inside that node_modules, and a plugin with no node_modules anywhere above it.
async function writePlugins(dir: string, extension: string) {
  const configDir = path.join(dir, "project", ".orchestra")
  const squat = path.join(configDir, "node_modules", "@orchestra", "plugin")
  const npmPlugin = path.join(configDir, "node_modules", "npm-plugin")
  await Bun.write(
    path.join(squat, "package.json"),
    JSON.stringify({ name: "@orchestra/plugin", type: "module", main: "index.js" }),
  )
  // It exports the helper so that linking succeeds and evaluation is what fails.
  await Bun.write(path.join(squat, "index.js"), 'throw new Error("registry copy ran")\nexport function tool() {}\n')
  await Bun.write(
    path.join(npmPlugin, "package.json"),
    JSON.stringify({ name: "npm-plugin", type: "module", main: "index.js" }),
  )
  const files = [
    path.join(configDir, "plugins", `local.${extension}`),
    path.join(npmPlugin, "index.js"),
    path.join(dir, "bare", `plugin.${extension}`),
  ]
  await Promise.all(files.map((file) => Bun.write(file, plugin)))
  return files
}

describe("plugin SDK runtime", () => {
  test("resolves the SDK to the bundled copy under Bun, ahead of any copy on disk", async () => {
    await using tmp = await tmpdir()
    const files = await writePlugins(tmp.path, "ts")

    await PluginSdkRuntime.install()
    const loaded = await Promise.all(files.map((file) => import(pathToFileURL(file).href)))

    for (const mod of loaded) {
      expect(mod.sdkTool).toBe(tool)
      expect(mod.hello.description).toBe("hi")
    }
  })

  test("resolves the SDK to the bundled copy in a Node bundle like the desktop sidecar", async () => {
    await using tmp = await tmpdir()
    const files = await writePlugins(tmp.path, "js")
    const node = Bun.which("node")
    if (!node) throw new Error("this test needs node on PATH to run the Node bundle")
    const build = await Bun.build({
      entrypoints: [path.join(import.meta.dir, "sdk-runtime.node-entry.ts")],
      target: "node",
      format: "esm",
      outdir: path.join(tmp.path, "dist"),
    })
    expect(build.success).toBe(true)
    const run = (env: Record<string, string>) => {
      const result = Bun.spawnSync([node, path.join(tmp.path, "dist", "sdk-runtime.node-entry.js"), ...files], {
        env: { ...process.env, ...env },
      })
      expect(result.stderr.toString()).toBe("")
      return JSON.parse(result.stdout.toString())
    }

    expect(run({})).toEqual(files.map(() => ({ bundled: true, description: "hi" })))

    // Control: without the runtime the planted copy is what a plugin reaches.
    const control = run({ SKIP_SDK_RUNTIME: "1" })
    expect(control[0].error).toContain("registry copy ran")
    expect(control[1].error).toContain("registry copy ran")
    expect(control[2].error).toContain("@orchestra/plugin")
  })
})
