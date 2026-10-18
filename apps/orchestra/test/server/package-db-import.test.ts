import { expect, test } from "bun:test"
import path from "node:path"
import ts from "typescript"

const ORCHESTRA = path.resolve(import.meta.dir, "../..")

test("the removed #db map has no parsed package-source consumers", async () => {
  const files = await Array.fromAsync(new Bun.Glob("**/*.{ts,tsx,js,jsx,mjs,cjs}").scan({ cwd: ORCHESTRA }))
  const sources = await Promise.all(
    files
      .filter((file) => !file.split(path.sep).some((part) => ["node_modules", "dist", "build"].includes(part)))
      .map(async (file) => ({
        file: file.split(path.sep).join("/"),
        imports: ts.preProcessFile(await Bun.file(path.join(ORCHESTRA, file)).text(), true, true).importedFiles,
      })),
  )
  // An empty/broken scan must not certify an alias as unused.
  expect(sources.length).toBeGreaterThan(200)
  expect(sources.find((item) => item.file === "src/session/prompt.ts")?.imports.map((ref) => ref.fileName)).toContain(
    "@/claude-code/engine",
  )
  expect(
    sources.flatMap((item) =>
      item.imports
        .filter((ref) => ref.fileName === "#db" || ref.fileName.startsWith("#db/"))
        .map((ref) => `${item.file} imports ${ref.fileName}`),
    ),
  ).toEqual([])
  const info = (await Bun.file(path.join(ORCHESTRA, "package.json")).json()) as { imports?: Record<string, unknown> }
  expect(info.imports?.["#db"]).toBeUndefined()
})
