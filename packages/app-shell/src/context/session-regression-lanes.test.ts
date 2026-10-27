import { expect, test } from "bun:test"
import path from "node:path"

// The browser lane discovers every test file under test-browser, so regression files need no registry.
test("session regression tests are plain browser test files and the lane keeps its conditions", async () => {
  const directory = path.resolve(import.meta.dir, "../../test-browser")
  const found = Array.from(new Bun.Glob("session-*-regressions.test.ts").scanSync(directory))
  expect(found.length).toBeGreaterThan(0)
  expect(Array.from(new Bun.Glob("session-*-regressions.suite.ts").scanSync(directory))).toEqual([])
  const manifest = await Bun.file(path.resolve(import.meta.dir, "../../package.json")).json()
  expect(manifest.scripts["test:browser"]).toContain("--conditions=browser")
  expect(manifest.scripts["test:browser"]).toContain("./test-browser")
})
