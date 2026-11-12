# Decisive evidence — app-session L1

Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocol pin: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. These are exact captured source lines with a line-number prefix added. Discontinuous intervals use separate blocks. Code, comments and test assertions retain their original evidentiary status; no tests or product code were executed. `sources.json` gives complete SHA-256, byte lengths and original connector-response locations.

This packet concentrates on decisive lifecycle and boundary claims. Family breadth, limits and all 1,887 entry dispositions are in `l1.md` and `coverage.json`; an excerpt is not a whole-file audit.

## E01 — Executable UI boundary policy

UI allows explicit browserSafe platform exports; this is narrower than an unrestricted Core import.

Source: `script/module-architecture.json`. Git blob: `c189ab9762c33d19c72f2a9ffa683c0985d09448`.

Lines 15–17:

```text
  15 |     "ui": ["foundation", "contract", "client", "ui", "platform:browserSafe"],
  16 |     "terminal-ui": ["foundation", "contract", "client", "extension-api", "library", "platform", "ui"],
  17 |     "app": ["foundation", "native", "contract", "client", "extension-api", "library", "tooling", "module", "platform", "product", "composition", "ui", "terminal-ui"]
```

Lines 194–201:

```text
 194 |     "core": {
 195 |       "layer": "platform",
 196 |       "status": "canonical",
 197 |       "owner": "core platform maintainer",
 198 |       "summary": "Reusable platform and domain services for the application and server layers, including the V2 Session core.",
 199 |       "exportsPolicy": "demanded",
 200 |       "sourceWildcards": {"./*": "./src/*.ts"},
 201 |       "browserSafe": ["src/util/path.ts", "src/util/encode.ts", "src/util/binary.ts", "src/util/retry.ts", "src/util/task-tool.ts", "src/util/array.ts"],
```

## E02 — Server context credential lifetime

A stable server key does not keep a context alive after credential identity changes.

Source: `packages/app-shell/src/context/global.tsx`. Git blob: `13386451ef1a4350a9dda37af92a76b93b92f54d`.

Lines 68–107:

```text
  68 | // Tab/project identity stays stable; transport credentials belong to a disposable context lifetime.
  69 | export function createServerContextCache<T>(
  70 |   servers: Accessor<ServerConnection.Any[]>,
  71 |   create: (conn: ServerConnection.Any) => T,
  72 | ) {
  73 |   const owner = getOwner()
  74 |   const contexts = new Map<ServerConnection.Key, { identity: string; dispose: () => void; value: T }>()
  75 |   const ensure = (input: ServerConnection.Any) => {
  76 |     const key = ServerConnection.key(input)
  77 |     // Callers may still hold a previous connection object after editing the same server.
  78 |     const conn = servers().find((item) => ServerConnection.key(item) === key) ?? input
  79 |     const identity = JSON.stringify([
  80 |       conn.type,
  81 |       conn.http.url,
  82 |       conn.http.username,
  83 |       conn.http.password,
  84 |       conn.type === "http" && conn.authToken,
  85 |     ])
  86 |     const existing = contexts.get(key)
  87 |     if (existing?.identity === identity) return existing.value
  88 |     existing?.dispose()
  89 |     const root = createRoot(
  90 |       (dispose) => ({
  91 |         identity,
  92 |         dispose,
  93 |         value: create({ ...conn, http: { ...conn.http } }),
  94 |       }),
  95 |       owner,
  96 |     )
  97 |     contexts.set(key, root)
  98 |     return root.value
  99 |   }
 100 |   createEffect(() => {
 101 |     const list = servers()
 102 |     list.forEach(ensure)
 103 |     contexts.forEach((context, key) => {
 104 |       if (list.some((conn) => ServerConnection.key(conn) === key)) return
 105 |       context.dispose()
 106 |       contexts.delete(key)
 107 |     })
```

## E03 — Workspace identity and providers

Server/directory workspace identity is separate from the currently viewed session.

Source: `packages/app-shell/src/pages/session.tsx`. Git blob: `9ab69e4f6c572d1f96932c6cef2979f69ffae63b`.

Lines 229–239:

```text
 229 | // Owns the workspace-identity remount. Must not include the session ID in the
 230 | // key: SessionPage handles session changes reactively, and remounting here
 231 | // destroys workspace-scoped state (terminal PTYs, file/prompt providers).
 232 | function TargetSessionPage() {
 233 |   const sdk = useSDK()
 234 |   const serverSDK = useServerSDK()
 235 |   return (
 236 |     <Show when={`${serverSDK().scope}\0${sdk().directory}`} keyed>
 237 |       <SessionPage />
 238 |     </Show>
 239 |   )
```

Lines 264–272:

```text
 264 | function SessionProviders(props: ParentProps) {
 265 |   return (
 266 |     <TerminalProvider>
 267 |       <FileProvider>
 268 |         <PromptProvider>
 269 |           <CommentsProvider>{props.children}</CommentsProvider>
 270 |         </PromptProvider>
 271 |       </FileProvider>
 272 |     </TerminalProvider>
```

## E04 — Permanent asynchronous owner departure

Generation captures do not revive after an A→B→A value change.

Source: `packages/app-shell/src/components/prompt-input/submission-policy.ts`. Git blob: `5a07c61c5c0e73836c59856d3db7ae2ac64478ed`.

Lines 23–43:

```text
  23 | export function createSubmissionOwner<T extends Record<string, unknown>>(read: () => T) {
  24 |   const identity = createMemo(read, undefined, {
  25 |     equals: (left, right) => !!left && Object.keys(right).every((key) => left[key] === right[key]),
  26 |   })
  27 |   const state = { generation: 0, disposed: false, handoff: undefined as ((next: T) => boolean) | undefined }
  28 |   createComputed(() => {
  29 |     const next = identity()
  30 |     if (!state.handoff?.(next)) state.generation++
  31 |     state.handoff = undefined
  32 |   })
  33 |   onCleanup(() => { state.disposed = true; state.generation++; state.handoff = undefined })
  34 |   return {
  35 |     capture() {
  36 |       const generation = state.generation
  37 |       return {
  38 |         current: () => !state.disposed && state.generation === generation,
  39 |         handoff: (accept?: (next: T) => boolean) => { state.handoff = accept },
  40 |       }
  41 |     },
  42 |     disposed: () => state.disposed,
  43 |   }
```

## E05 — Adjacent delta coalescing

Only adjacent events with equal directory and delta identity combine.

Source: `packages/app-shell/src/context/server-sdk.tsx`. Git blob: `8163d68ab02ddbc65e968be3f20f8742bb1e1397`.

Lines 86–119:

```text
  86 | export function coalesceServerEvents(events: QueuedServerEvent[]) {
  87 |   const output: QueuedServerEvent[] = []
  88 |   events.forEach((event) => {
  89 |     const current = currentDelta(event.payload.current)
  90 |     if (current) {
  91 |       const previous = output[output.length - 1]
  92 |       const prior = currentDelta(previous?.payload.current)
  93 |       if (
  94 |         previous &&
  95 |         prior &&
  96 |         previous.directory === event.directory &&
  97 |         currentDeltaKey(prior) === currentDeltaKey(current)
  98 |       ) {
  99 |         const fragment = currentDeltaFragment(prior) + currentDeltaFragment(current)
 100 |         const data =
 101 |           current.type === "session.compaction.delta"
 102 |             ? { ...current.data, text: fragment }
 103 |             : { ...current.data, delta: fragment }
 104 |         output[output.length - 1] = {
 105 |           directory: event.directory,
 106 |           payload: {
 107 |             ...event.payload,
 108 |             properties: data,
 109 |             current: { ...current, data } as CurrentDelta,
 110 |           } as ServerEvent,
 111 |         }
 112 |         return
 113 |       }
 114 |       output.push(event)
 115 |       return
 116 |     }
 117 |     output.push(event)
 118 |   })
 119 |   return output
```

## E06 — SSE subscription and heartbeat

Bounded subscription precedes connected; heartbeat is a comment frame. This does not prove durable replay.

Source: `packages/server/src/handlers/event.ts`. Git blob: `d644f36bdd6aa93cd538f560dab63337c2436022`.

Lines 13–20:

```text
  13 | export const eventFrames = (encode: (data: unknown) => string = encodeEvent) => {
  14 |   const frames = new WeakMap<object, string>()
  15 |   return (data: object): Sse.Event => {
  16 |     const cached = frames.get(data)
  17 |     const json = cached ?? encode(data)
  18 |     if (cached === undefined) frames.set(data, json)
  19 |     return { _tag: "Event", event: "message", id: undefined, data: json }
  20 |   }
```

Lines 26–43:

```text
  26 | export const subscriberCapacity = 4096
  27 | 
  28 | export const eventStream = (events: EventV2.Interface, frame = eventFrames()) => {
  29 |   const connected = {
  30 |     id: EventV2.ID.create(),
  31 |     type: "server.connected",
  32 |     data: {},
  33 |   }
  34 |   const output = Stream.unwrap(
  35 |     Effect.gen(function* () {
  36 |       // Acquiring the bounded stream installs its listener before readiness is observable.
  37 |       const live = yield* EventV2.allBounded(events, subscriberCapacity)
  38 |       return Stream.make(connected).pipe(Stream.concat(live))
  39 |     }),
  40 |   ).pipe(Stream.map(frame), Stream.pipeThroughChannel(Sse.encode()))
  41 |   // A comment frame keeps idle connections open and tells the client the server is alive.
  42 |   const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  43 |   return output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText)
```

## E07 — Recovery read fencing

Superseded generation rejects; an intervening policy change repeats the read; local receipt differs from durable revision.

Source: `packages/app-shell/src/context/session-recovery.ts`. Git blob: `1ea5ce6efe88b2625edfd17562011c738833fe68`.

Lines 39–64:

```text
  39 |   const resolve = (sessionID: string, options?: { force?: boolean }, floor?: SessionManagementInfo): Promise<AppSession> => {
  40 |     const cached = input.read(sessionID)
  41 |     if (cached && !options?.force) return Promise.resolve(cached)
  42 |     const pending = input.requests.get(sessionID)
  43 |     if (pending) return pending
  44 |     const active = generation(sessionID)
  45 |     const state = { policyGeneration: {}, policy: floor ?? fences.get(sessionID) ?? cached }
  46 |     const request = (): Promise<AppSession> => {
  47 |       const policyGeneration = state.policyGeneration
  48 |       return input.request(sessionID).then((result) => {
  49 |         if (input.generations.get(sessionID) !== active) throw new DOMException("Session recovery superseded", "AbortError")
  50 |         if (state.policyGeneration !== policyGeneration) return request()
  51 |         const observed = mergeSessionManagementInfo(state.policy,
  52 |           mergeSessionManagementInfo(fences.get(sessionID), input.read(sessionID) ?? result))
  53 |         // Compatibility SDK snapshots carry no canonical V2 policy provenance.
  54 |         if (input.source === "snapshot") return input.retain(mergeSessionManagementInfo(observed, result))
  55 |         local.receipt = Math.max(local.receipt, observed.subagentModelsReadReceipt ?? 0) + 1
  56 |         return input.retain({
  57 |           ...result,
  58 |           subagentModelsChangedAt: observed.subagentModelsChangedAt,
  59 |           subagentModelsRevision: observed.subagentModelsRevision,
  60 |           subagentModelsReadReceipt: local.receipt,
  61 |         })
  62 |       }, (error: unknown) => {
  63 |         if (input.generations.get(sessionID) === active && state.policyGeneration !== policyGeneration) return request()
  64 |         throw error
```

## E08 — Admission is not transcript promotion

Admitted input is pending; promotion materializes a message and missing context is explicit.

Source: `packages/app-shell/src/context/server-session-v2-reducer.ts`. Git blob: `98d7cec6721eeff58802fd688a57504550bb5750`.

Lines 16–47:

```text
  16 | export function createV2SessionReducer() {
  17 |   const pending = new Map<string, SessionPendingMessage>()
  18 | 
  19 |   const reduce = (source: readonly SessionMessageInfo[], event: ServerCurrentEvent): V2SessionReduction | undefined => {
  20 |     if (!("data" in event) || !("sessionID" in event.data) || typeof event.data.sessionID !== "string") return
  21 |     const sessionID = event.data.sessionID
  22 |     const result = (messages: SessionMessageInfo[], touched: string[] = []): V2SessionReduction => ({
  23 |       sessionID,
  24 |       messages,
  25 |       touched,
  26 |     })
  27 |     const append = (message: SessionMessageInfo) =>
  28 |       result(source.some((item) => item.id === message.id) ? [...source] : [...source, message], [message.id])
  29 | 
  30 |     switch (event.type) {
  31 |       case "session.input.admitted":
  32 |         pending.set(key(sessionID, event.data.inputID), event.data.input)
  33 |         return result([...source])
  34 |       case "session.input.promoted": {
  35 |         const input = pending.get(key(sessionID, event.data.inputID))
  36 |         pending.delete(key(sessionID, event.data.inputID))
  37 |         if (!input) return { ...result([...source]), missing: event.data.inputID }
  38 |         if (input.type === "user")
  39 |           return append({
  40 |             id: event.data.inputID,
  41 |             type: "user",
  42 |             metadata: input.data.metadata,
  43 |             text: input.data.text,
  44 |             files: input.data.files,
  45 |             agents: input.data.agents,
  46 |             time: { created: event.created },
  47 |           })
```

## E09 — Policy barrier

Canonical read must span a stable serialized-write generation.

Source: `packages/app-shell/src/components/prompt-input/submission-policy.ts`. Git blob: `5a07c61c5c0e73836c59856d3db7ae2ac64478ed`.

Lines 118–151:

```text
 118 | /** A canonical response is ready only across a stable per-Session SET generation. */
 119 | export async function waitForSubagentPolicy(input: {
 120 |   sessionID: string
 121 |   management: SubmissionManagement
 122 |   current: () => boolean
 123 |   signal: AbortSignal
 124 |   expected?: () => SubagentModelPolicy | undefined
 125 |   failedMessage?: string
 126 |   retry?: FailedPolicyWrite
 127 | }) {
 128 |   if (!input.current() || input.signal.aborted) return false
 129 |   const management = input.management
 130 |   if (!management.waitSubagentModels) throw new SessionManagementUnsupported()
 131 |   const join = () => waitForSubmission(management.waitSubagentModels!(input.sessionID), input.signal).catch((cause: unknown) => {
 132 |     if (!input.retry || input.retry.cause !== cause || input.retry.version === undefined ||
 133 |       management.subagentModelsWriteVersion?.(input.sessionID) !== input.retry.version ||
 134 |       !input.current() || input.signal.aborted) throw cause
 135 |   })
 136 |   while (input.current() && !input.signal.aborted) {
 137 |     await join()
 138 |     if (!input.current() || input.signal.aborted) return false
 139 |     const expected = input.expected?.()
 140 |     if (!expected) return true
 141 |     if (!management.subagentModelsWriteVersion) throw new SessionManagementUnsupported()
 142 |     const version = management.subagentModelsWriteVersion(input.sessionID)
 143 |     const canonical = await waitForSubmission(management.readSubagentModels(input.sessionID), input.signal)
 144 |     await join()
 145 |     if (!input.current() || input.signal.aborted) return false
 146 |     if (management.subagentModelsWriteVersion(input.sessionID) !== version) continue
 147 |     if (!sameModelPolicy(canonical.policy, expected)) throw new Error(input.failedMessage)
 148 |     return true
 149 |   }
 150 |   return false
 151 | }
```

## E10 — Ambiguous first-send cleanup

Dispatched attempts retain session/message identity; only confirmed empty, never-dispatched session can be deleted.

Source: `packages/app-shell/src/components/prompt-input/submit.ts`. Git blob: `71747d3fc9f907ed5376ccee834e2f0dbec5af9a`.

Lines 455–476:

```text
 455 |     // A first send that fails leaves the Session this draft created behind, empty, in the sidebar. The draft itself
 456 |     // (text, context, subagent models, worktree) stays as it was for the next try.
 457 |     // Once the prompt was dispatched, the Session is kept and labelled: the server may have admitted it before the
 458 |     // failure (an admitted input is not a message until it is promoted), so the retry must reuse this Session and
 459 |     // message ID. Only a send that never left (its policy write failed) deletes a Session the server confirms empty.
 460 |     const settleEmptySession = async (dispatched: boolean) => {
 461 |       const created = admission.session
 462 |       if (!isNewSession || !created || admission.request?.admitted) return
 463 |       const empty = await sessionHasNoMessages(server, created.id, sessionDirectory).catch(() => undefined)
 464 |       if (empty === false) return
 465 |       const removed = !dispatched && empty === true &&
 466 |         (await api.remove({ sessionID: created.id, directory: sessionDirectory }).then(() => true, () => false))
 467 |       if (!removed) return seed(serverState, sessionDirectory, { ...created, title: language.t("orchestra.chat.send.emptySession") })
 468 |       const [, setStore] = serverState.child(sessionDirectory)
 469 |       setStore("session", (list: Session[]) => list.filter((item) => item.id !== created.id))
 470 |       // The next try creates a new Session, so nothing tied to the deleted one may carry over.
 471 |       admission.session = undefined
 472 |       admission.request = undefined
 473 |       admission.policyWritten = undefined
 474 |       admission.acknowledgedPolicy = undefined
 475 |       admission.failedWrite = undefined
 476 |     }
```

## E11 — Admission and draft handoff

Final dispatch checks ownership/policy; promotion requires admitted state and preserves edits made in flight.

Source: `packages/app-shell/src/components/prompt-input/submit.ts`. Git blob: `71747d3fc9f907ed5376ccee834e2f0dbec5af9a`.

Lines 530–540:

```text
 530 |         if (shouldAutoAccept) permissionState.enableAutoAccept(session.id, sessionDirectory)
 531 |         if (!ownsSource() || controller.signal.aborted) return false
 532 |         if (pendingSnapshot(rulesKey).revision !== receipt.revision) continue
 533 |         const request = selectRequest()
 534 |         if (!request.admitted) {
 535 |           request.revision = receipt.revision
 536 |           // Store observers can change ownership or policy; validate again after those mutations, at the API call.
 537 |           const sent = await send(request, () => ownsSource() && !controller.signal.aborted && pendingSnapshot(rulesKey).revision === receipt.revision)
 538 |           if (sent === false) continue
 539 |           request.admitted = true
 540 |         }
```

Lines 545–575:

```text
 545 |     const promote = async () => {
 546 |       if (!isNewSession || !admission.request?.admitted || admission.promoted || !ownsSource()) return
 547 |       // Subagent models picked while the prompt was in flight are acknowledged on its Session before the handoff.
 548 |       if (pendingSnapshot(rulesKey).revision !== admission.request.revision) await waitPolicy()
 549 |       await startTransition(() => {
 550 |         if (!ownsSource() || controller.signal.aborted || admission.promoted) return
 551 |         const request = admission.request
 552 |         if (!request?.admitted || request.revision === undefined) return
 553 |         // An admitted prompt always hands the draft off to its Session, so Enter on the draft can never post it again.
 554 |         // Edits made during the send (text, context, model, agent) move into the Session composer unsent.
 555 |         clearPending(rulesKey, receipt.revision ?? request.revision)
 556 |         const selectedModel = modelSelection.current()
 557 |         const selectedAgent = local.agent.current()
 558 |         const next = prompt.capture({ dir: base64Encode(sessionDirectory), id: session.id })
 559 |         handoffAdmission(next, draftSessionKey(directorySDK.scope, sessionDirectory), sourceAdmission(target, rulesKey).source)
 560 |         batch(() => {
 561 |           admission.promoted = true
 562 |           submission.retarget(next)
 563 |           submission.clear("comments")
 564 |           input.setMode("normal")
 565 |           input.setPopover(null)
 566 |           input.onNewSessionWorktreeReset?.()
 567 |           input.onSubmit?.()
 568 |           local.session.promote(sessionDirectory, session.id, selectedModel && selectedAgent ? {
 569 |             agent: agentKey(selectedAgent),
 570 |             model: { modelID: selectedModel.id, providerID: selectedModel.provider.id },
 571 |             variant: modelSelection.variant.current() ?? null,
 572 |           } : { agent, model, variant: variant ?? null })
 573 |           layout.handoff.setTabs(base64Encode(sessionDirectory), session.id)
 574 |           if (draftID && draftServer) tabs.promoteDraft(draftID, { server: draftServer, sessionId: session.id })
 575 |           if (!draftID) navigate(`/${base64Encode(sessionDirectory)}/session/${session.id}`)
```

## E12 — Wire admission receipt

Schema explicitly distinguishes admitted and optional promoted sequence.

Source: `packages/schema/src/session-input.ts`. Git blob: `b024750506e151e7f14f559f979e5c52d46e3833`.

Lines 15–25:

```text
  15 | export interface Admitted extends Schema.Schema.Type<typeof Admitted> {}
  16 | export const Admitted = Schema.Struct({
  17 |   admittedSeq: NonNegativeInt,
  18 |   id: SessionMessage.ID,
  19 |   sessionID: SessionID,
  20 |   prompt: Prompt,
  21 |   promptContext: PromptContext.Info.pipe(optional),
  22 |   delivery: Delivery,
  23 |   timeCreated: DateTimeUtcFromMillis,
  24 |   promotedSeq: NonNegativeInt.pipe(optional),
  25 | }).annotate({ identifier: "SessionInput.Admitted" })
```

## E13 — Protocol prompt endpoint

Protocol declares receipt result and separately describes scheduling execution.

Source: `packages/protocol/src/groups/session.ts`. Git blob: `5830f50001c8dc01227a920f04276054c0e29570`.

Lines 333–351:

```text
 333 |       HttpApiEndpoint.post("session.prompt", "/api/session/:sessionID/prompt", {
 334 |         params: { sessionID: Session.ID },
 335 |         payload: Schema.Struct({
 336 |           id: SessionMessage.ID.pipe(Schema.optional),
 337 |           prompt: PromptInput.Prompt,
 338 |           delivery: SessionInput.Delivery.pipe(Schema.optional),
 339 |           resume: Schema.Boolean.pipe(Schema.optional),
 340 |         }),
 341 |         success: Schema.Struct({ data: SessionInput.Admitted }),
 342 |         error: [ConflictError, SessionNotFoundError],
 343 |       })
 344 |         .middleware(sessionLocationMiddleware)
 345 |         .annotateMerge(
 346 |           OpenApi.annotations({
 347 |             identifier: "v2.session.prompt",
 348 |             summary: "Send message",
 349 |             description: "Durably admit one session input and schedule agent-loop execution unless resume is false.",
 350 |           }),
 351 |         ),
```

## E14 — Server admission delegation

Prompt handler forwards supplied ID, prompt, delivery and resume to its admission helper.

Source: `packages/server/src/handlers/session.ts`. Git blob: `1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb`.

Lines 246–258:

```text
 246 |       .handle(
 247 |         "session.prompt",
 248 |         Effect.fn(function* (ctx) {
 249 |           return {
 250 |             data: yield* admit({
 251 |               sessionID: ctx.params.sessionID,
 252 |               id: ctx.payload.id,
 253 |               prompt: ctx.payload.prompt,
 254 |               delivery: ctx.payload.delivery,
 255 |               resume: ctx.payload.resume,
 256 |             }),
 257 |           }
 258 |         }),
```

## E15 — Core admission and retry equivalence

Existing ID requires equivalent session/prompt/delivery; admitted result requires durable event and projected record. Projection comparison has additional context/time fields.

Source: `packages/core/src/session/input.ts`. Git blob: `d945b00cf43d03b923cc90d51970d47e2dd3a9c2`.

Lines 48–94:

```text
  48 | export const admit = Effect.fn("SessionInput.admit")(function* (
  49 |   db: DatabaseService,
  50 |   events: EventV2.Interface,
  51 |   input: {
  52 |     readonly id: SessionMessage.ID
  53 |     readonly sessionID: SessionSchema.ID
  54 |     readonly prompt: Prompt
  55 |     readonly promptContext?: PromptContext.Info
  56 |     readonly delivery: Delivery
  57 |   },
  58 | ) {
  59 |   const existing = yield* find(db, input.id)
  60 |   if (existing !== undefined) {
  61 |     if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
  62 |     return existing
  63 |   }
  64 |   const historical = yield* reconcileHistorical(db, input)
  65 |   if (historical !== undefined) return historical
  66 |   const timestamp = yield* DateTime.now
  67 |   return yield* events
  68 |     .publish(SessionEvent.PromptAdmitted, {
  69 |       messageID: input.id,
  70 |       sessionID: input.sessionID,
  71 |       timestamp,
  72 |       prompt: input.prompt,
  73 |       promptContext: input.promptContext,
  74 |       delivery: input.delivery,
  75 |     })
  76 |     .pipe(
  77 |       Effect.flatMap((event) =>
  78 |         event.durable === undefined
  79 |           ? Effect.die("Prompt admission event is missing aggregate sequence")
  80 |           : find(db, input.id).pipe(
  81 |               Effect.flatMap((stored) =>
  82 |                 stored === undefined ? Effect.die("Prompt admission projection is missing") : Effect.succeed(stored),
  83 |               ),
  84 |             ),
  85 |       ),
  86 |       Effect.catchDefect((defect) =>
  87 |         find(db, input.id).pipe(
  88 |           Effect.flatMap((stored) =>
  89 |             stored && equivalent(stored, input) ? Effect.succeed(stored) : Effect.die(defect),
  90 |           ),
  91 |         ),
  92 |       ),
  93 |     )
  94 | })
```

Lines 291–316:

```text
 291 | export const equivalent = (
 292 |   input: Admitted,
 293 |   expected: {
 294 |     readonly sessionID: SessionSchema.ID
 295 |     readonly prompt: Prompt
 296 |     readonly delivery: Delivery
 297 |   },
 298 | ) => input.delivery === expected.delivery && matchesPrompt(input, expected)
 299 | 
 300 | const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
 301 |   input.sessionID === expected.sessionID &&
 302 |   JSON.stringify(encodePrompt(input.prompt)) === JSON.stringify(encodePrompt(expected.prompt))
 303 | 
 304 | const matchesProjection = (
 305 |   input: Admitted,
 306 |   expected: {
 307 |     readonly sessionID: SessionSchema.ID
 308 |     readonly prompt: Prompt
 309 |     readonly promptContext?: PromptContext.Info
 310 |     readonly delivery: Delivery
 311 |     readonly timeCreated: DateTime.Utc
 312 |   },
 313 | ) =>
 314 |   equivalent(input, expected) &&
 315 |   JSON.stringify(input.promptContext) === JSON.stringify(expected.promptContext) &&
 316 |   DateTime.toEpochMillis(input.timeCreated) === DateTime.toEpochMillis(expected.timeCreated)
```

## E16 — Remount-stable submission state

Admission source is a WeakMap-backed store; draft-to-session handoff shares busy state but resets selection map.

Source: `packages/app-shell/src/components/prompt-input/submission-admission.ts`. Git blob: `a4b90f8c61949a012c37dae7ab3dd2d3b75f65fb`.

Lines 21–45:

```text
  21 | type AdmissionSource = {
  22 |   state: { busy: boolean }
  23 |   setBusy: (busy: boolean) => void
  24 |   selections: Map<string, Admission>
  25 | }
  26 | 
  27 | const admissions = new WeakMap<object, Map<string, AdmissionSource>>()
  28 | 
  29 | // The store exists before the composer first reads busy, and survives a draft owner remount.
  30 | export function sourceAdmission(target: object, key: string) {
  31 |   const scoped = admissions.get(target) ?? new Map<string, AdmissionSource>()
  32 |   admissions.set(target, scoped)
  33 |   const previous = scoped.get(key)
  34 |   if (previous) return { key, scoped, source: previous }
  35 |   const [state, setState] = createStore({ busy: false })
  36 |   const source = { state, setBusy: (busy: boolean) => setState("busy", busy), selections: new Map<string, Admission>() }
  37 |   scoped.set(key, source)
  38 |   return { key, scoped, source }
  39 | }
  40 | 
  41 | export function handoffAdmission(target: object, key: string, source: AdmissionSource) {
  42 |   const scoped = admissions.get(target) ?? new Map<string, AdmissionSource>()
  43 |   scoped.set(key, { state: source.state, setBusy: source.setBusy, selections: new Map<string, Admission>() })
  44 |   admissions.set(target, scoped)
  45 | }
```

## E17 — Permission lineage rule

The complete small helper is a bounded policy mechanism, not proof of backend enforcement.

Source: `packages/app-shell/src/context/permission-auto-respond.ts`. Git blob: `69467b52d16de89b8b431cde1aea62cda7671b01`.

Lines 1–69:

```text
   1 | import { base64Encode } from "@orchestra/core/util/encode"
   2 | 
   3 | export function acceptKey(sessionID: string, directory?: string) {
   4 |   if (!directory) return sessionID
   5 |   return `${base64Encode(directory)}/${sessionID}`
   6 | }
   7 | 
   8 | export function directoryAcceptKey(directory: string) {
   9 |   return `${base64Encode(directory)}/*`
  10 | }
  11 | 
  12 | function accepted(autoAccept: Record<string, boolean>, sessionID: string, directory?: string) {
  13 |   const key = acceptKey(sessionID, directory)
  14 |   return autoAccept[key] ?? autoAccept[sessionID]
  15 | }
  16 | 
  17 | export function isDirectoryAutoAccepting(autoAccept: Record<string, boolean>, directory: string) {
  18 |   const key = directoryAcceptKey(directory)
  19 |   return autoAccept[key] ?? false
  20 | }
  21 | 
  22 | function sessionLineage(session: { id: string; parentID?: string }[], sessionID: string) {
  23 |   const parent = session.reduce((acc, item) => {
  24 |     if (item.parentID) acc.set(item.id, item.parentID)
  25 |     return acc
  26 |   }, new Map<string, string>())
  27 |   const seen = new Set([sessionID])
  28 |   const ids = [sessionID]
  29 | 
  30 |   for (const id of ids) {
  31 |     const parentID = parent.get(id)
  32 |     if (!parentID || seen.has(parentID)) continue
  33 |     seen.add(parentID)
  34 |     ids.push(parentID)
  35 |   }
  36 | 
  37 |   return ids
  38 | }
  39 | 
  40 | type AutoRespondRequest = { sessionID: string; metadata?: Record<string, unknown> }
  41 | 
  42 | // A Relay hook's Ask carries the hook's own words and is meant for a person. No auto-accept setting answers it, so the
  43 | // card is never hidden and the hook's activity never records an approval nobody gave.
  44 | export function isHookAsk(permission: Pick<AutoRespondRequest, "metadata">) {
  45 |   return permission.metadata?.action === "relay_hook"
  46 | }
  47 | 
  48 | export function autoRespondsPermission(
  49 |   autoAccept: Record<string, boolean>,
  50 |   session: { id: string; parentID?: string }[],
  51 |   permission: AutoRespondRequest,
  52 |   directory?: string,
  53 | ) {
  54 |   const value = sessionAutoAccept(autoAccept, session, permission, directory)
  55 |   if (value !== undefined) return value
  56 |   return directory ? isDirectoryAutoAccepting(autoAccept, directory) : false
  57 | }
  58 | 
  59 | export function sessionAutoAccept(
  60 |   autoAccept: Record<string, boolean>,
  61 |   session: { id: string; parentID?: string }[],
  62 |   permission: AutoRespondRequest,
  63 |   directory?: string,
  64 | ) {
  65 |   if (isHookAsk(permission)) return false
  66 |   return sessionLineage(session, permission.sessionID)
  67 |     .map((id) => accepted(autoAccept, id, directory))
  68 |     .find((item): item is boolean => item !== undefined)
  69 | }
```

## E18 — PTY cursor contract

Validated control frames set cursor; text advances it by JavaScript string length.

Source: `packages/app-shell/src/components/terminal.tsx`. Git blob: `da156cc9a7f8d62e78727c5829253e7a6e4d2049`.

Lines 531–554:

```text
 531 |         const handleMessage = (event: MessageEvent) => {
 532 |           if (disposed) return
 533 |           if (event.data instanceof ArrayBuffer) {
 534 |             const bytes = new Uint8Array(event.data)
 535 |             if (bytes[0] !== 0) return
 536 |             const json = decoder.decode(bytes.subarray(1))
 537 |             try {
 538 |               const meta = JSON.parse(json) as { cursor?: unknown }
 539 |               const next = meta?.cursor
 540 |               if (typeof next === "number" && Number.isSafeInteger(next) && next >= 0) {
 541 |                 cursor = next
 542 |                 seek = next
 543 |               }
 544 |             } catch (err) {
 545 |               debugTerminal("invalid websocket control frame", err)
 546 |             }
 547 |             return
 548 |           }
 549 | 
 550 |           const data = typeof event.data === "string" ? event.data : ""
 551 |           if (!data) return
 552 |           output?.push(data)
 553 |           cursor += data.length
 554 |           seek = cursor
```

## E19 — Live start consent

Start requests open consent every time; start rejects duplicate in-flight requests.

Source: `packages/app-shell/src/orchestra/chapters/flight-engineer/run.ts`. Git blob: `ef751fc20f70e6c8287ef191d4a2e6d4275b3cf0`.

Lines 81–104:

```text
  81 |   return {
  82 |     store,
  83 |     elapsed,
  84 |     available: () => seat() !== undefined,
  85 |     seat,
  86 |     readiness,
  87 |     hotkeys,
  88 |     setProtection: (value: boolean) => setStore("protection", value),
  89 |     // Consent is asked at every start, with no remembered answer.
  90 |     requestStart: () => setStore("dialog", "consent"),
  91 |     showPermissions,
  92 |     closeDialog: () => setStore({ dialog: "none", waiting: false }),
  93 |     async start(options: StartOptions) {
  94 |       const current = seat()
  95 |       if (!current || store.starting) return
  96 |       setStore("starting", true)
  97 |       const start: StartWith = current.start.bind(current)
  98 |       const result = await start(undefined, options).catch(() => ({ ok: false, reason: "server" }) as const)
  99 |       setStore("starting", false)
 100 |       if (result.ok) return setStore("dialog", "none")
 101 |       if (result.reason === "permission") return showPermissions()
 102 |       setStore("dialog", "none")
 103 |       fail(result.reason)
 104 |     },
```

## E20 — WSL capability lifecycle

No platform API means disabled query; subscription updates cache and cleans up.

Source: `packages/app-shell/src/wsl/context.tsx`. Git blob: `3200887056dc7ea718908114bafbd29237003f7b`.

Lines 9–36:

```text
   9 | export const { use: useWslServers, provider: WslServersProvider } = createSimpleContext({
  10 |   name: "WslServers",
  11 |   init: () => {
  12 |     const platform = usePlatform()
  13 |     const queryClient = useQueryClient()
  14 |     const query = useQuery(() => {
  15 |       const api = platform.wslServers
  16 |       return queryOptions<WslServersState>({
  17 |         queryKey: wslServersQueryKey,
  18 |         queryFn: () => api!.getState(),
  19 |         enabled: !!api,
  20 |         staleTime: Number.POSITIVE_INFINITY,
  21 |         gcTime: Number.POSITIVE_INFINITY,
  22 |       })
  23 |     })
  24 | 
  25 |     createEffect(() => {
  26 |       const api = platform.wslServers
  27 |       if (!api) return
  28 |       const off = api.subscribe((event) => {
  29 |         queryClient.setQueryData(wslServersQueryKey, event.state)
  30 |       })
  31 |       onCleanup(off)
  32 |     })
  33 | 
  34 |     return query as typeof query & { readonly data: WslServersState | undefined }
  35 |   },
  36 | })
```

## E21 — Janitor source and notification ownership

Foreign report/late notification cannot open the current report through these checks.

Source: `packages/app-shell/src/context/janitor.tsx`. Git blob: `2e43559941b88f5d470deacf1f1fb44cb0c823fc`.

Lines 29–51:

```text
  29 |   const activeSource = () => server.key
  30 |   const enabled = () => props.enabled?.() ?? props.initial !== undefined
  31 |   const apply = (event: { report: string; notify: boolean; source: string | null }) => {
  32 |     if (!enabled()) return
  33 |     if (event.source !== null && event.source !== activeSource()) return
  34 |     const parsed = parseJanitorReport(event.report)
  35 |     if (!parsed) return
  36 |     const report = usefulJanitorReport(parsed)
  37 |     if (!report || report.findings.length === 0) {
  38 |       setStore({ report: null, source: null, expanded: false })
  39 |       return
  40 |     }
  41 |     if (store.source === event.source && JSON.stringify(store.report) === JSON.stringify(report)) return
  42 |     setStore({ report, source: event.source, expanded: false })
  43 |     if (!event.notify) return
  44 |     void platform.notify(
  45 |       language.plural("janitor.notify.title", report.findings.length),
  46 |       report.findings[0]?.summary ?? "",
  47 |       () => {
  48 |         if (!enabled() || unwrap(store.report) !== report) return
  49 |         if (event.source !== null && event.source !== activeSource()) return
  50 |         setStore("expanded", true)
  51 |       },
```

## E22 — Janitor pocket session ownership

Stored-session reuse checks current owner/directory; created-session adoption is checked after async sync.

Source: `packages/app-shell/src/components/janitor-pocket.tsx`. Git blob: `6d01f36327b6607ca391fac6f046600b5bc2b55c`.

Lines 99–124:

```text
  99 |   createEffect(() => {
 100 |     retryNonce()
 101 |     const agent = local.agent.current()
 102 |     const selected = model.current()
 103 |     const key = storageKey()
 104 |     if (!agent || !selected || sessionID() || creating() || attemptedKey() === key || failedKey() === key) return
 105 |     const directory = props.directory()
 106 |     const scope = serverSDK().scope
 107 |     const runID = ++generation
 108 |     setCreating(true)
 109 |     setAttemptedKey(key)
 110 |     const isCurrent = () =>
 111 |       runID === generation && storageKey() === key && props.directory() === directory && serverSDK().scope === scope
 112 |     void (async () => {
 113 |       let stored: string | null = null
 114 |       try {
 115 |         stored = localStorage.getItem(key)
 116 |       } catch {
 117 |         stored = null
 118 |       }
 119 |       if (stored) {
 120 |         try {
 121 |           await serverSync().session.sync(stored)
 122 |           if (isCurrent() && serverSync().session.get(stored)?.directory === directory) {
 123 |             adoptSession(stored)
 124 |             return
```

Lines 135–159:

```text
 135 |       if (!isCurrent()) return
 136 |       const currentSync = serverSync().ensureDirSyncContext(directory)
 137 |       const created = await sdk()
 138 |         .api.session.create({
 139 |           agent: agentKey(agent),
 140 |           model: { id: selected.id, providerID: selected.provider.id },
 141 |           location: { directory: props.directory() },
 142 |         })
 143 |         .then((result) => normalizeSessionInfo(result))
 144 |       currentSync.session.remember(created)
 145 |       await currentSync.session.sync(created.id)
 146 |       if (!isCurrent()) return
 147 |       try {
 148 |         localStorage.setItem(key, created.id)
 149 |       } catch {
 150 |         // Session remains usable for this mount even if persistence is unavailable.
 151 |       }
 152 |       adoptSession(created.id)
 153 |     })()
 154 |       .catch((error) => {
 155 |         if (isCurrent()) setFailedKey(key)
 156 |         console.error("[janitor-pocket] session", error)
 157 |       })
 158 |       .finally(() => {
 159 |         if (runID === generation) setCreating(false)
```

## E23 — Renderer recovery record

Optional native failure recording is memoized per ErrorPage mount.

Source: `packages/app-shell/src/pages/error.tsx`. Git blob: `09715daf8463eda4b14a61ca478f34fe9bdfd3c0`.

Lines 222–247:

```text
 222 | export const ErrorPage: Component<ErrorPageProps> = (props) => {
 223 |   const platform = usePlatform()
 224 |   const language = useLanguage()
 225 |   const formattedError = () => formatError(props.error, language.t)
 226 |   let recordedFatalError: Promise<void> | undefined
 227 |   const [store, setStore] = createStore({
 228 |     actionError: undefined as string | undefined,
 229 |   })
 230 | 
 231 |   function ensureFatalErrorRecorded() {
 232 |     recordedFatalError ??=
 233 |       platform.recordFatalRendererError?.({
 234 |         error: formattedError(),
 235 |         url: location.href,
 236 |         version: platform.version,
 237 |         platform: platform.platform,
 238 |         os: platform.os,
 239 |       }) ?? Promise.resolve()
 240 |     return recordedFatalError
 241 |   }
 242 | 
 243 |   onMount(() => {
 244 |     void ensureFatalErrorRecorded().catch(() => undefined)
 245 |   })
 246 | 
 247 |   async function checkForUpdates() {
```

## E24 — Reusable view model boundary

The model states its UI role; this declaration is not the wire protocol.

Source: `packages/session-ui/src/transcript-model.ts`. Git blob: `cff5c2ce14c7d5845801666aac5d131d15f0933c`.

Lines 1–28:

```text
   1 | export * as Transcript from "./transcript-model"
   2 | 
   3 | // Transcript view model: the message, part and session shapes the transcript renderer reads.
   4 | // The app projects the server's V2 Session messages into these shapes; nothing here is a wire
   5 | // contract. Free-form records (`metadata`, tool `input`, JSON schemas) stay `any`-valued because
   6 | // renderers read nested fields from them directly.
   7 | 
   8 | type OpenRecord = { [key: string]: any }
   9 | 
  10 | export type SnapshotFileDiff = {
  11 |   file?: string
  12 |   patch?: string
  13 |   additions: number
  14 |   deletions: number
  15 |   status?: "added" | "deleted" | "modified"
  16 | }
  17 | 
  18 | export type Range = {
  19 |   start: { line: number; character: number }
  20 |   end: { line: number; character: number }
  21 | }
  22 | 
  23 | export type FilePartSourceText = {
  24 |   value: string
  25 |   start: number
  26 |   end: number
  27 | }
  28 | 
```

## E25 — Markdown sanitation and cache boundary

Sanitation fails closed when unsupported, adds safe blank-link rel attributes and bounds cached entries.

Source: `packages/session-ui/src/components/markdown-cache.tsx`. Git blob: `5a1e2a785db09a468360758bcc9fc66210b0b7b4`.

Lines 11–53:

```text
  11 | const max = 200
  12 | const cache = new Map<string, MarkdownCacheEntry>()
  13 | const config = {
  14 |   USE_PROFILES: { html: true, mathMl: true },
  15 |   SANITIZE_NAMED_PROPS: true,
  16 |   FORBID_TAGS: ["style"],
  17 |   FORBID_CONTENTS: ["style", "script"],
  18 |   ADD_TAGS: ["svg", "path"],
  19 |   ADD_ATTR: ["d", "viewBox", "preserveAspectRatio", "xmlns", "target"],
  20 | }
  21 | 
  22 | if (typeof window !== "undefined" && DOMPurify.isSupported) {
  23 |   DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
  24 |     if (!(node instanceof HTMLAnchorElement)) return
  25 |     if (node.target !== "_blank") return
  26 | 
  27 |     const rel = node.getAttribute("rel") ?? ""
  28 |     const set = new Set(rel.split(/\s+/).filter(Boolean))
  29 |     set.add("noopener")
  30 |     set.add("noreferrer")
  31 |     node.setAttribute("rel", Array.from(set).join(" "))
  32 |   })
  33 | }
  34 | 
  35 | export function sanitizeMarkdown(html: string) {
  36 |   if (!DOMPurify.isSupported) return ""
  37 |   return DOMPurify.sanitize(html, config)
  38 | }
  39 | 
  40 | export function getCachedMarkdown(key: string) {
  41 |   return cache.get(key)
  42 | }
  43 | 
  44 | export function touchCachedMarkdown(key: string, value: MarkdownCacheEntry) {
  45 |   cache.delete(key)
  46 |   cache.set(key, value)
  47 | 
  48 |   if (cache.size <= max) return
  49 | 
  50 |   const first = cache.keys().next().value
  51 |   if (!first) return
  52 |   cache.delete(first)
  53 | }
```

## E26 — Last observed process state

Process state is derived from completed transcript tool results, not polled live state.

Source: `packages/app-shell/src/pages/session/process-control-data.ts`. Git blob: `d0c2026dc5398c7adeccc4dea2ae4f89e32b94c0`.

Lines 5–19:

```text
   5 | /**
   6 |  * The latest status the agent observed for one process, never live state: no route exposes process state, so this
   7 |  * derives only from `process_control` results in the transcript.
   8 |  */
   9 | export type ProcessItem = Readonly<{
  10 |   id: Capability.JobRef["id"]
  11 |   /** From the start call, when the transcript still holds it. */
  12 |   argv?: string
  13 |   state: Capability.JobState
  14 |   exit?: Readonly<{ code?: number; signal?: string }>
  15 |   /** When the tool call that reported the latest status finished. */
  16 |   time: number
  17 |   /** The tool call that reported the latest status; the transcript anchor the item links to. */
  18 |   callID: string
  19 | }>
```

Lines 24–48:

```text
  24 | export function processItems(parts: readonly Part[]): readonly ProcessItem[] {
  25 |   const reports = parts.flatMap((part, order) => {
  26 |     if (part.type !== "tool" || part.tool !== "process_control" || part.state.status !== "completed") return []
  27 |     // A truncated or foreign output is skipped rather than guessed at.
  28 |     const output = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(part.state.output)
  29 |       .pipe(Option.flatMap(Schema.decodeUnknownOption(Output)))
  30 |     if (Option.isNone(output)) return []
  31 |     const start = Schema.decodeUnknownOption(Start)(part.state.input)
  32 |     const time = part.state.time.end
  33 |     const callID = part.callID
  34 |     return ("items" in output.value ? output.value.items : [output.value.status]).map((status) => ({ status, order, time,
  35 |       callID, argv: Option.isSome(start) ? summary(start.value.argv) : undefined }))
  36 |   })
  37 |   const latest = Map.groupBy(reports, (report) => report.status.process.id)
  38 |   return [...latest.entries()].map(([id, group]) => {
  39 |     const report = group.reduce((best, next) => next.time > best.time || (next.time === best.time && next.order > best.order)
  40 |       ? next : best)
  41 |     return { id, argv: group.find((row) => row.argv !== undefined)?.argv, state: report.status.state,
  42 |       exit: report.status.exit, time: report.time, callID: report.callID }
  43 |   }).toSorted((a, b) => b.time - a.time || b.id.localeCompare(a.id))
  44 | }
  45 | 
  46 | /** How many processes the header indicator counts; `unknown` and other non-terminal states count as running. */
  47 | export function runningCount(items: readonly ProcessItem[]) {
  48 |   return items.filter((item) => !terminal.has(item.state)).length
```

## E27 — Registered chapter reachability

Full registration object shows cicd maps to Actions and no Guardrails registration; this does not enumerate every possible consumer.

Source: `packages/app-shell/src/orchestra/chapter-route.tsx`. Git blob: `0f52708ce7c119d235a60e95ea7c28cec0874f48`.

Lines 17–44:

```text
  17 | // Implemented chapters register their page here (lazy). Navigation opens a page only for
  18 | // registered chapters.
  19 | export const chapterPages: Partial<Record<string, Component<ChapterPageProps>>> = {
  20 |   "flight-engineer": lazy(() => import("./chapters/flight-engineer/flight-engineer")),
  21 |   lean: lazy(() => import("./chapters/lean")),
  22 |   mcp: lazy(() => import("./chapters/mcp")),
  23 |   skills: lazy(() => import("./chapters/skills")),
  24 |   cicd: lazy(() => import("./chapters/actions")),
  25 |   actions: lazy(() => import("./chapters/actions")),
  26 |   env: lazy(() => import("./chapters/env")),
  27 |   agents: lazy(() => import("./chapters/agents")),
  28 |   workspaces: lazy(() => import("./chapters/workspaces")),
  29 |   dock: lazy(() => import("./chapters/dock")),
  30 |   plugins: lazy(() => import("./chapters/plugins")),
  31 |   providers: lazy(() => import("./chapters/providers")),
  32 |   integrations: lazy(() => import("./chapters/integrations")),
  33 |   shortcuts: lazy(() => import("./chapters/shortcuts")),
  34 |   schedule: lazy(() => import("./chapters/schedule")),
  35 |   settings: lazy(() => import("./chapters/settings")),
  36 |   workflows: lazy(() => import("./chapters/workflows")),
  37 |   hooks: lazy(() => import("./chapters/hooks")),
  38 |   atlas: lazy(() => import("./chapters/atlas/atlas")),
  39 |   "rag-studio": lazy(() => import("./chapters/rag-studio/page")),
  40 |   board: lazy(() => import("./chapters/board/board")),
  41 | }
  42 | 
  43 | // These chapters span the whole server, so they render without a project (with an empty directory).
  44 | const serverWideChapters = ["settings", "providers", "shortcuts", "board", "flight-engineer"]
```

## E28 — Actions request gate

Unknown outcome and stale/nonready binding disable another request.

Source: `packages/app-shell/src/orchestra/actions/request-policy.ts`. Git blob: `90b60f02662063b0f3f47aa7774733521705fd0e`.

Lines 1–19:

```text
   1 | import { Actions } from "@orchestra/schema/actions"
   2 | import type { State } from "./contract"
   3 | 
   4 | /** Unknown authorization permits an explicit request, never an availability claim. */
   5 | export function canRequest(state: State, operation: string, scope?: string, command?: { current: () => boolean }) {
   6 |   // Only the current command owner can check admission while its own submit is active.
   7 |   if (!Actions.OperationKind.literals.some((kind) => kind === operation) || (command && !command.current())
   8 |     || (state.submitting && !command?.current()) || state.unsupported || !state.binding
   9 |     || state.capabilities.status !== "ready" || !state.capabilities.value || state.operation?.state === "outcome_unknown" || state.operation?.state === "sending"
  10 |     || state.commandError?.kind === "outcome_unknown") return false
  11 |   if (state.route.runID && state.route.attempt !== undefined) {
  12 |     const run = state.run.status === "ready" && state.run.value?.id === state.route.runID && state.run.value.bindingID === state.binding.id
  13 |       ? state.run.value : state.runs.status === "ready" ? state.runs.value?.items.find((item) => item.id === state.route.runID && item.bindingID === state.binding?.id) : undefined
  14 |     if (run?.attempt !== state.route.attempt) return false
  15 |   }
  16 |   const projectScopes = [`repository:${state.binding.projectID}`, `project:${state.binding.projectID}`, `projects/${state.binding.projectID}`]
  17 |   return !state.capabilities.value?.some((item) => item.operation === operation && item.state === "unavailable"
  18 |     && (!item.scope || !scope || item.scope === scope || projectScopes.includes(item.scope)))
  19 | }
```

## E29 — Secret reveal control

Presentation masking and explicit reveal are visible; credential storage is outside this component.

Source: `packages/app-shell/src/components/secret-input-v2.tsx`. Git blob: `03989417ca9c76a6c4644216c9c83d2b643302fa`.

Lines 1–25:

```text
   1 | import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
   2 | import { TextInputV2, type TextInputV2Props } from "@orchestra/ui/v2/text-input-v2"
   3 | import { createSignal, createUniqueId, type JSX, splitProps } from "solid-js"
   4 | import { useLanguage } from "@/context/language"
   5 | 
   6 | // Keeps a secret masked unless the user explicitly reveals it. The toggle swaps its visible label
   7 | // instead of using aria-pressed, because a pressed-state button must keep a constant name.
   8 | export function SecretInputV2(props: Omit<TextInputV2Props, "type" | "id" | "class"> & { label: JSX.Element }) {
   9 |   const language = useLanguage()
  10 |   const [local, input] = splitProps(props, ["label"])
  11 |   const [revealed, setRevealed] = createSignal(false)
  12 |   const id = createUniqueId()
  13 | 
  14 |   return (
  15 |     <div class="flex w-full flex-col gap-1 font-[530] leading-4 text-v2-text-text-base">
  16 |       <label for={id}>{local.label}</label>
  17 |       <div class="flex w-full items-center gap-2">
  18 |         <TextInputV2 {...input} id={id} class="!min-w-0 !flex-1" type={revealed() ? "text" : "password"} />
  19 |         <ButtonV2 type="button" variant="ghost" aria-controls={id} onClick={() => setRevealed((value) => !value)}>
  20 |           {language.t(revealed() ? "orchestra.env.hide" : "orchestra.env.reveal")}
  21 |         </ButtonV2>
  22 |       </div>
  23 |     </div>
  24 |   )
  25 | }
```

## E30 — External-link defaults

Defaults are caller-overridable; the component is not a URL sanitizer.

Source: `packages/app-shell/src/components/external-link.tsx`. Git blob: `133e752eab3fd8fe3b26acd284db4979e2f3bb29`.

Lines 3–21:

```text
   3 | export interface ExternalLinkProps extends Omit<ComponentProps<"a">, "href"> {
   4 |   href: string
   5 | }
   6 | 
   7 | export function ExternalLink(props: ExternalLinkProps) {
   8 |   const [local, rest] = splitProps(props, ["href", "children", "class", "target", "rel"])
   9 | 
  10 |   return (
  11 |     <a
  12 |       href={local.href}
  13 |       class={`text-text-strong underline ${local.class ?? ""}`}
  14 |       target={local.target ?? "_blank"}
  15 |       rel={local.rel ?? "noopener noreferrer"}
  16 |       {...rest}
  17 |     >
  18 |       {local.children}
  19 |     </a>
  20 |   )
  21 | }
```

## E31 — Path normalization helper

Separator/root normalization does not claim filesystem canonicalization or case folding.

Source: `packages/app-shell/src/utils/path-key.ts`. Git blob: `68d53e91d8639b3c8956c1d769e141c61a17ceb7`.

Lines 1–24:

```text
   1 | export type PathKey = string & { _brand: "PathKey" }
   2 | 
   3 | const isDrive = (value: string) => {
   4 |   if (value.length !== 2) return false
   5 |   const code = value.charCodeAt(0)
   6 |   return value[1] === ":" && ((code >= 65 && code <= 90) || (code >= 97 && code <= 122))
   7 | }
   8 | 
   9 | const trimTrailingSlashes = (value: string) => {
  10 |   for (let i = value.length - 1; i >= 0; i--) {
  11 |     if (value[i] !== "/") return value.slice(0, i + 1)
  12 |   }
  13 |   return ""
  14 | }
  15 | 
  16 | const isWindowsPath = (value: string) => value[1] === ":" || value.startsWith("\\\\")
  17 | 
  18 | export const pathKey = (path: string) => {
  19 |   const value = isWindowsPath(path) ? path.replaceAll("\\", "/") : path
  20 |   const trimmed = trimTrailingSlashes(value)
  21 |   if (!trimmed && value.startsWith("/")) return "/" as PathKey
  22 |   if (isDrive(trimmed)) return `${trimmed}/` as PathKey
  23 |   return trimmed as PathKey
  24 | }
```

## E32 — Search input preconditions

Composition, existing handling and editable-target guards precede document-level forwarding.

Source: `packages/app-shell/src/utils/search-keydown.ts`. Git blob: `1e0b0ea695b7b89a00c4e40a553b13921d7ed206`.

Lines 1–20:

```text
   1 | const editableSelector = "input, textarea, select, [contenteditable=''], [contenteditable='true']"
   2 | 
   3 | export function handleDocumentSearchKeydown(
   4 |   input: HTMLInputElement | undefined,
   5 |   event: KeyboardEvent,
   6 |   inputValue: string,
   7 |   setInputValue: (value: string) => void,
   8 | ) {
   9 |   if (!input) return false
  10 |   if (event.defaultPrevented || event.isComposing) return false
  11 |   if (event.target === input) return false
  12 |   if (event.target instanceof Element && event.target.closest(editableSelector)) return false
  13 | 
  14 |   const action = searchKeyAction(event)
  15 |   if (!action) return false
  16 | 
  17 |   event.preventDefault()
  18 |   event.stopPropagation()
  19 |   input.focus()
  20 | 
```

## E33 — Download lifecycle

Object URL and temporary anchor are cleaned up after initiating download; no download was performed in this review.

Source: `packages/app-shell/src/utils/download.ts`. Git blob: `31ed5ee3a15f6b8f321ee632d2e5a680c3f3991b`.

Lines 1–11:

```text
   1 | // Saves text through the browser's own download flow: one anchor, attached for Firefox and Safari.
   2 | export function downloadText(filename: string, text: string, type: string) {
   3 |   const url = URL.createObjectURL(new Blob([text], { type }))
   4 |   const link = document.createElement("a")
   5 |   link.href = url
   6 |   link.download = filename
   7 |   document.body.appendChild(link)
   8 |   link.click()
   9 |   document.body.removeChild(link)
  10 |   URL.revokeObjectURL(url)
  11 | }
```

## E34 — Serialize addon public lifecycle

Activation, buffer availability and options constrain terminal serialization; internal conversion is not fully audited.

Source: `packages/app-shell/src/addons/serialize.ts`. Git blob: `515153488c1d8fa23abce30dc72294bef1a598f3`.

Lines 512–555:

```text
 512 | export class SerializeAddon implements ITerminalAddon {
 513 |   private _terminal?: ITerminalCore
 514 | 
 515 |   /**
 516 |    * Activate the addon (called by Terminal.loadAddon)
 517 |    */
 518 |   public activate(terminal: ITerminalCore): void {
 519 |     this._terminal = terminal
 520 |   }
 521 | 
 522 |   /**
 523 |    * Dispose the addon and clean up resources
 524 |    */
 525 |   public dispose(): void {
 526 |     this._terminal = undefined
 527 |   }
 528 | 
 529 |   /**
 530 |    * Serializes terminal rows into a string that can be written back to the
 531 |    * terminal to restore the state. The cursor will also be positioned to the
 532 |    * correct cell.
 533 |    *
 534 |    * @param options Custom options to allow control over what gets serialized.
 535 |    */
 536 |   public serialize(options?: ISerializeOptions): string {
 537 |     if (!this._terminal) {
 538 |       throw new Error("Cannot use addon until it has been loaded")
 539 |     }
 540 | 
 541 |     const buffer = getTerminalBuffers(this._terminal)
 542 | 
 543 |     if (!buffer) {
 544 |       return ""
 545 |     }
 546 | 
 547 |     const normalBuffer = buffer.normal ?? buffer.active
 548 |     const altBuffer = buffer.alternate
 549 | 
 550 |     if (!normalBuffer) {
 551 |       return ""
 552 |     }
 553 | 
 554 |     let content = !options?.excludeModes && getTerminalMode(this._terminal, 2031) ? "\u001b[?2031h" : ""
 555 |     content += options?.range
```

## E35 — Palette generator entry

Generator explicitly reads source inputs, rejects failed contrast checks and writes named outputs; it was not run.

Source: `packages/app-shell/script/orchestra-palettes.ts`. Git blob: `5ae361b9caca40324140d3cbd402f29ddcaf9c3c`.

Lines 1–27:

```text
   1 | #!/usr/bin/env bun
   2 | // Writes Orchestra's palette stylesheets (src/orchestra/palette/generated) from its own stylesheets and the
   3 | // palette definitions. Run from packages/app-shell after changing Orchestra's CSS colors or a palette:
   4 | //   bun run script/orchestra-palettes.ts
   5 | import path from "node:path"
   6 | import { PALETTE_DEFINITIONS } from "../src/orchestra/palette/definitions"
   7 | import { generatePalettes, PALETTE_SOURCES, parseSources } from "../src/orchestra/palette/generate"
   8 | 
   9 | const src = path.join(import.meta.dir, "../src")
  10 | const texts = await Promise.all(
  11 |   PALETTE_SOURCES.map(async (file) => [file, await Bun.file(path.join(src, file)).text()]),
  12 | )
  13 | const generated = generatePalettes(parseSources(Object.fromEntries(texts)), PALETTE_DEFINITIONS)
  14 | 
  15 | if (generated.failures.length > 0) {
  16 |   // A palette that cannot hold AA without changing hue does not ship: remove it from the catalog and definitions.
  17 |   console.error(
  18 |     generated.failures
  19 |       .map((item) => `${item.palette}: ${item.source} ${item.name} ${item.value} ${item.ratio.toFixed(2)}:1`)
  20 |       .join("\n"),
  21 |   )
  22 |   process.exit(1)
  23 | }
  24 | 
  25 | const out = path.join(src, "orchestra/palette/generated")
  26 | await Promise.all(Object.entries(generated.files).map(([name, content]) => Bun.write(path.join(out, name), content)))
  27 | console.log(`wrote ${Object.keys(generated.files).length} files to ${path.relative(process.cwd(), out)}`)
```

## E36 — Draft regression assertions

These are inspected Playwright assertions using mock transport, not a test result from this work.

Source: `packages/app-shell/e2e/regression/draft-admission-handoff.spec.ts`. Git blob: `352da3a7aaa2f9c456f50aca2ce75f34e914fc39`.

Lines 60–102:

```text
  60 | 
  61 | test("delayed failure keeps draft and retries same Session/message ID", async ({ page }) => {
  62 |   const fixture = await setup(page)
  63 |   const gate = Promise.withResolvers<void>()
  64 |   fixture.promptGate = gate.promise
  65 |   fixture.fail = true
  66 |   await page.locator(editor).fill("retry retained turn")
  67 |   const request = page.waitForRequest(isPromptRequest)
  68 |   const response = page.waitForResponse((response) => isPromptRequest(response.request()))
  69 |   await page.locator(submit).click()
  70 |   const sent = await request
  71 |   await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "true")
  72 |   await expect(page.locator(editor)).toHaveText("retry retained turn")
  73 |   await expect(page.locator(draftTab)).toHaveCount(1)
  74 |   gate.resolve()
  75 |   const failure = await response
  76 |   expect(failure.request()).toBe(sent)
  77 |   expect(failure.status()).toBe(500)
  78 |   await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  79 |   await expect(page.getByText("Failed to send prompt", { exact: true })).toBeVisible()
  80 |   await expect(page).toHaveURL(draftURL)
  81 |   await expect(page.locator(editor)).toHaveText("retry retained turn")
  82 |   expect(fixture.creates).toHaveLength(1)
  83 |   expect(fixture.messages).toHaveLength(0)
  84 |   fixture.fail = false
  85 |   const retried = page.waitForResponse((response) => isPromptRequest(response.request()))
  86 |   const retryRequest = page.waitForRequest(isPromptRequest)
  87 |   await page.locator(submit).click()
  88 |   const retryReceipt = await retried
  89 |   expect(retryReceipt.request()).toBe(await retryRequest)
  90 |   expect(retryReceipt.status()).toBe(200)
  91 |   await expect(page).toHaveURL(sessionURL)
  92 |   await expect(page.locator(userCard)).toHaveCount(1)
  93 |   await expect(page.locator(userText)).toHaveText("retry retained turn")
  94 |   await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  95 |   expect(fixture.creates).toHaveLength(1)
  96 |   expect(fixture.prompts).toHaveLength(2)
  97 |   expect(fixture.prompts[1]?.id).toBe(fixture.prompts[0]?.id)
  98 |   expect(fixture.prompts[1]?.payload).toEqual(fixture.prompts[0]?.payload)
  99 |   expect(fixture.messages).toHaveLength(1)
 100 |   expect(fixture.admissions).toHaveLength(2)
 101 | })
 102 | 
```

## E37 — ABA ownership assertion

This browser-provider test states that returning to A does not revive the original held operation; not executed.

Source: `packages/app-shell/test-browser/prompt-admission-owner.suite.ts`. Git blob: `9f72ea5888dc56cd8580bff24c1e4ff07efcd746`.

Lines 341–377:

```text
 341 | test("real PromptProvider owner ABA permanently holds old attempt until deliberate retry", async () => {
 342 |   const instance = mountAdmission()
 343 |   const key = draftSessionKey(servers.A as ServerScope, directory, route.draftId)
 344 |   let pending: Promise<unknown> | undefined
 345 |   try {
 346 |     await instance.prompt.ready.promise
 347 |     const source = instance.prompt.capture()
 348 |     source.set([{ type: "text", content: "held-A", start: 0, end: 6 }])
 349 |     selection.togglePending(key, "provider", "restricted")
 350 |     pending = Promise.resolve(instance.submit.handleSubmit({ preventDefault: () => undefined } as Event))
 351 |     await requireGate(created.promise, pending, "create")
 352 |     createGate.resolve()
 353 |     await requireGate(saved.promise, pending, "rules")
 354 |     batch(() => { setTabs(0, "server", servers.B as Tab["server"]); setRoute("server", "B") })
 355 |     const scope: PromptScope = { dir: base64Encode(directory), id: `created-A-${serial}` }
 356 |     const foreign = instance.prompt.capture(scope)
 357 |     batch(() => { setTabs(0, "server", servers.A as Tab["server"]); setRoute("server", "A") })
 358 |     saveGate.resolve()
 359 |     await pending
 360 |     expect(source.current()[0]).toMatchObject({ content: "held-A" })
 361 |     expect(promotions).toEqual([])
 362 |     expect(requests.filter((request) => request.operation === "prompt")).toEqual([])
 363 |     expect(selection.pendingPolicy(key)).toEqual({ mode: "allowlist", models: [{ providerID: "provider", id: "restricted" }] })
 364 |     await instance.submit.handleSubmit({ preventDefault: () => undefined } as Event)
 365 |     expect(requests.filter((request) => request.operation === "create")).toHaveLength(1)
 366 |     expect(requests.filter((request) => request.operation === "prompt")).toEqual([
 367 |       { server: "A", operation: "prompt", input: expect.objectContaining({ sessionID: scope.id, text: "held-A" }) },
 368 |     ])
 369 |     expect(foreign.current()[0]).toMatchObject({ content: "" })
 370 |     expect(foreign.context.items()).toEqual([])
 371 |   } finally {
 372 |     createGate.resolve(); saveGate.resolve(); instance.dispose()
 373 |     await pending?.catch(() => undefined)
 374 |     selection.clearPending(key)
 375 |     memory.dispose()
 376 |   }
 377 | })
```

## E38 — Performance evidence limits

Benchmark documentation distinguishes diagnostics from machine-budget or compositor claims.

Source: `packages/app-shell/e2e/performance/README.md`. Git blob: `3dc91bf649d85e62cfde139e1b0004aa5250d3f7`.

Lines 1–30:

```text
   1 | # Manual app performance suite
   2 | 
   3 | The app's high-volume performance diagnostics live under `packages/app-shell/e2e/performance` and are excluded from normal local and CI Playwright discovery. The benchmark config builds the web app from `apps/web` and serves the production bundle before running scenarios serially.
   4 | 
   5 | Run the suite explicitly from `packages/app-shell`:
   6 | 
   7 | ```sh
   8 | bun run test:bench
   9 | ```
  10 | 
  11 | PowerShell:
  12 | 
  13 | ```powershell
  14 | $env:PLAYWRIGHT_WORKERS = "1"
  15 | bun run test:bench
  16 | ```
  17 | 
  18 | The suite contains:
  19 | 
  20 | - cold and hot session-tab timing
  21 | - home-session click timing split between content and titlebar-tab paint
  22 | - single-session tab close timing through stable home restoration
  23 | - cached session repaint and mutation tracing
  24 | - streaming timeline throughput, RAF-gap, long-task, geometry, and remount diagnostics
  25 | 
  26 | All benchmarks import the shared `benchmark` fixture. Pages created through Playwright's `page` fixture automatically capture main-frame navigation history and emit a Chrome trace when `ORCHESTRA_PERFORMANCE_TRACE_DIR` is set. Benchmarks that need isolated browser contexts use `withBenchmarkPage`, which owns the context and the same diagnostics lifecycle.
  27 | 
  28 | New benchmarks should look like normal Playwright tests:
  29 | 
  30 | ```ts
```

## E39 — Fixture provenance distinction

Fixture documentation, not evidence of a current product test run.

Source: `packages/app-shell/src/pages/session/orchestra-evidence-fixtures/README.md`. Git blob: `13a82b8ee438493397ff009e8d729968a03ab97b`.

Lines 1–27:

```text
   1 | # Captured runner output
   2 | 
   3 | Bun 1.3.14, Vitest 4.1.7, Playwright 1.59.1, pytest 9.0.3, Go 1.27.1 and Cargo 1.98.0 logs were recovered from the interrupted implementation. Absolute fixture paths were replaced by `/repo`; output is test input, not proof that this application passed those suites.
   4 | 
   5 | The former illustrative Jest log was replaced on 2026-10-03 by actual Jest 30.2.0 output (exit 1). Reproduce from this directory:
   6 | 
   7 | ```sh
   8 | bunx jest@30.2.0 --runInBand --config '{"rootDir":".","testMatch":["**/jest-fail.case.cjs","**/jest-pass.case.cjs"]}'
   9 | ```
  10 | 
  11 | The `.case.cjs` inputs intentionally include a failure. Normal Bun test discovery does not select them. No Jest runtime dependency is added to the app.
  12 | 
  13 | ## Parser review regressions
  14 | 
  15 | The following additional logs are actual captures from the checked-in inputs, using Jest 30.2.0, pytest 9.0.3 and Bun 1.3.14. Reporter-only trailing whitespace is trimmed for clean Git diffs; spaces inside nodeids remain intact. Run from this directory (redirect both stdout and stderr to capture the reporter):
  16 | 
  17 | ```sh
  18 | bunx jest@30.2.0 --ci --runInBand --verbose=false --config '{"rootDir":".","testMatch":["**/jest-console.case.cjs","**/jest-pass.case.cjs"]}'
  19 | bunx jest@30.2.0 --ci --runInBand --verbose=false --config '{"rootDir":".","testMatch":["**/jest-console-fail.case.cjs","**/jest-pass.case.cjs"]}'
  20 | python3 -m pytest -q --tb=short 'pytest_nodeid_case.py::test_label[hello world]'
  21 | python3 -m pytest -q --tb=short 'pytest_nodeid_case.py::test_label[hello - world]'
  22 | bun test ./bun-ghost.case.ts
  23 | ```
  24 | 
  25 | `jest-console.txt` passes and contains a reporter heading, while `jest-console-fail.txt` also has a real failing test named `Console`. Both pytest captures intentionally fail; the second has an ambiguous summary delimiter. `bun-ghost.txt` passes while test stdout prints a fake failure record, so its output must remain raw.
  26 | 
  27 | `pw-extra-failure-row.invalid.txt` is an explicitly adversarial footer derived from the captured Playwright format, with an extra failure row. It is not claimed to be a genuine standard-reporter result.
```

## Structural asset sample evidence

These are local structural inspections of pinned binary bytes, not text excerpts or visual/authorship conclusions. The exact inspection record is `binary-inspection.json`; source SHA-256 and Git identities are in `sources.json`.

| Captured asset | Decoded sample | Byte length |
|---|---|---:|
| `packages/app-shell/src/orchestra/avatars/seat-backend.webp` | WebP, 256×256, RGBA | 12,028 |
| `packages/app-shell/public/orchestra/mtn-src.jpg` | JPEG, 900×601, RGB | 135,002 |
| `packages/app-shell/src/pages/session/zen-assets/grain-bg.png` | PNG, 220×220, P | 29,501 |


# Resumed correction evidence

## skills-decoder

Array contract, field optionality/nullability and whole-load decoder failure.

Source: `packages/app-shell/src/orchestra/chapters/skills-data.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `81fe5f7a2a5c6bc45d59ae9e88b42d1b36f76037`; SHA-256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931`.

Exact lines 3–28:

```ts
export type SkillEntry = {
  name: string
  description?: string | null
  location: string
  content: string
  mtime?: number | null
  internal?: boolean | null
}

const decodeSkills = Schema.decodeUnknownOption(
  Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.optional(Schema.NullOr(Schema.String)),
      location: Schema.String,
      content: Schema.String,
      mtime: Schema.optional(Schema.NullOr(Schema.Number)),
      internal: Schema.optional(Schema.NullOr(Schema.Boolean)),
    }),
  ),
)

// The catalog reply is untrusted: a malformed one fails the load, which the page shows as its error with Retry.
export function readSkills(value: unknown): readonly SkillEntry[] {
  return Option.getOrThrowWith(decodeSkills(value), () => new Error("Skills response is malformed"))
}
```

## skills-visibility

Internal/tree-node visibility and construction of the prefix set before filtering.

Source: `packages/app-shell/src/orchestra/chapters/skills-data.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `81fe5f7a2a5c6bc45d59ae9e88b42d1b36f76037`; SHA-256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931`.

Exact lines 30–49:

```ts
/** Skills for agent use only declare `internal: true` in their frontmatter; the server reports it and the catalog does not list them. */
export function isInternalSkill(skill: Pick<SkillEntry, "internal">) {
  return skill.internal === true
}

/**
 * The skills the catalog lists: neither internal nor a skill tree node. A node is a `SKILL.md` inside the folder of
 * another listed `SKILL.md`; it loads only through its parent's index, the same rule as the server's `SkillV2.nested`.
 */
export function listedSkills(skills: readonly SkillEntry[]) {
  const folders = skills
    .map((skill) => slash(skill.location))
    .filter((location) => location.endsWith("/SKILL.md"))
    .map((location) => location.slice(0, -"SKILL.md".length))
  return skills.filter((skill) => {
    if (isInternalSkill(skill)) return false
    const location = slash(skill.location)
    return !folders.some((folder) => location !== `${folder}SKILL.md` && location.startsWith(folder))
  })
}
```

## skills-access

Source/access classes, allowed roots, governed priority, lexical normalization, search/order and error-message extraction.

Source: `packages/app-shell/src/orchestra/chapters/skills-data.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `81fe5f7a2a5c6bc45d59ae9e88b42d1b36f76037`; SHA-256 `0001420dcb688c672b55f1070284df5b5086be8d1655df75f7a25585981f4931`.

Exact lines 51–99:

```ts
export type SkillSource = "project" | "global" | "builtin"
/** Mirrors the server's write rule: only the project's own skill folders change, never Atlas-governed skills. */
export type SkillAccess = "edit" | "builtin" | "global" | "governed" | "fixed"

const PROJECT_ROOTS = [".orchestra/skills/", ".orchestra/skill/", ".claude/skills/", ".agents/skills/"]
const GOVERNED_ROOT = ".orchestra/skills/own/"

const SOURCE_ORDER: SkillSource[] = ["project", "global", "builtin"]

export function filterSkills(skills: SkillEntry[], query: string) {
  const search = query.trim().toLowerCase()
  return skills.filter((skill) =>
    [skill.name, skill.description ?? "", skill.location].some((value) => value.toLowerCase().includes(search)),
  )
}

// A server's built-in skills live under the virtual absolute path /builtin/.
// Orchestra's own server ships none (playbooks are files), but other servers may.
export function skillSource(location: string, directory: string): SkillSource {
  if (location.startsWith("/builtin/")) return "builtin"
  return slash(location).startsWith(root(directory)) ? "project" : "global"
}

export function skillAccess(location: string, directory: string): SkillAccess {
  const source = skillSource(location, directory)
  if (source !== "project") return source
  const relative = slash(location).slice(root(directory).length)
  if (relative.startsWith(GOVERNED_ROOT)) return "governed"
  if (!relative.endsWith(".md") || !PROJECT_ROOTS.some((item) => relative.startsWith(item))) return "fixed"
  return "edit"
}

/** Project skills first, then the user's global skills, then built-ins; names break ties. */
export function sortSkills(skills: readonly SkillEntry[], directory: string) {
  return skills.toSorted(
    (a, b) =>
      SOURCE_ORDER.indexOf(skillSource(a.location, directory)) -
        SOURCE_ORDER.indexOf(skillSource(b.location, directory)) || a.name.localeCompare(b.name),
  )
}

/** Reads the message from a `{ message }` error body. */
export function skillErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return
  if ("message" in error && typeof error.message === "string") return error.message
}

const slash = (value: string) => value.replaceAll("\\", "/")
const root = (directory: string) => slash(directory).replace(/\/*$/, "/")
```

## skills-page-identity

Server/directory cache identity, same-dialog close guard, decode pipeline and unavailable/error distinction.

Source: `packages/app-shell/src/orchestra/chapters/skills.tsx`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `896a17a54e8782536917564083031da05af9023d`; SHA-256 `7e60597bb282ef3fdd525224acfff4efd94c07cfc2a3069c403b4b39b1b0cd31`.

Exact lines 29–55:

```ts
const warm = createWarm<SkillEntry[]>(8)

export default function Skills(props: ChapterPageProps) {
  const language = useLanguage()
  const global = useGlobal()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const abort = new AbortController()
  const warmKey = `${serverSDK().scope}\0${pathKey(props.directory)}`
  // The last list paints at once; the page still asks the server for a fresh one.
  const warmed = warm.read(warmKey)
  const [state, setState] = createStore({
    status: (warmed ? "ready" : "loading") as "loading" | "ready" | "error" | "unavailable",
    cause: undefined as unknown,
    skills: warmed ?? ([] as SkillEntry[]),
    query: "",
    // A saved file the server has not listed yet (its configuration predates the skill folder).
    pending: undefined as string | undefined,
  })
  // A signal, not a store field: setting a store path to an object merges into the previous object, so the keyed
  // dialog would not remount and the previous dialog's pending close event would clear the next one.
  const [dialog, setDialog] = createSignal<SkillDialogState>()
  const close = (current: SkillDialogState) => {
    if (dialog() === current) setDialog(undefined)
  }
  const unlisted = createMemo(() =>
    state.pending && !state.skills.some((skill) => skill.location === state.pending) ? state.pending : undefined,
```

Exact lines 69–97:

```ts
  const message = createMemo(() => {
    if (state.status === "loading") return language.t("orchestra.skills.loading")
    if (state.status === "error") return withServerReason(language.t("orchestra.skills.error"), state.cause)
    if (state.status === "unavailable") return language.t("orchestra.skills.unavailable")
    if (!state.skills.length) return language.t("orchestra.skills.empty")
    if (!filtered().length) return language.t("orchestra.skills.noMatches")
  })

  async function load() {
    const entries = await serverSDK().ready.then(async () => {
      if (abort.signal.aborted) return []
      return (
        await serverSDK().currentApi.skill.list({ location: { directory: props.directory } }, { signal: abort.signal })
      ).data
    })
    if (abort.signal.aborted) return
    const skills = sortSkills(listedSkills(readSkills(entries)), props.directory)
    warm.write(warmKey, skills)
    setState({ skills, status: "ready" })
  }

  function refresh(quiet = false) {
    if (!quiet) setState("status", "loading")
    void load().catch((error: unknown) => {
      if (abort.signal.aborted) return
      const cause = error instanceof Error ? error.cause : undefined
      const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
      setState({ status: status === 404 || status === 405 || status === 501 ? "unavailable" : "error", cause: error })
    })
```

## skills-page-writes

Save/remove payload boundary, pending path, failure display, cleanup, retry and access handoff.

Source: `packages/app-shell/src/orchestra/chapters/skills.tsx`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `896a17a54e8782536917564083031da05af9023d`; SHA-256 `7e60597bb282ef3fdd525224acfff4efd94c07cfc2a3069c403b4b39b1b0cd31`.

Exact lines 100–137:

```ts
  async function save(current: SkillDialogState, input: SkillSaveInput) {
    const result = await sdk()
      .orchestra.skills.save({ location: { directory: props.directory }, ...input })
      .then(
        (saved) => ({ saved, error: undefined }),
        (error: unknown) => ({ saved: undefined, error }),
      )
    if (!result.saved) return writeFailure(result.error)
    if (abort.signal.aborted) return
    close(current)
    setState("pending", result.saved.data.location)
    await load().catch(() => refresh())
  }

  async function remove(current: SkillDialogState, skill: SkillEntry) {
    const error = await sdk()
      .orchestra.skills.remove({ location: { directory: props.directory }, path: skill.location })
      .then(
        () => undefined,
        (error: unknown) => ({ error }),
      )
    if (error) return writeFailure(error.error)
    if (abort.signal.aborted) return
    close(current)
    setState("pending", undefined)
    await load().catch(() => refresh())
  }

  // An undeclared answer throws a ClientError with its status and no message worth showing.
  function writeFailure(error: unknown) {
    const status = errorStatus(error)
    if (status === 404 || status === 405 || status === 501) return language.t("orchestra.skills.writeUnavailable")
    return (error instanceof ClientError ? undefined : skillErrorMessage(error)) ?? language.t("orchestra.skills.writeFailed")
  }


  onMount(() => refresh(warmed !== undefined))
  onCleanup(() => abort.abort())
```

Exact lines 175–187:

```ts
      <Show when={state.status === "error" || state.status === "unavailable"}>
        <button type="button" class="mx-btn orchestra-skills-retry" onClick={() => refresh()}>
          {language.t("orchestra.skills.retry")}
        </button>
      </Show>
      <Show when={state.status === "ready" && filtered().length}>
        <ul class="mx-grid orchestra-skills-grid" aria-label={language.t("orchestra.skills.catalog")}>
          <For each={filtered()}>
            {(skill) => {
              const source = () => skillSource(skill.location, props.directory)
              const access = () => skillAccess(skill.location, props.directory)
              return (
                <li class="mx-card skills-card" data-skill-location={skill.location}>
```

Exact lines 208–210:

```ts
                      onClick={() => setDialog({ type: "edit", skill, access: access() })}
                    >
                      {language.t(access() === "edit" ? "orchestra.skills.read" : "orchestra.skills.readOnly")}
```

Exact lines 219–238:

```ts
      <Show when={unlisted()}>
        {(location) => (
          <p class="mx-note orchestra-skills-notice">
            {language.t("orchestra.skills.notListed", { location: location() })}{" "}
            <button type="button" class="mx-link" onClick={() => refresh()}>
              {language.t("orchestra.skills.reload")}
            </button>
          </p>
        )}
      </Show>
      <Show when={dialog()} keyed>
        {(current) => (
          <SkillDialog
            state={current}
            onClose={() => close(current)}
            onSave={(input) => save(current, input)}
            onRemove={(skill) => remove(current, skill)}
            onAskRemove={(skill) => {
              if (dialog() === current) setDialog({ type: "remove", skill })
            }}
```

## skills-dialog

Client write shape, path/mtime identity, busy/lifetime handling and editable/removal affordances.

Source: `packages/app-shell/src/orchestra/chapters/skills-dialog.tsx`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `498439a6b815a1b51dfe756dc891fb450bae2e09`; SHA-256 `4d765b72649145007edfaeed34a5a397b311c6518b75ca5fc25defd31a77251a`.

Exact lines 5–26:

```ts
export type SkillDialogState =
  | { type: "add" }
  | { type: "edit"; skill: SkillEntry; access: SkillAccess }
  | { type: "remove"; skill: SkillEntry }

export type SkillSaveInput = { name: string; description: string; content: string; path?: string; mtime?: number }

// Mock `modal()`: one native modal dialog whose content is replaced per step. Each action resolves to
// an error message, or undefined once the page has applied it and closed the dialog.
export function SkillDialog(props: {
  state: SkillDialogState
  onClose: () => void
  onSave: (input: SkillSaveInput) => Promise<string | undefined>
  onRemove: (skill: SkillEntry) => Promise<string | undefined>
  onAskRemove: (skill: SkillEntry) => void
}) {
  const language = useLanguage()
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const lifetime = { disposed: false }
  const skill = props.state.type === "add" ? undefined : props.state.skill
  const editable = props.state.type === "add" || (props.state.type === "edit" && props.state.access === "edit")
```

Exact lines 34–57:

```ts
  async function run(action: () => Promise<string | undefined>) {
    if (busy()) return
    setBusy(true)
    setError(undefined)
    const failure = await action().catch(() => language.t("orchestra.skills.writeFailed"))
    if (lifetime.disposed) return
    setBusy(false)
    setError(failure)
  }

  function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const state = props.state
    if (state.type === "remove") return void run(() => props.onRemove(state.skill))
    const data = new FormData(event.currentTarget)
    void run(() =>
      props.onSave({
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        content: String(data.get("instructions") ?? ""),
        path: skill?.location,
        mtime: skill?.mtime ?? undefined,
      }),
    )
```

Exact lines 134–175:

```ts
            <label class="mx-field">
              <span>{language.t("orchestra.skills.dialog.name")}</span>
              <input name="name" type="text" value={skill?.name ?? ""} required readOnly={!editable || busy()} />
            </label>
            <label class="mx-field">
              <span>{language.t("orchestra.skills.dialog.description")}</span>
              <input
                name="description"
                type="text"
                value={skill?.description ?? ""}
                required
                readOnly={!editable || busy()}
              />
            </label>
            <label class="mx-field">
              <span>{language.t("orchestra.skills.content")}</span>
              <textarea
                name="instructions"
                value={skill?.content ?? ""}
                readOnly={!editable || busy()}
                rows={Math.min(16, (skill?.content ?? "").split("\n").length)}
              />
            </label>
            <Show when={props.state.type === "edit" && editable && skill}>
              {(target) => (
                <button type="button" class="mx-btn" disabled={busy()} onClick={() => props.onAskRemove(target())}>
                  {language.t("orchestra.skills.dialog.remove")}
                </button>
              )}
            </Show>
          </Show>
        </div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={() => dialog.close()}>
            {language.t("orchestra.skills.dialog.cancel")}
          </button>
          <Show when={editable || props.state.type === "remove"}>
            <button class="mx-btn primary" type="submit" disabled={busy()}>
              {language.t(
                props.state.type === "remove" ? "orchestra.skills.remove.confirm" : "orchestra.skills.dialog.save",
              )}
            </button>
```

## skills-protocol

Declared list/save/remove API and documented write ownership; not proof of filesystem enforcement.

Source: `packages/protocol/src/groups/skill.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `28b28134f9b9c751f9564737ea46034a9b36761e`; SHA-256 `290c280836fb40fbd5d963492088a4ff60c7b1d1d6315125e1317d6f58ce756f`.

Exact lines 8–56:

```ts
export const SkillRemoveQuery = Schema.Struct({
  ...LocationQuery.fields,
  path: Schema.String,
}).annotate({ identifier: "SkillRemoveQuery" })

export const SkillGroup = HttpApiGroup.make("server.skill")
  .add(
    HttpApiEndpoint.get("skill.list", "/api/skill", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Skill.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.list",
          summary: "List skills",
          description: "Retrieve currently registered skills.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("skill.save", "/api/skill", {
      query: LocationQuery,
      payload: Skill.SaveInput,
      success: Location.response(Skill.Info),
      error: [InvalidRequestError, ConflictError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.save",
          summary: "Save skill",
          description:
            "Create a project skill under .orchestra/skills, or rewrite a registered project skill file given its path. Global, built-in and Atlas-governed skills are read-only. Front matter is re-serialized as YAML.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("skill.remove", "/api/skill", {
      query: SkillRemoveQuery,
      success: Location.response(Schema.Boolean),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.skill.remove",
          summary: "Remove skill",
          description: "Delete a registered project skill file given its path, and its folder when that is left empty.",
```

## skills-handler

Location-scoped service delegation and conflict/invalid-request mapping.

Source: `packages/server/src/handlers/skill.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c06aa460901ac45fcfa0abee5b1d3833a9da8c88`; SHA-256 `e03ed59e0234bb6fd002db5a6e1ace5627ba1b0a70b1949ca934b2efd9d14a9c`.

Exact lines 10–46:

```ts
export const SkillHandler = HttpApiBuilder.group(Api, "server.skill", (handlers) =>
  handlers
    .handle("skill.list", () => response(SkillV2.Service.use((skill) => skill.list())))
    .handle(
      "skill.save",
      Effect.fn(function* (ctx) {
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        const input = ctx.payload
        return yield* response(
          skill.save(location.directory, {
            name: input.name,
            description: input.description,
            content: input.content,
            location: input.path,
            mtime: input.mtime,
          }),
        ).pipe(Effect.catchTag("SkillWriteError", (error) => Effect.fail(writeError(error))))
      }),
    )
    .handle(
      "skill.remove",
      Effect.fn(function* (ctx) {
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        return yield* response(skill.remove(location.directory, ctx.query.path).pipe(Effect.as(true))).pipe(
          Effect.catchTag("SkillWriteError", (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message, kind: error.reason, field: "path" })),
          ),
        )
      }),
    ),
)

function writeError(error: SkillFile.WriteError) {
  if (error.reason === "conflict") return new ConflictError({ message: error.message, resource: "skill" })
  return new InvalidRequestError({ message: error.message, kind: error.reason })
```
