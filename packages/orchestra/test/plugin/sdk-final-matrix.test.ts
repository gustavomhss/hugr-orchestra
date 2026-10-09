import { expect, test } from "bun:test"
import path from "node:path"
import { cp, mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Global } from "@orchestra/core/global"
import { Npm } from "@orchestra/core/npm"
import { PluginSdkPackage } from "@orchestra/core/plugin/sdk-package"
import { planted, registry, sdk } from "../../../core/test/fixture/sdk-registry"
import { tmpdir } from "../../../core/test/fixture/tmpdir"

test("A06 prepared SDK final matrix: Bun, Node ESM, compiled Bun, real OpenTUI and counted registration mutant", async () => {
  await using tmp = await tmpdir()
  await using http = await registry(tmp.path)
  const cache = path.join(tmp.path, "cache")
  const project = path.join(cache, "packages", "fixture")
  await mkdir(project, { recursive: true })
  await http.config(project)
  await Promise.all([http.publish("ordinary"), http.publish(sdk.name, { exports: { ".": "./index.js", "./*": "./index.js" } }, { "index.js": planted })])
  await Bun.write(path.join(project, "package.json"), JSON.stringify({ name: "fixture", type: "module", dependencies: {
    ordinary: sdk.version, [sdk.name]: sdk.version, "sdk-alias": `npm:${sdk.name}@${sdk.version}`,
  } }))
  await Effect.gen(function* () {
    const npm = yield* Npm.Service
    yield* npm.install(project)
  }).pipe(Effect.scoped, Effect.provide(AppNodeBuilder.build(Npm.node, [[Global.node, Global.layerWith({ cache, state: path.join(tmp.path, "state") })]])), Effect.runPromise)
  expect(http.hits).toContain("ordinary")
  expect(http.hits).toContain("tarballs/ordinary.tgz")
  expect(http.hits.filter((hit) => hit.includes(sdk.name))).toEqual([])
  await Promise.all([sdk.name, "sdk-alias"].map(async (name) => expect(await PluginSdkPackage.valid(path.join(project, "node_modules", name))).toBe(true)))
  const source = fileURLToPath(new URL("./fixtures/sdk-final-runtime.ts", import.meta.url))
  const tui = fileURLToPath(new URL("./fixtures/sdk-final-tui.ts", import.meta.url))
  const binary = path.join(tmp.path, process.platform === "win32" ? "sdk-final.exe" : "sdk-final")
  const [build, compile] = await Promise.all([
    Bun.build({ entrypoints: [source], target: "node", format: "esm", outdir: path.join(tmp.path, "dist") }),
    (async () => {
      const child = Bun.spawn([process.execPath, "build", "--compile", source, "--outfile", binary], { stdout: "pipe", stderr: "pipe" })
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      return { stdout, stderr, code }
    })(),
  ])
  expect({ success: build.success, logs: build.logs }).toEqual({ success: true, logs: [] })
  expect(compile).toMatchObject({ code: 0, stderr: "" })
  const specifiers = Object.keys(sdk.exports).map((key) => sdk.name + (key === "." ? "" : key.slice(1)))
  expect(specifiers).toHaveLength(7)
  const mixed = await Bun.file(new URL("./fixtures/sdk-tui-mixed.ts", import.meta.url)).text()
  expect(mixed).not.toContain("opentui:runtime-module:")
  const commands = {
    bun: [process.execPath, source], node: [Bun.which("node") ?? "node", path.join(tmp.path, "dist", "sdk-final-runtime.js")],
    compiled: [binary], tui: [process.execPath, tui], mutant: [process.execPath, source],
  }
  const reports = await Promise.all(Object.entries(commands).map(async ([runtime, command]) => {
    const root = path.join(tmp.path, runtime)
    await cp(project, root, { recursive: true })
    const entry = path.join(root, runtime === "tui" ? "mixed.ts" : "plugin.js")
    await Bun.write(entry, runtime === "tui" ? mixed + "\n" + [
      `export const publicSDK = await Promise.all(${JSON.stringify(specifiers)}.map((key) => import(key)))`,
      `export const aliasSDK = await Promise.all(${JSON.stringify(specifiers.map((key) => "sdk-alias" + key.slice(sdk.name.length)))}.map((key) => import(key)))`,
    ].join("\n") : "export const load = (specifier) => import(specifier)\n")
    const child = Bun.spawn([...command, entry, runtime], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 60_000,
      env: { ...process.env, XDG_CACHE_HOME: path.join(root, "xdg-cache"), XDG_STATE_HOME: path.join(root, "xdg-state"), XDG_DATA_HOME: path.join(root, "xdg-data"), XDG_CONFIG_HOME: path.join(root, "xdg-config") },
    })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    const lines = stdout.split("\n").filter((line) => line.startsWith("sdk-final:"))
    expect({ runtime, code, stderr, stdout }, "worker diagnostics").toMatchObject(runtime === "mutant" ? { code: 1 } : { code: 0, stderr: "" })
    expect(lines, `${runtime}: report count`).toHaveLength(1)
    const report = JSON.parse(lines[0].slice("sdk-final:".length))
    expect(report.ok).toBe(runtime !== "mutant")
    if (runtime === "mutant") {
      expect(stderr).toContain("identity:")
      expect(report.error).toContain("identity:")
    }
    if (runtime !== "mutant" && runtime !== "tui") {
      expect(report.rows).toHaveLength(specifiers.length * 2)
      expect(report.rejected).toHaveLength(6)
      expect(report.metadata).toHaveLength(2)
      expect(report.retries).toHaveLength(runtime === "node" ? 0 : specifiers.length * 2)
    }
    if (runtime === "tui") expect(report).toMatchObject({ mixed: true, rows: specifiers.length * 2 })
    console.log(`${runtime}:${lines[0]}`)
    return runtime
  }))
  expect(reports.sort()).toEqual(["bun", "compiled", "mutant", "node", "tui"])
}, 180_000)
