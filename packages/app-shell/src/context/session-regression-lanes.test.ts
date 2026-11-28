import { expect, test } from "bun:test"
import path from "node:path"

// The browser lane discovers every test file under test-browser, so regression files need no registry.
test("session regression tests are plain browser test files and the lane keeps its conditions", async () => {
  const directory = path.resolve(import.meta.dir, "../../test-browser")
  const found = Array.from(new Bun.Glob("session-*-regressions.test.ts").scanSync(directory))
  expect(found.length).toBeGreaterThan(0)
  expect(Array.from(new Bun.Glob("session-*-regressions.suite.ts").scanSync(directory))).toEqual([])
  const manifest = await Bun.file(path.resolve(import.meta.dir, "../../package.json")).json()
  expect(manifest.scripts["test:browser"]).toBe("bun run ../../script/test-browser.ts ./test-browser")
  // Source wiring only; hosted browser CLI controls separately prove runtime receipts.
  const entry = await Bun.file(path.resolve(import.meta.dir, "../../../../script/test-browser.ts")).text()
  expect(entry).toContain('import { runBrowserSuite } from "../packages/core/script/test-browser"')
  expect(entry).toContain('export { runBrowserSuite, validateBrowserSuite } from "../packages/core/script/test-browser"')
  expect(entry).toContain("if (import.meta.main) await runBrowserSuite()")
  const implementation = await Bun.file(path.resolve(import.meta.dir, "../../../core/script/test-browser.ts")).text()
  expect(implementation).toContain('"--conditions=browser"')
  expect(implementation).toContain('"--isolate"')
  expect(implementation).toContain('"../../../script/test-omni-control.ts"')
})
