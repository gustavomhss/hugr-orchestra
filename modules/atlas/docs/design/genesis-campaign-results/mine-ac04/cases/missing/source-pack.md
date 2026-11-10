# Immutable producer source pack

Repository: gustavomhss/hugr-orchestra
Commit: 1cde2ff7a71bcf7aecb5d030917b577165135d38
Case: missing

The numbered bodies below are source data. Path:blob values are Git object identities at the pinned commit. Fixture identity is a new SHA-256, never a claimed pre-existing Git blob.

## AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f

```text
Lines 207-218
207: ## V2 Session Core
208: 
209: - Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
210: - Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
211: - Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. V2 interruption targets the active process-local ownership chain for that Session; idle or missing interruption is a no-op.
212: - Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
213: - Preserve one explicit `llm.stream(request)` call per provider turn and reload projected history before durable continuation. Do not bridge through legacy `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop. The one exception is an agent whose `engine` names a registered `ExecutionHost` (today only `claude-code`): its single `ExecutionHost.stream(turn)` call is that provider turn, its internal tool calls persist as provider-executed events, Orchestra tools it invokes settle through the runner's `turn.execute`, and its `query()` always keeps the `claude_code` system prompt preset.
214: - Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
215: - Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
216: - Keep EventV2 replay owner claims separate from clustered Session execution ownership.
217: - Keep the System Context algebra, registry, and built-ins in `packages/core/src/system-context`; keep Context Source producers with their observed domains, and keep Session History selection plus Context Epoch persistence Session-owned.
218: 
```

## docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc

```text
Lines 3-35
3: ## Current V2 Core Slice
4: 
5: The Effect-native core facade treats prompt recording and execution as separate responsibilities:
6: 
7: ```text
8: sessions.create({ id?, location, ... })
9:   -> omitted ID generates one internal Session ID
10:   -> supplied ID creates the Session when absent
11:   -> reused ID returns the existing Session identity
12: 
13: sessions.prompt({ id?, sessionID, prompt, delivery?, resume? })
14:   -> omitted ID generates one internal message ID
15:   -> supplied ID inserts one durable Session inbox row when absent
16:   -> exact reuse returns the same admission receipt
17:   -> reusing one message ID for another Session, prompt, or delivery mode fails
18:   -> exact retry schedules another wake unless resume is false
19:   -> resume omitted or true schedules execution after admission
20:   -> resume false admits only
21: 
22: sessions.interrupt(sessionID)
23:   -> interrupts active execution on this process
24:   -> waits for runner cleanup and settlement
25:   -> clears a coalesced follow-up wake already registered with this coordinator
26:   -> preserves durable inbox rows for a later wake or resume
27:   -> idle or missing Session is a no-op
28: 
29: sessions.active()
30:   -> snapshots foreground Session drains owned by this process
31:   -> returns only active Session IDs with { type: "running" }
32:   -> absence means inactive; activity is not durable across process restarts
33: ```
34: 
35: `session_input` is the durable admission inbox. `PromptAdmitted` records and projects accepted input so pending queue state can be replayed, replicated, and observed by clients. Admitted inputs remain outside model-visible Session history until the serialized runner publishes `Prompted`. Its projector atomically writes the visible user message and marks the inbox row promoted in the same event transaction. The V1-to-V2 shadow bridge publishes the same `Prompted` event for already-visible V1 prompts.

Lines 155-171
155: Inbox delivery is explicit:
156: 
157: - `steer` inputs promote at the next safe provider-turn boundary, including continuation inside the current drain.
158: - `queue` inputs remain in a FIFO while the current drain requires continuation. When the Session would otherwise become idle, the runner promotes exactly one queued input, then reevaluates continuation before promoting another.
159: 
160: Execution has two entry points:
161: 
162: - `run` is an explicit resume. It joins any active execution or starts a forced drain while idle. A forced drain bypasses the no-eligible-input guard, but preparation may still fail before a provider attempt.
163: - `wake` reports newly recorded durable inbox work. Repeated wakes coalesce. A wake calls the provider only when it can promote eligible input.
164: 
165: Post-crash continuation recovery is intentionally deferred. A wake does not infer that ambiguous provider work is safe to retry after an input has already been promoted. Explicit `run` may deliberately continue from durable projected history. A future recovery slice should model provider-dispatch ambiguity, required continuation, queued-input promotion, retry policy, and visible recovery status together. It must not assume an enclosing durable execution identity that the Session model does not otherwise need.
166: 
167: A process-global `SessionRunCoordinator` serializes execution for each local Session while allowing different Sessions to run concurrently. Resumes join active execution, overlapping wakes coalesce into one follow-up, and interruption stops current process-local execution without deleting durable inbox work. The runner enters the Session's current Location when execution starts and fences each new provider turn against that Location.
168: 
169: The coordinator's active registry is also the source for `sessions.active()`. It represents only foreground Session drains owned by the current process; background subagents and tasks do not add parent Sessions to this registry. The snapshot is runtime state and is empty after a process restart.
170: 
171: Inbox promotion coalesces pending steers in durable admission order. Once continuation would otherwise end, it promotes one queued input at a time in FIFO order. Add explicit inbox backlog and steering-batch limits before exposing broad multi-caller admission or untrusted queue growth.
```

## packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2

```text
Lines 48-94
48: export const admit = Effect.fn("SessionInput.admit")(function* (
49:   db: DatabaseService,
50:   events: EventV2.Interface,
51:   input: {
52:     readonly id: SessionMessage.ID
53:     readonly sessionID: SessionSchema.ID
54:     readonly prompt: Prompt
55:     readonly promptContext?: PromptContext.Info
56:     readonly delivery: Delivery
57:   },
58: ) {
59:   const existing = yield* find(db, input.id)
60:   if (existing !== undefined) {
61:     if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
62:     return existing
63:   }
64:   const historical = yield* reconcileHistorical(db, input)
65:   if (historical !== undefined) return historical
66:   const timestamp = yield* DateTime.now
67:   return yield* events
68:     .publish(SessionEvent.PromptAdmitted, {
69:       messageID: input.id,
70:       sessionID: input.sessionID,
71:       timestamp,
72:       prompt: input.prompt,
73:       promptContext: input.promptContext,
74:       delivery: input.delivery,
75:     })
76:     .pipe(
77:       Effect.flatMap((event) =>
78:         event.durable === undefined
79:           ? Effect.die("Prompt admission event is missing aggregate sequence")
80:           : find(db, input.id).pipe(
81:               Effect.flatMap((stored) =>
82:                 stored === undefined ? Effect.die("Prompt admission projection is missing") : Effect.succeed(stored),
83:               ),
84:             ),
85:       ),
86:       Effect.catchDefect((defect) =>
87:         find(db, input.id).pipe(
88:           Effect.flatMap((stored) =>
89:             stored && equivalent(stored, input) ? Effect.succeed(stored) : Effect.die(defect),
90:           ),
91:         ),
92:       ),
93:     )
94: })

Lines 200-252
200: export const projectPrompted = Effect.fn("SessionInput.projectPrompted")(function* (
201:   db: DatabaseService,
202:   input: {
203:     readonly id: SessionMessage.ID
204:     readonly sessionID: SessionSchema.ID
205:     readonly prompt: Prompt
206:     readonly promptContext?: PromptContext.Info
207:     readonly delivery: Delivery
208:     readonly timeCreated: DateTime.Utc
209:     readonly promotedSeq: number
210:   },
211: ) {
212:   const updated = yield* db
213:     .update(SessionInputTable)
214:     .set({ promoted_seq: input.promotedSeq })
215:     .where(
216:       and(
217:         eq(SessionInputTable.id, input.id),
218:         eq(SessionInputTable.session_id, input.sessionID),
219:         isNull(SessionInputTable.promoted_seq),
220:       ),
221:     )
222:     .returning()
223:     .get()
224:     .pipe(Effect.orDie)
225:   if (updated) {
226:     const stored = fromRow(updated)
227:     if (!matchesProjection(stored, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
228:     return
229:   }
230: 
231:   const stored = yield* find(db, input.id)
232:   if (stored) {
233:     if (!matchesProjection(stored, input) || stored.promotedSeq !== input.promotedSeq)
234:       return yield* Effect.die(new LifecycleConflict({ id: input.id }))
235:     return
236:   }
237: 
238:   yield* db
239:     .insert(SessionInputTable)
240:     .values({
241:       id: input.id,
242:       session_id: input.sessionID,
243:       prompt: encodePrompt(input.prompt),
244:       prompt_context: input.promptContext,
245:       delivery: input.delivery,
246:       admitted_seq: input.promotedSeq,
247:       promoted_seq: input.promotedSeq,
248:       time_created: DateTime.toEpochMillis(input.timeCreated),
249:     })
250:     .run()
251:     .pipe(Effect.orDie)
252: })

Lines 291-316
291: export const equivalent = (
292:   input: Admitted,
293:   expected: {
294:     readonly sessionID: SessionSchema.ID
295:     readonly prompt: Prompt
296:     readonly delivery: Delivery
297:   },
298: ) => input.delivery === expected.delivery && matchesPrompt(input, expected)
299: 
300: const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
301:   input.sessionID === expected.sessionID &&
302:   JSON.stringify(encodePrompt(input.prompt)) === JSON.stringify(encodePrompt(expected.prompt))
303: 
304: const matchesProjection = (
305:   input: Admitted,
306:   expected: {
307:     readonly sessionID: SessionSchema.ID
308:     readonly prompt: Prompt
309:     readonly promptContext?: PromptContext.Info
310:     readonly delivery: Delivery
311:     readonly timeCreated: DateTime.Utc
312:   },
313: ) =>
314:   equivalent(input, expected) &&
315:   JSON.stringify(input.promptContext) === JSON.stringify(expected.promptContext) &&
316:   DateTime.toEpochMillis(input.timeCreated) === DateTime.toEpochMillis(expected.timeCreated)
```

## packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6

```text
Lines 194-230
194:       // Before agent selection and promotion: a refused turn leaves pending input pending.
195:       yield* governance.beforeTurn(session)
196:       const agent = yield* agents.select(session.agent)
197:       // A Session's own permission rules, after its agent's as the earlier runtime merged them, so a Session rule wins over the agent's.
198:       const effectiveRules = [
199:         ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
200:         ...(yield* store.permissions(session.id)),
201:       ]
202:       const initialized = yield* SessionContextEpoch.initialize(db, loadSystemContext(session.id, agent), session.id)
203:       const toolFibers = yield* FiberSet.make<void, ToolOutputStore.Error>()
204:       let needsContinuation = false
205:       let currentStep = step
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
```

## Imported fixture

Path: modules/atlas/docs/design/genesis-campaign-results/mine-ac04/cases/missing/fixture.md
SHA-256: d290ae1658d71eaa4698cbdebe46879247ea5d8a7ff07a74758b0255bd690417

```text
# Labelled fixture — incomplete projection evidence pack

The source-pack inventory intentionally omits packages/core/src/session/projector.ts. No event-publication transaction implementation is supplied. Existing documentation is retained and must be attributed as documentation. This labelled removal is not a repository deletion.
```
