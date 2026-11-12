# S1 A1 recovery delta: E2-execution

Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Literal source excerpts, newly transported during recovery. They supplement, not replace, original dossier/reviews. E-number maps to J2 E1–E4 and J1 A1-R1–R4. No runtime or test execution asserted. No new semantic acceptance.

## E2-01: `packages/core/src/session/runner/llm.ts` lines 206–258

Git blob: `c3ad8d87a58923d40797d38a77ff65367bbe66b6`; whole-source SHA-256: `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`.

```text
206:       if (promotion) {
207:         const cutoff = yield* EventV2.latestSequence(db, session.id)
208:         let promoted = 0
209:         if (promotion === "steer") promoted = yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
210:         if (promotion === "queue") {
211:           promoted += Number(yield* SessionInput.promoteNextQueued(db, events, session.id))
212:           promoted += yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
213:         }
214:         if (promoted > 0) {
215:           currentStep = 1
216:           // Beside the turn, as the earlier runtime named a Session after its first prompt; a failed title leaves the default one.
217:           yield* nameSession(session.id).pipe(
218:             Effect.catchCause((cause) =>
219:               Effect.logWarning("Session title generation failed", cause).pipe(
220:                 Effect.annotateLogs({ sessionID: session.id }),
221:               ),
222:             ),
223:             Effect.forkDetach,
224:           )
225:           // Attachments are read once, as they are promoted; the admitted prompt keeps its URIs.
226:           yield* SessionDirectCommands.readMentions({ events, reader, mcp, fs }, session.id, yield* SessionInput.promotedAfter(db, session.id, cutoff))
227:         }
228:       }
229:       const system =
230:         initialized ?? (yield* SessionContextEpoch.prepare(db, events, loadSystemContext(session.id, agent), session.id))
231:       // An agent whose engine names an execution host runs this provider turn through it (AGENTS "V2 Session Core").
232:       const engine = yield* engineOf(session)
233:       const host = engine ? hosts.get(engine) : undefined
234:       if (engine && !host)
235:         return yield* Effect.die(new Error(`No execution host is registered for engine ${engine} (agent ${agent.id})`))
236:       const model = host ? undefined : yield* models.resolve(session)
237:       const modelRef = model ? SessionRunnerModel.reference(model) : (session.model ?? agent.info?.model)
238:       const entries = yield* SessionHistory.entriesForRunner(db, session.id, system.baselineSeq)
239:       const context = entries.map((entry) => entry.message)
240:       const workflow = yield* RelayWorkflowSession.current(session.id).pipe(Effect.provide(workflowContext), Effect.orDie)
241:       if (workflow?.view.pending) return { needsContinuation: yield* RelayWorkflowSession.reconcile(workflow).pipe(
242:         Effect.provide(workflowContext), Effect.map((next) => next === true), Effect.orDie), step: currentStep }
243:       if (workflow?.view.state === "complete") return { needsContinuation: false, step: currentStep }
244:       const isLastStep = currentStep >= (agent.info?.steps ?? DEFAULT_MAX_STEPS)
245:       if (!isLastStep) yield* mcp.ready()
246:       const stepTools = narrowStepTools(workflow?.view.tools, workflow?.view.tools?.mcp ? yield* mcp.tools() : {})
247:       const toolMaterialization = isLastStep ? undefined : yield* tools.materialize([...effectiveRules, ...stepTools.hidden])
248:       const promptCacheKey = /^ses_[0-9a-f]{64}$/.test(session.id) ? session.id.slice(4) : session.id
249:       const contextText = [system.baseline, workflow?.view.instructions].filter((part): part is string => !!part)
250:       const systemText = agent.info?.system ? [agent.info.system, ...contextText] : contextText
251:       // Only provider-model turns pass through the compaction transform; a hosted engine receives its history as is.
252:       const messages = model
253:         ? yield* compaction.transform({
254:             sessionID: session.id,
255:             messages: [...toLLMMessages(context, model), ...(isLastStep ? [Message.assistant(MAX_STEPS_PROMPT)] : [])],
256:             model,
257:             tools: toolMaterialization?.definitions ?? [],
258:           })
```

## E2-02: `packages/core/src/session/runner/llm.ts` lines 309–357

Git blob: `c3ad8d87a58923d40797d38a77ff65367bbe66b6`; whole-source SHA-256: `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`.

```text
309:       const execute: ExecutionHost.Turn["execute"] = (input) =>
310:         Effect.gen(function* () {
311:           if (!toolMaterialization) return { result: { type: "error" as const, value: "Tools are disabled after the maximum agent steps" } }
312:           const call = LLMEvent.toolCall({ ...input, providerExecuted: true, providerMetadata: { orchestra: { executor: "orchestra" } } })
313:           yield* publish(call)
314:           const settled = yield* settle(call, yield* publisher.assistantMessageID(call.id), toolMaterialization).pipe(Effect.exit)
315:           const settlement: ToolRegistry.Settlement =
316:             settled._tag === "Success"
317:               ? settled.value
318:               : { result: { type: "error", value: `Tool execution failed: ${messageOf(Cause.squash(settled.cause))}` } }
319:           yield* publish(
320:             LLMEvent.toolResult({ id: call.id, name: call.name, result: settlement.result, output: settlement.output, providerExecuted: true }),
321:             settlement.outputPaths ?? [],
322:           )
323:           return settlement
324:         })
325:       // Orchestra's decision on a call the host's engine runs itself: V2 permission with the agent's and Session's rules
326:       // (an ask is an ordinary request the app answers), then the Location's ToolSafety for the call as Orchestra's tool
327:       // would see it, and the sandbox a shell command must run under. The jail lives as long as the turn.
328:       const scope = yield* Scope.Scope
329:       const authorize: ExecutionHost.Turn["authorize"] = (input) =>
330:         Effect.gen(function* () {
331:           if (input.safety && stepTools.refuses(input.safety.tool, input.safety.args)) return yield* new PermissionV2.BlockedError({ rules: stepTools.bash })
332:           yield* permissions
333:             .authorize({
334:               sessionID: session.id,
335:               agent: agent.id,
336:               action: input.action,
337:               resources: [...input.resources],
338:               metadata: { tool: input.tool, callID: input.callID },
339:             })
340:             .pipe(Effect.catchTag("Session.NotFoundError", (error) => Effect.die(error)))
341:           if (!input.safety) return {}
342:           const call = input.safety
343:           return yield* safety.run(
344:             {
345:               tool: call.tool,
346:               args: call.args,
347:               sessionID: session.id,
348:               callID: input.callID,
349:               agent: agent.id,
350:               directory: location.directory,
351:               projectID: location.project.id,
352:               projectDirectory: location.project.directory === "/" ? location.directory : location.project.directory,
353:             },
354:             hostedCall(call, location.directory, scope, fs),
355:             () => Effect.void,
356:           )
357:         })
```

## E2-03: `packages/core/src/session/runner/llm.ts` lines 427–486

Git blob: `c3ad8d87a58923d40797d38a77ff65367bbe66b6`; whole-source SHA-256: `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`.

```text
427:       const source = request
428:         ? llm.stream(request)
429:         : host && agent.info
430:           ? host.stream({
431:               session,
432:               agent: agent.info,
433:               model: modelRef,
434:               system: systemText,
435:               context: contextText,
436:               history: context,
437:               tools: toolMaterialization?.definitions ?? [],
438:               execute,
439:               authorize,
440:               question: (input) => questions.ask({ sessionID: session.id, questions: input.questions }),
441:               memory,
442:               steers,
443:               consumed: (id) => Effect.sync(() => void liveSteers.delete(id)),
444:               notify,
445:               todos: (list) => SessionTodo.write(db, events, { sessionID: session.id, todos: list }),
446:               state: ExecutionHost.state(db, session.id, host.stateKey),
447:             })
448:           : Stream.die("SessionRunner: no provider for this turn")
449:       const providerStream = source.pipe(
450:         Stream.runForEach((event) =>
451:           Effect.gen(function* () {
452:             if (overflowFailure || publisher.hasProviderError()) return
453:             if (LLMEvent.is.providerError(event)) {
454:               if (isContextOverflowFailure(event) && !publisher.hasAssistantStarted()) {
455:                 overflowFailure = event
456:                 return
457:               }
458:             }
459:             yield* publish(event)
460:             if (event.type !== "tool-call" || event.providerExecuted) return
461:             if (host || !toolMaterialization) {
462:               yield* withPublication(
463:                 publisher.failUnsettledTools(
464:                   host ? "Execution host emitted an unsettled call" : "Tools are disabled after the maximum agent steps",
465:                 ),
466:               )
467:               return
468:             }
469:             needsContinuation = true
470:             const assistantMessageID = yield* publisher.assistantMessageID(event.id)
471:             yield* Effect.uninterruptibleMask((restore) =>
472:               restore(settle(event, assistantMessageID, toolMaterialization)
473:               ).pipe(
474:                 Effect.flatMap((settlement) =>
475:                   publish(
476:                     LLMEvent.toolResult({
477:                       id: event.id,
478:                       name: event.name,
479:                       result: settlement.result,
480:                       output: settlement.output,
481:                     }),
482:                     settlement.outputPaths ?? [],
483:                   ),
484:                 ),
485:               ),
486:             ).pipe(FiberSet.run(toolFibers))
```

## E2-04: `packages/core/src/session/runner/llm.ts` lines 570–578

Git blob: `c3ad8d87a58923d40797d38a77ff65367bbe66b6`; whole-source SHA-256: `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`.

```text
570:           if (stream._tag === "Failure") return yield* Effect.failCause(stream.cause)
571:           if (settled._tag === "Failure" && Cause.hasInterrupts(settled.cause))
572:             return yield* Effect.failCause(settled.cause)
573:           const workflowContinues = workflow ? yield* RelayWorkflowSession.settle({
574:             current: workflow, assistantMessageID: yield* publisher.startAssistant(),
575:             succeeded: settled._tag === "Success" && !!stepSettlement && !publisher.hasProviderError() &&
576:               !["unknown", "error", "content-filter"].includes(stepSettlement.finish),
577:           }).pipe(Effect.provide(workflowContext), Effect.orDie) : false
578:           return { needsContinuation: workflow ? workflowContinues : !publisher.hasProviderError() && needsContinuation, step: currentStep }
```

## E2-05: `packages/core/src/session/runner/llm.ts` lines 616–677

Git blob: `c3ad8d87a58923d40797d38a77ff65367bbe66b6`; whole-source SHA-256: `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`.

```text
616:     const drain = Effect.fn("SessionRunner.run")(function* (input: {
617:       readonly sessionID: SessionSchema.ID
618:       readonly force: boolean
619:     }) {
620:       const hasSteer = yield* SessionInput.hasPending(db, input.sessionID, "steer")
621:       const hasQueue = hasSteer ? false : yield* SessionInput.hasPending(db, input.sessionID, "queue")
622:       if (!input.force && !hasSteer && !hasQueue) return
623:       // `session-idle` hooks run once the drain ends, settled, failed or interrupted; they only record, so the drain ends
624:       // as it would have.
625:       yield* Effect.addFinalizer(() => tools.session({ operation: "session-idle", sessionID: input.sessionID }).pipe(Effect.exit))
626:       yield* SessionDirectCommands.failInterruptedTools({ events, store }, input.sessionID)
627:       let promotion: SessionInput.Delivery | undefined = hasSteer ? "steer" : hasQueue ? "queue" : undefined
628:       let shouldRun = input.force || hasSteer || hasQueue
629:       while (shouldRun) {
630:         let needsContinuation = true
631:         let step = 1
632:         while (needsContinuation) {
633:           const result = yield* runTurn(input.sessionID, promotion, step)
634:           needsContinuation = result.needsContinuation
635:           step = result.step + 1
636:           promotion = "steer"
637:           if (!needsContinuation) needsContinuation = yield* SessionInput.hasPending(db, input.sessionID, "steer")
638:         }
639:         shouldRun = yield* SessionInput.hasPending(db, input.sessionID, "queue")
640:         promotion = shouldRun ? "queue" : undefined
641:       }
642:     }, Effect.scoped)
643: 
644:     // A drain that fails outside a provider turn (no model, an unsupported API, a blocked context) would otherwise
645:     // leave the person waiting with nothing on screen. It is recorded as a failed assistant step, as the earlier runtime recorded the
646:     // error on the turn; a provider failure has already failed its own step.
647:     const recordFailure = Effect.fnUntraced(function* (sessionID: SessionSchema.ID, cause: Cause.Cause<unknown>) {
648:       if (Cause.hasInterruptsOnly(cause)) return
649:       const failure = Cause.squash(cause)
650:       if (failure instanceof LLMError) return
651:       const session = yield* store.get(sessionID)
652:       if (!session) return
653:       const agent = yield* agents.select(session.agent)
654:       const assistantMessageID = SessionMessage.ID.create()
655:       yield* events.publish(SessionEvent.Step.Started, {
656:         sessionID,
657:         timestamp: yield* DateTime.now,
658:         assistantMessageID,
659:         agent: agent.id,
660:         model: session.model ??
661:           agent.info?.model ?? { id: ModelV2.ID.make("unknown"), providerID: ProviderV2.ID.make("unknown") },
662:       })
663:       yield* events.publish(SessionEvent.Step.Failed, {
664:         sessionID,
665:         timestamp: yield* DateTime.now,
666:         assistantMessageID,
667:         error: { type: "unknown", message: failure instanceof Error && failure.message ? failure.message : String(failure) },
668:       })
669:     })
670: 
671:     // Stop interrupts the drain. The turn ends, so its open permission and question requests end with it.
672:     const run = (input: { readonly sessionID: SessionSchema.ID; readonly force: boolean }) =>
673:       drain(input).pipe(
674:         Effect.tapCause((cause) =>
675:           recordFailure(input.sessionID, cause).pipe(Effect.catchCause(() => Effect.void)),
676:         ),
677:         Effect.onInterrupt(() =>
```

## E2-06: `packages/core/src/session/execution.ts` lines 1–53

Git blob: `a0af7f2c15cb10366d493b3d4eb971d3d28c1618`; whole-source SHA-256: `11bf5af36d6949a39edfb4bc8ca16a999fe5fcee881fb50da05c289569209fee`.

```text
1: export * as SessionExecution from "./execution"
2: 
3: import { Context, Effect, Layer, type Option } from "effect"
4: import { LayerNode } from "../effect/layer-node"
5: import { Node } from "../effect/app-node"
6: import { SessionRunner } from "./runner/index"
7: import { SessionSchema } from "./schema"
8: import type { SessionRunCoordinator } from "./run-coordinator"
9: 
10: export type ResumeOptions = SessionRunCoordinator.RunOptions
11: 
12: export interface Interface {
13:   /** Snapshots active execution owned by this process. */
14:   readonly active: Effect.Effect<ReadonlySet<SessionSchema.ID>>
15:   /** Starts execution while idle or joins independently. Opt-in cancellation belongs only to the starter. */
16:   readonly resume: (sessionID: SessionSchema.ID, options?: ResumeOptions) => Effect.Effect<void, SessionRunner.RunError>
17:   /** Registers newly recorded work. Repeated wakeups may coalesce. */
18:   readonly wake: (sessionID: SessionSchema.ID) => Effect.Effect<void>
19:   /** Interrupt active work owned by this process. Idle interruption is a no-op. */
20:   readonly interrupt: (sessionID: SessionSchema.ID) => Effect.Effect<void>
21:   /**
22:    * Runs one Session operation as its active execution, never beside a drain. `None` means the Session was busy; with
23:    * `wait` it runs once the active execution settles instead.
24:    */
25:   readonly exclusive: <A, E>(
26:     sessionID: SessionSchema.ID,
27:     effect: Effect.Effect<A, E>,
28:     options?: { readonly wait?: boolean },
29:   ) => Effect.Effect<Option.Option<A>, E>
30:   /** Runs `use` with the runner of the Location the Session is placed in. */
31:   readonly withRunner: <A, E>(
32:     sessionID: SessionSchema.ID,
33:     use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>,
34:   ) => Effect.Effect<A, E>
35: }
36: 
37: /** Routes execution from a Session ID to the runner owned by that Session's Location. */
38: export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionExecution") {}
39: 
40: export const node = LayerNode.unbound(Service, Node.tags.values.global)
41: 
42: /** Low-level compatibility layer for callers that only need durable Session recording. */
43: export const noopLayer = Layer.succeed(
44:   Service,
45:   Service.of({
46:     active: Effect.succeed(new Set()),
47:     resume: () => Effect.void,
48:     wake: () => Effect.void,
49:     interrupt: () => Effect.void,
50:     exclusive: (_, effect) => Effect.asSome(effect),
51:     withRunner: () => Effect.die("No Session runner is placed by the recording-only execution layer"),
52:   }),
53: )
```
