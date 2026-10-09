export * as SessionContinuity from "./service"

import { LayerNode } from "@orchestra/core/effect/layer-node"
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
import { Cause, Context, Deferred, Effect, Layer, Scope, Semaphore, Stream } from "effect"
import { isDeepStrictEqual } from "node:util"
import { create } from "./context"
import { completeSnapshot, measure, run, type ParentRequest, type Pass } from "./fork"
import { completeIndex, fingerprint, hasArtifact, isCurrent } from "./model"
import { hardLimit, isSafe, settings, shouldStart, tokenCount } from "./trigger"
import { ContinuityMasking, estimate, urgent } from "./masking"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Prepared } from "./memory-types"
import { ContinuityAdmission } from "./admission"
import { RequestSource } from "./request-source"
import { ParentReceipt } from "./parent-receipt"

type Backend = { readonly model: Provider.Model; readonly llm: LLM.Interface; readonly revision: number }
type Active = { generation: number; epoch: number; backend: Backend | null | undefined; boundary: MessageID;
  registered: Deferred.Deferred<void>; done: Deferred.Deferred<void> }
type Pending = { message: SessionV1.Assistant; canRecall: boolean; model?: Provider.Model }
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
  admittedBoundary?: MessageID
}
type State = {
  backends: Map<SessionID, Backend | null>
  epochs: Map<SessionID, number>
  backendGates: Map<SessionID, Semaphore.Semaphore>
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

export interface Interface {
  /** Session-local transport and limits. Configured sessions never replay an API request. */
  readonly configure: (input: { sessionID: SessionID; model: Provider.Model; llm: LLM.Interface; overhead?: number }) => Effect.Effect<void>
  readonly pause: (sessionID: SessionID) => Effect.Effect<void>
  readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  /** Return a session to its ordinary provider/LLM without discarding durable memory. */
  readonly release: (sessionID: SessionID) => Effect.Effect<void>
  readonly prepare: (input: ContinuityAdmission.Input) => Effect.Effect<Prepared>
  readonly admit: (input: ContinuityAdmission.Input) => Effect.Effect<Prepared, ContinuityAdmission.AdmissionError>
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
    responseMessageID?: MessageID
    sources?: SessionV1.WithParts[]
  }) => Effect.Effect<void>
  /**
   * Bring the context under the hard limit before the next model request: wait for running maintenance, run a
   * pass when still over (or when forced), then mask every old tool result the recall can restore.
   */
  readonly compact: (input: { sessionID: SessionID; canRecall?: boolean; force?: boolean; model?: Provider.Model }) => Effect.Effect<Compacted>
  readonly advance: (sessionID: SessionID) => Effect.Effect<void>
  readonly invalidate: (sessionID: SessionID) => Effect.Effect<void>
  readonly forget: (sessionID: SessionID) => Effect.Effect<void>
}

/** "fits": no work needed; "over": still past the hard limit after every step, so the request may overflow. */
export type Compacted = "disabled" | "fits" | "applied" | "masked" | "over"

export class Service extends Context.Service<Service, Interface>()("@orchestra/SessionContinuity") {}

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
        loads: new Map(), backends: new Map(), epochs: new Map(), backendGates: new Map() }
    }))

    const resolve = (current: State, sessionID: SessionID, providerID: Provider.Model["providerID"], modelID: Provider.Model["id"]) => Effect.gen(function* () {
      const backend = current.backends.get(sessionID)
      if (backend === null) return yield* Effect.fail(new Error("Session continuity backend paused"))
      return backend ? backend.model : yield* provider.getModel(providerID, modelID)
    })
    const fence = (current: State, sessionID: SessionID) => {
      const item = entry(current, sessionID)
      const epoch = (current.epochs.get(sessionID) ?? 0) + 1
      current.epochs.set(sessionID, epoch)
      item.generation++
      item.pending = undefined
      item.safe = undefined
      item.attempted = undefined
      return { epoch, active: item.active }
    }
    const join = (sessionID: SessionID, active: Active | undefined) => Effect.gen(function* () {
      if (!active) return
      yield* Deferred.await(active.registered)
      yield* background.cancel(`continuity:${sessionID}:${active.boundary}:${active.generation}`)
      yield* Deferred.await(active.done)
    })
    const cancel: Interface["cancel"] = Effect.fn("SessionContinuity.cancel")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      yield* gate(current, sessionID).withPermit(Effect.gen(function* () {
        const previous = current.backends.get(sessionID)
        const token = fence(current, sessionID)
        current.backends.set(sessionID, null)
        yield* join(sessionID, token.active)
        if (current.epochs.get(sessionID) !== token.epoch) return
        if (previous === undefined) current.backends.delete(sessionID)
        else current.backends.set(sessionID, previous)
      }))
    }, Effect.uninterruptible)
    const gate = (current: State, sessionID: SessionID) => {
      const gate = current.backendGates.get(sessionID) ?? Semaphore.makeUnsafe(1)
      current.backendGates.set(sessionID, gate)
      return gate
    }
    const configure: Interface["configure"] = Effect.fn("SessionContinuity.configure")(function* (input) {
      const current = yield* InstanceState.get(state)
      const token = yield* gate(current, input.sessionID).withPermit(Effect.sync(() => {
        const previous = current.backends.get(input.sessionID)
        current.requests.delete(input.sessionID)
        if (previous && previous.llm === input.llm && isDeepStrictEqual(previous.model, input.model)) {
          if (input.overhead !== undefined) current.overheads.set(input.sessionID, input.overhead)
          return
        }
        current.overheads.delete(input.sessionID)
        const token = fence(current, input.sessionID)
        current.backends.set(input.sessionID, null)
        return token
      }))
      if (!token) return
      yield* join(input.sessionID, token.active)
      yield* gate(current, input.sessionID).withPermit(Effect.sync(() => {
        if (current.epochs.get(input.sessionID) !== token.epoch) return
        current.backends.set(input.sessionID, Object.freeze({ model: structuredClone(input.model), llm: input.llm, revision: token.epoch }))
        if (input.overhead !== undefined) current.overheads.set(input.sessionID, input.overhead)
      }))
    }, Effect.uninterruptible)
    const pause: Interface["pause"] = Effect.fn("SessionContinuity.pause")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      const token = yield* gate(current, sessionID).withPermit(Effect.sync(() => {
        const token = fence(current, sessionID)
        current.backends.set(sessionID, null)
        current.requests.delete(sessionID)
        current.overheads.delete(sessionID)
        return token
      }))
      yield* join(sessionID, token.active)
    }, Effect.uninterruptible)
    const release: Interface["release"] = Effect.fn("SessionContinuity.release")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      const token = yield* gate(current, sessionID).withPermit(Effect.sync(() => {
        const token = fence(current, sessionID)
        current.backends.set(sessionID, null)
        return token
      }))
      yield* join(sessionID, token.active)
      yield* gate(current, sessionID).withPermit(Effect.sync(() => {
        if (current.epochs.get(sessionID) !== token.epoch) return
        current.backends.delete(sessionID)
        current.requests.delete(sessionID)
        current.overheads.delete(sessionID)
      }))
    }, Effect.uninterruptible)

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
        Effect.catch((error) => memoryDiagnostic(sessionID, error)),
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
      if (!(yield* enabled).enabled || (yield* InstanceState.get(state)).backends.get(input.sessionID) === null)
        return { messages: input.messages, system: [] }
      yield* restore(yield* InstanceState.get(state), input.sessionID)
      const view = yield* memory(input)
      // Stubs point at archived output; without recall the full history stays native.
      if (input.canRecall !== true) return view
      const masks = (yield* InstanceState.get(state)).masks.get(input.sessionID)
      return masks?.size ? { ...view, messages: ContinuityMasking.apply(view.messages, masks) } : view
    })

    const memory = Effect.fn("SessionContinuity.memory")(function* (input: Parameters<Interface["prepare"]>[0]) {
      const current = yield* InstanceState.get(state)
      const prepared = current.contexts.prepare(input.sessionID, input.messages, input.originalRequest)
      if (!prepared.system.length) return prepared
      const artifact = current.contexts.get(input.sessionID)?.artifact
      if (!artifact) return { messages: input.messages, system: [] }
      const item = current.sessions.get(input.sessionID)
      const generation = item?.generation
      const user = RequestSource.latest(input.messages, input.originalRequest)?.info
      if (!user || user.role !== "user") return { messages: input.messages, system: [] }
      const capacity = yield* (input.model ? Effect.succeed(input.model) : resolve(current, input.sessionID, user.model.providerID, user.model.modelID)).pipe(
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
      if (current.backends.get(input.sessionID) === null) return
      const epoch = current.epochs.get(input.sessionID) ?? 0
      const backend = current.backends.get(input.sessionID)
      const overhead = yield* measure({ input: input.request, messageIDs: input.messageIDs }, current.contexts.get(input.sessionID)?.text)
      yield* Effect.sync(() => {
        if ((current.epochs.get(input.sessionID) ?? 0) !== epoch || current.backends.get(input.sessionID) !== backend) return
        current.overheads.set(input.sessionID, overhead)
        current.requests.delete(input.sessionID)
        if (backend) return
        const request = { input: input.request, messageIDs: [...input.messageIDs] }
        current.requests.set(input.sessionID, input.responseMessageID && input.sources ? ParentReceipt.capture(request, input.responseMessageID, input.sources) : request)
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
      item.admittedBoundary = undefined
      yield* unload(current, sessionID)
    })

    const forget: Interface["forget"] = Effect.fn("SessionContinuity.forget")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      if (current.backends.has(sessionID)) {
        const token = yield* gate(current, sessionID).withPermit(Effect.sync(() => {
          const token = fence(current, sessionID)
          current.backends.set(sessionID, null)
          return token
        }))
        yield* join(sessionID, token.active)
      } else current.epochs.set(sessionID, (current.epochs.get(sessionID) ?? 0) + 1)
      current.backends.delete(sessionID)
      current.contexts.discard(sessionID)
      current.sessions.delete(sessionID)
      current.requests.delete(sessionID)
      current.overheads.delete(sessionID)
      current.masks.delete(sessionID)
      yield* unload(current, sessionID)
    })

    /** Stub the selected tool results of the stored history, publishing first what the archive has not seen. */
    const stubs = (current: State, sessionID: SessionID, stored: SessionV1.WithParts[],
      select: (messages: SessionV1.WithParts[], masks: Map<string, string>) => { messageID: string; part: { id: string }; saved: number }[], owner?: () => boolean) =>
      Effect.gen(function* () {
        const item = entry(current, sessionID)
        const generation = item.generation
        const epoch = current.epochs.get(sessionID)
        const backend = current.backends.get(sessionID)
        const live = () => current.sessions.get(sessionID) === item && item.generation === generation && current.epochs.get(sessionID) === epoch &&
          current.backends.get(sessionID) === backend && (!owner || owner())
        if (!live()) return 0
        const archivedIndex = item.archived ? stored.findIndex((message) => message.info.id === item.archived) : -1
        yield* archive.publish({ sessionID, messages: stored.slice(archivedIndex + 1) })
        if (!live()) return 0
        item.archived = stored.at(-1)?.info.id
        const references = yield* archive.list(sessionID)
        const firstFragment = new Map<string, string>()
        for (const reference of references) if (!firstFragment.has(reference.first)) firstFragment.set(reference.first, reference.id)
        const view = yield* prepare({ sessionID, messages: MessageV2.filterCompacted(stored.toReversed()), canRecall: true })
        const latest = yield* sessions.messages({ sessionID })
        if (!live() || stored.length > latest.length || stored.some((message, index) => fingerprint(message) !== fingerprint(latest[index]))) return 0
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
      expected?: { entry: Entry; generation: number; epoch: number; backend: Backend | null | undefined }): Effect.Effect<void> =>
      Effect.gen(function* () {
        const token = expected ?? { entry: entry(current, sessionID), generation: entry(current, sessionID).generation,
          epoch: current.epochs.get(sessionID) ?? 0, backend: current.backends.get(sessionID) }
        const live = () => current.sessions.get(sessionID) === token.entry && token.entry.generation === token.generation &&
          (current.epochs.get(sessionID) ?? 0) === token.epoch && current.backends.get(sessionID) === token.backend
        if (!live()) return
        const message = pending.message
        const options = yield* enabled
        if (!live() || !options.enabled || token.backend === null) return
        yield* restore(current, sessionID)
        const model = pending.model ?? token.backend?.model ?? (yield* provider.getModel(message.providerID, message.modelID).pipe(Effect.orElseSucceed(() => undefined)))
        if (!live() || !model) return
        const context = model.limit.context
        const active = yield* gate(current, sessionID).withPermit(Effect.sync(() => {
          const item = current.sessions.get(sessionID)
          if (!item || !live()) return
          if (item.active || item.safe !== message.id || item.attempted === message.id) return
          if ((item.failures ?? 0) >= MAX_FAILURES) return
          const previous = current.contexts.get(sessionID)
          if (previous && !hasArtifact(previous)) {
            current.contexts.discard(sessionID)
            item.refresh = true
          }
          if (current.contexts.get(sessionID)?.boundary === message.id) return
          if (!item.refresh && !shouldStart({ tokens: tokenCount(message.tokens), active: false, context,
            trigger: options.trigger })) return
          const active: Active = { generation: item.generation, epoch: token.epoch, backend: token.backend,
            boundary: message.id, done: Deferred.makeUnsafe<void>(), registered: Deferred.makeUnsafe<void>() }
          item.active = active
          item.attempted = message.id
          item.pending = undefined
          return active
        }))
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
            const candidate = current.contexts.get(sessionID)?.artifact
            // Admission owns initial candidate catch-up. Do not race a queued user with an automatic paid follow-up.
            if (candidate?.version === 5 && item.admittedBoundary !== candidate.boundary) return
            // New users clear the safe boundary; retry only a new completed turn.
            if (!pending || (current.epochs.get(sessionID) ?? 0) !== token.epoch || current.backends.get(sessionID) !== token.backend ||
              item.safe !== pending.message.id || item.attempted === pending.message.id) return
            return { pending, entry: item, generation: item.generation, epoch: token.epoch, backend: token.backend }
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

        yield* Effect.suspend(() => live() ?
          background.start({
            id: `continuity:${sessionID}:${active.boundary}:${active.generation}`,
            type: "context-continuity",
            title: "Context continuity",
            metadata: { sessionId: sessionID, background: true },
            run: Effect.gen(function* () {
              if (!live()) return "discarded"
              const stored = yield* sessions.messages({ sessionID })
              // External engines may still be executing tools. Their producer captures only a completed step.
              const history = stored.slice(0, stored.findIndex((item) => item.info.id === active.boundary) + 1)
              const currentEntry = current.sessions.get(sessionID)
              const archived = currentEntry?.archived
              const archivedIndex = archived ? history.findIndex((message) => message.info.id === archived) : -1
              // Archive captured public history once; future maintenance appends only
              // new completed records. Edits/reverts clear the publication cursor.
              yield* archive.publish({ sessionID, messages: history.slice(archivedIndex + 1) })
              if (currentEntry?.generation === active.generation) currentEntry.archived = history.at(-1)?.info.id
              const activeHistory = MessageV2.filterCompacted(history.toReversed())
              const prepared = yield* prepare({ sessionID, messages: activeHistory, canRecall: pending.canRecall, model })
              // A successful producer replaces the entire prefix. Masking is only the emergency fallback in compact.
              const backend = token.backend
              const request = backend ? undefined : current.requests.get(sessionID)
              const selected = yield* Effect.sync(() => {
                const item = current.sessions.get(sessionID)
                // Later steps may have landed since the start; the snapshot covers the history as it is now.
                if (!live() || !item || item.active !== active) return
                const previous = current.contexts.get(sessionID)
                // Full history is required for incompatible or unavailable prior coverage.
                if (previous && !hasArtifact(previous)) current.contexts.discard(sessionID)
                const prior = prepared.system.length ? previous?.artifact : undefined
                return completeSnapshot(sessionID, activeHistory, prior, pending.canRecall, active.boundary)
              })
              if (!selected) {
                yield* diagnostic(sessionID, active.boundary, "no-current-snapshot")
                yield* result("discarded")
                return "discarded"
              }
              // A turn that started before the last swap replays older memory than this
              // pass edits. Wait for a turn that carries the current memory instead of
              // paying for an uncached isolated request.
              // Host data the producer never writes: delegation registry state and members.
              const children = [...new Set(history.flatMap((item) => item.parts.flatMap((part) => child(part) ?? [])))]
              const delegations = Object.fromEntries(yield* Effect.forEach(children, (id) => Effect.gen(function* () {
                const job = yield* background.get(id)
                const info = yield* sessions.get(SessionID.make(id)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
                return [id, { member: info?.agent, status: job?.status }] as const
              })))
              const member = !!(yield* sessions.get(sessionID).pipe(Effect.catchCause(() => Effect.succeed(undefined))))?.parentID
              if (!live()) return "discarded"
              const { artifact, ...pass } = yield* run(selected, {
                provider: backend || pending.model ? { ...provider, getModel: () => Effect.succeed(model) } : provider,
                 llm: { estimateInput: (backend?.llm ?? llm).estimateInput, stream: (request) => Stream.unwrap(Effect.sync(() => live()
                  ? (backend?.llm ?? llm).stream(request) : Stream.fail(new Error("Continuity backend revision cancelled")))) },
              }, { history, delegations, member }, { parent: request, reviewOverhead: backend ? current.overheads.get(sessionID) : undefined })
              // A review pull may observe ownership loss after the producer finished.
              // That is a stale result, not a provider failure or a breaker strike.
              if (!live()) {
                yield* diagnostic(sessionID, active.boundary, "stale-or-backend-change", pass)
                yield* result("discarded")
                return "discarded"
              }
              // A skip is no producer failure; only a check that failed again on the retry counts.
              if (!artifact) {
                yield* diagnostic(sessionID, active.boundary, pass.failure ?? (pass.skip ? `skipped-${pass.skip}` : "invalid-schema"), pass)
                // Reversible relief on producer failure never claims complete semantic coverage.
                if (live() && pending.canRecall && (yield* stubs(current, sessionID, history, ContinuityMasking.candidates, live))) {
                  yield* result("masked")
                  yield* outcome(false)
                  return "masked"
                }
                yield* result(pass.failure === "input-budget" ? "unmet-span-input-budget" : pass.failure ?? (pass.skip ? "skipped" : "discarded"))
                if (pass.skip && !pass.failure) return "skipped"
                yield* outcome(false)
                return pass.failure === "input-budget" ? "unmet-span-input-budget" : pass.failure ?? "discarded"
              }
              const latest = yield* sessions.messages({ sessionID })
              const applied = yield* Effect.sync(() => {
                const item = current.sessions.get(sessionID)
                if (!live() || !item || item.active !== active || !isCurrent(selected, MessageV2.filterCompacted(latest.toReversed())))
                  return false
                if (
                  artifact.parentID !== sessionID ||
                  artifact.boundary !== selected.boundary ||
                  artifact.version !== 5 ||
                  artifact.coveredThrough !== selected.head.at(-1)?.info.id
                )
                  return false
                if (
                  !current.contexts.set({
                    sessionID,
                    boundary: selected.boundary,
                    text: artifact.text,
                    artifact,
                  })
                )
                  return false
                item.refresh = false
                return true
              })
              if (!applied) {
                  yield* diagnostic(sessionID, active.boundary, "stale-or-backend-change", pass)
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
                diagnostic(sessionID, active.boundary, Cause.hasInterruptsOnly(cause) ? "cancelled" :
                  Cause.squash(cause) instanceof Archive.ArchiveError ? "archive" : "maintenance").pipe(
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
          }) : finish,
        ).pipe(
          Effect.ensuring(Deferred.succeed(active.registered, undefined)),
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
        const parent = current.requests.get(input.sessionID)
        if (parent) ParentReceipt.complete(parent, input.message)
        if (current.backends.get(input.sessionID) === null) return
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
      if (current.backends.get(sessionID) === null) return "disabled" as const
      yield* restore(current, sessionID)
      yield* settle(current, sessionID)
      const last = (yield* sessions.messages({ sessionID })).findLast((message) =>
        message.info.role === "assistant" && isSafe(message.info))?.info
      if (!last || last.role !== "assistant") return "fits" as const
      const model = input.model ?? (yield* resolve(current, sessionID, last.providerID, last.modelID).pipe(Effect.orDie))
      const limit = hardLimit(model)
      // The context the next request would carry: memory, masks and native tail, plus the measured system and tools.
      const pressure = Effect.gen(function* () {
        const stored = yield* sessions.messages({ sessionID })
        const history = MessageV2.filterCompacted(stored.toReversed())
        const view = yield* prepare({ sessionID, messages: history, canRecall: input.canRecall, model })
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
      yield* schedule(current, sessionID, { message: last, canRecall: input.canRecall === true, model })
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
    }, Effect.catchCause((cause) => Effect.logWarning("continuity compact failed", { reason: Cause.hasInterruptsOnly(cause) ? "cancelled" : "maintenance" }).pipe(
      Effect.as("over" as const))))

    const latest = (history: SessionV1.WithParts[]) => {
      if (!history.length) return undefined
      const captured = completeSnapshot(history[0].info.sessionID, history)
      const info = captured?.covered?.at(-1)?.info
      return info?.role === "assistant" ? info : undefined
    }
    const admit = ContinuityAdmission.create({ prepare, settle: (id) => InstanceState.get(state).pipe(Effect.flatMap((current) => settle(current, id))),
      history: (sessionID) => sessions.messages({ sessionID }).pipe(Effect.map((history) => MessageV2.filterCompacted(history.toReversed())), Effect.orDie), latest,
      current: (sessionID) => sessions.messages({ sessionID }).pipe(Effect.map(RequestSource.latest), Effect.orDie),
      candidate: (id) => Effect.gen(function* () {
        const current = yield* InstanceState.get(state)
        if (!(yield* enabled).enabled || current.backends.get(id) === null)
          return { epoch: current.epochs.get(id) ?? 0, generation: entry(current, id).generation }
        yield* restore(current, id)
        const context = current.contexts.get(id)
        const history = context?.artifact?.version === 5 ? yield* sessions.messages({ sessionID: id }).pipe(Effect.orDie) : undefined
        return { boundary: context?.artifact?.version === 5 && current.contexts.get(id) === context && history &&
          completeIndex(context, MessageV2.filterCompacted(history.toReversed())) !== undefined ? context.boundary : undefined,
          admitted: current.sessions.get(id)?.admittedBoundary, epoch: current.epochs.get(id) ?? 0, generation: entry(current, id).generation }
      }),
      compact: (sessionID, canRecall, model) => compact({ sessionID, canRecall, force: true, model }),
      commit: (id, boundary, epoch, generation) => Effect.gen(function* () {
        const current = yield* InstanceState.get(state)
        const history = yield* sessions.messages({ sessionID: id }).pipe(Effect.orDie)
        const context = current.contexts.get(id)
        const activeHistory = MessageV2.filterCompacted(history.toReversed())
        if ((current.epochs.get(id) ?? 0) !== epoch || current.sessions.get(id)?.generation !== generation ||
          !context || context.boundary !== boundary || completeIndex(context, activeHistory) === undefined || latest(activeHistory)?.id !== boundary) return false
        entry(current, id).admittedBoundary = boundary
        entry(current, id).refresh = false
        return true
      }), fits: (id, view, selected) => Effect.gen(function* () {
        if (!(yield* enabled).enabled) return true
        const current = yield* InstanceState.get(state)
        if (current.backends.get(id) === null) return true
        const user = RequestSource.latest(view.messages)?.info
        if (!user || user.role !== "user") return true
        const model = selected ?? (yield* resolve(current, id, user.model.providerID, user.model.modelID).pipe(Effect.orDie))
        const sent = yield* MessageV2.toModelMessagesEffect(view.messages, model).pipe(Effect.orDie)
        return (current.overheads.get(id) ?? 0) + Token.estimate(view.system.join("\n")) + estimate(sent) < hardLimit(model)
      }) })
    return Service.of({ configure, pause, cancel, release, prepare, admit, start, observe, compact, advance, invalidate, forget })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Session.node, BackgroundJob.node, Provider.node, LLM.node, Archive.node, Config.node],
})
