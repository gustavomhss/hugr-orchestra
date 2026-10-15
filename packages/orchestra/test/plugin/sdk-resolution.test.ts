import { describe, expect, test } from "bun:test"
import path from "path"
import { ConfigPlugin } from "@/config/plugin"
import { PluginLoader } from "../../src/plugin/loader"
import { tmpdir } from "../fixture/fixture"

describe("plugin SDK resolution", () => {
  test("a local plugin beside a foreign SDK is blocked without modifying its tree", async () => {
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

    expect(errors).toHaveLength(1)
    expect(String(errors[0])).toContain("PluginSdkSetupError")
    expect(loaded).toEqual([])
    expect(await Bun.file(path.join(squat, "index.js")).text()).toContain("registry copy ran")
  })
})
