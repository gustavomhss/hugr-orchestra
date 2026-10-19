export * as CodeIndexExtract from "./extract"

import { createHash } from "node:crypto"
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Research } from "@orchestra/schema/research"
import { AppProcess } from "../../process"
import { ToolSafetySandbox } from "../../tool-safety-sandbox"
import { ResearchToolkit, type Language } from "../index"
import { IDS } from "../manifest"
import { CodeIndexBuild } from "./build"
import { Callers } from "./callers"
import { Enclosing } from "./enclosing"
import { CodeIndexFilter } from "./filter"
import { CodeIndexGo } from "./go"
import { CodeIndexPython } from "./python"
import type { CodeIndexQuery } from "./query"
import { CodeIndexResolve } from "./resolve"
import { CodeIndexRust } from "./rust"
import { Scip } from "./scip"
import { CodeIndexShard } from "./shard"
import { CodeIndexStore } from "./store"
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
//
// Go and Rust indexers drive the host toolchain. A Go or Rust shard whose toolchain or indexer is missing is built by
// the STRUCTURAL indexer instead: no SCIP run, every document layer 2, and the reason in the shard's skipped list, so
// its basis names `tree-sitter` and its coverage is incomplete, as for TypeScript files outside every tsconfig.

/** The indexer id of a tree-sitter-only shard; its version names why the precise layer is absent. */
export const STRUCTURAL = "tree-sitter"

/** The extraction X3's build runs per shard, and the overlay its queries run on dirty files, with services bound. */
export const make = Effect.gen(function* () {
  const proc = yield* AppProcess.Service
  return {
    extract: ((input) => extract(input).pipe(Effect.provideService(AppProcess.Service, proc))) satisfies CodeIndexBuild.Extract,
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
  const ready = Object.fromEntries(usable.flatMap((state) => (manifest[state.engine]?.fit.languages ?? [])
    .map((language) => [language, { id: state.engine, version: state.version } satisfies CodeIndexShard.Indexer] as const)))
  return structural(ready, Bun.which, (language) => {
    const state = states.find((entry) => manifest[entry.engine]?.fit.languages.includes(language))
    return state ? `toolkit-not-ready:${state.status}:${state.engine}` : "toolkit-not-ready:unsupported:pack-not-shipped"
  })
})

/**
 * Go and Rust languages without a precise indexer, or whose host toolchain `which` cannot find, map to the STRUCTURAL
 * indexer; every other language keeps its own. `blocked` names why a language has no indexer.
 */
export function structural(
  indexers: Partial<Record<Language, CodeIndexShard.Indexer>>,
  which: (command: string) => string | null,
  blocked: (language: Language) => string,
): Partial<Record<Language, CodeIndexShard.Indexer>> {
  const toolchains = { go: CodeIndexGo.TOOLCHAIN, rust: CodeIndexRust.TOOLCHAIN }
  return {
    ...indexers,
    ...Object.fromEntries((["go", "rust"] as const).flatMap((language) => {
      const missing = !indexers[language] ? blocked(language) : which(toolchains[language]) ? undefined : `toolchain-missing:${toolchains[language]}`
      return missing ? [[language, { id: STRUCTURAL, version: missing }] as const] : []
    })),
  }
}

/**
 * `ResearchToolkit.Index` over X3's planner and store, which `warm` and `prewarm` drive (J6.7): each shard of the
 * worktree's HEAD with its key as id, and a build that extracts one shard with the executable and memory cap the
 * toolkit hands it, writes it atomically and applies retention.
 */
export const toolkit = Effect.gen(function* () {
  const proc = yield* AppProcess.Service
  const failed = (error: { readonly message: string }) => new ResearchToolkit.ShardFailed({ reason: error.message })
  const prepared = (worktree: string) => Effect.gen(function* () {
    const root = yield* Effect.tryPromise({ try: () => realpath(worktree), catch: () => new ResearchToolkit.ShardFailed({ reason: "worktree-missing" }) })
    const manifest = yield* ResearchToolkit.Manifest
    const plan = yield* CodeIndexBuild.plan({
      root, git: yield* CodeIndexShard.live(root), storeRoot: yield* ResearchToolkit.Root,
      // The warm-up acquires absent packs, so only a missing toolchain falls back here; the fallback is no engine, so
      // the warm-up leaves its shard to the first query.
      indexers: structural(Object.fromEntries(Object.values(manifest).flatMap((pack) => pack?.fit.role === "indexer"
        ? pack.fit.languages.map((language) => [language, { id: pack.id, version: pack.version }] as const) : [])),
      Bun.which, () => "toolkit-not-ready:unsupported:pack-not-shipped"),
    }).pipe(Effect.mapError(failed))
    return { root, plan }
  }).pipe(Effect.provideService(AppProcess.Service, proc))
  return {
    plan: (worktree: string) => prepared(worktree).pipe(Effect.flatMap(({ plan }) => Effect.forEach(plan.shards, (planned) =>
      CodeIndexStore.exists(plan.dir, planned.key).pipe(Effect.map((ready) => {
        const engine = IDS.find((id) => id === planned.indexer.id)
        // An unbuilt shard has no file_rank yet; its file count stands in for the project's aggregated rank.
        return engine ? [{ id: planned.key, language: planned.shard.language, project: planned.shard.project,
          rank: planned.shard.files.length, engine, state: ready ? "ready" as const : "absent" as const }] : []
      }))).pipe(Effect.map((shards) => shards.flat())))),
    build: (shard: ResearchToolkit.Shard, input: { readonly worktree: string; readonly executable: string; readonly memoryBytes: number }) =>
      Effect.gen(function* () {
        const ready = yield* prepared(input.worktree)
        const plan = ready.plan
        const planned = plan.shards.find((entry) => entry.key === shard.id)
        if (!planned) return yield* new ResearchToolkit.ShardFailed({ reason: "shard-not-at-head" })
        const content = yield* extract({ root: ready.root, commit: plan.commit, shard: planned.shard, indexer: planned.indexer },
          { executable: input.executable, memoryBytes: input.memoryBytes }).pipe(Effect.mapError(failed))
        yield* CodeIndexStore.write(plan.dir, { shardKey: planned.key, commit: plan.commit, indexer: planned.indexer.id,
          version: planned.indexer.version }, content).pipe(Effect.mapError(failed))
        const present = yield* Effect.forEach(plan.shards, (entry) => CodeIndexStore.exists(plan.dir, entry.key))
        const caps = yield* ResearchToolkit.Caps
        yield* CodeIndexStore.retain(plan.dir, {
          commit: plan.commit, at: Date.now(),
          shards: plan.shards.filter((_, index) => present[index]).map((entry) => ({ id: entry.shard.id, key: entry.key })),
        }, { commits: caps.indexCommits, bytes: caps.indexBytes })
      }).pipe(Effect.provideService(AppProcess.Service, proc)),
  }
})

const extract = Effect.fn("CodeIndexExtract.extract")(function* (
  input: Parameters<CodeIndexBuild.Extract>[0],
  launch?: { readonly executable: string; readonly memoryBytes: number },
) {
  const selected = CodeIndexFilter.select(input.shard.files)
  const read = yield* Effect.forEach(selected.files, (file) =>
    text(input.root, file.path).pipe(Effect.map((content) => ({ ...file, text: content }))), { concurrency: 16 })
  const sources = read.flatMap((file) => file.text === undefined ? [] : [{ path: file.path, grammar: file.grammar, text: file.text }])
  const outlines = yield* Effect.forEach(sources, (file) => CodeIndexTreeSitter.extract(file.path, file.text, file.grammar), { concurrency: 8 })
  const dump: Scip.Index = input.indexer.id === STRUCTURAL ? { indexer: undefined, documents: [], malformed: 0 } : yield* scip(input, launch, new Map(sources.map((file) => [file.path, file.text])))
  const resolver = yield* CodeIndexResolve.make(input.root)
  return assemble({
    sources, outlines, dump,
    resolve: resolver.resolve,
    skipped: [
      ...selected.skipped,
      ...read.filter((file) => file.text === undefined).map((file) => ({ path: file.path, reason: "missing-in-worktree" })),
      ...outlines.flatMap((entry) => entry.coverage.complete ? [] : [{ path: entry.path, reason: entry.coverage.reason ?? "partial-parse" }]),
      ...(dump.malformed ? [{ path: input.shard.project, reason: `scip-malformed-occurrences:${dump.malformed}` }] : []),
      ...(input.indexer.id === STRUCTURAL ? [{ path: input.shard.project, reason: `structural-only:${input.indexer.version}` }] : []),
    ],
    language: input.shard.language,
  })
})

/**
 * One indexer run (J2.5, J2.13): the pack's executable, arguments and output file are the host's; the run is confined
 * (no network, writes only to its scratch and the dump), spawned through AppProcess under the D2 memory cap and the
 * per-shard timeout, with the project directory as cwd.
 */
const scip = Effect.fn("CodeIndexExtract.scip")(function* (
  input: Parameters<CodeIndexBuild.Extract>[0],
  launch: { readonly executable: string; readonly memoryBytes: number } | undefined,
  // The shard's source text by repository-relative path, for dumps whose columns are not UTF-16.
  texts: ReadonlyMap<string, string>,
) {
  const proc = yield* AppProcess.Service
  const caps = yield* ResearchToolkit.Caps
  const engine = IDS.find((id) => id === input.indexer.id)
  if (!engine) return yield* new Research.Error({ code: "index_unavailable", message: `toolkit-not-ready:unsupported:${input.indexer.id}:pack-not-shipped` })
  // The toolkit's warm-up has already ensured the pack and names the cap; a query-started build ensures it here.
  const ready = launch ?? (yield* ResearchToolkit.ensure(engine).pipe(
    Effect.map((ensured) => ({ executable: ensured.executable, memoryBytes: caps.indexerBytes })),
    Effect.mapError((error) => new Research.Error({ code: "index_unavailable", message: error.reason }))))
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
      command: ready.executable, cwd: directory, write: [output],
      args: input.shard.language === "py" ? CodeIndexPython.args({ project: input.shard.project, output })
        : input.shard.language === "go" ? CodeIndexGo.args(output)
        : input.shard.language === "rust" ? CodeIndexRust.args(output)
        : ["index", "--output", output],
      env: { ...process.env, ...(input.shard.language === "go" ? CodeIndexGo.ENV : input.shard.language === "rust" ? CodeIndexRust.ENV : {}) },
    }).pipe(Effect.mapError((denied) => failed(`sandbox ${denied.reason}`)))
    const result = yield* proc.run(
      ChildProcess.make(launch.command, launch.args, {
        cwd: path.join(input.root, input.shard.project), env: launch.env, extendEnv: false, stdin: "ignore",
      }),
      { timeout: caps.shardTimeoutMs, maxRssBytes: ready.memoryBytes, maxOutputBytes: 64 * 1024, maxErrorBytes: 64 * 1024 },
    ).pipe(Effect.mapError((cause) => failed(cause.message)))
    if (result.exitCode !== 0)
      return yield* failed(`exit ${result.exitCode}: ${(result.stderr.toString("utf8") || result.stdout.toString("utf8")).trim().slice(0, 500)}`)
    return yield* Effect.try({
      try: () => Scip.readScip(output, { prefix: input.shard.project === "." ? "" : input.shard.project, source: (file) => texts.get(file) }),
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

// Locals, parameters (`(name)`), type parameters (`[name]`) and file modules (`path/`, Python's `module/__init__:`) are not stored.
function indexable(symbol: string) {
  return !Scip.isLocalSymbol(symbol) && !/[)\]/]$/.test(symbol) && CodeIndexPython.indexable(symbol)
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
