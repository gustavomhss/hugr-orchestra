export * as CodeIndex from "./types"

import { Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { NonNegativeInt, PositiveInt, optional } from "@orchestra/schema/schema"

// J2 (index and code_query) and J3 (code_search, code_locate). Lines are original-file coordinates, 1-based and
// closed (JI-3); columns are UTF-16 units, the encoding SCIP declares for TypeScript.

export type Range = { readonly path: string; readonly startLine: number; readonly endLine: number }
export type SymbolRef = {
  readonly symbol: string
  readonly name: string
  readonly kind: string
  readonly range: Range
  readonly nameLine: number
  readonly exported: boolean
}

const name = Schema.NonEmptyString.check(Schema.isMaxLength(1024))
const file = Schema.NonEmptyString.check(Schema.isMaxLength(8192))
const page = { limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(200))), offset: optional(NonNegativeInt) }
const target = {
  // A short ("assemble") or qualified ("DiscoveryResult.assemble") name; path narrows the definition to one file.
  name: optional(name),
  path: optional(file),
  symbol: optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
  at: optional(Schema.Struct({ path: file, line: PositiveInt, column: optional(PositiveInt) })),
}

export const CodeQuery = Schema.Union([
  Schema.Struct({ op: Schema.Literal("definition"), ...target }),
  Schema.Struct({ op: Schema.Literals(["references", "callers", "callees", "implementations"]), ...target, ...page }),
  Schema.Struct({ op: Schema.Literals(["imports", "importers"]), path: file, ...page }),
  Schema.Struct({
    op: Schema.Literal("symbols"), path: optional(file), name: optional(name), kind: optional(name),
    exported: optional(Schema.Boolean), ...page,
  }),
  Schema.Struct({ op: Schema.Literal("map"), path: optional(file), depth: optional(PositiveInt), ...page }),
])
export type CodeQuery = typeof CodeQuery.Type

/** The six dimensions every seat tool returns beside its findings (JT.1). */
export type Basis = {
  readonly basis: {
    readonly commit: string
    readonly dirtyDigest?: string
    readonly shards: ReadonlyArray<{
      readonly id: string
      readonly language: string
      readonly project: string
      readonly indexer: string
      readonly version: string
    }>
  }
  readonly execution: { readonly op: string; readonly ms: number; readonly semantic?: "absent" | "present" }
  readonly coverage: {
    readonly documents: number
    readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>
    readonly languagesMissing: ReadonlyArray<string>
    readonly opaqueSites: number
    readonly complete: boolean
    /** code_search: whether .gitignore was respected and how many binaries were skipped (J3.3). */
    readonly ignoreRespected?: boolean
    readonly binariesSkipped?: number
    /** code_locate: ranges dropped by verification against current content (J3.5 step 4). */
    readonly discarded?: number
  }
  readonly freshness: "fresh" | "stale" | "dirty-overlay"
  readonly bounds: { readonly limit: number; readonly truncated: boolean }
}

export type Hit = {
  readonly range: Range
  readonly role: "definition" | "reference" | "import" | "write" | "call"
  readonly via?: SymbolRef
  readonly sites?: ReadonlyArray<number>
  readonly opaque?: boolean
}

export type CodeQueryResult = {
  /** Undefined when the name is ambiguous or absent; candidates then holds at most 20. */
  readonly resolved: SymbolRef | undefined
  readonly candidates: ReadonlyArray<SymbolRef>
  readonly hits: ReadonlyArray<Hit>
  readonly next?: number
  readonly basis: Basis
}

export const SearchInput = Schema.Struct({
  pattern: Schema.NonEmptyString.check(Schema.isMaxLength(512)),
  mode: optional(Schema.Literals(["literal", "regex", "identifier"])),
  paths: optional(Schema.Array(file).check(Schema.isMaxLength(16))),
  caseSensitive: optional(Schema.Boolean),
  context: optional(NonNegativeInt.check(Schema.isLessThanOrEqualTo(5))),
  ...page,
})
export type SearchInput = typeof SearchInput.Type

export type SearchMatch = {
  readonly path: string
  readonly line: number
  readonly text: string
  readonly before?: ReadonlyArray<string>
  readonly after?: ReadonlyArray<string>
  /** The index symbol containing the line, when an index is available. */
  readonly enclosing?: SymbolRef
}

export type SearchResult = { readonly matches: ReadonlyArray<SearchMatch>; readonly next?: number; readonly basis: Basis }

const terms = Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(512))).check(Schema.isMaxLength(16))
/** At least one of question, terms or symbols; the host checks it, since a struct schema cannot. */
export const LocateInput = Schema.Struct({
  question: optional(Schema.NonEmptyString.check(Schema.isMaxLength(2000))),
  terms: optional(terms),
  symbols: optional(terms),
  paths: optional(Schema.Array(file).check(Schema.isMaxLength(16))),
  limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(40))),
})
export type LocateInput = typeof LocateInput.Type

export type LocateResult = {
  readonly ranges: ReadonlyArray<Range & { readonly symbol?: string; readonly why: ReadonlyArray<string>; readonly score: number }>
  readonly searches: ReadonlyArray<{
    readonly kind: "lexical" | "lexical-wide" | "definition" | "neighbors"
    readonly query: string
    readonly hits: number
    readonly truncated: boolean
  }>
  /** One retained snapshot holding the lines of every range (origin file, original coordinates). */
  readonly evidence: Research.SourceRef
  readonly basis: Basis
}

/**
 * Per-shard SQLite schema (J2). `layer` 1 = SCIP and tree-sitter, 2 = tree-sitter only; `role` is a bit set (Role).
 * `symbol.tokens` holds the name's camelCase/snake_case parts: the external-content FTS table reads it from `symbol`.
 */
export const SCHEMA = `
CREATE TABLE document   (path TEXT PRIMARY KEY, language TEXT NOT NULL, sha256 TEXT NOT NULL, lines INTEGER NOT NULL,
                         layer INTEGER NOT NULL);
CREATE TABLE symbol     (id INTEGER PRIMARY KEY, scip TEXT UNIQUE, name TEXT NOT NULL, kind TEXT NOT NULL,
                         path TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL,
                         name_line INTEGER NOT NULL, exported INTEGER NOT NULL, container_id INTEGER, tokens TEXT NOT NULL);
CREATE TABLE occurrence (symbol_id INTEGER NOT NULL, path TEXT NOT NULL, line INTEGER NOT NULL, col INTEGER NOT NULL,
                         end_line INTEGER NOT NULL, end_col INTEGER NOT NULL,
                         role INTEGER NOT NULL, enclosing_id INTEGER, opaque INTEGER NOT NULL);
CREATE TABLE relation   (symbol_id INTEGER NOT NULL, target_id INTEGER NOT NULL, kind TEXT NOT NULL);
CREATE TABLE import     (from_path TEXT NOT NULL, line INTEGER NOT NULL, specifier TEXT NOT NULL, to_path TEXT,
                         kind TEXT NOT NULL);
CREATE TABLE file_rank  (path TEXT PRIMARY KEY, rank REAL NOT NULL, loc INTEGER NOT NULL, bytes INTEGER NOT NULL);
CREATE VIRTUAL TABLE symbol_name USING fts5(name, tokens, content='symbol', content_rowid='id');
CREATE TABLE meta       (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

export const Role = Object.freeze({ definition: 1, reference: 2, import: 4, write: 8 })
export const ImportKind = ["relative", "alias", "workspace", "package", "unresolved"] as const
export const RelationKind = ["implementation", "type_definition"] as const
/** Keys of the meta table; `skipped` holds JSON. */
export const MetaKey = ["shardKey", "commit", "indexer", "version", "skipped"] as const
