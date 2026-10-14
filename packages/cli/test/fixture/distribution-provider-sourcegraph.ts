import { expect } from "bun:test"
import ts from "typescript"
import { realpath } from "node:fs/promises"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import { cli, sha256 } from "./distribution-native"

// Inspect source graph actually compiled for serve, using TypeScript's resolver
// and AST (comments/type-only imports are not runtime edges). This gate covers
// checkout-local static and literal dynamic edges, not arbitrary third-party
// plugin loading. Proof config supplies no external plugins or credentials.
export async function requireV2SourceGraph(evidence: string) {
  const root = await realpath(resolve(cli, "../.."))
  const config = ts.readConfigFile(join(cli, "tsconfig.json"), ts.sys.readFile)
  if (config.error) throw new Error("PROVIDER_SOURCEGRAPH_TSCONFIG_UNREADABLE")
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, cli)
  if (options.errors.length) throw new Error("PROVIDER_SOURCEGRAPH_TSCONFIG_INVALID")
  const seen = new Set<string>()
  const edges: Array<{ from: string; to: string; specifier: string }> = []
  const files: Array<{ path: string; sha256: string }> = []
  const roots = ["packages/cli/src/commands/handlers/serve.ts", "packages/server/src/routes.ts"]
  const forbidden = resolve(root, "packages/orchestra/src") + sep
  const walk = async (file: string, injectedText?: string): Promise<void> => {
    const canonical = await realpath(file)
    if (canonical.startsWith(forbidden)) throw new Error(`PROVIDER_SOURCEGRAPH_LEGACY_RUNTIME: ${relative(root, canonical)}`)
    if (seen.has(canonical)) return
    seen.add(canonical)
    const text = injectedText ?? await Bun.file(canonical).text()
    files.push({ path: relative(root, canonical), sha256: sha256(text) })
    const source = ts.createSourceFile(canonical, text, ts.ScriptTarget.Latest, true)
    const imports: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
        const bindings = node.importClause?.namedBindings
        if (!bindings || !ts.isNamedImports(bindings) || node.importClause?.name || bindings.elements.length === 0 || bindings.elements.some((item) => !item.isTypeOnly))
          imports.push(node.moduleSpecifier.text)
      }
      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        if (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.length === 0 || node.exportClause.elements.some((item) => !item.isTypeOnly))
          imports.push(node.moduleSpecifier.text)
      }
      if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference) &&
          node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) imports.push(node.moduleReference.expression.text)
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        const argument = node.arguments[0]
        const value = argument && ts.isAsExpression(argument) ? argument.expression : argument
        if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) imports.push(value.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    for (const specifier of imports) {
      if (specifier.startsWith("node:") || specifier.startsWith("bun:") || specifier === "bun") continue
      const resolved = ts.resolveModuleName(specifier, canonical, options.options, ts.sys).resolvedModule
      const localAsset = specifier.startsWith(".") && !["", ".ts", ".tsx", ".js", ".mjs", ".cjs"].includes(extname(specifier))
        ? resolve(dirname(canonical), specifier) : undefined
      const destination = resolved?.resolvedFileName ?? (localAsset && await Bun.file(localAsset).exists() ? localAsset : undefined)
      if (!destination) {
        if (specifier.startsWith(".") || specifier.startsWith("@orchestra/"))
          throw new Error(`PROVIDER_SOURCEGRAPH_INTERNAL_EDGE_UNRESOLVED: ${relative(root, canonical)} -> ${specifier}`)
        continue
      }
      const target = await realpath(destination)
      if (target.startsWith(forbidden)) throw new Error(`PROVIDER_SOURCEGRAPH_LEGACY_RUNTIME: ${relative(root, target)}`)
      if (!target.startsWith(root + sep) || target.includes(`${sep}node_modules${sep}`) || target.endsWith(".d.ts")) continue
      edges.push({ from: relative(root, canonical), to: relative(root, target), specifier })
      if ([".ts", ".tsx", ".js", ".mjs", ".cjs"].includes(extname(target))) await walk(target)
    }
  }
  // Calibrate forbidden-edge detection through the same resolver and AST used
  // below. Virtual source text changes no checkout file and no model response.
  const controlPath = join(root, roots[0])
  const legacy = relative(dirname(controlPath), join(root, "packages/orchestra/src/session/prompt.ts")).split(sep).join("/")
  const rejected = await walk(controlPath, `import { SessionPrompt } from ${JSON.stringify(legacy)}\n`).then(
    () => false,
    (error: unknown) => {
      if (!(error instanceof Error) || !error.message.startsWith("PROVIDER_SOURCEGRAPH_LEGACY_RUNTIME:")) throw error
      return true
    },
  )
  expect(rejected).toBe(true)
  seen.clear()
  edges.length = 0
  files.length = 0
  for (const entry of roots) await walk(join(root, entry))
  for (const required of ["packages/server/src/handlers/session.ts", "packages/core/src/session.ts",
    "packages/core/src/session/execution/local.ts", "packages/core/src/location-services.ts",
    "packages/core/src/session/runner/llm.ts", "packages/core/src/session/runner/model.ts", "packages/core/src/tool/bash.ts"])
    expect(files.map((file) => file.path)).toContain(required)
  expect(edges.length).toBeGreaterThan(0)
  // Positive reach control: the exact production runner's provider call is found
  // by AST, despite its comments also mentioning llm.stream and SessionPrompt.
  const runner = ts.createSourceFile("runner.ts", await Bun.file(join(root, "packages/core/src/session/runner/llm.ts")).text(), ts.ScriptTarget.Latest, true)
  const calls: ts.CallExpression[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "llm" && node.expression.name.text === "stream") calls.push(node)
    ts.forEachChild(node, visit)
  }
  visit(runner)
  expect(calls).toHaveLength(1)
  await Bun.write(join(evidence, "v2-sourcegraph.json"), JSON.stringify({ roots, files, edges,
    forbiddenRuntimeRoot: "packages/orchestra/src", forbiddenEdgeControlRejected: rejected,
    explicitProviderCalls: calls.length }, null, 2))
}
