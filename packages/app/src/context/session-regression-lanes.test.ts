import { expect, test } from "bun:test"
import path from "node:path"
import ts from "typescript"

test("session regression suites stay registered in executable browser discovery", async () => {
  const directory = path.resolve(import.meta.dir, "../../test-browser")
  const expected = Array.from(new Bun.Glob("session-*-regressions.suite.ts").scanSync(directory))
    .map((file) => file.replace(/\.suite\.ts$/, ""))
    .sort()
  expect(expected.length).toBeGreaterThan(0)
  const file = path.join(directory, "session-regressions.test.ts")
  const source = ts.createSourceFile(file, await Bun.file(file).text(), ts.ScriptTarget.Latest, true)
  const entries = source.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => Array.from(statement.declarationList.declarations))
    .find((declaration) => declaration.name.getText(source) === "suites")?.initializer
  if (!entries || !ts.isArrayLiteralExpression(entries)) throw new Error("Missing literal browser regression registry")
  const registered = entries.elements.map((entry) => {
    if (!ts.isStringLiteral(entry)) throw new Error("Nonliteral browser regression registry entry")
    return entry.text
  }).sort()
  expect(registered).toEqual(expected)
  const manifest = await Bun.file(path.resolve(import.meta.dir, "../../package.json")).json()
  expect(manifest.scripts["test:browser"]).toContain("--conditions=browser")
  expect(manifest.scripts["test:browser"]).toContain("./test-browser")
})
