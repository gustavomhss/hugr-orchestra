import { describe, expect, test } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import { tool } from "@orchestra/plugin"
import { ConfigPlugin } from "@/config/plugin"
import { PluginLoader } from "../../src/plugin/loader"
import { tmpdir } from "../fixture/fixture"

describe("plugin SDK resolution", () => {
  test("a local plugin that imports the SDK loads against the bundled copy, never a copy on disk", async () => {
    await using tmp = await tmpdir()
    const configDir = path.join(tmp.path, ".orchestra")
    // A planted registry copy beside the plugin. It links, then throws if anything evaluates it.
    const squat = path.join(configDir, "node_modules", "@orchestra", "plugin")
    await Bun.write(
      path.join(squat, "package.json"),
      JSON.stringify({ name: "@orchestra/plugin", type: "module", main: "index.js" }),
    )
    await Bun.write(path.join(squat, "index.js"), 'throw new Error("registry copy ran")\nexport function tool() {}\n')
    await Bun.write(
      path.join(configDir, "plugins", "greeter.ts"),
      [
        'import { tool } from "@orchestra/plugin"',
        'import * as sdk from "@orchestra/plugin"',
        "export const sdkTool = tool",
        "export const sdkExports = Object.keys(sdk)",
        "export const server = async () => ({",
        "  tool: {",
        "    greet: tool({",
        "      description: 'Greets someone',",
        "      args: { name: tool.schema.string() },",
        "      execute: async (args) => `hello ${args.name}`,",
        "    }),",
        "  },",
        "})",
        "",
      ].join("\n"),
    )

    const errors: unknown[] = []
    const loaded = await PluginLoader.loadExternal({
      items: (await ConfigPlugin.load(configDir)).map((spec) => ({
        spec,
        source: path.join(configDir, "orchestra.json"),
        scope: "local" as const,
      })),
      kind: "server",
      report: { error: (_candidate, _retry, _stage, error) => errors.push(error) },
    })

    expect(errors).toEqual([])
    expect(loaded).toHaveLength(1)
    expect(loaded[0].spec).toBe(pathToFileURL(path.join(configDir, "plugins", "greeter.ts")).href)
    expect(loaded[0].mod.sdkTool).toBe(tool)
    // The bundled copy must offer every runtime export of the package root, which it maps to tool.ts.
    expect(loaded[0].mod.sdkExports).toEqual(Object.keys(await import("@orchestra/plugin")))
  })
})
