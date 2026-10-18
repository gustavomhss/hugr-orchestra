export * as CodeIndexExtract from "./extract"

import { createHash } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Research } from "@orchestra/schema/research"
import { AppProcess } from "../../process"
import { ToolSafetySandbox } from "../../tool-safety-sandbox"
import { ResearchToolkit } from "../index"
import { IDS } from "../manifest"
import type { CodeIndexBuild } from "./build"
import { Callers } from "./callers"
import { Enclosing } from "./enclosing"
import { CodeIndexFilter } from "./filter"
import type { CodeIndexQuery } from "./query"
import { CodeIndexResolve } from "./resolve"
import { Scip } from "./scip"
import type { CodeIndexShard } from "./shard"
import type { CodeIndexStore } from "./store"
import { CodeIndexTreeSitter } from "./tree-sitter"
import { Role } from "./types"

// The real build path (J2.5): the pack's SCIP indexer runs confined through omni (AppProcess), X1 reads its dump, X2
// extracts the structural layer and resolves imports, X1 joins the two, and the result becomes X3's store content.
//
// Conventions at the X1 → X3 seam: X1 spans are 1-based and closed, so its `endCol` is SCIP's exclusive 0-based end;
// the store keeps 0-based UTF-16 start columns with exclusive ends (`query.ts` `at.column - 1`), so only the start
// column shifts. A global symbol referenced here but defined in no document of this shard still gets a row, with no
// definition path, so a query in another shard's scope joins its references by `scip`.
//
// Not stored: document-scoped `local N` symbols (their ids repeat across documents, and `symbol.scip` is unique),
// parameters, type parameters and file-module symbols. None of them is a definition a caller or an outline names.
// The indexer reads the worktree as it is on disk; files that differ from the commit are what the overlay re-reads.

/** The extraction X3's build runs per shard, and the overlay its queries run on dirty files, with services bound. */
export const make = Effect.gen(function* () {
  const proc = yield* AppProcess.Service
  return {
    extract: ((input) => shard(input).pipe(Effect.provideService(AppProcess.Service, proc))) satisfies CodeIndexBuild.Extract,
    overlay: ((input) => Effect.forEach(input.paths, (file) => outline(input.root, file), { concurrency: 8 })
      .pipe(Effect.map((files) => files.flatMap((file) => file ? [file] : [])))) satisfies CodeIndexQuery.Overlay,
  }
})

/**
 * The indexers a query may build with, per language, or the named blocker (J6.10). An absent pack still counts: the
 * first build acquires it through `ResearchToolkit.ensure`. The indexer only ever runs confined, so a platform
 * without `ToolSafetySandbox.confine` has no index at all (J2.12 "plataforma sem suporte").
 */
export const indexers = Effect.fn("CodeIndexExtract.indexers")(function* () {
  if (process.platform !== "darwin" && process.platform !== "linux")
    return yield* new Research.Error({ code: "index_unavailable",
      message: `toolkit-not-ready:unsupported:scip-typescript:sandbox-platform-unsupported: ${process.platform}` })
  const manifest = yield* ResearchToolkit.Manifest
  const states = (yield* ResearchToolkit.status()).filter((state) => manifest[state.engine]?.fit.role === "indexer")
  const usable = states.filter((state) => state.status === "ready" || state.status === "absent" || state.status === "fetching")
  const blocked = states[0]
  if (usable.length === 0)
    return yield* new Research.Error({ code: "index_unavailable", message: blocked
      ? `toolkit-not-ready:${blocked.status}:${blocked.engine}${"reason" in blocked ? `:${blocked.reason}` : "cause" in blocked ? `:${blocked.cause}` : ""}`
      : "toolkit-not-ready:unsupported:index:no-indexer-pack" })
  return Object.fromEntries(usable.flatMap((state) => (manifest[state.engine]?.fit.languages ?? [])
    .map((language) => [language, { id: state.engine, version: state.version } satisfies CodeIndexShard.Indexer] as const)))
})

const shard = Effect.fn("CodeIndexExtract.shard")(function* (input: Parameters<CodeIndexBuild.Extract>[0]) {
  const selected = CodeIndexFilter.select(input.shard.files)
  const read = yield* Effect.forEach(selected.files, (file) =>
    text(input.root, file.path).pipe(Effect.map((content) => ({ ...file, text: content }))), { concurrency: 16 })
  const sources = read.flatMap((file) => file.text === undefined ? [] : [{ path: file.path, grammar: file.grammar, text: file.text }])
  const outlines = yield* Effect.forEach(sources, (file) => CodeIndexTreeSitter.extract(file.path, file.text, file.grammar), { concurrency: 8 })
  const dump = yield* scip(input)
  const resolver = yield* CodeIndexResolve.make(input.root)
  return assemble({
    sources, outlines, dump,
    resolve: resolver.resolve,
    skipped: [
      ...selected.skipped,
      ...read.filter((file) => file.text === undefined).map((file) => ({ path: file.path, reason: "missing-in-worktree" })),
      ...outlines.flatMap((entry) => entry.coverage.complete ? [] : [{ path: entry.path, reason: entry.coverage.reason ?? "partial-parse" }]),
      ...(dump.malformed ? [{ path: input.shard.project, reason: `scip-malformed-occurrences:${dump.malformed}` }] : []),
    ],
    language: input.shard.language,
  })
})

/**
 * One indexer run (J2.5, J2.13): the pack's executable, arguments and output file are the host's; the run is confined
 * (no network, writes only to its scratch and the dump), spawned through AppProcess under the D2 memory cap and the
 * per-shard timeout, with the project directory as cwd.
 */
const scip = Effect.fn("CodeIndexExtract.scip")(function* (input: Parameters<CodeIndexBuild.Extract>[0]) {
  const proc = yield* AppProcess.Service
  const caps = yield* ResearchToolkit.Caps
  const engine = IDS.find((id) => id === input.indexer.id)
  if (!engine) return yield* new Research.Error({ code: "index_unavailable", message: `toolkit-not-ready:unsupported:${input.indexer.id}:pack-not-shipped` })
  const ready = yield* ResearchToolkit.ensure(engine).pipe(
    Effect.mapError((error) => new Research.Error({ code: "index_unavailable", message: error.reason })))
  const failed = (message: string) => new Research.Error({ code: "index_unavailable", message: `${engine}: ${message}` })
  return yield* Effect.gen(function* () {
    // The dump lives outside the worktree (JI-1); confine grants writes only to it and the run's own scratch.
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "orchestra-scip-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    )
    const output = path.join(directory, "index.scip")
    yield* Effect.promise(() => writeFile(output, ""))
    const launch = yield* ToolSafetySandbox.confine({
      command: ready.executable, args: ["index", "--output", output], cwd: directory, write: [output], env: process.env,
    }).pipe(Effect.mapError((denied) => failed(`sandbox ${denied.reason}`)))
    const result = yield* proc.run(
      ChildProcess.make(launch.command, launch.args, {
        cwd: path.join(input.root, input.shard.project), env: launch.env, extendEnv: false, stdin: "ignore",
      }),
      { timeout: caps.shardTimeoutMs, maxRssBytes: caps.indexerBytes, maxOutputBytes: 64 * 1024, maxErrorBytes: 64 * 1024 },
    ).pipe(Effect.mapError((cause) => failed(cause.message)))
    if (result.exitCode !== 0)
      return yield* failed(`exit ${result.exitCode}: ${(result.stderr.toString("utf8") || result.stdout.toString("utf8")).trim().slice(0, 500)}`)
    return yield* Effect.try({
      try: () => Scip.readScip(output, { prefix: input.shard.project === "." ? "" : input.shard.project }),
      catch: (cause) => failed(`dump unreadable: ${String(cause)}`),
    })
  }).pipe(Effect.scoped)
})

type Source = { readonly path: string; readonly grammar: CodeIndexFilter.Grammar; readonly text: string }
type Row = CodeIndexStore.Content["symbols"][number]

function assemble(input: {
  readonly sources: ReadonlyArray<Source>
  readonly outlines: ReadonlyArray<CodeIndexTreeSitter.Extract>
  readonly dump: Scip.Index
  readonly resolve: (from: string, specifier: string) => CodeIndexResolve.Resolution
  readonly skipped: CodeIndexStore.Content["skipped"]
  readonly language: string
}): CodeIndexStore.Content {
  const outlines = new Map(input.outlines.map((entry) => [entry.path, entry]))
  // A project's tsconfig may reach files a nested project owns; those belong to the nested shard.
  const docs = input.dump.documents.flatMap((doc) => {
    const entry = outlines.get(doc.path)
    return entry ? [Enclosing.join(doc, {
      definitions: entry.definitions,
      imports: entry.imports.map((item) => ({ startLine: item.line, endLine: item.line })),
    })] : []
  })
  const view = Callers.create(docs, { indexerName: input.dump.indexer?.name })
  const symbols: Row[] = []
  const ids = new Map<string, number>()
  const add = (row: Omit<Row, "id">) => {
    const id = symbols.length + 1
    symbols.push({ ...row, id })
    if (row.scip) ids.set(row.scip, id)
    return id
  }
  // An external symbol: referenced here, defined in another shard or outside every shard.
  const row = (symbol: string) => ids.get(symbol) ?? add({
    scip: symbol, name: Scip.descriptorName(symbol) ?? symbol, kind: kind(symbol), path: "", startLine: 0, endLine: 0,
    nameLine: 0, exported: false,
  })

  // Definitions first, so a reference before its definition in document order does not mint an external row.
  docs.forEach((doc) => {
    const ranges = new Map(doc.definitions.map((def) => [def.symbol, def.range]))
    const infos = new Map(doc.symbols.map((entry) => [entry.symbol, entry]))
    const structural = Map.groupBy(outlines.get(doc.path)?.definitions ?? [], (def) => def.nameLine)
    doc.occurrences.forEach((occ) => {
      if (!(occ.role & Role.definition) || !indexable(occ.symbol) || ids.has(occ.symbol)) return
      const range = ranges.get(occ.symbol) ?? occ
      const name = Scip.descriptorName(occ.symbol)
      const match = structural.get(occ.startLine)?.find((def) => def.name === name)
      const info = infos.get(occ.symbol)
      add({
        scip: occ.symbol, name: match?.name ?? name ?? info?.displayName ?? occ.symbol, kind: match?.kind ?? kind(occ.symbol),
        path: doc.path, startLine: range.startLine, endLine: Math.max(range.startLine, range.endLine), nameLine: occ.startLine,
        exported: match?.exported ?? false,
      })
    })
  })
  const containers = new Map(docs.flatMap((doc) => doc.occurrences.flatMap((occ, index) => {
    if (!(occ.role & Role.definition) || !indexable(occ.symbol)) return []
    const container = enclosing(doc, index)
    return container && ids.has(container) ? [[occ.symbol, ids.get(container)!] as const] : []
  })))
  const occurrences = docs.flatMap((doc) => doc.occurrences.flatMap((occ, index): CodeIndexStore.Content["occurrences"] => {
    if (!indexable(occ.symbol)) return []
    const resolution = view.resolution(occ)
    const container = enclosing(doc, index)
    return [{
      symbolId: row(resolution?.kind === "resolved" ? resolution.symbol : occ.symbol),
      path: doc.path, line: occ.startLine, col: occ.startCol - 1, endLine: occ.endLine, endCol: occ.endCol, role: occ.role,
      ...(container && ids.has(container) ? { enclosingId: ids.get(container)! } : {}),
      opaque: false,
    }]
  }))
  const relations = docs.flatMap((doc) => doc.symbols.flatMap((info) => !indexable(info.symbol) ? [] : info.relationships.flatMap((rel) => [
    ...(rel.implementation && indexable(rel.symbol) ? [{ symbolId: row(info.symbol), targetId: row(rel.symbol), kind: "implementation" as const }] : []),
    ...(rel.typeDefinition && indexable(rel.symbol) ? [{ symbolId: row(info.symbol), targetId: row(rel.symbol), kind: "type_definition" as const }] : []),
  ])))

  // Files the indexer did not cover (outside the tsconfig, or JavaScript without allowJs) keep their structural layer.
  const indexed = new Set(docs.map((doc) => doc.path))
  input.outlines.filter((entry) => !indexed.has(entry.path)).forEach((entry) => {
    const local = new Map<number, number>()
    entry.definitions.forEach((def, index) => local.set(index, add({
      name: def.name, kind: def.kind, path: entry.path, startLine: def.startLine, endLine: def.endLine, nameLine: def.nameLine,
      exported: def.exported, ...(def.container !== undefined && local.has(def.container) ? { containerId: local.get(def.container)! } : {}),
    })))
  })

  return {
    documents: input.sources.map((source) => ({
      path: source.path, language: input.language, sha256: createHash("sha256").update(source.text).digest("hex"),
      lines: outlines.get(source.path)?.lines ?? 0, bytes: Buffer.byteLength(source.text), layer: indexed.has(source.path) ? 1 : 2,
    })),
    symbols: symbols.map((entry) => containers.has(entry.scip ?? "") ? { ...entry, containerId: containers.get(entry.scip!) } : entry),
    occurrences,
    relations,
    imports: input.outlines.flatMap((entry) => entry.imports.map((item) => {
      const resolved = input.resolve(entry.path, item.specifier)
      return { fromPath: entry.path, line: item.line, specifier: item.specifier, ...(resolved.to ? { toPath: resolved.to } : {}), kind: resolved.kind }
    })),
    skipped: input.skipped,
  }
}

/** The innermost stored definition around an occurrence: its joined enclosing symbol, else the nearest global one. */
function enclosing(doc: Enclosing.Document, index: number) {
  const own = doc.enclosing[index]
  if (own && indexable(own)) return own
  const occ = doc.occurrences[index]
  return doc.definitions
    .filter((def) => indexable(def.symbol) && def.symbol !== occ.symbol &&
      (def.range.startLine < occ.startLine || (def.range.startLine === occ.startLine && def.range.startCol <= occ.startCol)) &&
      (def.range.endLine > occ.endLine || (def.range.endLine === occ.endLine && def.range.endCol >= occ.endCol)))
    .toSorted((a, b) => b.range.startLine - a.range.startLine || b.range.startCol - a.range.startCol)[0]?.symbol
}

// Locals, parameters (`(name)`), type parameters (`[name]`) and file modules (`path/`) are not stored.
function indexable(symbol: string) {
  return !Scip.isLocalSymbol(symbol) && !/[)\]/]$/.test(symbol)
}

// The SCIP descriptor suffix, for a definition the structural layer did not name and for external symbols.
function kind(symbol: string) {
  if (symbol.endsWith(").")) return "function"
  if (symbol.endsWith("#")) return "type"
  if (symbol.endsWith(".")) return "term"
  if (symbol.endsWith(":")) return "meta"
  return "symbol"
}

const text = (root: string, file: string) => Effect.promise(() => Bun.file(path.join(root, file)).text().catch(() => undefined))

// J2.8: the structural layer over a dirty file's current content.
function outline(root: string, file: string) {
  return Effect.gen(function* () {
    const grammar = CodeIndexFilter.grammar(file)
    if (!grammar || !CodeIndexFilter.shouldRead(file)) return undefined
    const content = yield* text(root, file)
    if (content === undefined) return undefined
    const result = yield* CodeIndexTreeSitter.extract(file, content, grammar)
    return {
      path: file, lines: result.lines,
      symbols: result.definitions.map((def) => ({
        name: def.name, kind: def.kind, startLine: def.startLine, endLine: def.endLine, nameLine: def.nameLine, exported: def.exported,
      })),
    }
  })
}
