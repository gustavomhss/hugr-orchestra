export * as ResearchToolkit from "./index"

import path from "path"
import { createHash, randomUUID } from "crypto"
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises"
import { Context, Effect, Option, Schema } from "effect"
import { Global } from "../global"
import { LayerNode } from "../effect/layer-node"
import { EffectFlock } from "../util/effect-flock"
import { BackendToolkit } from "../backend-toolkit"
import type { Engine } from "../backend-toolkit/manifest"
import { ENGINES, IDS } from "./manifest"

// J6: the discovery seat's pinned engines on the BackendToolkit lifecycle, with research Root and Manifest supplied.
// Nothing here copies acquisition: `status`, `ensure` and `prefetch` run BackendToolkit's verbs over this toolkit's
// own root and packs, so installs, launchers, shims, retries and failure causes are the backend's (J6.1).

export type ResearchEngineId = "scip-typescript" | "scip-python" | "scip-go" | "rust-analyzer" | "typescript"

export type Language = "ts" | "js" | "py" | "go" | "rust"

/** A research engine file; it carries its own fit and never touches the backend Pack's entry skills. */
export type ResearchPack = Engine<string> & {
  readonly fit: { readonly role: "indexer" | "oracle"; readonly languages: ReadonlyArray<Language> }
}

export type State = { readonly engine: ResearchEngineId; readonly version: string } & BackendToolkit.EngineState

/** Owner caps (D2, 2026-10-18) and the index disk budget (J2.4); config `research.limits.*` may lower them. */
export const Limits = Object.freeze({
  indexerBytes: 2 * 1024 * 1024 * 1024,
  probeBytes: 1024 * 1024 * 1024,
  scratchBytes: 2 * 1024 * 1024 * 1024,
  indexBytes: 4 * 1024 * 1024 * 1024,
  indexCommits: 8,
  shardTimeoutMs: 15 * 60_000,
})

export const Root = Context.Reference<string>("@orchestra/ResearchToolkit/Root", {
  defaultValue: () => process.env.RESEARCH_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "research-toolkit"),
})

export const Manifest = Context.Reference<Readonly<Partial<Record<ResearchEngineId, ResearchPack>>>>(
  "@orchestra/ResearchToolkit/Manifest",
  { defaultValue: () => ENGINES },
)

/** The caps in force; the instance provides `research.limits.*` here, which may only lower `Limits`. */
export const Caps = Context.Reference<typeof Limits>("@orchestra/ResearchToolkit/Caps", { defaultValue: () => Limits })

/** `Caps` from config `research.limits.*`: each configured value lowers its owner cap and never raises it (D2). */
export function caps(limits?: {
  readonly indexer_bytes?: number
  readonly probe_bytes?: number
  readonly scratch_bytes?: number
  readonly index_bytes?: number
}): typeof Limits {
  const lower = (cap: number, value?: number) => Math.min(cap, value ?? cap)
  return Object.freeze({
    ...Limits,
    indexerBytes: lower(Limits.indexerBytes, limits?.indexer_bytes),
    probeBytes: lower(Limits.probeBytes, limits?.probe_bytes),
    scratchBytes: lower(Limits.scratchBytes, limits?.scratch_bytes),
    indexBytes: lower(Limits.indexBytes, limits?.index_bytes),
  })
}

/** One (language, project) shard of a worktree's index (J2.1), as the index store sees it at the worktree's commit. */
export type Shard = {
  /** The shard key (J2.2); a new commit that changes the project's tree is a new id. */
  readonly id: string
  readonly language: Language
  readonly project: string
  /** The project's aggregated `file_rank`; higher builds first. */
  readonly rank: number
  readonly engine: ResearchEngineId
  readonly state: "ready" | "stale" | "absent"
}

export type ShardState = Pick<Shard, "id" | "language" | "project"> &
  ({ readonly status: Shard["state"] | "building" } | { readonly status: "skipped"; readonly reason: string })

export class ShardFailed extends Schema.TaggedErrorClass<ShardFailed>()("ResearchToolkit.ShardFailed", {
  reason: Schema.String,
}) {
  override get message() {
    return `Research index shard not built: ${this.reason}`
  }
}

/**
 * The code index (X3) as the toolkit drives it: which shards a worktree has, and how one is built. `build` runs the
 * pack's indexer under `ToolSafetySandbox.confine` within `memoryBytes` and stops when interrupted; the toolkit owns
 * ordering, the host-wide one-indexer rule and the timeout (J6.7).
 */
export const Index = Context.Reference<{
  readonly plan: (worktree: string) => Effect.Effect<ReadonlyArray<Shard>, ShardFailed>
  readonly build: (
    shard: Shard,
    input: { readonly worktree: string; readonly executable: string; readonly memoryBytes: number },
  ) => Effect.Effect<void, ShardFailed>
}>("@orchestra/ResearchToolkit/Index", {
  defaultValue: () => ({
    plan: () => Effect.succeed([]),
    build: () => Effect.fail(new ShardFailed({ reason: "index-builder-unavailable" })),
  }),
})

/** The same verbs as BackendToolkit, over the research manifest. */
export const status: (id?: ResearchEngineId) => Effect.Effect<ReadonlyArray<State>> = Effect.fn("ResearchToolkit.status")(
  function* (id?: ResearchEngineId) {
    const manifest = yield* Manifest
    const ids = id ? [id] : IDS
    const states: ReadonlyArray<BackendToolkit.State<ResearchEngineId>> = ids.some((item) => manifest[item])
      ? yield* BackendToolkit.status<ResearchEngineId>(id).pipe(lifecycle)
      : []
    return ids.map((item): State => states.find((state) => state.engine === item) ?? unshipped(item))
  },
)

/** Every failure is `toolkit-not-ready:<state>:<id>[:<cause>]`, the blocker `code_query` reports (J6.10). */
export const ensure: (id: ResearchEngineId) => Effect.Effect<{ readonly executable: string }, BackendToolkit.NotReady> =
  Effect.fn("ResearchToolkit.ensure")(function* (id: ResearchEngineId) {
    const manifest = yield* Manifest
    if (!manifest[id]) return yield* new BackendToolkit.NotReady({ reason: `toolkit-not-ready:unsupported:${id}:pack-not-shipped` })
    return yield* BackendToolkit.ensure(id).pipe(
      lifecycle,
      Effect.mapError((error) => new BackendToolkit.NotReady({ reason: named(id, error.reason) })),
    )
  })

export const prefetch: (ids?: ReadonlyArray<ResearchEngineId>) => Effect.Effect<ReadonlyArray<State>> = Effect.fn(
  "ResearchToolkit.prefetch",
)(function* (ids?: ReadonlyArray<ResearchEngineId>) {
  const manifest = yield* Manifest
  const chosen = ids ?? IDS
  const shipped = chosen.filter((id) => manifest[id])
  const states: ReadonlyArray<BackendToolkit.State<ResearchEngineId>> = shipped.length
    ? yield* BackendToolkit.prefetch(shipped).pipe(lifecycle)
    : []
  return chosen.map((id): State => states.find((state) => state.engine === id) ?? unshipped(id))
})

// One warm-up per worktree per process; a second request while one runs joins nothing and returns.
const warming = new Set<string>()

/** Background warm-up: ensures the packs of present languages and builds the current commit's shards; never blocks. */
export const prewarm: (worktree: string) => Effect.Effect<void> = (worktree) =>
  Effect.gen(function* () {
    if (warming.has(worktree)) return
    warming.add(worktree)
    yield* warm(worktree).pipe(
      Effect.ensuring(Effect.sync(() => warming.delete(worktree))),
      Effect.forkDetach,
    )
  })

/**
 * The warm-up `prewarm` forks (J6.7): every shard not ready at the worktree's commit, highest `rank` first, one
 * indexer at a time on the host, each within `Caps.shardTimeoutMs` and `Caps.indexerBytes`. A shard that cannot be
 * built is recorded `skipped` with its reason, and the others go on.
 */
export const warm = Effect.fn("ResearchToolkit.warm")(function* (worktree: string) {
  const index = yield* Index
  const caps = yield* Caps
  const root = yield* Root
  const plan = yield* index.plan(worktree).pipe(Effect.orElseSucceed((): ReadonlyArray<Shard> => []))
  const pending = plan.filter((shard) => shard.state !== "ready").toSorted((a, b) => b.rank - a.rank)
  const engines = new Map(
    yield* Effect.forEach([...new Set(pending.map((shard) => shard.engine))], (engine) =>
      ensure(engine).pipe(
        Effect.match({ onSuccess: (ready) => ready, onFailure: (error) => ({ reason: error.reason }) }),
        Effect.map((ready) => [engine, ready] as const),
      ),
    ),
  )
  const flock = yield* EffectFlock.Service
  yield* Effect.forEach(
    pending,
    Effect.fnUntraced(function* (shard: Shard) {
      const ready = engines.get(shard.engine) ?? { reason: `toolkit-not-ready:absent:${shard.engine}` }
      if ("reason" in ready) return yield* record(root, worktree, shard.id, { status: "skipped", reason: ready.reason })
      const built = yield* flock
        .withLock(
          Effect.gen(function* () {
            yield* record(root, worktree, shard.id, { status: "building" })
            return yield* index
              .build(shard, { worktree, executable: ready.executable, memoryBytes: caps.indexerBytes })
              .pipe(
                Effect.timeoutOrElse({
                  duration: caps.shardTimeoutMs,
                  orElse: () => Effect.fail(new ShardFailed({ reason: `timeout:${caps.shardTimeoutMs}ms` })),
                }),
              )
          }),
          "research-toolkit:indexer",
          path.join(root, "locks"),
        )
        // The lock waits at most five minutes per try; a shard of another worktree may hold it for fifteen.
        .pipe(
          Effect.retry({ while: (error) => error._tag === "LockTimeoutError" }),
          Effect.match({
            onSuccess: () => undefined,
            onFailure: (error) => (error._tag === "ResearchToolkit.ShardFailed" ? error.reason : "indexer-lock-compromised"),
          }),
        )
      yield* record(root, worktree, shard.id, built === undefined ? undefined : { status: "skipped", reason: built })
    }),
    { discard: true },
  )
}, Effect.provide(LayerNode.compile(EffectFlock.node)))

/** Each shard of the worktree as `orchestra toolkit status` shows it (J6.9). */
export const shards = Effect.fn("ResearchToolkit.shards")(function* (worktree: string) {
  const index = yield* Index
  const caps = yield* Caps
  const root = yield* Root
  const plan = yield* index.plan(worktree)
  const records = yield* read(root, worktree)
  return plan.map((shard): ShardState => {
    const base = { id: shard.id, language: shard.language, project: shard.project }
    const entry = records[shard.id]
    // A building record outlives a process that died mid-build; past the shard timeout it no longer claims the shard.
    if (entry?.status === "building" && Date.now() - entry.at < caps.shardTimeoutMs) return { ...base, status: "building" }
    if (entry?.status === "skipped" && shard.state !== "ready") return { ...base, status: "skipped", reason: entry.reason ?? "unknown" }
    return { ...base, status: shard.state }
  })
})

function lifecycle<A, E, R>(self: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const root = yield* Root
    const manifest = yield* Manifest
    return yield* self.pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(
        BackendToolkit.Manifest,
        Object.fromEntries(Object.values(manifest).filter((pack) => pack !== undefined).map((pack) => [pack.id, pack])),
      ),
    )
  })
}

function unshipped(id: ResearchEngineId): State {
  return { engine: id, version: "none", status: "unsupported", reason: "pack-not-shipped" }
}

/** BackendToolkit's blockers in the one research form; the backend's own wording stays the shell's. */
function named(id: ResearchEngineId, reason: string) {
  if (reason.startsWith("toolkit-not-ready:")) return reason
  if (!reason.startsWith("unsupported-target:")) return `toolkit-not-ready:failed:${id}:${reason}`
  // A floor refusal already names the engine: `unsupported-target:<id>:<floor>`.
  const rest = reason.slice("unsupported-target:".length)
  return `toolkit-not-ready:unsupported:${id}:${rest.startsWith(`${id}:`) ? rest.slice(id.length + 1) : rest}`
}

// Shard outcomes live beside the cache, not in the worktree (JI-1), so a CLI process sees what the instance recorded.
const Records = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({ status: Schema.Literals(["building", "skipped"]), reason: Schema.optional(Schema.String), at: Schema.Number }),
  ),
)
const decodeRecords = Schema.decodeUnknownOption(Records)

const recordFile = (root: string, worktree: string) =>
  path.join(root, "prewarm", `${createHash("sha256").update(path.resolve(worktree)).digest("hex")}.json`)

const read = (root: string, worktree: string) =>
  Effect.promise(() => readFile(recordFile(root, worktree), "utf8").catch(() => "{}")).pipe(
    Effect.map((text) => Option.getOrElse(decodeRecords(text), (): typeof Records.Type => ({}))),
  )

/** Replace one shard's record (none clears it) through a temp file and one rename; a failed write loses only status. */
const record = (root: string, worktree: string, shard: string, entry?: { readonly status: "building" | "skipped"; readonly reason?: string }) =>
  read(root, worktree).pipe(
    Effect.flatMap((records) =>
      Effect.tryPromise({
        try: async () => {
          const file = recordFile(root, worktree)
          const next = Object.fromEntries([
            ...Object.entries(records).filter(([id]) => id !== shard),
            ...(entry ? [[shard, { ...entry, at: Date.now() }]] : []),
          ])
          await mkdir(path.dirname(file), { recursive: true })
          const temp = `${file}.${randomUUID()}`
          await writeFile(temp, JSON.stringify(next))
          await rename(temp, file).catch(() => rm(temp, { force: true }))
        },
        catch: () => new ShardFailed({ reason: "record-write" }),
      }).pipe(Effect.ignore),
    ),
  )
