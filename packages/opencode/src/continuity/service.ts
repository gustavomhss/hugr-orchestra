export * as SessionContinuity from "./service"

import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { SessionID, type MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { Archive } from "./archive"
import { child } from "./alias"
import { Token } from "@/util/token"
import { Cause, Context, Deferred, Effect, Layer, Scope } from "effect"
import { create } from "./context"
import { carriesMemory, measure, run, snapshot, type ParentRequest, type Pass } from "./fork"
import { hasArtifact, isCurrent } from "./model"
import { hardLimit, isSafe, PREPARE_MARGIN, PRUNE_STEP, settings, shouldStart, tokenCount } from "./trigger"
import { apply as applyMasks, candidates as maskCandidates, estimate, urgent } from "./masking"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

type Active = { generation: number; boundary: MessageID; done: Deferred.Deferred<void> }
type Pending = { message: SessionV1.Assistant; canRecall: boolean }
type Entry = {
  generation: number
  safe?: MessageID
  active?: Active
  pending?: Pending
  attempted?: MessageID
  refresh: boolean
  archived?: MessageID
  /** Consecutive producer failures; maintenance stops for the session at MAX_FAILURES. */
  failures?: number
  /** How the last maintenance run ended. */
  result?: string
  /** Context size after the last prune below the trigger; the next one runs PRUNE_STEP of the window later. */
  pruned?: number
}
type State = {
  sessions: Map<SessionID, Entry>
  contexts: ReturnType<typeof create>
  scope: Scope.Scope
  /** Latest parent model request per session, kept so maintenance can reuse its prompt cache. */
  requests: Map<SessionID, ParentRequest>
  /** The parent's measured system and tool overhead per session; it outlives the evicted request. */
  overheads: Map<SessionID, number>
  /** Masked tool part IDs per session, mapped to the archive reference with the full output. */
  masks: Map<SessionID, Map<string, string>>
  /** Sessions whose persisted memory was loaded, is loading, or must not load (invalidated or forgotten). */
  loads: Map<SessionID, Deferred.Deferred<void>>
}

// After this many consecutive failed or invalid maintenance runs, stop until the user edits history.
export const MAX_FAILURES = 3

// Requests hold whole message arrays; keep only the most recently active sessions.
const MAX_OBSERVED_REQUESTS = 4

// Ceiling on the native tail, as a share of the window; a longer last turn is cut between its steps.
const TAIL_SHARE = 0.15

export interface Interface {
  readonly prepare: (input: { sessionID: SessionID; messages: SessionV1.WithParts[]; canRecall?: boolean }) => Effect.Effect<{
    messages: SessionV1.WithParts[]
    system: string[]
  }>
  readonly start: (input: {
    sessionID: SessionID
    message: SessionV1.Assistant
    canRecall?: boolean
  }) => Effect.Effect<void>
  /** Record the parent's model request so a later maintenance fork can replay its prefix. */
  readonly observe: (input: {
    sessionID: SessionID
    request: LLM.StreamInput
    messageIDs: readonly MessageID[]
  }) => Effect.Effect<void>
  /**
   * Bring the context under the hard limit before the next model request: wait for running maintenance, run a
   * pass when still over (or when forced), then mask every old tool result the recall can restore.
   */
  readonly compact: (input: { sessionID: SessionID; canRecall?: boolean; force?: boolean }) => Effect.Effect<Compacted>
  readonly advance: (sessionID: SessionID) => Effect.Effect<void>
  readonly invalidate: (sessionID: SessionID) => Effect.Effect<void>
  readonly forget: (sessionID: SessionID) => Effect.Effect<void>
}

/** "fits": no work needed; "over": still past the hard limit after every step, so the request may overflow. */
export type Compacted = "disabled" | "fits" | "applied" | "masked" | "over"

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionContinuity") {}

function entry(state: State, sessionID: SessionID) {
  const existing = state.sessions.get(sessionID)
  if (existing) return existing
  const next: Entry = { generation: 0, refresh: false }
  state.sessions.set(sessionID, next)
  return next
}

// Provider causes may contain conversation content. Keep diagnostics structural.
// One event per pass, whatever its outcome; a pass summary carries op kinds, sections and IDs, never contents.
function diagnostic(sessionID: SessionID, boundary: MessageID | undefined, reason: string, pass?: Omit<Pass, "artifact">) {
  return Effect.logWarning("continuity maintenance", { sessionID, boundary, reason, ...pass })
}

const memoryDiagnostic = (sessionID: SessionID, error: Archive.ArchiveError) =>
  Effect.logWarning("continuity memory", { sessionID, reason: error.reason })

const loaded = Deferred.makeUnsafe<void>()
Deferred.doneUnsafe(loaded, Effect.void)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const background = yield* BackgroundJob.Service
    const provider = yield* Provider.Service
    const llm = yield* LLM.Service
    const archive = yield* Archive.Service
    const config = yield* Config.Service
    const enabled = config.get().pipe(Effect.map((value) => settings(value)), Effect.orElseSucceed(() => settings({})))
    const state = yield* InstanceState.make(() => Effect.gen(function* () {
      const scope = yield* Scope.Scope
      return { sessions: new Map<SessionID, Entry>(), contexts: create(), scope, requests: new Map(), masks: new Map(), overheads: new Map(),
        loads: new Map() }
    }))

    // Load a session's persisted memory once per process, before its first use.
    const restore = (current: State, sessionID: SessionID) => Effect.suspend(() => {
      const existing = current.loads.get(sessionID)
      if (existing) return Deferred.await(existing)
      const done = Deferred.makeUnsafe<void>()
      current.loads.set(sessionID, done)
      return archive.readMemory(sessionID).pipe(
        Effect.flatMap((memory) => Effect.sync(() => {
          // An invalidation during the read replaced this load.
          if (!memory || current.loads.get(sessionID) !== done) return
          if (memory.context) current.contexts.set(memory.context)
          if (memory.masks.length) current.masks.set(sessionID, new Map(memory.masks))
        })),
        Effect.catch((error) => memoryDiagnostic(sessionID, error).pipe(Effect.andThen(error.reason === "archive-corrupt-memory"
          ? archive.removeMemory(sessionID).pipe(Effect.catch((error) => memoryDiagnostic(sessionID, error))) : Effect.void))),
        Effect.ensuring(Deferred.succeed(done, undefined)),
        Effect.uninterruptible,
      )
    })

    const persist = (current: State, sessionID: SessionID) => archive.writeMemory(sessionID, () => {
      const context = current.contexts.get(sessionID)
      return { context: context && hasArtifact(context) ? context : undefined, masks: [...current.masks.get(sessionID) ?? []] }
    }).pipe(Effect.catch((error) => memoryDiagnostic(sessionID, error)))

    const unload = (current: State, sessionID: SessionID) => Effect.suspend(() => {
      current.loads.set(sessionID, loaded)
      return archive.removeMemory(sessionID).pipe(Effect.catch((error) => memoryDiagnostic(sessionID, error)))
    })

    const prepare: Interface["prepare"] = Effect.fn("SessionContinuity.prepare")(function* (input) {
      // Disabling continuity also stops using memory and masks applied earlier.
      if (!(yield* enabled).enabled) return { messages: input.messages, system: [] }
      yield* restore(yield* InstanceState.get(state), input.sessionID)
      const view = yield* memory(input)
      // Stubs point at archived output; without recall the full history stays native.
      if (input.canRecall !== true) return view
      const masks = (yield* InstanceState.get(state)).masks.get(input.sessionID)
      return masks?.size ? { ...view, messages: applyMasks(view.messages, masks) } : view
    })

    const memory = Effect.fn("SessionContinuity.memory")(function* (input: Parameters<Interface["prepare"]>[0]) {
      const current = yield* InstanceState.get(state)
      const prepared = current.contexts.prepare(input.sessionID, input.messages)
      if (!prepared.system.length) return prepared
      const artifact = current.contexts.get(input.sessionID)?.artifact
      if (!artifact) return { messages: input.messages, system: [] }
      const item = current.sessions.get(input.sessionID)
      const generation = item?.generation
      const user = input.messages.findLast((message) => message.info.role === "user")?.info
      if (!user || user.role !== "user") return { messages: input.messages, system: [] }
      const capacity = yield* provider.getModel(user.model.providerID, user.model.modelID).pipe(
        Effect.map((model) => Math.min(model.limit.input ?? Infinity, model.limit.context - model.limit.output)),
        Effect.catch(() => Effect.succeed(0)),
      )
      if (Token.estimate(prepared.system.join("\n")) + estimate(prepared.messages) + 2048 > capacity)
        return { messages: input.messages, system: [] }
      const unchanged = current.sessions.get(input.sessionID) === item && item?.generation === generation &&
        current.contexts.get(input.sessionID)?.artifact === artifact
      return unchanged ? prepared : { messages: input.messages, system: [] }
    })

    const observe: Interface["observe"] = Effect.fn("SessionContinuity.observe")(function* (input) {
      const current = yield* InstanceState.get(state)
      const overhead = yield* measure({ input: input.request, messageIDs: input.messageIDs }, current.contexts.get(input.sessionID)?.text)
      yield* Effect.sync(() => {
        current.overheads.set(input.sessionID, overhead)
        current.requests.delete(input.sessionID)
        current.requests.set(input.sessionID, { input: input.request, messageIDs: [...input.messageIDs] })
        for (const key of current.requests.keys()) {
          if (current.requests.size <= MAX_OBSERVED_REQUESTS) break
          current.requests.delete(key)
        }
      })
    })

    const advance: Interface["advance"] = Effect.fn("SessionContinuity.advance")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      yield* Effect.sync(() => {
        const item = entry(current, sessionID)
        item.generation += 1
        item.safe = undefined
        item.pending = undefined
        if (item.active) item.refresh = true
      })
    })

    const invalidate: Interface["invalidate"] = Effect.fn("SessionContinuity.invalidate")(function* (sessionID) {
      yield* advance(sessionID)
      const current = yield* InstanceState.get(state)
      current.contexts.discard(sessionID)
      current.requests.delete(sessionID)
      current.overheads.delete(sessionID)
      current.masks.delete(sessionID)
      const item = entry(current, sessionID)
      item.attempted = undefined
      item.failures = undefined
      item.refresh = true
      item.archived = undefined
      yield* unload(current, sessionID)
    })

    const forget: Interface["forget"] = Effect.fn("SessionContinuity.forget")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      current.contexts.discard(sessionID)
      current.sessions.delete(sessionID)
      current.requests.delete(sessionID)
      current.overheads.delete(sessionID)
      current.masks.delete(sessionID)
      yield* unload(current, sessionID)
    })

    /** Stub the selected tool results of the stored history, publishing first what the archive has not seen. */
    const stubs = (current: State, sessionID: SessionID, stored: SessionV1.WithParts[],
      select: (messages: SessionV1.WithParts[], masks: Map<string, string>) => { messageID: string; part: { id: string }; saved: number }[]) =>
      Effect.gen(function* () {
        const item = entry(current, sessionID)
        const archivedIndex = item.archived ? stored.findIndex((message) => message.info.id === item.archived) : -1
        yield* archive.publish({ sessionID, messages: stored.slice(archivedIndex + 1) })
        item.archived = stored.at(-1)?.info.id
        const references = yield* archive.list(sessionID)
        const firstFragment = new Map<string, string>()
        for (const reference of references) if (!firstFragment.has(reference.first)) firstFragment.set(reference.first, reference.id)
        const view = yield* prepare({ sessionID, messages: MessageV2.filterCompacted(stored.toReversed()), canRecall: true })
        const masks = current.masks.get(sessionID) ?? new Map<string, string>()
        let freed = 0
        for (const candidate of select(view.messages, masks)) {
          const reference = firstFragment.get(candidate.messageID)
          if (reference === undefined) continue
          masks.set(candidate.part.id, reference)
          freed += candidate.saved
        }
        if (!freed) return 0
        current.masks.set(sessionID, masks)
        yield* persist(current, sessionID)
        return freed
      })

    const schedule = (current: State, sessionID: SessionID, pending: Pending,
      expected?: { entry: Entry; generation: number }): Effect.Effect<void> =>
      Effect.gen(function* () {
        const message = pending.message
        const options = yield* enabled
        if (!options.enabled) return
        yield* restore(current, sessionID)
        const context = yield* provider.getModel(message.providerID, message.modelID).pipe(
          Effect.map((model) => model.limit.context),
          Effect.orElseSucceed(() => 0),
        )
        const tailBudget = Math.max(2048, Math.floor(TAIL_SHARE * context))
        const active = yield* Effect.sync(() => {
          const item = current.sessions.get(sessionID)
          if (!item || expected && (item !== expected.entry || item.generation !== expected.generation)) return
          if (item.active || item.safe !== message.id || item.attempted === message.id) return
          if ((item.failures ?? 0) >= MAX_FAILURES) return
          const previous = current.contexts.get(sessionID)
          if (previous && !hasArtifact(previous)) {
            current.contexts.discard(sessionID)
            item.refresh = true
          }
          if (current.contexts.get(sessionID)?.boundary === message.id) return
          if (!item.refresh && !shouldStart({ tokens: tokenCount(message.tokens), active: false, context,
            trigger: options.trigger })) {
            // Below the trigger: prune old tool output once the context grew PRUNE_STEP since the last batch.
            const tokens = tokenCount(message.tokens)
            if (tokens < (item.pruned ?? 0)) item.pruned = tokens
            return pending.canRecall && context > 0 && tokens >= (item.pruned ?? 0) + PRUNE_STEP * context
              ? "prune" as const : undefined
          }
          const active: Active = { generation: item.generation, boundary: message.id, done: Deferred.makeUnsafe<void>() }
          item.active = active
          item.attempted = message.id
          item.pending = undefined
          return active
        })
        if (active === "prune") {
          // No model call: stub tool output that left the verbatim tail, restorable through context_recall.
          const tokens = tokenCount(message.tokens)
          yield* sessions.messages({ sessionID }).pipe(
            Effect.flatMap((stored) => stubs(current, sessionID, stored, maskCandidates)),
            Effect.tap((freed) => Effect.sync(() => { entry(current, sessionID).pruned = tokens - freed })),
            Effect.flatMap((freed) => freed > 0 ? diagnostic(sessionID, message.id, "pruned") : Effect.void),
            Effect.catchCause(() => diagnostic(sessionID, message.id, "prune-failed")),
          )
          return
        }
        if (!active) return

        const result = (value: string) => Effect.sync(() => {
          const item = current.sessions.get(sessionID)
          if (item?.active === active) item.result = value
        })

        // Count consecutive producer failures for this generation; success resets the count.
        const outcome = (ok: boolean) => Effect.sync(() => {
          const item = current.sessions.get(sessionID)
          if (!item || item.generation !== active.generation) return
          item.failures = ok ? 0 : (item.failures ?? 0) + 1
          if (item.failures === MAX_FAILURES) return "open" as const
        }).pipe(Effect.flatMap((state) => state === "open"
          ? diagnostic(sessionID, active.boundary, "circuit-open") : Effect.void))

        const finish = Effect.gen(function* () {
          yield* Deferred.succeed(active.done, undefined)
          const next = yield* Effect.sync(() => {
            const item = current.sessions.get(sessionID)
            if (!item || item.active !== active) return
            item.active = undefined
            const pending = item.pending
            item.pending = undefined
            // New users clear the safe boundary; retry only a new completed turn.
            if (!pending || item.safe !== pending.message.id || item.attempted === pending.message.id) return
            return { pending, entry: item, generation: item.generation }
          })
          // A cancelled worker still carries its interrupt cause in this finalizer.
          // Admit the queued turn in a fresh fiber, owned by this instance's cache
          // scope (not the old job/request). Defer execution until scope ownership
          // is registered; schedule rechecks the captured entry/generation atomically.
          if (next) yield* schedule(current, sessionID, next.pending, next).pipe(
            Scope.provide(current.scope),
            Effect.forkIn(current.scope),
            Effect.asVoid,
          )
        })

        yield* Effect.suspend(() =>
          background.start({
            id: `continuity:${sessionID}:${active.boundary}:${active.generation}`,
            type: "context-continuity",
            title: "Context continuity",
            metadata: { sessionId: sessionID, background: true },
            run: Effect.gen(function* () {
              const history = yield* sessions.messages({ sessionID })
              const currentEntry = current.sessions.get(sessionID)
              const archived = currentEntry?.archived
              const archivedIndex = archived ? history.findIndex((message) => message.info.id === archived) : -1
              // Archive captured public history once; future maintenance appends only
              // new completed records. Edits/reverts clear the publication cursor.
              yield* archive.publish({ sessionID, messages: history.slice(archivedIndex + 1) })
              if (currentEntry?.generation === active.generation) currentEntry.archived = history.at(-1)?.info.id
              const activeHistory = MessageV2.filterCompacted(history.toReversed())
              const model = yield* provider.getModel(message.providerID, message.modelID)
              const inputLimit = Math.min(model.limit.input ?? Infinity, model.limit.context - model.limit.output)
              const headBudget = Math.max(0, Math.min(32_000, Math.floor(inputLimit / 2)))
              const prepared = yield* prepare({ sessionID, messages: activeHistory, canRecall: pending.canRecall })
              // Mask old tool output first: it needs no model call and often frees enough on its own.
              const references = yield* archive.list(sessionID)
              const firstFragment = new Map<string, string>()
              for (const reference of references) if (!firstFragment.has(reference.first)) firstFragment.set(reference.first, reference.id)
              const { masked, added } = yield* Effect.sync(() => {
                const item = current.sessions.get(sessionID)
                if (!item || item.active !== active || item.generation !== active.generation) return { masked: 0, added: false }
                const masks = current.masks.get(sessionID) ?? new Map<string, string>()
                const before = masks.size
                let freed = 0
                // A stub points at archived output; an agent without recall keeps its results native.
                for (const candidate of pending.canRecall ? maskCandidates(prepared.messages, masks) : []) {
                  const reference = firstFragment.get(candidate.messageID)
                  if (reference === undefined) continue
                  masks.set(candidate.part.id, reference)
                  freed += candidate.saved
                }
                if (masks.size) current.masks.set(sessionID, masks)
                return { masked: freed, added: masks.size !== before }
              })
              if (added) yield* persist(current, sessionID)
              if (masked > 0 && tokenCount(message.tokens) - masked <= context * (options.trigger - PREPARE_MARGIN)) {
                yield* diagnostic(sessionID, active.boundary, "masked")
                yield* outcome(true)
                yield* result("masked")
                return "masked"
              }
              const request = current.requests.get(sessionID)
              let budget = headBudget
              const selected = yield* Effect.sync(() => {
                const item = current.sessions.get(sessionID)
                // Later steps may have landed since the start; the snapshot covers the history as it is now.
                if (!item || item.active !== active || item.generation !== active.generation) return
                const previous = current.contexts.get(sessionID)
                // Full history is required for incompatible or unavailable prior coverage.
                if (previous && !hasArtifact(previous)) current.contexts.discard(sessionID)
                const prior = prepared.system.length ? previous?.artifact : undefined
                // The replay transport sends the index, not the head transcript: only the isolated path caps the head.
                if (request && carriesMemory(request, prior) && request.input.model.providerID === model.providerID &&
                  request.input.model.id === model.id) budget = Infinity
                return snapshot(sessionID, activeHistory, prior, pending.canRecall, budget, tailBudget)
              })
              if (!selected) {
                yield* diagnostic(sessionID, active.boundary, "no-current-snapshot")
                yield* result("discarded")
                return "discarded"
              }
              // A turn that started before the last swap replays older memory than this
              // pass edits. Wait for a turn that carries the current memory instead of
              // paying for an uncached isolated request.
              if (request && !carriesMemory(request, selected.previous)) {
                yield* diagnostic(sessionID, active.boundary, "stale-request")
                yield* result("discarded")
                return "discarded"
              }
              // Host data the producer never writes: delegation registry state and members.
              const children = [...new Set(history.flatMap((item) => item.parts.flatMap((part) => child(part) ?? [])))]
              const delegations = Object.fromEntries(yield* Effect.forEach(children, (id) => Effect.gen(function* () {
                const job = yield* background.get(id)
                const info = yield* sessions.get(SessionID.make(id)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
                return [id, { member: info?.agent, status: job?.status }] as const
              })))
              const member = !!(yield* sessions.get(sessionID).pipe(Effect.catchCause(() => Effect.succeed(undefined))))?.parentID
              const { artifact, ...pass } = yield* run(selected, { provider, llm }, { history, delegations, member }, { parent: request })
              // A skip is no producer failure; only a check that failed again on the retry counts.
              if (!artifact) {
                yield* diagnostic(sessionID, active.boundary, pass.skip ? `skipped-${pass.skip}` : "rejected", pass)
                yield* result(pass.skip ? "skipped" : "discarded")
                if (pass.skip) return "skipped"
                yield* outcome(false)
                return "discarded"
              }
              const latest = yield* sessions.messages({ sessionID })
              const applied = yield* Effect.sync(() => {
                const item = current.sessions.get(sessionID)
                if (!item || item.active !== active || item.generation !== active.generation || !isCurrent(selected, latest))
                  return false
                if (
                  artifact.parentID !== sessionID ||
                  artifact.boundary !== selected.boundary ||
                  artifact.tailStart !== selected.tailStart ||
                  artifact.coveredThrough !== selected.head.at(-1)?.info.id
                )
                  return false
                if (
                  !current.contexts.set({
                    sessionID,
                    boundary: selected.boundary,
                    tailStart: selected.tailStart,
                    text: artifact.text,
                    artifact,
                  })
                )
                  return false
                item.refresh = !!snapshot(sessionID, activeHistory, artifact, pending.canRecall, budget, tailBudget)
                return true
              })
              if (!applied) {
                yield* diagnostic(sessionID, active.boundary, "stale-or-mismatched-artifact", pass)
                yield* result("discarded")
                return "discarded"
              }
              yield* persist(current, sessionID)
              yield* diagnostic(sessionID, active.boundary, "applied", pass)
              yield* outcome(true)
              yield* result("applied")
              return "applied"
            }).pipe(
              Effect.catchCause((cause) =>
                diagnostic(sessionID, active.boundary, Cause.hasInterruptsOnly(cause) ? "cancelled" : "failed").pipe(
                  Effect.andThen(Cause.hasInterruptsOnly(cause) ? Effect.void : outcome(false)),
                  Effect.andThen(
                    Cause.hasInterruptsOnly(cause)
                      ? Effect.failCause(cause)
                      : Effect.fail(new Error("Continuity maintenance failed")),
                  ),
                ),
              ),
              Effect.ensuring(finish),
            ),
          }),
        ).pipe(
          // BackgroundJob carries caller interruptibility into its worker.
          Effect.interruptible,
          Effect.catchCause((cause) =>
            diagnostic(
              sessionID,
              active.boundary,
              Cause.hasInterruptsOnly(cause) ? "scheduling-cancelled" : "scheduling-failed",
            ).pipe(Effect.andThen(finish)),
          ),
          Effect.asVoid,
        )
      })

    const start: Interface["start"] = Effect.fn("SessionContinuity.start")((input) =>
      Effect.gen(function* () {
        if (!isSafe(input.message) || input.message.sessionID !== input.sessionID) return
        const pending: Pending = { message: input.message, canRecall: input.canRecall === true }
        const current = yield* InstanceState.get(state)
        const idle = yield* Effect.sync(() => {
          const item = entry(current, input.sessionID)
          item.safe = input.message.id
          if (item.active) {
            if (item.active.boundary !== input.message.id) {
              item.pending = pending
              item.refresh = true
            }
            return false
          }
          return true
        })
        if (idle) yield* schedule(current, input.sessionID, pending)
      }).pipe(
        Effect.uninterruptible,
        Effect.catchCause((cause) =>
          diagnostic(
            input.sessionID,
            input.message.id,
            Cause.hasInterruptsOnly(cause) ? "setup-cancelled" : "setup-failed",
          ),
        ),
      ),
    )

    // Running maintenance (and any turn it queued) finishes before the hard check reads the context.
    const settle = (current: State, sessionID: SessionID) => Effect.gen(function* () {
      for (let round = 0; round < 4; round++) {
        const active = current.sessions.get(sessionID)?.active
        if (!active) return
        yield* Deferred.await(active.done)
      }
    })

    const compact: Interface["compact"] = Effect.fn("SessionContinuity.compact")(function* (input) {
      const { sessionID } = input
      if (!(yield* enabled).enabled) return "disabled" as const
      const current = yield* InstanceState.get(state)
      yield* restore(current, sessionID)
      yield* settle(current, sessionID)
      const last = (yield* sessions.messages({ sessionID })).findLast((message) =>
        message.info.role === "assistant" && isSafe(message.info))?.info
      if (!last || last.role !== "assistant") return "fits" as const
      const model = yield* provider.getModel(last.providerID, last.modelID).pipe(Effect.orDie)
      const limit = hardLimit(model)
      // The context the next request would carry: memory, masks and native tail, plus the measured system and tools.
      const pressure = Effect.gen(function* () {
        const stored = yield* sessions.messages({ sessionID })
        const history = MessageV2.filterCompacted(stored.toReversed())
        const view = yield* prepare({ sessionID, messages: history, canRecall: input.canRecall })
        const sent = yield* MessageV2.toModelMessagesEffect(view.messages, model).pipe(Effect.orElseSucceed(() => view.messages))
        return { stored, history,
          tokens: (current.overheads.get(sessionID) ?? 0) + Token.estimate(view.system.join("\n")) + estimate(sent) }
      })
      if (!input.force && (yield* pressure).tokens < limit) return "fits" as const
      const item = entry(current, sessionID)
      yield* Effect.sync(() => {
        item.safe = last.id
        item.refresh = true
        item.attempted = undefined
        item.result = undefined
      })
      yield* schedule(current, sessionID, { message: last, canRecall: input.canRecall === true })
      yield* settle(current, sessionID)
      const after = yield* pressure
      const ran = item.result === "applied" ? "applied" as const : item.result === "masked" ? "masked" as const : undefined
      // A forced run (a provider overflow or /compact) that changed nothing goes on to the last resort.
      if (after.tokens < limit && (ran || !input.force)) return ran ?? "fits" as const
      if (input.canRecall !== true) return ran ?? (after.tokens < limit ? "fits" as const : "over" as const)
      // Last resort, with no model call: stub every old result the archive can restore.
      if (!(yield* stubs(current, sessionID, after.stored, urgent))) return ran ?? (after.tokens < limit ? "fits" as const : "over" as const)
      yield* diagnostic(sessionID, last.id, "urgent-masked")
      return (yield* pressure).tokens < limit || input.force ? "masked" as const : "over" as const
    }, Effect.catchCause((cause) => Effect.logWarning("continuity compact failed", { cause: Cause.pretty(cause) }).pipe(
      Effect.as("over" as const))))

    return Service.of({ prepare, start, observe, compact, advance, invalidate, forget })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Session.node, BackgroundJob.node, Provider.node, LLM.node, Archive.node, Config.node],
})
