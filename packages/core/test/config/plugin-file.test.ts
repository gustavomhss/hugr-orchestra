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
