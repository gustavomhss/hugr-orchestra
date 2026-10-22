import { expect, test } from "bun:test"
import path from "node:path"
import ts from "typescript"
import { electronMock, mockElectron } from "./electron-mock.fixture"

const desktop = path.resolve(import.meta.dir, "../..")
// The one file allowed to mock Electron: the shared surface every desktop test goes through.
const sharedFixture = "src/main/electron-mock.fixture.ts"

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

function lineOf(source: ts.SourceFile, node: ts.Node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

// mock.module is the only way to replace a module in a test, and bun:test exports it as "mock".
function isMockModuleCall(node: ts.CallExpression) {
  if (!ts.isPropertyAccessExpression(node.expression)) return false
  if (node.expression.name.text !== "module") return false
  return ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "mock"
}

test("the shared Electron mock declares exactly the names the desktop imports", async () => {
  const imported = await importedNames()
  expect(imported.has("default")).toBe(true)
  expect([...imported].filter((name) => name !== "default").sort()).toEqual(Object.keys(electronMock).sort())
})

test("no desktop file mocks Electron outside the shared fixture", async () => {
  // The walk reads the AST, not the text: a single-quoted module name, a mock hidden in a fixture helper, a mock
  // under apps/desktop/test and a namespace import all name the same module, and only the AST sees every shape.
  const offenders: string[] = []
  for (const file of await desktopFiles("{src,scripts,test}/**/*.{ts,tsx}")) {
    const relative = file.replaceAll("\\", "/")
    if (relative === sharedFixture) continue
    const source = ts.createSourceFile(relative, await Bun.file(path.join(desktop, file)).text(), ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && isMockModuleCall(node)) {
        const [first] = node.arguments
        if (first && ts.isStringLiteralLike(first) && first.text === "electron")
          offenders.push(`${relative}:${lineOf(source, node)}: mock.module("electron")`)
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "electron") {
        const bindings = node.importClause?.namedBindings
        // A namespace import binds names no per-name comparison can see, and AGENTS.md forbids them anyway.
        if (bindings && ts.isNamespaceImport(bindings))
          offenders.push(`${relative}:${lineOf(source, node)}: import * as ${bindings.name.text} from "electron"`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(offenders).toEqual([])
})

test("the mocked Electron module keeps every name the desktop imports", async () => {
  mockElectron()
  const names = Object.keys(await import("electron"))
  for (const name of [...Object.keys(electronMock), "default"]) expect(names).toContain(name)
})
