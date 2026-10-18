export * as CodeIndexTreeSitter from "./tree-sitter"

import { fileURLToPath } from "url"
import { Effect, Schema } from "effect"
import type { Language, Node, Parser, Query } from "web-tree-sitter"
import { lazy } from "../../util/lazy"
import type { Grammar } from "./filter"

// The structural layer (J2.5), transplanted from Arsenal onboard/extract.ts (TechLead a68e7af, HuGR Labs,
// Apache-2.0): 1-based lines per symbol and per import, and partial trees never certify coverage. Definitions come
// from the grammars' own upstream tags.scm queries; EXTRA adds what those omit (type aliases, enums, plain
// constants, properties, namespaces). Parsing is web-tree-sitter wasm, loaded as in O/tool/shell/scan.ts.

/** Per-file byte cap; a larger file is skipped with this reason instead of being parsed. */
export const MAX_BYTES = 2 * 1024 * 1024

export type Definition = {
  readonly name: string
  /** Dotted container chain plus name, for example `DiscoveryResult.assemble`. */
  readonly qualified: string
  readonly kind: string
  readonly startLine: number
  readonly endLine: number
  readonly nameLine: number
  readonly exported: boolean
  /** Index of the innermost enclosing definition in the same array. */
  readonly container?: number
}

export type Import = {
  readonly specifier: string
  readonly line: number
  /** `reexport` is `export ... from`; `dynamic` is `import("...")`; `require` is `require("...")`. */
  readonly form: "static" | "reexport" | "dynamic" | "require"
  readonly names: ReadonlyArray<string>
}

export type Extract = {
  readonly path: string
  readonly lines: number
  readonly definitions: ReadonlyArray<Definition>
  readonly imports: ReadonlyArray<Import>
  readonly coverage: { readonly complete: boolean; readonly reason?: "partial-parse" | "too-large" }
}

export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("CodeIndexTreeSitterUnavailable", {
  message: Schema.String,
}) {}

export const extract = Effect.fn("CodeIndexTreeSitter.extract")(function* (path: string, source: string, grammar: Grammar) {
  const lines = source.length === 0 ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0)
  if (Buffer.byteLength(source) > MAX_BYTES)
    return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "too-large" } } satisfies Extract
  const loaded = yield* Effect.tryPromise({
    try: () => grammars(),
    catch: (cause) => new Unavailable({ message: cause instanceof Error ? cause.message : String(cause) }),
  })
  const entry = loaded[grammar]
  const tree = entry.parser.parse(source)
  if (!tree) return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "partial-parse" } } satisfies Extract
  const result = {
    path,
    lines,
    definitions: definitions(entry.tags, tree.rootNode, grammar),
    imports: grammar === "python" ? pythonImports(entry.imports, tree.rootNode) : scriptImports(entry.imports, tree.rootNode),
    coverage: tree.rootNode.hasError ? { complete: false, reason: "partial-parse" } : { complete: true },
  } satisfies Extract
  tree.delete()
  return result
})

const EXTRA = {
  script: `
(type_alias_declaration name: (type_identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.enum
(internal_module name: (_) @name) @definition.namespace
(lexical_declaration (variable_declarator name: (identifier) @name) @definition.constant)
(variable_declaration (variable_declarator name: (identifier) @name) @definition.constant)
(public_field_definition name: (_) @name) @definition.property
(property_signature name: (_) @name) @definition.property
(method_definition name: (property_identifier) @name (#eq? @name "constructor")) @definition.method
`,
  python: `
(class_definition body: (block (expression_statement (assignment left: (identifier) @name) @definition.property)))
`,
}

const IMPORTS = {
  script: `
(import_statement source: (string (string_fragment) @specifier)) @import
(export_statement source: (string (string_fragment) @specifier)) @reexport
(call_expression function: (import) arguments: (arguments . (string (string_fragment) @specifier))) @dynamic
(call_expression function: (identifier) @fn arguments: (arguments . (string (string_fragment) @specifier)) (#eq? @fn "require")) @require
`,
  python: `
(import_statement) @import
(import_from_statement) @from
`,
}

// A function-valued declarator is a definition anywhere; any other declarator only at module or namespace scope, so
// locals inside bodies do not flood the outline.
const SCOPES = new Set(["program", "export_statement", "statement_block", "module"])

function definitions(query: Query, root: Node, grammar: Grammar) {
  const found = new Map<number, { node: Node; name: Node; kind: string }>()
  query.matches(root).forEach((match) => {
    const definition = match.captures.find((capture) => capture.name.startsWith("definition."))
    const name = match.captures.find((capture) => capture.name === "name")
    if (!definition || !name) return
    const kind = definition.name.slice("definition.".length)
    // Upstream and EXTRA can both match one declarator; the upstream kind (function) wins over constant.
    if (found.has(definition.node.id) && kind === "constant") return
    if (kind === "constant" && grammar !== "python" && !constantInScope(definition.node)) return
    found.set(definition.node.id, { node: definition.node, name: name.node, kind: kind === "constant" ? declarationKind(definition.node) : kind })
  })
  const ordered = [...found.values()].toSorted((a, b) => a.node.startIndex - b.node.startIndex || b.node.endIndex - a.node.endIndex)
  const index = new Map(ordered.map((item, position) => [item.node.id, position]))
  const result: Definition[] = []
  ordered.forEach((item) => {
    const container = enclosing(item.node, index)
    const parent = container === undefined ? undefined : result[container]
    const range = span(item.node)
    result.push({
      name: item.name.text,
      qualified: parent ? `${parent.qualified}.${item.name.text}` : item.name.text,
      kind: parent && ["class", "interface"].includes(parent.kind) && item.kind === "function" ? "method" : item.kind,
      startLine: range.start,
      endLine: range.end,
      nameLine: item.name.startPosition.row + 1,
      exported: exported(item.node, item.name.text, parent, root, grammar),
      ...(container === undefined ? {} : { container }),
    })
  })
  return result
}

// The innermost definition whose node is an ancestor; ancestors start earlier, so they are already in the result.
function enclosing(node: Node, index: Map<number, number>) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const position = index.get(parent.id)
    if (position !== undefined) return position
  }
  return undefined
}

function constantInScope(declarator: Node) {
  const value = declarator.childForFieldName("value")?.type
  if (value === "arrow_function" || value === "function_expression") return true
  const declaration = declarator.parent
  const scope = declaration?.parent
  if (!scope || !SCOPES.has(scope.type)) return false
  return scope.type !== "statement_block" || scope.parent?.type === "internal_module"
}

function declarationKind(declarator: Node) {
  if (declarator.type !== "variable_declarator") return "constant"
  const keyword = declarator.parent?.child(0)?.text
  return keyword === "let" || keyword === "var" ? "variable" : "const"
}

// Ranges are 1-based and closed. A decorated or exported declaration starts at its wrapper; an end at column 0
// belongs to the previous line.
function span(node: Node) {
  const declarator = node.type === "variable_declarator" ? (node.parent ?? node) : node
  const outer = ["export_statement", "decorated_definition"].includes(declarator.parent?.type ?? "") ? declarator.parent! : declarator
  const end = outer.endPosition.column === 0 && outer.endPosition.row > outer.startPosition.row ? outer.endPosition.row : outer.endPosition.row + 1
  return { start: outer.startPosition.row + 1, end }
}

function exported(node: Node, name: string, parent: Definition | undefined, root: Node, grammar: Grammar) {
  if (grammar === "python") return !name.startsWith("_") && (!parent || (parent.exported && parent.kind === "class"))
  if (parent) return parent.exported && !name.startsWith("#") && !node.text.startsWith("private ") && ["class", "interface", "namespace", "module"].includes(parent.kind)
  const declaration = node.type === "variable_declarator" ? node.parent : node
  if (declaration?.parent?.type === "export_statement") return true
  return localExports(root).has(name)
}

// `export { a, b as c }` without a source exports local names.
const exportClauses = new WeakMap<Node, Set<string>>()
function localExports(root: Node) {
  const cached = exportClauses.get(root)
  if (cached) return cached
  const names = new Set(root.namedChildren.flatMap((node) => {
    if (node?.type !== "export_statement" || node.childForFieldName("source")) return []
    return node.descendantsOfType("export_specifier").flatMap((specifier) => specifier?.childForFieldName("name")?.text ?? [])
  }))
  exportClauses.set(root, names)
  return names
}

function scriptImports(query: Query, root: Node) {
  return query.matches(root).flatMap((match): Import[] => {
    const specifier = match.captures.find((capture) => capture.name === "specifier")
    const statement = match.captures.find((capture) => ["import", "reexport", "dynamic", "require"].includes(capture.name))
    if (!specifier || !statement) return []
    const form = statement.name === "import" ? "static" : (statement.name as Import["form"])
    return [{ specifier: specifier.node.text, line: statement.node.startPosition.row + 1, form, names: importNames(statement.node) }]
  })
}

function importNames(node: Node) {
  if (node.type === "call_expression") return []
  const namespace = node.descendantsOfType(["namespace_import", "namespace_export"]).flatMap((item) => item?.namedChildren.find((child) => child?.type === "identifier")?.text ?? [])
  const named = node.descendantsOfType(["import_specifier", "export_specifier"]).flatMap((item) => item?.childForFieldName("name")?.text ?? [])
  const clause = node.namedChildren.find((child) => child?.type === "import_clause")
  const fallback = clause?.namedChildren.filter((child) => child?.type === "identifier").map((child) => child!.text) ?? []
  return [...fallback, ...namespace, ...named]
}

function pythonImports(query: Query, root: Node) {
  return query.matches(root).flatMap((match): Import[] => {
    const node = match.captures[0]?.node
    if (!node) return []
    const line = node.startPosition.row + 1
    const module = node.childForFieldName("module_name")
    const names = node.namedChildren.flatMap((child) => {
      if (!child || child.id === module?.id) return []
      if (child.type === "aliased_import") return child.childForFieldName("name")?.text ?? []
      return ["dotted_name", "identifier"].includes(child.type) ? [child.text] : []
    })
    if (node.type === "import_statement") return names.map((name) => ({ specifier: name, line, form: "static" as const, names: [] }))
    return module ? [{ specifier: module.text, line, form: "static" as const, names }] : []
  })
}

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  return fileURLToPath(new URL(asset, import.meta.url))
}

const grammars = lazy(async () => {
  const { Parser, Language, Query } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, { with: { type: "wasm" } })
  const { default: typescriptWasm } = await import("tree-sitter-typescript/tree-sitter-typescript.wasm" as string, { with: { type: "wasm" } })
  const { default: tsxWasm } = await import("tree-sitter-typescript/tree-sitter-tsx.wasm" as string, { with: { type: "wasm" } })
  const { default: pythonWasm } = await import("tree-sitter-python/tree-sitter-python.wasm" as string, { with: { type: "wasm" } })
  // Upstream tree-sitter.json composes the TypeScript tags from its own file plus the JavaScript one.
  const { default: typescriptTags } = await import("tree-sitter-typescript/queries/tags.scm" as string, { with: { type: "text" } })
  const { default: javascriptTags } = await import("tree-sitter-javascript/queries/tags.scm" as string, { with: { type: "text" } })
  const { default: pythonTags } = await import("tree-sitter-python/queries/tags.scm" as string, { with: { type: "text" } })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({ locateFile: () => treePath })
  const [typescript, tsx, python] = await Promise.all([typescriptWasm, tsxWasm, pythonWasm].map((asset) => Language.load(resolveWasm(asset))))
  const entry = (language: Language, tags: string, imports: string) => {
    const parser: Parser = new Parser()
    parser.setLanguage(language)
    return { parser, tags: new Query(language, tags), imports: new Query(language, imports) }
  }
  const scriptTags = `${typescriptTags}\n${javascriptTags}\n${EXTRA.script}`
  return {
    typescript: entry(typescript, scriptTags, IMPORTS.script),
    tsx: entry(tsx, scriptTags, IMPORTS.script),
    python: entry(python, `${pythonTags}\n${EXTRA.python}`, IMPORTS.python),
  }
})
