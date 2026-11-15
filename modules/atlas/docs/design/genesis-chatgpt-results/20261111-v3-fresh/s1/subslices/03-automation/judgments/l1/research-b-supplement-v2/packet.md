# Complemento literal e revisão v2 — research

Execução 34269cf4-d631-41c5-a30b-85b0ec217390, S1-03, fonte 1cde2ff7a71bcf7aecb5d030917b577165135d38. Mesmo par /root/s1_03_j1 e /root/s1_03_j2, sem ferramentas. A autoria não recebeu oracle. Este complemento atende aos pedidos públicos de evidência já emitidos; o corpo v1 recebido continua disponível no histórico, e os únicos deltas textuais da versão agora submetida estão abaixo. Os intervalos/offsets dos lotes originais continuam vinculados à v1, não devem ser silenciosamente reinterpretados como offsets v2. A principal verificou a aplicação exata e a igualdade de todos os outros bytes. Pareceres originais permanecem preservados, ainda sem PASS global.

Corpo v1: {'bytes': 63389, 'sha256': '1213f85cf16f73feed220e8c1b33ed52b2af75afd570b154a29eaf8f99f27d73', 'git_blob_sha': 'c29b9f5b8a8913cc4afa58d3e9cdede292f0657e'}

Corpo v2: {'bytes': 63501, 'sha256': 'd2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661', 'git_blob_sha': 'bb0eaa73b4fe9120fb46d9304778649b5c7205dd'}

## Delta literal 1

ANTES
```text
Memoiza no máximo dois dumps por path, mtime e tamanho;
```

DEPOIS
```text
O memo mantém no máximo duas entradas no total, uma por path, validadas por mtime e tamanho;
```

## Delta literal 2

ANTES
```text
`query.ts` abre shard atual ou o mais novo retido de mesmo id quando o atual falta.
```

DEPOIS
```text
`query.ts` abre o shard atual ou o primeiro retido de mesmo id ainda presente, na ordem do manifesto (atualizada por `retain`/`touch`), quando o atual falta.
```

As propostas nos suplementos foram redigidas antes desta correção; suas frases de status “não aplicada” descrevem aquele momento e são supersedidas SOMENTE pelos deltas v2 acima. O conteúdo literal de fontes permanece intacto. Nenhum teste de produto/provider foi executado; assertions são evidência de contrato, não execução. Critérios: todos os pertinentes já recebidos, com suficiência restrita ao lote e sem promoção de semântica a binding/runtime. Avalie após FIM_DO_LOTE; parte intermediária é apenas recebimento.

A projeção compartilhada de130 fontes e o histórico foram fornecidos no suplemento A; reutilizar esse contexto preservado, sem criar nova contagem.

## INICIO_DO_SUPLEMENTO_LITERAL

# Suplemento literal research-b — RE-B1 a RE-B7

**Corpo congelado:** `body.md`, SHA-256 `1213f85cf16f73feed220e8c1b33ed52b2af75afd570b154a29eaf8f99f27d73`. Evidência pública adicional para R8–R14, com as dependências R6/R7 solicitadas. Este suplemento não é parecer dos juízes, resultado de execução nem aceite. `review-supplement-a.md` permanece no SHA-256 `900fd149a1182df270ef6f71fce883793dba1a836df2dd2dd67e500c268f4aca`; a projeção das 130 fontes é compartilhada, não refeita.

**Leitura e fidelidade:** cada fonte tem path, pin, Git blob e SHA-256 declarados uma vez. Os blocos seguintes são linhas originais literais com prefixo numérico; saltos são intervalos separados, sem código reescrito ou elipses dentro das linhas. O índice registra hashes dos bytes brutos de cada intervalo e offsets dos grupos. Fontes integrais permanecem em `sources/<path>`, vinculadas a `captures.json`. O arquivo `evidence.md`, SHA-256 `e8cc0b447e48f26b3a059dc70c7ad7e607ec9b60a9af3d605e76f4c10b1da05b`, e seu índice permanecem intactos para aprofundamento.

**Natureza:** prosa curta é orientação/limite do produtor. Comentários e nomes de testes dentro das fontes são dados literais; intenções declaradas não se convertem em observações de runtime. As expectativas de E44–E46 foram lidas e não executadas. Nenhuma dependência externa, plataforma, jail, publicação Atlas ou fornecedor foi exercitado nesta entrega.

## RE-B1

### RB1-01 — Uniões públicas, operações, coordenadas e limites de entrada

Vínculo: corpo R8; archive E24.

**RB-S001 — `packages/core/src/research-toolkit/code-index/types.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `f0690be298513ba918b88c59eb01c2142f8133dc` · SHA-256 `2bc3804460a0faf5ddf2e62d19ca86efd39db0a8142dc75787e60cdd2519332f` · 7619 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/code-index/types.ts`; archive: E24.

Linhas 7–8.

```text
7: // J2 (index and code_query) and J3 (code_search, code_locate). Lines are original-file coordinates, 1-based and
8: // closed (JI-3); columns are UTF-16 units, the encoding SCIP declares for TypeScript.
```

Linhas 20–40.

```text
20: const name = Schema.NonEmptyString.check(Schema.isMaxLength(1024))
21: const file = Schema.NonEmptyString.check(Schema.isMaxLength(8192))
22: const page = { limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(200))), offset: optional(NonNegativeInt) }
23: const target = {
24:   // A short ("assemble") or qualified ("DiscoveryResult.assemble") name; path narrows the definition to one file.
25:   name: optional(name),
26:   path: optional(file),
27:   symbol: optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
28:   at: optional(Schema.Struct({ path: file, line: PositiveInt, column: optional(PositiveInt) })),
29: }
30: 
31: export const CodeQuery = Schema.Union([
32:   Schema.Struct({ op: Schema.Literal("definition"), ...target }),
33:   Schema.Struct({ op: Schema.Literals(["references", "callers", "callees", "implementations"]), ...target, ...page }),
34:   Schema.Struct({ op: Schema.Literals(["imports", "importers"]), path: file, ...page }),
35:   Schema.Struct({
36:     op: Schema.Literal("symbols"), path: optional(file), name: optional(name), kind: optional(name),
37:     exported: optional(Schema.Boolean), ...page,
38:   }),
39:   Schema.Struct({ op: Schema.Literal("map"), path: optional(file), depth: optional(PositiveInt), ...page }),
40: ])
```

Linhas 43–70.

```text
43: /** The six dimensions every seat tool returns beside its findings (JT.1). */
44: export type Basis = {
45:   readonly basis: {
46:     readonly commit: string
47:     readonly dirtyDigest?: string
48:     readonly shards: ReadonlyArray<{
49:       readonly id: string
50:       readonly language: string
51:       readonly project: string
52:       readonly indexer: string
53:       readonly version: string
54:     }>
55:   }
56:   readonly execution: { readonly op: string; readonly ms: number; readonly semantic?: "absent" | "present" }
57:   readonly coverage: {
58:     readonly documents: number
59:     readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>
60:     readonly languagesMissing: ReadonlyArray<string>
61:     readonly opaqueSites: number
62:     readonly complete: boolean
63:     /** code_search: whether .gitignore was respected and how many binaries were skipped (J3.3). */
64:     readonly ignoreRespected?: boolean
65:     readonly binariesSkipped?: number
66:     /** code_locate: ranges dropped by verification against current content (J3.5 step 4). */
67:     readonly discarded?: number
68:   }
69:   readonly freshness: "fresh" | "stale" | "dirty-overlay"
70:   readonly bounds: { readonly limit: number; readonly truncated: boolean }
```

Linhas 81–98.

```text
81: export type CodeQueryResult = {
82:   /** Undefined when the name is ambiguous or absent; candidates then holds at most 20. */
83:   readonly resolved: SymbolRef | undefined
84:   readonly candidates: ReadonlyArray<SymbolRef>
85:   readonly hits: ReadonlyArray<Hit>
86:   readonly next?: number
87:   readonly basis: Basis
88: }
89: 
90: export const SearchInput = Schema.Struct({
91:   pattern: Schema.NonEmptyString.check(Schema.isMaxLength(512)),
92:   mode: optional(Schema.Literals(["literal", "regex", "identifier"])),
93:   paths: optional(Schema.Array(file).check(Schema.isMaxLength(16))),
94:   caseSensitive: optional(Schema.Boolean),
95:   context: optional(NonNegativeInt.check(Schema.isLessThanOrEqualTo(5))),
96:   ...page,
97: })
98: export type SearchInput = typeof SearchInput.Type
```

Linhas 110–134.

```text
110: export type SearchResult = { readonly matches: ReadonlyArray<SearchMatch>; readonly next?: number; readonly basis: Basis }
111: 
112: const terms = Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(512))).check(Schema.isMaxLength(16))
113: /** At least one of question, terms or symbols; the host checks it, since a struct schema cannot. */
114: export const LocateInput = Schema.Struct({
115:   question: optional(Schema.NonEmptyString.check(Schema.isMaxLength(2000))),
116:   terms: optional(terms),
117:   symbols: optional(terms),
118:   paths: optional(Schema.Array(file).check(Schema.isMaxLength(16))),
119:   limit: optional(PositiveInt.check(Schema.isLessThanOrEqualTo(40))),
120: })
121: export type LocateInput = typeof LocateInput.Type
122: 
123: export type LocateResult = {
124:   readonly ranges: ReadonlyArray<Range & { readonly symbol?: string; readonly why: ReadonlyArray<string>; readonly score: number }>
125:   readonly searches: ReadonlyArray<{
126:     readonly kind: "lexical" | "lexical-wide" | "definition" | "neighbors"
127:     readonly query: string
128:     readonly hits: number
129:     readonly truncated: boolean
130:   }>
131:   /** One retained snapshot holding the lines of every range (origin file, original coordinates). */
132:   readonly evidence: Research.SourceRef
133:   readonly basis: Basis
134: }
```

### RB1-02 — Query: basis, paths, abertura e ordem real dos shards retidos

Vínculo: corpo R6, R8; archive E17, E24.

Observação de fonte: previous.find segue a ordem do manifesto, preservada por records(); retain antepõe o commit recebido e touch promove o commit usado. A proposta de precisão textual ao final não altera o corpo.

**RB-S002 — `packages/core/src/research-toolkit/code-index/query.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `25d652ee0ce78d327427837466b5d7fe5886013f` · SHA-256 `ec1dd4a297e6e798c497d67ac5ed21cd4c6484e2aba3c2bed60dbd8f174f05e8` · 32872 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/code-index/query.ts`; archive: E24, E25.

Linhas 58–60.

```text
58: const DEFAULT_LIMIT = 50
59: const CANDIDATES = 20
60: const SKIPPED_LIMIT = 200
```

Linhas 82–134.

```text
82: export const run = Effect.fn("CodeIndexQuery.run")(function* (ctx: Context, input: CodeIndex.CodeQuery) {
83:   const started = performance.now()
84:   const query = normalize(ctx.root, input)
85:   if (!query) return yield* new Research.Error({ code: "reference_invalid", message: "Query path is outside the bound worktree" })
86:   if (Object.keys(ctx.indexers).length === 0)
87:     return yield* new Research.Error({ code: "index_unavailable", message: "No research index pack is ready on this machine" })
88:   const plan = yield* CodeIndexBuild.plan(ctx)
89:   // Only path-scoped operations narrow the shards (J2.10); a symbol's references may live in any shard.
90:   const prefix = query.op === "imports" || query.op === "symbols" || query.op === "map" ? query.path : undefined
91:   const scope = yield* open(ctx, plan, inScope(plan, prefix ?? (query.op === "definition" ? query.path : undefined)))
92:   const limit = "limit" in query && query.limit !== undefined ? query.limit : DEFAULT_LIMIT
93:   const offset = "offset" in query && query.offset !== undefined ? query.offset : 0
94:   const findings = yield* execute(scope, query)
95:   const page = findings.hits.slice(offset, offset + limit)
96:   const documents = yield* count(scope, prefix)
97:   const languagesMissing = [...new Set(plan.unindexed.filter((shard) => covers(shard.project, prefix)).map((shard) => shard.language))]
98:   const skipped = [
99:     ...scope.skipped,
100:     ...plan.orphans.filter((file) => within(file, prefix)).map((file) => ({ path: file, reason: "no-project" })),
101:     ...(yield* recorded(scope, prefix)),
102:   ]
103:   const paths = [findings.resolved?.ref.range.path, ...findings.candidates.map((ref) => ref.range.path), ...page.map((hit) => hit.range.path)]
104:   const result: CodeIndex.CodeQueryResult = {
105:     resolved: findings.resolved?.ref,
106:     candidates: findings.candidates,
107:     hits: page,
108:     ...(offset + limit < findings.hits.length ? { next: offset + limit } : {}),
109:     basis: {
110:       basis: {
111:         commit: plan.commit,
112:         ...(scope.dirtyDigest ? { dirtyDigest: scope.dirtyDigest } : {}),
113:         shards: scope.ready.map((ready) => ({
114:           id: ready.planned.shard.id, language: ready.planned.shard.language, project: ready.planned.shard.project,
115:           indexer: ready.planned.indexer.id, version: ready.planned.indexer.version,
116:         })),
117:       },
118:       execution: { op: query.op, ms: Math.round(performance.now() - started) },
119:       coverage: {
120:         documents,
121:         skipped: skipped.length > SKIPPED_LIMIT
122:           ? [...skipped.slice(0, SKIPPED_LIMIT), { path: "*", reason: `${skipped.length - SKIPPED_LIMIT} more skipped paths` }]
123:           : skipped,
124:         languagesMissing,
125:         opaqueSites: findings.hits.filter((hit) => hit.opaque).reduce((sum, hit) => sum + (hit.sites?.length ?? 1), 0),
126:         complete: skipped.length === 0 && languagesMissing.length === 0,
127:       },
128:       freshness: scope.ready.some((ready) => ready.stale) ? "stale"
129:         : paths.some((file) => file !== undefined && scope.dirty.has(file)) ? "dirty-overlay" : "fresh",
130:       bounds: { limit, truncated: offset + limit < findings.hits.length },
131:     },
132:   }
133:   return result
134: })
```

Linhas 137–169.

```text
137: function normalize(root: string, query: CodeIndex.CodeQuery): CodeIndex.CodeQuery | undefined {
138:   const relative = (file: string) => {
139:     const result = path.relative(root, path.resolve(root, file)).replaceAll("\\", "/")
140:     if (result === "") return "."
141:     return result === ".." || result.startsWith("../") || path.isAbsolute(result) ? undefined : result
142:   }
143:   const next = { ...query } as CodeIndex.CodeQuery & { path?: string; at?: { path: string; line: number; column?: number } }
144:   if (next.path !== undefined) {
145:     const file = relative(next.path)
146:     if (file === undefined) return undefined
147:     next.path = file
148:   }
149:   if (next.at !== undefined) {
150:     const file = relative(next.at.path)
151:     if (file === undefined) return undefined
152:     next.at = { ...next.at, path: file }
153:   }
154:   return next
155: }
156: 
157: const within = (file: string, prefix: string | undefined) =>
158:   prefix === undefined || prefix === "." || file === prefix || file.startsWith(prefix + "/")
159: 
160: // A shard covers a scope when the scope is inside the project or the project is inside the scope.
161: const covers = (project: string, prefix: string | undefined) =>
162:   prefix === undefined || project === "." || within(project, prefix) || within(prefix, project)
163: 
164: function inScope(plan: CodeIndexBuild.Plan, prefix: string | undefined) {
165:   if (prefix === undefined) return plan.shards
166:   const file = plan.shards.filter((planned) => planned.shard.files.includes(prefix))
167:   if (file.length > 0) return file
168:   return plan.shards.filter((planned) => planned.shard.files.some((entry) => within(entry, prefix)) ||
169:     (CodeIndexShard.language(prefix) === planned.shard.language && within(prefix, planned.shard.project)))
```

Linhas 176–225.

```text
176: function open(ctx: Context, plan: CodeIndexBuild.Plan, shards: ReadonlyArray<CodeIndexBuild.Planned>) {
177:   return Effect.gen(function* () {
178:     if (shards.length === 0)
179:       return yield* new Research.Error({ code: "index_unavailable", message: "No supported language with a ready indexer in this scope" })
180:     const records = yield* CodeIndexStore.records(plan.dir)
181:     const skipped: Array<{ path: string; reason: string }> = []
182:     // A shard whose last build in this process failed says why, whether or not an older version serves meanwhile.
183:     const failed = new Map(shards.flatMap((planned) => {
184:       const reason = CodeIndexStore.failure(ctx.storeRoot, planned.key)
185:       return reason === undefined ? [] : [[planned.key, reason] as const]
186:     }))
187:     const choices = yield* Effect.forEach(shards, (planned) => Effect.gen(function* () {
188:       if (yield* CodeIndexStore.exists(plan.dir, planned.key)) return { planned, key: planned.key } satisfies Ready
189:       const previous = records.flatMap((record) => record.shards
190:         .filter((shard) => shard.id === planned.shard.id && shard.key !== planned.key)
191:         .map((shard) => ({ commit: record.commit, key: shard.key })))
192:       const present = yield* Effect.forEach(previous, (entry) => CodeIndexStore.exists(plan.dir, entry.key))
193:       const fallback = previous.find((_, index) => present[index])
194:       const reason = failed.get(planned.key)
195:       if (reason !== undefined) skipped.push({ path: planned.shard.project, reason: `index-failed: ${reason}` })
196:       if (fallback) return { planned, key: fallback.key, stale: fallback.commit } satisfies Ready
197:       if (reason === undefined) skipped.push({ path: planned.shard.project, reason: "index-building" })
198:       return undefined
199:     }))
200:     const missing = choices.some((choice) => choice === undefined || choice.stale)
201:     const progress = CodeIndexBuild.building(plan.dir)
202:     const building = progress !== undefined || shards.some((planned) => CodeIndexStore.building(ctx.storeRoot, planned.key))
203:     // A failed build is retried by the next query that finds the shard still missing; the build is single-flight.
204:     if (missing && !building && ctx.extract)
205:       yield* Effect.forkDetach(CodeIndexBuild.build({ ...ctx, extract: ctx.extract }).pipe(Effect.ignore))
206:     const ready = choices.filter((choice): choice is NonNullable<typeof choice> => choice !== undefined)
207:     if (ready.length === 0) {
208:       const cause = [...failed.values()][0]
209:       if (cause !== undefined && !building)
210:         return yield* new Research.Error({ code: "index_unavailable", message:
211:           `Index build failed${ctx.extract ? " (retrying)" : ""}: ${cause}` })
212:       if (building || ctx.extract)
213:         return yield* new Research.Error({ code: "index_building", message:
214:           `Index is building: shardsDone ${progress?.shardsDone ?? 0} of shardsTotal ${progress?.shardsTotal ?? shards.length}` +
215:           (cause === undefined ? "" : `; last attempt failed: ${cause}`) })
216:       return yield* new Research.Error({ code: "index_unavailable", message: "Index has not been built for this commit" })
217:     }
218:     if (!missing) yield* CodeIndexStore.touch(plan.dir, plan.commit)
219:     const stale = [...new Set(ready.flatMap((choice) => choice.stale ? [choice.stale] : []))]
220:     const changes = new Set((yield* Effect.forEach(stale, (from) => CodeIndexShard.changed(ctx.git, from, plan.commit))).flat())
221:     ready.filter((choice) => choice.stale).forEach((choice) =>
222:       choice.planned.shard.files.filter((file) => changes.has(file)).forEach((file) => skipped.push({ path: file, reason: "changed-since-index" })))
223:     return yield* overlay(ctx, plan, ready, skipped)
224:   })
225: }
```

**RB-S003 — `packages/core/src/research-toolkit/code-index/store.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `f71cdf0ae1979f002fce68b53eae445647682d73` · SHA-256 `570a81a04360d060a7c67a436e531b4c079ba7a9951130a2648ca986846b5e11` · 13372 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/code-index/store.ts`; archive: E17.

Linhas 170–215.

```text
170: export const records = (dir: string) =>
171:   Effect.promise(() => Bun.file(path.join(dir, MANIFEST)).json().then((value: ReadonlyArray<Entry>) => value, () => [] as ReadonlyArray<Entry>))
172: 
173: /**
174:  * J2.4: put the commit first, keep at most `limits.commits` commits, then drop the least recently used commits until
175:  * the shards they alone hold fit `limits.bytes`. The newest commit is always kept. Returns the removed shard keys.
176:  */
177: export const retain = Effect.fn("CodeIndexStore.retain")(function* (
178:   dir: string,
179:   record: Entry,
180:   limits: { readonly commits: number; readonly bytes: number },
181: ) {
182:   const previous = yield* records(dir)
183:   const ordered = [record, ...previous.filter((entry) => entry.commit !== record.commit)].slice(0, Math.max(1, limits.commits))
184:   const sizes = new Map(yield* Effect.promise(() => readdir(dir).then((names) => Promise.all(names
185:     .filter((name) => name.endsWith(".sqlite"))
186:     .map((name) => stat(path.join(dir, name)).then((info) => [name.slice(0, -".sqlite".length), info.size] as const, () => [name.slice(0, -".sqlite".length), 0] as const))))))
187:   const kept = fit(ordered, sizes, limits.bytes)
188:   const live = new Set(kept.flatMap((entry) => entry.shards.map((shard) => shard.key)))
189:   const removed = [...sizes.keys()].filter((key) => !live.has(key))
190:   yield* Effect.promise(() => Promise.all(removed.map((key) => rm(file(dir, key), { force: true }))))
191:   yield* save(dir, kept)
192:   return removed
193: })
194: 
195: /** Mark a commit most recently used without touching its shards. */
196: export const touch = Effect.fn("CodeIndexStore.touch")(function* (dir: string, commit: string) {
197:   const previous = yield* records(dir)
198:   const found = previous.find((entry) => entry.commit === commit)
199:   if (!found || previous[0]?.commit === commit) return
200:   yield* save(dir, [{ ...found, at: Date.now() }, ...previous.filter((entry) => entry !== found)])
201: })
202: 
203: function fit(ordered: ReadonlyArray<Entry>, sizes: ReadonlyMap<string, number>, bytes: number): ReadonlyArray<Entry> {
204:   const total = [...new Set(ordered.flatMap((entry) => entry.shards.map((shard) => shard.key)))]
205:     .reduce((sum, key) => sum + (sizes.get(key) ?? 0), 0)
206:   if (total <= bytes || ordered.length <= 1) return ordered
207:   return fit(ordered.slice(0, -1), sizes, bytes)
208: }
209: 
210: const save = (dir: string, entries: ReadonlyArray<Entry>) =>
211:   Effect.promise(async () => {
212:     const temporary = path.join(dir, `.${MANIFEST}.${randomUUID()}.tmp`)
213:     await Bun.write(temporary, JSON.stringify(entries))
214:     await rename(temporary, path.join(dir, MANIFEST))
215:   })
```

### RB1-03 — Query: overlay dirty e resolução por id, posição ou nome

Vínculo: corpo R8; archive E24, E25.

**RB-S002** — mesma fonte e identidade declaradas acima.

Linhas 228–261.

```text
228: function overlay(ctx: Context, plan: CodeIndexBuild.Plan, ready: ReadonlyArray<Ready>, skipped: Array<{ path: string; reason: string }>) {
229:   return Effect.gen(function* () {
230:     const changes = yield* CodeIndexShard.dirty(ctx.git)
231:     const owner = (file: string) => ready
232:       .filter((choice) => choice.planned.shard.files.includes(file) ||
233:         (CodeIndexShard.language(file) === choice.planned.shard.language && within(file, choice.planned.shard.project)))
234:       .sort((a, b) => b.planned.shard.project.length - a.planned.shard.project.length)[0]
235:     const owned = changes.flatMap((change) => {
236:       const choice = owner(change.path)
237:       return choice ? [{ ...change, choice }] : []
238:     })
239:     const groups = Map.groupBy(owned.filter((change) => !change.deleted), (change) => change.choice)
240:     const files = (yield* Effect.forEach([...groups], ([choice, entries]) =>
241:       ctx.overlay({ root: ctx.root, shard: choice.planned.shard, paths: entries.map((entry) => entry.path) }))).flat()
242:     const digest = owned.length === 0 ? undefined : yield* Effect.promise(async () => {
243:       const hash = createHash("sha256")
244:       for (const change of owned.toSorted((a, b) => a.path.localeCompare(b.path)))
245:         hash.update(change.path).update("\0").update(change.deleted ? "deleted" : new Uint8Array(await Bun.file(path.join(ctx.root, change.path)).arrayBuffer().catch(() => new ArrayBuffer(0)))).update("\0")
246:       return hash.digest("hex")
247:     })
248:     return {
249:       plan, ready, skipped, dirty: new Set(owned.map((change) => change.path)),
250:       ...(digest ? { dirtyDigest: digest } : {}),
251:       overlay: new Map(files.map((entry) => [entry.path, {
252:         lines: entry.lines,
253:         symbols: entry.symbols.map((symbol): CodeIndex.SymbolRef => ({
254:           symbol: `overlay:${entry.path}:${symbol.startLine}:${symbol.name}`, name: symbol.name, kind: symbol.kind,
255:           range: { path: entry.path, startLine: symbol.startLine, endLine: symbol.endLine },
256:           nameLine: symbol.nameLine, exported: symbol.exported,
257:         })),
258:       }])),
259:     } satisfies Scope
260:   })
261: }
```

Linhas 263–287.

```text
263: function execute(scope: Scope, query: CodeIndex.CodeQuery): Effect.Effect<Findings, Research.Error> {
264:   switch (query.op) {
265:     case "imports":
266:       return each(scope, (sql) => sql.unsafe<{ from_path: string; line: number; specifier: string; to_path: string | null; kind: string }>(
267:         `SELECT from_path, line, specifier, to_path, kind FROM import WHERE from_path = ? ORDER BY line`, [query.path]))
268:         .pipe(Effect.map((rows) => ({ candidates: [], hits: sorted(rows.flatMap((entry) => entry.rows).map((row) => moduleHit(row.from_path, row.line, row))) })))
269:     case "importers":
270:       return each(scope, (sql) => sql.unsafe<{ from_path: string; line: number; specifier: string; to_path: string | null; kind: string }>(
271:         `SELECT from_path, line, specifier, to_path, kind FROM import WHERE to_path = ? ORDER BY from_path, line`, [query.path]))
272:         .pipe(Effect.map((rows) => ({ candidates: [], hits: sorted(rows.flatMap((entry) => entry.rows).map((row) => moduleHit(row.from_path, row.line, row))) })))
273:     case "symbols":
274:       return symbols(scope, query)
275:     case "map":
276:       return map(scope, query)
277:     default:
278:       return Effect.gen(function* () {
279:         const found = yield* resolve(scope, query)
280:         if (!found.resolved) return { candidates: found.candidates, hits: [] } satisfies Findings
281:         const resolved = found.resolved
282:         if (query.op === "definition")
283:           return { resolved, candidates: [], hits: [{ range: resolved.ref.range, role: "definition", via: resolved.ref }] } satisfies Findings
284:         return { resolved, candidates: [], hits: yield* related(scope, resolved, query.op) } satisfies Findings
285:       })
286:   }
287: }
```

Linhas 292–345.

```text
292: function resolve(scope: Scope, target: Target): Effect.Effect<{ resolved?: Found; candidates: ReadonlyArray<CodeIndex.SymbolRef> }, Research.Error> {
293:   return Effect.gen(function* () {
294:     const overlaid = [...scope.overlay.values()].flatMap((entry) => entry.symbols)
295:     if (target.symbol?.startsWith("overlay:")) {
296:       const ref = overlaid.find((symbol) => symbol.symbol === target.symbol)
297:       return ref ? { resolved: { ref }, candidates: [] } : { candidates: [] }
298:     }
299:     if (target.at) {
300:       const at = target.at
301:       const local = scope.overlay.get(at.path)?.symbols.filter((symbol) => symbol.range.startLine <= at.line && symbol.range.endLine >= at.line)
302:         .sort((a, b) => (a.range.endLine - a.range.startLine) - (b.range.endLine - b.range.startLine))[0]
303:       if (local) return { resolved: { ref: local }, candidates: [] }
304:       const found = (yield* each(scope, (sql) => at.column === undefined
305:         ? sql.unsafe<Row>(`SELECT s.* FROM occurrence o JOIN symbol s ON s.id = o.symbol_id WHERE o.path = ? AND o.line = ?
306:             ORDER BY (o.role & 1) DESC, o.col LIMIT 1`, [at.path, at.line])
307:         : sql.unsafe<Row>(`SELECT s.* FROM occurrence o JOIN symbol s ON s.id = o.symbol_id WHERE o.path = ? AND o.line <= ? AND o.end_line >= ?
308:             AND (o.line < ? OR o.col <= ?) AND (o.end_line > ? OR o.end_col > ?) ORDER BY (o.end_line - o.line), (o.end_col - o.col) LIMIT 1`,
309:             [at.path, at.line, at.line, at.line, at.column - 1, at.line, at.column - 1]))).flatMap(definitions)
310:       if (found[0]) return { resolved: found[0], candidates: [] }
311:       const enclosing = (yield* each(scope, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE path = ? AND start_line <= ? AND end_line >= ?
312:         ORDER BY end_line - start_line LIMIT 1`, [at.path, at.line, at.line]))).flatMap(definitions)
313:       return enclosing[0] ? { resolved: enclosing[0], candidates: [] } : { candidates: [] }
314:     }
315:     if (target.symbol?.startsWith("#")) {
316:       const [, shard, id] = target.symbol.split("#")
317:       const scoped = { ...scope, ready: scope.ready.filter((choice) => choice.planned.shard.id === shard) }
318:       const found = (yield* each(scoped, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE id = ?`, [Number(id)]))).flatMap(definitions)
319:       return found[0] ? { resolved: found[0], candidates: [] } : { candidates: [] }
320:     }
321:     if (target.symbol !== undefined) {
322:       const found = (yield* each(scope, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE scip = ? AND path IN (SELECT path FROM document)`, [target.symbol]))).flatMap(definitions)
323:       return found[0] ? { resolved: found[0], candidates: [] } : { candidates: [] }
324:     }
325:     if (target.name === undefined) return yield* new Research.Error({ code: "reference_invalid", message: "Query needs name, symbol or at" })
326:     const parts = target.name.split(".")
327:     const last = parts.at(-1)!
328:     const stored = (yield* each(scope, (sql) => sql.unsafe<Row & { qualified: string }>(`
329:       WITH RECURSIVE up(origin, id, container_id, depth, name) AS (
330:         SELECT id, id, container_id, 0, name FROM symbol WHERE name = ? ${target.path ? "AND path = ?" : ""} AND path IN (SELECT path FROM document)
331:         UNION ALL SELECT up.origin, s.id, s.container_id, up.depth + 1, s.name FROM symbol s JOIN up ON s.id = up.container_id WHERE up.depth < 16)
332:       SELECT s.*, (SELECT group_concat(name, '.') FROM (SELECT name FROM up WHERE up.origin = s.id ORDER BY depth DESC)) AS qualified
333:       FROM symbol s WHERE s.id IN (SELECT origin FROM up)`, target.path ? [last, target.path] : [last])))
334:       .flatMap((entry) => entry.rows.filter((row) => (row.qualified === target.name || row.qualified.endsWith("." + target.name)) && !scope.dirty.has(row.path))
335:         .map((row) => found(entry.choice, row)))
336:     const named: ReadonlyArray<Found> = [...stored, ...overlaid
337:       .filter((ref) => ref.name === last && parts.length === 1 && (target.path === undefined || ref.range.path === target.path))
338:       .map((ref) => ({ ref }))]
339:     const unique = [...new Map(named.map((entry) => [entry.ref.symbol, entry])).values()]
340:     if (unique.length === 1) return { resolved: unique[0], candidates: [] }
341:     if (unique.length > 1)
342:       return { candidates: unique.map((entry) => entry.ref).sort((a, b) => Number(b.exported) - Number(a.exported) || a.range.path.localeCompare(b.range.path)).slice(0, CANDIDATES) }
343:     return { candidates: (yield* fuzzy(scope, last, target.path)).slice(0, CANDIDATES) }
344:   })
345: }
```

Linhas 348–356.

```text
348: function fuzzy(scope: Scope, name: string, file?: string) {
349:   const match = CodeIndexStore.tokens(name).split(" ").filter(Boolean).map((token) => `"${token}"*`).join(" ")
350:   if (!match) return Effect.succeed([] as ReadonlyArray<CodeIndex.SymbolRef>)
351:   return each(scope, (sql) => sql.unsafe<Row & { score: number }>(`SELECT s.*, bm25(symbol_name) AS score FROM symbol_name
352:       JOIN symbol s ON s.id = symbol_name.rowid WHERE symbol_name MATCH ? ${file ? "AND s.path = ?" : ""}
353:       AND s.path IN (SELECT path FROM document) ORDER BY score LIMIT ${CANDIDATES * 5}`, file ? [match, file] : [match]))
354:     .pipe(Effect.map((rows) => rows.flatMap((entry) => entry.rows.filter((row) => !scope.dirty.has(row.path)).map((row) => ({ score: row.score, ref: found(entry.choice, row).ref })))
355:       .sort((a, b) => a.score - b.score).map((entry) => entry.ref)))
356: }
```

### RB1-04 — Query: referências, callers/callees, imports, símbolos, map e leituras

Vínculo: corpo R8; archive E25.

A função execute completa está em RB1-03, inclusive imports/importers. Estes ramos expõem onde há filtros dirty e onde as tabelas persistidas são usadas; não inferem atualização global das relações.

**RB-S002** — mesma fonte e identidade declaradas acima.

Linhas 358–410.

```text
358: function related(scope: Scope, target: Found, op: "references" | "callers" | "callees" | "implementations") {
359:   return Effect.gen(function* () {
360:     if (target.id === undefined || !target.shard) return [] as ReadonlyArray<CodeIndex.Hit>
361:     // A SCIP symbol is global, so its occurrences are read in every shard; a local one only in its own shard.
362:     const shards = target.scip ? scope : { ...scope, ready: [target.shard] }
363:     const match = target.scip ? "s.scip = ?" : "s.id = ?"
364:     const key = target.scip ?? target.id
365:     if (op === "implementations") {
366:       const rows = yield* each(shards, (sql) => sql.unsafe<Row>(`SELECT i.* FROM relation r JOIN symbol s ON s.id = r.target_id
367:         JOIN symbol i ON i.id = r.symbol_id WHERE ${match} AND r.kind = 'implementation'`, [key]))
368:       return sorted(rows.flatMap(definitions).map((entry) => ({ range: entry.ref.range, role: "definition" as const, via: entry.ref })))
369:     }
370:     if (op === "callees") {
371:       const rows = yield* each({ ...scope, ready: [target.shard] }, (sql) => sql.unsafe<Row & { site: number; opaque_site: number }>(`
372:         SELECT t.*, o.line AS site, o.opaque AS opaque_site FROM occurrence o JOIN symbol t ON t.id = o.symbol_id
373:         WHERE o.path = ? AND o.line BETWEEN ? AND ? AND (o.role & 1) = 0 AND o.symbol_id != ?`,
374:         [target.ref.range.path, target.ref.range.startLine, target.ref.range.endLine, target.id]))
375:       return grouped(rows.flatMap((entry) => entry.rows.map((row) => ({ via: found(entry.choice, row).ref, site: row.site, opaque: row.opaque_site === 1 }))))
376:     }
377:     const rows = yield* each(shards, (sql) => sql.unsafe<SiteRow>(`
378:       SELECT o.path AS site_path, o.line AS site_line, o.end_line AS site_end, o.role AS site_role, o.opaque AS site_opaque,
379:         e.id, e.scip, e.name, e.kind, e.path, e.start_line, e.end_line, e.name_line, e.exported, e.container_id
380:       FROM occurrence o JOIN symbol s ON s.id = o.symbol_id LEFT JOIN symbol e ON e.id = o.enclosing_id
381:       WHERE ${match} AND (o.role & ${CodeIndex.Role.definition}) = 0`, [key]))
382:     if (op === "references")
383:       return sorted(rows.flatMap((entry) => entry.rows).map((row): CodeIndex.Hit => ({
384:         range: { path: row.site_path, startLine: row.site_line, endLine: row.site_end },
385:         role: row.site_role & CodeIndex.Role.write ? "write" : row.site_role & CodeIndex.Role.import ? "import" : "reference",
386:         ...(row.site_opaque ? { opaque: true } : {}),
387:       })))
388:     // callers (J2.9): references grouped by the definition that encloses them; top-level sites stay single references.
389:     // An import names a symbol without calling it, as in X1's caller view (callers.ts), so it is no caller site.
390:     const sites = rows.flatMap((entry) => entry.rows.filter((row) => !(row.site_role & CodeIndex.Role.import)).map((row) => ({
391:       site: row.site_line, path: row.site_path, opaque: row.site_opaque === 1,
392:       via: row.id === null ? undefined : found(entry.choice, row as Row).ref,
393:     })))
394:     return sorted([
395:       ...grouped(sites.flatMap((site) => site.via ? [{ via: site.via, site: site.site, opaque: site.opaque }] : [])),
396:       ...sites.filter((site) => !site.via).map((site): CodeIndex.Hit => ({
397:         range: { path: site.path, startLine: site.site, endLine: site.site }, role: "reference", sites: [site.site],
398:         ...(site.opaque ? { opaque: true } : {}),
399:       })),
400:     ])
401:   })
402: }
403: 
404: function grouped(sites: ReadonlyArray<{ readonly via: CodeIndex.SymbolRef; readonly site: number; readonly opaque: boolean }>) {
405:   return sorted([...Map.groupBy(sites, (site) => site.via.symbol).values()].map((group): CodeIndex.Hit => ({
406:     range: group[0]!.via.range, role: "call", via: group[0]!.via,
407:     sites: [...new Set(group.map((site) => site.site))].sort((a, b) => a - b),
408:     ...(group.some((site) => site.opaque) ? { opaque: true } : {}),
409:   })))
410: }
```

Linhas 413–439.

```text
413: function symbols(scope: Scope, query: Extract<CodeIndex.CodeQuery, { op: "symbols" }>) {
414:   return Effect.gen(function* () {
415:     const keep = (ref: CodeIndex.SymbolRef) => within(ref.range.path, query.path) && (query.kind === undefined || ref.kind === query.kind) &&
416:       (query.exported === undefined || ref.exported === query.exported)
417:     const overlaid = [...scope.overlay.values()].flatMap((entry) => entry.symbols).filter(keep)
418:     if (query.name !== undefined) {
419:       const name = query.name
420:       const ranked = (yield* fuzzy(scope, name)).filter(keep)
421:       const local = overlaid.filter((ref) => CodeIndexStore.tokens(ref.name).includes(CodeIndexStore.tokens(name)))
422:       return { candidates: [], hits: [...ranked, ...local].map((ref): CodeIndex.Hit => ({ range: ref.range, role: "definition", via: ref })) }
423:     }
424:     const filters = [
425:       ...(query.path && query.path !== "." ? [{ sql: "(path = ? OR substr(path, 1, ?) = ?)", params: [query.path, query.path.length + 1, query.path + "/"] }] : []),
426:       ...(query.kind !== undefined ? [{ sql: "kind = ?", params: [query.kind] }] : []),
427:       ...(query.exported !== undefined ? [{ sql: "exported = ?", params: [query.exported ? 1 : 0] }] : []),
428:     ]
429:     const rows = yield* each(scope, (sql) => sql.unsafe<Row>(`SELECT * FROM symbol WHERE path IN (SELECT path FROM document)
430:       ${filters.map((filter) => `AND ${filter.sql}`).join(" ")} ORDER BY path, start_line, id`, filters.flatMap((filter) => filter.params)))
431:     const stored = rows.flatMap(definitions).map((entry) => entry.ref).filter((ref) => !scope.dirty.has(ref.range.path))
432:     return {
433:       candidates: [],
434:       hits: [...stored, ...overlaid]
435:         .sort((a, b) => a.range.path.localeCompare(b.range.path) || a.range.startLine - b.range.startLine)
436:         .map((ref): CodeIndex.Hit => ({ range: ref.range, role: "definition", via: ref })),
437:     }
438:   })
439: }
```

Linhas 445–474.

```text
445: function map(scope: Scope, query: Extract<CodeIndex.CodeQuery, { op: "map" }>) {
446:   return Effect.gen(function* () {
447:     const rows = (yield* each(scope, (sql) => sql.unsafe<{ path: string; rank: number; loc: number }>(`SELECT path, rank, loc FROM file_rank`)))
448:       .flatMap((entry) => entry.rows).filter((row) => within(row.path, query.path))
449:     const base = query.path === undefined || query.path === "." ? [] : query.path.split("/")
450:     const depth = query.depth ?? Number.POSITIVE_INFINITY
451:     const dirs = new Map<string, { rank: number; loc: number }>()
452:     rows.forEach((row) => row.path.split("/").slice(0, -1).forEach((_, index, parts) => {
453:       if (index < base.length) return
454:       const dir = parts.slice(0, index + 1).join("/")
455:       const entry = dirs.get(dir) ?? { rank: 0, loc: 0 }
456:       dirs.set(dir, { rank: entry.rank + row.rank, loc: entry.loc + row.loc })
457:     }))
458:     const levels = (file: string) => file.split("/").length - base.length
459:     const entries = [
460:       ...[...dirs].map(([dir, entry]) => ({ path: dir, rank: entry.rank, loc: entry.loc, kind: "directory" })),
461:       ...rows.map((row) => ({ path: row.path, rank: row.rank, loc: row.loc, kind: "file" })),
462:     ].filter((entry) => levels(entry.path) <= depth)
463:       // As the techlead's deriveMap: core before test scaffolding, then rank, then path.
464:       .sort((a, b) => Number(CodeIndexRank.isTestPath(a.path)) - Number(CodeIndexRank.isTestPath(b.path)) ||
465:         b.rank - a.rank || a.path.localeCompare(b.path))
466:     return {
467:       candidates: [],
468:       hits: entries.map((entry): CodeIndex.Hit => {
469:         const range = { path: entry.path, startLine: 1, endLine: Math.max(1, entry.loc) }
470:         return { range, role: "definition", via: { symbol: entry.path, name: path.posix.basename(entry.path), kind: entry.kind, range, nameLine: 1, exported: false } }
471:       }),
472:     }
473:   })
474: }
```

Linhas 477–523.

```text
477: function count(scope: Scope, prefix: string | undefined) {
478:   return each(scope, (sql) => prefix === undefined || prefix === "."
479:     ? sql.unsafe<{ path: string }>(`SELECT path FROM document`)
480:     : sql.unsafe<{ path: string }>(`SELECT path FROM document WHERE path = ? OR substr(path, 1, ?) = ?`, [prefix, prefix.length + 1, prefix + "/"]))
481:     .pipe(Effect.map((rows) => new Set([...rows.flatMap((entry) => entry.rows.map((row) => row.path)),
482:       ...[...scope.overlay.keys()].filter((file) => within(file, prefix))]).size))
483: }
484: 
485: // The build's named gaps (meta.skipped) inside the scope.
486: function recorded(scope: Scope, prefix: string | undefined) {
487:   return each(scope, (sql) => sql.unsafe<{ value: string }>(`SELECT value FROM meta WHERE key = 'skipped'`)).pipe(
488:     Effect.map((rows) => rows.flatMap((entry) => entry.rows.flatMap((row) => JSON.parse(row.value) as Array<{ path: string; reason: string }>))
489:       .filter((entry) => within(entry.path, prefix))))
490: }
491: 
492: /** Run one read against every ready shard of the scope; each shard is opened read-only for the duration. */
493: function each<A extends object>(scope: Pick<Scope, "plan" | "ready">, read: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>) {
494:   return Effect.forEach(scope.ready, (choice) =>
495:     CodeIndexStore.read(scope.plan.dir, choice.key, Effect.gen(function* () {
496:       const sql = yield* SqlClient.SqlClient
497:       return { choice, rows: yield* read(sql) }
498:     })))
499: }
500: 
501: const definitions = (entry: { readonly choice: Ready; readonly rows: ReadonlyArray<Row> }) => entry.rows.map((row) => found(entry.choice, row))
502: 
503: function found(choice: Ready, row: Row): Found & { shard: Ready; id: number } {
504:   return {
505:     shard: choice, id: row.id, ...(row.scip ? { scip: row.scip } : {}),
506:     ref: {
507:       symbol: row.scip ?? `#${choice.planned.shard.id}#${row.id}`, name: row.name, kind: row.kind,
508:       range: { path: row.path, startLine: row.start_line, endLine: row.end_line }, nameLine: row.name_line, exported: row.exported === 1,
509:     },
510:   }
511: }
512: 
513: function moduleHit(from: string, line: number, row: { specifier: string; to_path: string | null; kind: string }): CodeIndex.Hit {
514:   const range = { path: from, startLine: line, endLine: line }
515:   return {
516:     range, role: "import",
517:     via: { symbol: row.to_path ?? row.specifier, name: row.specifier, kind: `module:${row.kind}`,
518:       range: row.to_path ? { path: row.to_path, startLine: 1, endLine: 1 } : range, nameLine: row.to_path ? 1 : line, exported: false },
519:   }
520: }
521: 
522: const sorted = (hits: ReadonlyArray<CodeIndex.Hit>) =>
523:   hits.toSorted((a, b) => a.range.path.localeCompare(b.range.path) || a.range.startLine - b.range.startLine)
```

### RB1-05 — Search: 8 MiB, literal default, JSON, paginação e recorte UTF-16

Vínculo: corpo R8; archive E26.

Limite: parse usa JSON.parse sem converter stream inválido em resultado vazio. incomplete usa os flags da passada textual mostrados no ramo, e não os da passada binária.

**RB-S004 — `packages/core/src/research-toolkit/search.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c02ca1932f9782f4a2c141a892db5938b3d2c514` · SHA-256 `5d69897854d3c3ef0b305f4977163233ff73eea0525ad40a2b1d9b606f97cc93` · 7919 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/search.ts`; archive: E26.

Linhas 26–55.

```text
26: const DEFAULT_LIMIT = 50
27: const MAX_TEXT = 300
28: // Capture ceiling for rg's JSON stream; hitting it is reported as an incomplete search, never as a clean zero.
29: const MAX_STDOUT = 8 * 1024 * 1024
30: 
31: /** `binaries` lists the files that match only when binary files are searched too: the ones the main pass skipped. */
32: export const argv = (input: CodeIndex.SearchInput, binaries = false) => {
33:   const limit = (input.limit ?? DEFAULT_LIMIT) + (input.offset ?? 0) + 1
34:   const mode = input.mode ?? "literal"
35:   return [
36:     "--no-config", "--no-messages", "--hidden", "--no-require-git",
37:     ...(binaries
38:       ? ["--files-with-matches", "--binary"]
39:       : [
40:           "--json", "--stats",
41:           // Stable order: offset pages must not shift between calls.
42:           "--sort=path",
43:           // At most this many hits can ever be returned from one file, so a larger count is wasted output.
44:           `--max-count=${limit}`,
45:         ]),
46:     ...(mode === "regex" ? [] : ["--fixed-strings"]),
47:     ...(mode === "identifier" ? ["--word-regexp"] : []),
48:     input.caseSensitive === false ? "--ignore-case" : "--case-sensitive",
49:     ...(input.context && !binaries ? [`--context=${input.context}`] : []),
50:     "--glob=!**/.git/**",
51:     ...(input.paths ?? []).map((glob) => `--glob=${glob.replace(/^(?:\.[\\/])+/u, "")}`),
52:     // -e keeps a pattern that starts with "-" from being read as an option; the explicit root stops rg reading stdin.
53:     "-e", input.pattern, "--", ".",
54:   ]
55: }
```

Linhas 57–124.

```text
57: export const run = (input: CodeIndex.SearchInput, options: Options) =>
58:   Effect.gen(function* () {
59:     const started = Date.now()
60:     const process = yield* AppProcess.Service
61:     const binary = yield* RipgrepBinary.Service
62:     const command = yield* binary.filepath.pipe(
63:       Effect.mapError((cause) => new Failure({ reason: "index_unavailable", message: cause.message })),
64:     )
65:     const result = yield* process
66:       .run(ChildProcess.make(command, argv(input), { cwd: options.cwd, extendEnv: true, stdin: "ignore" }), {
67:         maxOutputBytes: MAX_STDOUT,
68:         maxErrorBytes: 8 * 1024,
69:         signal: options.signal,
70:       })
71:       .pipe(Effect.mapError((cause) => new Failure({ reason: "search_failed", message: cause.message })))
72:     const stderr = result.stderr.toString("utf8").trim()
73:     if (result.exitCode === 2 && /regex parse error|error parsing regex/.test(stderr))
74:       return yield* new Failure({ reason: "pattern_invalid", message: stderr })
75:     // Exit 2 with some output is a partial search (unreadable files); it is reported as incomplete below.
76:     if (result.exitCode > 2) return yield* new Failure({ reason: "search_failed", message: stderr || `ripgrep exited ${result.exitCode}` })
77: 
78:     // ripgrep skips binary files without a trace, so the files that match only as binary come from a second pass.
79:     const binaryPass = yield* process
80:       .run(ChildProcess.make(command, argv(input, true), { cwd: options.cwd, extendEnv: true, stdin: "ignore" }), {
81:         maxOutputBytes: MAX_STDOUT,
82:         maxErrorBytes: 8 * 1024,
83:         signal: options.signal,
84:       })
85:       .pipe(Effect.mapError((cause) => new Failure({ reason: "search_failed", message: cause.message })))
86: 
87:     const parsed = parse(result.stdout.toString("utf8"), input.context ?? 0)
88:     const seen = new Set(parsed.matches.map((match) => match.path))
89:     const binaryFiles = binaryPass.stdout.toString("utf8").split("\n").filter(Boolean).map(normalize)
90:     const offset = input.offset ?? 0
91:     const limit = input.limit ?? DEFAULT_LIMIT
92:     const page = parsed.matches.slice(offset, offset + limit)
93:     const more = parsed.matches.length > offset + limit
94:     const matches: ReadonlyArray<CodeIndex.SearchMatch> = options.enclosing
95:       ? yield* Effect.forEach(page, (match) =>
96:           options.enclosing!(match.path, match.line).pipe(
97:             Effect.map((enclosing) => (enclosing ? { ...match, enclosing } : match)),
98:           ),
99:         )
100:       : page
101:     const incomplete = result.exitCode === 2 || result.stdoutTruncated || (result.outputTruncated ?? false)
102:     return {
103:       matches,
104:       ...(more ? { next: offset + limit } : {}),
105:       basis: {
106:         basis: { commit: options.commit ?? "unversioned", shards: [] },
107:         execution: { op: "code_search", ms: Date.now() - started },
108:         coverage: {
109:           documents: parsed.searched,
110:           skipped: incomplete
111:             ? [{ path: ".", reason: result.exitCode === 2 ? "ripgrep could not read some paths" : "output ceiling reached" }]
112:             : [],
113:           languagesMissing: [],
114:           opaqueSites: 0,
115:           // Absence is claimable only from a search that ran to its end; a page cut by limit does not count.
116:           complete: !incomplete && !more,
117:           ignoreRespected: true,
118:           binariesSkipped: binaryFiles.filter((file) => !seen.has(file)).length,
119:         },
120:         freshness: "fresh" as const,
121:         bounds: { limit, truncated: more },
122:       },
123:     } satisfies CodeIndex.SearchResult
124:   })
```

Linhas 137–175.

```text
137: function parse(stdout: string, context: number) {
138:   const matches: Array<{ path: string; line: number; text: string; before?: string[]; after?: string[] }> = []
139:   let searched = 0
140:   // Context lines of the file being read, kept until the next match claims them as "before".
141:   let pending: Array<{ line: number; text: string }> = []
142:   let last: (typeof matches)[number] | undefined
143:   let file = ""
144:   for (const row of stdout.split("\n")) {
145:     if (!row) continue
146:     const event = JSON.parse(row) as Row
147:     if (event.type === "summary") searched = event.data.stats?.searches ?? 0
148:     if (event.type === "begin") {
149:       file = event.data.path?.text ?? ""
150:       pending = []
151:       last = undefined
152:     }
153:     if (!file) continue
154:     const line = event.data.line_number ?? 0
155:     const text = clip(event.data.lines?.text ?? Buffer.from(event.data.lines?.bytes ?? "", "base64").toString("utf8"))
156:     if (event.type === "context") {
157:       if (last && line <= last.line + context) (last.after ??= []).push(text)
158:       else pending.push({ line, text })
159:     }
160:     if (event.type === "match") {
161:       const before = pending.slice(-context).map((item) => item.text)
162:       last = { path: normalize(file), line, text, ...(before.length ? { before } : {}) }
163:       matches.push(last)
164:       pending = []
165:     }
166:   }
167:   return { matches, searched }
168: }
169: 
170: const normalize = (file: string) => file.replace(/^(?:\.[\\/])+/u, "").replaceAll("\\", "/")
171: 
172: function clip(line: string) {
173:   const text = line.replace(/\r?\n$/u, "")
174:   return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT).replace(/[\uD800-\uDBFF]$/u, "") + "..." : text
175: }
```

### RB1-06 — Locate: seleção, limites completos, materialização, fallback e descarte

Vínculo: corpo R8; archive E27.

O bloco 83–108 inclui a releitura, o bound do range completo antes de valid(check), o limite por arquivo, a retenção e discarded/bounds; valid não é apresentado isoladamente como se fosse toda a validação.

**RB-S005 — `packages/core/src/research-toolkit/locate.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d1343801f7b336d5e5b46eac860f6a07a0ae19fa` · SHA-256 `0ebac9d228ca1764020e0f7ccf260228dc02c1169c0143c07f258e7c7ac650f2` · 16148 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/locate.ts`; archive: E27.

Linhas 24–43.

```text
24: /**
25:  * The ranges a retained code_locate snapshot holds, with each original line's offset among the snapshot's lines, or
26:  * undefined when the text is not a snapshot. Readers map snapshot evidence back to the worktree file it came from.
27:  */
28: export function blocks(text: string) {
29:   const rows = text.split(/\r\n|\n|\r/)
30:   if (rows[0] !== SNAPSHOT) return undefined
31:   return rows.flatMap((row, index) => {
32:     const head = /^==> (.+):(\d+)-(\d+)$/.exec(row)
33:     return head ? [{ path: head[1], start: Number(head[2]), end: Number(head[3]), row: index + 1 }] : []
34:   })
35: }
36: 
37: export const MAX_SEARCHES = 32
38: export const DEFAULT_LIMIT = 12
39: const RRF_K = 60
40: const PER_FILE = 3
41: const CONTEXT = 3
42: const PAGE = 50
43: const SEEDS = 5
```

Linhas 56–110.

```text
56: export const run = Effect.fn("Locate.run")(function* (input: CodeIndex.LocateInput, sources: Sources) {
57:   const started = Date.now()
58:   const limit = input.limit ?? DEFAULT_LIMIT
59:   const scope = (input.paths ?? []).map((pattern) => new Bun.Glob(pattern))
60:   const inScope = (file: string) => !scope.length || scope.some((glob) => glob.match(file))
61:   if (!input.question && !input.terms?.length && !input.symbols?.length)
62:     return yield* new Research.Error({ code: "unsupported", message: "code_locate needs at least one of question, terms or symbols" })
63:   const prior = yield* ranks(sources.query)
64:   const query = prior ? sources.query : undefined
65:   const rank = prior ?? new Map<string, number>()
66:   const terms = [...new Set([...(input.terms ?? []), ...(input.question ? extract(input.question) : []),
67:     // Without an index, symbol names can only be found lexically.
68:     ...(query ? [] : (input.symbols ?? []).map((symbol) => symbol.split(".").at(-1) ?? symbol))])]
69:   // The prior costs one search; neighbours keep two per seed. The rest goes to terms and symbols, best lists first.
70:   const first = [
71:     ...(query ? (input.symbols ?? []).map((symbol) => definitions(query, symbol, inScope)) : []),
72:     ...terms.map((term) => lexical(sources.search, term, "lexical", input.paths)),
73:     ...(query ? (input.symbols ?? []).map((symbol) => named(query, symbol, inScope)) : []),
74:     ...terms.map((term) => lexical(sources.search, term, "lexical-wide", input.paths)),
75:   ].slice(0, MAX_SEARCHES - (query ? 1 + 2 * SEEDS : 0))
76:   const lists = yield* Effect.forEach(first, (planned) => planned.run, { concurrency: "unbounded" })
77:   const second = query ? [...new Set(fuse(lists, rank).map((unit) => unit.path))].slice(0, SEEDS)
78:     .flatMap((file) => neighbours(query, file, inScope)) : []
79:   const near = yield* Effect.forEach(second, (planned) => planned.run, { concurrency: "unbounded" })
80:   const planned = [...first, ...second]
81:   const all = [...lists, ...near]
82: 
83:   const fused = fuse(all, rank)
84:   const files = new Map(yield* Effect.forEach([...new Set(fused.map((unit) => unit.path))],
85:     (file) => sources.read(file).pipe(Effect.map((text) => [file, text?.split(/\r\n|\n|\r/)] as const)), { concurrency: "unbounded" }))
86:   const verified = fused.flatMap((unit) => {
87:     const lines = files.get(unit.path)
88:     if (!lines) return []
89:     // A context window may run past the end of the file; a definition must exist on exactly the lines it declares.
90:     const clamped = unit.symbol ? unit : { ...unit, endLine: Math.min(unit.endLine, lines.length) }
91:     return clamped.endLine <= lines.length && clamped.checks.every((check) => valid(clamped, check, lines)) ? [clamped] : []
92:   })
93:   const perFile = new Map<string, number>()
94:   const kept = verified.filter((unit) => {
95:     const count = (perFile.get(unit.path) ?? 0) + 1
96:     perFile.set(unit.path, count)
97:     return count <= PER_FILE
98:   }).slice(0, limit)
99:   const evidence = yield* sources.retain([SNAPSHOT, ...kept.map((unit) => [`==> ${unit.path}:${unit.startLine}-${unit.endLine}`,
100:     ...(files.get(unit.path) ?? []).slice(unit.startLine - 1, unit.endLine).map((text, index) => `${unit.startLine + index}: ${text}`)].join("\n"))]
101:     .join("\n\n"))
102:   return {
103:     ranges: kept.map((unit) => ({ path: unit.path, startLine: unit.startLine, endLine: unit.endLine,
104:       ...(unit.symbol ? { symbol: unit.symbol } : {}), why: unit.why, score: Number(unit.score.toFixed(6)) })),
105:     searches: planned.map((search, index) => ({ kind: search.kind, query: search.query, hits: all[index].hits, truncated: all[index].truncated })),
106:     evidence,
107:     basis: basis(all, { indexed: query !== undefined, ms: Date.now() - started, limit, discarded: fused.length - verified.length,
108:       truncated: verified.length > kept.length, files: [...files.keys()] }),
109:   } satisfies CodeIndex.LocateResult
110: })
```

Linhas 116–128.

```text
116: export function extract(question: string) {
117:   const quoted = [...question.matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)].map((match) => match[1] ?? match[2] ?? match[3])
118:   const rest = question.replace(/"[^"]+"|'[^']+'|`[^`]+`/g, " ")
119:   const identifiers = rest.match(/[\w$@.-]{0,200}[/.][\w$@./-]{0,200}\w|\b[a-z]+[A-Z][\w$]*|\b[A-Z][a-z0-9]+[A-Z][\w$]*|\b\w+_\w+\b|\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g) ?? []
120:   const words = (rest.match(/\p{L}{4,}/gu) ?? []).filter((word) => !STOPWORDS.has(word.toLowerCase()))
121:   const seen = new Set<string>()
122:   return [...quoted, ...identifiers, ...words].map((term) => term.trim().replace(/(?<![.,;:!?])[.,;:!?]+$/, "")).filter((term) => {
123:     const key = term.toLowerCase()
124:     if (!term || seen.has(key)) return false
125:     seen.add(key)
126:     return true
127:   })
128: }
```

Linhas 130–199.

```text
130: function lexical(search: Sources["search"], term: string, kind: "lexical" | "lexical-wide", paths?: ReadonlyArray<string>): Planned {
131:   const input = kind === "lexical"
132:     ? { pattern: term, mode: "identifier" as const, caseSensitive: true, limit: PAGE }
133:     : { pattern: term, mode: "literal" as const, caseSensitive: false, limit: PAGE }
134:   return {
135:     kind, query: term,
136:     run: search({ ...input, ...(paths?.length ? { paths: [...paths] } : {}) }).pipe(Effect.map((result) => ({
137:       hits: result.matches.length, truncated: result.basis.bounds.truncated || result.next !== undefined, basis: result.basis,
138:       units: result.matches.map((match): Unit => ({
139:         ...(match.enclosing && match.enclosing.range.path === match.path && match.enclosing.range.startLine <= match.line &&
140:           match.line <= match.enclosing.range.endLine
141:           ? { ...match.enclosing.range, symbol: match.enclosing.name }
142:           : { path: match.path, startLine: Math.max(1, match.line - CONTEXT), endLine: match.line + CONTEXT }),
143:         why: `${kind === "lexical" ? "rg" : "rg-wide"}:${term}`,
144:         check: { line: match.line, text: match.text.trim() },
145:       })),
146:     }))),
147:   }
148: }
149: 
150: function definitions(query: NonNullable<Sources["query"]>, symbol: string, inScope: (file: string) => boolean): Planned {
151:   return indexed("definition", symbol, query({ op: "definition", name: symbol }), `def:${symbol}`, inScope)
152: }
153: 
154: /** FTS prefix and camelCase/snake_case parts: the index matches `name` against `symbol_name` (J2). */
155: function named(query: NonNullable<Sources["query"]>, symbol: string, inScope: (file: string) => boolean): Planned {
156:   const name = symbol.split(".").at(-1) ?? symbol
157:   return indexed("definition", `${name}*`, query({ op: "symbols", name, limit: PAGE }), `name:${name}`, inScope)
158: }
159: 
160: function neighbours(query: NonNullable<Sources["query"]>, file: string, inScope: (file: string) => boolean): Planned[] {
161:   return [
162:     indexed("neighbors", `importers:${file}`, query({ op: "importers", path: file, limit: PAGE }), `importer-of:${file}`, inScope),
163:     indexed("neighbors", `imports:${file}`, query({ op: "imports", path: file, limit: PAGE }), `imported-by:${file}`, inScope),
164:   ]
165: }
166: 
167: function indexed(kind: Kind, label: string, effect: Effect.Effect<CodeIndex.CodeQueryResult, Research.Error>, why: string,
168:   inScope: (file: string) => boolean): Planned {
169:   return {
170:     kind, query: label,
171:     run: effect.pipe(Effect.map((result) => {
172:       const symbols = [...(result.resolved ? [result.resolved] : result.candidates),
173:         ...result.hits.flatMap((hit) => hit.role === "definition" && hit.via ? [hit.via] : [])]
174:       const units = [
175:         ...symbols.map((ref): Unit => ({ ...ref.range, symbol: ref.name, why, check: { line: ref.nameLine, text: ref.name } })),
176:         ...result.hits.filter((hit) => hit.role !== "definition" || !hit.via)
177:           .map((hit): Unit => hit.via ? { ...hit.via.range, symbol: hit.via.name, why, check: { line: hit.via.nameLine, text: hit.via.name } }
178:             : { ...hit.range, why }),
179:       ].filter((unit) => inScope(unit.path))
180:       return { units, hits: units.length, truncated: result.basis.bounds.truncated || result.next !== undefined, basis: result.basis }
181:     }), Effect.catchIf((error) => UNINDEXED.has(error.code), (): Effect.Effect<List> =>
182:       // A shard that stopped serving mid-call costs this list, not the call; coverage then says incomplete.
183:       Effect.succeed({ units: [], hits: 0, truncated: true }))),
184:   }
185: }
186: 
187: /**
188:  * L5: PageRank position over the resolved import graph, used only to break ties. One `map` page. It also probes the
189:  * index: an index that is not ready yields undefined, and locate degrades to the lexical lists (J3.7).
190:  */
191: function ranks(query: Sources["query"]) {
192:   if (!query) return Effect.succeed(undefined)
193:   return query({ op: "map", limit: 200 }).pipe(
194:     Effect.map((result) => new Map(result.hits.map((hit, index, hits) => [hit.range.path, 1 - index / hits.length] as const))),
195:     Effect.catchIf((error) => UNINDEXED.has(error.code), () => Effect.succeed(undefined)),
196:   )
197: }
198: 
199: const UNINDEXED = new Set<Research.Error["code"]>(["index_unavailable", "index_building"])
```

Linhas 205–235.

```text
205: function fuse(lists: ReadonlyArray<List>, rank: ReadonlyMap<string, number>) {
206:   const units = new Map<string, CodeIndex.Range & { symbol?: string; score: number; why: string[]; checks: NonNullable<Unit["check"]>[] }>()
207:   const definitions = lists.flatMap((list) => list.units).filter((unit) => unit.symbol)
208:   lists.forEach((list) => {
209:     const seen = new Set<string>()
210:     list.units.forEach((unit, index) => {
211:       const line = unit.check?.line
212:       const home = unit.symbol || line === undefined ? unit
213:         : definitions.find((definition) => definition.path === unit.path && definition.startLine <= line && line <= definition.endLine) ?? unit
214:       const key = `${home.path}:${home.startLine}:${home.endLine}`
215:       const entry = units.get(key) ?? { path: home.path, startLine: home.startLine, endLine: home.endLine,
216:         ...(home.symbol ? { symbol: home.symbol } : {}), score: 0.1 * (rank.get(home.path) ?? 0), why: [], checks: [] }
217:       units.set(key, entry)
218:       if (unit.check) entry.checks.push(unit.check)
219:       if (!entry.why.includes(unit.why)) entry.why.push(unit.why)
220:       if (seen.has(key)) return
221:       seen.add(key)
222:       entry.score += 1 / (RRF_K + index + 1)
223:     })
224:   })
225:   return [...units.values()].toSorted(order)
226: }
227: 
228: function valid(unit: CodeIndex.Range, check: NonNullable<Unit["check"]>, lines: ReadonlyArray<string>) {
229:   return unit.startLine <= check.line && check.line <= unit.endLine && check.line <= lines.length &&
230:     lines[check.line - 1].includes(check.text)
231: }
232: 
233: function order(left: { score: number } & CodeIndex.Range, right: { score: number } & CodeIndex.Range) {
234:   return right.score - left.score || left.path.localeCompare(right.path) || left.startLine - right.startLine
235: }
```

Linhas 237–265.

```text
237: function basis(lists: ReadonlyArray<List>, run: { indexed: boolean; ms: number; limit: number; discarded: number; truncated: boolean
238:   files: ReadonlyArray<string> }): CodeIndex.Basis {
239:   const bases = lists.flatMap((list) => list.basis ? [list.basis] : [])
240:   const freshness = bases.map((item) => item.freshness)
241:   // Without an index, the languages of the files the lexical lists reached are the ones no index served.
242:   const missing = run.indexed ? [] : run.files.flatMap((file) => LANGUAGES[file.split(".").at(-1) ?? ""] ?? [])
243:   return {
244:     basis: {
245:       commit: bases.find((item) => item.basis.commit)?.basis.commit ?? "",
246:       ...(bases.find((item) => item.basis.dirtyDigest) ? { dirtyDigest: bases.find((item) => item.basis.dirtyDigest)!.basis.dirtyDigest } : {}),
247:       shards: [...new Map(bases.flatMap((item) => item.basis.shards).map((shard) => [shard.id, shard])).values()],
248:     },
249:     execution: { op: "locate", ms: run.ms, semantic: "absent" },
250:     coverage: {
251:       documents: Math.max(0, ...bases.map((item) => item.coverage.documents)),
252:       skipped: [...new Map(bases.flatMap((item) => item.coverage.skipped).map((skip) => [`${skip.path}\0${skip.reason}`, skip])).values()],
253:       languagesMissing: [...new Set([...bases.flatMap((item) => item.coverage.languagesMissing), ...missing])],
254:       opaqueSites: bases.reduce((sum, item) => sum + item.coverage.opaqueSites, 0),
255:       complete: run.indexed && bases.every((item) => item.coverage.complete) && lists.every((list) => !list.truncated),
256:       discarded: run.discarded,
257:     },
258:     // J3.7: the lexical lists read the worktree itself, so they are fresh; only index lists can be stale.
259:     freshness: freshness.includes("stale") ? "stale" : freshness.includes("dirty-overlay") ? "dirty-overlay" : "fresh",
260:     bounds: { limit: run.limit, truncated: run.truncated },
261:   }
262: }
263: 
264: const LANGUAGES: Record<string, string> = { ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "js", jsx: "js", mjs: "js", cjs: "js",
265:   py: "py", go: "go", rs: "rust" }
```

## RE-B2

### RB2-01 — Liveness: allowed/check/probe completos, DNS, requests e limites locais

Vínculo: corpo R8; archive E28.

Observação: o atalho de captura é anterior a probe; allowed é uma helper separada; refusal resolve DNS e request recebe a URL. A chamada a fetch e os ramos HEAD/GET/redirect/timeout são o limite de prova local, sem qualificação externa de isolamento.

**RB-S006 — `packages/core/src/research-toolkit/liveness.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `3b6335d550f6979d9aca63cd0e524b3e43b0a9b2` · SHA-256 `9703355fbfac94a32110e810f0843ce22285895cc45b8da3f534f36a61f772af` · 6955 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/liveness.ts`; archive: E28.

Linhas 9–46.

```text
9: export type Status = "LIVE" | "DEAD" | "LIKELY_HALLUCINATED" | "UNKNOWN"
10: export type Result = { readonly url: string; readonly status: Status; readonly httpStatus?: number; readonly reason: string }
11: 
12: export const USER_AGENT = "Orchestra-LinkCheck/1.0"
13: export const Limits = Object.freeze({ timeoutMs: 8_000, redirects: 5, parallel: 8, freshMs: 24 * 60 * 60 * 1000 })
14: 
15: export type Options = {
16:   /** URLs this dispatch saw: retained web-search results and captured `url` sources. Used only to name hallucinations. */
17:   readonly seen?: readonly string[]
18:   /** `url` sources already captured successfully; a capture younger than 24 h counts as LIVE with no request. */
19:   readonly captured?: ReadonlyArray<{ readonly url: string; readonly capturedAt: number }>
20:   readonly now?: number
21:   /** Loopback and private addresses are refused (UNKNOWN) so a cited URL cannot probe the host's network. Tests only. */
22:   readonly privateNetwork?: boolean
23: }
24: 
25: /** Label-suffix match: `docs.github.com` matches `github.com`, `evilgithub.com` does not. */
26: export function allowed(url: string, domains: readonly string[] | "unrestricted") {
27:   if (domains === "unrestricted") return true
28:   const host = hostname(url)
29:   if (!host) return false
30:   return domains.some((entry) => {
31:     const domain = entry.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "")
32:     return domain !== "" && (host === domain || host.endsWith(`.${domain}`))
33:   })
34: }
35: 
36: export function hostname(url: string) {
37:   if (!URL.canParse(url)) return undefined
38:   return new URL(url).hostname.toLowerCase().replace(/\.$/, "")
39: }
40: 
41: /** Identity used to compare cited URLs with captured ones: no fragment, no trailing slash. */
42: export function normal(url: string) {
43:   if (!URL.canParse(url)) return url
44:   const parsed = new URL(url)
45:   return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`
46: }
```

Linhas 48–69.

```text
48: export const check = (urls: readonly string[], options: Options = {}) => Effect.promise(async () => {
49:   const now = options.now ?? Date.now()
50:   const seen = new Set((options.seen ?? []).map(normal))
51:   const fresh = new Set((options.captured ?? []).filter((item) => now - item.capturedAt < Limits.freshMs).map((item) => normal(item.url)))
52:   const unique = [...new Set(urls)]
53:   const results = new Map<string, Result>()
54:   const queue = unique.filter((url) => {
55:     if (!fresh.has(normal(url))) return true
56:     results.set(url, { url, status: "LIVE", reason: "captured in this dispatch less than 24 h ago" })
57:     return false
58:   })
59:   // A bounded pool: at most `parallel` requests in flight.
60:   const workers = Array.from({ length: Math.min(Limits.parallel, queue.length) }, async () => {
61:     for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
62:       const outcome = await probe(url, options.privateNetwork === true)
63:       const status = outcome.status === "DEAD" && !seen.has(normal(url)) ? "LIKELY_HALLUCINATED" : outcome.status
64:       results.set(url, { url, ...outcome, status })
65:     }
66:   })
67:   await Promise.all(workers)
68:   return unique.map((url) => results.get(url)!)
69: })
```

Linhas 73–126.

```text
73: async function probe(start: string, privateNetwork: boolean): Promise<Outcome> {
74:   let current = start
75:   for (let hop = 0; hop <= Limits.redirects; hop++) {
76:     if (!URL.canParse(current)) return { status: "DEAD", reason: "malformed URL" }
77:     const target = new URL(current)
78:     if (target.protocol !== "http:" && target.protocol !== "https:") return { status: "UNKNOWN", reason: `scheme ${target.protocol} not checked` }
79:     const refused = await refusal(target.hostname, privateNetwork)
80:     if (refused) return refused
81:     const response = await request(current, "HEAD").then((head) => head.status >= 400 ? request(current, "GET") : head)
82:     if ("error" in response) return response.error
83:     if (response.status >= 300 && response.status < 400) {
84:       const location = response.headers.get("location")
85:       if (!location) return { status: "DEAD", httpStatus: response.status, reason: "redirect without a location" }
86:       current = new URL(location, current).href
87:       continue
88:     }
89:     if (response.status >= 200 && response.status < 300) return { status: "LIVE", httpStatus: response.status, reason: "reachable" }
90:     // A rate limit says nothing about whether the page exists.
91:     if (response.status === 429) return { status: "UNKNOWN", httpStatus: 429, reason: "rate limited" }
92:     return { status: "DEAD", httpStatus: response.status, reason: `HTTP ${response.status}` }
93:   }
94:   return { status: "DEAD", reason: `more than ${Limits.redirects} redirects` }
95: }
96: 
97: /** HEAD first; the caller retries with a one-byte ranged GET for servers that reject HEAD. */
98: async function request(url: string, method: "HEAD" | "GET") {
99:   const headers: Record<string, string> = { "user-agent": USER_AGENT, ...(method === "GET" ? { range: "bytes=0-0" } : {}) }
100:   try {
101:     const response = await fetch(url, { method, headers, redirect: "manual", signal: AbortSignal.timeout(Limits.timeoutMs) })
102:     await response.body?.cancel()
103:     return response
104:   } catch (error) {
105:     const name = error instanceof Error ? error.name : ""
106:     if (name === "TimeoutError" || name === "AbortError") return { status: 0, headers: new Headers(), error: { status: "UNKNOWN", reason: "timeout" } as Outcome }
107:     return { status: 0, headers: new Headers(), error: { status: "DEAD", reason: `connection failed: ${error instanceof Error ? error.message : String(error)}` } as Outcome }
108:   }
109: }
110: 
111: async function refusal(host: string, privateNetwork: boolean): Promise<Outcome | undefined> {
112:   const name = host.replace(/^\[|\]$/g, "").toLowerCase()
113:   if (!privateNetwork && /(^|\.)(localhost|local|internal|localdomain)$/.test(name)) return { status: "UNKNOWN", reason: "local host refused by policy" }
114:   const addresses = isIP(name) ? [name] : await lookup(name, { all: true }).then((list) => list.map((item) => item.address), (error: NodeJS.ErrnoException) => error)
115:   if (addresses instanceof Error) return { status: addresses.code === "EAI_AGAIN" ? "UNKNOWN" : "DEAD", reason: `DNS ${addresses.code ?? "failure"}` }
116:   if (!privateNetwork && addresses.some(isPrivate)) return { status: "UNKNOWN", reason: "private address refused by policy" }
117: }
118: 
119: function isPrivate(address: string) {
120:   const lower = address.toLowerCase()
121:   if (lower.startsWith("::ffff:")) return isPrivate(lower.slice(7))
122:   if (isIP(lower) === 6) return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)
123:   const [a, b] = lower.split(".").map(Number)
124:   return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
125:     (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
126: }
```

## RE-B3

### RB3-01 — Probe: união fechada, execução, retorno, verdict e slots

Vínculo: corpo R9; archive E29.

Os comentários de enforcement expressam intenção do código. As chamadas a confine/AppProcess/Omni e o flag memoryCap não comprovam eficácia externa do jail. O caminho integral de run mostra o retorno e não admite nem cobra automaticamente uma fonte.

**RB-S007 — `packages/core/src/research-toolkit/probe/types.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a3859179186c2e7f55aa401fa4b3f091540eaffe` · SHA-256 `7946f380ef918f065273afa09304cdf61da2d88d78bb287cff0ad5812e45c3e6` · 3631 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/probe/types.ts`; archive: E29.

Linhas 10–84.

```text
10: export const Limits = Object.freeze({
11:   heapMiB: 1024,
12:   /** Resident memory of the whole probe tree, enforced by omni (J4.7, D2). */
13:   rssBytes: 1024 * 1024 * 1024,
14:   scratchBytes: 2 * 1024 * 1024 * 1024,
15:   outputBytes: 1024 * 1024,
16:   tailBytes: 64 * 1024,
17:   scriptBytes: 16 * 1024,
18:   perDispatch: 1,
19:   perHost: 2,
20:   queueSeconds: 30,
21: })
22: 
23: const file = Schema.NonEmptyString.check(Schema.isMaxLength(8192))
24: const expectation = Schema.Struct({
25:   exitCode: optional(Schema.Int),
26:   stdoutIncludes: optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
27:   stderrIncludes: optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
28:   diagnosticCode: optional(Schema.NonEmptyString.check(Schema.isMaxLength(64))),
29: })
30: 
31: export const ProbeInput = Schema.Struct({
32:   // revision: a full hash or a ref the host resolves first (J5.15).
33:   snapshot: Schema.Union([
34:     Schema.Struct({ kind: Schema.Literal("commit"), revision: Schema.NonEmptyString.check(Schema.isMaxLength(256)) }),
35:     Schema.Struct({ kind: Schema.Literal("worktree") }),
36:   ]),
37:   runner: Schema.Union([
38:     // project: a tsconfig path inside the snapshot.
39:     Schema.Struct({ kind: Schema.Literal("typecheck"), project: file }),
40:     Schema.Struct({ kind: Schema.Literal("test"), file, name: optional(Schema.NonEmptyString.check(Schema.isMaxLength(1024))) }),
41:     Schema.Struct({
42:       // The schema bounds characters; the host also refuses more than scriptBytes of UTF-8.
43:       kind: Schema.Literal("script"), language: Schema.Literals(["ts", "js", "py"]),
44:       source: Schema.NonEmptyString.check(Schema.isMaxLength(Limits.scriptBytes)),
45:     }),
46:   ]),
47:   expect: optional(expectation),
48:   hypothesis: optional(Research.RecordRef),
49:   // At most what remains of the dispatch probe allowance.
50:   timeoutSeconds: optional(PositiveInt),
51: })
52: export type ProbeInput = typeof ProbeInput.Type
53: 
54: export type Verdict =
55:   | "passed" | "failed" | "reproduced" | "not_reproduced" | "timeout" | "memory_exceeded" | "blocked_by_repo_guard" | "error"
56: 
57: export type Stream = { readonly tail: string; readonly bytes: number; readonly truncated: boolean }
58: 
59: /** Retained as structured-json at `probe:<executionSessionID>/<probeID>`, even when the probe fails (J4.9). */
60: export type ProbeResult = {
61:   readonly probeID: string
62:   readonly snapshot: { readonly kind: "commit" | "worktree"; readonly revision: string; readonly dirtyDigest?: string; readonly files: number }
63:   /** argv as executed, with scratch paths. */
64:   readonly runner: { readonly kind: string; readonly binary: string; readonly version: string; readonly argv: ReadonlyArray<string> }
65:   /** reproduced and not_reproduced appear only with expect. */
66:   readonly verdict: Verdict
67:   readonly exitCode: number | null
68:   readonly durationMs: number
69:   readonly memoryCap: "heap-only" | "rss"
70:   readonly peakRssBytes?: number
71:   readonly stdout: Stream
72:   readonly stderr: Stream
73:   /** Paths translated from the scratch to the original file. */
74:   readonly diagnostics?: ReadonlyArray<{
75:     readonly path: string
76:     readonly line: number
77:     readonly column: number
78:     readonly code: string
79:     readonly message: string
80:   }>
81:   readonly expect?: ProbeInput["expect"]
82:   /** The script text, retained separately. */
83:   readonly script?: Research.SourceRef
84: }
```

**RB-S008 — `packages/core/src/research-toolkit/probe/run.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `be267f2f07e4c59a2b69f58b98ddc9499dd550ab` · SHA-256 `80ece4f75445501ac55ecc69bee4a00ca46f88bf931ba0b1f71c6ec5aa53f73c` · 8683 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/probe/run.ts`; archive: E29.

Linhas 21–110.

```text
21: export type Context = {
22:   readonly worktree: string
23:   readonly executionSessionID: string
24:   readonly dispatchID: string
25:   /** What remains of the dispatch's probe allowance in seconds (J1.10); the probe never runs longer. */
26:   readonly remainingSeconds: number
27:   /** Adds --noUnusedLocals --noUnusedParameters to a typecheck (T-P3). */
28:   readonly unused?: boolean
29:   readonly heapMiB?: number
30:   readonly rssBytes?: number
31:   readonly queueSeconds?: number
32: }
33: 
34: /** The receipt URI the caller retains the result under (J4.9). */
35: export const uri = (executionSessionID: string, probeID: string) => `probe:${executionSessionID}/${probeID}`
36: 
37: /** The line script/test-guard.ts prints when a repository refuses local tests (J4.8). */
38: export const GUARD = "Local test runs are disabled in this repository"
39: 
40: const DIAGNOSTICS = 200
41: 
42: export const run = Effect.fn("Probe.run")(function* (input: Probe.ProbeInput, context: Context) {
43:   if (process.platform !== "darwin" && process.platform !== "linux")
44:     return yield* new ProbeError({ code: "probe_unsupported_platform", reason: process.platform })
45:   const seconds = Math.min(input.timeoutSeconds ?? context.remainingSeconds, context.remainingSeconds)
46:   if (!(seconds > 0)) return yield* denied("allowance-exhausted")
47:   yield* slot(context.dispatchID, context.queueSeconds ?? Probe.Limits.queueSeconds)
48:   const probeID = Bun.randomUUIDv7()
49:   const scratch = yield* Effect.acquireRelease(
50:     Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "orchestra-probe-")).then((made) => realpath(made))),
51:     (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
52:   )
53:   const snapshot = yield* ProbeSnapshot.create({ worktree: context.worktree, snapshot: input.snapshot, scratch, maxBytes: Probe.Limits.scratchBytes })
54:   const env = ResearchProcess.environment()
55:   const plan = yield* ProbeRunners.plan({ runner: input.runner, snapshot, scratch, heapMiB: context.heapMiB ?? Probe.Limits.heapMiB, unused: context.unused, env })
56:   const launch = yield* ToolSafetySandbox.confine({ command: plan.argv[0], args: plan.argv.slice(1), cwd: plan.cwd, env: { ...env, ...plan.env }, write: [] }).pipe(
57:     Effect.mapError((error) => error.reason.startsWith("sandbox-platform-unsupported")
58:       ? new ProbeError({ code: "probe_unsupported_platform", reason: error.reason })
59:       : denied(`jail-unavailable: ${error.reason}`)))
60:   const outcome = yield* ResearchProcess.run({
61:     command: launch.command, args: launch.args, cwd: plan.cwd,
62:     env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
63:     timeoutMs: seconds * 1000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: context.rssBytes ?? Probe.Limits.rssBytes,
64:   })
65:   const stdout = outcome.stdout.data.toString("utf8")
66:   const stderr = outcome.stderr.data.toString("utf8")
67:   const diagnostics = plan.kind === "typecheck" ? ProbeTypecheck.parse(stdout, plan.cwd, snapshot) : undefined
68:   const shown = diagnostics?.slice(0, DIAGNOSTICS)
69:   const hidden = (diagnostics?.length ?? 0) - (shown?.length ?? 0)
70:   return {
71:     probeID,
72:     snapshot: { kind: snapshot.kind, revision: snapshot.revision, dirtyDigest: snapshot.dirtyDigest, files: snapshot.files },
73:     runner: { kind: plan.kind, binary: plan.binary, version: plan.version, argv: plan.argv },
74:     verdict: verdict(input.expect, outcome, `${stdout}\n${stderr}`, diagnostics),
75:     exitCode: outcome.exitCode,
76:     durationMs: outcome.durationMs,
77:     memoryCap: memoryCap(),
78:     // A typecheck's diagnostic lines are already structured: its tail leads with their causes and keeps only the rest.
79:     stdout: stream(outcome.stdout, diagnostics ? (line) => !ProbeTypecheck.structured(line) : undefined, [
80:       ...(diagnostics ? ProbeTypecheck.causes(diagnostics) : []),
81:       ...(hidden > 0 ? [`${hidden} more diagnostics not listed`] : []),
82:       ...(outcome.failure ? [outcome.failure] : []),
83:     ]),
84:     stderr: stream(outcome.stderr),
85:     diagnostics: shown,
86:     expect: input.expect,
87:   } satisfies Probe.ProbeResult
88: }, Effect.scoped)
89: 
90: /**
91:  * Omni enforces the RSS cap over the whole tree, a jail's workload included: under srt (linux) bubblewrap's
92:  * `--new-session` takes it out of omni's session, and omni counts it as the jail's descendant. The legacy spawner
93:  * bounds only the runner's heap (J4.7).
94:  */
95: export function memoryCap(): Probe.ProbeResult["memoryCap"] {
96:   return Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off" ? "rss" : "heap-only"
97: }
98: 
99: function verdict(expect: Probe.ProbeInput["expect"], outcome: ResearchProcess.Outcome, text: string, diagnostics?: ReadonlyArray<ProbeTypecheck.Diagnostic>): Probe.Verdict {
100:   if (outcome.timedOut) return "timeout"
101:   if (outcome.memoryExceeded) return "memory_exceeded"
102:   if (outcome.failure !== undefined || outcome.overflow) return "error"
103:   if (text.includes(GUARD)) return "blocked_by_repo_guard"
104:   if (!expect) return outcome.exitCode === 0 ? "passed" : "failed"
105:   const code = (value: string) => value.replace(/^TS/i, "")
106:   const met = (expect.exitCode === undefined || expect.exitCode === outcome.exitCode) &&
107:     (expect.stdoutIncludes === undefined || outcome.stdout.data.toString("utf8").includes(expect.stdoutIncludes)) &&
108:     (expect.stderrIncludes === undefined || outcome.stderr.data.toString("utf8").includes(expect.stderrIncludes)) &&
109:     (expect.diagnosticCode === undefined || (diagnostics ?? []).some((item) => code(item.code) === code(expect.diagnosticCode!)))
110:   return met ? "reproduced" : "not_reproduced"
```

Linhas 113–152.

```text
113: const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
114: 
115: /** A condensed tail: no color codes, repeated lines folded, notes last, at most tailBytes. */
116: function stream(captured: ResearchProcess.Captured, keep?: (line: string) => boolean, notes: ReadonlyArray<string> = []): Probe.Stream {
117:   const lines = captured.data.toString("utf8").replace(ANSI, "").split(/\r?\n/).filter((line) => !keep || keep(line))
118:   const folded = lines.reduce<{ line: string; count: number }[]>((list, line) => {
119:     const last = list.at(-1)
120:     if (last && last.line === line) last.count++
121:     if (!last || last.line !== line) list.push({ line, count: 1 })
122:     return list
123:   }, []).map((entry) => (entry.count > 1 ? `${entry.line} (x${entry.count})` : entry.line))
124:   // The tail keeps the end, so the notes go last where truncation cannot drop them.
125:   const text = [...folded, ...notes].join("\n").trim()
126:   const tail = Buffer.from(text).subarray(-Probe.Limits.tailBytes).toString("utf8")
127:   return { tail, bytes: captured.bytes, truncated: captured.truncated || Buffer.byteLength(text) > Probe.Limits.tailBytes }
128: }
129: 
130: // J4.12: one probe at a time per dispatch, two per host; a waiter gives up after queueSeconds as busy.
131: const host = Semaphore.makeUnsafe(Probe.Limits.perHost)
132: const dispatches = new Map<string, { semaphore: Semaphore.Semaphore; users: number }>()
133: 
134: const slot = Effect.fnUntraced(function* (dispatchID: string, queueSeconds: number) {
135:   const entry = yield* Effect.acquireRelease(Effect.sync(() => {
136:     const found = dispatches.get(dispatchID) ?? { semaphore: Semaphore.makeUnsafe(Probe.Limits.perDispatch), users: 0 }
137:     found.users++
138:     dispatches.set(dispatchID, found)
139:     return found
140:   }), (found) => Effect.sync(() => {
141:     found.users--
142:     if (found.users === 0) dispatches.delete(dispatchID)
143:   }))
144:   // A permit's release is registered only once it is held; the wait itself stays interruptible.
145:   const deadline = Date.now() + queueSeconds * 1000
146:   const take = (semaphore: Semaphore.Semaphore) => Effect.gen(function* () {
147:     const got = yield* semaphore.take(1).pipe(Effect.timeoutOption(Duration.millis(Math.max(0, deadline - Date.now()))))
148:     if (Option.isSome(got)) yield* Effect.addFinalizer(() => semaphore.release(1))
149:     return Option.isSome(got)
150:   })
151:   if (!((yield* take(entry.semaphore)) && (yield* take(host)))) return yield* denied("busy")
152: })
```

### RB3-02 — Snapshot: seleção commit/worktree, cópia, desaparecidos, digest e links

Vínculo: corpo R9; archive E31.

O digest dirty é calculado sobre as cópias ou o marcador deleted; a seleção tolera caminhos sem lstat e mantém links de dependências do original. Nenhuma atomicidade/hermeticidade além desses ramos é inferida.

**RB-S009 — `packages/core/src/research-toolkit/probe/snapshot.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `0e89bf342e5c4567c4c2cfc180a3d3961ffec91e` · SHA-256 `c376cc01e1e893d3fac7cff70f6858888b29145546e36c36ce4d4b0a4655ea77` · 6868 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/probe/snapshot.ts`; archive: E31.

Linhas 25–65.

```text
25: const DEPENDENCIES = ["node_modules", ".venv", "target"]
26: 
27: export const create = Effect.fn("ProbeSnapshot.create")(function* (input: {
28:   readonly worktree: string
29:   readonly snapshot: Probe.ProbeInput["snapshot"]
30:   /** An empty directory the caller owns and removes. */
31:   readonly scratch: string
32:   readonly maxBytes: number
33: }) {
34:   const origin = yield* Effect.promise(() => realpath(input.worktree))
35:   const top = (yield* ResearchProcess.git(origin, ["rev-parse", "--show-toplevel"]).pipe(Effect.mapError(fail))).toString("utf8").trim()
36:   const repo = yield* Effect.promise(() => realpath(top))
37:   const root = path.join(input.scratch, "snapshot")
38:   yield* Effect.promise(() => mkdir(root))
39:   const made = input.snapshot.kind === "commit"
40:     ? yield* commit(repo, root, input.snapshot.revision, input)
41:     : yield* worktree(repo, root, input)
42:   yield* link(repo, root, made.paths)
43:   return { root, origin: repo, kind: input.snapshot.kind, revision: made.revision, dirtyDigest: made.dirtyDigest, files: made.paths.length } satisfies Snapshot
44: })
45: 
46: /** `git archive` of the resolved commit, extracted into the scratch; the size is checked from the tree first. */
47: const commit = Effect.fnUntraced(function* (repo: string, root: string, revision: string, input: { scratch: string; maxBytes: number }) {
48:   const hash = (yield* ResearchProcess.git(repo, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`]).pipe(
49:     Effect.mapError(() => denied(`snapshot-revision-unknown: ${revision}`)))).toString("utf8").trim()
50:   const entries = (yield* ResearchProcess.git(repo, ["ls-tree", "-r", "-l", "-z", hash]).pipe(Effect.mapError(fail)))
51:     .toString("utf8").split("\0").filter(Boolean).map((line) => {
52:       const tab = line.indexOf("\t")
53:       return { size: Number(line.slice(0, tab).trim().split(/\s+/)[3]) || 0, path: line.slice(tab + 1) }
54:     })
55:   // The tar and its extraction coexist briefly.
56:   if (entries.reduce((sum, entry) => sum + entry.size, 0) * 2 > input.maxBytes) return yield* denied("snapshot-exceeds-scratch-cap")
57:   const tar = path.join(input.scratch, "snapshot.tar")
58:   yield* ResearchProcess.git(repo, ["archive", "--format=tar", "-o", tar, hash]).pipe(Effect.mapError(fail))
59:   const extracted = yield* ResearchProcess.run({
60:     command: "tar", args: ["-xf", tar, "-C", root], cwd: input.scratch, env: ResearchProcess.environment(), timeoutMs: 300_000, maxBytes: 1024 * 1024,
61:   })
62:   yield* Effect.promise(() => rm(tar, { force: true }))
63:   if (extracted.exitCode !== 0) return yield* fail(new ResearchProcess.Failed({ command: "tar", detail: extracted.stderr.data.toString("utf8").trim() }))
64:   return { revision: hash, dirtyDigest: undefined, paths: entries.map((entry) => entry.path) }
65: })
```

Linhas 67–113.

```text
67: /** File clones (clonefile on APFS, reflink where the filesystem has it, else a copy) of the tracked and unignored files. */
68: const worktree = Effect.fnUntraced(function* (repo: string, root: string, input: { maxBytes: number }) {
69:   const revision = (yield* ResearchProcess.git(repo, ["rev-parse", "--verify", "HEAD"]).pipe(
70:     Effect.mapError(() => denied("snapshot-worktree-has-no-commit")))).toString("utf8").trim()
71:   const listed = (yield* ResearchProcess.git(repo, ["ls-files", "-co", "--exclude-standard", "-z"]).pipe(Effect.mapError(fail)))
72:     .toString("utf8").split("\0").filter(Boolean)
73:   // Deleted tracked files and submodule gitlinks are listed but are no file to copy.
74:   const present = (yield* Effect.forEach([...new Set(listed)], (file) => Effect.promise(() =>
75:     lstat(path.join(repo, file)).then((stat) => stat.isFile() || stat.isSymbolicLink() ? [{ file, size: stat.size, link: stat.isSymbolicLink() }] : [], () => [])),
76:   { concurrency: 64 })).flat()
77:   if (present.reduce((sum, entry) => sum + entry.size, 0) > input.maxBytes) return yield* denied("snapshot-exceeds-scratch-cap")
78:   yield* Effect.forEach(present, (entry) => Effect.promise(async () => {
79:     const target = path.join(root, entry.file)
80:     await mkdir(path.dirname(target), { recursive: true })
81:     if (entry.link) return symlink(await readlink(path.join(repo, entry.file)), target)
82:     return copyFile(path.join(repo, entry.file), target, constants.COPYFILE_FICLONE)
83:   }), { concurrency: 64, discard: true })
84:   const dirty = (yield* ResearchProcess.git(repo, ["ls-files", "-mo", "--exclude-standard", "-z"]).pipe(Effect.mapError(fail)))
85:     .toString("utf8").split("\0").filter(Boolean).sort()
86:   const dirtyDigest = dirty.length ? yield* Effect.promise(async () => {
87:     const hasher = new Bun.CryptoHasher("sha256")
88:     for (const file of dirty) {
89:       hasher.update(`${file}\0`)
90:       const copy = Bun.file(path.join(root, file))
91:       hasher.update(await copy.exists() ? new Uint8Array(await copy.arrayBuffer()) : "deleted")
92:       hasher.update("\0")
93:     }
94:     return hasher.digest("hex")
95:   }) : undefined
96:   return { revision, dirtyDigest, paths: present.map((entry) => entry.file) }
97: })
98: 
99: /** Dependency directories of the original enter as symlinks, at the root and next to every package.json. */
100: const link = Effect.fnUntraced(function* (repo: string, root: string, paths: ReadonlyArray<string>) {
101:   const dirs = new Set(["", ...paths.filter((file) => path.basename(file) === "package.json" && !file.split("/").some((part) => DEPENDENCIES.includes(part)))
102:     .map((file) => path.dirname(file)).map((dir) => (dir === "." ? "" : dir))])
103:   yield* Effect.forEach([...dirs].flatMap((dir) => DEPENDENCIES.map((name) => path.join(dir, name))), (relative) => Effect.promise(async () => {
104:     const source = path.join(repo, relative)
105:     const stat = await lstat(source).catch(() => undefined)
106:     if (!stat?.isDirectory()) return
107:     if (await lstat(path.join(root, relative)).then(() => true, () => false)) return
108:     await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
109:     await symlink(source, path.join(root, relative))
110:   }), { concurrency: 16, discard: true })
111: })
112: 
113: const fail = (error: ResearchProcess.Failed) => denied(`snapshot-git-failed: ${error.command}: ${error.detail}`)
```

### RB3-03 — Assets e runners: seleção, identidade, argv, ambiente e contenção de path

Vínculo: corpo R9; archive E32.

**RB-S010 — `packages/core/src/research-toolkit/probe/assets.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `723a227214d129eed66a8e6d43d3277ae0f199d1` · SHA-256 `3fd210e83469c18a58aa2ffade6286cd1fdbd21ea1f8280cfad9c949ef77f1d9` · 3800 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/probe/assets.ts`; archive: E32.

Linhas 12–64.

```text
12: export class ProbeError extends Schema.TaggedErrorClass<ProbeError>()("Probe.Error", {
13:   code: Schema.Literals(["probe_denied", "probe_unsupported_platform"]),
14:   reason: Schema.String,
15:   /** The runners an ambiguous project offers. */
16:   options: Schema.optional(Schema.Array(Schema.String)),
17: }) {}
18: 
19: export const denied = (reason: string, options?: ReadonlyArray<string>) => new ProbeError({ code: "probe_denied", reason, options })
20: 
21: export type Kind = "typescript" | "vitest" | "jest"
22: 
23: const BIN: Record<Kind, string> = { typescript: "tsc", vitest: "vitest", jest: "jest" }
24: 
25: export type Asset = { readonly kind: Kind; readonly root: string; readonly entry: string; readonly version: string }
26: 
27: /** The nearest `node_modules/<kind>` from `from` up to `top`, verified; undefined when the project has none. */
28: export const project = Effect.fn("ProbeAssets.project")(function* (kind: Kind, from: string, top: string) {
29:   const found = yield* Effect.promise(() => nearest(kind, from, top))
30:   if (!found) return undefined
31:   return yield* verify(kind, found)
32: })
33: 
34: /** The project's typescript, else the research pack's (J6). */
35: export const typescript = Effect.fn("ProbeAssets.typescript")(function* (from: string, top: string) {
36:   const own = yield* project("typescript", from, top)
37:   if (own) return own
38:   // The pack may not be installed or ready yet; the probe then names the gap.
39:   const pack = yield* ResearchToolkit.ensure("typescript").pipe(Effect.catchCause(() => Effect.succeed(undefined)))
40:   if (!pack) return yield* denied("typescript-unavailable: the project has no node_modules/typescript and the research pack is not ready")
41:   return { kind: "typescript" as const, root: path.dirname(pack.executable), entry: pack.executable, version: "pack" }
42: })
43: 
44: export const verify = Effect.fn("ProbeAssets.verify")(function* (kind: Kind, metadata: string) {
45:   const root = path.dirname(yield* Effect.promise(() => realpath(metadata)))
46:   const info: unknown = yield* Effect.promise(() => Bun.file(metadata).json().catch(() => undefined))
47:   if (!info || typeof info !== "object" || !("name" in info) || info.name !== kind)
48:     return yield* denied(`trusted-asset-package-invalid: ${kind}`)
49:   const bin = "bin" in info ? info.bin : undefined
50:   const declared = typeof bin === "string" ? bin : bin && typeof bin === "object" && BIN[kind] in bin ? (bin as Record<string, unknown>)[BIN[kind]] : undefined
51:   if (typeof declared !== "string") return yield* denied(`trusted-asset-entry-invalid: ${kind}`)
52:   const entry = yield* Effect.promise(() => realpath(path.resolve(root, declared)).catch(() => undefined))
53:   const file = entry ? yield* Effect.promise(() => lstat(entry).then((stat) => stat.isFile(), () => false)) : false
54:   if (!entry || !file || !FSUtil.contains(root, entry)) return yield* denied(`trusted-asset-escape: ${kind}`)
55:   const version = "version" in info && typeof info.version === "string" ? info.version : "unknown"
56:   return { kind, root, entry, version } satisfies Asset
57: })
58: 
59: async function nearest(kind: Kind, from: string, top: string): Promise<string | undefined> {
60:   const metadata = path.join(from, "node_modules", kind, "package.json")
61:   if (await Bun.file(metadata).exists()) return metadata
62:   if (from === top || !FSUtil.contains(top, from)) return undefined
63:   return nearest(kind, path.dirname(from), top)
64: }
```

**RB-S011 — `packages/core/src/research-toolkit/probe/runners.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `5d56b469bb20f80dff4cd89d034706ee8db4798d` · SHA-256 `551427a96e05cf5562e8d6eff1873b91a538a9614869ae2323d4b40a7120a028` · 8962 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/probe/runners.ts`; archive: E32.

Linhas 27–56.

```text
27: export type TestRunner = "bun" | "vitest" | "jest" | "pytest" | "go"
28: 
29: export const plan = Effect.fn("ProbeRunners.plan")(function* (input: {
30:   readonly runner: Probe.ProbeInput["runner"]
31:   readonly snapshot: ProbeSnapshot.Snapshot
32:   readonly scratch: string
33:   readonly heapMiB: number
34:   readonly unused?: boolean
35:   readonly env: Record<string, string>
36: }) {
37:   const runner = input.runner
38:   const root = input.snapshot.root
39:   if (runner.kind === "script") return yield* script(runner, input)
40:   if (runner.kind === "typecheck") {
41:     const file = yield* inside(root, runner.project)
42:     const project = yield* ProbeTypecheck.project(file, root)
43:     if (!project) return yield* denied(`typecheck-no-tsconfig: ${runner.project}`)
44:     const tsc = yield* ProbeAssets.typescript(path.dirname(project), root)
45:     const node = yield* program("node", input.env)
46:     return {
47:       kind: "typecheck", binary: tsc.entry, version: tsc.version, cwd: root, env: {},
48:       argv: ProbeTypecheck.argv({ node, tsc: tsc.entry, project: path.relative(root, project) || ".", heapMiB: input.heapMiB, unused: input.unused }),
49:     } satisfies Plan
50:   }
51:   const file = yield* inside(root, runner.file)
52:   const found = yield* Effect.promise(() => detect(file, root))
53:   if (!found) return yield* denied(`test-runner-unknown: no test runner config found for ${runner.file}`)
54:   if (found.runners.length > 1) return yield* denied(`test-runner-ambiguous: ${runner.file}`, found.runners)
55:   return yield* test(found.runners[0], { file: path.relative(found.dir, file), name: runner.name, cwd: found.dir, root }, input)
56: })
```

Linhas 58–108.

```text
58: const test = Effect.fnUntraced(function* (
59:   runner: TestRunner,
60:   target: { file: string; name?: string; cwd: string; root: string },
61:   input: { heapMiB: number; env: Record<string, string>; scratch: string },
62: ) {
63:   const filter = (flag: string) => (target.name === undefined ? [] : [flag, target.name])
64:   if (runner === "bun")
65:     return { kind: "test", binary: process.execPath, version: Bun.version, cwd: target.cwd, env: BUN,
66:       // A bare name is a filter over discovered *.test files; a ./ path runs exactly that file, whatever its name.
67:       argv: [process.execPath, "--no-env-file", "test", `./${target.file.split(path.sep).join("/")}`, ...filter("-t")] } satisfies Plan
68:   if (runner === "vitest" || runner === "jest") {
69:     const asset = yield* ProbeAssets.project(runner, target.cwd, target.root)
70:     if (!asset) return yield* denied(`test-runner-missing: ${runner} is configured but not installed`)
71:     const node = yield* program("node", input.env)
72:     const args = runner === "vitest" ? ["run", target.file] : ["--runTestsByPath", target.file]
73:     return { kind: "test", binary: asset.entry, version: asset.version, cwd: target.cwd, env: {},
74:       argv: [node, `--max-old-space-size=${input.heapMiB}`, asset.entry, ...args, ...filter("-t")] } satisfies Plan
75:   }
76:   if (runner === "pytest") {
77:     const python = yield* program("python3", input.env)
78:     return { kind: "test", binary: python, version: yield* version(python, ["--version"], input), cwd: target.cwd, env: PYTHON,
79:       argv: [python, "-B", "-m", "pytest", "-p", "no:cacheprovider", target.file, ...filter("-k")] } satisfies Plan
80:   }
81:   const go = yield* program("go", input.env)
82:   const dir = path.dirname(target.file)
83:   return { kind: "test", binary: go, version: yield* version(go, ["version"], input), cwd: target.cwd, env: GO,
84:     argv: [go, "test", dir === "." ? "." : `./${dir.split(path.sep).join("/")}`, ...filter("-run")] } satisfies Plan
85: })
86: 
87: const script = Effect.fnUntraced(function* (
88:   runner: Extract<Probe.ProbeInput["runner"], { kind: "script" }>,
89:   input: { snapshot: ProbeSnapshot.Snapshot; scratch: string; env: Record<string, string> },
90: ) {
91:   if (Buffer.byteLength(runner.source, "utf8") > Probe.Limits.scriptBytes) return yield* denied("script-too-large")
92:   // Written to the scratch, never into the snapshot.
93:   const file = path.join(input.scratch, "script", `probe.${runner.language}`)
94:   yield* Effect.promise(() => mkdir(path.dirname(file)).then(() => Bun.write(file, runner.source)))
95:   if (runner.language === "py") {
96:     const python = yield* program("python3", input.env)
97:     return { kind: "script", binary: python, version: yield* version(python, ["--version"], input), cwd: input.snapshot.root,
98:       env: { ...PYTHON, PYTHONPATH: input.snapshot.root }, argv: [python, "-B", file] } satisfies Plan
99:   }
100:   return { kind: "script", binary: process.execPath, version: Bun.version, cwd: input.snapshot.root, env: BUN,
101:     argv: [process.execPath, "--no-env-file", file] } satisfies Plan
102: })
103: 
104: // A compiled Orchestra binary is Bun; BUN_BE_BUN makes it act as the bun CLI. --no-env-file keeps a workspace .env out.
105: const BUN = { BUN_BE_BUN: "1" }
106: const PYTHON = { PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" }
107: // No toolchain download and no module proxy: the jail has no network anyway, this fails fast instead of timing out.
108: const GO = { GOTOOLCHAIN: "local", GOPROXY: "off" }
```

Linhas 110–152.

```text
110: /** A model-chosen path, accepted only as an existing entry inside the snapshot after realpath (J4.2). */
111: export const inside = Effect.fn("ProbeRunners.inside")(function* (root: string, file: string) {
112:   const physical = yield* Effect.promise(() => realpath(path.resolve(root, file)).catch(() => undefined))
113:   if (!physical || !FSUtil.contains(root, physical)) return yield* denied(`path-outside-snapshot: ${file}`)
114:   return physical
115: })
116: 
117: const program = Effect.fnUntraced(function* (name: string, env: Record<string, string>) {
118:   const found = Bun.which(name, { PATH: env.PATH ?? "" })
119:   if (!found) return yield* denied(`runner-binary-missing: ${name}`)
120:   return found
121: })
122: 
123: /** A toolchain's own version line, run outside the snapshot with GOTOOLCHAIN=local so go cannot fetch one. */
124: const version = Effect.fnUntraced(function* (binary: string, args: ReadonlyArray<string>, input: { env: Record<string, string>; scratch: string }) {
125:   const outcome = yield* ResearchProcess.run({ command: binary, args, cwd: input.scratch, env: { ...input.env, ...GO }, timeoutMs: 10_000, maxBytes: 4096 })
126:   return `${outcome.stdout.data}${outcome.stderr.data}`.trim().split("\n")[0] || "unknown"
127: })
128: 
129: const MARKERS: ReadonlyArray<{ runner: TestRunner; files: ReadonlyArray<string>; languages: ReadonlyArray<string> }> = [
130:   { runner: "bun", files: ["bunfig.toml"], languages: ["js"] },
131:   { runner: "vitest", files: ["ts", "mts", "cts", "js", "mjs", "cjs"].map((ext) => `vitest.config.${ext}`), languages: ["js"] },
132:   { runner: "jest", files: ["ts", "mts", "cts", "js", "mjs", "cjs", "json"].map((ext) => `jest.config.${ext}`), languages: ["js"] },
133:   { runner: "pytest", files: ["pytest.ini", "conftest.py", "pyproject.toml", "setup.cfg", "tox.ini"], languages: ["py"] },
134:   { runner: "go", files: ["go.mod"], languages: ["go"] },
135: ]
136: 
137: /** The nearest directory, from the test file up to the snapshot root, whose config names runners for its language. */
138: export async function detect(file: string, root: string) {
139:   const language = file.endsWith(".py") ? "py" : file.endsWith(".go") ? "go" : "js"
140:   const markers = MARKERS.filter((marker) => marker.languages.includes(language))
141:   const search = async (dir: string): Promise<{ dir: string; runners: TestRunner[] } | undefined> => {
142:     const names = new Set(await readdir(dir).catch(() => []))
143:     const pkg = names.has("package.json") ? await Bun.file(path.join(dir, "package.json")).json().catch(() => undefined) : undefined
144:     const runners = markers.filter((marker) => marker.files.some((name) => names.has(name)) ||
145:       (marker.runner === "jest" && pkg && typeof pkg === "object" && "jest" in pkg)).map((marker) => marker.runner)
146:     if (runners.length) return { dir, runners }
147:     if (dir === root || !FSUtil.contains(root, dir)) return undefined
148:     return search(path.dirname(dir))
149:   }
150:   const start = await lstat(file).then((stat) => (stat.isDirectory() ? file : path.dirname(file)))
151:   return search(start)
152: }
```

### RB3-04 — Typecheck: comando, tsconfig, diagnósticos, causas e caminhos

Vínculo: corpo R9; archive E33.

A apresentação de no máximo 200 diagnósticos está em run:40,67–69,85 (RB3-01). Aqui ficam a seleção e os parsers; menção a oracle no comentário da fonte refere-se ao compilador TypeScript, não a material reservado da missão.

**RB-S012 — `packages/core/src/research-toolkit/probe/typecheck.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ce72fc2597ac4a25486bc96c88411a3a7cbf9269` · SHA-256 `929d76e274a17b9eae1f25eab1349fe72f625805c9457110c25f13c618e91cb9` · 6837 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/probe/typecheck.ts`; archive: E33.

Linhas 18–26.

```text
18: export const UNUSED = ["--noUnusedLocals", "--noUnusedParameters"]
19: 
20: export function argv(input: { readonly node: string; readonly tsc: string; readonly project: string; readonly heapMiB: number; readonly unused?: boolean }) {
21:   return [input.node, `--max-old-space-size=${input.heapMiB}`, input.tsc, "-p", input.project, "--noEmit", "--pretty", "false",
22:     ...(input.unused ? UNUSED : [])]
23: }
24: 
25: /** verify-in-project.ts `normErr`: the same error reads identically wherever it sits. */
26: export const signature = (item: Diagnostic) => `error ${item.code}: ${item.message}`
```

Linhas 32–42.

```text
32: export function missing(diagnostics: ReadonlyArray<Diagnostic>) {
33:   return [...new Set(diagnostics.flatMap((item) => {
34:     const name = ["TS2304", "TS2552", "TS2593"].includes(item.code) ? /Cannot find name '([^']+)'/.exec(item.message)?.[1]
35:       : item.code === "TS2339" ? /on type '([^']+)'/.exec(item.message)?.[1]
36:       : item.code === "TS18004" ? /shorthand property '([^']+)'/.exec(item.message)?.[1]
37:       : undefined
38:     return name ? [name] : []
39:   }))]
40: }
41: 
42: const TEST_GLOBALS = new Set(["describe", "it", "test", "expect", "beforeEach", "afterEach", "vi", "jest"])
```

Linhas 48–67.

```text
48: export function causes(diagnostics: ReadonlyArray<Diagnostic>) {
49:   const codes = new Set(diagnostics.map((item) => item.code))
50:   const names = missing(diagnostics)
51:   const assigned = [...new Set(diagnostics.flatMap((item) => item.code === "TS2632" ? [/Cannot assign to '([^']+)'/.exec(item.message)?.[1] ?? ""] : []))].filter(Boolean)
52:   const modules = [...new Set(diagnostics.flatMap((item) => ["TS2307", "TS2792"].includes(item.code) ? [/module '([^']+)'/.exec(item.message)?.[1] ?? ""] : []))].filter(Boolean)
53:   const reasons = [
54:     codes.has("TS2593") || names.some((name) => TEST_GLOBALS.has(name)) ? "cause: test-runner globals (describe/it/expect) have no types in this project" : "",
55:     codes.has("TS2591") ? "cause: a Node global (e.g. process) has no types in scope; the project lacks @types/node there" : "",
56:     assigned.length ? `cause: assignment to an imported binding (${assigned.join(", ")}); ES modules forbid it` : "",
57:     modules.length ? `cause: unresolved modules: ${modules.join(", ")}` : "",
58:     names.length ? `cause: names not found: ${names.join(", ")}` : "",
59:   ].filter(Boolean)
60:   const groups = diagnostics.reduce((map, item) => {
61:     const key = signature(item)
62:     map.set(key, { first: map.get(key)?.first ?? item, count: (map.get(key)?.count ?? 0) + 1 })
63:     return map
64:   }, new Map<string, { first: Diagnostic; count: number }>())
65:   return [...reasons, ...[...groups.entries()].map(([key, group]) =>
66:     `${group.count > 1 ? `${group.count}x ` : ""}${key.split("\n")[0]} (first at ${group.first.path || "<config>"}:${group.first.line}:${group.first.column})`)]
67: }
```

Linhas 73–118.

```text
73: export const project = Effect.fn("ProbeTypecheck.project")(function* (file: string, root: string) {
74:   if (file.endsWith(".json")) return file
75:   const stat = yield* Effect.promise(() => lstat(file))
76:   if (stat.isDirectory()) return file
77:   return yield* Effect.promise(() => nearest(path.dirname(file), root))
78: })
79: 
80: async function nearest(start: string, root: string): Promise<string | undefined> {
81:   if (!FSUtil.contains(root, start)) return undefined
82:   if (await Bun.file(path.join(start, "tsconfig.json")).exists()) return path.join(start, "tsconfig.json")
83:   if (start === root) return undefined
84:   return nearest(path.dirname(start), root)
85: }
86: 
87: const LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/
88: const GLOBAL = /^error (TS\d+): (.*)$/
89: 
90: /**
91:  * Diagnostics from tsc's plain output. Paths resolve against `cwd` and come back relative to the original worktree;
92:  * indented lines continue the previous message. A diagnostic with no file (config errors) has line and column 0.
93:  */
94: export function parse(output: string, cwd: string, snapshot: Pick<ProbeSnapshot.Snapshot, "root" | "origin">) {
95:   // Appends in place: a broken project can print thousands of diagnostics.
96:   return output.split(/\r?\n/).reduce<Diagnostic[]>((list, line) => {
97:     const located = LINE.exec(line)
98:     const global = located ? undefined : GLOBAL.exec(line)
99:     const last = list.at(-1)
100:     if (located)
101:       list.push({ path: original(located[1], cwd, snapshot), line: Number(located[2]), column: Number(located[3]), code: located[4], message: located[5] })
102:     if (global) list.push({ path: "", line: 0, column: 0, code: global[1], message: global[2] })
103:     if (!located && !global && last && /^\s+\S/.test(line)) list[list.length - 1] = { ...last, message: `${last.message}\n${line.trim()}` }
104:     return list
105:   }, [])
106: }
107: 
108: /** Whether a stdout line is one parse() turned into a diagnostic (or its continuation), so the tail can leave it out. */
109: export function structured(line: string) {
110:   return LINE.test(line) || GLOBAL.test(line) || /^\s+\S/.test(line)
111: }
112: 
113: /** A snapshot path, or one tsc printed through a dependency link, as the original worktree spells it. */
114: export function original(file: string, cwd: string, snapshot: Pick<ProbeSnapshot.Snapshot, "root" | "origin">) {
115:   const absolute = path.resolve(cwd, file)
116:   const base = FSUtil.contains(snapshot.root, absolute) ? snapshot.root : FSUtil.contains(snapshot.origin, absolute) ? snapshot.origin : undefined
117:   return base ? path.relative(base, absolute).split(path.sep).join("/") : absolute
118: }
```

### RB3-05 — ResearchProcess: env, hard cap, cauda, overflow, memória e timeout

Vínculo: corpo R9; archive E30.

O ramo drain rejeita o chunk que ultrapassaria max antes de push; bytes conta os chunks aceitos. A finalização scoped e MemoryCap são delegações visíveis, sem alegação de eficácia externa.

**RB-S013 — `packages/core/src/research-toolkit/process.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `04f6a92d3a145da49f9934983ea20fc0b2266490` · SHA-256 `4d040e1cd277492ec22ef7dc3b06fb77a4bfd73064c45ee1fe894992a8948f77` · 6087 bytes.

Arquivo integral: `sources/packages/core/src/research-toolkit/process.ts`; archive: E30.

Linhas 12–21.

```text
12: // CI=true and ORCHESTRA_LOCAL_TESTS=1 switch off script/test-guard.ts; the host never hands a child either (J4.8).
13: const STRIPPED = ["NODE_OPTIONS", "NODE_PATH", "ORCHESTRA_LOCAL_TESTS", "CI"]
14: 
15: export function environment(input: NodeJS.ProcessEnv = process.env): Record<string, string> {
16:   return {
17:     ...Object.fromEntries(Object.entries(ToolSafetySandbox.environment(input)).filter(
18:       (entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith("GIT_") && !STRIPPED.includes(entry[0]))),
19:     GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
20:   }
21: }
```

Linhas 23–37.

```text
23: export type Captured = { readonly data: Buffer; readonly bytes: number; readonly truncated: boolean }
24: 
25: export type Outcome = {
26:   readonly exitCode: number | null
27:   readonly durationMs: number
28:   readonly timedOut: boolean
29:   /** A stream passed maxBytes; the process was stopped there. */
30:   readonly overflow: boolean
31:   /** The tree went over maxRssBytes and omni killed it. */
32:   readonly memoryExceeded: boolean
33:   /** The process could not be started or supervised. */
34:   readonly failure?: string
35:   readonly stdout: Captured
36:   readonly stderr: Captured
37: }
```

Linhas 46–126.

```text
46: /** Runs one fixed command. Each stream keeps its last `tailBytes` (default all of `maxBytes`); past `maxBytes` the run stops. */
47: export const run = Effect.fn("ResearchProcess.run")(function* (input: {
48:   readonly command: string
49:   readonly args: ReadonlyArray<string>
50:   readonly cwd: string
51:   readonly env: Record<string, string>
52:   readonly timeoutMs: number
53:   readonly maxBytes: number
54:   readonly tailBytes?: number
55:   /** Resident bytes of the whole tree; omni kills it above (J4.7). */
56:   readonly maxRssBytes?: number
57: }) {
58:   const processes = yield* AppProcess.Service
59:   const started = Date.now()
60:   const stdout = sink(input.tailBytes ?? input.maxBytes)
61:   const stderr = sink(input.tailBytes ?? input.maxBytes)
62:   const settled = yield* Effect.scoped(Effect.gen(function* () {
63:     const handle = yield* processes.spawn(ChildProcess.make(input.command, [...input.args], {
64:       cwd: input.cwd, env: input.env, extendEnv: false, stdin: "ignore",
65:     })).pipe(Effect.provideService(OmniSpawner.MemoryCap, input.maxRssBytes))
66:     const all = yield* Effect.all([drain(handle.stdout, stdout, input.maxBytes), drain(handle.stderr, stderr, input.maxBytes), handle.exitCode],
67:       { concurrency: "unbounded" })
68:     return { exitCode: Number(all[2]) as number | null, timedOut: false, overflow: false, memoryExceeded: false, failure: undefined as string | undefined }
69:   })).pipe(
70:     // Closing the scope stops the child; omni stops its whole tree.
71:     Effect.timeoutOption(Duration.millis(input.timeoutMs)),
72:     Effect.map(Option.getOrElse(() => ({ exitCode: null, timedOut: true, overflow: false, memoryExceeded: false, failure: undefined }))),
73:     Effect.catch((error) => Effect.succeed(error instanceof Overflow
74:       ? { exitCode: null, timedOut: false, overflow: true, memoryExceeded: false, failure: undefined }
75:       : memory(error)
76:         ? { exitCode: null, timedOut: false, overflow: false, memoryExceeded: true, failure: undefined }
77:         : { exitCode: null, timedOut: false, overflow: false, memoryExceeded: false, failure: error.message })),
78:   )
79:   return { ...settled, durationMs: Date.now() - started, stdout: stdout.captured(), stderr: stderr.captured() } satisfies Outcome
80: })
81: 
82: /** A host-side git read with the sanitized environment; non-zero exit fails with its stderr. */
83: export const git = Effect.fn("ResearchProcess.git")(function* (cwd: string, args: ReadonlyArray<string>) {
84:   const outcome = yield* run({ command: "git", args: ["-C", cwd, ...args], cwd, env: environment(), timeoutMs: 120_000, maxBytes: 256 * 1024 * 1024 })
85:   if (outcome.exitCode === 0) return outcome.stdout.data
86:   return yield* new Failed({
87:     command: `git ${args.join(" ")}`,
88:     detail: outcome.failure ?? (outcome.timedOut ? "timed out" : outcome.overflow ? "output cap" : outcome.stderr.data.toString("utf8").trim()),
89:   })
90: })
91: 
92: // Omni fails the exit code with a PlatformError whose cause chain holds MemoryExceeded.
93: function memory(error: unknown): boolean {
94:   if (error instanceof OmniSpawner.MemoryExceeded) return true
95:   return error instanceof Error && error.cause !== undefined && memory(error.cause)
96: }
97: 
98: function sink(keep: number) {
99:   const state = { chunks: [] as Uint8Array[], kept: 0, bytes: 0 }
100:   return {
101:     push(chunk: Uint8Array) {
102:       state.bytes += chunk.length
103:       state.chunks.push(chunk)
104:       state.kept += chunk.length
105:       // Trim only when twice over, so a chatty child does not pay a copy per chunk.
106:       if (state.kept <= keep * 2) return
107:       const tail = Buffer.concat(state.chunks).subarray(-keep)
108:       state.chunks = [tail]
109:       state.kept = tail.length
110:     },
111:     get bytes() {
112:       return state.bytes
113:     },
114:     captured(): Captured {
115:       const data = Buffer.concat(state.chunks).subarray(-keep)
116:       return { data, bytes: state.bytes, truncated: state.bytes > data.length }
117:     },
118:   }
119: }
120: 
121: const drain = <E>(stream: Stream.Stream<Uint8Array, E>, into: ReturnType<typeof sink>, max: number) =>
122:   Stream.runForEach(stream, (chunk) => {
123:     if (into.bytes + chunk.length > max) return Effect.fail(new Overflow())
124:     into.push(chunk)
125:     return Effect.void
126:   })
```

## RE-B4

### RB4-01 — Binding: Task, author Session, worktree e duas representações de tool part

Vínculo: corpo R10; archive E34.

**RB-S014 — `packages/core/src/research/binding.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `5f5c7f92d7ade9c902d54c0e9bce713871952e78` · SHA-256 `b64e476309f22af194c1459389814939887c117819be494adaac0b2fa73d1701` · 7351 bytes.

Arquivo integral: `sources/packages/core/src/research/binding.ts`; archive: E34.

Linhas 21–104.

```text
21: /** Human reads validate retained native placement; they do not issue a tool invocation. */
22: export const resolve = Effect.fn("ResearchBinding.resolve")(function* (sessionID: SessionID, projectID: Project.ID) {
23:   const database = yield* Database.Service
24:   const session = yield* database.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
25:   if (!session || session.project_id !== projectID || session.agent !== "jimmy")
26:     return yield* new Research.Error({ code: "not_found", message: "Research binding not found" })
27:   const rows = yield* database.db.select().from(EventTable).where(and(
28:     eq(EventTable.aggregate_id, sessionID),
29:     eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
30:   )).all().pipe(Effect.orDie)
31:   if (rows.length !== 1)
32:     return yield* new Research.Error({ code: "binding_missing", message: "Retained task binding is missing or ambiguous" })
33:   const bound = yield* Schema.decodeUnknownEffect(MaestroEvent.Task.Bound.data)(rows[0].data).pipe(
34:     Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid retained task binding" })),
35:   )
36:   const identities = yield* database.db.select({ id: EventTable.id }).from(EventTable).where(and(
37:     eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)),
38:     sql`json_extract(${EventTable.data}, '$.projectID') = ${projectID}`,
39:     sql`json_extract(${EventTable.data}, '$.taskId') = ${bound.taskId}`,
40:   )).all().pipe(Effect.orDie)
41:   if (identities.length !== 1)
42:     return yield* new Research.Error({ code: "binding_mismatch", message: "Retained logical task identity is ambiguous" })
43:   const authorityID = yield* Schema.decodeUnknownEffect(SessionID)(bound.authoritySessionID).pipe(
44:     Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid retained authority Session" })),
45:   )
46:   const authority = yield* database.db.select().from(SessionTable).where(
47:     eq(SessionTable.id, authorityID),
48:   ).get().pipe(Effect.orDie)
49:   if (bound.memberID !== "jimmy" || bound.projectID !== projectID || bound.executionSessionID !== sessionID ||
50:     !authority || authority.project_id !== projectID ||
51:     (session.parent_id ?? session.id) !== authority.id)
52:     return yield* new Research.Error({ code: "binding_mismatch", message: "Retained task placement does not match" })
53:   const project = yield* database.db.select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get().pipe(Effect.orDie)
54:   const directories = yield* database.db.select().from(ProjectDirectoryTable).where(eq(ProjectDirectoryTable.project_id, projectID)).all().pipe(Effect.orDie)
55:   const roots = [...directories.filter((entry) => entry.type === "git_worktree" || entry.type === "main").map((entry) => entry.directory),
56:     ...(project && project.worktree !== "/" ? [project.worktree] : [])]
57:     .filter((root) => session.directory === root || session.directory.startsWith(root + path.sep))
58:     .sort((a, b) => b.length - a.length)
59:   return yield* Schema.decodeUnknownEffect(Research.Binding)({
60:     projectID, memberID: "jimmy", taskId: bound.taskId, executionSessionID: sessionID,
61:     authoritySessionID: authority.id, directory: session.directory, worktree: roots[0] ?? session.directory,
62:   }).pipe(Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid research placement" })))
63: })
64: 
65: export const require = Effect.fn("ResearchBinding.require")(function* (binding: Research.Binding, context: Tool.Context) {
66:   const frame = yield* CapabilityInvocation.require(context, {
67:     projectID: binding.projectID, location: { directory: binding.directory },
68:   }).pipe(Effect.mapError((error) => new Research.Error({
69:     code: error.code === "invocation_binding_missing" ? "binding_missing" : "binding_mismatch",
70:     message: "Research invocation is not bound",
71:   })))
72:   if (frame.owner.agentID !== "jimmy" || context.agent !== "jimmy" || context.sessionID !== binding.executionSessionID)
73:     return yield* new Research.Error({ code: "binding_mismatch", message: "Research invocation owner does not match" })
74:   const retained = yield* resolve(binding.executionSessionID, binding.projectID)
75:   if (!isDeepStrictEqual(retained, binding))
76:     return yield* new Research.Error({ code: "binding_mismatch", message: "Research binding does not match retained placement" })
77:   const database = yield* Database.Service
78:   // Both native runtimes share Session placement. Legacy parts and assistant message content remain distinct projections.
79:   const messages = yield* database.db.select().from(MessageTable).where(and(
80:     sql`${MessageTable.id} = ${context.assistantMessageID}`, eq(MessageTable.session_id, context.sessionID),
81:   )).all().pipe(Effect.orDie)
82:   if (messages.length) {
83:     const message = messages[0].data
84:     const parts = yield* database.db.select().from(PartTable).where(and(
85:       sql`${PartTable.message_id} = ${context.assistantMessageID}`, eq(PartTable.session_id, context.sessionID),
86:     )).all().pipe(Effect.orDie)
87:     if (message.role === "assistant" && message.agent === "jimmy" && parts.some((part) => {
88:       const tool = Schema.decodeUnknownOption(SessionLegacyTranscript.ToolPart)({ ...part.data, id: part.id, messageID: part.message_id, sessionID: part.session_id })
89:       return tool._tag === "Some" && tool.value.callID === context.toolCallID && tool.value.tool === frame.rootToolName
90:     }))
91:       return retained
92:     return yield* new Research.Error({ code: "binding_mismatch", message: "Native assistant/tool part does not match" })
93:   }
94:   const row = yield* database.db.select().from(SessionMessageTable).where(and(
95:     eq(SessionMessageTable.id, context.assistantMessageID), eq(SessionMessageTable.session_id, context.sessionID),
96:   )).get().pipe(Effect.orDie)
97:   const assistant = row ? yield* Schema.decodeUnknownEffect(SessionMessage.Message)({
98:     ...row.data, id: row.id, type: row.type,
99:   }).pipe(Effect.mapError(() => new Research.Error({ code: "binding_mismatch", message: "Invalid native assistant" }))) : undefined
100:   if (assistant?.type === "assistant" && assistant.agent === "jimmy" && assistant.content.some((part) =>
101:     part.type === "tool" && part.id === context.toolCallID && part.name === frame.rootToolName))
102:     return retained
103:   return yield* new Research.Error({ code: "binding_missing", message: "Native assistant/tool part is missing" })
104: })
```

### RB4-02 — Allowance: bind repetido, compatibilidade, charge, reconciliação e interrupção

Vínculo: corpo R10; archive E35.

**RB-S015 — `packages/core/src/research/allowance.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `2a2b412f57e8b34016ff5bdbfe6f638e9616cf80` · SHA-256 `177b564304a9d79e9144da70a6c97107b604d40dde16ae8185467d801fd3c3eb` · 11674 bytes.

Arquivo integral: `sources/packages/core/src/research/allowance.ts`; archive: E35.

Linhas 41–179.

```text
41:     const read = (id: EventV2.ID) => database.db.select().from(EventTable).where(eq(EventTable.id, id)).get()
42:     const bound = Effect.fn("ResearchAllowance.bound")(function* (allowance: Research.Allowance) {
43:       const row = yield* read(eventID("bound", allowance.binding.executionSessionID, allowance.dispatchCallID))
44:       if (!row) return yield* new Research.Error({ code: "binding_missing", message: "Dispatch allowance is not admitted" })
45:       if (row.type !== EventV2.versionedType(ResearchEvent.AllowanceBound.type, 1) ||
46:         row.aggregate_id !== allowance.binding.executionSessionID)
47:         return yield* new Research.Error({ code: "binding_mismatch", message: "Allowance ledger identity differs" })
48:       const stored = yield* Schema.decodeUnknownEffect(ResearchEvent.AllowanceBound.data)(row.data)
49:       if (stored.sessionID !== allowance.binding.executionSessionID || !isDeepStrictEqual(stored.allowance, allowance))
50:         return yield* new Research.Error({ code: "binding_mismatch", message: "Dispatch allowance differs from admitted binding or limits" })
51:     })
52: 
53:     const bind: Interface["bind"] = Effect.fn("ResearchAllowance.bind")((binding, dispatchCallID, tier = "quick") =>
54:       Effect.gen(function* () {
55:         if (!Object.hasOwn(Research.Tiers, tier))
56:           return yield* new Research.Error({ code: "unsupported", message: `Unknown research effort tier: ${String(tier)}` })
57:         const limits = Research.Tiers[tier]
58:         const allowance = yield* Schema.decodeUnknownEffect(Research.Allowance)({
59:           binding, dispatchCallID, tier,
60:           providerLimit: limits.providerCalls,
61:           toolLimit: limits.toolCalls,
62:           byteLimit: limits.capturedBytes,
63:           deadlineSeconds: limits.deadlineSeconds,
64:           probeSecondsLimit: Research.ProbeSeconds[tier],
65:         })
66:         const id = eventID("bound", binding.executionSessionID, dispatchCallID)
67:         const row = yield* read(id)
68:         if (row) {
69:           // A dispatch admitted before probe seconds existed keeps the limit its stored row decodes to.
70:           const stored = yield* Schema.decodeUnknownEffect(ResearchEvent.AllowanceBound.data)(row.data)
71:           const admitted = typeof row.data.allowance === "object" && row.data.allowance !== null &&
72:             !("probeSecondsLimit" in row.data.allowance) ? { ...allowance, probeSecondsLimit: stored.allowance.probeSecondsLimit } : allowance
73:           yield* bound(admitted)
74:           return admitted
75:         }
76:         yield* events.publish(ResearchEvent.AllowanceBound, { sessionID: binding.executionSessionID, allowance }, {
77:           id, persist: true,
78:         }).pipe(Effect.catchCause((cause) => Effect.gen(function* () {
79:           // Only the committed native row can reconcile a competing insert or lost publication response.
80:           if (!(yield* read(id))) return yield* Effect.failCause(cause)
81:           yield* bound(allowance)
82:         })))
83:         return allowance
84:       }).pipe(researchFailure),
85:     )
86: 
87:     const charged = Effect.fn("ResearchAllowance.charged")(function* (
88:       allowance: Research.Allowance,
89:       operation: string,
90:     ) {
91:       const row = yield* read(eventID("charged", allowance.binding.executionSessionID, allowance.dispatchCallID, operation))
92:       if (!row) return undefined
93:       if (row.type !== EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1) ||
94:         row.aggregate_id !== allowance.binding.executionSessionID)
95:         return yield* new Research.Error({ code: "conflict", message: "Charge ledger identity differs" })
96:       const stored = yield* Schema.decodeUnknownEffect(ResearchEvent.AllowanceCharged.data)(row.data)
97:       if (stored.sessionID !== allowance.binding.executionSessionID || stored.dispatchCallID !== allowance.dispatchCallID ||
98:         stored.operation !== operation)
99:         return yield* new Research.Error({ code: "conflict", message: "Charge operation identity differs" })
100:       return stored
101:     })
102: 
103:     const spent = Effect.fn("ResearchAllowance.spent")(function* (allowance: Research.Allowance, kind: Kind) {
104:       const sessionID = allowance.binding.executionSessionID
105:       const rows = yield* database.db.select({ data: EventTable.data }).from(EventTable).where(and(
106:         eq(EventTable.aggregate_id, sessionID),
107:         eq(EventTable.type, EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1)),
108:       )).all()
109:       const ledger = yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(ResearchEvent.AllowanceCharged.data)(row.data))
110:       if (ledger.some((entry) => entry.sessionID !== sessionID || !Number.isSafeInteger(entry.amount) ||
111:         (entry.kind !== "bytes" && entry.kind !== "probe" && entry.amount !== 1)))
112:         return yield* new Research.Error({ code: "publication_uncertain", message: "Invalid allowance ledger" })
113:       return ledger.filter((entry) => entry.dispatchCallID === allowance.dispatchCallID && entry.kind === kind)
114:         .reduce((total, entry) => total + entry.amount, 0)
115:     })
116: 
117:     const charge: Interface["charge"] = Effect.fn("ResearchAllowance.charge")((allowance, kind, operation, amount = 1) =>
118:       Effect.gen(function* () {
119:         if (!operation.trim() || operation.length > 256 || !Number.isSafeInteger(amount) || amount < 0 ||
120:           (kind !== "bytes" && kind !== "probe" && amount !== 1))
121:           return yield* new Research.Error({ code: "over_cap", message: "Invalid allowance charge operation or amount" })
122:         const data = yield* Schema.decodeUnknownEffect(ResearchEvent.AllowanceCharged.data)({
123:           sessionID: allowance.binding.executionSessionID, dispatchCallID: allowance.dispatchCallID, operation, kind, amount,
124:         })
125:         yield* bound(allowance)
126:         const retry = yield* charged(allowance, operation)
127:         if (retry) {
128:           if (isDeepStrictEqual(retry, data)) return
129:           return yield* new Research.Error({ code: "conflict", message: "Charge operation was reused with different kind or amount" })
130:         }
131:         yield* events.publish(ResearchEvent.AllowanceCharged, data, {
132:           id: eventID("charged", data.sessionID, data.dispatchCallID, operation),
133:           persist: true,
134:           // EventV2 runs this callback before insertion under BEGIN IMMEDIATE on the same native connection.
135:           // A preflight total outside this transaction would allow concurrent tools to overspend.
136:           commit: () => Effect.gen(function* () {
137:             yield* bound(allowance)
138:             const used = yield* spent(allowance, kind)
139:             const limit = kind === "provider" ? allowance.providerLimit : kind === "tool" ? allowance.toolLimit
140:               : kind === "probe" ? allowance.probeSecondsLimit : allowance.byteLimit
141:             if (!Number.isSafeInteger(used) || amount > limit - used)
142:               return yield* Effect.die(new Research.Error({ code: "budget_exhausted", message: `Research ${kind} allowance exhausted (${used}/${limit}); retained work remains available` }))
143:           }).pipe(Effect.orDie),
144:         }).pipe(Effect.catchCause((cause) => Effect.gen(function* () {
145:           const stored = yield* charged(allowance, operation)
146:           if (!stored) return yield* Effect.failCause(cause)
147:           if (!isDeepStrictEqual(stored, data))
148:             return yield* new Research.Error({ code: "conflict", message: "Charge operation was reused with different kind or amount" })
149:         })))
150:       }).pipe(researchFailure),
151:     )
152: 
153:     const reconcileBytes: Interface["reconcileBytes"] = Effect.fn("ResearchAllowance.reconcileBytes")((allowance, operation, bytes) =>
154:       Effect.gen(function* () {
155:         yield* bound(allowance)
156:         const reservation = yield* charged(allowance, operation)
157:         if (!reservation || reservation.kind !== "bytes")
158:           return yield* new Research.Error({ code: "binding_missing", message: "Byte reservation is not admitted" })
159:         if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > reservation.amount)
160:           return yield* new Research.Error({ code: "over_cap", message: "Observed bytes exceed reservation or are invalid" })
161:         // The frozen ledger has no credit event. Even a known unused remainder stays charged; uncertain
162:         // publication and repeated reconciliation cannot release bytes or admit a second write for free.
163:       }).pipe(researchFailure),
164:     )
165: 
166:     const used: Interface["used"] = Effect.fn("ResearchAllowance.used")((allowance, kind) =>
167:       Effect.gen(function* () {
168:         yield* bound(allowance)
169:         return yield* spent(allowance, kind)
170:       }).pipe(researchFailure),
171:     )
172: 
173:     return Service.of({
174:       bind,
175:       charge,
176:       reserveBytes: (allowance, operation, bytes) => charge(allowance, "bytes", operation, bytes),
177:       reconcileBytes,
178:       used,
179:     })
```

Linhas 185–197.

```text
185: function eventID(kind: string, ...parts: string[]) {
186:   return EventV2.ID.make(`evt_research_allowance_${kind}_${createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex")}`)
187: }
188: 
189: function researchFailure<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, Research.Error, R> {
190:   return effect.pipe(Effect.catchCause((cause) => {
191:     if (Cause.hasInterrupts(cause)) return Effect.failCause(cause).pipe(Effect.orDie)
192:     const error = cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
193:       : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error)
194:     return Effect.fail(error instanceof Research.Error ? error
195:       : new Research.Error({ code: "publication_uncertain", message: "Native allowance ledger could not be verified or committed" }))
196:   }))
197: }
```

### RB4-03 — Ledger: tipos, hash canônico, operation/eventID, scope, retenção e replay

Vínculo: corpo R10, R11, R12; archive E36.

dispatch/closed/owned são entregues completos em RB6-04, sem repetição neste grupo.

**RB-S016 — `packages/core/src/research/ledger.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` · SHA-256 `67e07368ea820ec0c1cb791d601a10acdfa2e9259605a1bec4f556f6bb121839` · 9660 bytes.

Arquivo integral: `sources/packages/core/src/research/ledger.ts`; archive: E36.

Linhas 15–84.

```text
15: export const Entry = Schema.Union([ResearchEvent.SourceAdmitted, ResearchEvent.RecordCommitted, ResearchEvent.DocumentPublished])
16: export type Entry = typeof Entry.Type
17: const types = [ResearchEvent.SourceAdmitted, ResearchEvent.RecordCommitted, ResearchEvent.DocumentPublished]
18:   .map((definition) => EventV2.versionedType(definition.type, 1))
19: 
20: /** The inquiry's own events (J5.1). They sit beside Entry: corpus readers and artifact staging never see them. */
21: export const Inquiry = Schema.Union([ResearchEvent.InquiryOpened, ResearchEvent.InquiryChecked, ResearchEvent.InquiryClosed])
22: export type Inquiry = typeof Inquiry.Type
23: /** Everything one dispatch's inquiry folds over, in ledger order. */
24: export const Step = Schema.Union([ResearchEvent.SourceAdmitted, ResearchEvent.RecordCommitted, ResearchEvent.AllowanceCharged,
25:   ResearchEvent.InquiryOpened, ResearchEvent.InquiryChecked, ResearchEvent.InquiryClosed])
26: export type Step = typeof Step.Type
27: const bound = EventV2.versionedType(ResearchEvent.AllowanceBound.type, 1)
28: const steps = [ResearchEvent.SourceAdmitted, ResearchEvent.RecordCommitted, ResearchEvent.AllowanceCharged,
29:   ResearchEvent.InquiryOpened, ResearchEvent.InquiryChecked, ResearchEvent.InquiryClosed]
30:   .map((definition) => EventV2.versionedType(definition.type, 1))
31: 
32: /** Canonical JSON ignores object insertion order and absent optional fields, preserving array order. */
33: export function canonical(value: unknown): string {
34:   if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
35:   if (value !== null && typeof value === "object") return `{${Object.entries(value)
36:     .filter((entry) => entry[1] !== undefined).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
37:     .map((entry) => `${JSON.stringify(entry[0])}:${canonical(entry[1])}`).join(",")}}`
38:   return JSON.stringify(value)
39: }
40: 
41: export function digest(value: string | Uint8Array) {
42:   return createHash("sha256").update(value).digest("hex")
43: }
44: 
45: export function operation(context: Tool.Context, action: string) {
46:   return digest(canonical([context.sessionID, context.assistantMessageID, context.toolCallID, action]))
47: }
48: 
49: export function eventID(binding: Research.Binding, key: string) {
50:   return EventV2.ID.make(`evt_research_${digest(canonical([binding.executionSessionID, key]))}`)
51: }
52: 
53: export function cap(value: unknown, limit = Research.Limits.eventBytes) {
54:   if (Buffer.byteLength(typeof value === "string" ? value : canonical(value), "utf8") > limit)
55:     throw new Research.Error({ code: "over_cap", message: "Research UTF-8 byte limit exceeded" })
56: }
57: 
58: export const bounded = (value: unknown, limit = Research.Limits.eventBytes) => Effect.try({
59:   try: () => cap(value, limit), catch: () => new Research.Error({ code: "over_cap", message: "Research UTF-8 byte limit exceeded" }),
60: })
61: 
62: export const entries = Effect.fn("ResearchLedger.entries")(function* (binding: Research.Binding, explicitID?: string, executionOnly = false) {
63:   const database = yield* Database.Service
64:   const rows = yield* database.db.select().from(EventTable).where(and(
65:     inArray(EventTable.type, types),
66:     sql`json_extract(${EventTable.data}, '$.binding.projectID') = ${binding.projectID}`,
67:     executionOnly ? eq(EventTable.aggregate_id, binding.executionSessionID) : undefined,
68:     explicitID === undefined ? eq(EventTable.aggregate_id, binding.executionSessionID) : sql`(
69:       json_extract(${EventTable.data}, '$.record.id') = ${explicitID} OR
70:       json_extract(${EventTable.data}, '$.receipt.ref.id') = ${explicitID} OR
71:       json_extract(${EventTable.data}, '$.receipt.ref.artifact.id') = ${explicitID} OR
72:       json_extract(${EventTable.data}, '$.receipt.artifact.id') = ${explicitID})`,
73:   )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
74:   return yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(Entry)({
75:     id: row.id, type: row.type.slice(0, -2), data: row.data,
76:     durable: { aggregateID: row.aggregate_id, seq: row.seq, version: 1 },
77:   }).pipe(
78:     Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained research event" })),
79:     Effect.flatMap((entry) => entry.data.sessionID !== row.aggregate_id || entry.data.binding.executionSessionID !== row.aggregate_id ||
80:       (entry.type !== "research.record.committed" && !isDeepStrictEqual(entry.data.receipt.binding, entry.data.binding))
81:       ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Research event scope does not match admission" }))
82:       : Effect.succeed(entry)),
83:   ))
84: })
```

Linhas 145–157.

```text
145: export const retained = Effect.fn("ResearchLedger.retained")(function* (binding: Research.Binding) {
146:   const actual = yield* ResearchBinding.resolve(binding.executionSessionID, binding.projectID)
147:   if (!isDeepStrictEqual(actual, binding))
148:     return yield* new Research.Error({ code: "binding_mismatch", message: "Research placement changed" })
149:   return actual
150: })
151: 
152: export function replay(entries: readonly Entry[], operation: string, inputHash: string) {
153:   const found = entries.filter((entry) => entry.data.operation === operation)
154:   if (found.length > 1 || found.some((entry) => entry.data.inputHash !== inputHash))
155:     throw new Research.Error({ code: "conflict", message: "Research operation was reused with different input" })
156:   return found[0]
157: }
```

## RE-B5

### RB5-01 — Artifacts: put, admissão, manifest, verifySource e paginação UTF-8

Vínculo: corpo R11; archive E37.

**RB-S017 — `packages/core/src/research/artifacts.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `7c8bb90f269ad00d3779923dd1d8211e3d4edbd4` · SHA-256 `57e6e7d99c507014c52b887d21dfe766311a1a20a5e3e24837665fed7091d24f` · 16639 bytes.

Arquivo integral: `sources/packages/core/src/research/artifacts.ts`; archive: E37, E38.

Linhas 32–148.

```text
32: const Manifest = Schema.Struct({
33:   binding: Research.Binding, operation: Schema.String, ref: Capability.ArtifactRef,
34:   representation: Research.Representation, digest: Research.Digest, bytes: Schema.Int,
35: })
36: const Cursor = Schema.Struct({
37:   bindingHash: Research.Digest, ref: Capability.ArtifactRef, digest: Research.Digest,
38:   representation: Research.Representation, offset: Schema.Int, size: Schema.Literal(Research.Limits.pageBytes),
39: })
40: 
41: export const layer = Layer.effect(Service, Effect.gen(function* () {
42:   const global = yield* Global.Service
43:   const database = yield* Database.Service
44:   const retained = (binding: Research.Binding) => ResearchLedger.retained(binding).pipe(Effect.provideService(Database.Service, database))
45:   const entries = (binding: Research.Binding, id: string, scope?: "task") => ResearchLedger.entries(binding, id, scope === "task").pipe(Effect.provideService(Database.Service, database))
46: 
47:   const put = Effect.fn("ResearchArtifacts.put")(function* (binding: Research.Binding, input: PutInput, operation: string) {
48:     if ((typeof input.content === "string" ? Buffer.byteLength(input.content, "utf8") : input.content.byteLength) > Research.Limits.sourceBytes)
49:       return yield* new Research.Error({ code: "over_cap", message: "Research artifact exceeds source byte limit" })
50:     const content = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : Buffer.from(input.content)
51:     const representation = yield* Schema.decodeUnknownEffect(Research.Representation)(input.representation).pipe(
52:       Effect.mapError(() => new Research.Error({ code: "unsupported", message: "Unsupported research representation" })),
53:     )
54:     if (!operation || Buffer.byteLength(operation) > 256)
55:       return yield* new Research.Error({ code: "reference_invalid", message: "Invalid host operation" })
56:     yield* retained(binding)
57:     const ref = yield* Schema.decodeUnknownEffect(Capability.ArtifactRef)(input.artifact ?? {
58:       id: `cart_${ResearchLedger.digest(ResearchLedger.canonical([binding, operation])).slice(0, 26)}`, revision: 1,
59:     }).pipe(Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid artifact reference" })))
60:     const manifest = { binding, operation, ref, representation, digest: ResearchLedger.digest(content), bytes: content.byteLength }
61:     return yield* Effect.tryPromise({
62:       try: async () => {
63:         const root = await directory(global.data, binding, true)
64:         const operationPath = path.join(root, `op-${ResearchLedger.digest(operation)}.json`)
65:         const existing = await bytes(operationPath, Research.Limits.eventBytes).catch((error: unknown) => {
66:           if (missing(error)) return undefined
67:           throw error
68:         })
69:         const stored = existing ? Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(existing.toString("utf8")) : undefined
70:         if (stored && ResearchLedger.canonical(stored) !== ResearchLedger.canonical(manifest))
71:           throw new Research.Error({ code: "conflict", message: "Artifact operation was reused with different input or reference" })
72:         // Immutable deterministic body survives a crash before its operation manifest or ledger receipt.
73:         await publish(path.join(root, `${ref.id}-${ref.revision}.body`), content)
74:         await publish(operationPath, Buffer.from(ResearchLedger.canonical(manifest)))
75:         return { ref, digest: manifest.digest, bytes: manifest.bytes }
76:       },
77:       catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "publication_uncertain", message: "Research artifact publication is uncertain" }),
78:     })
79:   })
80: 
81:   const load = Effect.fn("ResearchArtifacts.load")(function* (binding: Research.Binding, artifact: Capability.ArtifactRef, scope?: "task") {
82:     const ref = yield* Schema.decodeUnknownEffect(Capability.ArtifactRef)(artifact).pipe(
83:       Effect.mapError(() => new Research.Error({ code: "not_found", message: "Research artifact not found" })),
84:     )
85:     yield* retained(binding)
86:     const admitted = (yield* entries(binding, ref.id, scope)).filter((entry) => {
87:       if (entry.type === "research.source.admitted") return entry.data.receipt.ref.artifact.revision === ref.revision
88:       if (entry.type === "research.document.published") return entry.data.receipt.artifact.revision === ref.revision
89:       return false
90:     })
91:     const event = admitted[0]
92:     if (admitted.length !== 1 || !event || event.type === "research.record.committed")
93:       return yield* new Research.Error({ code: "not_found", message: "Research artifact not found" })
94:     yield* retained(event.data.binding)
95:     const receipt = event.data.receipt
96:     const representation = event.type === "research.source.admitted" ? event.data.receipt.ref.representation : "markdown"
97:     const digest = event.type === "research.source.admitted" ? event.data.receipt.ref.digest : event.data.receipt.digest
98:     const content = yield* Effect.tryPromise({
99:       try: async () => {
100:         const root = await directory(global.data, event.data.binding, false)
101:         const manifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest))(
102:           (await bytes(path.join(root, `op-${ResearchLedger.digest(event.data.operation)}.json`), Research.Limits.eventBytes)).toString("utf8"),
103:         )
104:         if (manifest.operation !== event.data.operation || manifest.ref.id !== ref.id || manifest.ref.revision !== ref.revision || manifest.digest !== digest ||
105:           manifest.representation !== representation || manifest.bytes !== receipt.bytes ||
106:           ResearchLedger.canonical(manifest.binding) !== ResearchLedger.canonical(event.data.binding))
107:           throw new Error("Manifest differs from admission")
108:         const body = await bytes(path.join(root, `${ref.id}-${ref.revision}.body`), Research.Limits.sourceBytes)
109:         if (body.byteLength !== receipt.bytes || ResearchLedger.digest(body) !== digest) throw new Error("Body differs from admission")
110:         return body
111:       },
112:       catch: () => new Research.Error({ code: "source_unavailable", message: "Admitted research bytes are missing or corrupt" }),
113:     })
114:     return { ref, receipt, representation, digest, content, event }
115:   })
116:   const verifySource = Effect.fn("ResearchArtifacts.verifySource")(function* (binding: Research.Binding, ref: Research.SourceRef) {
117:     const stored = yield* load(binding, ref.artifact)
118:     if (stored.event.type !== "research.source.admitted" || stored.digest !== ref.digest || stored.representation !== ref.representation)
119:       return yield* new Research.Error({ code: "reference_invalid", message: "Source representation does not match its admission" })
120:   })
121:   const read = Effect.fn("ResearchArtifacts.read")(function* (binding: Research.Binding, artifact: Capability.ArtifactRef, cursor?: string, scope?: "task") {
122:     const stored = yield* load(binding, artifact, scope)
123:     const decoded = cursor === undefined ? undefined : Schema.decodeUnknownOption(Schema.fromJsonString(Cursor))(
124:       Buffer.from(cursor, "base64url").toString("utf8"),
125:     )
126:     if (decoded && (Option.isNone(decoded) || decoded.value.bindingHash !== ResearchLedger.digest(ResearchLedger.canonical(binding)) ||
127:       decoded.value.ref.id !== stored.ref.id || decoded.value.ref.revision !== stored.ref.revision || decoded.value.digest !== stored.digest ||
128:       decoded.value.representation !== stored.representation))
129:       return yield* new Research.Error({ code: "reference_invalid", message: "Research artifact cursor does not match" })
130:     const offset = decoded && Option.isSome(decoded) ? decoded.value.offset : 0
131:     if (!Number.isSafeInteger(offset) || offset < 0 || offset > stored.content.byteLength ||
132:       (offset > 0 && (offset === stored.content.byteLength || (stored.content[offset] & 0xc0) === 0x80)))
133:       return yield* new Research.Error({ code: "reference_invalid", message: "Invalid research artifact cursor offset" })
134:     // Validate the whole admitted representation before returning any textual page; binary is never replacement-decoded.
135:     yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(stored.content),
136:       catch: () => new Research.Error({ code: "unsupported", message: "Research artifact is not supported UTF-8 text" }) })
137:     const end = Math.min(offset + Research.Limits.pageBytes, stored.content.byteLength)
138:     const boundary = end === stored.content.byteLength ? end : end - ([0, 1, 2, 3].find((back) => (stored.content[end - back] & 0xc0) !== 0x80) ?? 0)
139:     const next = boundary < stored.content.byteLength ? Buffer.from(ResearchLedger.canonical({
140:       bindingHash: ResearchLedger.digest(ResearchLedger.canonical(binding)), ref: stored.ref, digest: stored.digest, representation: stored.representation,
141:       offset: boundary, size: Research.Limits.pageBytes,
142:     })).toString("base64url") : undefined
143:     return {
144:       ref: stored.ref, representation: stored.representation, text: stored.content.subarray(offset, boundary).toString("utf8"), receipt: stored.receipt,
145:       complete: next === undefined && (stored.event.type !== "research.source.admitted" || stored.event.data.receipt.complete),
146:       ...(next ? { cursor: next } : {}),
147:     }
148:   })
```

### RB5-02 — Artifacts: intent estável, diretórios, bytes e publicação imutável

Vínculo: corpo R11, R12; archive E38.

**RB-S017** — mesma fonte e identidade declaradas acima.

Linhas 162–194.

```text
162:   const prepare = Effect.fn("ResearchArtifacts.prepare")(function* (binding: Research.Binding, raw: ResearchLedger.Entry) {
163:     yield* ResearchLedger.bounded(raw)
164:     const entry = yield* Schema.decodeUnknownEffect(ResearchLedger.Entry)(raw).pipe(
165:       Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid research publication intent" })),
166:     )
167:     if (ResearchLedger.canonical(entry.data.binding) !== ResearchLedger.canonical(binding) || entry.data.sessionID !== binding.executionSessionID)
168:       return yield* new Research.Error({ code: "binding_mismatch", message: "Research intent scope does not match" })
169:     yield* retained(binding)
170:     return yield* Effect.tryPromise({
171:       try: async () => {
172:         const root = await directory(global.data, binding, true)
173:         const filename = path.join(root, `intent-${ResearchLedger.digest(entry.data.operation)}.json`)
174:         const reconcile = async () => {
175:           const saved = Schema.decodeUnknownSync(Schema.fromJsonString(ResearchLedger.Entry))((await bytes(filename, Research.Limits.eventBytes)).toString("utf8"))
176:           if (saved.type !== entry.type || saved.id !== entry.id || saved.data.operation !== entry.data.operation ||
177:             saved.data.inputHash !== entry.data.inputHash || ResearchLedger.canonical(saved.data.binding) !== ResearchLedger.canonical(binding))
178:             throw new Research.Error({ code: "conflict", message: "Research intent was reused with different input" })
179:           return saved
180:         }
181:         const existing = await reconcile().catch((error: unknown) => {
182:           if (missing(error)) return undefined
183:           throw error
184:         })
185:         if (existing) return existing
186:         await publish(filename, Buffer.from(ResearchLedger.canonical(entry))).catch((error: unknown) => {
187:           // Concurrent identical intent may differ only in its host capture/publication timestamp.
188:           if (!(error instanceof Research.Error && error.code === "conflict")) throw error
189:         })
190:         return reconcile()
191:       },
192:       catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "publication_uncertain", message: "Research publication intent is uncertain" }),
193:     })
194:   })
```

Linhas 200–259.

```text
200: async function directory(data: string, binding: Research.Binding, create: boolean) {
201:   const base = await fs.realpath(data)
202:   const components = ["research", ResearchLedger.digest(binding.projectID), ResearchLedger.digest(binding.taskId)]
203:   const root = path.join(base, ...components)
204:   await components.reduce(async (previous, component) => {
205:     const parent = await previous
206:     const next = path.join(parent, component)
207:     if (create) await fs.mkdir(next, { mode: 0o700 }).catch((error: unknown) => {
208:       if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
209:     })
210:     const stat = await fs.lstat(next)
211:     if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe research artifact directory")
212:     return next
213:   }, Promise.resolve(base))
214:   return root
215: }
216: 
217: async function bytes(filename: string, cap: number) {
218:   const metadata = await fs.lstat(filename)
219:   if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > cap) throw new Error("Invalid artifact file")
220:   const file = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
221:   try {
222:     const stat = await file.stat()
223:     if (!stat.isFile() || stat.size > cap) throw new Error("Invalid artifact file")
224:     const buffer = Buffer.alloc(stat.size + 1)
225:     const fill = async (offset: number): Promise<number> => {
226:       if (offset === buffer.byteLength) return offset
227:       const read = await file.read(buffer, offset, buffer.byteLength - offset, offset)
228:       return read.bytesRead === 0 ? offset : fill(offset + read.bytesRead)
229:     }
230:     if (await fill(0) !== stat.size) throw new Error("Artifact changed while reading")
231:     return buffer.subarray(0, stat.size)
232:   } finally {
233:     await file.close()
234:   }
235: }
236: 
237: async function publish(filename: string, content: Buffer) {
238:   const staging = `${filename}.${randomUUID()}.staging`
239:   const file = await fs.open(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
240:   try {
241:     try {
242:       await file.writeFile(content)
243:       await file.sync()
244:     } finally {
245:       await file.close()
246:     }
247:     await fs.link(staging, filename).catch(async (error: unknown) => {
248:       if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
249:       if (!(await bytes(filename, content.byteLength)).equals(content))
250:         throw new Research.Error({ code: "conflict", message: "Immutable research artifact already has different bytes" })
251:     })
252:   } finally {
253:     await fs.unlink(staging)
254:   }
255: }
256: 
257: function missing(error: unknown) {
258:   return error instanceof Error && "code" in error && error.code === "ENOENT"
259: }
```

### RB5-03 — Records.source: todas as páginas; locators, lineStart e erros

Vínculo: corpo R11; archive E39.

A leitura não chama aquisição. O ramo especial de code_locate compara intervalos de linhas dentro de um bloco; não acrescenta uma desambiguação de path ausente no locator.

**RB-S018 — `packages/core/src/research/records.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `17f942640c19e3057ef463252be56ad72a9fa4e7` · SHA-256 `6f38acb52606d54c2b070057b301cfc82cba29f814599a0dee480c110cee558d` · 42199 bytes.

Arquivo integral: `sources/packages/core/src/research/records.ts`; archive: E39, E40, E41, E42.

Linhas 73–115.

```text
73:   const artifacts = yield* ResearchArtifacts.Service
74:   const entries = (binding: Research.Binding, id?: string) => ResearchLedger.entries(binding, id).pipe(Effect.provideService(Database.Service, database))
75:   const retained = (binding: Research.Binding) => ResearchLedger.retained(binding).pipe(Effect.provideService(Database.Service, database))
76:   const require = (binding: Research.Binding, context: Tool.Context) => ResearchBinding.require(binding, context).pipe(Effect.provideService(Database.Service, database))
77: 
78:   const recordRef = Effect.fn("ResearchRecords.recordRef")(function* (binding: Research.Binding, ref: Research.RecordRef) {
79:     const found = (yield* entries(binding, ref.id)).find((entry) => entry.type === "research.record.committed" &&
80:       entry.data.record.id === ref.id && entry.data.record.revision === ref.revision)
81:     if (!found || found.type !== "research.record.committed")
82:       return yield* new Research.Error({ code: "reference_invalid", message: "Research record reference is not admitted" })
83:     yield* retained(found.data.binding)
84:     return found.data.record
85:   })
86: 
87:   const source = Effect.fn("ResearchRecords.source")(function* (binding: Research.Binding, ref: Research.SourceRef) {
88:     const first = yield* artifacts.read(binding, ref.artifact)
89:     if (!("origin" in first.receipt) || first.receipt.ref.digest !== ref.digest || first.representation !== ref.representation)
90:       return yield* new Research.Error({ code: "reference_invalid", message: "Source representation does not match its admission" })
91:     const pages: string[] = [first.text]
92:     // Each continuation is bound to the same immutable artifact and receipt; no live reacquisition.
93:     const drain = (cursor: string): Effect.Effect<void, Research.Error> => artifacts.read(binding, ref.artifact, cursor).pipe(
94:       Effect.flatMap((page) => {
95:         pages.push(page.text)
96:         return page.cursor ? drain(page.cursor) : Effect.void
97:       }),
98:     )
99:     if (first.cursor) yield* drain(first.cursor)
100:     return { text: pages.join(""), receipt: first.receipt }
101:   })
102: 
103:   const evidence = Effect.fn("ResearchRecords.evidence")(function* (binding: Research.Binding, ref: Research.EvidenceRef) {
104:     const content = yield* source(binding, ref.source)
105:     // A code_locate snapshot holds ranges of many worktree files: original lines resolve inside one of its ranges.
106:     const snapshot = ref.locator.kind === "lines" && ref.locator.basis === "original" && "origin" in content.receipt &&
107:       content.receipt.origin.kind === "file" && content.receipt.origin.uri === binding.worktree ? Locate.blocks(content.text) : undefined
108:     if (snapshot && ref.locator.kind === "lines") {
109:       const lines = ref.locator
110:       if (snapshot.some((block) => block.start <= lines.start && lines.end <= block.end && lines.start <= lines.end)) return
111:       return yield* new Research.Error({ code: "reference_invalid", message: `Lines ${lines.start}-${lines.end} are not inside one range of this code_locate snapshot` })
112:     }
113:     return yield* Effect.try({ try: () => checkLocator(content.text, ref.source.representation, retainedLocator(ref.locator, content.receipt)),
114:       catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "reference_invalid", message: "Source locator does not match" }) })
115:   })
```

Linhas 513–554.

```text
513: function retainedLocator(locator: Research.Locator, receipt: Research.SourceReceipt | Research.DocumentReceipt): Research.Locator {
514:   if (locator.kind !== "lines" || locator.basis !== "original") return locator
515:   const first = "origin" in receipt ? receipt.observed?.lineStart ?? 1 : 1
516:   if (locator.start < first)
517:     throw new Research.Error({ code: "reference_invalid", message: `Lines ${locator.start}-${locator.end} start before the captured span (line ${first})` })
518:   return { kind: "lines", start: locator.start - first + 1, end: locator.end - first + 1 }
519: }
520: 
521: function checkLocator(text: string, representation: typeof Research.Representation.Type, locator: Research.Locator) {
522:   if (locator.kind === "lines") {
523:     if (locator.start > locator.end || locator.end > text.split(/\r\n|\n|\r/).length)
524:       throw new Research.Error({ code: "reference_invalid", message: "Source line range does not exist" })
525:     return
526:   }
527:   if (locator.kind === "quote") {
528:     // Lookahead includes overlapping matches ("aa" occurs twice in "aaa").
529:     const matches: number[] = []
530:     for (const match of text.matchAll(new RegExp(`(?=${escapeLiteral(locator.exact)})`, "gu"))) {
531:       if ((locator.prefix && !text.slice(Math.max(0, match.index - locator.prefix.length), match.index).endsWith(locator.prefix)) ||
532:         (locator.suffix && !text.slice(match.index + locator.exact.length, match.index + locator.exact.length + locator.suffix.length).startsWith(locator.suffix))) continue
533:       if (matches.length) throw new Research.Error({ code: "locator_ambiguous", message: "Quote matches more than one location" })
534:       matches.push(match.index)
535:     }
536:     if (!matches.length) throw new Research.Error({ code: "reference_invalid", message: "Quote does not match admitted representation" })
537:     return
538:   }
539:   if (representation !== "structured-json") throw new Research.Error({ code: "reference_invalid", message: "JSON locator requires structured-json representation; cite a text source by lines or quote" })
540:   const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
541:   if (parsed._tag === "None") throw new Research.Error({ code: "source_unavailable", message: "Admitted JSON representation cannot be decoded" })
542:   if (locator.pointer !== "" && (!locator.pointer.startsWith("/") || /~(?:[^01]|$)/.test(locator.pointer)))
543:     throw new Research.Error({ code: "reference_invalid", message: "Invalid JSON pointer" })
544:   if (locator.pointer === "") return
545:   locator.pointer.slice(1).split("/").reduce((value: unknown, part) => {
546:     const key = part.replace(/~1/g, "/").replace(/~0/g, "~")
547:     if (value === null || typeof value !== "object" || !Object.hasOwn(value, key) ||
548:       (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)))
549:       throw new Research.Error({ code: "reference_invalid", message: "JSON pointer does not resolve" })
550:     return Reflect.get(value, key)
551:   }, parsed.value)
552: }
553: 
554: function escapeLiteral(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }
```

## RE-B6

### RB6-01 — Record: precondições, evidence/contrary, relations, findingRefs, caps e CAS

Vínculo: corpo R12; archive E40, E42.

RB5-03 contém recordRef/evidence e RB4-03 contém bounded/replay. Aqui estão o caminho de mutação inteiro e as verificações de citações; validam identidade/locators/labels, sem determinar a verdade da proposição.

**RB-S018** — mesma fonte e identidade declaradas acima.

Linhas 117–127.

```text
117:   const mutation = (entry: Exclude<ResearchLedger.Entry, { type: "research.source.admitted" }>): Mutation => {
118:     return {
119:       receipt: { operation: entry.data.operation, binding: entry.data.binding, eventID: entry.id,
120:         ref: entry.type === "research.record.committed" ? { id: entry.data.record.id, revision: entry.data.record.revision } : entry.data.receipt.ref },
121:       ...(entry.type === "research.record.committed" ? { record: entry.data.record } : { document: entry.data.receipt }),
122:     }
123:   }
124:   const replay = (list: readonly ResearchLedger.Entry[], operation: string, hash: string) => Effect.try({
125:     try: () => ResearchLedger.replay(list, operation, hash),
126:     catch: () => new Research.Error({ code: "conflict", message: "Research operation conflicts with admitted input" }),
127:   })
```

Linhas 129–215.

```text
129:   const record = Effect.fn("ResearchRecords.record")(function* (binding: Research.Binding, context: Tool.Context, raw: Research.RecordInput, slot?: string) {
130:     yield* fieldBounds(raw)
131:     yield* ResearchLedger.bounded(raw.action === "document" ? { ...raw, document: { ...raw.document, body: undefined } } : raw)
132:     const input = yield* Schema.decodeUnknownEffect(Schema.toType(Research.RecordInput))(raw).pipe(
133:       Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid research mutation" })),
134:     )
135:     yield* require(binding, context)
136:     const operation = ResearchLedger.operation(context, slot === undefined ? input.action : `${input.action}:${slot}`)
137:     const inputHash = ResearchLedger.digest(ResearchLedger.canonical(input))
138:     const current = yield* entries(binding)
139:     const existing = yield* replay(current, operation, inputHash)
140:     if (existing?.type === "research.source.admitted")
141:       return yield* new Research.Error({ code: "conflict", message: "Operation is not a record mutation" })
142:     if (existing) return mutation(existing)
143:     if (input.action === "finding") yield* Effect.forEach([...input.evidence, ...input.contrary], (ref) => evidence(binding, ref), { discard: true })
144:     if (input.action === "relation") yield* Effect.forEach([input.from, input.to], (ref) => recordRef(binding, ref), { discard: true })
145:     if (input.action === "document") {
146:       yield* Effect.forEach(input.document.findingRefs, (ref) => recordRef(binding, ref).pipe(Effect.flatMap((record) =>
147:         record.kind === "finding" ? Effect.void : Effect.fail(new Research.Error({ code: "reference_invalid", message: "Document finding reference is not a finding" })))), { discard: true })
148:       yield* Effect.forEach(Object.values(input.document.citations), (ref) => evidence(binding, ref), { discard: true })
149:       yield* checkCitations(input.document)
150:     }
151:     const supplied = input.action === "relation" ? undefined : input.id
152:     const base = input.action === "relation" ? undefined : input.baseRevision
153:     if ((supplied === undefined) !== (base === undefined))
154:       return yield* new Research.Error({ code: "conflict", message: "Updates require both an admitted identity and base revision" })
155:     const id = supplied ?? mint(input.action, operation)
156:     const history = current.flatMap((entry) => {
157:       if (entry.type === "research.record.committed" && entry.data.record.id === id) return [entry.data.record.revision]
158:       if (entry.type === "research.document.published" && entry.data.receipt.ref.id === id) return [entry.data.receipt.ref.revision]
159:       return []
160:     })
161:     const latest = Math.max(0, ...history)
162:     if ((base ?? 0) !== latest || (supplied && !latest))
163:       return yield* new Research.Error({ code: "conflict", message: "Research base revision is stale or missing" })
164:     if (supplied && input.action === "finding" && !input.reason)
165:       return yield* new Research.Error({ code: "reference_invalid", message: "Material finding revision requires its reason" })
166:     const revision = latest + 1
167:     const eventID = ResearchLedger.eventID(binding, `${id}:${revision}`)
168:     const shared = { sessionID: binding.executionSessionID, operation, inputHash, binding }
169:     const committed = yield* artifacts.prepare(binding, input.action === "document" ? {
170:       id: eventID, type: "research.document.published", data: { ...shared, receipt: {
171:         binding, ref: { id: Research.DocumentID.make(id), revision },
172:         artifact: { id: Capability.ArtifactID.make(`cart_${ResearchLedger.digest(ResearchLedger.canonical([binding, operation])).slice(0, 26)}`), revision: 1 },
173:         digest: ResearchLedger.digest(input.document.body), bytes: Buffer.byteLength(input.document.body),
174:         title: input.document.title, genre: input.document.genre, findingRefs: input.document.findingRefs,
175:         citations: input.document.citations, publishedAt: Date.now(),
176:       } },
177:     } : {
178:       id: eventID, type: "research.record.committed", data: { ...shared, record: makeRecord(input, id, revision) },
179:     })
180:     if (committed.type === "research.source.admitted")
181:       return yield* new Research.Error({ code: "conflict", message: "Operation is not a record mutation" })
182:     const publish = Effect.gen(function* () {
183:       if (input.action === "document" && committed.type === "research.document.published") {
184:         const stored = yield* artifacts.put(binding, { content: input.document.body, representation: "markdown", artifact: committed.data.receipt.artifact }, operation)
185:         if (stored.digest !== committed.data.receipt.digest) return yield* new Research.Error({ code: "publication_uncertain", message: "Document artifact differs from receipt" })
186:       }
187:       // The native event transaction owns this CAS. Deterministic next-revision event IDs are a second race barrier.
188:       const commit = () => Effect.gen(function* () {
189:         const actual = yield* entries(binding)
190:         const revisions = actual.flatMap((entry) => {
191:           if (entry.type === "research.record.committed" && entry.data.record.id === id) return [entry.data.record.revision]
192:           if (entry.type === "research.document.published" && entry.data.receipt.ref.id === id) return [entry.data.receipt.ref.revision]
193:           return []
194:         })
195:         if (Math.max(0, ...revisions) !== latest)
196:           yield* Effect.die(new Research.Error({ code: "conflict", message: "Research revision changed during publication" }))
197:       }).pipe(Effect.orDie)
198:       if (committed.type === "research.record.committed")
199:         yield* events.publish(ResearchEvent.RecordCommitted, committed.data, { id: eventID, persist: true, commit })
200:       if (committed.type === "research.document.published")
201:         yield* events.publish(ResearchEvent.DocumentPublished, committed.data, { id: eventID, persist: true, commit })
202:       return mutation(committed)
203:     })
204:     return yield* publish.pipe(Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), (cause) => Effect.gen(function* () {
205:       const stored = yield* replay(yield* entries(binding), operation, inputHash)
206:       if (stored?.type === "research.source.admitted")
207:         return yield* new Research.Error({ code: "conflict", message: "Operation is not a record mutation" })
208:       if (stored) return mutation(stored)
209:       const conflict = cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
210:         : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error)
211:       if (conflict instanceof Research.Error) return yield* conflict
212:       const raced = (yield* entries(binding)).some((entry) => entry.id === eventID)
213:       return yield* new Research.Error({ code: raced ? "conflict" : "publication_uncertain", message: raced ? "Research revision conflicts" : "Research event publication is uncertain" })
214:     })))
215:   })
```

Linhas 479–505.

```text
479: function mint(action: Research.RecordInput["action"], operation: string) {
480:   const prefix = { question: "rque_", finding: "rfnd_", relation: "rrel_", document: "rdoc_" }[action]
481:   return prefix + ResearchLedger.digest(operation).slice(0, 26)
482: }
483: 
484: function makeRecord(input: Exclude<Research.RecordInput, { action: "document" }>, id: string, revision: number): Research.Record {
485:   if (input.action === "question") return { kind: "question", id: Research.QuestionID.make(id), revision, question: input.question, selection: input.selection }
486:   if (input.action === "finding") return { kind: "finding", id: Research.FindingID.make(id), revision,
487:     proposition: input.proposition, nature: input.nature, conditions: input.conditions, evidence: input.evidence, contrary: input.contrary,
488:     ...(input.reason ? { reason: input.reason } : {}) }
489:   return { kind: "relation", id: Research.RelationID.make(id), revision, from: input.from, to: input.to, relation: input.relation, reason: input.reason }
490: }
491: 
492: function fieldBounds(value: unknown): Effect.Effect<void, Research.Error> {
493:   return Effect.try({ try: () => {
494:     const walk = (value: unknown, key: string) => {
495:       if (typeof value === "string") {
496:         const max = { body: Research.Limits.documentBytes, question: 8192, proposition: 8192, exact: 8192,
497:           uri: 8192, title: 1024, pointer: 2048, taskId: 256, mediaType: 256, transformation: 256,
498:           specialization: 256, unit: 256, contentHash: 256, revision: 256 }[key] ?? 4096
499:         ResearchLedger.cap(value, max)
500:       }
501:       if (Array.isArray(value)) value.forEach((item) => walk(item, key))
502:       if (value !== null && typeof value === "object") Object.entries(value).forEach((entry) => walk(entry[1], entry[0]))
503:     }
504:     walk(value, "")
505:   }, catch: () => new Research.Error({ code: "over_cap", message: "Research field UTF-8 limit exceeded" }) })
```

Linhas 556–577.

```text
556: const MarkdownToken = Schema.Struct({
557:   type: Schema.String, href: Schema.optional(Schema.String), tokens: Schema.optional(Schema.Array(Schema.Unknown)),
558:   items: Schema.optional(Schema.Array(Schema.Unknown)), header: Schema.optional(Schema.Array(Schema.Unknown)),
559:   rows: Schema.optional(Schema.Array(Schema.Array(Schema.Unknown))),
560: })
561: const checkCitations = Effect.fn("ResearchRecords.checkCitations")(function* (document: Research.DocumentInput) {
562:   const { Lexer } = yield* Effect.tryPromise({ try: () => import("marked"),
563:     catch: () => new Research.Error({ code: "unsupported", message: "Markdown parser is unavailable" }) })
564:   // Research labels are Markdown links with research:<label> destinations. Code and raw HTML are not citations.
565:   const walk = (raw: unknown) => Schema.decodeUnknownSync(Schema.Array(MarkdownToken))(raw).forEach((token) => {
566:     if (token.type === "link" && token.href?.startsWith("research:") && !Object.hasOwn(document.citations, token.href.slice(9)))
567:       throw new Research.Error({ code: "reference_invalid", message: "Document citation label is not admitted" })
568:     if (token.tokens) walk(token.tokens)
569:     if (token.type === "list") token.items?.forEach((item) => walk(Schema.decodeUnknownSync(MarkdownToken)(item).tokens))
570:     if (token.type === "table") {
571:       const cell = Schema.Struct({ tokens: Schema.Array(Schema.Unknown) })
572:       token.header?.forEach((value) => walk(Schema.decodeUnknownSync(cell)(value).tokens))
573:       token.rows?.forEach((row) => row.forEach((value) => walk(Schema.decodeUnknownSync(cell)(value).tokens)))
574:     }
575:   })
576:   yield* Effect.try({ try: () => walk(Lexer.lex(document.body)), catch: () => new Research.Error({ code: "reference_invalid", message: "Document citation label is not admitted" }) })
577: })
```

### RB6-02 — Capture, attempt e beginAcquisition: publicação, retorno e replay sem reacquisição

Vínculo: corpo R11, R12; archive E40, E41.

beginAcquisition é preservada desde require até a publicação e o replay; o pedido pendente ou uma tentativa sem evidência retornada não dispara nova aquisição nesta função.

**RB-S018** — mesma fonte e identidade declaradas acima.

Linhas 18–28.

```text
18: export type CaptureInput = {
19:   readonly origin: Research.SourceReceipt["origin"]
20:   readonly representation: typeof Research.Representation.Type
21:   readonly mediaType: string
22:   readonly content: Uint8Array | string
23:   readonly complete: boolean
24:   readonly derivedFrom?: Research.SourceRef
25:   readonly transformation?: string
26:   readonly atlas?: Research.SourceReceipt["atlas"]
27:   readonly observed?: Research.SourceReceipt["observed"]
28: }
```

Linhas 217–260.

```text
217:   const capture = Effect.fn("ResearchRecords.capture")(function* (binding: Research.Binding, context: Tool.Context, input: CaptureInput) {
218:     if ((typeof input.content === "string" ? Buffer.byteLength(input.content, "utf8") : input.content.byteLength) > Research.Limits.sourceBytes)
219:       return yield* new Research.Error({ code: "over_cap", message: "Research source exceeds source byte limit" })
220:     const content = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : Buffer.from(input.content)
221:     const operation = ResearchLedger.operation(context, `capture:${input.representation}`)
222:     const inputHash = ResearchLedger.digest(ResearchLedger.canonical({ ...input, content: ResearchLedger.digest(content) }))
223:     const receipt = yield* Schema.decodeUnknownEffect(Schema.toType(Research.SourceReceipt))({
224:       binding, origin: input.origin, mediaType: input.mediaType, bytes: content.byteLength,
225:       complete: input.complete, capturedAt: Date.now(),
226:       ref: { artifact: { id: `cart_${ResearchLedger.digest(ResearchLedger.canonical([binding, operation])).slice(0, 26)}`, revision: 1 },
227:         representation: input.representation, digest: ResearchLedger.digest(content) },
228:       ...(input.derivedFrom ? { derivedFrom: input.derivedFrom } : {}),
229:       ...(input.transformation ? { transformation: input.transformation } : {}),
230:       ...(input.atlas ? { atlas: input.atlas } : {}),
231:       ...(input.observed ? { observed: input.observed } : {}),
232:     }).pipe(Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid source capture metadata" })))
233:     yield* fieldBounds(receipt)
234:     const data = { sessionID: binding.executionSessionID, operation, inputHash, binding, receipt }
235:     yield* ResearchLedger.bounded(data)
236:     yield* require(binding, context)
237:     const previous = yield* replay(yield* entries(binding), operation, inputHash)
238:     if (previous) {
239:       if (previous.type !== "research.source.admitted") return yield* new Research.Error({ code: "conflict", message: "Capture operation conflicts" })
240:       // Replay returns the original admission; availability is checked separately on retrieval.
241:       return previous.data.receipt
242:     }
243:     if (Boolean(input.derivedFrom) !== Boolean(input.transformation) || (input.origin.kind === "atlas-own" && !input.atlas))
244:       return yield* new Research.Error({ code: "reference_invalid", message: "Derived and Atlas captures require their provenance" })
245:     // A partial received-byte parent can end inside a UTF-8 scalar. Verify custody, not textual decodability.
246:     if (input.derivedFrom) yield* artifacts.verifySource(binding, input.derivedFrom)
247:     const staged = yield* artifacts.prepare(binding, {
248:       id: ResearchLedger.eventID(binding, `source:${operation}`), type: "research.source.admitted", data,
249:     })
250:     if (staged.type !== "research.source.admitted")
251:       return yield* new Research.Error({ code: "conflict", message: "Source publication intent conflicts" })
252:     yield* artifacts.put(binding, { content, representation: input.representation, artifact: staged.data.receipt.ref.artifact }, operation)
253:     return yield* events.publish(ResearchEvent.SourceAdmitted, staged.data, {
254:       id: staged.id, persist: true,
255:     }).pipe(Effect.map(() => staged.data.receipt), Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), () => Effect.gen(function* () {
256:       const stored = yield* replay(yield* entries(binding), operation, inputHash)
257:       if (stored?.type === "research.source.admitted") return stored.data.receipt
258:       return yield* new Research.Error({ code: "publication_uncertain", message: "Source event publication is uncertain" })
259:     })))
260:   })
```

Linhas 262–332.

```text
262:   const attempt = Effect.fn("ResearchRecords.attempt")(function* (
263:     binding: Research.Binding, context: Tool.Context, input: Pick<Research.AttemptReceipt, "outcome" | "stage" | "reason" | "source" | "returned">,
264:   ) {
265:     yield* require(binding, context)
266:     const operation = ResearchLedger.operation(context, "acquisition-outcome")
267:     const inputHash = ResearchLedger.digest(ResearchLedger.canonical(input))
268:     const id = ResearchLedger.eventID(binding, operation)
269:     const replay = Effect.gen(function* () {
270:       const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
271:       if (!row) return undefined
272:       const entry = yield* Schema.decodeUnknownEffect(ResearchEvent.SourceAttempted.data)(row.data).pipe(
273:         Effect.mapError(() => new Research.Error({ code: "publication_uncertain", message: "Invalid retained acquisition outcome" })),
274:       )
275:       if (row.type !== "research.source.attempted.1" || row.aggregate_id !== binding.executionSessionID ||
276:         entry.inputHash !== inputHash || ResearchLedger.canonical(entry.binding) !== ResearchLedger.canonical(binding))
277:         return yield* new Research.Error({ code: "conflict", message: "Acquisition outcome conflicts with retained operation" })
278:       return entry.receipt
279:     })
280:     const previous = yield* replay
281:     if (previous) return previous
282:     const receipt = yield* Schema.decodeUnknownEffect(Research.AttemptReceipt)({ ...input, binding, operation, attemptedAt: Date.now() }).pipe(
283:       Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid acquisition outcome" })),
284:     )
285:     const data = { sessionID: binding.executionSessionID, operation, inputHash, binding, receipt }
286:     yield* ResearchLedger.bounded(data)
287:     return yield* events.publish(ResearchEvent.SourceAttempted, data, { id, persist: true }).pipe(
288:       Effect.map(() => receipt),
289:       Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), () => replay.pipe(Effect.flatMap((saved) => saved
290:         ? Effect.succeed(saved) : Effect.fail(new Research.Error({ code: "publication_uncertain", message: "Acquisition outcome publication is uncertain" }))))),
291:     )
292:   })
293: 
294:   const beginAcquisition = Effect.fn("ResearchRecords.beginAcquisition")(function* (binding: Research.Binding, context: Tool.Context, requestHash: string) {
295:     yield* require(binding, context)
296:     const operation = ResearchLedger.operation(context, "acquisition-request")
297:     const data = { sessionID: binding.executionSessionID, operation, inputHash: requestHash, binding }
298:     const id = ResearchLedger.eventID(binding, operation)
299:     const existing = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
300:     const replay = Effect.gen(function* () {
301:       const request = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
302:       const saved = request ? yield* Schema.decodeUnknownEffect(ResearchEvent.SourceRequested.data)(request.data).pipe(
303:         Effect.mapError(() => new Research.Error({ code: "publication_uncertain", message: "Retained acquisition request is invalid" })),
304:       ) : undefined
305:       if (!request || !saved || request.type !== "research.source.requested.1" || request.aggregate_id !== binding.executionSessionID ||
306:         ResearchLedger.canonical(saved) !== ResearchLedger.canonical(data))
307:         return yield* new Research.Error({ code: "conflict", message: "Acquisition request conflicts with retained invocation" })
308:       const outcome = yield* database.db.select().from(EventTable).where(eq(EventTable.id,
309:         ResearchLedger.eventID(binding, ResearchLedger.operation(context, "acquisition-outcome")),
310:       )).get().pipe(Effect.orDie)
311:       if (!outcome || outcome.type !== "research.source.attempted.1" || outcome.aggregate_id !== binding.executionSessionID)
312:         return yield* new Research.Error({ code: "publication_uncertain", message: "Prior acquisition has no settled outcome; live reacquisition is forbidden" })
313:       const receipt = yield* Schema.decodeUnknownEffect(ResearchEvent.SourceAttempted.data)(outcome.data).pipe(
314:         Effect.mapError(() => new Research.Error({ code: "publication_uncertain", message: "Retained acquisition outcome is invalid" })),
315:       )
316:       if (ResearchLedger.canonical(receipt.binding) !== ResearchLedger.canonical(binding) ||
317:         ResearchLedger.canonical(receipt.receipt.binding) !== ResearchLedger.canonical(binding))
318:         return yield* new Research.Error({ code: "binding_mismatch", message: "Retained acquisition outcome scope differs" })
319:       if (!receipt.receipt.returned || !receipt.receipt.source)
320:         return yield* new Research.Error({ code: "source_unavailable", message: "Prior acquisition did not return retained evidence; use a new native call for a new attempt" })
321:       return receipt.receipt
322:     })
323:     if (existing) return yield* replay
324:     yield* ResearchLedger.bounded(data)
325:     const input = yield* Schema.decodeUnknownEffect(ResearchEvent.SourceRequested.data)(data).pipe(
326:       Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid native acquisition request" })),
327:     )
328:     return yield* events.publish(ResearchEvent.SourceRequested, input, { id, persist: true }).pipe(
329:       Effect.map(() => undefined),
330:       Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), () => replay),
331:     )
332:   })
```

### RB6-03 — Views: corpus, attempts, source/document, find e records com cursor snapshot

Vínculo: corpo R12; archive E42.

**RB-S018** — mesma fonte e identidade declaradas acima.

Linhas 68–68.

```text
68: const RecordCursor = Schema.Struct({ bindingHash: Research.Digest, offset: Schema.Int, snapshot: Research.Digest, limit: Schema.Int })
```

Linhas 334–428.

```text
334:   const view = Effect.fn("ResearchRecords.view")(function* (binding: Research.Binding, raw: Research.ViewInput): Effect.fn.Return<View, Research.Error> {
335:     const input = yield* Schema.decodeUnknownEffect(Schema.toType(Research.ViewInput))(raw).pipe(
336:       Effect.mapError(() => new Research.Error({ code: "reference_invalid", message: "Invalid research view" })),
337:     )
338:     yield* retained(binding)
339:     if (input.action === "corpus") {
340:       const all = yield* entries(binding)
341:       const corpus: { sources: Research.SourceReceipt[]; records: Research.RecordRef[]; documents: Research.DocumentReceipt[]; complete: boolean; total: number } = {
342:         sources: [], records: [], documents: [], complete: true, total: all.length,
343:       }
344:       all.some((entry) => {
345:         const candidate = { ...corpus,
346:           sources: entry.type === "research.source.admitted" ? [...corpus.sources, entry.data.receipt] : corpus.sources,
347:           records: entry.type === "research.record.committed" ? [...corpus.records, { id: entry.data.record.id, revision: entry.data.record.revision }] : corpus.records,
348:           documents: entry.type === "research.document.published" ? [...corpus.documents, entry.data.receipt] : corpus.documents,
349:         }
350:         if (Buffer.byteLength(ResearchLedger.canonical(candidate), "utf8") > Research.Limits.pageBytes) {
351:           corpus.complete = false
352:           return true
353:         }
354:         Object.assign(corpus, candidate)
355:         return false
356:       })
357:       return corpus
358:     }
359:     if (input.action === "attempts") {
360:       const rows = yield* database.db.select().from(EventTable).where(and(
361:         eq(EventTable.aggregate_id, binding.executionSessionID), eq(EventTable.type, "research.source.attempted.1"),
362:       )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
363:       const snapshot = ResearchLedger.digest(ResearchLedger.canonical(rows.map((row) => row.id)))
364:       const limit = input.limit ?? 20
365:       const decoded = input.cursor ? Schema.decodeUnknownOption(Schema.fromJsonString(RecordCursor))(Buffer.from(input.cursor, "base64url").toString("utf8")) : undefined
366:       if (decoded && (decoded._tag === "None" || decoded.value.bindingHash !== ResearchLedger.digest(ResearchLedger.canonical(binding)) ||
367:         decoded.value.snapshot !== snapshot || decoded.value.limit !== limit || decoded.value.offset < 0 || decoded.value.offset > rows.length))
368:         return yield* new Research.Error({ code: "conflict", message: "Research attempt cursor is stale or mismatched" })
369:       const offset = decoded?._tag === "Some" ? decoded.value.offset : 0
370:       const attempts = yield* Effect.forEach(rows.slice(offset, offset + limit), (row) =>
371:         Schema.decodeUnknownEffect(ResearchEvent.SourceAttempted.data)(row.data).pipe(
372:           Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained acquisition outcome" })),
373:           Effect.flatMap((entry) => entry.sessionID !== binding.executionSessionID || ResearchLedger.canonical(entry.receipt.binding) !== ResearchLedger.canonical(binding)
374:             ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Acquisition outcome scope differs" })) : Effect.succeed(entry.receipt)),
375:         ))
376:       yield* ResearchLedger.bounded(attempts)
377:       const next = offset + attempts.length
378:       return { attempts, complete: next === rows.length, ...(next < rows.length ? { cursor: Buffer.from(ResearchLedger.canonical({
379:         bindingHash: ResearchLedger.digest(ResearchLedger.canonical(binding)), offset: next, snapshot, limit,
380:       })).toString("base64url") } : {}) }
381:     }
382:     if (input.action === "record") return yield* recordRef(binding, input.ref)
383:     if (input.action === "source") {
384:       const page = yield* artifacts.read(binding, input.ref.artifact, input.cursor)
385:       if (!("origin" in page.receipt) || page.receipt.ref.digest !== input.ref.digest || page.representation !== input.ref.representation)
386:         return yield* new Research.Error({ code: "reference_invalid", message: "Source reference differs from admission" })
387:       return page
388:     }
389:     if (input.action === "document") {
390:       const found = (yield* entries(binding, input.ref.id)).find((entry) => entry.type === "research.document.published" &&
391:         entry.data.receipt.ref.id === input.ref.id && entry.data.receipt.ref.revision === input.ref.revision)
392:       if (!found || found.type !== "research.document.published") return yield* new Research.Error({ code: "not_found", message: "Research document not found" })
393:       return yield* artifacts.read(binding, found.data.receipt.artifact, input.cursor)
394:     }
395:     if (input.action === "find") {
396:       const content = yield* source(binding, input.ref)
397:       const matches: { start: number; end: number }[] = []
398:       // Stop consuming the iterator once the bounded result is known to be incomplete.
399:       for (const match of content.text.matchAll(new RegExp(escapeLiteral(input.query), "gu"))) {
400:         matches.push({ start: match.index, end: match.index + input.query.length })
401:         if (matches.length === 101) break
402:       }
403:       return { source: input.ref, matches: matches.slice(0, 100), coordinates: "utf16", complete: matches.length <= 100 && content.receipt.complete }
404:     }
405:     const all = (yield* entries(binding)).filter((entry) => entry.type === "research.record.committed")
406:     const snapshot = ResearchLedger.digest(ResearchLedger.canonical(all.map((entry) => entry.id)))
407:     const limit = input.limit ?? 20
408:     const decoded = input.cursor ? Schema.decodeUnknownOption(Schema.fromJsonString(RecordCursor))(Buffer.from(input.cursor, "base64url").toString("utf8")) : undefined
409:     if (decoded && (decoded._tag === "None" || decoded.value.bindingHash !== ResearchLedger.digest(ResearchLedger.canonical(binding)) ||
410:       decoded.value.snapshot !== snapshot || decoded.value.limit !== limit || decoded.value.offset < 0 || decoded.value.offset > all.length))
411:       return yield* new Research.Error({ code: "conflict", message: "Research record cursor is stale or mismatched" })
412:     const offset = decoded?._tag === "Some" ? decoded.value.offset : 0
413:     const page = all.slice(offset, offset + limit)
414:     const selected: Research.Record[] = []
415:     // Bound the entire structured projection, even when a requested count would exceed the event-sized page.
416:     page.some((entry) => {
417:       if (entry.type !== "research.record.committed") return false
418:       if (Buffer.byteLength(ResearchLedger.canonical([...selected, entry.data.record])) > Research.Limits.eventBytes - 512) return true
419:       selected.push(entry.data.record)
420:       return false
421:     })
422:     const next = offset + selected.length
423:     if (next === offset && next < all.length)
424:       return yield* new Research.Error({ code: "over_cap", message: "Research record cannot fit a bounded page" })
425:     return { records: selected, complete: next === all.length, ...(next < all.length ? { cursor: Buffer.from(ResearchLedger.canonical({
426:       bindingHash: ResearchLedger.digest(ResearchLedger.canonical(binding)), offset: next, snapshot, limit,
427:     })).toString("base64url") } : {}) }
428:   })
```

### RB6-04 — Inquiry, dispatch e closed completos; ordem e filtragem de charges

Vínculo: corpo R12; archive E42, E36.

A ausência de uma precondição opened antes de checked/closed é verificável no caminho integral de inquire e seu commit. closed lê a última AllowanceBound compatível; dispatch filtra as charges de outros dispatches conforme owned.

**RB-S018** — mesma fonte e identidade declaradas acima.

Linhas 49–52.

```text
49: export type InquiryEvent =
50:   | { readonly type: "research.inquiry.opened"; readonly question: Research.RecordRef; readonly subquestions: readonly Research.RecordRef[] }
51:   | { readonly type: "research.inquiry.checked"; readonly check: Research.CheckResult }
52:   | { readonly type: "research.inquiry.closed"; readonly card: Research.CardV2 }
```

Linhas 429–472.

```text
429:   const dispatch = (allowance: Research.Allowance) => ResearchLedger.dispatch(allowance).pipe(Effect.provideService(Database.Service, database))
430: 
431:   const inquire = Effect.fn("ResearchRecords.inquire")(function* (allowance: Research.Allowance, context: Tool.Context, input: InquiryEvent) {
432:     const binding = allowance.binding
433:     yield* ResearchLedger.bounded(input)
434:     yield* require(binding, context)
435:     const operation = ResearchLedger.operation(context, input.type)
436:     const inputHash = ResearchLedger.digest(ResearchLedger.canonical(input))
437:     const stored = (list: readonly ResearchLedger.Step[]) => {
438:       const found = list.flatMap((step) => isInquiry(step) && step.data.operation === operation ? [step] : [])
439:       if (found.some((step) => step.data.inputHash !== inputHash))
440:         throw new Research.Error({ code: "conflict", message: "Inquiry operation was reused with different input" })
441:       return found[0]
442:     }
443:     const replayed = (list: readonly ResearchLedger.Step[]) => Effect.try({ try: () => stored(list),
444:       catch: (error) => error instanceof Research.Error ? error : new Research.Error({ code: "conflict", message: "Inquiry operation conflicts" }) })
445:     const existing = yield* replayed(yield* dispatch(allowance))
446:     if (existing) return existing
447:     const id = ResearchLedger.eventID(binding, `inquiry:${allowance.dispatchCallID}:${operation}`)
448:     const shared = { sessionID: binding.executionSessionID, operation, inputHash, binding }
449:     // The native event transaction owns this check: a dispatch opens and closes its inquiry once, and nothing follows a close.
450:     const commit = () => dispatch(allowance).pipe(Effect.flatMap((list) => {
451:       const inquiries = list.filter(isInquiry)
452:       if (inquiries.some((step) => step.type === "research.inquiry.closed"))
453:         return Effect.die(new Research.Error({ code: "inquiry_state", message: "inquiry closed: this dispatch admits no further inquiry events" }))
454:       if (input.type !== "research.inquiry.checked" && inquiries.some((step) => step.type === input.type))
455:         return Effect.die(new Research.Error({ code: "inquiry_state", message: `${input.type} already happened in this dispatch` }))
456:       return Effect.void
457:     }), Effect.orDie)
458:     const publish: Effect.Effect<unknown, unknown> = input.type === "research.inquiry.opened"
459:       ? events.publish(ResearchEvent.InquiryOpened, { ...shared, question: input.question, subquestions: input.subquestions }, { id, persist: true, commit })
460:       : input.type === "research.inquiry.checked"
461:         ? events.publish(ResearchEvent.InquiryChecked, { ...shared, check: input.check }, { id, persist: true, commit })
462:         : events.publish(ResearchEvent.InquiryClosed, { ...shared, card: input.card }, { id, persist: true, commit })
463:     const outcome = yield* Effect.exit(publish)
464:     const after = yield* replayed(yield* dispatch(allowance))
465:     if (after) return after
466:     if (Exit.isSuccess(outcome)) return yield* new Research.Error({ code: "publication_uncertain", message: "Inquiry event was not retained" })
467:     if (Cause.hasInterrupts(outcome.cause)) return yield* Effect.failCause(outcome.cause).pipe(Effect.orDie)
468:     const reason = outcome.cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
469:       : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error)
470:     return yield* reason instanceof Research.Error ? reason
471:       : new Research.Error({ code: "publication_uncertain", message: "Inquiry event publication is uncertain" })
472:   })
```

Linhas 508–510.

```text
508: function isInquiry(step: ResearchLedger.Step): step is ResearchLedger.Inquiry {
509:   return step.type === "research.inquiry.opened" || step.type === "research.inquiry.checked" || step.type === "research.inquiry.closed"
510: }
```

**RB-S016** — mesma fonte e identidade declaradas acima.

Linhas 90–143.

```text
90: export const dispatch = Effect.fn("ResearchLedger.dispatch")(function* (allowance: Research.Allowance) {
91:   const database = yield* Database.Service
92:   const binding = allowance.binding
93:   const rows = yield* database.db.select().from(EventTable).where(and(
94:     eq(EventTable.aggregate_id, binding.executionSessionID), inArray(EventTable.type, [bound, ...steps]),
95:   )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
96:   const start = rows.findIndex((row) => {
97:     if (row.type !== bound) return false
98:     const data = Schema.decodeUnknownOption(ResearchEvent.AllowanceBound.data)(row.data)
99:     return data._tag === "Some" && isDeepStrictEqual(data.value.allowance, allowance)
100:   })
101:   if (start < 0) return yield* new Research.Error({ code: "binding_missing", message: "Dispatch allowance is not admitted" })
102:   return yield* Effect.forEach(rows.slice(start + 1).filter((row) => row.type !== bound), (row) => Schema.decodeUnknownEffect(Step)({
103:     id: row.id, type: row.type.slice(0, -2), data: row.data,
104:     durable: { aggregateID: row.aggregate_id, seq: row.seq, version: 1 },
105:   }).pipe(
106:     Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained research event" })),
107:     Effect.flatMap((step) => owned(step, allowance) ? Effect.succeed([step])
108:       // Another dispatch's charges share the Session aggregate; anything else out of scope is a corrupt ledger.
109:       : step.type === "research.allowance.charged" && step.data.sessionID === row.aggregate_id ? Effect.succeed([])
110:       : Effect.fail(new Research.Error({ code: "source_unavailable", message: "Research event scope does not match admission" }))),
111:   )).pipe(Effect.map((list) => list.flat()))
112: })
113: 
114: /**
115:  * The card of the binding's latest dispatch, when that dispatch closed its inquiry (J5.13); undefined otherwise. An
116:  * earlier dispatch's card never answers for a resumed one.
117:  */
118: export const closed = Effect.fn("ResearchLedger.closed")(function* (binding: Research.Binding) {
119:   const database = yield* Database.Service
120:   const close = EventV2.versionedType(ResearchEvent.InquiryClosed.type, 1)
121:   const rows = yield* database.db.select().from(EventTable).where(and(
122:     eq(EventTable.aggregate_id, binding.executionSessionID), inArray(EventTable.type, [bound, close]),
123:   )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
124:   const start = rows.findLastIndex((row) => {
125:     if (row.type !== bound) return false
126:     const data = Schema.decodeUnknownOption(ResearchEvent.AllowanceBound.data)(row.data)
127:     return data._tag === "Some" && isDeepStrictEqual(data.value.allowance.binding, binding)
128:   })
129:   const row = start < 0 ? undefined : rows.slice(start + 1).findLast((item) => item.type === close)
130:   if (!row) return undefined
131:   const data = yield* Schema.decodeUnknownEffect(ResearchEvent.InquiryClosed.data)(row.data).pipe(
132:     Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained inquiry card" })))
133:   if (!isDeepStrictEqual(data.binding, binding))
134:     return yield* new Research.Error({ code: "source_unavailable", message: "Inquiry card scope does not match its dispatch" })
135:   return data.card
136: })
137: 
138: function owned(step: Step, allowance: Research.Allowance) {
139:   if (step.data.sessionID !== allowance.binding.executionSessionID) return false
140:   if (step.type === "research.allowance.charged") return step.data.dispatchCallID === allowance.dispatchCallID
141:   if (step.type === "research.source.admitted" && !isDeepStrictEqual(step.data.receipt.binding, allowance.binding)) return false
142:   return isDeepStrictEqual(step.data.binding, allowance.binding)
143: }
```

## RE-B7

### RB7-01 — População única compartilhada com A e declaração seat-tools

Vínculo: corpo R10, R13; archive E43.

A cobertura integral continua na projeção mecânica RA1-P do suplemento A; a referência exata abaixo evita duplicar os 130 paths. Listas de ferramentas não provam registro ou execução.

**RB-S019 — `packages/core/src/research/seat-tools.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `60cbc55506b5e3cd9cd7d937abf532399ec235b5` · SHA-256 `d88373a47e970593f281019269874b0cbe981e09b86d500604eaa4e24b29c36e` · 1258 bytes.

Arquivo integral: `sources/packages/core/src/research/seat-tools.ts`; archive: E43.

Linhas 3–25.

```text
3: // The one declaration of the discovery seat's tools (J1.1). Allow-lists, capture lists and retention lists derive from
4: // it. A new tool enters OWN only in the PR that qualifies it (JD-2).
5: 
6: export const SEAT = "jimmy"
7: 
8: /** Orchestra tools the seat calls on both engines. None duplicates a Claude Code builtin (claude-code/host/mcp.ts). */
9: export const OWN = [
10:   "research_capture", "research_view", "research_record",
11:   "atlas_context", "atlas_memory_recall", "atlas_memory_emit", "inquiry", "code_query", "code_search", "code_locate",
12:   "probe_run",
13: ] as const
14: 
15: /** Orchestra loop ids, besides OWN. */
16: export const LOOP = ["read", "grep", "glob", "websearch", "skill", "context_recall", "context_compact"] as const
17: 
18: /** Native Claude Code tool names granted to the subagent, besides mcp__orchestra__<OWN>. */
19: export const CLAUDE = ["Read", "Grep", "Glob", "WebSearch", "Skill"] as const
20: 
21: /** Outputs retained as evidence. */
22: export const RETAINED = ["read", "grep", "glob", "websearch", "code_locate", "code_query", "code_search", "probe_run", "atlas_context"] as const
23: 
24: /** Claude Code builtins whose output PostToolUse captures. */
25: export const CAPTURED = ["Read", "Grep", "Glob", "WebSearch"] as const
```

**Referência compartilhada verificável:** `review-supplement-a.md`, SHA-256 `900fd149a1182df270ef6f71fce883793dba1a836df2dd2dd67e500c268f4aca`, grupo `RA1-P`, linhas 293–439, bytes [17509, 38167) (offset zero, fim exclusivo). Hash do recorte: `a9cfbf2fbe35f2fdac2631378652a7d75e034b5fc49dea45cf6caa61f06bd835`.

A projeção contém os campos `path/role/need/read_depth/body_sections` das **130** rows de `coverage.jsonl` (SHA-256 `bb06bcef77a2dbeccabc70dd00dc10d70bf22cb338588661d7ecc9f49e01eec9`), preserva número de linha original e guarda no índice A o hash de cada row. Reconciliação mecânica: **130 = 59 backend-toolkit + 71 research = 80 implementation + 41 test_code + 7 runtime_data_or_pin + 1 generated_output + 1 documentation**. A marca de pertinência R0–R7 em A não exclui as 27 rows posteriores: todas as 130 estão presentes. O suplemento B referencia essa mesma população integral.

### RB7-02 — E44: expectativas decisivas de marker, shim e binário ausente

Vínculo: corpo R2, R13; archive E44.

**Contrato de fonte, sem execução.** Asserções abaixo não são resultados desta produção.

**RB-S020 — `packages/core/test/backend-toolkit.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `3eea6205614cc9cea12be23c820e1d53f9b6ffac` · SHA-256 `0c455829b290c1d35b67cd6bc1777918943fa1b7b1d37880c0a978075af71fa0` · 17079 bytes.

Arquivo integral: `sources/packages/core/test/backend-toolkit.test.ts`; archive: E44.

Linhas 161–174.

```text
161: it.live("complete caches need a host shim and an executable; prefetch repairs the missing shim", () =>
162:   Effect.gen(function* () {
163:     const f = yield* fixture
164:     const scoped = within(f.root, f.manifest())
165:     const result = yield* BackendToolkit.ensure("sqlc").pipe(scoped)
166:     yield* Effect.promise(() => rm(path.join(f.root, "bin", file("sqlc"))))
167:     expect(yield* BackendToolkit.status("sqlc").pipe(scoped)).toMatchObject([{ status: "absent" }])
168:     expect(yield* BackendToolkit.prefetch(["sqlc"]).pipe(scoped)).toMatchObject([{ status: "ready", executable: result.executable }])
169:     yield* Effect.promise(() => rm(result.executable))
170:     expect(yield* BackendToolkit.status("sqlc").pipe(scoped)).toMatchObject([{ status: "absent" }])
171:     expect(yield* BackendToolkit.prefetch(["sqlc"]).pipe(scoped)).toMatchObject([{ status: "failed", cause: "executable-missing" }])
172:     expect(f.hits).toEqual({ ["/" + file("sqlc")]: 1 })
173:   }), 30_000,
174: )
```

**RB-S021 — `packages/core/test/backend-toolkit-source-readiness.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `0b5ddae83a45a11e5a546be9edc8393d1b161791` · SHA-256 `049b094e5266d65b48f48feb3cf526eccb9aefc36e00aa9e0ef79352aa03d157` · 7634 bytes.

Arquivo integral: `sources/packages/core/test/backend-toolkit-source-readiness.test.ts`; archive: E44.

Linhas 106–122.

```text
106: ;(["hosted", "ensure"] as const).forEach((api) => {
107:   ;(["directory", "nonexecutable"] as const).forEach((mode) => {
108:     const test = mode === "nonexecutable" && process.platform === "win32" ? it.live.skip : it.live
109:     test(`zero-exit source builder ${mode} rejected before publication through ${api}`, () => Effect.gen(function* () {
110:       const f = yield* fixture
111:       const failure = yield* f.install(mode, api).pipe(Effect.flip)
112:       expect(failure).toContain("install:go:failed:source-executable-not-ready")
113:       const call = yield* Effect.promise(() => Bun.file(path.join(f.root, "cache", "call.json")).json())
114:       expect(call.mode).toBe(mode)
115:       expect(call.cwd).toStartWith(path.join(path.dirname(f.directory), ".staging-"))
116:       expect(call.args).toEqual(["-trimpath", "-o", call.output, mode])
117:       expect(yield* PinnedArtifact.installed(f.directory)).toBe(false)
118:       expect(yield* Effect.promise(() => stat(f.directory).catch(() => undefined))).toBeUndefined()
119:       expect(yield* Effect.promise(() => stat(path.dirname(call.cwd)).catch(() => undefined))).toBeUndefined()
120:       expect(yield* Effect.promise(() => readdir(path.dirname(f.directory)))).toEqual([])
121:     }))
122:   })
```

### RB7-03 — E45: expectativas stale/dirty/encoding e retenção acima do budget

Vínculo: corpo R6, R7, R8, R13; archive E45.

**Contrato de fonte, sem execução.** Asserções abaixo não são resultados desta produção.

**RB-S022 — `packages/core/test/code-index-query.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `89bd7ce2a6edaa5af7df10dcee03de0bdd2fa06e` · SHA-256 `5759817d4df6aafb66b8a6827a4c4a0942ff8ea4f2e7f755abe3c0f952e81be4` · 25982 bytes.

Arquivo integral: `sources/packages/core/test/code-index-query.test.ts`; archive: E45.

Linhas 347–383.

```text
347:   test("a modified file comes back as dirty-overlay, and a definition only in the dirty file is found", async () => {
348:     const f = await fixture()
349:     await using _ = f.tmp
350:     await f.build()
351:     await Bun.write(path.join(f.root, "packages/a/src/use.ts"), "edited")
352:     f.repo.state.dirty = [{ path: "packages/a/src/use.ts" }]
353:     const result = await query(f.context, { op: "definition", name: "freshlyAdded" })
354:     expect(result.resolved?.range).toEqual({ path: "packages/a/src/use.ts", startLine: 22, endLine: 28 })
355:     expect(result.basis.freshness).toBe("dirty-overlay")
356:     expect(result.basis.basis.dirtyDigest).toMatch(/^[0-9a-f]{64}$/)
357:     expect(f.overlays).toEqual([["packages/a/src/use.ts"]])
358:     const clean = await query(f.context, { op: "definition", name: "main" })
359:     expect(clean.basis.freshness).toBe("fresh")
360:   })
361: 
362:   test("while a shard rebuilds the query answers from the previous commit as stale", async () => {
363:     const f = await fixture()
364:     await using _ = f.tmp
365:     await f.build()
366:     f.repo.commit("c2", { "packages/b/src/main.ts": lines(9) + "\n// edit" })
367:     const result = await query(f.context, { op: "definition", name: "main" })
368:     expect(result.resolved?.name).toBe("main")
369:     expect(result.basis.freshness).toBe("stale")
370:     expect(result.basis.coverage.skipped).toContainEqual({ path: "packages/b/src/main.ts", reason: "changed-since-index" })
371:     expect(result.basis.basis.commit).toBe("c2")
372:   })
373: 
374:   test("named failures, never an empty success", async () => {
375:     const f = await fixture()
376:     await using _ = f.tmp
377:     expect((await failure({ ...f.context, indexers: {} }, { op: "symbols" })).code).toBe("index_unavailable")
378:     expect((await failure(f.context, { op: "symbols" })).code).toBe("index_unavailable")
379:     expect((await failure(f.context, { op: "imports", path: "../outside.ts" })).code).toBe("reference_invalid")
380:     expect((await failure(f.context, { op: "map", path: "scripts" })).code).toBe("index_unavailable")
381:     // With an extractor the query starts the first build in the background and says so.
382:     expect((await failure({ ...f.context, extract: f.built.extract }, { op: "symbols" })).code).toBe("index_building")
383:   })
```

**RB-S023 — `packages/core/test/code-index-store.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `cb745065bf6208f70ec38456e78d0dba7bdad26d` · SHA-256 `1b6bcbc705aefe57d2620982e4cc3914fa67bd67464bcda16dfbcf587341c730` · 5359 bytes.

Arquivo integral: `sources/packages/core/test/code-index-store.test.ts`; archive: E45.

Linhas 53–87.

```text
53:   test("keeps the most recent commits and evicts least recently used shards over the byte cap", async () => {
54:     await using tmp = await tmpdir()
55:     const keys = Array.from({ length: 10 }, (_, index) => `k${index}`)
56:     const record = (index: number) => ({ commit: `c${index}`, at: index, shards: [{ id: "ts:.", key: keys[index]! }, { id: "ts:lib", key: "shared" }] })
57:     await writeFile(path.join(tmp.path, "shared.sqlite"), Buffer.alloc(100))
58:     const removed = await Effect.runPromise(Effect.gen(function* () {
59:       // Each commit's shard lands just before the commit is recorded, as a build does.
60:       const all = yield* Effect.forEach(keys.map((_, index) => index), (index) =>
61:         Effect.promise(() => writeFile(path.join(tmp.path, `${keys[index]}.sqlite`), Buffer.alloc(100))).pipe(
62:           Effect.andThen(CodeIndexStore.retain(tmp.path, record(index), { commits: 8, bytes: 1_000_000 }))))
63:       return all.flat()
64:     }))
65:     // Ten commits under an eight-commit limit: the two oldest commits' own shards go, the shared one stays.
66:     expect(removed.sort()).toEqual(["k0", "k1"])
67:     const after = await Effect.runPromise(CodeIndexStore.records(tmp.path))
68:     expect(after.map((entry) => entry.commit)).toEqual(["c9", "c8", "c7", "c6", "c5", "c4", "c3", "c2"])
69: 
70:     // 300 bytes keep the newest commit plus one: each commit adds 100 bytes beyond the shared shard.
71:     const evicted = await Effect.runPromise(CodeIndexStore.retain(tmp.path, record(9), { commits: 8, bytes: 300 }))
72:     expect(evicted.sort()).toEqual(["k2", "k3", "k4", "k5", "k6", "k7"])
73:     expect((await readdir(tmp.path)).filter((name) => name.endsWith(".sqlite")).sort()).toEqual(["k8.sqlite", "k9.sqlite", "shared.sqlite"])
74: 
75:     // The newest commit survives even when it alone exceeds the cap.
76:     expect(await Effect.runPromise(CodeIndexStore.retain(tmp.path, record(9), { commits: 8, bytes: 1 }))).toEqual(["k8"])
77:   })
78: 
79:   test("touch moves a commit to the front without dropping shards", async () => {
80:     await using tmp = await tmpdir()
81:     await Effect.runPromise(Effect.gen(function* () {
82:       yield* CodeIndexStore.retain(tmp.path, { commit: "old", at: 1, shards: [] }, { commits: 8, bytes: 1 })
83:       yield* CodeIndexStore.retain(tmp.path, { commit: "new", at: 2, shards: [] }, { commits: 8, bytes: 1 })
84:       yield* CodeIndexStore.touch(tmp.path, "old")
85:     }))
86:     expect((await Effect.runPromise(CodeIndexStore.records(tmp.path))).map((entry) => entry.commit)).toEqual(["old", "new"])
87:   })
```

**RB-S024 — `packages/core/test/research-toolkit/code-index-scip-encoding.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `72dfcf7b6b82f3755923e9ab81898b15e9e33f06` · SHA-256 `84837ea6b1f329ed10c6abdbaa4d8206f15ad113584ab5a3ef8bf0f841e062cf` · 3163 bytes.

Arquivo integral: `sources/packages/core/test/research-toolkit/code-index-scip-encoding.test.ts`; archive: E45.

Linhas 13–26.

```text
13: const GO = `package main\n\nfunc run() int {\n\tlabel := "ünï→✓"; return helpers.DoubleIt(len(label))\n}\n`
14: const RUST = `pub fn run() -> i32 {\n    let label = "ünï→✓🚀"; helpers::double_it(label.len() as i32)\n}\n`
15: 
16: const dump = async (dir: string, tool: string, document: { path: string; range: number[]; encoding?: PositionEncoding; text?: string }) => {
17:   const file = path.join(dir, `${tool}.scip`)
18:   await Bun.write(file, toBinary(IndexSchema, create(IndexSchema, {
19:     metadata: { toolInfo: { name: tool, version: "0" } },
20:     documents: [{
21:       relativePath: document.path, language: "x", positionEncoding: document.encoding, text: document.text,
22:       occurrences: [{ range: document.range, symbol: `${tool} x x 0 pkg/Target().`, symbolRoles: 0 }],
23:     }],
24:   })))
25:   return file
26: }
```

Linhas 28–53.

```text
28: const columns = (index: Scip.Index) => index.documents[0]!.occurrences.map((occ) => [occ.startLine, occ.startCol, occ.endCol])
29: 
30: describe("SCIP columns in UTF-16 units", () => {
31:   test("scip-go's undeclared UTF-8 byte offsets are converted against the Go source line", async () => {
32:     await using dir = await tmpdir()
33:     const file = await dump(dir.path, "scip-go", { path: "main.go", range: [3, 40, 48] })
34:     // 1-based start, exclusive end: `DoubleIt` starts at UTF-16 offset 34 on line 4.
35:     expect(columns(Scip.readScip(file, { prefix: "go", source: (name) => name === "go/main.go" ? GO : undefined }))).toEqual([[4, 35, 42]])
36:   })
37: 
38:   test("rust-analyzer's declared UTF-8 offsets are converted, an astral character counting two units", async () => {
39:     await using dir = await tmpdir()
40:     const file = await dump(dir.path, "rust-analyzer", {
41:       path: "src/lib.rs", range: [1, 44, 53], encoding: PositionEncoding.UTF8CodeUnitOffsetFromLineStart,
42:     })
43:     expect(columns(Scip.readScip(file, { source: () => RUST }))).toEqual([[2, 37, 45]])
44:   })
45: 
46:   test("UTF-32 offsets convert from the dump's own text, and UTF-16 offsets stay as emitted", async () => {
47:     await using dir = await tmpdir()
48:     const utf32 = await dump(dir.path, "utf32", { path: "src/lib.rs", range: [1, 35, 44], encoding: PositionEncoding.UTF32CodeUnitOffsetFromLineStart, text: RUST })
49:     expect(columns(Scip.readScip(utf32))).toEqual([[2, 37, 45]])
50:     // scip-typescript and scip-python count UTF-16 units already.
51:     const utf16 = await dump(dir.path, "scip-typescript", { path: "src/lib.rs", range: [1, 36, 45] })
52:     expect(columns(Scip.readScip(utf16, { source: () => RUST }))).toEqual([[2, 37, 45]])
53:   })
```

### RB7-04 — E46: expectativas de binding, custódia, fonte parcial, symlink e corrupção

Vínculo: corpo R10, R11, R13; archive E46.

**Contrato de fonte, sem execução.** Asserções abaixo não são resultados desta produção.

**RB-S025 — `packages/core/test/research-binding.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a0bed7ab69d086b18cd4e921e477a9b35a0ed4a9` · SHA-256 `3fc62da977ccf97ebd3fa989448432f44f8dcd861c06e831756b2ad050a45db5` · 8564 bytes.

Arquivo integral: `sources/packages/core/test/research-binding.test.ts`; archive: E46.

Linhas 95–121.

```text
95:   it.live("retained child binding and actual invocation admit; missing frame and forged claims fail", () => researchFixture((fixture) =>
96:     Effect.gen(function* () {
97:       const valid = yield* callFrame(fixture.binding, fixture.context, ResearchBinding.require(fixture.binding, fixture.context))
98:       expect(valid).toEqual(fixture.binding)
99:       const missing = yield* ResearchBinding.require(fixture.binding, fixture.context).pipe(Effect.flip)
100:       expect(missing.code).toBe("binding_missing")
101:       const forged = { ...fixture.binding, taskId: "copied-title" }
102:       expect((yield* callFrame(fixture.binding, fixture.context, ResearchBinding.require(forged, fixture.context)).pipe(Effect.flip)).code).toBe("binding_mismatch")
103:       const unpersisted = { ...fixture.context, toolCallID: "forged-call" }
104:       expect((yield* callFrame(fixture.binding, unpersisted, ResearchBinding.require(fixture.binding, unpersisted)).pipe(Effect.flip)).code).toBe("binding_mismatch")
105:       expect((yield* ResearchBinding.resolve(fixture.binding.executionSessionID, Project.ID.make("foreign-project")).pipe(Effect.flip)).code).toBe("not_found")
106:     }),
107:   ))
108: 
109:   it.live("caller seat/label cannot substitute for retained native owner; deleted Session loses access", () => researchFixture((fixture) =>
110:     Effect.gen(function* () {
111:       const database = yield* Database.Service
112:       const foreign = { ...fixture.context, agent: Agent.ID.make("backend") }
113:       expect((yield* callFrame(fixture.binding, foreign, ResearchBinding.require(fixture.binding, foreign)).pipe(Effect.flip)).code).toBe("binding_mismatch")
114:       yield* database.db.update(SessionTable).set({ agent: "configured-lookalike" }).where(eq(SessionTable.id, fixture.binding.executionSessionID)).run().pipe(Effect.orDie)
115:       expect((yield* ResearchBinding.resolve(fixture.binding.executionSessionID, fixture.binding.projectID).pipe(Effect.flip)).code).toBe("not_found")
116:       yield* database.db.update(SessionTable).set({ agent: "jimmy" }).where(eq(SessionTable.id, fixture.binding.executionSessionID)).run().pipe(Effect.orDie)
117:       expect(yield* ResearchBinding.resolve(fixture.binding.executionSessionID, fixture.binding.projectID)).toEqual(fixture.binding)
118:       yield* database.db.delete(SessionTable).where(eq(SessionTable.id, fixture.binding.executionSessionID)).run().pipe(Effect.orDie)
119:       expect((yield* ResearchBinding.resolve(fixture.binding.executionSessionID, fixture.binding.projectID).pipe(Effect.flip)).code).toBe("not_found")
120:     }),
121:   ))
```

**RB-S026 — `packages/core/test/research-artifacts.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `31ae551a9de42954c9f06984eeecba98b725eb77` · SHA-256 `47960eef80bbae8f9aad0254f15c5278dcb5ff9e319c3a8cb74acf4303231810` · 10671 bytes.

Arquivo integral: `sources/packages/core/test/research-artifacts.test.ts`; archive: E46.

Linhas 40–91.

```text
40:   it.live("file-before-event recovery uses stable operation; a file/ref alone grants no read", () => researchFixture((fixture) =>
41:     Effect.gen(function* () {
42:       const artifacts = yield* ResearchArtifacts.Service
43:       const records = yield* ResearchRecords.Service
44:       const operation = ResearchLedger.operation(fixture.context, "capture:text")
45:       const first = yield* artifacts.put(fixture.binding, { content: "historical bytes", representation: "text" }, operation)
46:       expect((yield* artifacts.read(fixture.binding, first.ref).pipe(Effect.flip)).code).toBe("not_found")
47:       const replay = yield* artifacts.put(fixture.binding, { content: "historical bytes", representation: "text", artifact: first.ref }, operation)
48:       expect(replay).toEqual(first)
49:       const changed = yield* artifacts.put(fixture.binding, { content: "new live bytes", representation: "text", artifact: first.ref }, operation).pipe(Effect.flip)
50:       expect(changed.code).toBe("conflict")
51:       const wrongRef = yield* artifacts.put(fixture.binding, { content: "historical bytes", representation: "text", artifact: { id: Capability.ArtifactID.create(), revision: 1 } }, operation).pipe(Effect.flip)
52:       expect(wrongRef.code).toBe("conflict")
53:       const receipt = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
54:         origin: { kind: "url", uri: "https://fixture.invalid/versioned" }, representation: "text", mediaType: "text/plain", content: "historical bytes", complete: true,
55:       }))
56:       expect(receipt.ref.artifact).toEqual(first.ref)
57:       const page = yield* artifacts.read(fixture.binding, receipt.ref.artifact)
58:       expect(page.text).toBe("historical bytes")
59:       expect(page.receipt).toEqual(receipt)
60:       expect(page.complete).toBe(true)
61:       expect((yield* artifacts.read({ ...fixture.binding, taskId: "guessed-task" }, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("binding_mismatch")
62:     }),
63:   ))
64: 
65:   it.live("UTF-8 pages remain <=16KiB and exact; cursor cannot select another admitted artifact", () => researchFixture((fixture) =>
66:     Effect.gen(function* () {
67:       const records = yield* ResearchRecords.Service
68:       const artifacts = yield* ResearchArtifacts.Service
69:       const text = "a" + "😀".repeat(10000) + " decisive qualifier"
70:       const receipt = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
71:         origin: { kind: "file", uri: "fixture.txt", revision: "dirty-observed" }, representation: "text", mediaType: "text/plain", content: text, complete: false,
72:       }))
73:       const first = yield* artifacts.read(fixture.binding, receipt.ref.artifact)
74:       expect(Buffer.byteLength(first.text)).toBeLessThanOrEqual(Research.Limits.pageBytes)
75:       expect(first.cursor).toBeDefined()
76:       if (!first.cursor) throw new Error("Expected bounded continuation")
77:       const second = yield* artifacts.read(fixture.binding, receipt.ref.artifact, first.cursor)
78:       expect(Buffer.byteLength(second.text)).toBeLessThanOrEqual(Research.Limits.pageBytes)
79:       if (!second.cursor) throw new Error("Expected second continuation")
80:       const third = yield* artifacts.read(fixture.binding, receipt.ref.artifact, second.cursor)
81:       expect(Buffer.byteLength(third.text)).toBeLessThanOrEqual(Research.Limits.pageBytes)
82:       expect(first.text + second.text + third.text).toBe(text)
83:       expect(third.complete).toBe(false)
84:       expect(third.cursor).toBeUndefined()
85:       const context = yield* fixture.call()
86:       const other = yield* callFrame(fixture.binding, context, records.capture(fixture.binding, context, {
87:         origin: { kind: "file", uri: "other.txt" }, representation: "text", mediaType: "text/plain", content: "other", complete: true,
88:       }))
89:       expect((yield* artifacts.read(fixture.binding, other.ref.artifact, first.cursor).pipe(Effect.flip)).code).toBe("reference_invalid")
90:       expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact, "not-json").pipe(Effect.flip)).code).toBe("reference_invalid")
91:     }),
```

Linhas 94–113.

```text
94:   it.live("old captures retain task lifetime; corrupt/missing bytes and symlinked roots are unavailable", () => researchFixture((fixture) =>
95:     Effect.gen(function* () {
96:       const records = yield* ResearchRecords.Service
97:       const artifacts = yield* ResearchArtifacts.Service
98:       const receipt = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
99:         origin: { kind: "file", uri: "retained.txt" }, representation: "text", mediaType: "text/plain", content: "exact capture", complete: true,
100:       }))
101:       const root = path.join(fixture.root, "research", ResearchLedger.digest(fixture.binding.projectID), ResearchLedger.digest(fixture.binding.taskId))
102:       const filename = path.join(root, `${receipt.ref.artifact.id}-1.body`)
103:       yield* Effect.promise(() => fs.utimes(filename, new Date(0), new Date(0)))
104:       expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact)).text).toBe("exact capture")
105:       yield* Effect.promise(() => fs.writeFile(filename, "same-length!!"))
106:       expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("source_unavailable")
107:       yield* Effect.promise(() => fs.unlink(filename))
108:       expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("source_unavailable")
109:       yield* Effect.promise(() => fs.rename(root, root + "-owned"))
110:       yield* Effect.promise(() => fs.symlink(root + "-owned", root, process.platform === "win32" ? "junction" : "dir"))
111:       expect((yield* artifacts.read(fixture.binding, receipt.ref.artifact).pipe(Effect.flip)).code).toBe("source_unavailable")
112:     }),
113:   ))
```

### RB7-05 — E46: expectativas de replay, CAS, locator ambíguo e allowance

Vínculo: corpo R10, R11, R12, R13; archive E46.

**Contrato de fonte, sem execução.** Asserções abaixo não são resultados desta produção.

**RB-S027 — `packages/core/test/research-records.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `355e6b47b052251b57ee4f4dc56cfe1aee257e99` · SHA-256 `b2dda3fe95b4fdc32ed63d6e1fe06c10d1fe9e1cb50d28f373cd5dc79b4c879f` · 20826 bytes.

Arquivo integral: `sources/packages/core/test/research-records.test.ts`; archive: E46.

Linhas 18–20.

```text
18: const finding = {
19:   action: "finding", proposition: "Works only under stated condition", nature: "inference", conditions: ["Only version 1"], evidence: [], contrary: [],
20: } satisfies Research.RecordInput
```

Linhas 23–66.

```text
23:   it.live("request preflight refuses unsettled/conflicting retries and returns only a settled historical source", () => researchFixture((fixture) =>
24:     Effect.gen(function* () {
25:       const records = yield* ResearchRecords.Service
26:       const hash = "a".repeat(64)
27:       expect(yield* callFrame(fixture.binding, fixture.context, records.beginAcquisition(fixture.binding, fixture.context, hash))).toBeUndefined()
28:       expect((yield* callFrame(fixture.binding, fixture.context, records.beginAcquisition(fixture.binding, fixture.context, hash)).pipe(Effect.flip)).code).toBe("publication_uncertain")
29:       expect((yield* callFrame(fixture.binding, fixture.context, records.beginAcquisition(fixture.binding, fixture.context, "b".repeat(64))).pipe(Effect.flip)).code).toBe("conflict")
30:       const captured = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
31:         origin: { kind: "file", uri: "historical.txt" }, representation: "text", mediaType: "text/plain", content: "historical", complete: true,
32:       }))
33:       const settled = yield* callFrame(fixture.binding, fixture.context, records.attempt(fixture.binding, fixture.context, {
34:         outcome: "captured", stage: "representation", reason: "complete", source: captured.ref, returned: true,
35:       }))
36:       expect(yield* callFrame(fixture.binding, fixture.context, records.beginAcquisition(fixture.binding, fixture.context, hash))).toEqual(settled)
37:       const failed = yield* fixture.call()
38:       yield* callFrame(fixture.binding, failed, records.beginAcquisition(fixture.binding, failed, hash))
39:       yield* callFrame(fixture.binding, failed, records.attempt(fixture.binding, failed, {
40:         outcome: "unavailable", stage: "acquisition", reason: "http_status", returned: false,
41:       }))
42:       expect((yield* callFrame(fixture.binding, failed, records.beginAcquisition(fixture.binding, failed, hash)).pipe(Effect.flip)).code).toBe("source_unavailable")
43:     }),
44:   ))
45: 
46:   it.live("acquisition outcomes replay durably and remain distinct from admitted corpus bytes", () => researchFixture((fixture) =>
47:     Effect.gen(function* () {
48:       const records = yield* ResearchRecords.Service
49:       const failed = { outcome: "unavailable", stage: "acquisition", reason: "http_status" } as const
50:       const first = yield* callFrame(fixture.binding, fixture.context, records.attempt(fixture.binding, fixture.context, failed))
51:       expect(yield* callFrame(fixture.binding, fixture.context, records.attempt(fixture.binding, fixture.context, failed))).toEqual(first)
52:       expect((yield* callFrame(fixture.binding, fixture.context, records.attempt(fixture.binding, fixture.context, {
53:         ...failed, outcome: "captured",
54:       })).pipe(Effect.flip)).code).toBe("conflict")
55:       const attempts = yield* records.view(fixture.binding, { action: "attempts" })
56:       expect("attempts" in attempts && attempts.attempts).toEqual([first])
57:       expect(yield* records.view(fixture.binding, { action: "corpus" })).toEqual({ sources: [], records: [], documents: [], complete: true, total: 0 })
58:       const context = yield* fixture.call()
59:       const partial = yield* callFrame(fixture.binding, context, records.capture(fixture.binding, context, {
60:         origin: { kind: "file", uri: "slice.txt" }, representation: "text", mediaType: "text/plain", content: "one retained line",
61:         complete: false, observed: { byteStart: 10, lineStart: 4, lineEnd: 4 },
62:       }))
63:       expect((yield* records.view(fixture.binding, { action: "source", ref: partial.ref }))).toMatchObject({ text: "one retained line", complete: false })
64:       expect(yield* records.view(fixture.binding, { action: "corpus" })).toMatchObject({ sources: [partial], complete: true, total: 1 })
65:     }),
66:   ))
```

Linhas 141–155.

```text
141:       const first = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, finding))
142:       const second = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, {
143:         contrary: [], evidence: [], conditions: ["Only version 1"], nature: "inference", proposition: finding.proposition, action: "finding",
144:       }))
145:       expect(second).toEqual(first)
146:       expect(first.record?.revision).toBe(1)
147:       if (!first.record) throw new Error("Expected admitted record")
148:       const rows = yield* database.db.select().from(EventTable).where(and(
149:         eq(EventTable.aggregate_id, fixture.binding.executionSessionID), eq(EventTable.type, "research.record.committed.1"),
150:       )).all().pipe(Effect.orDie)
151:       expect(rows).toHaveLength(1)
152:       expect(String(rows[0].id)).toBe(first.receipt.eventID)
153:       expect((yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, { ...finding, proposition: "Conflicting reuse" })).pipe(Effect.flip)).code).toBe("conflict")
154:       const restored = yield* records.view(fixture.binding, { action: "record", ref: { id: first.record.id, revision: first.record.revision } })
155:       expect(restored).toEqual(first.record)
```

Linhas 159–188.

```text
159:   it.live("two writers cannot publish same next revision; historical wording and exact relations survive", () => researchFixture((fixture) =>
160:     Effect.gen(function* () {
161:       const records = yield* ResearchRecords.Service
162:       const original = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context, finding))
163:       if (original.record?.kind !== "finding") throw new Error("Expected admitted finding")
164:       const ref = { id: original.record.id, revision: original.record.revision }
165:       const update: Research.RecordInput = { ...finding, id: original.record.id, baseRevision: 1, reason: "Observed narrower scope", proposition: "Only version 1, feature enabled" }
166:       const contexts = yield* Effect.all([fixture.call(), fixture.call()])
167:       const outcomes = yield* Effect.all(contexts.map((context) => callFrame(fixture.binding, context, records.record(fixture.binding, context, update)).pipe(Effect.exit)), { concurrency: "unbounded" })
168:       expect(outcomes.filter(Exit.isSuccess)).toHaveLength(1)
169:       const failures = outcomes.filter(Exit.isFailure)
170:       expect(failures).toHaveLength(1)
171:       expect(failures[0].cause.reasons.some((reason) => {
172:         const error = Cause.isFailReason(reason) ? reason.error : Cause.isDieReason(reason) ? reason.defect : undefined
173:         return error instanceof Research.Error && error.code === "conflict"
174:       })).toBe(true)
175:       expect(yield* records.view(fixture.binding, { action: "record", ref })).toEqual(original.record)
176:       const revised = yield* records.view(fixture.binding, { action: "record", ref: { id: original.record.id, revision: 2 } })
177:       expect(revised).toMatchObject({ revision: 2, proposition: "Only version 1, feature enabled", reason: "Observed narrower scope" })
178:       const context = yield* fixture.call()
179:       const relation = yield* callFrame(fixture.binding, context, records.record(fixture.binding, context, {
180:         action: "relation", from: ref, to: { id: original.record.id, revision: 2 }, relation: "related", reason: "Historical narrowing",
181:       }))
182:       expect(relation.record).toMatchObject({ from: original.receipt.ref, to: { id: original.record.id, revision: 2 } })
183:       const missing = yield* fixture.call()
184:       expect((yield* callFrame(fixture.binding, missing, records.record(fixture.binding, missing, {
185:         action: "relation", from: ref, to: { id: Research.FindingID.create(), revision: 1 }, relation: "supports", reason: "Must not invent endpoint",
186:       })).pipe(Effect.flip)).code).toBe("reference_invalid")
187:     }),
188:   ))
```

Linhas 190–208.

```text
190:   it.live("quotes detect overlapping ambiguity; exact qualifiers and line/JSON locators resolve only admitted bytes", () => researchFixture((fixture) =>
191:     Effect.gen(function* () {
192:       const records = yield* ResearchRecords.Service
193:       const source = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
194:         origin: { kind: "file", uri: "quotes.txt", revision: "observed" }, representation: "text", mediaType: "text/plain", content: "aaa\nonly version 1\n", complete: true,
195:       }))
196:       const ambiguous = yield* fixture.call()
197:       expect((yield* callFrame(fixture.binding, ambiguous, records.record(fixture.binding, ambiguous, {
198:         ...finding, evidence: [{ source: source.ref, locator: { kind: "quote", exact: "aa" } }],
199:       })).pipe(Effect.flip)).code).toBe("locator_ambiguous")
200:       const valid = yield* fixture.call()
201:       const admitted = yield* callFrame(fixture.binding, valid, records.record(fixture.binding, valid, {
202:         ...finding, evidence: [{ source: source.ref, locator: { kind: "quote", exact: "aa", suffix: "a\n" } }, { source: source.ref, locator: { kind: "lines", start: 2, end: 2 } }],
203:       }))
204:       expect(admitted.record?.kind).toBe("finding")
205:       const wrong = yield* fixture.call()
206:       expect((yield* callFrame(fixture.binding, wrong, records.record(fixture.binding, wrong, {
207:         ...finding, evidence: [{ source: { ...source.ref, digest: "0".repeat(64) }, locator: { kind: "lines", start: 1, end: 1 } }],
208:       })).pipe(Effect.flip)).code).toBe("reference_invalid")
```

**RB-S028 — `packages/core/test/research-allowance.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `0925c03cdf252fe2ae8338c6f31e6d6be172f876` · SHA-256 `4eec8c9322095c6c6f8b33a9f74ea6655400ff332678c90da62f2e9aad9edc2b` · 17963 bytes.

Arquivo integral: `sources/packages/core/test/research-allowance.test.ts`; archive: E46.

Linhas 38–53.

```text
38:   it.live("concurrent exact bind and charge retries admit one row; changed input conflicts", () => Effect.gen(function* () {
39:     const service = yield* ResearchAllowance.Service
40:     const native = binding()
41:     const allowances = yield* Effect.forEach(Array.from({ length: 8 }), () => service.bind(native, "dispatch"), { concurrency: "unbounded" })
42:     expect(allowances.every((value) => value.providerLimit === 24 && value.toolLimit === 64 && value.byteLimit === 64 * 1024 * 1024)).toBe(true)
43:     const allowance = allowances[0]
44:     yield* Effect.forEach(Array.from({ length: 8 }), () => service.charge(allowance, "provider", "primary:1"), { concurrency: "unbounded" })
45:     expect(yield* ledger(native.executionSessionID)).toHaveLength(2)
46:     expect(error(yield* Effect.exit(service.charge(allowance, "tool", "primary:1")))?.code).toBe("conflict")
47:     expect(error(yield* Effect.exit(service.bind({ ...native, taskId: "other-task" }, "dispatch")))?.code).toBe("binding_mismatch")
48:     expect(error(yield* Effect.exit(service.charge({ ...allowance, providerLimit: 240 }, "provider", "widen")))?.code).toBe("binding_mismatch")
49:     expect(yield* ledger(native.executionSessionID)).toHaveLength(2)
50:     const resumed = yield* service.bind(native, "authorized-new-call")
51:     yield* service.charge(resumed, "provider", "primary:1")
52:     expect(yield* ledger(native.executionSessionID)).toHaveLength(4)
53:   }))
```

Linhas 90–108.

```text
90:   it.live("byte reservations race one allowance; repeated and uncertain reconciliation never refunds", () => Effect.gen(function* () {
91:     const service = yield* ResearchAllowance.Service
92:     const allowance = yield* service.bind(binding(), "dispatch")
93:     const reserved = allowance.byteLimit / 4
94:     const results = yield* Effect.forEach(Array.from({ length: 8 }, (_, index) => `capture:${index}`),
95:       (operation) => Effect.exit(service.reserveBytes(allowance, operation, reserved)), { concurrency: "unbounded" })
96:     expect(results.filter(Exit.isSuccess)).toHaveLength(4)
97:     expect(results.filter(Exit.isFailure).map((exit) => error(exit)?.code)).toEqual(Array.from({ length: 4 }, () => "budget_exhausted"))
98:     const rows = yield* ledger(allowance.binding.executionSessionID)
99:     const admitted = rows.filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
100:       .map((row) => Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(row.data))
101:     yield* Effect.forEach(admitted, (entry) => service.reconcileBytes(allowance, entry.operation, 0))
102:     yield* Effect.forEach(admitted, (entry) => service.reconcileBytes(allowance, entry.operation, 0))
103:     expect(error(yield* Effect.exit(service.reserveBytes(allowance, "new-write", 1)))?.code).toBe("budget_exhausted")
104:     expect(error(yield* Effect.exit(service.reconcileBytes(allowance, admitted[0].operation, reserved + 1)))?.code).toBe("over_cap")
105:     expect(error(yield* Effect.exit(service.reconcileBytes(allowance, "unadmitted", 0)))?.code).toBe("binding_missing")
106:     expect(admitted.reduce((total, entry) => total + entry.amount, 0)).toBe(allowance.byteLimit)
107:     expect(yield* ledger(allowance.binding.executionSessionID)).toEqual(rows)
108:   }))
```

Linhas 232–244.

```text
232:   it.live("a focused dispatch admitted before probe seconds keeps its stored limit on re-bind", () => Effect.gen(function* () {
233:     const service = yield* ResearchAllowance.Service
234:     const database = yield* Database.Service
235:     const native = binding()
236:     yield* service.bind(native, "dispatch", "focused")
237:     const row = (yield* ledger(native.executionSessionID))[0]
238:     const legacy = structuredClone(row.data) as { allowance: Record<string, unknown> }
239:     delete legacy.allowance.probeSecondsLimit
240:     yield* database.db.update(EventTable).set({ data: legacy }).where(eq(EventTable.id, row.id)).run().pipe(Effect.orDie)
241:     const rebound = yield* service.bind(native, "dispatch", "focused")
242:     expect(rebound.probeSecondsLimit).toBe(Research.ProbeSeconds.quick)
243:     yield* service.charge(rebound, "probe", "probe:legacy", 1)
244:   }))
```

### RB7-06 — E46: expectativas de inquiry, original lineStart, guard e timeout

Vínculo: corpo R9, R11, R12, R13; archive E46.

**Contrato de fonte, sem execução.** Asserções abaixo não são resultados desta produção.

**RB-S029 — `packages/core/test/research-inquiry-ledger.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `25743a3cdea9e2191146694dfdb9c9fe41e44577` · SHA-256 `5a50187b432fe80d8c07ed712c27f419c7af026263512ee81912eea04e71d0d9` · 6648 bytes.

Arquivo integral: `sources/packages/core/test/research-inquiry-ledger.test.ts`; archive: E46.

Linhas 20–69.

```text
20:   it.live("a dispatch opens and closes its inquiry once; exact retries replay and nothing follows a close", () => researchFixture((fixture) =>
21:     Effect.gen(function* () {
22:       const records = yield* ResearchRecords.Service
23:       const allowances = yield* ResearchAllowance.Service
24:       const allowance = yield* allowances.bind(fixture.binding, "dispatch-one")
25:       const question = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context,
26:         { action: "question", question: "Where?", selection: { profile: "locate", depth: "quick", genre: "answer" } }, "open:question"))
27:       if (!question.record) throw new Error("Expected the question record")
28:       const ref = { id: question.record.id, revision: question.record.revision }
29:       const opened = { type: "research.inquiry.opened", question: ref, subquestions: [ref] } as const
30:       const first = yield* callFrame(fixture.binding, fixture.context, records.inquire(allowance, fixture.context, opened))
31:       expect(yield* callFrame(fixture.binding, fixture.context, records.inquire(allowance, fixture.context, opened))).toEqual(first)
32:       const again = yield* fixture.call()
33:       expect((yield* callFrame(fixture.binding, again, records.inquire(allowance, again, opened)).pipe(Effect.flip)).code).toBe("inquiry_state")
34:       const checking = yield* fixture.call()
35:       yield* callFrame(fixture.binding, checking, records.inquire(allowance, checking, { type: "research.inquiry.checked", check }))
36:       const closing = yield* fixture.call()
37:       yield* callFrame(fixture.binding, closing, records.inquire(allowance, closing, { type: "research.inquiry.closed", card: card(check) }))
38:       const late = yield* fixture.call()
39:       expect((yield* callFrame(fixture.binding, late, records.inquire(allowance, late, { type: "research.inquiry.checked", check })).pipe(Effect.flip)).code)
40:         .toBe("inquiry_state")
41:       const steps = yield* records.dispatch(allowance)
42:       expect(steps.map((step) => step.type).filter((type) => type.startsWith("research.inquiry."))).toEqual([
43:         "research.inquiry.opened", "research.inquiry.checked", "research.inquiry.closed",
44:       ])
45:       // The parent reads the closed card by binding (J5.13).
46:       expect(yield* ResearchLedger.closed(fixture.binding)).toEqual(card(check))
47:       // A resumed Task is a new dispatch: its stream starts after its own allowance and holds no earlier inquiry.
48:       const resumed = yield* allowances.bind(fixture.binding, "dispatch-two")
49:       expect(yield* ResearchLedger.closed(fixture.binding)).toBeUndefined()
50:       expect((yield* records.dispatch(resumed)).filter((step) => step.type.startsWith("research.inquiry."))).toEqual([])
51:       expect((yield* records.dispatch({ ...resumed, dispatchCallID: "never-bound" }).pipe(Effect.flip)).code).toBe("binding_missing")
52:     }).pipe(Effect.provide(ResearchAllowance.layer)),
53:   ))
54: 
55:   it.live("original-file lines resolve through the captured span's first line (J5.3)", () => researchFixture((fixture) =>
56:     Effect.gen(function* () {
57:       const records = yield* ResearchRecords.Service
58:       const source = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
59:         origin: { kind: "file", uri: "span.ts" }, representation: "text", mediaType: "text/plain", content: "line four\nline five",
60:         complete: false, observed: { byteStart: 30, lineStart: 4, lineEnd: 5 },
61:       }))
62:       const lines = (start: number, end: number, basis?: "original" | "retained") =>
63:         records.verifyEvidence(fixture.binding, { source: source.ref, locator: { kind: "lines", start, end, ...(basis ? { basis } : {}) } })
64:       yield* lines(4, 5, "original")
65:       yield* lines(1, 2)
66:       expect((yield* lines(1, 2, "original").pipe(Effect.flip)).code).toBe("reference_invalid")
67:       expect((yield* lines(5, 6, "original").pipe(Effect.flip)).code).toBe("reference_invalid")
68:     }),
69:   ))
```

**RB-S030 — `packages/core/test/research-probe.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `92f668b9b22842f2210103138cbdb7a95fa4c3a5` · SHA-256 `8b68cb18e71ba3291b86e2943b754ae701bb4f9ed8db0be059aaca3e57935bfb` · 10594 bytes.

Arquivo integral: `sources/packages/core/test/research-probe.test.ts`; archive: E46.

Linhas 116–144.

```text
116: live("a repository test guard yields blocked_by_repo_guard; the host hands the child neither CI nor ORCHESTRA_LOCAL_TESTS", () =>
117:   Effect.gen(function* () {
118:     expectSpawn(import.meta.path)
119:     const dir = yield* repo
120:     yield* Effect.promise(async () => {
121:       await writeFile(path.join(dir.path, "bunfig.toml"), `[test]\npreload = ["./guard.ts"]\n`)
122:       await writeFile(path.join(dir.path, "guard.ts"),
123:         `if (process.env.CI !== "true" && process.env.ORCHESTRA_LOCAL_TESTS !== "1") { console.error("${ProbeRun.GUARD}; tests run on GitHub Actions."); process.exit(1) }\n`)
124:       await writeFile(path.join(dir.path, "x.test.ts"), `import { test } from "bun:test"\ntest("x", () => {})\n`)
125:     })
126:     const guarded = yield* ProbeRun.run({ snapshot: { kind: "worktree" }, runner: { kind: "test", file: "x.test.ts", name: "x" } }, context(dir.path))
127:     expect(guarded.verdict, guarded.stderr.tail).toBe("blocked_by_repo_guard")
128:     expect(guarded.runner.argv.slice(-2)).toEqual(["-t", "x"])
129:     const env = yield* ProbeRun.run(script(`console.log(JSON.stringify([process.env.CI ?? null, process.env.ORCHESTRA_LOCAL_TESTS ?? null, process.env.NODE_OPTIONS ?? null]))`),
130:       context(dir.path))
131:     expect(env.stdout.tail).toBe("[null,null,null]")
132:   }), 120_000,
133: )
134: 
135: live("the timeout stops the probe and names it", () =>
136:   Effect.gen(function* () {
137:     expectSpawn(import.meta.path)
138:     const dir = yield* repo
139:     const result = yield* ProbeRun.run(script("setInterval(() => {}, 1000)", { timeoutSeconds: 30 }), context(dir.path, { remainingSeconds: 2 }))
140:     expect(result.verdict).toBe("timeout")
141:     expect(result.exitCode).toBeNull()
142:     expect(result.durationMs).toBeLessThan(20_000)
143:   }), 60_000,
144: )
```

### RB7-07 — E46: expectativas de paginação search e descarte/fallback locate

Vínculo: corpo R8, R13; archive E46.

**Contrato de fonte, sem execução.** Asserções abaixo não são resultados desta produção.

**RB-S031 — `packages/core/test/research-search.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `4993ba8decd55d2bc8ed812e30227a67595e2f33` · SHA-256 `5d776ea45efbb391b7fefc1eb225b34e7701b0222fdacf077808019bd8fd45b6` · 5955 bytes.

Arquivo integral: `sources/packages/core/test/research-search.test.ts`; archive: E46.

Linhas 74–90.

```text
74:   it.live("pages deterministically and marks a cut page incomplete", () =>
75:     withTree(Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`f${n}.ts`, "hit\nhit\n"])), (cwd) =>
76:       Effect.gen(function* () {
77:         const first = yield* CodeSearch.run({ pattern: "hit", limit: 4 }, { cwd })
78:         expect(first.matches).toHaveLength(4)
79:         expect(first.next).toBe(4)
80:         expect(first.basis.bounds.truncated).toBe(true)
81:         expect(first.basis.coverage.complete).toBe(false)
82:         const second = yield* CodeSearch.run({ pattern: "hit", limit: 4, offset: first.next }, { cwd })
83:         expect(second.matches.map((m) => `${m.path}:${m.line}`)).toEqual(["f3.ts:1", "f3.ts:2", "f4.ts:1", "f4.ts:2"])
84:         const last = yield* CodeSearch.run({ pattern: "hit", limit: 4, offset: 8 }, { cwd })
85:         expect(last.matches).toHaveLength(2)
86:         expect(last.next).toBeUndefined()
87:         expect(last.basis.coverage.complete).toBe(true)
88:       }),
89:     ),
90:   )
```

Linhas 102–123.

```text
102:   it.live("a clean zero is complete; an invalid regex fails by name", () =>
103:     withTree({ "a.ts": "x\n" }, (cwd) =>
104:       Effect.gen(function* () {
105:         const zero = yield* CodeSearch.run({ pattern: "absent" }, { cwd })
106:         expect(zero.matches).toEqual([])
107:         expect(zero.basis.coverage.complete).toBe(true)
108:         const bad = yield* CodeSearch.run({ pattern: "(", mode: "regex" }, { cwd }).pipe(Effect.flip)
109:         expect(bad.reason).toBe("pattern_invalid")
110:       }),
111:     ),
112:   )
113: 
114:   it.live("counts binaries it skipped and truncates long lines", () =>
115:     withTree({ "bin.dat": "needle\u0000\u0001", "long.ts": `needle ${"x".repeat(2000)}\n` }, (cwd) =>
116:       Effect.gen(function* () {
117:         const result = yield* CodeSearch.run({ pattern: "needle" }, { cwd })
118:         expect(result.matches.map((m) => m.path)).toEqual(["long.ts"])
119:         expect(result.matches[0]?.text.length).toBeLessThanOrEqual(303)
120:         expect(result.basis.coverage.binariesSkipped).toBe(1)
121:       }),
122:     ),
123:   )
```

**RB-S032 — `packages/core/test/research-locate.test.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `53aed544518715b880e3415295e94da7756cc9ad` · SHA-256 `ef4ff4e93af664f8810da34386b235ef33071fcbba9868bf9904aa40f72f801a` · 8418 bytes.

Arquivo integral: `sources/packages/core/test/research-locate.test.ts`; archive: E46.

Linhas 83–114.

```text
83:   test("drops a range whose hit no longer matches the current file and counts it", async () => {
84:     const stale: Record<string, string> = { ...FILES, "src/check.ts": ["export function renamed(x: number) {", "  return x", "}"].join("\n") }
85:     const result = await run({ terms: ["citationCheck"] }, sources({ read: (path) => Effect.succeed(stale[path]) }).value)
86:     expect(result.ranges.some((range) => range.path === "src/check.ts")).toBe(false)
87:     expect(result.basis.coverage.discarded).toBeGreaterThan(0)
88:   })
89: 
90:   test("drops a definition whose name is not on its declared line", async () => {
91:     const moved: Record<string, string> = { ...FILES, "src/assemble.ts": ["", "", "", "export function assemble() {", "}"].join("\n") }
92:     const fake = sources({ read: (path) => Effect.succeed(moved[path]), search: () => Effect.succeed({ matches: [], basis: basis() }) })
93:     const result = await run({ symbols: ["assemble"] }, fake.value)
94:     expect(result.ranges.some((range) => range.symbol === "assemble")).toBe(false)
95:     expect(result.basis.coverage.discarded).toBeGreaterThan(0)
96:   })
97: 
98:   test("runs at most 32 searches per call", async () => {
99:     const fake = sources()
100:     const names = Array.from({ length: 16 }, (_, index) => `name${index}`)
101:     const result = await run({ terms: names, symbols: names.map((name) => `Sym${name}`) }, fake.value)
102:     expect(fake.calls.search.length + fake.calls.query.length).toBeLessThanOrEqual(Locate.MAX_SEARCHES)
103:     expect(result.searches.length + 1).toBeLessThanOrEqual(Locate.MAX_SEARCHES)
104:     expect(result.searches.length).toBeGreaterThan(16)
105:   })
106: 
107:   test("without an index runs the lexical lists only and declares the languages it reached", async () => {
108:     const result = await run({ symbols: ["assemble"] }, sources({ query: undefined }).value)
109:     expect(new Set(result.searches.map((search) => search.kind))).toEqual(new Set(["lexical", "lexical-wide"]))
110:     expect(result.ranges.some((range) => range.path === "src/assemble.ts" && range.startLine <= 3 && 3 <= range.endLine)).toBe(true)
111:     expect(result.basis.freshness).toBe("fresh")
112:     expect(result.basis.coverage.languagesMissing).toContain("ts")
113:     expect(result.basis.coverage.complete).toBe(false)
114:   })
```

## Proposta separada de precisão da ordem do fallback

**Não aplicada.** A expressão “mais novo retido” pode ser lida como ordenação cronológica do commit/build; RB1-02 mostra a ordem do manifesto, que `touch` também altera por uso. Substituição mínima proposta, sujeita à decisão da principal:

Original literal: `query.ts` abre shard atual ou o mais novo retido de mesmo id quando o atual falta.

Proposto: `query.ts` abre o shard atual ou o primeiro retido de mesmo id ainda presente, na ordem do manifesto (atualizada por `retain`/`touch`), quando o atual falta.

SHA-256 prospectivo do corpo com apenas essa substituição: `81dfb4356b48331a4e348af3735de2697a23297a45994a3049f6948f9b4290bf`; Git blob `452d64304666380d4abcd758dfb85569447d2f3a`. Nenhum corpo prospectivo foi gravado. A proposta do memo SCIP permanece separada no índice A; este hash não a incorpora. O corpo avaliado continua `1213f85cf16f73feed220e8c1b33ed52b2af75afd570b154a29eaf8f99f27d73`.

## Entrega incremental dos recortes

Usar a ordem e os offsets de `review-supplements-dispatch.md`. O corpo já entregue aos juízes não deve ser repetido entre os lotes. Primeiro enviar os lotes A em ordem, depois os B, preservando os IDs de fonte e de grupo. Não reescrever blocos para reduzir tamanho. A principal mantém a decisão de suficiência e os pedidos adicionais separados da produção.

## FIM_DO_SUPLEMENTO_LITERAL
