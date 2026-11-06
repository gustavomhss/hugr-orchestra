
## Added evidence packages/core/src/session/runner/llm.ts:240-272 @ c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085
Git blob: c3ad8d87a58923d40797d38a77ff65367bbe66b6
Excerpt SHA-256: 75c8d62556d8a40848bafcd13f36d568c8d71b4dc6e45278e8804d1ffeb2cbfc
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
259:         : []
260:       const request = model && LLM.request({
261:         model,
262:         http: {
263:           headers: SessionRunnerModel.sessionHeaders(model, session.id, session.parentID),
264:         },
265:         providerOptions: { openai: { promptCacheKey } },
266:         system: systemText.map(SystemPart.make),
267:         messages: [...messages],
268:         tools: toolMaterialization?.definitions ?? [],
269:         toolChoice: isLastStep ? "none" : undefined,
270:       })
271:       if (model && request && (yield* compaction.compactIfNeeded({ sessionID: session.id, entries, model, request })))
272:         return yield* Effect.die(continueAfterCompaction(currentStep))

## Added evidence packages/core/src/session/runner/llm.ts:427-429 @ c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085
Git blob: c3ad8d87a58923d40797d38a77ff65367bbe66b6
Excerpt SHA-256: 4c6658d7b231ef8c0b70535f0f7d78c6b0c548f57cba74f3a2fe68fc1f9bc75c
427:       const source = request
428:         ? llm.stream(request)
429:         : host && agent.info
