import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { ConfigPluginFile } from "@orchestra/core/config/plugin-file"

const dir = () => mkdtemp(path.join(tmpdir(), "plugin-file-"))

describe("ConfigPluginFile.add", () => {
  test("creates orchestra.json with the plugin when no config exists", async () => {
    const directory = await dir()
    const result = await ConfigPluginFile.add(directory, "@acme/tool@1.0.0")
    expect(result).toEqual({ file: path.join(directory, "orchestra.json"), mode: "add" })
    expect(JSON.parse(await readFile(result.file, "utf8"))).toEqual({ plugins: ["@acme/tool@1.0.0"] })
  })

  test("keeps comments and other keys, appending to an existing list", async () => {
    const directory = await dir()
    const file = path.join(directory, "orchestra.jsonc")
    await writeFile(file, '{\n  // keep me\n  "model": "x",\n  "plugins": ["other"]\n}\n')
    await ConfigPluginFile.add(directory, "@acme/tool")
    const text = await readFile(file, "utf8")
    expect(text).toContain("// keep me")
    expect(JSON.parse(text.replace("// keep me", ""))).toEqual({ model: "x", plugins: ["other", "@acme/tool"] })
  })

  test("leaves a configured package alone unless forced, then replaces its version", async () => {
    const directory = await dir()
    await mkdir(path.join(directory, ".orchestra"))
    const file = path.join(directory, ".orchestra", "orchestra.json")
    await writeFile(file, JSON.stringify({ plugins: ["@acme/tool@1.0.0"] }))
    expect((await ConfigPluginFile.add(directory, "@acme/tool@2.0.0")).mode).toBe("noop")
    expect(JSON.parse(await readFile(file, "utf8")).plugins).toEqual(["@acme/tool@1.0.0"])
    expect((await ConfigPluginFile.add(directory, "@acme/tool@2.0.0", { force: true })).mode).toBe("replace")
    expect(JSON.parse(await readFile(file, "utf8")).plugins).toEqual(["@acme/tool@2.0.0"])
  })

  test("reports a config file that is not valid JSON instead of overwriting it", async () => {
    const directory = await dir()
    const file = path.join(directory, "orchestra.json")
    await writeFile(file, '{ "plugins": [')
    await expect(ConfigPluginFile.add(directory, "x")).rejects.toThrow(`Invalid JSON in ${file}`)
    expect(await readFile(file, "utf8")).toBe('{ "plugins": [')
  })
})

describe("ConfigPluginFile.install", () => {
  const plugin = async (manifest: unknown) => {
    const directory = await dir()
    await writeFile(path.join(directory, "package.json"), JSON.stringify(manifest))
    return directory
  }

  test("detects the server and tui targets a local plugin package exposes", async () => {
    const both = await plugin({ name: "p", exports: { "./server": "./s.js", "./tui": { import: "./t.js" } } })
    expect(await ConfigPluginFile.install(both)).toEqual({ directory: both, targets: ["server", "tui"] })
    const main = await plugin({ name: "p", main: "index.js" })
    expect((await ConfigPluginFile.install(`file://${main}`)).targets).toEqual(["server"])
    const themes = await plugin({ name: "p", "oc-themes": ["themes/a.json"] })
    expect((await ConfigPluginFile.install(themes)).targets).toEqual(["tui"])
  })

  test("refuses a package without entrypoints or with an unreadable manifest, naming the install failure", async () => {
    const empty = await plugin({ name: "p", exports: { "./other": "./o.js" } })
    await expect(ConfigPluginFile.install(empty)).rejects.toThrow("does not expose plugin entrypoints")
    await expect(ConfigPluginFile.install(await dir())).rejects.toThrow("failed to read")
    await expect(ConfigPluginFile.install(await plugin({ name: "p", "oc-themes": "x" }))).rejects.toThrow("invalid oc-themes")
    await expect(
      ConfigPluginFile.install("@acme/missing", async () => {
        throw new Error("npm failed", { cause: new Error("x", { cause: undefined }) })
      }),
    ).rejects.toThrow('Could not install "@acme/missing": ')
  })

  test("installs an npm spec through the resolver before reading its manifest", async () => {
    const directory = await plugin({ name: "p", main: "i.js" })
    const asked: string[] = []
    const manifest = await ConfigPluginFile.install("@acme/tool@1", async (spec) => (asked.push(spec), directory))
    expect(asked).toEqual(["@acme/tool@1"])
    expect(manifest.targets).toEqual(["server"])
  })
})
