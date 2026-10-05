export * as SessionContinuity from "./service"

import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import type { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { Archive } from "./archive"
import { chunks } from "./transcript"
import { Token } from "@/util/token"
import { Cause, Context, Effect, Layer, Scope } from "effect"
import { create } from "./context"
import { run, snapshot, type ParentRequest } from "./fork"
import { hasArtifact, isCurrent } from "./model"
import { isSafe, settings, shouldStart, tokenCount } from "./trigger"
import { apply as applyMasks, candidates as maskCandidates } from "./masking"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

type Active = { generation: number; boundary: MessageID }
type Pending = { message: SessionV1.Assistant; canRecall: boolean }
type Entry = {
  generation: number
  safe?: MessageID
  active?: Active
  pending?: Pending
  attempted?: MessageID
  refresh: boolean
  archived?: MessageID
}
type State = {
  sessions: Map<SessionID, Entry>
  contexts: ReturnType<typeof create>
  scope: Scope.Scope
  /** Latest parent model request per session, kept so maintenance can reuse its prompt cache. */
  requests: Map<SessionID, ParentRequest>
  /** Masked tool part IDs per session, mapped to the archive reference with the full output. */
  masks: Map<SessionID, Map<string, string>>
}

// Background memory starts this far below the trigger; masking alone that reaches it skips the fork.
const PREPARE_MARGIN = 0.15

// Requests hold whole message arrays; keep only the most recently active sessions.
const MAX_OBSERVED_REQUESTS = 4

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
  readonly advance: (sessionID: SessionID) => Effect.Effect<void>
  readonly invalidate: (sessionID: SessionID) => Effect.Effect<void>
  readonly forget: (sessionID: SessionID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionContinuity") {}

function entry(state: State, sessionID: SessionID) {
  const existing = state.sessions.get(sessionID)
  if (existing) return existing
  const next: Entry = { generation: 0, refresh: false }
  state.sessions.set(sessionID, next)
  return next
}

// Provider causes may contain conversation content. Keep diagnostics structural.
function diagnostic(sessionID: SessionID, boundary: MessageID | undefined, reason: string) {
  return Effect.logWarning("continuity maintenance", { sessionID, boundary, reason })
}

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
      return { sessions: new Map<SessionID, Entry>(), contexts: create(), scope, requests: new Map(), masks: new Map() }
    }))

    const prepare: Interface["prepare"] = Effect.fn("SessionContinuity.prepare")(function* (input) {
      // Disabling continuity also stops using memory and masks applied earlier.
      if (!(yield* enabled).enabled) return { messages: input.messages, system: [] }
      const view = yield* memory(input)
      // Stubs point at archived output; without recall the full history stays native.
      if (input.canRecall !== true) return view
      const masks = (yield* InstanceState.get(state)).masks.get(input.sessionID)
      return masks?.size ? { ...view, messages: applyMasks(view.messages, masks) } : view
    })

    const memory = Effect.fn("SessionContinuity.memory")(function* (input: Parameters<Interface["prepare"]>[0]) {
      const current = yield* InstanceState.get(state)
      const prepared = current.contexts.prepare(input.sessionID, input.messages, input.canRecall)
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
      if (Token.estimate(prepared.system.join("\n") + JSON.stringify(prepared.messages)) + 2048 > capacity)
        return { messages: input.messages, system: [] }
      const available = yield* Effect.forEach(artifact.references, (reference) =>
        archive.read({ sessionID: input.sessionID, id: reference.id }).pipe(
          Effect.map((chunk) => !!chunk), Effect.catch(() => Effect.succeed(false)),
        ))
      const unchanged = current.sessions.get(input.sessionID) === item && item?.generation === generation &&
        current.contexts.get(input.sessionID)?.artifact === artifact
      return unchanged && available.every(Boolean) ? prepared : { messages: input.messages, system: [] }
    })

    const observe: Interface["observe"] = Effect.fn("SessionContinuity.observe")(function* (input) {
      const current = yield* InstanceState.get(state)
      yield* Effect.sync(() => {
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
      current.masks.delete(sessionID)
      const item = entry(current, sessionID)
      item.attempted = undefined
      item.refresh = true
      item.archived = undefined
    })

    const forget: Interface["forget"] = Effect.fn("SessionContinuity.forget")(function* (sessionID) {
      const current = yield* InstanceState.get(state)
      current.contexts.discard(sessionID)
      current.sessions.delete(sessionID)
      current.requests.delete(sessionID)
      current.masks.delete(sessionID)
    })

    const schedule = (current: State, sessionID: SessionID, pending: Pending,
      expected?: { entry: Entry; generation: number }): Effect.Effect<void> =>
      Effect.gen(function* () {
        const message = pending.message
        const options = yield* enabled
        if (!options.enabled) return
        const context = yield* provider.getModel(message.providerID, message.modelID).pipe(
          Effect.map((model) => model.limit.context),
          Effect.orElseSucceed(() => 0),
        )
        const active = yield* Effect.sync(() => {
          const item = current.sessions.get(sessionID)
          if (!item || expected && (item !== expected.entry || item.generation !== expected.generation)) return
          if (item.active || item.safe !== message.id || item.attempted === message.id) return
          const previous = current.contexts.get(sessionID)
          if (previous && !hasArtifact(previous)) {
            current.contexts.discard(sessionID)
            item.refresh = true
          }
          if (current.contexts.get(sessionID)?.boundary === message.id) return
          if (!item.refresh && !shouldStart({ tokens: tokenCount(message.tokens), active: false, context,
            trigger: options.trigger })) return
          const active: Active = { generation: item.generation, boundary: message.id }
          item.active = active
          item.attempted = message.id
          item.pending = undefined
          return active
        })
        if (!active) return

        const finish = Effect.gen(function* () {
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
              const masked = yield* Effect.sync(() => {
                const item = current.sessions.get(sessionID)
                if (!item || item.active !== active || item.generation !== active.generation) return 0
                const masks = current.masks.get(sessionID) ?? new Map<string, string>()
                let freed = 0
                for (const candidate of maskCandidates(prepared.messages, masks)) {
                  const reference = firstFragment.get(candidate.messageID)
                  if (reference === undefined) continue
                  masks.set(candidate.part.id, reference)
                  freed += candidate.saved
                }
                if (masks.size) current.masks.set(sessionID, masks)
                return freed
              })
              if (masked > 0 && tokenCount(message.tokens) - masked <= context * (options.trigger - PREPARE_MARGIN)) {
                yield* Effect.logInfo("continuity masked tool output", { sessionID, freed: masked })
                return "masked"
              }
              const selected = yield* Effect.sync(() => {
                const item = current.sessions.get(sessionID)
                if (
                  !item ||
                  item.active !== active ||
                  item.generation !== active.generation ||
                  item.safe !== active.boundary ||
                  history.at(-1)?.info.id !== active.boundary
                )
                  return
                const previous = current.contexts.get(sessionID)
                // Full history is required for incompatible or unavailable prior coverage.
                if (previous && !hasArtifact(previous)) current.contexts.discard(sessionID)
                return snapshot(
                  sessionID,
                  activeHistory,
                  prepared.system.length ? previous?.artifact : undefined,
                  pending.canRecall,
                  headBudget,
                )
              })
              if (!selected) {
                yield* diagnostic(sessionID, active.boundary, "no-current-snapshot")
                return "discarded"
              }
              const selectedChunks = chunks(sessionID, selected.head)
              const previousRefs = selected.previous?.references ?? []
              const available = [...new Map([...selectedChunks, ...previousRefs].map((ref) => [ref.id, ref])).values()]
              for (const reference of available) {
                if (!(yield* archive.read({ sessionID, id: reference.id }))) {
                  yield* diagnostic(sessionID, active.boundary, "archive-unavailable")
                  return "discarded"
                }
              }
              const artifact = yield* run(selected, { provider, llm }, selectedChunks, available, current.requests.get(sessionID))
              if (!artifact) {
                yield* diagnostic(sessionID, active.boundary, "invalid-artifact")
                return "discarded"
              }
              const latest = (yield* sessions.messages({ sessionID })).at(-1)?.info.id
              const applied = yield* Effect.sync(() => {
                const item = current.sessions.get(sessionID)
                if (
                  !item ||
                  item.active !== active ||
                  item.generation !== active.generation ||
                  item.safe !== active.boundary ||
                  selected.boundary !== active.boundary ||
                  !isCurrent(selected, latest)
                )
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
                item.refresh = !!snapshot(sessionID, activeHistory, artifact, pending.canRecall, headBudget)
                return true
              })
              if (!applied) {
                yield* diagnostic(sessionID, active.boundary, "stale-or-mismatched-artifact")
                return "discarded"
              }
              return "applied"
            }).pipe(
              Effect.catchCause((cause) =>
                diagnostic(sessionID, active.boundary, Cause.hasInterruptsOnly(cause) ? "cancelled" : "failed").pipe(
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
        if (!isSafe(input.message) || input.message.sessionID !== input.sessionID || input.canRecall !== true) return
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

    return Service.of({ prepare, start, observe, advance, invalidate, forget })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Session.node, BackgroundJob.node, Provider.node, LLM.node, Archive.node, Config.node],
})
