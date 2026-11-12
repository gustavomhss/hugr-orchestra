# S1 A1 recovery delta: E4-context

Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Literal source excerpts, newly transported during recovery. They supplement, not replace, original dossier/reviews. E-number maps to J2 E1–E4 and J1 A1-R1–R4. No runtime or test execution asserted. No new semantic acceptance.

## E4-01: `packages/core/src/system-context/index.ts` lines 31–59

Git blob: `af6e4b8397ac971476c63ca8c0e0d65273ddc933`; whole-source SHA-256: `1f75c1982f73364cd29d5b5a5d0e34e2c848b83de0d5024be63ae61d24e448b1`.

```text
31: export const unavailable = Symbol.for("@orchestra/SystemContext.Unavailable")
32: export type Unavailable = typeof unavailable
33: 
34: /** Defines one typed source before its value type is hidden by `make`. */
35: export interface Source<A> {
36:   readonly key: Key
37:   readonly codec: Schema.Codec<A, Schema.Json, never, never>
38:   readonly load: Effect.Effect<A | Unavailable>
39:   readonly baseline: (current: A) => string
40:   readonly update: (previous: A, current: A) => string
41:   readonly removed?: (previous: A) => string
42: }
43: 
44: const ContextTypeId: unique symbol = Symbol.for("@orchestra/SystemContext")
45: 
46: /** Opaque carrier for composable system context sources. */
47: export interface SystemContext {
48:   readonly [ContextTypeId]: ReadonlyArray<PackedSource>
49: }
50: 
51: /** Durable comparison state for one admitted source. */
52: export const SourceSnapshot = Schema.Struct({
53:   value: Schema.Json,
54:   removed: Schema.optional(Schema.NonEmptyString),
55: })
56: export type SourceSnapshot = typeof SourceSnapshot.Type
57: 
58: /** Durable structured comparison state for one active context generation. */
59: export const Snapshot = Schema.Record(Key, SourceSnapshot)
```

## E4-02: `packages/core/src/system-context/index.ts` lines 138–182

Git blob: `af6e4b8397ac971476c63ca8c0e0d65273ddc933`; whole-source SHA-256: `1f75c1982f73364cd29d5b5a5d0e34e2c848b83de0d5024be63ae61d24e448b1`.

```text
138: export function make<A>(source: Source<A>): SystemContext {
139:   const decode = Schema.decodeUnknownOption(source.codec)
140:   const encode = Schema.encodeSync(source.codec)
141:   const equivalent = Schema.toEquivalence(source.codec)
142:   return context([
143:     {
144:       key: source.key,
145:       load: source.load.pipe(
146:         Effect.map((value) => {
147:           if (isUnavailable(value)) return value
148:           const snapshot = (): SourceSnapshot => ({
149:             value: encode(value),
150:             ...(source.removed ? { removed: requireText(source.key, "removal", source.removed(value)) } : {}),
151:           })
152:           return {
153:             baseline: (): Rendered => ({
154:               text: requireText(source.key, "baseline", source.baseline(value)),
155:               snapshot: snapshot(),
156:             }),
157:             compare: (previous): Compared =>
158:               Option.match(decode(previous), {
159:                 onNone: (): Compared => ({ _tag: "Incompatible" }),
160:                 onSome: (decoded): Compared =>
161:                   equivalent(decoded, value)
162:                     ? { _tag: "Unchanged" }
163:                     : {
164:                         _tag: "Updated",
165:                         render: () => ({
166:                           text: requireText(source.key, "update", source.update(decoded, value)),
167:                           snapshot: snapshot(),
168:                         }),
169:                       },
170:               }),
171:           }
172:         }),
173:       ),
174:     },
175:   ])
176: }
177: 
178: /** Combines contexts in order and rejects duplicate source keys immediately. */
179: export function combine(values: ReadonlyArray<SystemContext>): SystemContext {
180:   const sources = values.flatMap((value) => value[ContextTypeId])
181:   assertUniqueKeys(sources)
182:   return context(sources)
```

## E4-03: `packages/core/src/system-context/index.ts` lines 201–295

Git blob: `af6e4b8397ac971476c63ca8c0e0d65273ddc933`; whole-source SHA-256: `1f75c1982f73364cd29d5b5a5d0e34e2c848b83de0d5024be63ae61d24e448b1`.

```text
201: export function initialize(value: SystemContext): Effect.Effect<Generation, InitializationBlocked> {
202:   return observe(value).pipe(
203:     Effect.flatMap((entries) => {
204:       const unavailable = entries.flatMap((entry) => (entry._tag === "Unavailable" ? [entry.key] : []))
205:       if (unavailable.length > 0) return new InitializationBlocked({ keys: unavailable })
206:       return Effect.succeed(initializeObservation(entries))
207:     }),
208:   )
209: }
210: 
211: function initializeObservation(entries: ReadonlyArray<Entry>): Generation {
212:   const available = entries.filter((entry): entry is AvailableEntry => entry._tag === "Available")
213:   const rendered = available.map((entry) => [entry.key, entry.baseline()] as const)
214:   return {
215:     baseline: render(rendered.map(([, result]) => result.text)),
216:     snapshot: Object.fromEntries(rendered.map(([key, result]) => [key, result.snapshot])),
217:   }
218: }
219: 
220: /** Reconciles current source values with one active generation. */
221: export function reconcile(value: SystemContext, previous: Snapshot): Effect.Effect<ReconcileResult> {
222:   return observe(value).pipe(
223:     Effect.map((entries): ReconcileResult => {
224:       const result = reconcileObservation(entries, previous)
225:       if (result._tag === "Unchanged" || result._tag === "Updated") return result
226:       return replaceObservation(entries, previous)
227:     }),
228:   )
229: }
230: 
231: function reconcileObservation(
232:   entries: ReadonlyArray<Entry>,
233:   previous: Snapshot,
234: ): { readonly _tag: "Unchanged" } | Updated | { readonly _tag: "Replace" } {
235:   const keys = new Set(entries.map((entry) => entry.key))
236:   const comparisons = new Map<Key, Compared>()
237:   for (const entry of entries) {
238:     if (entry._tag === "Unavailable") continue
239:     const stored = getSnapshot(previous, entry.key)
240:     if (!stored) continue
241:     const compared = entry.compare(stored.value)
242:     if (compared._tag === "Incompatible") return { _tag: "Replace" }
243:     comparisons.set(entry.key, compared)
244:   }
245:   for (const key of Object.keys(previous).sort()) {
246:     if (keys.has(Key.make(key))) continue
247:     if (previous[key].removed === undefined) return { _tag: "Replace" }
248:   }
249: 
250:   const snapshot: Record<string, SourceSnapshot> = {}
251:   const updates: string[] = []
252:   for (const entry of entries) {
253:     const stored = getSnapshot(previous, entry.key)
254:     if (entry._tag === "Unavailable") {
255:       if (stored) snapshot[entry.key] = stored
256:       continue
257:     }
258:     if (!stored) {
259:       const rendered = entry.baseline()
260:       updates.push(rendered.text)
261:       snapshot[entry.key] = rendered.snapshot
262:       continue
263:     }
264:     const compared = comparisons.get(entry.key)
265:     if (!compared || compared._tag === "Incompatible")
266:       throw new Error(`Missing comparison for system context source ${entry.key}`)
267:     if (compared._tag === "Unchanged") {
268:       snapshot[entry.key] = stored
269:       continue
270:     }
271:     const rendered = compared.render()
272:     updates.push(rendered.text)
273:     snapshot[entry.key] = rendered.snapshot
274:   }
275:   for (const key of Object.keys(previous).sort()) {
276:     if (keys.has(Key.make(key))) continue
277:     const removed = previous[key].removed
278:     if (removed === undefined) throw new Error(`Missing removal rendering for system context source ${key}`)
279:     updates.push(removed)
280:   }
281:   if (updates.length === 0) return { _tag: "Unchanged" }
282:   return { _tag: "Updated", text: render(updates), snapshot }
283: }
284: 
285: /** Creates a complete replacement generation or blocks while admitted context is unavailable. */
286: export function replace(value: SystemContext, previous: Snapshot): Effect.Effect<ReplacementResult> {
287:   return observe(value).pipe(Effect.map((entries) => replaceObservation(entries, previous)))
288: }
289: 
290: function replaceObservation(entries: ReadonlyArray<Entry>, previous: Snapshot): ReplacementResult {
291:   if (entries.some((entry) => entry._tag === "Unavailable" && getSnapshot(previous, entry.key) !== undefined))
292:     return { _tag: "ReplacementBlocked" }
293:   return { _tag: "ReplacementReady", generation: initializeObservation(entries) }
294: }
295: 
```

## E4-04: `packages/core/src/session/context-epoch.ts` lines 23–88

Git blob: `65b17a86a4fb131d427e12d489cec2c06a088094`; whole-source SHA-256: `b6e07dccc330779192975a58d763941a9b8ae458cc6974e040c26cd149ff7fd8`.

```text
23: export function initialize(
24:   db: DatabaseService,
25:   context: Effect.Effect<SystemContext.SystemContext>,
26:   sessionID: SessionSchema.ID,
27: ): Effect.Effect<Prepared | undefined, SystemContext.InitializationBlocked> {
28:   return initializeOnce(db, context, sessionID).pipe(Effect.withSpan("SessionContextEpoch.initialize"))
29: }
30: 
31: export function prepare(
32:   db: DatabaseService,
33:   events: EventV2.Interface,
34:   context: Effect.Effect<SystemContext.SystemContext>,
35:   sessionID: SessionSchema.ID,
36: ): Effect.Effect<Prepared, SystemContext.InitializationBlocked | ContextSnapshotDecodeError> {
37:   return prepareOnce(db, events, context, sessionID).pipe(Effect.withSpan("SessionContextEpoch.prepare"))
38: }
39: 
40: const prepareOnce = Effect.fnUntraced(function* (
41:   db: DatabaseService,
42:   events: EventV2.Interface,
43:   context: Effect.Effect<SystemContext.SystemContext>,
44:   sessionID: SessionSchema.ID,
45: ) {
46:   const [value, stored, compaction] = yield* Effect.all(
47:     [context, find(db, sessionID), SessionHistory.latestCompaction(db, sessionID)],
48:     { concurrency: "unbounded" },
49:   )
50:   if (!stored) {
51:     const generation = yield* SystemContext.initialize(value)
52:     const baselineSeq = yield* insert(db, sessionID, generation)
53:     return { baseline: generation.baseline, baselineSeq }
54:   }
55: 
56:   const snapshot = yield* Schema.decodeUnknownEffect(SystemContext.Snapshot)(stored.snapshot).pipe(
57:     Effect.mapError((error) => new ContextSnapshotDecodeError({ sessionID, details: String(error) })),
58:   )
59:   const replacementSeq = compaction !== undefined && compaction.seq > stored.baseline_seq ? compaction.seq : undefined
60:   const result = replacementSeq
61:     ? yield* SystemContext.replace(value, snapshot)
62:     : yield* SystemContext.reconcile(value, snapshot)
63:   if (result._tag === "Unchanged" || result._tag === "ReplacementBlocked") {
64:     return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
65:   }
66:   if (result._tag === "ReplacementReady") {
67:     const baselineSeq = replacementSeq ?? (yield* EventV2.latestSequence(db, sessionID))
68:     yield* replace(db, sessionID, baselineSeq, result.generation)
69:     return { baseline: result.generation.baseline, baselineSeq }
70:   }
71: 
72:   yield* events.publish(
73:     SessionEvent.ContextUpdated,
74:     { sessionID, messageID: SessionMessage.ID.create(), timestamp: yield* DateTime.now, text: result.text },
75:     { commit: () => advance(db, sessionID, result.snapshot).pipe(Effect.orDie) },
76:   )
77:   return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
78: })
79: 
80: const initializeOnce = Effect.fnUntraced(function* (
81:   db: DatabaseService,
82:   context: Effect.Effect<SystemContext.SystemContext>,
83:   sessionID: SessionSchema.ID,
84: ) {
85:   if (yield* exists(db, sessionID)) return
86:   const generation = yield* context.pipe(Effect.flatMap(SystemContext.initialize))
87:   const baselineSeq = yield* insert(db, sessionID, generation)
88:   return { baseline: generation.baseline, baselineSeq }
```

## E4-05: `packages/core/src/session/context-epoch.ts` lines 122–174

Git blob: `65b17a86a4fb131d427e12d489cec2c06a088094`; whole-source SHA-256: `b6e07dccc330779192975a58d763941a9b8ae458cc6974e040c26cd149ff7fd8`.

```text
122: const insert = Effect.fnUntraced(function* (
123:   db: DatabaseService,
124:   sessionID: SessionSchema.ID,
125:   generation: SystemContext.Generation,
126: ) {
127:   const baselineSeq = yield* EventV2.latestSequence(db, sessionID)
128:   yield* db
129:     .insert(SessionContextEpochTable)
130:     .values({
131:       session_id: sessionID,
132:       baseline: generation.baseline,
133:       snapshot: generation.snapshot,
134:       baseline_seq: baselineSeq,
135:     })
136:     .run()
137:     .pipe(Effect.orDie)
138:   return baselineSeq
139: })
140: 
141: const replace = Effect.fnUntraced(function* (
142:   db: DatabaseService,
143:   sessionID: SessionSchema.ID,
144:   baselineSeq: number,
145:   generation: SystemContext.Generation,
146: ) {
147:   const updated = yield* db
148:     .update(SessionContextEpochTable)
149:     .set({
150:       baseline: generation.baseline,
151:       snapshot: generation.snapshot,
152:       baseline_seq: baselineSeq,
153:     })
154:     .where(eq(SessionContextEpochTable.session_id, sessionID))
155:     .returning({ sessionID: SessionContextEpochTable.session_id })
156:     .get()
157:     .pipe(Effect.orDie)
158:   if (!updated) return yield* Effect.die("Context Epoch not found")
159: })
160: 
161: const advance = Effect.fnUntraced(function* (
162:   db: DatabaseService,
163:   sessionID: SessionSchema.ID,
164:   snapshot: SystemContext.Snapshot,
165: ) {
166:   const updated = yield* db
167:     .update(SessionContextEpochTable)
168:     .set({ snapshot })
169:     .where(eq(SessionContextEpochTable.session_id, sessionID))
170:     .returning({ sessionID: SessionContextEpochTable.session_id })
171:     .get()
172:     .pipe(Effect.orDie)
173:   if (!updated) return yield* Effect.die("Context Epoch not found")
174: })
```

## E4-06: `packages/core/src/config.ts` lines 180–207

Git blob: `52985a1dfc3575efca662dcb0667d81a1ab6f1de`; whole-source SHA-256: `bc4ce670f2214fcecab7f7a705f04aecd0f48c7cf03076c67e55421956a625e6`.

```text
180:           path: filepath,
181:           message: `${filepath}: ${errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(", ")}`,
182:         })
183: 
184:       const info = yield* (
185:         ConfigUpgrade.needsUpgrade(input)
186:           ? decodeOldInfo(input).pipe(
187:               Effect.map(ConfigUpgrade.migrate),
188:               // Settings write current `permissions` into a file that may still hold old keys; the old-format decode drops them.
189:               Effect.map((info) => {
190:                 const rules = [...(info.permissions ?? []), ...settings(text).permissions]
191:                 return { ...info, permissions: rules.length ? rules : undefined }
192:               }),
193:               Effect.flatMap(decodeInfo),
194:             )
195:           : decodeInfo(input)
196:       ).pipe(Effect.mapError((error) => new InvalidError({ path: filepath, message: `${filepath}: ${error.message}` })))
197:       const remote = info.instructions?.find((entry) => /^[a-z][a-z0-9+.-]*:\/\//i.test(entry))
198:       if (remote !== undefined)
199:         return yield* new InvalidError({
200:           path: filepath,
201:           message: `${filepath}: instructions must be local file paths; remote URLs are not supported (${remote})`,
202:         })
203:       return new Document({ type: "document", path: filepath, info })
204:     })
205: 
206:     const loadDirectory = Effect.fnUntraced(function* (directory: AbsolutePath) {
207:       return [
```

## E4-07: `packages/core/src/session/compaction.ts` lines 17–20

Git blob: `26f09bdbf2f5908199270ad5e4d24f520dee548f`; whole-source SHA-256: `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`.

```text
17: const DEFAULT_BUFFER = 20_000
18: const DEFAULT_KEEP_TOKENS = 8_000
19: const TOOL_OUTPUT_MAX_CHARS = 2_000
20: const SUMMARY_OUTPUT_TOKENS = 4_096
```

## E4-08: `packages/core/src/session/compaction.ts` lines 93–179

Git blob: `26f09bdbf2f5908199270ad5e4d24f520dee548f`; whole-source SHA-256: `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`.

```text
93: export const usable = (
94:   limits: { readonly input?: number } | undefined,
95:   context: number,
96:   output: number,
97:   buffer: number,
98: ) => {
99:   const window = context - Math.max(output, buffer)
100:   return limits?.input !== undefined && limits.input > 0 ? Math.min(window, limits.input - buffer) : window
101: }
102: 
103: const estimate = (value: unknown) => Token.estimate(JSON.stringify(value))
104: 
105: const truncate = (value: string) =>
106:   value.length <= TOOL_OUTPUT_MAX_CHARS ? value : `${value.slice(0, TOOL_OUTPUT_MAX_CHARS)}\n[truncated]`
107: 
108: export const serializeToolContent = (content: SessionMessage.ToolStateCompleted["content"]) =>
109:   content
110:     .map((item) =>
111:       item.type === "text" ? item.text : `[Attached ${item.mime}${item.name === undefined ? "" : `: ${item.name}`}]`,
112:     )
113:     .join("\n")
114: 
115: const serialize = (message: SessionMessage.Message) => {
116:   if (message.type === "user") {
117:     const files = message.files?.map((file) => `[Attached ${file.mime}: ${file.name ?? file.uri}]`) ?? []
118:     const reminders = message.promptContext?.reminders.map((note) => `[Hook reminder]: ${note}`) ?? []
119:     return [`[User]: ${message.text}`, ...files, ...reminders].join("\n")
120:   }
121:   if (message.type === "assistant") {
122:     return message.content
123:       .flatMap((part) => {
124:         if (part.type === "text") return [`[Assistant]: ${part.text}`]
125:         if (part.type === "reasoning") return part.text ? [`[Assistant reasoning]: ${part.text}`] : []
126:         const input = typeof part.state.input === "string" ? part.state.input : JSON.stringify(part.state.input)
127:         if (part.state.status === "completed")
128:           return [
129:             `[Assistant tool call]: ${part.name}(${input})`,
130:             `[Tool result]: ${truncate(serializeToolContent(part.state.content))}`,
131:           ]
132:         if (part.state.status === "error")
133:           return [`[Assistant tool call]: ${part.name}(${input})`, `[Tool error]: ${part.state.error.message}`]
134:         return [`[Assistant tool call]: ${part.name}(${input})`]
135:       })
136:       .join("\n")
137:   }
138:   if (message.type === "system") return `[System update]: ${message.text}`
139:   if (message.type === "synthetic") return `[Synthetic context]: ${message.text}`
140:   if (message.type === "shell") return `[Shell]: ${message.command}\n${truncate(message.output)}`
141:   return ""
142: }
143: 
144: const settings = (documents: readonly Config.Entry[]) => {
145:   const configured = documents
146:     .filter((entry): entry is Config.Document => entry.type === "document")
147:     .flatMap((entry) => (entry.info.compaction ? [entry.info.compaction] : []))
148:   return configured.reduce<Settings>(
149:     (result, current) => ({
150:       auto: current.auto ?? result.auto,
151:       buffer: current.buffer ?? result.buffer,
152:       tokens: current.keep?.tokens ?? result.tokens,
153:     }),
154:     { auto: true, buffer: DEFAULT_BUFFER, tokens: DEFAULT_KEEP_TOKENS },
155:   )
156: }
157: 
158: const select = (
159:   entries: readonly Entry[],
160:   tokens: number,
161: ): { readonly head: string; readonly recent: string } | undefined => {
162:   const conversation = entries
163:     .filter((entry) => entry.message.type !== "compaction")
164:     .map((entry) => serialize(entry.message))
165:     .filter(Boolean)
166:   if (conversation.length === 0) return
167:   let total = 0
168:   let split = conversation.length
169:   for (let index = conversation.length - 1; index >= 0; index--) {
170:     const next = total + Token.estimate(conversation[index])
171:     if (next > tokens) break
172:     total = next
173:     split = index
174:   }
175:   return {
176:     head: conversation.slice(0, split).join("\n\n"),
177:     recent: conversation.slice(split).join("\n\n"),
178:   }
179: }
```

## E4-09: `packages/core/src/session/compaction.ts` lines 197–280

Git blob: `26f09bdbf2f5908199270ad5e4d24f520dee548f`; whole-source SHA-256: `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`.

```text
197: export const make = (dependencies: Dependencies) => {
198:   const config = settings(dependencies.config)
199:   const summarize = Effect.fnUntraced(function* (input: Input, reason: "auto" | "manual") {
200:     const context = input.model.route.defaults.limits?.context
201:     const output = input.request.generation?.maxTokens ?? input.model.route.defaults.limits?.output ?? 0
202:     const previousSummary = input.entries.find((entry) => entry.message.type === "compaction")?.message
203:     const kept = select(input.entries, config.tokens)
204:     // A requested compaction of a conversation shorter than the kept tail summarizes all of it.
205:     const selected =
206:       reason === "manual" && kept?.head.length === 0 && previousSummary?.type !== "compaction"
207:         ? select(input.entries, 0)
208:         : kept
209:     if (!selected || (selected.head.length === 0 && previousSummary?.type !== "compaction")) return false
210:     const summaryPrompt = buildPrompt({
211:       previousSummary: previousSummary?.type === "compaction" ? previousSummary.summary : undefined,
212:       context: [previousSummary?.type === "compaction" ? previousSummary.recent : "", selected.head].filter(Boolean),
213:     })
214:     const summaryOutput = Math.min(output || SUMMARY_OUTPUT_TOKENS, SUMMARY_OUTPUT_TOKENS)
215:     if (context !== undefined && context > 0 && Token.estimate(summaryPrompt) > context - summaryOutput) return false
216:     const messageID = SessionMessage.ID.create()
217:     yield* dependencies.events.publish(SessionEvent.Compaction.Started, {
218:       sessionID: input.sessionID,
219:       messageID,
220:       timestamp: yield* DateTime.now,
221:       reason,
222:     })
223: 
224:     const chunks: string[] = []
225:     let failed = false
226:     yield* dependencies.subagentModels.assert(input.sessionID, SessionRunnerModel.reference(input.model))
227:     const summarized = yield* dependencies.llm
228:       .stream(
229:         LLM.request({
230:           model: input.model,
231:           http: input.request.http,
232:           messages: [Message.user(summaryPrompt)],
233:           tools: [],
234:           generation: { maxTokens: summaryOutput },
235:         }),
236:       )
237:       .pipe(
238:         Stream.runForEach((event) => {
239:           if (LLMEvent.is.providerError(event)) failed = true
240:           if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
241:           return Effect.void
242:         }),
243:         Effect.as(true),
244:         Effect.catchTag("LLM.Error", () => Effect.succeed(false)),
245:       )
246:     const summary = chunks.join("")
247:     if (!summarized || failed || !summary.trim()) return false
248:     yield* dependencies.events.publish(SessionEvent.Compaction.Ended, {
249:       sessionID: input.sessionID,
250:       messageID,
251:       timestamp: yield* DateTime.now,
252:       reason,
253:       text: summary,
254:       recent: selected.recent,
255:     })
256:     return true
257:   })
258:   const compactAfterOverflow = Effect.fn("SessionCompaction.compactAfterOverflow")(function* (input: Input) {
259:     const context = input.model.route.defaults.limits?.context
260:     if (context === undefined || context <= 0) return false
261:     return yield* summarize(input, "auto")
262:   })
263:   /** Compacts on request, whatever the context size; false when there is nothing to summarize or the summary failed. */
264:   const compact = Effect.fn("SessionCompaction.compact")((input: Input) => summarize(input, "manual"))
265:   const compactIfNeeded = Effect.fn("SessionCompaction.compactIfNeeded")(function* (input: Input) {
266:     if (!config.auto) return false
267:     const context = input.model.route.defaults.limits?.context
268:     if (context === undefined || context <= 0) return false
269:     const output = input.request.generation?.maxTokens ?? input.model.route.defaults.limits?.output ?? 0
270:     if (
271:       estimate({ system: input.request.system, messages: input.request.messages, tools: input.request.tools }) <=
272:       usable(input.model.route.defaults.limits, context, output, config.buffer)
273:     )
274:       return false
275:     return yield* compactAfterOverflow(input)
276:   })
277:   return {
278:     compact,
279:     compactIfNeeded,
280:     compactAfterOverflow,
```

## E4-10: `packages/core/src/session/compaction.ts` lines 284–310

Git blob: `26f09bdbf2f5908199270ad5e4d24f520dee548f`; whole-source SHA-256: `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`.

```text
284: /**
285:  * Location-scoped compaction. A replacement keeps the summarizing hooks and may reshape what one provider turn sees
286:  * (`transform`) or react to the usage a settled step reports (`afterStep`); neither may record Session events
287:  * outside the summary events or fail the turn.
288:  */
289: export interface Interface {
290:   readonly compact: (input: Input) => Effect.Effect<boolean, SessionSubagentModels.Error>
291:   readonly compactIfNeeded: (input: Input) => Effect.Effect<boolean, SessionSubagentModels.Error>
292:   readonly compactAfterOverflow: (input: Input) => Effect.Effect<boolean, SessionSubagentModels.Error>
293:   /** The messages one provider-model turn sends; hosted engine turns receive their history unchanged. */
294:   readonly transform: (input: {
295:     readonly sessionID: SessionSchema.ID
296:     readonly messages: readonly Message[]
297:     readonly model: Model
298:     /** The tools this turn offers, after the agent's permissions; a replacement may rely on one only if listed. */
299:     readonly tools: LLMRequest["tools"]
300:   }) => Effect.Effect<readonly Message[]>
301:   /** Runs after a step settled with its token usage. */
302:   readonly afterStep: (input: {
303:     readonly sessionID: SessionSchema.ID
304:     readonly tokens: EventV2.Data<typeof SessionEvent.Step.Ended>["tokens"]
305:     readonly model: ModelV2.Ref | undefined
306:     /** The context window the provider or host reported with the step, when it did. */
307:     readonly contextWindow?: number
308:   }) => Effect.Effect<void>
309: }
310: 
```

## E4-11: `packages/core/src/session/runner/llm.ts` lines 449–457

Git blob: `c3ad8d87a58923d40797d38a77ff65367bbe66b6`; whole-source SHA-256: `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`.

```text
449:       const providerStream = source.pipe(
450:         Stream.runForEach((event) =>
451:           Effect.gen(function* () {
452:             if (overflowFailure || publisher.hasProviderError()) return
453:             if (LLMEvent.is.providerError(event)) {
454:               if (isContextOverflowFailure(event) && !publisher.hasAssistantStarted()) {
455:                 overflowFailure = event
456:                 return
457:               }
```

## E4-12: `packages/core/src/session/runner/llm.ts` lines 492–506

Git blob: `c3ad8d87a58923d40797d38a77ff65367bbe66b6`; whole-source SHA-256: `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`.

```text
492:       return yield* Effect.uninterruptibleMask((restore) =>
493:         Effect.gen(function* () {
494:           const stream = yield* restore(providerStream).pipe(Effect.exit)
495:           if (liveSteers.size > 0) needsContinuation = true
496:           const failure =
497:             stream._tag === "Failure" ? Option.getOrUndefined(Cause.findErrorOption(stream.cause)) : undefined
498:           if (
499:             recoverOverflow &&
500:             model &&
501:             request &&
502:             !publisher.hasAssistantStarted() &&
503:             isContextOverflowFailure(overflowFailure ?? failure) &&
504:             (yield* restore(recoverOverflow({ sessionID: session.id, entries, model, request })))
505:           )
506:             return yield* Effect.die(continueAfterOverflowCompaction(currentStep))
```

## E4-13: `packages/core/src/session/runner/llm.ts` lines 588–614

Git blob: `c3ad8d87a58923d40797d38a77ff65367bbe66b6`; whole-source SHA-256: `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`.

```text
588:     const runAfterOverflowCompaction: RunTurn = Effect.fnUntraced(function* (sessionID, promotion, step) {
589:       return yield* runTurnAttempt(sessionID, promotion, step).pipe(
590:         Effect.catchDefect(
591:           Effect.fnUntraced(function* (defect) {
592:             if (!(defect instanceof TurnTransitionError)) return yield* Effect.die(defect)
593:             if (defect.transition._tag === "ContinueAfterOverflowCompaction")
594:               return yield* Effect.die("Post-compaction provider attempt cannot recover another overflow")
595:             yield* Effect.yieldNow
596:             return yield* runAfterOverflowCompaction(sessionID, undefined, defect.transition.step)
597:           }),
598:         ),
599:       )
600:     })
601: 
602:     const runTurn: RunTurn = Effect.fnUntraced(function* (sessionID, promotion, step) {
603:       return yield* runTurnAttempt(sessionID, promotion, step, compaction.compactAfterOverflow).pipe(
604:         Effect.catchDefect(
605:           Effect.fnUntraced(function* (defect) {
606:             if (!(defect instanceof TurnTransitionError)) return yield* Effect.die(defect)
607:             yield* Effect.yieldNow
608:             if (defect.transition._tag === "ContinueAfterOverflowCompaction")
609:               return yield* runAfterOverflowCompaction(sessionID, undefined, defect.transition.step)
610:             return yield* runTurn(sessionID, undefined, defect.transition.step)
611:           }),
612:         ),
613:       )
614:     })
```

## E4-14: `packages/core/src/session/runner/publish-llm-event.ts` lines 59–104

Git blob: `f18951e3f5d349500e82aba646e7e00ac624eae4`; whole-source SHA-256: `517410d4d2446db3adf7b4a94f6007f2f41ead4ef4c93d0259b79809a5752bf4`.

```text
59:       readonly assistantMessageID: SessionMessage.ID
60:       readonly name: string
61:       inputEnded: boolean
62:       called: boolean
63:       settled: boolean
64:       providerExecuted: boolean
65:       providerMetadata?: ProviderMetadata
66:     }
67:   >()
68:   const timestamp = DateTime.now
69:   let assistantMessageID: SessionMessage.ID | undefined
70:   let assistantActive = false
71:   let assistantFailed = false
72:   let providerFailed = false
73:   let stepSettlement:
74:     | {
75:         readonly finish: string
76:         readonly tokens: ReturnType<typeof tokens>
77:         readonly usageKnown: boolean
78:         /** USD the provider or host reported; absent when the model's price list applies. */
79:         readonly cost: number | undefined
80:         readonly contextWindow: number | undefined
81:       }
82:     | undefined
83:   // Text and reasoning blocks by id and the assistant message holding them, so a retract can blank them.
84:   const blocks = new Map<string, { readonly kind: "text" | "reasoning"; readonly assistantMessageID: SessionMessage.ID }>()
85:   // Blocks a retract blanked: what the superseded attempt still streams for them is dropped.
86:   const retracted = new Set<string>()
87: 
88:   const startAssistant = Effect.fnUntraced(function* () {
89:     if (assistantMessageID !== undefined) return assistantMessageID
90:     assistantMessageID = SessionMessage.ID.create()
91:     assistantActive = true
92:     yield* events.publish(SessionEvent.Step.Started, {
93:       ...input,
94:       assistantMessageID,
95:       timestamp: yield* timestamp,
96:       snapshot: input.snapshot,
97:     })
98:     return assistantMessageID
99:   })
100:   const currentAssistantMessageID = () =>
101:     assistantMessageID === undefined
102:       ? Effect.die("Tool event before assistant step start")
103:       : Effect.succeed(assistantMessageID)
104: 
```

## E4-15: `packages/core/src/session/runner/publish-llm-event.ts` lines 495–505

Git blob: `f18951e3f5d349500e82aba646e7e00ac624eae4`; whole-source SHA-256: `517410d4d2446db3adf7b4a94f6007f2f41ead4ef4c93d0259b79809a5752bf4`.

```text
495:   return {
496:     publish,
497:     flush,
498:     failAssistant,
499:     failUnsettledTools,
500:     hasActiveAssistant: () => assistantActive,
501:     hasAssistantStarted: () => assistantMessageID !== undefined,
502:     hasProviderError: () => providerFailed,
503:     stepSettlement: () => stepSettlement,
504:     startAssistant,
505:     assistantMessageID: assistantMessageIDForTool,
```

## E4-16: `AGENTS.md` lines 146–154

Git blob: `ef3b523b0c00aed722582b870c1919188edc4c4f`; whole-source SHA-256: `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`.

```text
146: ## What Ships and What Stays in the Repo
147: 
148: The release carries only what someone who installs and uses Orchestra needs. Material for people who change the code stays in the repository.
149: 
150: - Ships: compiled code, including seat prompts (`modules/maestro/coordination/src/seats/prompt/*.txt`); the skill trees a seat lists in `seat.skills` (`Seats.skillSource`, embedded at build time by `modules/maestro/coordination/src/seat-skills-module.ts`); Maestro playbooks (`modules/maestro/coordination/playbooks`), including the Orchestra guide under `maestro-orchestra`; the `extraResources` in `apps/desktop/electron-builder.config.ts`; the CLI package's `bin`.
151: - Repo-only: `.orchestra/skills/*` (maintenance, ownership and contributor usage skills, seen only when this repository is the open project), `docs/` (specs and guides), and this file.
152: - Knowledge an agent needs at runtime goes in its prompt or a shipped seat skill, never only in `.orchestra/skills`.
153: - Never add a maintenance or ownership skill to a seat's `skills`.
154: - `docs/guides` is written for users but is not published yet; a user-facing change still updates its guide.
```

## E4-17: `AGENTS.md` lines 207–217

Git blob: `ef3b523b0c00aed722582b870c1919188edc4c4f`; whole-source SHA-256: `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`.

```text
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
```

## E4-18: `docs/specs/v2/session.md` lines 1–58

Git blob: `e3574b87bc3b12c0eca603f96821a16ec89399fc`; whole-source SHA-256: `7aa5aea4fba7bab44bd70b552812651e5d097b579c7bf5d797f8b8751c05c81e`.

```text
1: # Session API
2: 
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
36: 
37: `admittedSeq` is the durable Session event sequence of `PromptAdmitted`. Clients may use the admission event to represent queued input before `Prompted` makes it part of visible conversation history.
38: 
39: Execution routing starts from only the Session ID:
40: 
41: ```text
42: SessionExecution.resume(sessionID)
43: -> SessionStore.get(sessionID)
44: -> LocationServiceMap.get(session.location)
45: -> SessionRunner.run({ sessionID, force? })
46: ```
47: 
48: `SessionExecution` and the read-side `SessionStore` are process-global. `SessionRunner`, catalog, model resolver, tool registry, permission state, and filesystem are cached per Location. No layer takes a Session ID. An omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
49: 
50: The local runner issues one explicit `llm.stream(request)` per provider turn, projects each complete local tool call durably before eagerly starting its structured child execution, awaits every started tool fiber after provider-stream closure, and reloads projected history once before continuation. Promoting any new user input resets the selected agent's configured provider-turn allowance; multiple steers promoted at one boundary reset it once. Tool settlement events carry the owning assistant message ID because provider-local call IDs may repeat across turns. Before assembling a provider request, the runner durably fails any local tool still projected as `running` from a previous process with `Tool execution interrupted`; abandoned side effects are never silently replayed.
51: 
52: Projected hosted tools preserve call-side and settlement-side provider metadata separately so settlement and interruption recovery cannot erase continuation identifiers. Provider-native reasoning and provider metadata replay only while the historical assistant model matches the selected continuation model; after a model switch, visible reasoning text remains ordinary assistant text and provider-native metadata is omitted.
53: 
54: ## Context Epochs
55: 
56: V2 Sessions persist the exact privileged System Context shown to the model. A Context Epoch stores one immutable provider-cache baseline and a model-hidden structured snapshot used to compare independently observed Context Sources. Environment facts, the host-local date, ambient global/upward-project `AGENTS.md` files, and selected-agent available-skill guidance are the initial sources. Location-wide sources come from the System Context Registry; selected-agent guidance composes with them immediately before Context Epoch admission.
57: 
58: The first complete observation initializes the epoch before any pending prompt becomes model-visible. If initial context is temporarily unavailable, execution stops while the prompt remains pending and retryable. On later provider turns, the runner promotes eligible input first, then reconciles current sources at the safe boundary. Changed context becomes one durable chronological System message, and its event commit advances the epoch snapshot atomically.
```

## E4-19: `docs/specs/v2/session.md` lines 212–235

Git blob: `e3574b87bc3b12c0eca603f96821a16ec89399fc`; whole-source SHA-256: `7aa5aea4fba7bab44bd70b552812651e5d097b579c7bf5d797f8b8751c05c81e`.

```text
212: ### Current Runner Follow-Ups
213: 
214: - Keep eager structured local-tool settlement: durably record each complete call, start its child execution immediately, await all started settlements after provider-turn consumption, persist every result, and reload history once before continuation.
215: - Buffer or coalesce streamed deltas before rewriting growing assistant projections.
216: - Revisit additional covering indexes as larger-history query shapes become concrete.
217: - Design any global multi-Session event stream separately; the finite history API deliberately reads one authorized Session aggregate and does not change global Event publication.
218: - Decide whether UI-facing Session subscriptions should optionally interleave ephemeral deltas while connected without advancing the durable cursor.
219: - Add provider-aware context control for provider-executed tool results. Generic text truncation cannot replace provider-native structured payloads that must round-trip exactly.
220: 
221: ## Remove Dedicated `session.init` Route
222: 
223: The dedicated `POST /session/:sessionID/init` endpoint exists only as a compatibility wrapper around the normal `/init` command flow.
224: 
225: Current behavior:
226: 
227: - the route calls `SessionPrompt.command(...)`
228: - it sends `Command.Default.INIT`
229: - it does not provide distinct session-core behavior beyond running the existing init command in an existing session
230: 
231: V2 plan:
232: 
233: - remove the dedicated `session.init` endpoint
234: - rely on the normal `/init` command flow instead
235: - avoid reintroducing `Session.initialize`-style special cases in the session service layer
```
