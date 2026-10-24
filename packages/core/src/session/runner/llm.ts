import {
  LLM,
  LLMClient,
  LLMError,
  LLMEvent,
  Message,
  SystemPart,
  isContextOverflowFailure,
  type ProviderErrorEvent,
  type ToolCall,
} from "@orchestra/llm"
import { Cause, Context, DateTime, Duration, Effect, Fiber, FiberSet, Layer, Option, Ref, Semaphore, Stream } from "effect"
import { AgentV2 } from "../../agent"
import { CapabilityInvocation } from "../../capability/invocation"
import { Config } from "../../config"
import { Database } from "../../database/database"
import { EventV2 } from "../../event"
import { Location } from "../../location"
import { ModelV2 } from "../../model"
import { PermissionV2 } from "../../permission"
import { ProviderV2 } from "../../provider"
import { QuestionV2 } from "../../question"
import { SystemContext } from "../../system-context/index"
import { SystemContextRegistry } from "../../system-context/registry"
import { SkillGuidance } from "../../skill/guidance"
import { ReferenceGuidance } from "../../reference/guidance"
import { ToolRegistry } from "../../tool/registry"
import { TaskGovernance } from "../../tool/task-governance"
import { Mcp } from "../../mcp"
import { ToolOutputStore } from "../../tool-output-store"
import { SessionContextEpoch } from "../context-epoch"
import { SessionCompaction } from "../compaction"
import { SessionEvent } from "../event"
import { SessionHistory } from "../history"
import { SessionInput } from "../input"
import { SessionMessage } from "../message"
import { SessionSchema } from "../schema"
import { SessionStore } from "../store"
import { SessionSubagentModels } from "../subagent-models"
import { INTERRUPTED_TURN, type RunError, Service } from "./index"
import { SessionRunnerModel } from "./model"
import { createLLMEventPublisher } from "./publish-llm-event"
import { ExecutionHost } from "./execution-host"
import { toLLMMessages } from "./to-llm-message"
import { SessionMentions } from "./mentions"
import { SessionTitle } from "./title"
import { ReadToolFileSystem } from "../../tool/read-filesystem"
import { MAX_STEPS_PROMPT } from "./max-steps"
import { Snapshot } from "../../snapshot"
import { makeLocationNode } from "../../effect/app-node"
import { llmClient } from "../../effect/app-node-platform"
import { RelayWorkflowSession } from "../../relay-workflow-session"
import { FSUtil } from "../../fs-util"
import { AppProcess } from "../../process"
import { SkillV2 } from "../../skill"
import { SkillTool } from "../../tool/skill"
import { BashTool } from "../../tool/bash"
import { ChildProcess } from "effect/unstable/process"

/**
 * Runs one durable coding-agent Session until it settles.
 *
 * Keep this as orchestration over smaller collaborators rather than rebuilding the legacy
 * `SessionPrompt` monolith. Implement the unchecked items in small reviewed slices:
 *
 * - Session ownership and controls
 *   - [x] Coordinate one local active drain per Session; explicit resumes join and prompt wakeups coalesce.
 *   - [ ] Replace local ownership with durable multi-node ownership when clustered.
 *   - [ ] Mark busy, retrying, idle, interrupted, or terminal-failure status durably.
 *   - [ ] Honor interruption and reject stale work after runtime attachment replacement.
 *   - [x] Honor optional agent step limits.
 *   - [ ] Bound provider retries and repeated identical tool calls.
 *
 * - Runtime context assembly
 *   - Track V1 runtime-context parity canonically in `docs/specs/v2/session.md`.
 *
 * - One provider turn
 *   - [x] Translate every projected V2 Session message variant into canonical
 *     `@orchestra/llm` messages.
 *   - [ ] Resolve policy-filtered built-in, MCP, plugin, and structured-output tool definitions.
 *   - [x] Stream exactly one `llm.stream(request)` provider turn.
 *   - [x] Persist assistant text and usage events incrementally as they arrive.
 *   - [ ] Persist snapshots, patches, and retry notices incrementally as they arrive.
 *   - [x] Persist reasoning, provider errors, and tool-call events incrementally as they arrive.
 *
 * - Tool settlement and continuation
 *   - [x] Durably record each tool call before side effects begin.
 *   - [x] Authorize and execute recorded local calls through a core-owned registry hook.
 *   - [x] Persist typed success, failure, and provider-executed tool outcomes.
 *   - [x] Start each recorded local call eagerly and await all settlements before continuation.
 *   - [ ] Add scoped runtime context, progress updates, attachment normalization,
 *     plugins, and cancellation settlement.
 *   - [x] Reload projected history and start the next explicit provider turn after local tool results.
 *   - [x] Continue for durable user steering accepted during an active provider turn.
 *   - [ ] Continue for compaction or another continuation condition when required.
 *
 * - Post-run maintenance
 *   - [ ] Settle final status and expose durable output events to replayable consumers.
 *   - [ ] Coalesce streamed deltas and add covering projected-history indexes.
 *   - [ ] Update title, summaries, compaction state, and cleanup in bounded background work.
 *
 * Use `llm.stream(request)` for each provider turn. Keep tool execution and continuation here.
 * Durable continuation recovery remains a separate future slice with an explicit retry policy.
 *
 * The current slice loads V2 history, translates it, resolves a model through a core service, and persists one
 * provider turn. Registry definitions are advertised, local tool calls are settled durably, and an
 * explicit loop starts the next provider turn after local settlement. Configured agent step limits bound the loop.
 */

const SHELL_OUTPUT_BYTES = 1024 * 1024

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const llm = yield* LLMClient.Service
    const agents = yield* AgentV2.Service
    const tools = yield* ToolRegistry.Service
    const mcp = yield* Mcp.Service
    const reader = yield* ReadToolFileSystem.Service
    const models = yield* SessionRunnerModel.Service
    const subagentModels = yield* SessionSubagentModels.Service
    const store = yield* SessionStore.Service
    const location = yield* Location.Service
    const systemContext = yield* SystemContextRegistry.Service
    const skillGuidance = yield* SkillGuidance.Service
    const referenceGuidance = yield* ReferenceGuidance.Service
    const config = yield* Config.Service
    const snapshots = yield* Snapshot.Service
    const database = yield* Database.Service
    const hosts = yield* ExecutionHost.Service
    const permissions = yield* PermissionV2.Service
    const fs = yield* FSUtil.Service
    const appProcess = yield* AppProcess.Service
    const skills = yield* SkillV2.Service
    const workflowHosts = yield* RelayWorkflowSession.Service
    const nativeHost = yield* RelayWorkflowSession.NativeHost
    const workflowContext = Context.make(Database.Service, database).pipe(
      Context.add(RelayWorkflowSession.Service, workflowHosts),
      Context.add(RelayWorkflowSession.NativeHost, nativeHost),
    )
    const db = database.db
    const compaction = yield* SessionCompaction.Service
    const governance = yield* TaskGovernance.Service
    const nameSession = SessionTitle.make({ db, events, store, agents, models, subagentModels, llm })
    const getSession = Effect.fn("SessionRunner.getSession")(function* (sessionID: SessionSchema.ID) {
      const session = yield* store.get(sessionID).pipe(
        Effect.catchDefect((cause) =>
          cause instanceof SessionSubagentModels.StorageError ? Effect.fail(cause) : Effect.die(cause),
        ),
      )
      if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
      return session
    })

    const getContext = Effect.fn("SessionRunner.getContext")(function* (sessionID: SessionSchema.ID) {
      return yield* store.context(sessionID)
    })
    const failInterruptedTools = Effect.fn("SessionRunner.failInterruptedTools")(function* (
      sessionID: SessionSchema.ID,
    ) {
      for (const message of yield* getContext(sessionID)) {
        if (message.type !== "assistant") continue
        for (const tool of message.content) {
          if (tool.type !== "tool" || (tool.state.status !== "pending" && tool.state.status !== "running")) continue
          yield* events.publish(SessionEvent.Tool.Failed, {
            sessionID,
            timestamp: yield* DateTime.now,
            assistantMessageID: message.id,
            callID: tool.id,
            error: { type: "unknown", message: "Tool execution interrupted" },
            provider: {
              executed: tool.provider?.executed === true,
              ...(tool.provider?.metadata === undefined ? {} : { metadata: tool.provider.metadata }),
            },
          })
        }
      }
    })

    const awaitToolFibers = (fibers: FiberSet.FiberSet<void, ToolOutputStore.Error>) =>
      FiberSet.join(fibers)

    // Match V1: declining a user prompt halts the loop instead of becoming model-facing tool output.
    const isUserDeclined = (cause: Cause.Cause<unknown>) =>
      cause.reasons.some(
        (reason) =>
          Cause.isDieReason(reason) &&
          (reason.defect instanceof PermissionV2.DeclinedError || reason.defect instanceof QuestionV2.RejectedError),
      )

    type TurnTransition =
      // Automatic compaction completed; rebuild the request from compacted history.
      | { readonly _tag: "ContinueAfterCompaction"; readonly step: number }
      // Overflow compaction completed; rebuild once through the path without overflow recovery.
      | { readonly _tag: "ContinueAfterOverflowCompaction"; readonly step: number }

    class TurnTransitionError extends Error {
      constructor(readonly transition: TurnTransition) {
        super()
      }
    }

    const continueAfterCompaction = (step: number) => new TurnTransitionError({ _tag: "ContinueAfterCompaction", step })
    const continueAfterOverflowCompaction = (step: number) =>
      new TurnTransitionError({ _tag: "ContinueAfterOverflowCompaction", step })

    const loadSystemContext = (agent: AgentV2.Selection) =>
      Effect.all([systemContext.load(), skillGuidance.load(agent), referenceGuidance.load()], {
        concurrency: "unbounded",
      }).pipe(Effect.map(SystemContext.combine))

    // Shared semaphore for publication across turns (created once per runner)
    const publicationSemaphore = yield* Semaphore.make(1)
    const withPublication = publicationSemaphore.withPermit

    const runTurnAttempt = Effect.fn("SessionRunner.runTurn")(function* (
      sessionID: SessionSchema.ID,
      promotion: SessionInput.Delivery | undefined,
      step: number,
      recoverOverflow?: typeof compaction.compactAfterOverflow,
    ) {
      const session = yield* getSession(sessionID)
      if (session.location.directory !== location.directory || session.location.workspaceID !== location.workspaceID)
        return yield* Effect.interrupt
      // A refusal fails the drain before any input is promoted; `run` records it as the turn's error.
      yield* governance.beforeTurn(session)
      const agent = yield* agents.select(session.agent)
      // A Session's own rules follow its agent's, as V1 merged them, so a Session rule wins over the agent's.
      const effectiveRules = [
        ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
        ...(yield* store.permissions(session.id)),
      ]
      const initialized = yield* SessionContextEpoch.initialize(db, loadSystemContext(agent), session.id)
      const toolFibers = yield* FiberSet.make<void, ToolOutputStore.Error>()
      yield* Effect.addFinalizer(() => FiberSet.interruptAll(toolFibers))
      const toolFiberRef = yield* Ref.make<ReadonlyArray<Fiber.RuntimeFiber<ToolRegistry.Settlement, ToolOutputStore.Error>>>([])
      let needsContinuation = false
      let currentStep = step
      if (promotion) {
        const cutoff = yield* EventV2.latestSequence(db, session.id)
        let promoted = 0
        if (promotion === "steer") promoted = yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        if (promotion === "queue") {
          // V2: promote exactly ONE queued input at the idle boundary
          promoted += Number(yield* SessionInput.promoteNextQueued(db, events, session.id))
          // Steers are promoted separately in "steer" promotion; don't promote them here
        }
        if (promoted > 0) {
          currentStep = 1
          // Beside the turn, as V1 named a Session after its first prompt; a failed title leaves the default one.
          yield* nameSession(session.id).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Session title generation failed", cause).pipe(
                Effect.annotateLogs({ sessionID: session.id }),
              ),
            ),
            Effect.forkDetach,
          )
          // Attachments are read once, as they are promoted; the admitted prompt keeps its URIs.
          for (const input of yield* SessionInput.promotedAfter(db, session.id, cutoff)) {
            const mentions = yield* SessionMentions.read({ reader, mcp, fs }, input.prompt)
            if (mentions.text)
              yield* events.publish(SessionEvent.Synthetic, {
                sessionID: session.id,
                messageID: SessionMessage.ID.create(),
                timestamp: yield* DateTime.now,
                text: mentions.text,
                ...(mentions.files.length === 0 ? {} : { files: mentions.files }),
              })
          }
        }
      }
      const system =
        initialized ?? (yield* SessionContextEpoch.prepare(db, events, loadSystemContext(agent), session.id))
      // An agent whose engine names an execution host runs this provider turn through it (AGENTS "V2 Session Core").
      const engine = agent.info?.engine === "orchestra" ? undefined : agent.info?.engine
      const host = engine ? hosts.get(engine) : undefined
      if (engine && !host)
        return yield* Effect.die(new Error(`No execution host is registered for engine ${engine} (agent ${agent.id})`))
      const model = host ? undefined : yield* models.resolve(session)
      const modelRef = model ? SessionRunnerModel.reference(model) : (session.model ?? agent.info?.model)
      const entries = yield* SessionHistory.entriesForRunner(db, session.id, system.baselineSeq)
      const history = entries.map((entry) => entry.message)
      // The provider request is built from the strategy's view; a hosted engine receives the recorded history.
      const context = model ? yield* compaction.transform({ sessionID: session.id, messages: history, model }) : history
      const workflow = yield* RelayWorkflowSession.current(session.id).pipe(Effect.provide(workflowContext), Effect.orDie)
      if (workflow?.view.pending) return yield* Effect.addFinalizer(() => FiberSet.clear(toolFibers)).pipe(
        Effect.flatMap(() => RelayWorkflowSession.reconcile(workflow).pipe(
          Effect.provide(workflowContext), Effect.map((next) => next === true), Effect.orDie)),
        Effect.map((needsContinuation) => ({ needsContinuation, step: currentStep }))
      )
      if (workflow?.view.state === "complete") return yield* Effect.addFinalizer(() => FiberSet.clear(toolFibers)).pipe(
        Effect.map(() => ({ needsContinuation: false, step: currentStep }))
      )
      const isLastStep = agent.info?.steps !== undefined && currentStep >= agent.info.steps
      if (!isLastStep) yield* mcp.ready()
      const toolMaterialization = isLastStep ? undefined : yield* tools.materialize(effectiveRules)
      const promptCacheKey = /^ses_[0-9a-f]{64}$/.test(session.id) ? session.id.slice(4) : session.id
      const systemText = [agent.info?.system, system.baseline, workflow?.view.instructions].filter(
        (part): part is string => part !== undefined && part.length > 0,
      )
      const request = model && LLM.request({
        model,
        http: {
          headers: {
            "x-session-affinity": session.id,
            "X-Session-Id": session.id,
            ...(session.parentID ? { "x-parent-session-id": session.parentID } : {}),
          },
        },
        providerOptions: { openai: { promptCacheKey } },
        system: systemText.map(SystemPart.make),
        messages: [...toLLMMessages(context, model), ...(isLastStep ? [Message.assistant(MAX_STEPS_PROMPT)] : [])],
        tools: toolMaterialization?.definitions ?? [],
        toolChoice: isLastStep ? "none" : undefined,
      })
      if (model && request && (yield* compaction.compactIfNeeded({ sessionID: session.id, entries, model, request })))
        return yield* Effect.die(continueAfterCompaction(currentStep))
      const startSnapshot = yield* snapshots.capture()
      const publisher = createLLMEventPublisher(events, {
        sessionID: session.id,
        agent: agent.id,
        model: {
          id: model ? ModelV2.ID.make(model.id) : (modelRef?.id ?? ModelV2.ID.make("default")),
          providerID: model ? ProviderV2.ID.make(model.provider) : (modelRef?.providerID ?? ProviderV2.ID.make("anthropic")),
          ...(session.model?.variant === undefined ? {} : { variant: session.model.variant }),
        },
        snapshot: startSnapshot,
      })
      const publish = (event: LLMEvent, outputPaths: ReadonlyArray<string> = []) =>
        withPublication(publisher.publish(event, outputPaths))
      let overflowFailure: ProviderErrorEvent | undefined
      yield* subagentModels.assert(session.id, modelRef)
      const settle = (call: ToolCall, assistantMessageID: SessionMessage.ID, materialization: ToolRegistry.Materialization) =>
        CapabilityInvocation.withContext(
          {
            issuer: "core",
            owner: {
              projectID: location.project.id,
              location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
              sessionID: session.id,
              agentID: agent.id,
            },
            invocation: { sessionID: session.id, agentID: agent.id, assistantMessageID, callID: call.id },
            rootToolName: call.name,
            effectiveRules,
            // Core selection has configured permissions, not a separate native Permission floor.
            nativeDenyFloor: [],
          },
          materialization.settle({ sessionID: session.id, agent: agent.id, model: modelRef, assistantMessageID, call }),
        ).pipe(Effect.catchTag("Capability.Failure", (error) => Effect.die(error)))
      // An Orchestra tool the host's engine invokes: recorded before side effects, settled through the registry like a
      // local call, persisted provider-executed so no continuation turn is scheduled for it.
      const execute: ExecutionHost.Turn["execute"] = (input) =>
        Effect.gen(function* () {
          if (!toolMaterialization) return { result: { type: "error" as const, value: "Tools are disabled after the maximum agent steps" } }
          const call = LLMEvent.toolCall({ ...input, providerExecuted: true, providerMetadata: { orchestra: { executor: "orchestra" } } })
          yield* publish(call)
          const settled = yield* settle(call, yield* publisher.assistantMessageID(call.id), toolMaterialization).pipe(Effect.exit)
          const settlement: ToolRegistry.Settlement =
            settled._tag === "Success"
              ? settled.value
              : { result: { type: "error", value: `Tool execution failed: ${messageOf(Cause.squash(settled.cause))}` } }
          yield* publish(
            LLMEvent.toolResult({ id: call.id, name: call.name, result: settlement.result, output: settlement.output, providerExecuted: true }),
            settlement.outputPaths ?? [],
          )
          return settlement
        })
      // Permission for a call the host's engine runs itself, with the agent's and Session's rules: an ask is an ordinary
      // V2 permission request the app answers.
      const authorize: ExecutionHost.Turn["authorize"] = (input) =>
        permissions.authorize({
          sessionID: session.id,
          agent: agent.id,
          action: input.action,
          resources: [...input.resources],
          metadata: { tool: input.tool, callID: input.callID },
        }).pipe(Effect.catchTag("Session.NotFoundError", (error) => Effect.die(error)))
      const source = request
        ? llm.stream(request)
        : host && agent.info
          ? host.stream({
              session,
              agent: agent.info,
              model: modelRef,
              system: systemText,
              history: context,
              tools: toolMaterialization?.definitions ?? [],
              execute,
              authorize,
              state: ExecutionHost.state(db, session.id, host.stateKey),
            })
          : Stream.die("SessionRunner: no provider for this turn")
      const providerStream = source.pipe(
        Stream.runForEach((event) =>
          Effect.gen(function* () {
            if (overflowFailure || publisher.hasProviderError()) return
            if (LLMEvent.is.providerError(event)) {
              if (isContextOverflowFailure(event) && !publisher.hasAssistantStarted()) {
                overflowFailure = event
                return
              }
            }
            yield* publish(event)
            if (event.type !== "tool-call" || event.providerExecuted) return
            if (host || !toolMaterialization) {
              yield* withPublication(
                publisher.failUnsettledTools(
                  host ? "Execution host emitted an unsettled call" : "Tools are disabled after the maximum agent steps",
                ),
              )
              return
            }
            needsContinuation = true
            const assistantMessageID = yield* publisher.assistantMessageID(event.id)
            const fiber = yield* Effect.uninterruptibleMask((restore) =>
              Effect.forkScoped(
                restore(settle(event, assistantMessageID, toolMaterialization)).pipe(
                  Effect.flatMap((settlement) =>
                    publish(
                      LLMEvent.toolResult({
                        id: event.id,
                        name: event.name,
                        result: settlement.result,
                        output: settlement.output,
                      }),
                      settlement.outputPaths ?? [],
                    ),
                  ),
                ),
              ),
            )
            yield* Ref.update(toolFiberRef, (fibers) => [...fibers, fiber])
          }),
        ),
        Effect.ensuring(withPublication(publisher.flush())),
      )

      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const stream = yield* restore(providerStream).pipe(Effect.exit)
          const failure =
            stream._tag === "Failure" ? Option.getOrUndefined(Cause.findErrorOption(stream.cause)) : undefined
          if (
            recoverOverflow &&
            model &&
            request &&
            !publisher.hasAssistantStarted() &&
            isContextOverflowFailure(overflowFailure ?? failure) &&
            (yield* restore(recoverOverflow({ sessionID: session.id, entries, model, request })))
          )
            return yield* Effect.die(continueAfterOverflowCompaction(currentStep))
          if (overflowFailure) yield* publish(overflowFailure)
          const llmFailure = failure instanceof LLMError ? failure : undefined
          if (llmFailure && !publisher.hasProviderError()) {
            yield* withPublication(publisher.failUnsettledTools("Provider did not return a tool result", true))
            yield* withPublication(publisher.failAssistant(llmFailure.reason.message))
          }
          if (stream._tag === "Failure" && Cause.hasInterrupts(stream.cause)) yield* FiberSet.clear(toolFibers)
          const fibers = yield* Ref.get(toolFiberRef)
          const joined = yield* restore(Effect.all(fibers.map((f) => Fiber.join(f)))).pipe(Effect.exit)
          // If any fiber failed with interrupt, treat as interrupted
          const hasInterrupt = joined.some((j) => j._tag === "Failure" && Cause.hasInterrupts(j.cause))
          if (hasInterrupt) {
            yield* FiberSet.clear(toolFibers)
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
            return yield* Effect.interrupt
          }
          // If any fiber failed without interrupt, treat as tool execution failure
          const hasFailure = joined.some((j) => j._tag === "Failure" && !Cause.hasInterrupts(j.cause))
          if (hasFailure) {
            yield* FiberSet.clear(toolFibers)
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
            if (publisher.hasActiveAssistant()) yield* withPublication(publisher.failAssistant(INTERRUPTED_TURN))
          }
          // Check for non-interrupt failures
          const nonInterruptFailures = joined.filter((j) => j._tag === "Failure" && !Cause.hasInterrupts(j.cause))
          for (const failure of nonInterruptFailures) {
            const fail = Cause.squash(failure.cause)
            const message = fail instanceof Error ? fail.message : String(fail)
            yield* withPublication(publisher.failUnsettledTools(`Tool execution failed: ${message}`))
          }
          const stepSettlement = publisher.stepSettlement()
          if (stepSettlement && !publisher.hasProviderError()) {
            const endSnapshot = yield* snapshots.capture()
            const files =
              startSnapshot && endSnapshot
                ? yield* snapshots
                    .files({ from: startSnapshot, to: endSnapshot })
                    .pipe(Effect.catch(() => Effect.succeed(undefined)))
                : undefined
            yield* withPublication(
              events.publish(SessionEvent.Step.Ended, {
                sessionID: session.id,
                timestamp: yield* DateTime.now,
                assistantMessageID: yield* publisher.startAssistant(),
                finish: stepSettlement.finish,
                cost: 0,
                tokens: stepSettlement.tokens,
                usageKnown: stepSettlement.usageKnown,
                snapshot: endSnapshot,
                files,
              }),
            )
            if (model) yield* compaction.afterStep({ sessionID: session.id, tokens: stepSettlement.tokens, model })
          }
          if (publisher.hasProviderError())
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
          if (stream._tag === "Success" && !publisher.hasProviderError())
            yield* withPublication(publisher.failUnsettledTools("Provider did not return a tool result", true))
          if (stream._tag === "Failure") return yield* Effect.failCause(stream.cause)
          // Fiber joining already handled above; if we reach here, no interrupts/failures
          const workflowContinues = workflow ? yield* RelayWorkflowSession.settle({
            current: workflow, assistantMessageID: yield* publisher.startAssistant(),
            succeeded: !!stepSettlement && !publisher.hasProviderError() &&
              !["unknown", "error", "content-filter"].includes(stepSettlement.finish),
          }).pipe(Effect.provide(workflowContext), Effect.orDie) : false
          return { needsContinuation: workflow ? workflowContinues : !publisher.hasProviderError() && needsContinuation, step: currentStep }
        }),
      )
    }, Effect.scoped)
    type RunTurn = (
      sessionID: SessionSchema.ID,
      promotion: SessionInput.Delivery | undefined,
      step: number,
    ) => Effect.Effect<{ readonly needsContinuation: boolean; readonly step: number }, RunError>

    const runAfterOverflowCompaction: RunTurn = Effect.fnUntraced(function* (sessionID, promotion, step) {
      return yield* runTurnAttempt(sessionID, promotion, step).pipe(
        Effect.catchDefect(
          Effect.fnUntraced(function* (defect) {
            if (!(defect instanceof TurnTransitionError)) return yield* Effect.die(defect)
            if (defect.transition._tag === "ContinueAfterOverflowCompaction")
              return yield* Effect.die("Post-compaction provider attempt cannot recover another overflow")
            yield* Effect.yieldNow
            return yield* runAfterOverflowCompaction(sessionID, undefined, defect.transition.step)
          }),
        ),
      )
    })

    const runTurn: RunTurn = Effect.fnUntraced(function* (sessionID, promotion, step) {
      return yield* runTurnAttempt(sessionID, promotion, step, compaction.compactAfterOverflow).pipe(
        Effect.catchDefect(
          Effect.fnUntraced(function* (defect) {
            if (!(defect instanceof TurnTransitionError)) return yield* Effect.die(defect)
            yield* Effect.yieldNow
            if (defect.transition._tag === "ContinueAfterOverflowCompaction")
              return yield* runAfterOverflowCompaction(sessionID, undefined, defect.transition.step)
            return yield* runTurn(sessionID, undefined, defect.transition.step)
          }),
        ),
      )
    })

    const drain = Effect.fn("SessionRunner.run")(function* (input: {
      readonly sessionID: SessionSchema.ID
      readonly force: boolean
    }) {
      const hasSteer = yield* SessionInput.hasPending(db, input.sessionID, "steer")
      const hasQueue = hasSteer ? false : yield* SessionInput.hasPending(db, input.sessionID, "queue")
      if (!input.force && !hasSteer && !hasQueue) return
      yield* failInterruptedTools(input.sessionID)
      let promotion: SessionInput.Delivery | undefined = hasSteer ? "steer" : hasQueue ? "queue" : undefined
      let shouldRun = input.force || hasSteer || hasQueue
      while (shouldRun) {
        let needsContinuation = true
        let step = 1
        while (needsContinuation) {
          const result = yield* runTurn(input.sessionID, promotion, step)
          needsContinuation = result.needsContinuation
          step = result.step + 1
          promotion = "steer"
          if (!needsContinuation) needsContinuation = yield* SessionInput.hasPending(db, input.sessionID, "steer")
        }
        shouldRun = yield* SessionInput.hasPending(db, input.sessionID, "queue")
        promotion = shouldRun ? "queue" : undefined
      }
      // `session-idle` hooks run once the drain settles; they only record, so the drain ends as it would have.
      yield* tools.session({ operation: "session-idle", sessionID: input.sessionID }).pipe(Effect.exit)
    })

    // A drain that fails outside a provider turn (no model, an unsupported API, a blocked context) would otherwise
    // leave the person waiting with nothing on screen. It is recorded as a failed assistant step, as V1 recorded the
    // error on the turn; a provider failure has already failed its own step.
    const recordFailure = Effect.fnUntraced(function* (sessionID: SessionSchema.ID, cause: Cause.Cause<unknown>) {
      if (Cause.hasInterruptsOnly(cause)) return
      const failure = Cause.squash(cause)
      if (failure instanceof LLMError) return
      const session = yield* store.get(sessionID)
      if (!session) return
      const agent = yield* agents.select(session.agent)
      const assistantMessageID = SessionMessage.ID.create()
      yield* events.publish(SessionEvent.Step.Started, {
        sessionID,
        timestamp: yield* DateTime.now,
        assistantMessageID,
        agent: agent.id,
        model: session.model ??
          agent.info?.model ?? { id: ModelV2.ID.make("unknown"), providerID: ProviderV2.ID.make("unknown") },
      })
      yield* events.publish(SessionEvent.Step.Failed, {
        sessionID,
        timestamp: yield* DateTime.now,
        assistantMessageID,
        error: { type: "unknown", message: failure instanceof Error && failure.message ? failure.message : String(failure) },
      })
    })

    const run = (input: { readonly sessionID: SessionSchema.ID; readonly force: boolean }) =>
      drain(input).pipe(
        Effect.tapCause((cause) =>
          recordFailure(input.sessionID, cause).pipe(Effect.catchCause(() => Effect.void)),
        ),
      )

    const affinity = (session: SessionSchema.Info) => ({
      headers: {
        "x-session-affinity": session.id,
        "X-Session-Id": session.id,
        ...(session.parentID ? { "x-parent-session-id": session.parentID } : {}),
      },
    })

    const compact = Effect.fn("SessionRunner.compact")(function* (sessionID: SessionSchema.ID) {
      const session = yield* getSession(sessionID)
      const history = yield* SessionHistory.load(db, session.id)
      if (history.length === 0) return false
      const model = yield* models.resolve(session)
      return yield* compaction.compact({
        sessionID: session.id,
        entries: history.map((message, seq) => ({ seq, message })),
        model,
        request: LLM.request({ model, http: affinity(session) }),
      })
    })

    const generate = Effect.fn("SessionRunner.generate")(function* (input: {
      readonly sessionID: SessionSchema.ID
      readonly prompt: string
    }) {
      const session = yield* getSession(input.sessionID)
      const model = yield* models.resolve(session)
      yield* subagentModels.assert(session.id, SessionRunnerModel.reference(model))
      const history = yield* SessionHistory.load(db, session.id)
      const chunks: string[] = []
      yield* llm
        .stream(
          LLM.request({ model, http: affinity(session), messages: toLLMMessages(history, model), prompt: input.prompt }),
        )
        .pipe(
          Stream.runForEach((event) => {
            if (LLMEvent.is.providerError(event)) return Effect.die(new Error(event.message))
            if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
            return Effect.void
          }),
        )
      return chunks.join("")
    })

    // A person's `!` command, run as V1 ran it: in the Location, with the configured shell, outside the agent's
    // sandbox. An interrupt stops it and still records what it printed.
    const shell = Effect.fn("SessionRunner.shell")(function* (input: {
      readonly sessionID: SessionSchema.ID
      readonly command: string
      readonly callID?: string
    }) {
      const callID = input.callID ?? `call_${crypto.randomUUID()}`
      yield* events.publish(SessionEvent.Shell.Started, {
        sessionID: input.sessionID,
        messageID: SessionMessage.ID.create(),
        timestamp: yield* DateTime.now,
        callID,
        command: input.command,
      })
      const command = ChildProcess.make(input.command, [], {
        cwd: location.directory,
        shell: BashTool.configuredShell(yield* config.entries()),
        stdin: "ignore",
        detached: process.platform !== "win32",
        forceKillAfter: Duration.seconds(3),
      })
      const ended = (output: string) =>
        Effect.gen(function* () {
          yield* events.publish(SessionEvent.Shell.Ended, {
            sessionID: input.sessionID,
            timestamp: yield* DateTime.now,
            callID,
            output,
          })
        })
      yield* appProcess.run(command, { combineOutput: true, maxOutputBytes: SHELL_OUTPUT_BYTES }).pipe(
        Effect.map((result) => {
          const output = (result.output ?? result.stdout).toString("utf8")
          const truncated = result.outputTruncated ? "\n[output truncated]" : ""
          const exit = result.exitCode === 0 ? "" : `\n[exit code ${result.exitCode}]`
          return `${output}${truncated}${exit}`
        }),
        Effect.catchTag("AppProcessError", (error) => Effect.succeed(error.message)),
        Effect.onInterrupt(() => ended("User aborted the command")),
        Effect.flatMap(ended),
      )
    })

    const skill = Effect.fn("SessionRunner.skill")(function* (input: {
      readonly sessionID: SessionSchema.ID
      readonly skill: string
    }) {
      const found = (yield* skills.list()).find((item) => item.name === input.skill)
      if (!found) return false
      yield* events.publish(SessionEvent.Synthetic, {
        sessionID: input.sessionID,
        messageID: SessionMessage.ID.create(),
        timestamp: yield* DateTime.now,
        text: yield* SkillTool.load(fs, found).pipe(Effect.orDie),
      })
      return true
    })

    return Service.of({
      run,
      compact,
      generate,
      shell,
      skill,
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [
    EventV2.node,
    llmClient,
    AgentV2.node,
    ToolRegistry.node,
    Mcp.node,
    ReadToolFileSystem.node,
    SessionRunnerModel.node,
    SessionSubagentModels.node,
    SessionStore.node,
    SessionCompaction.node,
    TaskGovernance.node,
    Location.node,
    SystemContextRegistry.node,
    SkillGuidance.node,
    ReferenceGuidance.node,
    Config.node,
    Snapshot.node,
    Database.node,
    RelayWorkflowSession.node,
    ExecutionHost.node,
    PermissionV2.node,
    FSUtil.node,
    AppProcess.node,
    SkillV2.node,
  ],
})

function messageOf(failure: unknown) {
  return failure instanceof Error ? failure.message : String(failure)
}
