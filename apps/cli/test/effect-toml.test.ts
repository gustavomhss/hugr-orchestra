import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { Primitive } from "effect/unstable/cli"

test("the installed Effect CLI resolves the patched TOML parser", async () => {
  const fromEffect = createRequire(import.meta.resolve("effect/unstable/cli/Primitive"))
  const manifest: { version: string } = await Bun.file(fromEffect.resolve("toml/package.json")).json()
  expect(manifest.version).toBe("5.0.1")
})

test("the Effect CLI file primitive reads TOML settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestra-effect-toml-"))
  try {
    const settings = join(directory, "settings.toml")
    await Bun.write(settings, '[server]\nport = 3000\nenabled = true\nprofiles = ["default"]\n')
    const result = await Primitive.fileParse({ format: "toml" }).parse(settings).pipe(
      Effect.provide(NodeServices.layer),
      Effect.runPromise,
    )
    expect(result).toEqual({ server: { port: 3000, enabled: true, profiles: ["default"] } })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
