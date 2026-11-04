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
    for (const { name, content } of records) {
      if (process.env.GITHUB_ACTIONS !== undefined) {
        const bytes = Buffer.from(content).toString("base64")
        console.log(`generated-source ${name} sha256 ${Bun.CryptoHasher.hash("sha256", content, "hex")}`)
        for (let offset = 0; offset < bytes.length; offset += 2048)
          console.log(`generated-source ${name} chunk ${offset} ${bytes.slice(offset, offset + 2048)}`)
      }
    }
    for (const file of records) expect(file.content).toBe(previous.find((saved) => saved.name === file.name)?.content)
  } finally {
    await Promise.all(previous.map((file) => Bun.write(path.join(directory, "src/generated", file.name), file.content)))
  }
}, 120_000)
