import { expect, test } from "bun:test"
import { $ } from "bun"
import path from "node:path"

test("the real Atlas generator reproduces the shipped record boundary", async () => {
  const root = path.resolve(import.meta.dir, "../../..")
  const directory = path.join(root, "modules/atlas/boundary")
  const files = await Array.fromAsync(new Bun.Glob("*.{js,d.ts}").scan({ cwd: path.join(directory, "src/generated") }))
  expect(files).toContain("record.js")
  expect(files).toContain("record.d.ts")
  const previous = await Promise.all(
    files.map(async (name) => ({
      name,
      content: await Bun.file(path.join(directory, "src/generated", name)).text(),
    })),
  )
  try {
    const generated = await $`bun script/build.ts`.cwd(directory).quiet().nothrow()
    expect(generated.exitCode, generated.stderr.toString()).toBe(0)
    const records = await Promise.all(
      ["record.js", "record.d.ts"].map(async (name) => ({
        name,
        content: await Bun.file(path.join(directory, "src/generated", name)).text(),
      })),
    )
    for (const file of records) {
      const saved = previous.find((saved) => saved.name === file.name)
      if (!saved) throw new Error(`Missing committed Atlas record boundary: ${file.name}`)
      expect(file.content).toBe(saved.content)
    }
  } finally {
    await Promise.all(previous.map((file) => Bun.write(path.join(directory, "src/generated", file.name), file.content)))
  }
}, 120_000)
