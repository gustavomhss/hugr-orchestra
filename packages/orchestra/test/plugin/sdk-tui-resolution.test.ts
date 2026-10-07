import { expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { tmpdir } from "../fixture/fixture"

test("mixed public SDK/TUI imports use bundled objects through real OpenTUI, with an omitted-map control", async () => {
  await using tmp = await tmpdir()
  const squat = path.join(tmp.path, "node_modules", "@orchestra", "plugin")
  await Bun.write(
    path.join(squat, "package.json"),
    JSON.stringify({
      name: "@orchestra/plugin",
      type: "module",
      exports: Object.fromEntries(
        [".", "./tool", "./tui", "./v2/effect", "./v2/effect/plugin", "./v2/promise"].map((key) => [key, "./index.js"]),
      ),
    }),
  )
  await Bun.write(
    path.join(squat, "index.js"),
    'throw new Error("planted SDK copy ran")\nexport function tool() {}\nexport function define() {}\nexport function createBindingLookup() {}\n',
  )
  const entry = path.join(tmp.path, "mixed.ts")
  await Bun.write(
    entry,
    [
      'import { tool } from "@orchestra/plugin"',
      "export { tool }",
      'export { tool as subpathTool } from "@orchestra/plugin/tool"',
      'export { define as effectDefine } from "@orchestra/plugin/v2/effect"',
      'export { define as pluginDefine } from "@orchestra/plugin/v2/effect/plugin"',
      'export { define as promiseDefine } from "@orchestra/plugin/v2/promise"',
      'export { createBindingLookup } from "@orchestra/plugin/tui"',
      "export const greet = tool({",
      '  description: "Greets someone",',
      "  args: { name: tool.schema.string() },",
      "  execute: async (args) => `hello ${args.name}`,",
      "})",
    ].join("\n"),
  )

  for (const mode of ["normal", "control"]) {
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL("./fixtures/sdk-tui-resolution.ts", import.meta.url)),
        mode,
        pathToFileURL(entry).href,
      ],
      { cwd: tmp.path, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" })
    const reports = stdout.split("\n").filter((line) => line.startsWith("sdk-tui-result:"))
    expect(reports).toHaveLength(1)
    const result = JSON.parse(reports[0]!.slice("sdk-tui-result:".length))
    expect(result.mode).toBe(mode)
    expect(result.registered).toBe(mode === "normal")
    console.log(reports[0])
    if (mode === "normal" || result.outcome === "bundled") {
      expect(result.outcome).toBe("bundled")
      expect(result.identities).toEqual({
        root: true,
        tool: true,
        effect: true,
        effectPlugin: true,
        promise: true,
        tui: true,
      })
      if (mode === "control") console.log("Control did not reproduce planted SDK execution; vulnerability not proved.")
      continue
    }
    expect(result.outcome).toBe("planted")
  }
}, 90_000)
