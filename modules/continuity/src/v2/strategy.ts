export * as ContinuityStrategy from "./strategy"

import { LLMClient, type LLMError, type LLMEvent, type LLMRequest, type Message, type Model } from "@orchestra/llm"
import { Context, Deferred, Effect, Layer, Scope, type Stream } from "effect"
import { Config } from "@orchestra/core/config"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { llmClient } from "@orchestra/core/effect/app-node-platform"
import { EventV2 } from "@orchestra/core/event"
import { SessionCompaction, SessionEvent, SessionStore, SessionSubagentModels, SessionV2 } from "@orchestra/core/session"
import { estimate } from "../masking-rules"
import { ContinuityArchive } from "./archive"
import { ContinuityMaskingV2 } from "./masking"

// A background summary starts once a step's usage reaches this share of the context window.
export const DEFAULT_TRIGGER = 0.4

// Past this share the request is in bad shape: old tool output is masked before it is sent. Not configurable; a model
// whose output reservation leaves less room lowers it to its input limit.
export const HARD_LIMIT = 0.7

// After this many consecutive failed background summaries, stop starting them for the Session.
export const MAX_FAILURES = 3

export type Settings = { readonly enabled: boolean; readonly trigger: number }

/** Resolve `continuity` settings; an invalid trigger falls back to the default. */
export function settings(entries: readonly Config.Entry[]): Settings {
  const value = Config.latest(entries, "continuity")
  const trigger = value?.trigger
  return {
    enabled: value?.enabled !== false,
    trigger:
      trigger !== undefined && Number.isFinite(trigger) && trigger > 0 && trigger < HARD_LIMIT
        ? trigger
        : DEFAULT_TRIGGER,
  }
}

/** Request size at which old tool output is masked before the request is sent; Infinity without a known window. */
export function hardLimit(model: Model) {
  const context = model.route.defaults.limits?.context
  if (context === undefined || context <= 0) return Infinity
  const output = model.route.defaults.limits?.output ?? 0
  return Math.max(0, Math.floor(Math.min(HARD_LIMIT * context, context - output)))
}

/** The context a settled step used: input, cache and output, as the provider reported it. */
export function tokenCount(tokens: EventV2.Data<typeof SessionEvent.Step.Ended>["tokens"]) {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0)
  return safe(tokens.input) + safe(tokens.cache.read) + safe(tokens.cache.write) + safe(tokens.output) + safe(tokens.reasoning)
}

export type Session = {
  readonly masks: Map<string, string>
  loaded: boolean
  model?: Model
  /** The latest provider turn's compaction input; a background summary reuses its model and transport. */
  last?: SessionCompaction.Input
  /** The running background summary; it resolves true when it recorded a summary. */
  running?: Deferred.Deferred<boolean>
  /** A background summary landed since the last turn check: that turn restarts on the compacted history. */
  landed: boolean
  failures: number
  /** A requested compaction (`context_compact`) waiting for the next provider turn. */
  requested: boolean
}

export interface Interface {
  readonly settings: Settings
  readonly session: (sessionID: SessionV2.ID) => Session
}

/** Per-Location continuity state shared by the compaction strategy and the context tools. */
export class Service extends Context.Service<Service, Interface>()("@orchestra/continuity/v2/State") {}

/** Continuity state for one Location: settings and per-Session masks, summaries and requests. */
export function state(value: Settings): Interface {
  const sessions = new Map<SessionV2.ID, Session>()
  return {
    settings: value,
    session: (sessionID) => {
      const found = sessions.get(sessionID)
      if (found) return found
      const created: Session = { masks: new Map(), loaded: false, failures: 0, requested: false, landed: false }
      sessions.set(sessionID, created)
      return created
    },
  }
}

export const stateNode = makeLocationNode({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const config = yield* Config.Service
      return Service.of(state(settings(yield* config.entries())))
    }),
  ),
  deps: [Config.node],
})

type Dependencies = {
  readonly events: EventV2.Interface
  readonly llm: { readonly stream: (request: LLMRequest) => Stream.Stream<LLMEvent, LLMError> }
  readonly config: readonly Config.Entry[]
  readonly subagentModels: SessionSubagentModels.Interface
  readonly store: SessionStore.Interface
  readonly state: Interface
  /** Owns background summaries; closing it interrupts them. */
  readonly scope: Scope.Scope
}

/** Raised inside a background summary whose Session changed while it ran; the summary is dropped. */
class Stale {}

export function make(dependencies: Dependencies): SessionCompaction.Interface {
  const core = SessionCompaction.make(dependencies)
  if (!dependencies.state.settings.enabled)
    return { ...core, transform: (input) => Effect.succeed(input.messages), afterStep: () => Effect.void }
  const trigger = dependencies.state.settings.trigger

  const load = Effect.fnUntraced(function* (sessionID: SessionV2.ID, session: Session) {
    if (session.loaded) return
    session.loaded = true
    const stored = yield* ContinuityArchive.readMasks(sessionID).pipe(
      Effect.catch((error) =>
        Effect.logWarning("continuity masks unavailable", { sessionID, reason: error.reason }).pipe(Effect.as([])),
      ),
    )
    for (const [call, reference] of stored) session.masks.set(call, reference)
  })

  // Archive every selected result before its mask exists: a mask always points at recoverable output.
  const mask = Effect.fnUntraced(function* (
    sessionID: SessionV2.ID,
    session: Session,
    messages: readonly Message[],
    select: typeof ContinuityMaskingV2.candidates,
  ) {
    const found = select(messages, session.masks)
    if (found.length === 0) return 0
    const written = found.map((candidate) => ({ candidate, chunks: ContinuityMaskingV2.chunks(sessionID, candidate) }))
    return yield* ContinuityArchive.publish(
      sessionID,
      written.flatMap((item) => item.chunks),
    ).pipe(
      Effect.andThen(
        Effect.sync(() => written.forEach((item) => session.masks.set(item.candidate.result.id, item.chunks[0].id))),
      ),
      Effect.andThen(Effect.suspend(() => ContinuityArchive.writeMasks(sessionID, [...session.masks]))),
      Effect.as(found.length),
      Effect.catch((error) =>
        Effect.logWarning("continuity masking skipped", { sessionID, reason: error.reason }).pipe(Effect.as(0)),
      ),
    )
  })

  /** Masks old output until the request fits the hard limit; `force` masks every old result. True when it masked. */
  const relieve = Effect.fnUntraced(function* (input: SessionCompaction.Input, force: boolean) {
    const session = dependencies.state.session(input.sessionID)
    yield* load(input.sessionID, session)
    const limit = hardLimit(input.model)
    const size = () =>
      estimate({
        system: input.request.system,
        messages: ContinuityMaskingV2.apply(input.request.messages, session.masks),
        tools: input.request.tools,
      })
    if (!force && size() < limit) return false
    const masked = force ? 0 : yield* mask(input.sessionID, session, input.request.messages, ContinuityMaskingV2.candidates)
    if (!force && size() < limit) return masked > 0
    return masked + (yield* mask(input.sessionID, session, input.request.messages, ContinuityMaskingV2.urgent)) > 0
  })

  // A running background summary finishes first. A summary that landed after the turn read its context restarts the
  // turn; one restart at most, since the flag is consumed.
  const landed = (session: Session) =>
    (session.running ? Deferred.await(session.running) : Effect.void).pipe(
      Effect.andThen(
        Effect.sync(() => {
          const value = session.landed
          session.landed = false
          return value
        }),
      ),
    )

  const succeeded = (session: Session) => (compacted: boolean) =>
    Effect.sync(() => {
      if (compacted) session.failures = 0
      return compacted
    })

  const background = Effect.fnUntraced(function* (sessionID: SessionV2.ID, last: SessionCompaction.Input) {
    const messages = yield* dependencies.store.context(sessionID)
    const snapshot = JSON.stringify(messages)
    // The summary replaces everything before it: record it only if the Session did not change while it ran.
    const events: EventV2.Interface = {
      ...dependencies.events,
      publish: (definition, data, options) =>
        definition.type !== SessionEvent.Compaction.Ended.type
          ? dependencies.events.publish(definition, data, options)
          : dependencies.store.context(sessionID).pipe(
              Effect.orDie,
              Effect.flatMap((current) =>
                JSON.stringify(current) === snapshot
                  ? dependencies.events.publish(definition, data, options)
                  : Effect.die(new Stale()),
              ),
            ),
    }
    const pass = SessionCompaction.make({ ...dependencies, events })
    const compacted = yield* pass.compactAfterOverflow({
      ...last,
      entries: messages.map((message, seq) => ({ seq, message })),
    })
    return compacted ? ("committed" as const) : ("failed" as const)
  })

  const start = (sessionID: SessionV2.ID, session: Session, last: SessionCompaction.Input) =>
    Effect.gen(function* () {
      const done = Deferred.makeUnsafe<boolean>()
      session.running = done
      yield* background(sessionID, last).pipe(
        Effect.catchDefect((defect) => (defect instanceof Stale ? Effect.succeed("stale" as const) : Effect.die(defect))),
        Effect.catch(() => Effect.succeed("failed" as const)),
        Effect.tap((outcome) =>
          Effect.gen(function* () {
            if (outcome === "committed") {
              session.failures = 0
              session.landed = true
            }
            if (outcome !== "failed") return
            session.failures++
            if (session.failures === MAX_FAILURES) yield* Effect.logWarning("continuity circuit open", { sessionID })
          }),
        ),
        Effect.onExit((exit) =>
          Effect.sync(() => {
            if (session.running === done) session.running = undefined
            Deferred.doneUnsafe(done, Effect.succeed(exit._tag === "Success" && exit.value === "committed"))
          }),
        ),
        Effect.forkIn(dependencies.scope, { startImmediately: true }),
      )
    })

  return {
    compact: Effect.fn("ContinuityStrategy.compact")(function* (input) {
      const session = dependencies.state.session(input.sessionID)
      if (yield* landed(session)) return true
      if (yield* core.compact(input).pipe(Effect.flatMap(succeeded(session)))) return true
      return yield* relieve(input, true)
    }),
    compactIfNeeded: Effect.fn("ContinuityStrategy.compactIfNeeded")(function* (input) {
      const session = dependencies.state.session(input.sessionID)
      session.last = input
      if (yield* landed(session)) return true
      if (session.requested) {
        session.requested = false
        if (yield* core.compact(input).pipe(Effect.flatMap(succeeded(session)))) return true
        return yield* relieve(input, true)
      }
      if (yield* core.compactIfNeeded(input).pipe(Effect.flatMap(succeeded(session)))) return true
      // True restarts the turn so the new masks apply; masks only grow, so this cannot repeat forever.
      return yield* relieve(input, false)
    }),
    compactAfterOverflow: Effect.fn("ContinuityStrategy.compactAfterOverflow")(function* (input) {
      const session = dependencies.state.session(input.sessionID)
      if (yield* landed(session)) return true
      if (yield* core.compactAfterOverflow(input).pipe(Effect.flatMap(succeeded(session)))) return true
      return yield* relieve(input, true)
    }),
    transform: Effect.fn("ContinuityStrategy.transform")(function* (input) {
      const session = dependencies.state.session(input.sessionID)
      session.model = input.model
      yield* load(input.sessionID, session)
      const limit = hardLimit(input.model)
      const fits = () => estimate(ContinuityMaskingV2.apply(input.messages, session.masks)) < limit
      if (!fits()) yield* mask(input.sessionID, session, input.messages, ContinuityMaskingV2.candidates)
      if (!fits()) yield* mask(input.sessionID, session, input.messages, ContinuityMaskingV2.urgent)
      return ContinuityMaskingV2.apply(input.messages, session.masks)
    }),
    afterStep: Effect.fn("ContinuityStrategy.afterStep")(function* (input) {
      const session = dependencies.state.session(input.sessionID)
      const context = session.model?.route.defaults.limits?.context
      if (context === undefined || context <= 0 || !session.last || session.running) return
      if (session.failures >= MAX_FAILURES || tokenCount(input.tokens) < context * trigger) return
      yield* start(input.sessionID, session, session.last)
    }),
  }
}

/** Replaces core `SessionCompaction.node`; with `continuity.enabled: false` it behaves exactly as the core default. */
export const node = makeLocationNode({
  service: SessionCompaction.Service,
  layer: Layer.effect(
    SessionCompaction.Service,
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const llm = yield* LLMClient.Service
      const subagentModels = yield* SessionSubagentModels.Service
      const config = yield* Config.Service
      const store = yield* SessionStore.Service
      const shared = yield* Service
      const scope = yield* Scope.Scope
      return SessionCompaction.Service.of(
        make({ events, llm, subagentModels, config: yield* config.entries(), store, state: shared, scope }),
      )
    }),
  ),
  deps: [EventV2.node, llmClient, SessionSubagentModels.node, Config.node, SessionStore.node, stateNode],
})
