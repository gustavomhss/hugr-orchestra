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
import { Cause, Context, DateTime, Effect, FiberSet, Layer, Option, Queue, Scope, Semaphore, Stream } from "effect"
import { asc, eq } from "drizzle-orm"
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
import { MeetingContext } from "../meeting-context"
import { ToolRegistry } from "../../tool/registry"
import { ToolSafety } from "../../tool-safety"
import { TaskGovernance } from "../../tool/task-governance"
import { Mcp } from "../../mcp"
import { McpCatalog } from "../../mcp/catalog"
import { ToolOutputStore } from "../../tool-output-store"
import { SessionExecution } from "../execution"
import { SessionContextEpoch } from "../context-epoch"
import { SessionCompaction } from "../compaction"
import { SessionEvent } from "../event"
import { SessionHistory } from "../history"
import { SessionInput } from "../input"
import { SessionMessage } from "../message"
import { SessionSchema } from "../schema"
import { SessionStore } from "../store"
import { TodoTable } from "../sql"
import { SessionSubagentModels } from "../subagent-models"
import { INTERRUPTED_TURN, type RunError, Service } from "./index"
import { SessionRunnerModel } from "./model"
import { createLLMEventPublisher } from "./publish-llm-event"
import { HostPorts } from "./host-ports"
import { ExecutionHost } from "./execution-host"
import { toLLMMessages } from "./to-llm-message"
import { SessionTitle } from "./title"
import { ReadToolFileSystem } from "../../tool/read-filesystem"
import { SessionDirectCommands } from "./direct-commands"
import { hostedCall } from "./hosted-call"
import { TurnTransitionError, continueAfterCompaction, continueAfterOverflowCompaction } from "./turn-transition"
import { DEFAULT_MAX_STEPS, MAX_STEPS_PROMPT } from "./max-steps"
import { Snapshot } from "../../snapshot"
import { makeLocationNode } from "../../effect/app-node"
import { llmClient } from "../../effect/app-node-platform"
import { RelayWorkflowSession } from "../../relay-workflow-session"
import { RelaySprint } from "@orchestra/schema/relay-sprint"
import { Permission } from "@orchestra/schema/permission"
import { FSUtil } from "../../fs-util"
import { AppProcess } from "../../process"
import { SkillV2 } from "../../skill"

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
 *   - Track runtime-context parity with the retired runtime canonically in `docs/specs/v2/session.md`.
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
    const meetingContext = yield* MeetingContext.Service
    const config = yield* Config.Service
    const snapshots = yield* Snapshot.Service
    const database = yield* Database.Service
    const hosts = yield* ExecutionHost.Service
    const permissions = yield* PermissionV2.Service
    const fs = yield* FSUtil.Service
    const appProcess = yield* AppProcess.Service
    const skills = yield* SkillV2.Service
    const questions = yield* QuestionV2.Service
    const safety = yield* ToolSafety.Service
    // The process-global execution, for the wake a host's own event asks for; absent where nothing drains Sessions.
    const execution = Option.getOrUndefined(yield* Effect.serviceOption(SessionExecution.Service))
    const workflowHosts = yield* RelayWorkflowSession.Service
    const nativeHost = yield* RelayWorkflowSession.NativeHost
    const workflowContext = Context.make(Database.Service, database).pipe(
      Context.add(RelayWorkflowSession.Service, workflowHosts),
      Context.add(RelayWorkflowSession.NativeHost, nativeHost),
    )
    const governance = yield* TaskGovernance.Service
    const compaction = yield* SessionCompaction.Service
    const db = database.db
    const nameSession = SessionTitle.make({ db, events, store, agents, models, subagentModels, llm })
    // A workflow step narrows its agent's tools: `hidden` keeps denied MCP servers and an emptied bash out of the
    // materialized definitions, and `refuses` checks every call, local or hosted, since bash and MCP permission checks
    // read only the agent's rules. Listed patterns only narrow: an allowed command still passes the agent's own rules.
    const workflowStepTools = Effect.fnUntraced(function* (step: RelaySprint.StepTools | undefined) {
      const servers = step?.mcp ? yield* mcp.tools() : {}
      const deniedMcp = new Set(
        Object.entries(servers)
          .filter(([server]) => !step?.mcp?.includes(server))
          .flatMap(([server, names]) => names.map((name) => McpCatalog.toolName(server, name))),
      )
      const bash: Permission.Ruleset = step?.bash
        ? [
            { action: "bash", resource: "*", effect: "deny" },
            ...step.bash.map((pattern) => ({ action: "bash", resource: pattern, effect: "allow" as const })),
          ]
        : []
      return {
        bash,
        hidden: [
          ...[...deniedMcp].map((name) => ({ action: name, resource: "*", effect: "deny" as const })),
          ...(step?.bash?.length === 0 ? bash : []),
        ],
        refuses: (name: string, input: unknown) =>
          deniedMcp.has(name) ||
          (name === "bash" &&
            bash.length > 0 &&
            PermissionV2.evaluate("bash", commandOf(input), bash).effect === "deny"),
      }
    })
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
    const awaitToolFibers = (fibers: FiberSet.FiberSet<void, ToolOutputStore.Error>) =>
      Effect.raceFirst(FiberSet.join(fibers), FiberSet.awaitEmpty(fibers))

    const loadSystemContext = (sessionID: SessionSchema.ID, agent: AgentV2.Selection) =>
      Effect.all(
        [
          systemContext.load({ sessionID, agent: agent.id }),
          skillGuidance.load(agent),
          referenceGuidance.load(),
          meetingContext.load(sessionID),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.map(SystemContext.combine))

    const runTurnAttempt = Effect.fn("SessionRunner.runTurn")(function* (
      sessionID: SessionSchema.ID,
      promotion: SessionInput.Delivery | undefined,
      step: number,
      recoverOverflow?: typeof compaction.compactAfterOverflow,
    ) {
      const session = yield* getSession(sessionID)
      if (session.location.directory !== location.directory || session.location.workspaceID !== location.workspaceID)
        return yield* Effect.interrupt
      // Before agent selection and promotion: a refused turn leaves pending input pending.
      yield* governance.beforeTurn(session)
      const agent = yield* agents.select(session.agent)
      // A Session's own permission rules, after its agent's as the earlier runtime merged them, so a Session rule wins over the agent's.
      const effectiveRules = [
        ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
        ...(yield* store.permissions(session.id)),
      ]
      const initialized = yield* SessionContextEpoch.initialize(db, loadSystemContext(session.id, agent), session.id)
      const toolFibers = yield* FiberSet.make<void, ToolOutputStore.Error>()
      let needsContinuation = false
      let currentStep = step
      if (promotion) {
        const cutoff = yield* EventV2.latestSequence(db, session.id)
        let promoted = 0
        if (promotion === "steer") promoted = yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        if (promotion === "queue") {
          promoted += Number(yield* SessionInput.promoteNextQueued(db, events, session.id))
          promoted += yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        }
        if (promoted > 0) {
          currentStep = 1
          // Beside the turn, as the earlier runtime named a Session after its first prompt; a failed title leaves the default one.
          yield* nameSession(session.id).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Session title generation failed", cause).pipe(
                Effect.annotateLogs({ sessionID: session.id }),
              ),
            ),
            Effect.forkDetach,
          )
          // Attachments are read once, as they are promoted; the admitted prompt keeps its URIs.
          yield* SessionDirectCommands.readMentions({ events, reader, mcp, fs }, session.id, yield* SessionInput.promotedAfter(db, session.id, cutoff))
        }
      }
      const system =
        initialized ?? (yield* SessionContextEpoch.prepare(db, events, loadSystemContext(session.id, agent), session.id))
      // An agent whose engine names an execution host runs this provider turn through it (AGENTS "V2 Session Core").
      const engine = agent.info?.engine === "orchestra" ? undefined : agent.info?.engine
      const host = engine ? hosts.get(engine) : undefined
      if (engine && !host)
        return yield* Effect.die(new Error(`No execution host is registered for engine ${engine} (agent ${agent.id})`))
      const model = host ? undefined : yield* models.resolve(session)
      const modelRef = model ? SessionRunnerModel.reference(model) : (session.model ?? agent.info?.model)
      const entries = yield* SessionHistory.entriesForRunner(db, session.id, system.baselineSeq)
      const context = entries.map((entry) => entry.message)
      const workflow = yield* RelayWorkflowSession.current(session.id).pipe(Effect.provide(workflowContext), Effect.orDie)
      if (workflow?.view.pending) return { needsContinuation: yield* RelayWorkflowSession.reconcile(workflow).pipe(
        Effect.provide(workflowContext), Effect.map((next) => next === true), Effect.orDie), step: currentStep }
      if (workflow?.view.state === "complete") return { needsContinuation: false, step: currentStep }
      const isLastStep = currentStep >= (agent.info?.steps ?? DEFAULT_MAX_STEPS)
      if (!isLastStep) yield* mcp.ready()
      const stepTools = yield* workflowStepTools(workflow?.view.tools)
      const toolMaterialization = isLastStep
        ? undefined
        : yield* tools.materialize([...effectiveRules, ...stepTools.hidden])
      const promptCacheKey = /^ses_[0-9a-f]{64}$/.test(session.id) ? session.id.slice(4) : session.id
      const contextText = [system.baseline, workflow?.view.instructions].filter((part): part is string => !!part)
      const systemText = agent.info?.system ? [agent.info.system, ...contextText] : contextText
      // The task tool's targets (`TaskTool.requireTarget`), offered to a hosted engine as its own subagents.
      const seats = host
        ? (yield* agents.all()).filter(
            (item) => !item.hidden && item.mode !== "primary" && item.id !== AgentV2.defaultID && item.id !== agent.id,
          )
        : []
      const catalog = seats.length > 0 ? yield* skills.list() : []
      // Only provider-model turns pass through the compaction transform; a hosted engine receives its history as is.
      const messages = model
        ? yield* compaction.transform({
            sessionID: session.id,
            messages: [...toLLMMessages(context, model), ...(isLastStep ? [Message.assistant(MAX_STEPS_PROMPT)] : [])],
            model,
            tools: toolMaterialization?.definitions ?? [],
          })
        : []
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
        messages: [...messages],
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
      const withPublication = Semaphore.makeUnsafe(1).withPermit
      const publish = (event: LLMEvent, outputPaths: ReadonlyArray<string> = []) =>
        withPublication(publisher.publish(event, outputPaths))
      let overflowFailure: ProviderErrorEvent | undefined
      yield* subagentModels.assert(session.id, modelRef)
      const settle = (call: ToolCall, assistantMessageID: SessionMessage.ID, materialization: ToolRegistry.Materialization) =>
        stepTools.refuses(call.name, call.input)
          ? Effect.succeed<ToolRegistry.Settlement>({ result: { type: "error", value: STEP_TOOL_REFUSAL } })
          : CapabilityInvocation.withContext(
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
              materialization.settle({
                sessionID: session.id,
                agent: agent.id,
                model: modelRef,
                assistantMessageID,
                call,
              }),
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
      // Orchestra's decision on a call the host's engine runs itself: V2 permission with the agent's and Session's rules
      // (an ask is an ordinary request the app answers), then the Location's ToolSafety for the call as Orchestra's tool
      // would see it, and the sandbox a shell command must run under. The jail lives as long as the turn.
      const scope = yield* Scope.Scope
      const authorize: ExecutionHost.Turn["authorize"] = (input) =>
        Effect.gen(function* () {
          if (input.safety && stepTools.refuses(input.safety.tool, input.safety.args))
            return yield* new PermissionV2.BlockedError({ rules: stepTools.bash })
          // A call made inside a seat's subagent runs under that seat's rules; any other agent id is ignored.
          const actor = seats.find((item) => item.id === input.agent)?.id ?? agent.id
          yield* permissions
            .authorize({
              sessionID: session.id,
              agent: actor,
              action: input.action,
              resources: [...input.resources],
              metadata: { tool: input.tool, callID: input.callID },
            })
            .pipe(Effect.catchTag("Session.NotFoundError", (error) => Effect.die(error)))
          if (!input.safety) return {}
          const call = input.safety
          return yield* safety.run(
            {
              tool: call.tool,
              args: call.args,
              sessionID: session.id,
              callID: input.callID,
              agent: actor,
              directory: location.directory,
              projectID: location.project.id,
              projectDirectory: location.project.directory === "/" ? location.directory : location.project.directory,
            },
            hostedCall(call, location.directory, scope, fs),
            () => Effect.void,
          )
        })
      // The Session's open todos, rendered for an engine that lost its context to its own compaction.
      const memory: ExecutionHost.Turn["memory"] = {
        recall: db
          .select()
          .from(TodoTable)
          .where(eq(TodoTable.session_id, session.id))
          .orderBy(asc(TodoTable.position))
          .all()
          .pipe(
            Effect.orDie,
            Effect.map((rows) => rows.filter((row) => row.status !== "completed" && row.status !== "cancelled")),
            Effect.map((open) =>
              open.length === 0
                ? undefined
                : ["# Orchestra working memory (after the engine's compaction)", "## Todos", ...open.map((row) => `- [${row.status}] ${row.content}`)].join("\n"),
            ),
          ),
        archive: (input) =>
          Effect.gen(function* () {
            yield* events.publish(SessionEvent.Synthetic, {
              sessionID: session.id,
              messageID: SessionMessage.ID.create(),
              timestamp: yield* DateTime.now,
              text: `Engine compaction summary (${input.trigger}):\nNative owner: ${input.nativeSessionID}\n\n${input.summary}`,
            })
          }),
      }
      // Steers promoted live and not yet reported consumed; any left when the host stream ends get a turn of their own.
      const liveSteers = new Set<string>()
      const steers: ExecutionHost.Turn["steers"] = Stream.callback<void>(
        (queue) =>
          Effect.gen(function* () {
            const stop = yield* events.listen((event) => {
              const data = event.data as { sessionID?: unknown; delivery?: unknown }
              return event.type === SessionEvent.PromptAdmitted.type &&
                data.sessionID === session.id &&
                data.delivery === "steer"
                ? Queue.offer(queue, undefined).pipe(Effect.asVoid)
                : Effect.void
            })
            yield* Effect.addFinalizer(() => stop)
            // Steers admitted since the drain's last promotion, now that none can slip between it and the listener.
            yield* Queue.offer(queue, undefined)
          }),
        { bufferSize: 1, strategy: "sliding" },
      ).pipe(
        Stream.mapEffect(() =>
          Effect.gen(function* () {
            const before = yield* EventV2.latestSequence(db, session.id)
            yield* SessionInput.promoteSteers(db, events, session.id, before)
            const promoted = yield* SessionInput.promotedAfter(db, session.id, before)
            if (promoted.length === 0) return []
            // New user input resets the agent's provider-turn allowance (AGENTS "V2 Session Core").
            currentStep = 1
            yield* SessionDirectCommands.readMentions({ events, reader, mcp, fs }, session.id, promoted)
            promoted.forEach((input) => liveSteers.add(input.id))
            return promoted.map((input) => ({ id: input.id, text: input.prompt.text }))
          }),
        ),
        Stream.flatMap((items) => Stream.fromIterable(items)),
      )
      const ports = HostPorts.make({ events, store, location, config, database, session, model: modelRef, assistantMessageID: publisher.assistantMessageID, withPublication, execution })
      const source = request
        ? llm.stream(request)
        : host && agent.info
          ? host.stream({
              session,
              agent: agent.info,
              model: modelRef,
              system: systemText,
              context: contextText,
              seats,
              skills: Object.fromEntries(seats.map((seat) => [seat.id, SkillV2.available(catalog, seat)])),
              history: context,
              tools: toolMaterialization?.definitions ?? [],
              execute,
              authorize,
              question: (input) => questions.ask({ sessionID: session.id, questions: input.questions }),
              memory,
              steers,
              consumed: (id) => Effect.sync(() => void liveSteers.delete(id)),
              notify: ports.notify,
              child: ports.child,
              todos: ports.todos,
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
            yield* Effect.uninterruptibleMask((restore) =>
              restore(settle(event, assistantMessageID, toolMaterialization)
              ).pipe(
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
            ).pipe(FiberSet.run(toolFibers))
          }),
        ),
        Effect.ensuring(withPublication(publisher.flush())),
      )

      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const stream = yield* restore(providerStream).pipe(Effect.exit)
          if (liveSteers.size > 0) needsContinuation = true
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
          const settled = yield* restore(awaitToolFibers(toolFibers)).pipe(Effect.exit)
          if (settled._tag === "Failure" && SessionDirectCommands.isUserDeclined(settled.cause)) {
            yield* FiberSet.clear(toolFibers)
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
            return yield* Effect.interrupt
          }
          if (
            (stream._tag === "Failure" && Cause.hasInterrupts(stream.cause)) ||
            (settled._tag === "Failure" && Cause.hasInterrupts(settled.cause))
          ) {
            yield* FiberSet.clear(toolFibers)
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
            if (publisher.hasActiveAssistant()) yield* withPublication(publisher.failAssistant(INTERRUPTED_TURN))
          }
          if (settled._tag === "Failure" && !Cause.hasInterrupts(settled.cause)) {
            const failure = Cause.squash(settled.cause)
            const message = failure instanceof Error ? failure.message : String(failure)
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
                // What the provider or host reported, else the model's price list over the settled tokens.
                cost: stepSettlement.cost ?? (model ? SessionRunnerModel.cost(SessionRunnerModel.pricing(model), stepSettlement.tokens) : 0),
                tokens: stepSettlement.tokens,
                usageKnown: stepSettlement.usageKnown,
                snapshot: endSnapshot,
                files,
              }),
            )
            yield* compaction.afterStep({
              sessionID: session.id,
              tokens: stepSettlement.tokens,
              model: modelRef,
              ...(stepSettlement.contextWindow === undefined ? {} : { contextWindow: stepSettlement.contextWindow }),
            })
          }
          if (publisher.hasProviderError())
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
          if (stream._tag === "Success" && !publisher.hasProviderError())
            yield* withPublication(publisher.failUnsettledTools("Provider did not return a tool result", true))
          if (stream._tag === "Failure") return yield* Effect.failCause(stream.cause)
          if (settled._tag === "Failure" && Cause.hasInterrupts(settled.cause))
            return yield* Effect.failCause(settled.cause)
          const workflowContinues = workflow ? yield* RelayWorkflowSession.settle({
            current: workflow, assistantMessageID: yield* publisher.startAssistant(),
            succeeded: settled._tag === "Success" && !!stepSettlement && !publisher.hasProviderError() &&
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
      yield* SessionDirectCommands.failInterruptedTools({ events, store }, input.sessionID)
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
    // leave the person waiting with nothing on screen. It is recorded as a failed assistant step, as the earlier runtime recorded the
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

    // Stop interrupts the drain. The turn ends, so its open permission and question requests end with it.
    const run = (input: { readonly sessionID: SessionSchema.ID; readonly force: boolean }) =>
      drain(input).pipe(
        Effect.tapCause((cause) =>
          recordFailure(input.sessionID, cause).pipe(Effect.catchCause(() => Effect.void)),
        ),
        Effect.onInterrupt(() =>
          permissions
            .cancelSession(input.sessionID)
            .pipe(Effect.andThen(questions.cancelSession(input.sessionID))),
        ),
      )

    const compact = Effect.fn("SessionRunner.compact")(function* (sessionID: SessionSchema.ID) {
      const session = yield* getSession(sessionID)
      const history = yield* SessionHistory.load(db, session.id)
      if (history.length === 0) return false
      const model = yield* models.resolve(session)
      return yield* compaction.compact({
        sessionID: session.id,
        entries: history.map((message, seq) => ({ seq, message })),
        model,
        request: LLM.request({ model, http: SessionDirectCommands.affinity(session) }),
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
          LLM.request({ model, http: SessionDirectCommands.affinity(session), messages: toLLMMessages(history, model), prompt: input.prompt }),
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


    return Service.of({
      run,
      compact,
      generate,
      shell: (input) => SessionDirectCommands.shell({ events, location, config, appProcess }, input),
      skill: (input) => SessionDirectCommands.skill({ events, skills, fs }, input),
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
    Location.node,
    SystemContextRegistry.node,
    SkillGuidance.node,
    ReferenceGuidance.node,
    MeetingContext.node,
    Config.node,
    Snapshot.node,
    Database.node,
    RelayWorkflowSession.node,
    ExecutionHost.node,
    TaskGovernance.node,
    SessionCompaction.node,
    PermissionV2.node,
    FSUtil.node,
    AppProcess.node,
    SkillV2.node,
    QuestionV2.node,
    ToolSafety.node,
  ],
})

function messageOf(failure: unknown) {
  return failure instanceof Error ? failure.message : String(failure)
}

const STEP_TOOL_REFUSAL = "This workflow step does not allow this tool or command"

function commandOf(input: unknown) {
  return typeof input === "object" && input !== null && "command" in input && typeof input.command === "string"
    ? input.command
    : ""
}
