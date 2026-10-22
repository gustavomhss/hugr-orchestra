import { expect, test } from "bun:test"
import path from "node:path"
import ts from "typescript"
import { electronMock, mockElectron } from "./electron-mock.fixture"

const desktop = path.resolve(import.meta.dir, "../..")

async function desktopFiles(pattern: string) {
  return Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: desktop }))
}

// The names the desktop's own sources bind from "electron". A type-only import binds nothing at runtime, so it
// is not part of the mocked module's surface.
async function importedNames() {
  const names = new Set<string>()
  for (const file of await desktopFiles("{src,scripts}/**/*.{ts,tsx}")) {
    const source = ts.createSourceFile(file, await Bun.file(path.join(desktop, file)).text(), ts.ScriptTarget.Latest, true)
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      if (statement.moduleSpecifier.text !== "electron") continue
      const clause = statement.importClause
      if (!clause || clause.isTypeOnly) continue
      if (clause.name) names.add("default")
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (!element.isTypeOnly) names.add(element.name.text)
        }
      }
    }
  }
  return names
}

test("the shared Electron mock declares exactly the names the desktop imports", async () => {
  const imported = await importedNames()
  expect(imported.has("default")).toBe(true)
  expect([...imported].filter((name) => name !== "default").sort()).toEqual(Object.keys(electronMock).sort())
})

test("no desktop test mocks Electron outside the shared fixture", async () => {
  // The needle is assembled so that this file does not match itself.
  const needle = ['mock.module("', "electron", '"'].join("")
  const offenders: string[] = []
  for (const file of await desktopFiles("{src,scripts}/**/*.test.ts")) {
    if (await Bun.file(path.join(desktop, file)).text().then((text) => text.includes(needle))) offenders.push(file)
  }
  expect(offenders).toEqual([])
})

test("the mocked Electron module keeps every name the desktop imports", async () => {
  mockElectron()
  const names = Object.keys(await import("electron"))
  for (const name of [...Object.keys(electronMock), "default"]) expect(names).toContain(name)
})
