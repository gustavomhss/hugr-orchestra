import { Schema } from "effect"
import { CST, isAlias, isMap, isPair, isScalar, isSeq, Lexer, Parser, parseDocument } from "yaml"

export const limits = {
  sourceBytes: 1024 * 1024, aliases: 100, depth: 64, nodes: 50_000, lexemes: 200_000, trivia: 1024,
  resolutions: 4096, merges: 20_000, diagnostics: 32, diagnosticLength: 256,
}
const isJson = Schema.is(Schema.Json)

export function diagnostics() {
  const items: string[] = []
  const severity = { partial: false, unresolved: false }
  return {
    items,
    work: { lexemes: 0, triviaPeak: 0, parserNext: 0, parserEnd: 0, cstNodes: 0, compositions: 0, resolutions: 0, merges: 0 },
    add(kind: "partial" | "unresolved", message: string, critical = false) {
      severity[kind] = true
      if (critical && items.length >= limits.diagnostics - 1) {
        items[limits.diagnostics - 1] = `source_${kind}:${message}; diagnostics_truncated`.slice(0, limits.diagnosticLength)
        return
      }
      if (items.length < limits.diagnostics - 1) {
        items.push(`source_${kind}:${message}`.slice(0, limits.diagnosticLength))
        return
      }
      if (items.length === limits.diagnostics - 1) items.push("source_partial:diagnostics_truncated")
    },
    state(): "complete" | "partial" | "unresolved" {
      return severity.unresolved ? "unresolved" : severity.partial ? "partial" : "complete"
    },
  }
}
export type Diagnostics = ReturnType<typeof diagnostics>

export function read(text: string, provider: "github" | "gitlab", report: Diagnostics): {
  value: Schema.JsonObject; references: string[][]; header?: Schema.JsonObject
} | undefined {
  if (text.length > limits.sourceBytes || new TextEncoder().encode(text).length > limits.sourceBytes) {
    report.add("unresolved", "source_limit:maximum 1048576 UTF-8 bytes")
    return
  }
  // YAML conversion can throw for unresolved aliases or expansion limits; contain that library boundary.
  try {
    const documents = preflight(text, provider, report)
    if (!documents) return
    const parsed = documents.map((document, index) => compose(
      text.slice(index === 0 ? 0 : document.offset, documents[index + 1]?.offset ?? text.length), provider, report,
      index === 0 ? 0 : document.offset,
    ))
    if (parsed.some((document) => document === undefined)) return
    const first = parsed[0]
    if (!first) {
      report.add("unresolved", "unsafe_document:expected finite JSON mapping")
      return
    }
    if (provider === "github") return first
    if (parsed.length === 1 && first.value.spec === undefined) return first
    if (Object.keys(first.value).some((key) => key !== "spec") || !object(first.value.spec)
      || first.value.spec.inputs !== undefined && !object(first.value.spec.inputs)) {
      report.add("unresolved", "gitlab_header_invalid:expected isolated spec header")
      return
    }
    const body = parsed[1]
    if (body && !documents[1].start.some((token) => token.type === "doc-start") || body?.value.spec !== undefined) {
      report.add("unresolved", "gitlab_header_invalid:expected --- then one body without spec")
      return
    }
    return { value: body?.value ?? {}, references: body?.references ?? [], header: first.value }
  } catch (error) {
    const alias = error instanceof ReferenceError
    report.add("unresolved", alias ? "yaml_alias:unresolved or excessive alias expansion" : "yaml_conversion:invalid or excessive structure")
  }
}

function preflight(text: string, provider: "github" | "gitlab", report: Diagnostics) {
  const lexemes: string[] = []
  const counts = { aliases: 0, trivia: 0, scalar: false, offset: 0 }
  const lexical = new Lexer().lex(text)
  // Precheck the entire Lexer stream before either Parser or parseDocument can scan pending trivia.
  // 1024 trivia lexemes allow substantial comment blocks while bounding the library's quadratic prefix scans.
  while (true) {
    const next = lexical.next()
    if (next.done) break
    if (++report.work.lexemes > limits.lexemes) {
      report.add("unresolved", "precomposition_limit:maximum 200000 lexemes and depth 64")
      return
    }
    // A SCALAR marker owns the next lexeme, even when block/plain scalar data starts with whitespace or '#'.
    const payload = counts.scalar
    const type = payload ? null : CST.tokenType(next.value)
    counts.scalar = !payload && next.value === CST.SCALAR
    counts.trivia = type === "space" || type === "newline" || type === "comment" ? counts.trivia + 1 : 0
    report.work.triviaPeak = Math.max(report.work.triviaPeak, counts.trivia)
    if (counts.trivia > limits.trivia) {
      report.add("unresolved", `trivia_limit:maximum 1024 consecutive trivia lexemes; offset ${counts.offset}`)
      return
    }
    if (type === "alias" && ++counts.aliases > limits.aliases) {
      report.add("unresolved", "alias_limit:maximum 100 aliases")
      return
    }
    if (payload || type !== "scalar" && type !== "doc-mode" && type !== "flow-error-end") counts.offset += next.value.length
    lexemes.push(next.value)
  }
  const parser = new Parser()
  const documents: CST.Document[] = []
  const receive = (token: CST.Token) => {
    if (token.type === "document") documents.push(token)
    if (documents.length > (provider === "github" ? 1 : 2)) {
      report.add("unresolved", "yaml_MULTIPLE_DOCS:only GitLab spec header plus one body supported")
      return false
    }
    return true
  }
  if (!lexemes.every((lexeme) => {
    if (parser.stack.length > limits.depth + 2) {
      report.add("unresolved", "precomposition_limit:maximum 200000 lexemes and depth 64")
      return false
    }
    ++report.work.parserNext
    return Array.from(parser.next(lexeme)).every(receive)
  })) return
  ++report.work.parserEnd
  if (!Array.from(parser.end()).every(receive)) return
  const pending = documents.flatMap((document) => document.value ? [{ token: document.value, depth: 0 }] : [])
  while (pending.length) {
    const entry = pending.pop()
    if (!entry) break
    if (++report.work.cstNodes > limits.nodes || entry.depth > limits.depth) {
      report.add("unresolved", "precomposition_limit:maximum depth 64 and 50000 CST nodes")
      return
    }
    if (entry.token.type === "block-map" || entry.token.type === "block-seq" || entry.token.type === "flow-collection") {
      const mapping = entry.token.type === "block-map" || entry.token.type === "flow-collection" && entry.token.start.type === "flow-map-start"
      if (!entry.token.items.every((item) => {
        if (mapping && (item.key || item.sep) && (!item.key || !CST.isScalar(item.key))) {
          report.add("unresolved", "yaml_KEY_TYPE:CI mapping keys must be scalar strings, not aliases or collections")
          return false
        }
        if ((item.key || item.value) && ++report.work.cstNodes > limits.nodes) {
          report.add("unresolved", "precomposition_limit:maximum depth 64 and 50000 CST nodes")
          return false
        }
        if (item.key) pending.push({ token: item.key, depth: entry.depth + 1 })
        if (item.value) pending.push({ token: item.value, depth: entry.depth + 1 })
        return true
      })) return
    }
  }
  return documents
}

function compose(text: string, provider: "github" | "gitlab", report: Diagnostics, offset: number) {
  ++report.work.compositions
  // Library uniqueKeys uses an O(n²) scan. Validate decoded string keys with per-map Sets below.
  const document = parseDocument(text, {
    version: "1.2", schema: "core", uniqueKeys: false, stringKeys: true, prettyErrors: false,
    resolveKnownTags: false, merge: provider === "gitlab", logLevel: "error",
  })
  document.errors.forEach((error) => report.add("unresolved", `yaml_${error.code}:offset ${offset + error.pos[0]}`))
  if (document.errors.length) return
  if (document.directives.yaml.version !== "1.2") {
    report.add("unresolved", "yaml_version:only YAML 1.2 supported")
    return
  }
  document.warnings.forEach((warning) => report.add("partial", `yaml_${warning.code}:offset ${offset + warning.pos[0]}`))
  const references: string[][] = []
  const pending: { node: unknown; depth: number; path: string[] }[] = [{ node: document.contents, depth: 0, path: [] }]
  const counts = { nodes: 0, aliases: 0 }
  while (pending.length) {
    const entry = pending.pop()
    if (!entry) break
    if (++counts.nodes > limits.nodes || entry.depth > limits.depth) {
      report.add("unresolved", "structure_limit:maximum depth 64 and 50000 nodes")
      return
    }
    if (isAlias(entry.node) && ++counts.aliases > limits.aliases) {
      report.add("unresolved", "alias_limit:maximum 100 aliases")
      return
    }
    if (isAlias(entry.node)) {
      const target = entry.node.resolve(document)
      if (target) pending.push({ node: target, depth: entry.depth, path: entry.path })
    }
    if (isPair(entry.node)) {
      if (isScalar(entry.node.key) && ["__proto__", "constructor", "prototype"].includes(String(entry.node.key.value))) {
        report.add("unresolved", "unsafe_key:prototype-sensitive mapping key")
        return
      }
      const key = isScalar(entry.node.key) ? String(entry.node.key.value) : ""
      pending.push({ node: entry.node.key, depth: entry.depth, path: entry.path }, {
        node: entry.node.value, depth: entry.depth, path: [...entry.path, key],
      })
    }
    if (isMap(entry.node) || isSeq(entry.node)) {
      if (isMap(entry.node)) {
        const keys = new Set<string>()
        if (!entry.node.items.every((pair) => {
          if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
            report.add("unresolved", "yaml_KEY_TYPE:CI mapping keys must be scalar strings")
            return false
          }
          if (keys.has(pair.key.value)) {
            report.add("unresolved", `yaml_DUPLICATE_KEY:offset ${offset + (pair.key.range?.[0] ?? 0)}`)
            return false
          }
          keys.add(pair.key.value)
          return true
        })) return
      }
      if (entry.node.tag === "!reference" && provider === "gitlab") references.push(entry.path)
      if (entry.node.tag && !["tag:yaml.org,2002:map", "tag:yaml.org,2002:seq"].includes(entry.node.tag)
        && !(provider === "gitlab" && entry.node.tag === "!reference")) {
        report.add("unresolved", "unsafe_tag:unsupported collection tag")
        return
      }
      entry.node.items.forEach((node, index) => pending.push({
        node, depth: entry.depth + 1, path: isSeq(entry.node) ? [...entry.path, String(index)] : entry.path,
      }))
    }
    if (isScalar(entry.node) && entry.node.tag && ![
      "tag:yaml.org,2002:str", "tag:yaml.org,2002:int", "tag:yaml.org,2002:float",
      "tag:yaml.org,2002:bool", "tag:yaml.org,2002:null",
    ].includes(entry.node.tag)) {
      report.add("unresolved", "unsafe_tag:unsupported scalar tag")
      return
    }
  }
  const value: unknown = document.toJS({ maxAliasCount: limits.aliases })
  const visited = { nodes: 0 }
  if (!safeJson(value, new Set(), 0, visited) || !isJson(value) || !object(value)) {
    report.add("unresolved", "unsafe_document:expected finite JSON mapping without cycles or unsafe keys")
    return
  }
  return { value, references }
}

function safeJson(value: unknown, ancestors: Set<object>, depth: number, count: { nodes: number }): boolean {
  if (++count.nodes > limits.nodes || depth > limits.depth) return false
  if (value === null || typeof value === "string" || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value !== "object" || ancestors.has(value)) return false
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false
  if (Object.keys(value).some((key) => ["__proto__", "constructor", "prototype"].includes(key))) return false
  ancestors.add(value)
  const safe = Object.values(value).every((child: unknown) => safeJson(child, ancestors, depth + 1, count))
  ancestors.delete(value)
  return safe
}

export function object(value: Schema.Json | undefined): value is Schema.JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
}

export function strings(value: Schema.Json | undefined): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string" && entry.length > 0)
}

export function expression(value: Schema.Json | undefined): boolean {
  if (typeof value === "string") return value.includes("${{")
  if (Array.isArray(value)) return value.some((child) => expression(child))
  return object(value) && Object.values(value).some((child) => expression(child))
}

export function inputExpression(value: Schema.Json | undefined): boolean {
  if (typeof value === "string") return value.includes("$[[")
  if (Array.isArray(value)) return value.some((child) => inputExpression(child))
  return object(value) && Object.values(value).some((child) => inputExpression(child))
}

export function condition(value: Schema.Json | undefined, path: string, report: Diagnostics) {
  if (value === undefined) return
  if (typeof value === "string") return value
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  report.add("unresolved", `condition_invalid:${path}`)
}
