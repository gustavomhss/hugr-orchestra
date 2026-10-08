import { expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { mkdir, readFile, symlink } from "node:fs/promises"
import { Npm } from "@orchestra/core/npm"
import { PluginSdkPackage } from "@orchestra/core/plugin/sdk-package"
import { registry, sdk } from "../../../core/test/fixture/sdk-registry"
import { tmpdir } from "../fixture/fixture"

const name = "@orchestra/" + "plugin"
const worker = fileURLToPath(new URL("./fixtures/sdk-admission.ts", import.meta.url))
async function run(mode: string, entry: string) {
  const child = Bun.spawn([process.execPath, worker, mode, entry], { stdout: "pipe", stderr: "pipe", timeout: 30_000 })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const reports = stdout.split("\n").filter((line) => line.startsWith("sdk-admission:"))
  expect(reports).toHaveLength(1)
  return JSON.parse(reports[0].slice("sdk-admission:".length)) as { ok: boolean; error?: string; bundled?: boolean; alias?: boolean; unknown?: string[] }
}

for (const [mode, payload] of [["plugin", "payload.js"], ["tool", "payload.node"], ["config", "payload"], ["tui", "payload.json"]]) {
  test(`SDK admission ${mode} rejects foreign ${payload} intact before evaluation`, async () => {
    await using tmp = await tmpdir()
    const project = path.join(tmp.path, "project")
    const foreign = path.join(project, "node_modules", name)
    const mark = path.join(tmp.path, "evaluated")
    const manifest = JSON.stringify({ name, type: "module", exports: { ".": `./${payload}`, "./*": `./${payload}` } })
    const bytes = payload.endsWith(".json") ? '{"foreign":true}' : `await Bun.write(${JSON.stringify(mark)}, "ran"); throw new Error("planted SDK copy ran")`
    await Bun.write(path.join(project, "package.json"), JSON.stringify({ name: "fixture", type: "module" }))
    await Bun.write(path.join(foreign, "package.json"), manifest)
    await Bun.write(path.join(foreign, payload), bytes)
    const entry = path.join(project, "entry.js")
    await Bun.write(entry, `import ${JSON.stringify(name + "/unlisted")}\nexport default { id: "fixture", setup: async () => {} }\n`)
    const result = await run(mode, entry)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("PluginSdkSetupError")
    expect(await Bun.file(mark).exists()).toBe(false)
    expect(await readFile(path.join(foreign, "package.json"), "utf8")).toBe(manifest)
    expect(await readFile(path.join(foreign, payload), "utf8")).toBe(bytes)
    if (mode === "plugin") {
      const control = await run("control", entry)
      expect(control.error).toContain("planted SDK copy ran")
      expect(await Bun.file(mark).text()).toBe("ran")
    }
  })
}

for (const mode of ["plugin", "tui", "tool"]) {
  test(`SDK admission ${mode} executes real resolver public/alias bridges and delegates unknown paths`, async () => {
    await using tmp = await tmpdir()
    await using http = await registry(tmp.path)
    const project = path.join(tmp.path, "project")
    await mkdir(project)
    await http.config(project)
    await http.publish("ordinary")
    await Bun.write(path.join(project, "package.json"), JSON.stringify({ name: "fixture", type: "module", dependencies: {
      ordinary: sdk.version, [name]: sdk.version, "sdk-alias": `npm:${name}@${sdk.version}`,
    } }))
    await Npm.install(project)
    expect(http.hits).toContain("ordinary")
    expect(http.hits).toContain("tarballs/ordinary.tgz")
    expect(http.hits.filter((hit) => hit.includes(name))).toEqual([])
    const entry = path.join(project, "entry.js")
    await Bun.write(entry, [
      `import { tool } from ${JSON.stringify(name)}`,
      'const aliasModule = await import("sdk-alias/tool")',
      'import { ordinary } from "ordinary"',
      'if (ordinary !== 42) throw new Error("ordinary dependency did not execute")',
      "export const sdkTool = tool; export const aliasTool = aliasModule.tool",
      `export const publicSDK = await Promise.all(${JSON.stringify(Object.keys(sdk.exports).map((key) => name + (key === "." ? "" : key.slice(1))))}.map((key) => import(key)))`,
      `export const aliasSDK = await Promise.all(${JSON.stringify(Object.keys(sdk.exports).map((key) => "sdk-alias" + (key === "." ? "" : key.slice(1))))}.map((key) => import(key)))`,
      `export const unknown = await Promise.all(${JSON.stringify([name + "/unlisted", name + "/src/tool.ts", name + "/hidden.node", "sdk-alias/deep"])}.map((key) => import(key).then(() => "unexpected success", () => "rejected")))`,
    ].join("\n"))
    expect(await run(mode, entry)).toMatchObject({ ok: true, bundled: true, alias: true, public: Array(7).fill(true), aliases: Array(7).fill(true), unknown: ["rejected", "rejected", "rejected", "rejected"] })
  }, 60_000)
}

test("SDK admission checks imported dependency ancestry and preserves foreign symlink/self-scope", async () => {
  await using tmp = await tmpdir()
  const project = path.join(tmp.path, "project")
  const dependency = path.join(project, "node_modules", "helper")
  const foreign = path.join(tmp.path, "foreign")
  await Bun.write(path.join(project, "package.json"), JSON.stringify({ name: "fixture", dependencies: { helper: "1.0.0" } }))
  await Bun.write(path.join(dependency, "package.json"), JSON.stringify({ name: "helper", version: "1.0.0", type: "module", main: "index.js" }))
  await Bun.write(path.join(dependency, "index.js"), `import ${JSON.stringify(name + "/unlisted")}`)
  const manifest = JSON.stringify({ name, type: "module", exports: { ".": "./payload", "./*": "./payload" } })
  await Bun.write(path.join(foreign, "package.json"), manifest)
  await Bun.write(path.join(foreign, "payload"), 'throw new Error("foreign self-scope ran")')
  await mkdir(path.join(dependency, "node_modules", "@orchestra"), { recursive: true })
  const link = path.join(dependency, "node_modules", name)
  await symlink(foreign, link, process.platform === "win32" ? "junction" : "dir")
  const entry = path.join(project, "entry.js")
  await Bun.write(entry, 'import "helper"')
  expect((await run("plugin", entry)).error).toContain("PluginSdkSetupError")
  expect((await run("plugin", path.join(foreign, "payload"))).error).toContain("PluginSdkSetupError")
  expect(await readFile(path.join(foreign, "package.json"), "utf8")).toBe(manifest)
  expect((await Bun.file(link + "/package.json").json()).name).toBe(name)
})

test("SDK admission verifies alias bytes, not only manifest or marker", async () => {
  await using tmp = await tmpdir()
  const project = path.join(tmp.path, "project")
  await Bun.write(path.join(project, "package.json"), JSON.stringify({ name: "fixture", dependencies: { "sdk-alias": `npm:${name}@${sdk.version}` } }))
  const alias = path.join(project, "node_modules", "sdk-alias")
  await PluginSdkPackage.write(alias)
  const bytes = 'throw new Error("tampered alias ran")'
  await Bun.write(path.join(alias, "tool.js"), bytes)
  const entry = path.join(project, "entry.js")
  await Bun.write(entry, 'import "sdk-alias/tool"')
  expect((await run("plugin", entry)).error).toContain("PluginSdkSetupError")
  expect(await Bun.file(path.join(alias, "tool.js")).text()).toBe(bytes)
})
