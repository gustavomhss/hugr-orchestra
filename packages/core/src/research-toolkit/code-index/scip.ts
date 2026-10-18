export * as Scip from "./scip"

import path from "path"
import { readFileSync, statSync } from "fs"
import { deserializeSCIP, SymbolRole } from "@c4312/scip"
import { Role } from "./types"

// T-X1: the SCIP reader, transplanted from Atlas `adapter-io/src/scip.ts:95-160`. Atlas projects a dump down to
// (symbol, definition|reference); the index needs ranges, roles, enclosing ranges and relationships, so this
// projection keeps them. Every range is converted once, here, from SCIP's 0-based half-open form to the index's
// 1-based closed lines and columns (UTF-16 units, the encoding scip-typescript declares).

/** 1-based, closed. A zero-width SCIP range (a file module definition) has `endCol = startCol - 1`. */
export type Span = { readonly startLine: number; readonly startCol: number; readonly endLine: number; readonly endCol: number }

export type Occurrence = Span & {
  readonly symbol: string
  /** Bit set of `Role`: definition, or reference plus the import and write bits. */
  readonly role: number
  /** The definition's full syntax range, when the indexer emits one (scip-typescript does for most declarations). */
  readonly enclosingRange?: Span
}

export type Relationship = {
  readonly symbol: string
  readonly implementation: boolean
  readonly typeDefinition: boolean
  readonly reference: boolean
  readonly definition: boolean
}

export type SymbolInfo = {
  readonly symbol: string
  readonly kind: number
  readonly displayName: string
  readonly relationships: ReadonlyArray<Relationship>
}

export type Document = {
  /** Repository-relative POSIX path: the dump's `relativePath` under the `prefix` the caller passed. */
  readonly path: string
  readonly language: string
  readonly occurrences: ReadonlyArray<Occurrence>
  readonly symbols: ReadonlyArray<SymbolInfo>
}

export type Index = {
  readonly indexer: { readonly name: string; readonly version: string } | undefined
  readonly documents: ReadonlyArray<Document>
  /** Occurrences dropped because their range was malformed; a coverage fact, never silently zero. */
  readonly malformed: number
}

/**
 * The raw decode, memoized per (path, mtime, size). `statSync` runs on every call and a changed mtime or size
 * forces a fresh decode. What the key cannot see: a rewrite on the same mtime tick with the same byte length
 * serves the old decode, because (mtime, size) is a proxy for content. Atlas reproduced that collision with
 * `utimesSync`. Shard dumps here are written once under a content key (J2.2) and never rewritten in place, so the
 * collision needs a caller that rewrites a dump in place mid-process; such a caller must hash the bytes or bypass
 * the memo. A throw (missing, not a regular file, corrupt protobuf) is never cached.
 *
 * The regular-file check is the guard: `readFileSync` on a character device such as `/dev/zero` never returns, and
 * no `catch` can see a read that does not return. A symlink to a real dump stays supported, since `statSync`
 * follows links; a device, FIFO, socket or directory target is refused before any byte is read.
 */
const memo = new Map<string, { readonly mtimeMs: number; readonly size: number; readonly raw: ReturnType<typeof deserializeSCIP> }>()

export function decodeScipCached(file: string) {
  const stat = statSync(file)
  if (!stat.isFile()) throw new Error(`scip: '${file}' is not a regular file, so it is not an indexer dump`)
  const cached = memo.get(file)
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.raw
  const raw = deserializeSCIP(readFileSync(file))
  memo.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, raw })
  return raw
}

/** Read one dump. `prefix` is the project directory relative to the repository root (the indexer's cwd). */
export function readScip(file: string, options?: { readonly prefix?: string }): Index {
  const raw = decodeScipCached(file)
  const prefix = options?.prefix ?? ""
  const documents = raw.documents.map((doc) => {
    const occurrences = doc.occurrences.flatMap((occ) => {
      const range = span(occ.range)
      if (!range) return []
      const enclosingRange = span(occ.enclosingRange)
      return [{ ...range, symbol: occ.symbol, role: role(occ.symbolRoles), ...(enclosingRange ? { enclosingRange } : {}) }]
    })
    return {
      path: path.posix.join(prefix, doc.relativePath.replaceAll("\\", "/")),
      language: doc.language,
      occurrences,
      symbols: doc.symbols.map((info) => ({
        symbol: info.symbol,
        kind: info.kind,
        displayName: info.displayName,
        relationships: info.relationships.map((rel) => ({
          symbol: rel.symbol,
          implementation: rel.isImplementation,
          typeDefinition: rel.isTypeDefinition,
          reference: rel.isReference,
          definition: rel.isDefinition,
        })),
      })),
    }
  })
  const tool = raw.metadata?.toolInfo
  return {
    indexer: tool ? { name: tool.name, version: tool.version } : undefined,
    documents,
    malformed: raw.documents.reduce((sum, doc) => sum + doc.occurrences.filter((occ) => !span(occ.range)).length, 0),
  }
}

/** `readScip`, degrading to an empty index when the dump is missing, not a regular file, or corrupt. */
export function readScipOrEmpty(file: string, options?: { readonly prefix?: string }): Index {
  try {
    return readScip(file, options)
  } catch {
    return { indexer: undefined, documents: [], malformed: 0 }
  }
}

/** The indexer name in the dump's metadata, or undefined on the same failures `readScipOrEmpty` absorbs. */
export function readScipIndexerName(file: string) {
  try {
    return decodeScipCached(file).metadata?.toolInfo?.name
  } catch {
    return undefined
  }
}

/** SCIP marks document-scoped symbols with the `local ` scheme. */
export function isLocalSymbol(symbol: string) {
  return symbol.startsWith("local ")
}

/**
 * The identifier of a symbol's last descriptor (`greet` for `.../greet().`, `name` for `...greet().(name)`), or
 * undefined for a local, a file module or an anonymous descriptor. Generalized from Atlas `scipName`
 * (`escape/target-escapes.ts:51-61`), which read only a single top-level descriptor.
 */
export function descriptorName(symbol: string) {
  if (isLocalSymbol(symbol) || symbol.endsWith("/")) return undefined
  const match = symbol.match(/(?:\(([^)]+)\)|\[([^\]]+)\]|(?:`((?:[^`]|``)+)`|([\w$+-]+))(?:\([^)]*\)\.|[#.:!]))$/)
  if (!match) return undefined
  return match[1] ?? match[2] ?? match[3]?.replaceAll("``", "`") ?? match[4]
}

function span(range: ReadonlyArray<number>): Span | undefined {
  if (range.length === 3) return { startLine: range[0] + 1, startCol: range[1] + 1, endLine: range[0] + 1, endCol: range[2] }
  if (range.length === 4) return { startLine: range[0] + 1, startCol: range[1] + 1, endLine: range[2] + 1, endCol: range[3] }
  return undefined
}

function role(bits: number) {
  if (bits & SymbolRole.Definition) return Role.definition
  return Role.reference | (bits & SymbolRole.Import ? Role.import : 0) | (bits & SymbolRole.WriteAccess ? Role.write : 0)
}
