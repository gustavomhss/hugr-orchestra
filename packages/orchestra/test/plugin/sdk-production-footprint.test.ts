import { expect, test } from "bun:test"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { mkdir, readlink, rm, stat, symlink } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { PluginSdkPackage } from "@orchestra/core/plugin/sdk-package"

test("configured local SDK plugin loads inside the real app project namespace", async () => {
  // Actions supplies the app's actual installed dependency/workspace tree. This
  // reproduces /repo/.orchestra/plugins/foo.ts; it is not an isolated SDK island.
  const root = path.resolve(import.meta.dir, "../../../..")
  expect((await stat(path.join(root, "node_modules"))).isDirectory()).toBe(true)
  const directory = path.join(root, ".orchestra", "plugins", "sdk-production-" + randomUUID())
  await using cleanup = { async [Symbol.asyncDispose]() { await rm(directory, { recursive: true, force: true }) } }
  const entry = path.join(directory, "entry.ts")
  const name = "@orchestra/" + "plugin"
  const alias = path.join(directory, "node_modules", "sdk-alias")
  await Bun.write(entry, [
    `import { tool } from ${JSON.stringify(name)}`,
    "export const sdkTool = tool",
    "export default { id: 'sdk-production', server: async () => ({}) }",
  ].join("\n"))
  const worker = fileURLToPath(new URL("./fixtures/sdk-admission.ts", import.meta.url))
  const run = async (mode: string) => {
    const child = Bun.spawn([process.execPath, worker, mode, entry], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 30_000 })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    const reports = stdout.split("\n").filter((line) => line.startsWith("sdk-admission:"))
    expect(reports).toHaveLength(1)
    return JSON.parse(reports[0].slice("sdk-admission:".length)) as { ok: boolean; bundled?: boolean; error?: string }
  }
  expect(await run("control")).toMatchObject({ ok: true, bundled: true })
  const prepared = await run("configured")
  console.log("sdk-production-footprint:" + JSON.stringify(prepared))
  expect(prepared).toMatchObject({ ok: true, bundled: true })
  await Bun.write(path.join(directory, "package.json"), JSON.stringify({ name: "sdk-production", dependencies: {
    "sdk-alias": `npm:${name}@${PluginSdkPackage.manifest.version}`,
    semver: "*",
  } }))
  await PluginSdkPackage.write(alias)
  await Bun.write(entry, [
    `import { tool } from ${JSON.stringify(name)}`,
    'const aliasModule = await import("sdk-alias/tool")',
    'import semver from "semver"; if (semver.valid("1.2.3") !== "1.2.3") throw new Error("ordinary app dependency did not execute")',
    "export const sdkTool = tool",
    "export const aliasTool = aliasModule.tool",
    `export const publicSDK = await Promise.all(${JSON.stringify(Object.keys(PluginSdkPackage.manifest.exports).map((key) => name + (key === "." ? "" : key.slice(1))))}.map((key) => import(key)))`,
    `export const aliasSDK = await Promise.all(${JSON.stringify(Object.keys(PluginSdkPackage.manifest.exports).map((key) => "sdk-alias" + (key === "." ? "" : key.slice(1))))}.map((key) => import(key)))`,
    `export const unknown = await Promise.all(${JSON.stringify([name + "/unlisted", name + "/src/tool.ts", "sdk-alias/deep"])}.map((key) => import(key).then(() => "unexpected success", () => "rejected")))`,
    "export default { id: 'sdk-production', server: async () => ({}) }",
  ].join("\n"))
  expect(await run("configured")).toMatchObject({ ok: true, bundled: true, alias: true, public: Array(7).fill(true), aliases: Array(7).fill(true), unknown: Array(3).fill("rejected") })

  // Same real app namespace, actual configured loader, and a foreign SDK leaf
  // link. The unprepared control proves Bun can execute this planted payload.
  const external = path.join(root, ".orchestra", "sdk-external-" + randomUUID())
  await using externalCleanup = { async [Symbol.asyncDispose]() { await rm(external, { recursive: true, force: true }) } }
  const helper = path.join(external, "nested", "helper")
  const foreign = path.join(external, "foreign")
  const marker = path.join(external, "evaluated")
  const manifest = JSON.stringify({ name, type: "module", exports: { "./*": "./payload.js" } })
  const bytes = `await Bun.write(${JSON.stringify(marker)}, "ran"); throw new Error("planted production SDK ran")`
  await Bun.write(path.join(foreign, "package.json"), manifest)
  await Bun.write(path.join(foreign, "payload.js"), bytes)
  const link = path.join(external, "node_modules", name)
  await mkdir(path.dirname(link), { recursive: true })
  await symlink(foreign, link, "dir")
  await Bun.write(path.join(helper, "package.json"), JSON.stringify({ name: "helper", version: "1.0.0", type: "module", main: "index.js" }))
  await Bun.write(path.join(helper, "index.js"), `const sdk = ["@orchestra", "plugin"].join("/"); await import(sdk + "/unlisted")`)
  await symlink(helper, path.join(directory, "node_modules", "helper"), "dir")
  await Bun.write(path.join(directory, "package.json"), JSON.stringify({ name: "sdk-production", dependencies: { helper: "1.0.0" } }))
  await Bun.write(entry, 'import "helper"')
  const rejected = await run("configured")
  expect(rejected.ok).toBe(false)
  expect(rejected.error).toContain("PluginSdkSetupError")
  expect(await Bun.file(marker).exists()).toBe(false)
  expect(await readlink(link)).toBe(foreign)
  expect(await Bun.file(path.join(foreign, "package.json")).text()).toBe(manifest)
  expect(await Bun.file(path.join(foreign, "payload.js")).text()).toBe(bytes)
  const control = await run("control")
  expect(control.error).toContain("planted production SDK ran")
  expect(await Bun.file(marker).text()).toBe("ran")
}, 90_000)
