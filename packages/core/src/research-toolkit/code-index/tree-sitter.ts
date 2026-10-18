export * as CodeIndexTreeSitter from "./tree-sitter"

import { fileURLToPath } from "url"
import { Effect } from "effect"
import type { Language, Node, Parser, Query } from "web-tree-sitter"
import { lazy } from "../../util/lazy"
import type { Grammar } from "./filter"

// The structural layer (J2.5), transplanted from the HuGR techlead onboard/extract.ts (a68e7af, MIT) by way of
// Arsenal onboard/extract.ts: 1-based lines per symbol and per import, the TS and Python import walks, and the
// graceful fallback, which here names its reason instead of returning an empty success. Changes: web-tree-sitter wasm
// (loaded as in O/tool/shell/scan.ts) instead of the native addon; definitions from the grammars' upstream tags.scm
// plus EXTRA for the techlead declaration kinds tags.scm omits (type, enum, const) and for members; closed ranges and
// containers; re-exports, dynamic imports and require; a byte cap reported as a reason.

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
  readonly coverage: {
    readonly complete: boolean
    readonly reason?: "partial-parse" | "too-large" | "parser-unavailable"
    readonly detail?: string
  }
}

export const extract = Effect.fn("CodeIndexTreeSitter.extract")(function* (path: string, source: string, grammar: Grammar) {
  const lines = source.length === 0 ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0)
  if (Buffer.byteLength(source) > MAX_BYTES)
    return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "too-large" } } satisfies Extract
  // The wasm runtime and grammar load are the genuinely fallible boundary; the pipeline survives them with a reason.
  const loaded = yield* Effect.promise(() => grammars().then(
    (value) => ({ value }),
    (cause: unknown) => ({ detail: cause instanceof Error ? cause.message : String(cause) }),
  ))
  if (!("value" in loaded))
    return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "parser-unavailable", detail: loaded.detail } } satisfies Extract
  const entry = loaded.value[grammar]
  const tree = entry.parser.parse(source)
  if (!tree) return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "partial-parse" } } satisfies Extract
  const result = {
    path,
    lines,
    definitions: definitions(entry.tags, tree.rootNode, grammar),
    imports: entry.calls ? scriptImports(entry.calls, tree.rootNode) : pythonImports(tree.rootNode),
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

// Static imports and re-exports are top-level statements (the techlead walk); calls can sit anywhere.
const CALL_IMPORTS = `
(call_expression function: (import) arguments: (arguments . (string (string_fragment) @specifier))) @dynamic
(call_expression function: (identifier) @fn arguments: (arguments . (string (string_fragment) @specifier)) (#eq? @fn "require")) @require
`

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

function scriptImports(calls: Query, root: Node) {
  const statements = root.namedChildren.flatMap((node): Import[] => {
    if (node?.type !== "import_statement" && node?.type !== "export_statement") return []
    const source = node.childForFieldName("source") ?? node.namedChildren.find((child) => child?.type === "string")
    if (!source) return []
    const form = node.type === "import_statement" ? "static" : "reexport"
    return [{ specifier: stripQuotes(source.text), line: node.startPosition.row + 1, form, names: importNames(node) }]
  })
  const dynamic = calls.matches(root).flatMap((match): Import[] => {
    const specifier = match.captures.find((capture) => capture.name === "specifier")
    const call = match.captures.find((capture) => capture.name === "dynamic" || capture.name === "require")
    if (!specifier || !call) return []
    return [{ specifier: specifier.node.text, line: call.node.startPosition.row + 1, form: call.name as "dynamic" | "require", names: [] }]
  })
  return [...statements, ...dynamic].toSorted((a, b) => a.line - b.line)
}

// Default, namespace and named bindings of an import clause; for `export ... from`, the exported names.
function importNames(node: Node) {
  const clause = node.namedChildren.find((child) => child?.type === "import_clause" || child?.type === "export_clause" || child?.type === "namespace_export")
  if (!clause) return []
  if (clause.type === "namespace_export") return clause.namedChildren.flatMap((child) => (child?.type === "identifier" ? [child.text] : []))
  return clause.namedChildren.flatMap((child) => {
    if (!child) return []
    if (child.type === "identifier") return [child.text]
    if (child.type === "namespace_import") return child.namedChildren.flatMap((id) => (id?.type === "identifier" ? [id.text] : []))
    if (child.type === "export_specifier") return child.childForFieldName("name")?.text ?? []
    return child.namedChildren.flatMap((spec) => (spec?.type === "import_specifier" ? (spec.childForFieldName("name")?.text ?? []) : []))
  })
}

function stripQuotes(text: string) {
  return text.replace(/^['"`]|['"`]$/g, "")
}

function pythonImports(root: Node) {
  return root.namedChildren.flatMap((node): Import[] => {
    if (!node) return []
    const line = node.startPosition.row + 1
    if (node.type === "import_from_statement") {
      const module = node.childForFieldName("module_name")
      const names = node.namedChildren.flatMap((child) => {
        if (!child || child.id === module?.id) return []
        if (child.type === "aliased_import") return child.childForFieldName("name")?.text ?? []
        return child.type === "dotted_name" || child.type === "identifier" ? [child.text] : []
      })
      return module ? [{ specifier: module.text, line, form: "static", names }] : []
    }
    if (node.type !== "import_statement") return []
    // `import a, b.c as d`: one import per module, with no names.
    return node.namedChildren.flatMap((child) => {
      if (!child) return []
      const module = child.type === "aliased_import" ? child.childForFieldName("name") : child.type === "dotted_name" ? child : undefined
      return module ? [{ specifier: module.text, line, form: "static" as const, names: [] }] : []
    })
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
  const entry = (language: Language, tags: string, calls?: string) => {
    const parser: Parser = new Parser()
    parser.setLanguage(language)
    return { parser, tags: new Query(language, tags), calls: calls ? new Query(language, calls) : undefined }
  }
  const scriptTags = `${typescriptTags}\n${javascriptTags}\n${EXTRA.script}`
  return {
    typescript: entry(typescript, scriptTags, CALL_IMPORTS),
    tsx: entry(tsx, scriptTags, CALL_IMPORTS),
    python: entry(python, `${pythonTags}\n${EXTRA.python}`),
  }
})
