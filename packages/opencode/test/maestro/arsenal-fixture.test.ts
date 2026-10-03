import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, realpath } from "node:fs/promises"
import { prepareArsenalSDK } from "./arsenal-fixture"
import { tmpdir } from "../fixture/fixture"

test("SDK fixture preserves actual package-resolution identity; conflicting existing modules are rejected", async () => {
  await using tmp = await tmpdir()
  const config = path.join(tmp.path, "config")
  await prepareArsenalSDK(tmp.path, config)
  const installed = Bun.resolveSync("@opencode-ai/plugin/package.json", path.resolve(import.meta.dir, "../.."))
  const sdk = await Bun.file(installed).json()
  for (const root of [config, path.join(tmp.path, ".opencode")]) {
    expect((await Bun.file(path.join(root, "package.json")).json()).dependencies).toEqual({ [sdk.name]: sdk.version })
    expect(await realpath(Bun.resolveSync("@opencode-ai/plugin/package.json", root))).toBe(await realpath(installed))
  }
  await using conflict = await tmpdir()
  await mkdir(path.join(conflict.path, ".opencode/node_modules"), { recursive: true })
  await expect(prepareArsenalSDK(conflict.path, path.join(conflict.path, "config"))).rejects.toThrow("Arsenal fixture SDK installation mismatch")
})
