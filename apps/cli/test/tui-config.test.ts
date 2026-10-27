import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { loadTuiConfig } from "../src/tui-config"

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), "tui-config-"))
  await fs.mkdir(path.join(root, "global"), { recursive: true })
  await fs.mkdir(path.join(root, "project", ".git"), { recursive: true })
  await fs.mkdir(path.join(root, "project", "packages", "app"), { recursive: true })
})

afterEach(() => fs.rm(root, { recursive: true, force: true }))

const write = (file: string, value: string) => Bun.write(path.join(root, file), value)
const load = () => loadTuiConfig(path.join(root, "project", "packages", "app"), path.join(root, "global"))

describe("tui config files", () => {
  test("project tui.json overrides the global file per key, and plugin toggles merge", async () => {
    await write("global/tui.json", JSON.stringify({ theme: "global", mouse: false, plugin_enabled: { a: true, b: true } }))
    await write("project/tui.jsonc", '{ "theme": "project", /* comment */ "plugin_enabled": { "b": false }, }')
    const config = await load()
    expect(config.theme).toBe("project")
    expect(config.mouse).toBe(false)
    expect(config.plugin_enabled).toEqual({ a: true, b: false })
  })

  test("the folder nearest the opened directory wins", async () => {
    await write("project/tui.json", JSON.stringify({ theme: "root" }))
    await write("project/packages/app/.orchestra/tui.json", JSON.stringify({ theme: "nested" }))
    expect((await load()).theme).toBe("nested")
  })

  test("without any file the defaults apply", async () => {
    expect((await load()).theme).toBeUndefined()
  })

  test("an invalid file fails naming it", async () => {
    await write("project/tui.json", "{ invalid")
    await expect(load()).rejects.toThrow("project/tui.json")
    await write("project/tui.json", JSON.stringify({ leader_timeout: "slow" }))
    await expect(load()).rejects.toThrow("project/tui.json")
  })
})
