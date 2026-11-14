# Arquivo de evidência literal — RESEARCH-L1

Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Histórico explicitamente separado no E01. Cada trecho vem dos bytes capturados; numeração é a linha original, sem elipses dentro de um intervalo. SHA-256 de trecho cobre o texto UTF-8 original com suas quebras de linha, antes do prefixo de numeração. Comentários e expectativas de teste são intenção, não execução. Nenhum teste foi rodado.

Este arquivo concentra contratos e ramos para sustentar as afirmações do corpo sem exigir ferramentas do juiz. A projeção `evidence-review.md` seleciona subconjuntos literais dos mesmos trechos. Pins completos e as 130 fontes permanecem em `sources/`; hashes integrais em `captures.json`.

## E01 — Reúso histórico e lacunas originais

### `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/bodies/research.md`

Commit `a8df22ae3a140c58c63f62ce2a634c84f415c943` · Git blob `d7c550b41f36ba6ae001ef5f7d8c041b26854f2f` · SHA-256 `76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202` · 3942 bytes.

Linhas 1–25 · trecho SHA-256 `76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202`:

```text
1: # Pinned toolkits and retained research evidence
2: 
3: Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
4: Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
5: 
6: ## Observed implementation
7: 
8: BackendToolkit has explicit absent/fetching/ready/failed/unsupported states, a root separated by engine version and target, and manifest-supplied engines/runtimes. `ensure` rejects an unsupported host and checks dependency ordering and host floor before acquisition. Downloaded engines use `PinnedArtifact.install`; hosted engines use the hosted lifecycle. Readiness requires installed markers, executable files, runtime executables where needed and exact host shim text. A cache marker alone is insufficient. Cross-target prefetch does not execute that target or write its host shim. [1]
9: 
10: `prepare` recognizes commands naming `BACKEND_TOOLKIT_BIN` engines and acquires only those engines and dependencies. The source describes a 60-second shell preparation wait while acquisition may continue; installation has its own attempt lifecycle. The README assigns lockfiles and generated entry skills to owning packs and keeps Core independent of product specialist modules. Those manifest pins and platform floor values are inputs, not evidence that an engine was downloaded or qualified on this machine. [1,2]
11: 
12: ResearchToolkit reuses BackendToolkit with its own root and manifest. Default owner caps are 2 GiB indexer, 1 GiB probe, 2 GiB scratch, 4 GiB index storage, eight commits and a 15-minute shard timeout; config can lower byte caps, not raise them. The default index adapter plans no shards and fails a build as unavailable, so providing the real adapter is necessary. Prewarm records building/skipped state outside the worktree, uses a host-wide file lock for indexer work and retries lock timeouts. A building status older than the shard timeout no longer claims live building. Status writes are best effort and may lose status without making the underlying index successful. `warm` also catches a planning error as an empty shard list: a no-work warm-up is therefore not proof of complete index coverage. [3]
13: 
14: ResearchLedger canonicalizes JSON with sorted object keys, omitted undefined fields and preserved array order. Operation identity derives from Session/message/call/action; event identity derives from execution Session and operation key. Retained entries query versioned event types within project and execution scope, decode each row and reject scope/receipt mismatches. Placement is re-resolved before reuse. A repeated operation with a different input hash or multiple matching records fails conflict. This is retained evidence identity, not a proof of the truth of admitted source text. [4]
15: 
16: ## Normative intent and limits
17: 
18: The bodies establish acquisition, readiness, resource-cap and evidence-ledger boundaries. Individual engine manifests, parsers, language indexes, sandbox build adapters and research source/document validation remain owned by the corresponding toolkit/leaf families in coverage. No engine install, language server, index build, source admission or research publication was executed. “Ready” here describes the source predicate, not a current host observation.
19: 
20: ## Source anchors
21: 
22: - **1.** `packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — state, prepare, acquire and readiness, lines 17–107,108–179,180–279.
23: - **2.** `packages/core/src/backend-toolkit/README.md:a7efc8b49f165ad767f51cb49ad9bdbb220215d1` — pack ownership, lockfiles and generated entry skills, lines 1–24.
24: - **3.** `packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — caps, adapter boundary, prewarm and shard status, lines 15–107,150–218,220–300.
25: - **4.** `packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` — canonical identity, retained scope and replay, lines 30–84,145–157.
```

### `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a3-v1-dossier.md`

Commit `a8df22ae3a140c58c63f62ce2a634c84f415c943` · Git blob `285e56c1680153ce75c71fd99bcf9455bde70d4d` · SHA-256 `36416073165d59eec9c7d847a26f414d855cc2a40758d548f4dd49669dccc5d4` · 177076 bytes.

Linhas 485–499 · trecho SHA-256 `c9faac484a61be97dc77c2cf9091742d9f8947fa5c929d44ac3591e185d4bf79`:

```text
485: ### backend-toolkit — 59 entradas
486: 
487: **Profundidades originais:** `decisive_source_read`=2, `grouped_generated_contract`=1, `grouped_support_contract`=4, `grouped_validation_inventory`=13, `representative_family_boundary`=39.
488: 
489: **Read status original:** `not_read`=57, `semantically_read_decisive_ranges`=2.
490: 
491: **Rota original:** `s1.core.research`. **Artefatos que de fato citam fontes da família:** `s1.core.research`.
492: 
493: **Fontes decisivas listadas no original:** `packages/core/src/backend-toolkit/README.md`, `packages/core/src/backend-toolkit/index.ts`.
494: 
495: **Razões originais aplicáveis:** R013, R022, R041, R074, R103.
496: 
497: **Alcance sustentado (explicitação):** O entry e README sustentam aquisição por pin, piso do host, readiness composto e ownership dos packs/gerados.
498: 
499: **Obrigação/lacuna retida (explicitação):** Os manifests, downloaders, adapters, pins e gerador não foram validados como um conjunto funcional. Um engine ou alteração de pin exige esses inputs e qualificação autorizada do alvo; um marcador não basta.
```

Linhas 587–601 · trecho SHA-256 `11b6d5a7e64d22347f1a6f4dbde2c59f97a61b307660eaeebd00cfcbb1b47941`:

```text
587: ### research — 71 entradas
588: 
589: **Profundidades originais:** `decisive_source_read`=2, `grouped_support_contract`=3, `grouped_validation_inventory`=28, `representative_family_boundary`=38.
590: 
591: **Read status original:** `not_read`=69, `semantically_read_decisive_ranges`=2.
592: 
593: **Rota original:** `s1.core.research`. **Artefatos que de fato citam fontes da família:** `s1.core.research`.
594: 
595: **Fontes decisivas listadas no original:** `packages/core/src/research-toolkit/index.ts`, `packages/core/src/research/ledger.ts`.
596: 
597: **Razões originais aplicáveis:** R013, R060, R091, R107.
598: 
599: **Alcance sustentado (explicitação):** ResearchToolkit e Ledger sustentam caps, adapter vazio padrão, status best effort e identidade/replay da evidência.
600: 
601: **Obrigação/lacuna retida (explicitação):** 38 leaves e três inputs não lidos retêm validação de documentos, índices, parsers e sandbox builds. Planejamento que falhou e virou lista vazia não comprova cobertura; conteúdo admitido não comprova sua verdade.
```

## E02 — Ownership, gerado e tipos de manifesto

### `packages/core/src/backend-toolkit/README.md`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a7efc8b49f165ad767f51cb49ad9bdbb220215d1` · SHA-256 `c121de28e34b278db6e4868eeea3b09ab793c1aca1cdf0b5c304cc9d8a12529d` · 1411 bytes.

Linhas 1–32 · trecho SHA-256 `c121de28e34b278db6e4868eeea3b09ab793c1aca1cdf0b5c304cc9d8a12529d`:

```text
1: # Backend toolkit domain
2: 
3: ## Purpose and ownership
4: 
5: - Engine (core-owned): `index.ts` (`@orchestra/core/backend-toolkit`), `hosted.ts`, `launcher.ts`, `manifest.ts`, `target.ts`, `runtimes/`.
6: - Packs (`packs/`, `entry-skills.gen.ts`) describe each pinned engine: how to acquire it and which entry skills it exposes.
7: 
8: ## Public entry points and consumers
9: 
10: - Consumers include `apps/cli/src/commands/handlers/toolkit/` and `modules/maestro/coordination/src/v2/tools/atlas-memory.ts`.
11: 
12: ## Dependencies and boundaries
13: 
14: - The engine must not import product code.
15: 
16: ## Assets, schemas and generated files
17: 
18: - `packages/core/src/backend-toolkit/entry-skills.gen.ts` is generated from `modules/specialists/backend/skills` by `packages/core/script/toolkit-pack.ts`; never edit it by hand. The `*.package-lock.json` files under `packs/` are pinned inputs.
19: 
20: ## Persistence, identity and lifetime
21: 
22: - Acquired engines live in a cache root that defaults to `BACKEND_TOOLKIT_ROOT` or `backend-toolkit` under the global cache directory.
23: 
24: ## Commands
25: 
26: - `bun run test:ci core test/backend-toolkit` from the repository root runs the toolkit tests.
27: - `bun typecheck` in `packages/core`.
28: - `.github/workflows/toolkit-arm.yml` is a manual workflow that runs the toolkit on Arm hosts.
29: 
30: ## Contracts and verification limits
31: 
32: - `packages/core/src/backend-toolkit/target.ts` is listed in `script/spawn-allowlist.json` and is path-pinned.
```

### `packages/core/src/backend-toolkit/entry-skills.gen.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9bc0ef240df1d2f6cd08d0480604852e550015b0` · SHA-256 `5b46f884721943ba81cdaffebbb81ad5c031392bc812209794eaec01e1ef568b` · 273 bytes.

Linhas 1–10 · trecho SHA-256 `5b46f884721943ba81cdaffebbb81ad5c031392bc812209794eaec01e1ef568b`:

```text
1: // Generated from modules/specialists/backend/skills by script/toolkit-pack.ts skills.
2: export const ENTRY_SKILLS = [
3:   "backend-api",
4:   "backend-check",
5:   "backend-codegen",
6:   "backend-concurrency",
7:   "backend-data",
8:   "backend-implement",
9:   "backend-refactor",
10: ] as const
```

### `packages/core/src/backend-toolkit/manifest.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d756770cd4679a9c3c983703b2f7deae8ea1cced` · SHA-256 `2fdbb18ddc44c50456322b2fc55ed1d1c3fd7d69f15cf807c5a2a40c0231f63d` · 5839 bytes.

Linhas 13–123 · trecho SHA-256 `37bd14d122f7dde92f4c0780a0923993e24d287ba84491ac64c8e43391413156`:

```text
13: // Ruling M6-1: every engine is one pack file under `packs/`, listed once in `packs/index.ts`; its id is the key.
14: export { ENGINES, ENTRY_SKILLS }
15: 
16: export type EngineId = keyof typeof ENGINES
17: 
18: export type RuntimeId = "node" | "java" | "python" | "go" | "rust"
19: 
20: export const RUNTIMES: Readonly<Record<RuntimeId, Runtime>> = { node, java, python, go, rust }
21: 
22: /** The entry skills a pack's recipe serves. */
23: export type EntrySkill = (typeof ENTRY_SKILLS)[number]
24: 
25: /** One engine file: its pinned engine data plus where it fits in the backend specialist's work (ruling M6-1). */
26: export type Pack = Engine<string> & {
27:   readonly fit: {
28:     /** A generator writes artifacts from an input; a check reads one and reports. */
29:     readonly role: "generator" | "check"
30:     /** What the packet supplies, e.g. "an OpenAPI v3 description". */
31:     readonly input: string
32:     /** Entry skills whose work the engine serves; empty for a host-side engine with no recipe. */
33:     readonly skills: ReadonlyArray<EntrySkill>
34:   }
35: }
36: 
37: /** A private interpreter shared by every hosted engine that names it (ruling M4-1). */
38: export type Runtime = {
39:   readonly id: RuntimeId
40:   readonly version: string
41:   readonly license: string
42:   readonly upstream: string
43:   /** Measured host floor per target (F5.4): what the interpreter or toolchain itself needs. */
44:   readonly floor?: Readonly<Partial<Record<TargetId, Floor>>>
45:   /** Per target: the pinned archive and the install-relative interpreter, e.g. `bin/node` or `python.exe`. */
46:   readonly targets: Readonly<
47:     Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>
48:   >
49: }
50: 
51: /** An engine that runs on a private runtime; every byte of its own install is pinned. */
52: export type HostedEngine<Id extends string = string> = {
53:   readonly id: Id
54:   readonly version: string
55:   readonly license: string
56:   readonly upstream: string
57:   /**
58:    * Measured host floor per target (F5.4): what this pack's own binaries need, beyond its runtime and dependencies.
59:    * Absent for a target means the pack adds none (pure script, jar, or a binary the host builds itself).
60:    */
61:   readonly floor?: Readonly<Partial<Record<TargetId, Floor>>>
62:   /** Owned engines made ready before this engine; ids and cycles are checked before acquisition. */
63:   readonly dependencies?: ReadonlyArray<string>
64:   /** Launcher environment; values may use `{install}` and `{runtime}`. */
65:   readonly env?: Readonly<Record<string, string>>
66:   readonly runtime: RuntimeId
67:   /**
68:    * `npm`: `npm ci --ignore-scripts` with the runtime's bundled npm over a lockfile carrying an integrity for every
69:    * package. `pip`: `pip install --require-hashes --no-deps --only-binary=:all:` over a hash list covering every target.
70:    * `jar`: the raw jar. `source` (ruling M5-1): the upstream source archive, whose entries must lay the source root at
71:    * `src`, built by the runtime toolchain; go's `path` is the package dir inside the module, cargo's the crate dir.
72:    */
73:   readonly install:
74:     | { readonly kind: "npm"; readonly packageJson: string; readonly lock: string }
75:     | { readonly kind: "pip"; readonly requirements: string }
76:     | { readonly kind: "jar"; readonly artifact: PinnedArtifact.Artifact }
77:     | {
78:         readonly kind: "source"
79:         readonly artifact: PinnedArtifact.Artifact
80:         readonly build: "go" | "cargo"
81:         readonly path: string
82:         /** The built executable's name without `.exe`. */
83:         readonly binary: string
84:         /** Owned, hash-pinned driver backport; valid only for gocqlx-schemagen's Go build. */
85:         readonly compatibility?: "cassandra-metadata"
86:         /** Cargo only. */
87:         readonly features?: ReadonlyArray<string>
88:         /** Cargo release optimization; plan-check CLIs can trade execution speed for bounded cold builds. */
89:         readonly optLevel?: 0 | 1 | 2 | 3
90:       }
91:   /**
92:    * Arguments after the runtime interpreter; `{install}` and `{runtime}` expand to the two install directories. Empty
93:    * for a `source` engine, whose launcher runs the built binary.
94:    */
95:   readonly launch: ReadonlyArray<string>
96:   /** Targets the engine cannot be made ready on, with the reason, e.g. `needs-msvc-linker`. */
97:   readonly unsupported?: Readonly<Partial<Record<TargetId, string>>>
98: }
99: 
100: /**
101:  * One pinned engine. The id type defaults to any string so the lifecycle in `index.ts` serves every toolkit's manifest
102:  * (J6.1); `EngineId` names the backend's own ids.
103:  */
104: export type Engine<Id extends string = string> = NativeEngine<Id> | HostedEngine<Id>
105: 
106: export type NativeEngine<Id extends string = string> = {
107:   readonly id: Id
108:   readonly version: string
109:   /** SPDX identifier of the upstream license. */
110:   readonly license: string
111:   /** Upstream `owner/repo`. */
112:   readonly upstream: string
113:   /** Measured host floor per target (F5.4) of the downloaded binary; native engines record every target. */
114:   readonly floor?: Readonly<Partial<Record<TargetId, Floor>>>
115:   /** Owned engines made ready before this engine; ids and cycles are checked before acquisition. */
116:   readonly dependencies?: ReadonlyArray<string>
117:   /** Child-scoped environment for every invocation of the engine. */
118:   readonly env?: Readonly<Record<string, string>>
119:   /** Per target: the pinned download and the install-relative executable it provides. */
120:   readonly targets: Readonly<
121:     Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>
122:   >
123: }
```

## E03 — Dependências, preparo e readiness

### `packages/core/src/backend-toolkit/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` · SHA-256 `d420651f26050d31c924b078a59fff12081be914cb8cb94685aad720a9275d9a` · 15426 bytes.

Linhas 27–67 · trecho SHA-256 `47dcdc4f39ce93683a18a9b9e40eb3f1ea393670dd013fd877bab83047b40d85`:

```text
27: export type EngineState =
28:   | { readonly status: "absent" }
29:   | { readonly status: "fetching"; readonly at: number; readonly budgetMs: number }
30:   | { readonly status: "ready"; readonly directory: string; readonly executable: string }
31:   | { readonly status: "failed"; readonly cause: string; readonly at: number }
32:   | { readonly status: "unsupported"; readonly reason: string }
33: 
34: /**
35:  * One engine's state on one target; `target` is absent only when the host has no supported target. Generic over the
36:  * engine id so another toolkit (the discovery seat's research toolkit, J6.1) runs this lifecycle over its own manifest.
37:  */
38: export type State<Id extends string = EngineId> = { readonly engine: Id; readonly version: string; readonly target?: TargetId } & EngineState
39: 
40: /** Cache root holding one install directory per engine version and target. */
41: export const Root = Context.Reference<string>("@orchestra/BackendToolkit/Root", {
42:   defaultValue: () => process.env.BACKEND_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "backend-toolkit"),
43: })
44: 
45: /** The engines this lifecycle serves; a toolkit over other ids provides its own manifest together with its own Root. */
46: export const Manifest = Context.Reference<Readonly<Record<string, Engine>>>("@orchestra/BackendToolkit/Manifest", {
47:   defaultValue: () => ENGINES,
48: })
49: 
50: export const Runtimes = Context.Reference<Readonly<Record<RuntimeId, Runtime>>>("@orchestra/BackendToolkit/Runtimes", {
51:   defaultValue: () => RUNTIMES,
52: })
53: 
54: /** The host's toolkit target, or why it has none. */
55: export const Target = Context.Reference<ReturnType<typeof detect>>("@orchestra/BackendToolkit/Target", {
56:   defaultValue: () => detect(),
57: })
58: 
59: /** The host the measured floors of F5.4 are checked against; tests inject descriptions instead of probing. */
60: export const Machine = Context.Reference<Host>("@orchestra/BackendToolkit/Machine", {
61:   defaultValue: () => current(),
62: })
63: 
64: // Acquisition outlives a shell call. A cold source build must not consume an entire model scenario in silence.
65: const PREPARE_MS = 60_000
66: 
67: export const status = Effect.fn("BackendToolkit.status")(function* <Id extends string = EngineId>(engine?: Id) {
```

Linhas 80–134 · trecho SHA-256 `3754ec0c6086de3f75d29ec58d4c802462bf79e1c9280952a68a938eec76dc29`:

```text
80: export const ensure = Effect.fn("BackendToolkit.ensure")(function* <Id extends string = EngineId>(engine: Id) {
81:   const host = yield* Target
82:   if ("unsupported" in host) return yield* new NotReady({ reason: `unsupported-target:${host.unsupported}` })
83:   return yield* request(engine, host.target, true)
84: })
85: 
86: /** Fetch engines (all by default) for a target (the host's by default); shims are written only for the host target. */
87: export const prefetch = Effect.fn("BackendToolkit.prefetch")(function* <Id extends string = EngineId>(
88:   engines?: ReadonlyArray<Id>,
89:   target?: TargetId,
90: ): Effect.fn.Return<ReadonlyArray<State<Id>>> {
91:   const manifest = yield* Manifest
92:   const host = yield* Target
93:   const ids = engines ?? Object.values(manifest).map((item) => item.id as Id)
94:   const chosen = target ?? ("target" in host ? host.target : undefined)
95:   if (!chosen) return yield* status<Id>().pipe(Effect.map((all) => all.filter((state) => ids.includes(state.engine))))
96:   yield* Effect.forEach(ids, (id) => request(id, chosen, "target" in host && host.target === chosen).pipe(Effect.ignore), {
97:     concurrency: "unbounded",
98:     discard: true,
99:   })
100:   return yield* states(ids, chosen)
101: })
102: 
103: /**
104:  * The toolkit environment for one shell command. Engines named through BACKEND_TOOLKIT_BIN and their owned dependencies
105:  * acquire on demand. A command naming none never fetches. A cold acquisition exceeding the shell wait returns a named
106:  * fetching blocker while acquisition continues; `ensure`/`prefetch` await the install budget.
107:  */
108: export const prepare = Effect.fn("BackendToolkit.prepare")(function* (command: string, callerEnv: NodeJS.ProcessEnv = process.env) {
109:   const root = yield* Root
110:   const manifest = yield* Manifest
111:   // `$BACKEND_TOOLKIT_BIN/<id>`, `${BACKEND_TOOLKIT_BIN}/<id>`, `"$BACKEND_TOOLKIT_BIN"/<id>` and PowerShell's
112:   // `$env:BACKEND_TOOLKIT_BIN\<id>.cmd`, with either separator.
113:   const named = Object.values(manifest)
114:     .map((engine) => engine.id)
115:     .filter((id) =>
116:       new RegExp(String.raw`\$(?:env:)?(?:BACKEND_TOOLKIT_BIN|\{BACKEND_TOOLKIT_BIN\})"?[\\/]${id}(?![\w-])`).test(
117:         command,
118:       ),
119:     )
120:   const env = {
121:     BACKEND_TOOLKIT_BIN: path.join(root, "bin"),
122:     ...(named.some((id) => manifest[id].dependencies?.length)
123:       ? { PATH: [path.join(root, "bin"), callerEnv.PATH ?? callerEnv.Path ?? ""].join(path.delimiter) }
124:       : {}),
125:   }
126:   const blocked = yield* Effect.forEach(named, (id) => ensure(id).pipe(Effect.timeoutOrElse({
127:     duration: PREPARE_MS,
128:     orElse: () => Effect.fail(new NotReady({ reason: `toolkit-not-ready:fetching:${id}` })),
129:   })), { concurrency: "unbounded", discard: true }).pipe(
130:     Effect.match({ onSuccess: () => undefined, onFailure: (error) => error.reason }),
131:   )
132:   if (blocked) return { env, blocked }
133:   return { env }
134: })
```

Linhas 137–279 · trecho SHA-256 `14822657d31b3c458a0737583a1414f09dce7b6c33637d8a330db39a11ea90ce`:

```text
137: export function dependencyOrder(manifest: Readonly<Record<string, Engine>>, id: string): string[] | string {
138:   const active = new Set<string>()
139:   const done = new Set<string>()
140:   const ordered: string[] = []
141:   const visit = (current: string): string | undefined => {
142:     const engine = Object.entries(manifest).find(([key]) => key === current)?.[1]
143:     if (!engine) return `toolkit-dependency-missing:${current}`
144:     if (active.has(current)) return `toolkit-dependency-cycle:${[...active, current].join("->")}`
145:     if (done.has(current)) return
146:     active.add(current)
147:     for (const dependency of engine.dependencies ?? []) {
148:       const failure = visit(dependency)
149:       if (failure) return failure
150:     }
151:     active.delete(current)
152:     done.add(current)
153:     if (current !== id) ordered.push(engine.id)
154:   }
155:   return visit(id) ?? ordered
156: }
157: 
158: /**
159:  * Why the host is below the measured floor of an engine, its owned dependencies or the runtimes they run on (F5.4),
160:  * e.g. `glibc-below-2.34`. Each pack records only what its own binaries need, so the engine's floor is the maximum.
161:  */
162: function belowFloor(
163:   manifest: Readonly<Record<string, Engine>>,
164:   runtimes: Readonly<Record<RuntimeId, Runtime>>,
165:   id: string,
166:   target: TargetId,
167:   machine: Host,
168: ) {
169:   const order = dependencyOrder(manifest, id)
170:   if (typeof order === "string") return
171:   return [id, ...order]
172:     .flatMap((engine) => {
173:       const item = manifest[engine]
174:       return [item.floor?.[target], "runtime" in item ? runtimes[item.runtime].floor?.[target] : undefined]
175:     })
176:     .map((floor) => below(machine, target, floor))
177:     .find((reason) => reason !== undefined)
178: }
179: 
180: const request = Effect.fnUntraced(function* (id: string, target: TargetId, host: boolean) {
181:   const root = yield* Root
182:   const manifest = yield* Manifest
183:   const runtimes = yield* Runtimes
184:   const machine = yield* Machine
185:   const dependencies = dependencyOrder(manifest, id)
186:   if (typeof dependencies === "string") return yield* new NotReady({ reason: dependencies })
187:   const engine = manifest[id]
188:   const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
189:   if (unsupported) return yield* new NotReady({ reason: `unsupported-target:${unsupported}` })
190:   // Before any fetch. A cross-target prefetch (`host` false) is never executed here, so it has no floor to meet.
191:   const floor = host ? belowFloor(manifest, runtimes, id, target, machine) : undefined
192:   if (floor) return yield* new NotReady({ reason: `unsupported-target:${id}:${floor}` })
193:   const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
194:   const cause = yield* attempts.once(requestKey(directory, host), Effect.gen(function* () {
195:     yield* Effect.forEach([...dependencies, id], (dependency) => acquire(root, manifest[dependency], runtimes, target, host), { discard: true })
196:   }))
197:   if (cause !== undefined) return yield* new NotReady({ reason: cause.startsWith("toolkit-not-ready:") || cause.startsWith("unsupported-target:") ? cause : `toolkit-not-ready:failed:${id}:${cause}` })
198:   return { executable: executable(engine, directory, target) }
199: })
200: 
201: const requestKey = (directory: string, host: boolean) => `${directory}:request:${host ? "host" : "cross"}`
202: 
203: const acquire = Effect.fnUntraced(function* (root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, target: TargetId, host: boolean) {
204:   const id = engine.id
205:   const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
206:   const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
207:   if (unsupported) return yield* new NotReady({ reason: `unsupported-target:${unsupported}` })
208:   const work =
209:     "runtime" in engine
210:       ? hosted(root, engine, runtimes, directory, target, host)
211:       : PinnedArtifact.install(directory, [engine.targets[target].artifact]).pipe(
212:           Effect.andThen(
213:             host
214:               ? shim(root, engine.id, launchText(root, engine, runtimes, directory, target))
215:               : Effect.void,
216:           ),
217:         )
218:   const cause = yield* attempts.once(directory, work.pipe(Effect.andThen(Effect.gen(function* () {
219:     const missing = yield* readiness(root, engine, runtimes, directory, target, host)
220:     if (missing) return yield* new PinnedArtifact.Failed({ cause: missing })
221:   }))))
222:   if (cause !== undefined) return yield* new NotReady({ reason: `toolkit-not-ready:failed:${id}:${cause}` })
223:   return { executable: executable(engine, directory, target) }
224: })
225: 
226: const states = Effect.fnUntraced(function* <Id extends string>(ids: ReadonlyArray<Id>, target: TargetId) {
227:   const root = yield* Root
228:   const manifest = yield* Manifest
229:   const runtimes = yield* Runtimes
230:   const host = yield* Target
231:   const machine = yield* Machine
232:   const local = "target" in host && host.target === target
233:   return yield* Effect.forEach(ids, (id) =>
234:     Effect.gen(function* () {
235:       const engine = manifest[id]
236:       const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
237:       const base = { engine: id, version: engine.version, target }
238:       const dependencies = dependencyOrder(manifest, id)
239:       if (typeof dependencies === "string") return { ...base, status: "failed", cause: dependencies, at: 0 } satisfies State<Id>
240:       const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
241:       if (unsupported) return { ...base, status: "unsupported", reason: unsupported } satisfies State<Id>
242:       const floor = local ? belowFloor(manifest, runtimes, id, target, machine) : undefined
243:       if (floor) return { ...base, status: "unsupported", reason: floor } satisfies State<Id>
244:       // A complete parent artifact cannot hide a failed request, missing dependency, launcher or host shim.
245:       for (const dependency of [id, ...dependencies]) {
246:         const item = manifest[dependency]
247:         const install = path.join(root, "engines", dependency, `${item.version}-${target}`)
248:         const excluded = "runtime" in item ? item.unsupported?.[target] : undefined
249:         if (excluded) return { ...base, status: "unsupported", reason: excluded } satisfies State<Id>
250:         for (const key of [requestKey(install, local), install]) {
251:           const attempt = attempts.get(key)
252:           if (attempt && "running" in attempt) return { ...base, status: "fetching", at: attempt.at, budgetMs: INSTALL_MS } satisfies State<Id>
253:           if (attempt && "failed" in attempt) {
254:             const prefix = `toolkit-not-ready:failed:${id}:`
255:             return { ...base, status: "failed", cause: dependency !== id ? `dependency:${dependency}:${attempt.failed}`
256:               : attempt.failed.startsWith(prefix) ? attempt.failed.slice(prefix.length) : attempt.failed, at: attempt.at } satisfies State<Id>
257:           }
258:         }
259:         if (yield* readiness(root, item, runtimes, install, target, local)) return { ...base, status: "absent" } satisfies State<Id>
260:       }
261:       return { ...base, status: "ready", directory, executable: executable(engine, directory, target) } satisfies State<Id>
262:     }),
263:   )
264: })
265: 
266: /** Cache markers alone are not executable readiness. Status observes; acquisition repairs launchers before success. */
267: const readiness = Effect.fnUntraced(function* (root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, directory: string, target: TargetId, host: boolean) {
268:   if (!(yield* PinnedArtifact.installed(directory))) return "install-incomplete"
269:   if (!(yield* fileReady(executable(engine, directory, target), target))) return "executable-missing"
270:   if ("runtime" in engine) {
271:     const runtime = runtimes[engine.runtime]
272:     const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
273:     if (!(yield* PinnedArtifact.installed(home)) || !(yield* fileReady(path.join(home, runtime.targets[target].executable), target))) return "runtime-executable-missing"
274:   }
275:   if (!host) return
276:   const file = path.join(root, "bin", target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
277:   if (!(yield* fileReady(file, target))) return "host-shim-missing"
278:   if ((yield* Effect.promise(() => readFile(file, "utf8").catch(() => undefined))) !== launchText(root, engine, runtimes, directory, target)) return "host-shim-stale"
279: })
```

## E04 — Aquisição compartilhada e cooldown

### `packages/core/src/backend-toolkit/acquisition.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9d55862001f9a206018a288d9847ca7d1811b2c9` · SHA-256 `11b7834f6537e1d2556136dc50306dc3bda0a3381cca07f640b5c93e2f8c54d8` · 1870 bytes.

Linhas 8–33 · trecho SHA-256 `ef1015ea9b499f20edcaf0e825e9bc2071cd3229573af0c5edebe778db507e9a`:

```text
8: 
9: /** Own the entire work independently of every waiter, and settle every Exit before allowing another attempt. */
10: export function make<E>(retryMs: number, describe: (cause: Cause.Cause<E>) => string) {
11:   const attempts = new Map<string, Attempt>()
12:   const once = Effect.fnUntraced(function* (key: string, work: Effect.Effect<unknown, E>) {
13:     const attempt = attempts.get(key)
14:     if (attempt && "running" in attempt) return yield* Effect.promise(() => attempt.running)
15:     if (attempt && Date.now() - attempt.at < retryMs) return attempt.failed
16:     const running = Promise.withResolvers<string | undefined>()
17:     attempts.set(key, { running: running.promise, at: Date.now() })
18:     const settle = (failed?: string) => {
19:       if (failed === undefined) attempts.delete(key)
20:       if (failed !== undefined) attempts.set(key, { failed, at: Date.now() })
21:       running.resolve(failed)
22:     }
23:     // Even a runner rejection or a throwing diagnostic formatter must resolve the shared promise. Neither exposes
24:     // uninspected exception text. Effect captures finalizer rejection, defects and interruption in the Exit.
25:     void Promise.resolve().then(() => Effect.runPromiseExit(work)).then((exit) => {
26:       if (Exit.isSuccess(exit)) return settle()
27:       const formatted = Effect.runSyncExit(Effect.sync(() => describe(exit.cause)))
28:       settle(Exit.isSuccess(formatted) && formatted.value ? formatted.value : "acquisition-diagnostics-unavailable")
29:     }, () => settle("acquisition-runtime-rejected"))
30:     return yield* Effect.promise(() => running.promise)
31:   })
32:   return { once, get: (key: string) => attempts.get(key) }
33: }
```

### `packages/core/src/backend-toolkit/attempts.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `320456d5837420999da0034870cedf86b5b8dc05` · SHA-256 `75382ae48fcc113ed71ea4a61d4122dc24b5ad5c6e4f3d5af52d3938688290eb` · 1652 bytes.

Linhas 8–33 · trecho SHA-256 `3a060c23fb8d55432ab0ac20165947384858590cca48d82134d9c0e82c51c56a`:

```text
8: /**
9:  * Acquisition failures name the engine and bounded installer cause. A shell wait can instead report
10:  * `toolkit-not-ready:fetching:<engine>` while acquisition continues; invalid graphs name the missing id or cycle.
11:  */
12: export class NotReady extends Schema.TaggedErrorClass<NotReady>()("BackendToolkit.NotReady", {
13:   reason: Schema.String,
14: }) {
15:   override get message() {
16:     return `Backend toolkit not ready: ${this.reason}`
17:   }
18: }
19: 
20: // A failed fetch is retried by a later need after this window, not by every command.
21: const RETRY_MS = 5 * 60_000
22: // A cold cargo build of a CLI with its whole dependency graph takes minutes.
23: export const INSTALL_MS = 30 * 60_000
24: 
25: // Install keys coalesce shared dependencies; request keys own continuation through the entire dependency chain.
26: export const attempts = BackendToolkitAcquisition.make<PinnedArtifact.Failed | NotReady>(RETRY_MS, (cause) => {
27:   const text = cause.reasons.map((reason) => {
28:     if (Cause.isFailReason(reason)) return reason.error instanceof NotReady ? reason.error.reason : reason.error.cause
29:     if (Cause.isInterruptReason(reason)) return "acquisition-interrupted"
30:     return `acquisition-defect:${reason.defect instanceof Error ? reason.defect.message : typeof reason.defect === "string" ? reason.defect : "unknown"}`
31:   }).join("; ")
32:   return BackendToolkitDiagnostics.details(text) ?? "acquisition-details-redacted"
33: })
```

## E05 — Targets, pisos e detecção permissiva

### `packages/core/src/backend-toolkit/target.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `38c19f508bf3c5ab49fdfb0e10b60d762cf9a457` · SHA-256 `fc76f5c887936816fc46826cacb01a4f19d04fe823ca16a82fac83f9337bffd7` · 6940 bytes.

Linhas 7–138 · trecho SHA-256 `4aadd645ef769318a2190b4c378a917ccbfaaf652881517dc413c560cb10de39`:

```text
7: /** The closed first-qualification target set, in npm `os`/`cpu` spelling. */
8: export type TargetId = "darwin-arm64" | "darwin-x64" | "linux-arm64" | "linux-x64" | "win32-x64"
9: 
10: export const TARGETS: ReadonlyArray<TargetId> = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"]
11: 
12: export type Host = {
13:   readonly platform: string
14:   readonly arch: string
15:   /** The Linux libc is musl rather than glibc. */
16:   readonly musl: boolean
17:   /** An x64 process translated by Rosetta on an Apple silicon Mac. */
18:   readonly rosetta: boolean
19:   /** The CPU reports AVX2. Only read on x64, where the toolkit claims AVX2 as its floor (F5.1). */
20:   readonly avx2: boolean
21:   /** `os.release()`: the Darwin kernel on macOS, the NT version on Windows. */
22:   readonly kernel: string
23:   /** The glibc version, e.g. `2.35`; absent when it could not be read, in which case no glibc floor is applied. */
24:   readonly glibc?: string
25: }
26: 
27: /**
28:  * The toolkit target for a host: an exact match or the reason there is none. Unlike the host installers it never
29:  * falls back to a payload built for another target, so a musl or Windows-on-ARM host is unsupported.
30:  */
31: export function detect(host: Host = current()): { readonly target: TargetId } | { readonly unsupported: string } {
32:   if (host.platform === "linux" && host.musl) return { unsupported: "libc-musl" }
33:   if (host.platform === "win32" && host.arch === "arm64") return { unsupported: "cpu-arm64-windows" }
34:   if (host.platform === "darwin" && host.arch === "x64" && host.rosetta) return { target: "darwin-arm64" }
35:   const target = TARGETS.find((id) => id === `${host.platform}-${host.arch}`)
36:   if (!target) return { unsupported: `platform-${host.platform}-${host.arch}` }
37:   const below = floor(host)
38:   return below ? { unsupported: below } : { target }
39: }
40: 
41: /**
42:  * Why a host on a supported target is still below the toolkit's floor. The OS minimums are Node 22's (glibc 2.28,
43:  * macOS 11 = Darwin 20, Windows 10), the runtime every hosted engine shares. They are lower bounds: the measured
44:  * floor of each pinned engine and runtime (F5.4) is recorded on its pack and checked per engine by `below`.
45:  */
46: function floor(host: Host) {
47:   if (host.arch === "x64" && !host.avx2) return "cpu-baseline"
48:   const kernel = Number.parseInt(host.kernel, 10)
49:   if (host.platform === "darwin" && kernel < 20) return "macos-below-11"
50:   if (host.platform === "win32" && kernel < 10) return "windows-below-10"
51:   // An unreadable glibc applies no floor.
52:   if (host.platform === "linux" && host.glibc && compareVersions(host.glibc, "2.28") < 0) return "glibc-below-2.28"
53: }
54: 
55: /** The minimum host an engine or runtime needs on one target, measured with `script/toolkit-floors.ts`. */
56: export type Floor = {
57:   /** Highest glibc symbol version the binaries import, e.g. `2.34`. */
58:   readonly glibc?: string
59:   /** Lowest macOS the binaries declare, e.g. `12.0`; only the major is compared (macOS 11-15 is Darwin N + 9, macOS 26 is Darwin 25). */
60:   readonly macos?: string
61:   /** Lowest Windows build the binaries import APIs from, e.g. `10.0.17763`. */
62:   readonly windows?: string
63: }
64: 
65: /** Numeric dotted-version order: `2.9` is older than `2.28`. */
66: export function compareVersions(a: string, b: string) {
67:   const left = a.split(".").map(Number)
68:   const right = b.split(".").map(Number)
69:   const length = Math.max(left.length, right.length)
70:   for (let index = 0; index < length; index++) {
71:     const difference = (left[index] ?? 0) - (right[index] ?? 0)
72:     if (difference) return difference
73:   }
74:   return 0
75: }
76: 
77: /**
78:  * Why a host is below a measured floor, as `glibc-below-2.34`, `macos-below-12` or `windows-below-10.0.17763`. A host
79:  * on another platform than the target (a cross-target prefetch) and an unreadable glibc apply no floor.
80:  */
81: export function below(host: Host, target: TargetId, floor: Floor | undefined) {
82:   if (!floor || !target.startsWith(host.platform)) return
83:   if (host.platform === "linux" && floor.glibc && host.glibc && compareVersions(host.glibc, floor.glibc) < 0)
84:     return `glibc-below-${floor.glibc}`
85:   const major = Number.parseInt(floor.macos ?? "", 10)
86:   if (host.platform === "darwin" && major >= 11 && Number.parseInt(host.kernel, 10) < (major >= 26 ? major - 1 : major + 9)) return `macos-below-${major}`
87:   if (host.platform === "win32" && floor.windows && compareVersions(host.kernel, floor.windows) < 0)
88:     return `windows-below-${floor.windows}`
89: }
90: 
91: // Probing spawns processes (ldd, sysctl), so the host is described once per process.
92: let probed: Host | undefined
93: 
94: export function current(): Host {
95:   if (probed) return probed
96:   const ldd = process.platform === "linux" ? lddOutput() : ""
97:   const rosetta =
98:     process.platform === "darwin" &&
99:     process.arch === "x64" &&
100:     spawnSync("sysctl", ["-in", "sysctl.proc_translated"], { encoding: "utf8" }).stdout?.trim() === "1"
101:   probed = {
102:     platform: process.platform,
103:     arch: process.arch,
104:     musl: process.platform === "linux" && (existsSync("/etc/alpine-release") || /musl/i.test(ldd)),
105:     rosetta,
106:     // A Rosetta process is mapped to the arm64 target, so the translated CPU's features never matter.
107:     avx2: process.arch === "x64" && !rosetta && hasAvx2(),
108:     kernel: release(),
109:     // glibc's `ldd --version` ends its first line with the version, e.g. `ldd (Ubuntu GLIBC 2.35-0ubuntu3.8) 2.35`.
110:     glibc: /\s(\d+\.\d+)\s*$/.exec(ldd.split("\n")[0] ?? "")?.[1],
111:   }
112:   return probed
113: }
114: 
115: function lddOutput() {
116:   // glibc's ldd prints its version on stdout; musl's prints its banner on stderr and exits non-zero.
117:   const result = spawnSync("ldd", ["--version"], { encoding: "utf8" })
118:   return `${result.stdout ?? ""}${result.stderr ?? ""}`
119: }
120: 
121: // Mirrors the host installer's probes (`apps/cli/distribution/install.sh`): an unreadable probe is "no AVX2".
122: function hasAvx2() {
123:   if (process.platform === "linux") {
124:     return existsSync("/proc/cpuinfo") && /(^|\s)avx2(\s|$)/i.test(readFileSync("/proc/cpuinfo", "utf8"))
125:   }
126:   if (process.platform === "darwin")
127:     return spawnSync("sysctl", ["-n", "hw.optional.avx2_0"], { encoding: "utf8", timeout: 1500 }).stdout?.trim() === "1"
128:   if (process.platform === "win32") {
129:     // bun:ffi exists only under Bun. Anywhere else there is no cheap probe, so the floor is skipped rather than guessed.
130:     if (!process.versions.bun) return true
131:     // The installer asks PowerShell, whose Add-Type compile can outlast any sane timeout on a cold machine; the same
132:     // kernel32 call through FFI is immediate. 40 is PF_AVX2_INSTRUCTIONS_AVAILABLE.
133:     const ffi: typeof import("bun:ffi") = require("bun:ffi")
134:     const kernel32 = ffi.dlopen("kernel32.dll", { IsProcessorFeaturePresent: { args: [ffi.FFIType.u32], returns: ffi.FFIType.bool } })
135:     return kernel32.symbols.IsProcessorFeaturePresent(40)
136:   }
137:   return false
138: }
```

## E06 — PinnedArtifact: integridade, staging e limites

### `packages/core/src/pinned-artifact.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `360018d80541459f1a6caab9d8b2de5653411fb6` · SHA-256 `896dbe5b74a60a2bcae81e9d7b4634aad178debddfeeeb452734552cd0aa504f` · 7384 bytes.

Linhas 20–156 · trecho SHA-256 `fe9eb698416834607041e60e9e62bbff16d11c1f9443b1bdd34126daad18a82c`:

```text
20:   readonly integrity: `sha256-${string}` | `sha512-${string}`
21:   /** A `raw` download is the file itself, named by the last segment of the URL path. */
22:   readonly format: "tar.gz" | "zip" | "raw"
23:   /** Archive-relative sources moved to install-relative destinations. */
24:   readonly entries: ReadonlyArray<{ readonly from: string; readonly to: string; readonly executable?: boolean }>
25: }
26: 
27: /**
28:  * `cause` is one of `download:<status>` (`download:network` when no response arrived), `integrity-mismatch`,
29:  * `integrity-unsupported`, `extract`, `extractor-missing:<bin>`, `layout` or `filesystem`.
30:  */
31: export class Failed extends Schema.TaggedErrorClass<Failed>()("PinnedArtifactFailed", {
32:   cause: Schema.String,
33: }) {
34:   override get message() {
35:     return `Pinned artifact install failed: ${this.cause}`
36:   }
37: }
38: 
39: const DOWNLOAD_MS = 10 * 60_000
40: const EXTRACT_MS = 10 * 60_000
41: 
42: /**
43:  * Download, verify and lay out every artifact in a staging dir, run `populate` over it, then move it into `directory`
44:  * in one rename.
45:  */
46: export const install = Effect.fn("PinnedArtifact.install")(function* (
47:   directory: string,
48:   artifacts: ReadonlyArray<Artifact>,
49:   populate?: (staging: string) => Effect.Effect<void, Failed>,
50: ) {
51:   if (yield* installed(directory)) return directory
52:   const parent = path.dirname(directory)
53:   yield* step("filesystem", () => mkdir(parent, { recursive: true }))
54:   const staging = yield* step("filesystem", () => mkdtemp(path.join(parent, ".staging-")))
55:   yield* Effect.gen(function* () {
56:     yield* Effect.forEach(artifacts, (artifact) => unpack(staging, artifact), { discard: true })
57:     if (populate) yield* populate(staging)
58:     yield* step("filesystem", () => writeFile(path.join(staging, ".complete"), ""))
59:     // A concurrent install may have renamed its staging dir first; its complete install wins.
60:     yield* step("filesystem", () => rename(staging, directory)).pipe(
61:       Effect.catch((error) =>
62:         installed(directory).pipe(Effect.flatMap((done) => (done ? Effect.void : Effect.fail(error)))),
63:       ),
64:     )
65:   }).pipe(Effect.ensuring(Effect.promise(() => rm(staging, { recursive: true, force: true }))))
66:   return directory
67: })
68: 
69: export const installed = (directory: string) =>
70:   Effect.promise(() =>
71:     access(path.join(directory, ".complete")).then(
72:       () => true,
73:       () => false,
74:     ),
75:   )
76: 
77: const unpack = Effect.fnUntraced(function* (staging: string, artifact: Artifact) {
78:   const separator = artifact.integrity.indexOf("-")
79:   const algorithm = artifact.integrity.slice(0, separator)
80:   if (algorithm !== "sha256" && algorithm !== "sha512") return yield* new Failed({ cause: "integrity-unsupported" })
81:   if (!artifact.entries.every((entry) => contained(entry.from) && contained(entry.to)))
82:     return yield* new Failed({ cause: "layout" })
83:   const extractor = artifact.format === "raw" ? undefined : command(artifact.format)
84:   if (extractor && !(yield* Effect.promise(() => which(extractor[0], { nothrow: true }))))
85:     return yield* new Failed({ cause: `extractor-missing:${extractor[0]}` })
86: 
87:   const response = yield* Effect.tryPromise({
88:     try: () => fetch(artifact.url, { redirect: "follow", signal: AbortSignal.timeout(DOWNLOAD_MS) }),
89:     catch: () => new Failed({ cause: "download:network" }),
90:   })
91:   if (!response.ok) return yield* new Failed({ cause: `download:${response.status}` })
92:   const bytes = yield* step("download:network", async () => new Uint8Array(await response.arrayBuffer()))
93:   // Nothing from the download reaches the disk before its digest matches the pin.
94:   if (createHash(algorithm).update(bytes).digest("base64") !== artifact.integrity.slice(separator + 1))
95:     return yield* new Failed({ cause: "integrity-mismatch" })
96: 
97:   const directory = yield* step("filesystem", () => mkdtemp(path.join(staging, ".unpack-")))
98:   const out = path.join(directory, "out")
99:   yield* step("filesystem", () => mkdir(out))
100:   yield* step("filesystem", () =>
101:     writeFile(
102:       extractor
103:         ? path.join(directory, `archive.${artifact.format}`)
104:         : path.join(out, path.posix.basename(new URL(artifact.url).pathname)),
105:       bytes,
106:     ),
107:   )
108:   if (extractor)
109:     yield* Effect.gen(function* () {
110:       const processService = yield* AppProcess.Service
111:       const result = yield* processService
112:         .run(
113:           ChildProcess.make(extractor[0], extractor.slice(1), {
114:             cwd: directory,
115:             env: process.env,
116:             forceKillAfter: "5 seconds",
117:           }),
118:           { timeout: EXTRACT_MS, maxOutputBytes: 64 * 1024 * 1024, maxErrorBytes: 64 * 1024 * 1024 },
119:         )
120:         .pipe(Effect.flatMap(AppProcess.requireSuccess))
121:       if (result.stdoutTruncated || result.stderrTruncated) return yield* new Failed({ cause: "extract" })
122:     }).pipe(
123:       Effect.provide(LayerNode.compile(AppProcess.node)),
124:       Effect.mapError(() => new Failed({ cause: "extract" })),
125:     )
126:   yield* Effect.forEach(
127:     artifact.entries,
128:     (entry) =>
129:       Effect.gen(function* () {
130:         const target = path.join(staging, entry.to)
131:         yield* step("filesystem", () => mkdir(path.dirname(target), { recursive: true }))
132:         yield* step("layout", () => rename(path.join(out, entry.from), target))
133:         if (entry.executable) yield* step("filesystem", () => chmod(target, 0o755))
134:       }),
135:     { discard: true },
136:   )
137:   yield* step("filesystem", () => rm(directory, { recursive: true, force: true }))
138: })
139: 
140: /** The extractor argv, run in the unpack dir with the download saved as `archive.<format>`, writing into `out`. */
141: function command(format: "tar.gz" | "zip") {
142:   if (format === "tar.gz") return ["tar", "-xzf", "archive.tar.gz", "-C", "out"]
143:   if (process.platform !== "win32") return ["unzip", "-q", "-o", "archive.zip", "-d", "out"]
144:   // Windows ships bsdtar, which reads zip without PowerShell's startup; Expand-Archive measured 5-10x slower and
145:   // outlasted test timeouts on loaded runners. The absolute path skips Git for Windows' GNU tar, which cannot read zip.
146:   return [path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), "-xf", "archive.zip", "-C", "out"]
147: }
148: 
149: /** A relative path that stays inside the directory it is resolved against. */
150: function contained(relative: string) {
151:   const normal = path.normalize(relative)
152:   return normal !== "." && path.parse(normal).root === "" && !normal.split(path.sep).includes("..")
153: }
154: 
155: const step = <A>(cause: string, run: () => Promise<A>) =>
156:   Effect.tryPromise({ try: run, catch: () => new Failed({ cause }) })
```

## E07 — Hosted: npm/pip/source e encerramento

### `packages/core/src/backend-toolkit/hosted.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `987657dcb1ce8d9cc9f623713673f99dd376e86c` · SHA-256 `6d3ea35691832eddb90ce8563679390a1030b71d636a01a4c5cd59ad78ebeb34` · 11390 bytes.

Linhas 38–225 · trecho SHA-256 `bedac427bae9131fec726d83fc8a27763ef4d95492e030ae424ba263ee4046d7`:

```text
38:   return Effect.gen(function* () {
39:     if (install.kind !== "jar" && !host)
40:       return yield* new PinnedArtifact.Failed({ cause: `cross-target:${install.kind}` })
41:     // The common runtime primitive owns the attempt, so capability callers and hosted engines share one download.
42:     yield* ToolkitRuntime.ensure({ root, runtime, target }).pipe(
43:       Effect.mapError((error) => new PinnedArtifact.Failed({ cause: `runtime-${error.cause}` })),
44:     )
45:     if (install.kind === "source" && install.compatibility && (engine.id !== "gocqlx-schemagen" || install.build !== "go"))
46:       return yield* new PinnedArtifact.Failed({ cause: "compatibility:cassandra-metadata:unsupported-engine" })
47:     yield* PinnedArtifact.install(
48:       directory,
49:       install.kind === "jar" || install.kind === "source"
50:         ? [install.artifact, ...(install.kind === "source" && install.compatibility ? [BackendToolkitCassandra.artifact] : [])]
51:         : [],
52:       (staging) =>
53:         // Compatibility preparation owns staging writes too; finish them before interrupted install cleanup.
54:         (install.kind === "source" && install.compatibility
55:           ? BackendToolkitCassandra.prepare(staging).pipe(Effect.uninterruptible)
56:           : Effect.void).pipe(Effect.andThen(Effect.suspend(() => {
57:           const pending: { work?: Promise<void> } = {}
58:           return Effect.tryPromise({
59:             try: (signal) =>
60:               (pending.work = (async () => {
61:                 if (install.kind === "npm") {
62:                   await writeFile(path.join(staging, "package.json"), install.packageJson)
63:                   await writeFile(path.join(staging, "package-lock.json"), install.lock)
64:                   // Node's Windows zip keeps npm beside node.exe; the POSIX tarballs keep it under lib/.
65:                   const npm = windows
66:                     ? path.join(path.dirname(interpreter), "node_modules", "npm", "bin", "npm-cli.js")
67:                     : path.join(home, "lib", "node_modules", "npm", "bin", "npm-cli.js")
68:                   await run(
69:                     interpreter,
70:                     [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline=false"],
71:                     staging,
72:                     {
73:                       npm_config_cache: path.join(root, "cache", "npm"),
74:                       npm_config_update_notifier: "false",
75:                     },
76:                     signal,
77:                   )
78:                 }
79:                 if (install.kind === "pip") {
80:                   const requirements = path.join(staging, "requirements.txt")
81:                   await writeFile(requirements, install.requirements)
82:                   await run(
83:                     interpreter,
84:                     [
85:                       "-m",
86:                       "pip",
87:                       "install",
88:                       "--require-hashes",
89:                       "--no-deps",
90:                       "--only-binary=:all:",
91:                       "--target",
92:                       staging,
93:                       "-r",
94:                       requirements,
95:                     ],
96:                     staging,
97:                     { PIP_CACHE_DIR: path.join(root, "cache", "pip"), PIP_DISABLE_PIP_VERSION_CHECK: "1" },
98:                     signal,
99:                   )
100:                 }
101:                 // Dependencies are pinned by the module's go.sum, checked against the checksum DB.
102:                 if (install.kind === "source" && install.build === "go")
103:                   await run(
104:                     interpreter,
105:                     ["build", "-trimpath", "-o", executable(engine, staging, target), install.path],
106:                     path.join(staging, "src"),
107:                     {
108:                       GOFLAGS: "-mod=readonly",
109:                       GOTOOLCHAIN: "local",
110:                       GOPATH: path.join(root, "cache", "go"),
111:                       GOCACHE: path.join(root, "cache", "go-build"),
112:                       GOPROXY: "https://proxy.golang.org",
113:                       GOSUMDB: "sum.golang.org",
114:                       CGO_ENABLED: "0",
115:                     },
116:                     signal,
117:                   )
118:                 // Dependencies are pinned by the crate's packaged Cargo.lock (`--locked`). Cargo runs `rustc` from PATH unless
119:                 // RUSTC names one, so it names the toolchain's own.
120:                 if (install.kind === "source" && install.build === "cargo")
121:                   await run(
122:                     interpreter,
123:                     [
124:                       "install",
125:                       "--path",
126:                       path.join(staging, "src", install.path),
127:                       "--locked",
128:                       "--root",
129:                       staging,
130:                       "--no-default-features",
131:                       ...(install.features?.length ? ["--features", install.features.join(",")] : []),
132:                     ],
133:                     path.join(staging, "src"),
134:                     {
135:                       CARGO_HOME: path.join(root, "cache", "cargo"),
136:                       CARGO_TARGET_DIR: path.join(root, "cache", "cargo-target"),
137:                       RUSTC: path.join(path.dirname(interpreter), windows ? "rustc.exe" : "rustc"),
138:                       ...(install.optLevel !== undefined ? { CARGO_PROFILE_RELEASE_OPT_LEVEL: String(install.optLevel) } : {}),
139:                     },
140:                     signal,
141:                   )
142:                 if (install.kind === "source") {
143:                   // Reject invalid builder output before PinnedArtifact publishes its complete cache.
144:                   if (!(await Effect.runPromise(fileReady(executable(engine, staging, target), target))))
145:                     throw new Error("source-executable-not-ready")
146:                   return
147:                 }
148:                 const file = executable(engine, staging, target)
149:                 await mkdir(path.dirname(file), { recursive: true })
150:                 await writeFile(file, text)
151:                 await chmod(file, 0o755)
152:               })()),
153:             catch: (error) =>
154:               new PinnedArtifact.Failed({
155:                 cause: installerCause(install.kind === "source" ? install.build : install.kind, error),
156:               }),
157:           }).pipe(
158:             // tryPromise aborts before its Promise settles. Join the nested root's process finalizers before install()
159:             // removes staging, including interruption during the async filesystem work preceding the spawn.
160:             Effect.onInterrupt(() =>
161:               Effect.promise(
162:                 () =>
163:                   pending.work?.then(
164:                     () => undefined,
165:                     () => undefined,
166:                   ) ?? Promise.resolve(),
167:               ),
168:             ),
169:           )
170:         }))),
171:     )
172:     // Existing complete pip caches used the engine id beside the packages. Refresh the private launcher without
173:     // reinstalling or touching pinned package bytes, so their advertised executable exists after a layout upgrade.
174:     if (install.kind === "pip") yield* shim(directory, engine.id, text, path.join(directory, ".launchers"))
175:     if (host) yield* shim(root, engine.id, text)
176:   })
177: }
178: 
179: const run = (
180:   file: string,
181:   args: ReadonlyArray<string>,
182:   cwd: string,
183:   env: Record<string, string>,
184:   signal: AbortSignal,
185: ) =>
186:   Effect.runPromise(
187:     Effect.gen(function* () {
188:       const processService = yield* AppProcess.Service
189:       const result = yield* processService
190:         .run(ChildProcess.make(file, args, { cwd, env: { ...BackendToolkitDiagnostics.environment(cwd), ...env }, forceKillAfter: "5 seconds" }), {
191:           timeout: INSTALL_MS,
192:           maxOutputBytes: 64 * 1024 * 1024,
193:           maxErrorBytes: 64 * 1024 * 1024,
194:         })
195:       // AppProcess caps capture without failing the run; an incomplete install log must still fail the install.
196:       if (result.stdoutTruncated || result.stderrTruncated)
197:         return yield* new AppProcess.AppProcessError({
198:           command: result.command,
199:           cause: new Error("Output exceeded 64 MiB"),
200:         })
201:       if (result.exitCode !== 0)
202:         return yield* new AppProcess.AppProcessError({
203:           command: result.command,
204:           exitCode: result.exitCode,
205:           stderr: result.stderr.toString(),
206:           cause: { stdout: result.stdout.toString() },
207:         })
208:     }).pipe(Effect.provide(LayerNode.compile(AppProcess.node))),
209:     { signal },
210:   )
211: /** Inspect whole captured output before truncating: a credential outside the retained tail still suppresses details. */
212: function installerCause(kind: string, error: unknown) {
213:   const prefix = `install:${kind}`
214:   if (!(error instanceof Error)) return prefix
215:   const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : ""
216:   const stdout = error instanceof AppProcess.AppProcessError && typeof error.cause === "object" && error.cause !== null &&
217:     "stdout" in error.cause && typeof error.cause.stdout === "string" ? error.cause.stdout
218:     : "stdout" in error && typeof error.stdout === "string" ? error.stdout : ""
219:   if (BackendToolkitDiagnostics.details(`${error.message}\n${stderr}\n${stdout}`) === undefined) return `${prefix}:details-redacted`
220:   const exit = error instanceof AppProcess.AppProcessError && error.cause instanceof Error && error.cause.message === "Timed out" ? `timeout:${INSTALL_MS}ms`
221:     : error instanceof AppProcess.AppProcessError && error.exitCode !== undefined ? `exit:${error.exitCode}`
222:     : "killed" in error && error.killed ? `timeout:${INSTALL_MS}ms`
223:     : "code" in error && (typeof error.code === "string" || typeof error.code === "number") ? `exit:${error.code}` : "failed"
224:   return `${prefix}:${exit}:${BackendToolkitDiagnostics.details(stderr || stdout || error.message) ?? "details-redacted"}`
225: }
```

## E08 — Launchers, shims e diagnóstico

### `packages/core/src/backend-toolkit/launcher.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `79c8f7643e6aa23fe628a597422f63d7a033aace` · SHA-256 `12a6f931b7e080fc25722c966b88822d572fd5ebec86ca52e9e8710ac59d7c36` · 4090 bytes.

Linhas 7–67 · trecho SHA-256 `09d4f5a18b1a8ef8967aad476da01a4166cf8707802bafd7c58e20889a427ac6`:

```text
7: import { Effect } from "effect"
8: import { PinnedArtifact } from "../pinned-artifact"
9: import type { Engine, Runtime, RuntimeId } from "./manifest"
10: import type { TargetId } from "./target"
11: 
12: export function executable(engine: Engine, directory: string, target: TargetId) {
13:   const install = "runtime" in engine ? engine.install : undefined
14:   if (install?.kind === "source") {
15:     const name = target === "win32-x64" ? `${install.binary}.exe` : install.binary
16:     // `go build -o` writes where it is told; `cargo install --root` writes under bin/.
17:     return install.build === "go" ? path.join(directory, name) : path.join(directory, "bin", name)
18:   }
19:   // A pip distribution can contain a package named exactly like the engine (sqlglot/). Never overwrite it with a launcher.
20:   if ("runtime" in engine) return path.join(directory, ...(install?.kind === "pip" ? [".launchers"] : []), target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
21:   return path.join(directory, engine.targets[target].executable)
22: }
23: 
24: export const fileReady = (file: string, target: TargetId) => Effect.promise(async () => {
25:   if (!(await stat(file).catch(() => undefined))?.isFile()) return false
26:   return access(file, target === "win32-x64" ? constants.F_OK : constants.X_OK).then(() => true, () => false)
27: })
28: 
29: export function launchText(root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, directory: string, target: TargetId) {
30:   const bin = engine.dependencies?.length ? path.join(root, "bin") : undefined
31:   if (!("runtime" in engine)) return launcher(target === "win32-x64", [executable(engine, directory, target)], engine.env ?? {}, bin)
32:   const runtime = runtimes[engine.runtime]
33:   const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
34:   const expand = (text: string) => text.replaceAll("{install}", directory).replaceAll("{runtime}", home)
35:   return launcher(target === "win32-x64",
36:     engine.install.kind === "source" ? [executable(engine, directory, target)] : [path.join(home, runtime.targets[target].executable), ...engine.launch.map(expand)],
37:     Object.fromEntries(Object.entries({ ...(engine.install.kind === "pip" ? { PYTHONPATH: "{install}" } : {}), ...engine.env }).map(([key, value]) => [key, expand(value)])), bin)
38: }
39: 
40: /** A launcher that runs `command` with the caller's arguments appended and `env` set for the child only. */
41: function launcher(windows: boolean, command: ReadonlyArray<string>, env: Readonly<Record<string, string>>, bin?: string) {
42:   const vars = Object.entries(env)
43:   if (windows)
44:     return ["@echo off", "setlocal", ...vars.map(([key, value]) => `set "${key}=${value}"`), ...(bin ? [`set "PATH=${bin};%PATH%"`] : []), `${command.map((part) => `"${part}"`).join(" ")} %*`, "exit /b %errorlevel%", ""].join("\r\n")
45:   return ["#!/bin/sh", ...vars.map(([key, value]) => `export ${key}=${quote(value)}`), ...(bin ? [`export PATH=${quote(bin)}:"$PATH"`] : []), `exec ${command.map(quote).join(" ")} "$@"`, ""].join("\n")
46: }
47: 
48: /** Write an engine's `<root>/bin` launcher through a temp file and one rename, skipping it when it is already current. */
49: export function shim(root: string, id: string, text: string, bin = path.join(root, "bin")) {
50:   return Effect.tryPromise({
51:     try: async () => {
52:       const file = path.join(bin, process.platform === "win32" ? `${id}.cmd` : id)
53:       if ((await readFile(file, "utf8").catch(() => undefined)) === text) return
54:       await mkdir(bin, { recursive: true })
55:       const temp = path.join(bin, `.${id}-${randomUUID()}`)
56:       await writeFile(temp, text)
57:       await chmod(temp, 0o755)
58:       await rename(temp, file).catch(async (error) => {
59:         await rm(temp, { force: true })
60:         throw error
61:       })
62:     },
63:     catch: () => new PinnedArtifact.Failed({ cause: "shim" }),
64:   })
65: }
66: 
67: const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`
```

### `packages/core/src/backend-toolkit/diagnostics.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `82c79df31ad65365a2945d516a2e890e2da0d9af` · SHA-256 `d556fb8a95fdaff9ca4ec23b8ff137f37c3a7547c8ceb4d2d83810e7c2c86814` · 1795 bytes.

Linhas 7–29 · trecho SHA-256 `664ed41f1116c8f10138c695ca8e4af3e6d9012d25539a77ea68020753217dba`:

```text
7: export function details(text: string, env: NodeJS.ProcessEnv = process.env) {
8:   const normalized = stripVTControlCharacters(text)
9:   if (OutputInspector.reason(text) || OutputInspector.reason(normalized)) return
10:   // These repository settings are boolean policy switches, not credential material (tests set the value to "0").
11:   if (Object.entries(env).some(([key, value]) => value && !/^ORCHESTRA_INHERIT_CREDENTIALS$/i.test(key) &&
12:     /(?:^|_)(?:SECRET|TOKEN|PASSWORD|CREDENTIALS?|AUTH|(?:API|ACCESS|PRIVATE|CLIENT)_KEY)$/i.test(key) &&
13:     (text.includes(value) || normalized.includes(stripVTControlCharacters(value))))) return
14:   return normalized.slice(-4096).trim()
15: }
16: 
17: /** Public pinned installers get build/search/temp paths, not ambient credentials or owner package-manager config. */
18: export function environment(cwd: string, env: NodeJS.ProcessEnv = process.env) {
19:   const allowed = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE",
20:     "SDKROOT", "DEVELOPER_DIR", "MACOSX_DEPLOYMENT_TARGET", "CC", "CXX", "AR", "INCLUDE", "LIB", "LIBPATH"])
21:   return {
22:     ...Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== undefined && allowed.has(key.toUpperCase()))),
23:     HOME: `${cwd}/.installer-home`,
24:     USERPROFILE: `${cwd}/.installer-home`,
25:     npm_config_userconfig: `${cwd}/.installer-home/npmrc`,
26:     npm_config_globalconfig: `${cwd}/.installer-home/global-npmrc`,
27:     PIP_CONFIG_FILE: process.platform === "win32" ? "NUL" : "/dev/null",
28:   }
29: }
```

## E09 — Guard de versão e parser de config

### `packages/core/src/backend-toolkit/project-version.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `00be68470409c48e585aa1ab764e6d8872ddd44e` · SHA-256 `c82bf83182a6d03b13755e5c97eed67bf4dd8298226bd9f79277c94bff94e263` · 11911 bytes.

Linhas 15–105 · trecho SHA-256 `c1e773b6f37076d2474097ebbe7289e5da5c75fc06f517b30892261793a0aaea`:

```text
15: }
16: 
17: // Deliberately bounded CLI grammar. Unknown flags/subcommands cannot bypass output discovery.
18: const VALUES = new Set([
19:   "-i", "--input-spec", "-g", "--generator-name", "-o", "--output", "-c", "--config",
20:   "-t", "--template-dir", "-p", "--additional-properties", "--global-property", "--library",
21:   "--api-package", "--model-package", "--invoker-package", "--package-name", "--artifact-id",
22:   "--artifact-version", "--group-id", "--git-host", "--git-user-id", "--git-repo-id",
23:   "--ignore-file-override", "--openapi-normalizer", "--type-mappings", "--import-mappings",
24:   "--schema-mappings", "--name-mappings", "--inline-schema-name-mappings", "--inline-schema-options",
25:   "--reserved-words-mappings", "--server-variables", "--operation-id-name-mappings", "--strict-spec",
26: ])
27: const SWITCHES = new Set([
28:   "--dry-run", "--minimal-update", "--skip-overwrite", "--skip-validate-spec", "--enable-post-process-file",
29:   "--remove-operation-id-prefix", "--log-to-stderr", "-v", "--verbose",
30: ])
31: 
32: /** Checks only owned OpenAPI generation calls; reads no project metadata for read-only subcommands. */
33: export const checkProjectVersion = Effect.fn("BackendToolkitProject.checkProjectVersion")(function* (input: {
34:   engine: "openapi-generator"
35:   argv: readonly string[]
36:   cwd: string
37:   projectDirectory: string
38: }) {
39:   if (["validate", "version", "help", "list", "config-help"].includes(input.argv[0])) return
40:   if (input.argv[0] !== "generate") return yield* blocked("unsupported-owned-call")
41:   const options = yield* Effect.try({ try: () => generationOptions(input.argv), catch: (error) =>
42:     error instanceof Blocked ? error : blocked("unsupported-owned-call") })
43:   const root = yield* Effect.tryPromise({
44:     try: () => realpath(input.projectDirectory),
45:     catch: () => blocked("unreadable-project"),
46:   })
47:   if (input.cwd.split(/[\\/]/).includes("..")) return yield* blocked("unbound-cwd")
48:   const cwd = yield* Effect.tryPromise({ try: () => realpath(input.cwd), catch: () => blocked("unreadable-cwd") })
49:   yield* physical(root, cwd, "cwd")
50:   if (options.config !== undefined && !boundPath(options.config)) return yield* blocked("unbound-config")
51:   const config = options.config === undefined ? undefined : yield* readMetadata(root, path.resolve(cwd, options.config), "config", true)
52:   const fields = config === undefined ? undefined : yield* document(config, "config", options.config?.endsWith(".json"))
53:   if (fields?.outputDir !== undefined && (typeof fields.outputDir !== "string" || !fields.outputDir.trim()))
54:     return yield* blocked("malformed-config")
55:   const output = options.output ?? (typeof fields?.outputDir === "string" ? fields.outputDir : undefined)
56:   if (!output || !boundPath(output)) return yield* blocked("unbound-output")
57:   if (options.output && typeof fields?.outputDir === "string" && path.resolve(cwd, options.output) !== path.resolve(cwd, fields.outputDir))
58:     return yield* blocked("conflicting-output")
59:   // Check the physical output even when it does not yet exist; symlink ancestors are not first generation.
60:   yield* physical(root, path.resolve(cwd, output), "output")
61:   const tools = yield* readMetadata(root, path.join(root, "openapitools.json"), "project-metadata")
62:   const project = tools === undefined ? undefined : yield* document(tools, "project-metadata", true)
63:   const cli = project?.["generator-cli"]
64:   if (cli !== undefined && (typeof cli !== "object" || cli === null || Array.isArray(cli)))
65:     return yield* blocked("malformed-project-metadata")
66:   const declared = cli !== undefined && "version" in cli ? cli.version : undefined
67:   const directory = path.resolve(cwd, output, ".openapi-generator")
68:   const metadata = yield* physical(root, directory, "output-metadata")
69:   const generated = yield* readMetadata(root, path.join(directory, "VERSION"), "output-metadata", metadata !== undefined)
70:   const pins = [declared, generated?.trim()].filter((pin) => pin !== undefined)
71:   if (pins.some((pin) => typeof pin !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pin)))
72:     return yield* blocked("malformed-version")
73:   const mismatch = pins.find((pin) => pin !== openapiGenerator.version)
74:   if (mismatch !== undefined)
75:     return yield* new Blocked({ reason: `engine-version-mismatch(project=${mismatch}, bundled=${openapiGenerator.version})` })
76: })
77: 
78: function blocked(reason: string) {
79:   return new Blocked({ reason: `engine-project-version:${reason}` })
80: }
81: 
82: function boundPath(file: string) {
83:   // No deferred substitution or symlink/.. normalization ambiguity in the supported path grammar.
84:   return !["\0", "$", "%", "~"].some((char) => file.includes(char)) && !file.split(/[\\/]/).includes("..")
85: }
86: 
87: function generationOptions(argv: readonly string[]) {
88:   const options: { output?: string; config?: string } = {}
89:   for (let i = 1; i < argv.length; i++) {
90:     const equal = argv[i].indexOf("=")
91:     const flag = equal < 0 ? argv[i] : argv[i].slice(0, equal)
92:     if (SWITCHES.has(flag) && equal < 0) continue
93:     if (!VALUES.has(flag)) throw blocked("unsupported-owned-call")
94:     const value = equal < 0 ? argv[++i] : argv[i].slice(equal + 1)
95:     if (!value || value.startsWith("-")) throw blocked("unbound-args")
96:     if (flag === "--strict-spec" && value !== "true" && value !== "false") throw blocked("unsupported-owned-call")
97:     if (flag === "-o" || flag === "--output") {
98:       if (options.output !== undefined) throw blocked("conflicting-output")
99:       options.output = value
100:     }
101:     if (flag === "-c" || flag === "--config") {
102:       if (options.config !== undefined) throw blocked("conflicting-config")
103:       options.config = value
104:     }
105:   }
```

Linhas 115–214 · trecho SHA-256 `d75050daf09826340f026b76b2c03094abfb15048cf6e76a392a31c754418ad0`:

```text
115: // Only lstat ENOENT means absent. Broken links, denied traversal and ENOTDIR are named failures.
116: const physical = Effect.fnUntraced(function* (root: string, file: string, kind: string) {
117:   if (!inside(root, file)) return yield* blocked(`escaping-${kind}`)
118:   const components = path.relative(root, file).split(path.sep).filter(Boolean)
119:   for (let i = 0; i < components.length; i++) {
120:     const candidate = path.join(root, ...components.slice(0, i + 1))
121:     const info = yield* Effect.tryPromise({
122:       try: () => lstat(candidate).catch((error: unknown) => {
123:         if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return undefined
124:         throw error
125:       }),
126:       catch: () => blocked(`unreadable-${kind}`),
127:     })
128:     if (!info) return undefined
129:     const resolved = yield* Effect.tryPromise({ try: () => realpath(candidate), catch: () => blocked(`unreadable-${kind}`) })
130:     if (!inside(root, resolved)) return yield* blocked(`escaping-${kind}`)
131:     if (i < components.length - 1 && !(yield* Effect.tryPromise({ try: () => lstat(resolved), catch: () => blocked(`unreadable-${kind}`) })).isDirectory())
132:       return yield* blocked(`malformed-${kind}`)
133:   }
134:   return file
135: })
136: 
137: const readMetadata = Effect.fnUntraced(function* (root: string, file: string, kind: string, required = false) {
138:   const resolved = yield* physical(root, file, kind)
139:   if (!resolved) {
140:     if (required) return yield* blocked(`missing-${kind}`)
141:     return undefined
142:   }
143:   const info = yield* Effect.tryPromise({ try: () => lstat(resolved), catch: () => blocked(`unreadable-${kind}`) })
144:   // realpath was checked above; a symlink to an in-project regular file is allowed.
145:   const target = yield* Effect.tryPromise({ try: () => realpath(resolved).then(lstat), catch: () => blocked(`unreadable-${kind}`) })
146:   if ((!info.isFile() && !info.isSymbolicLink()) || !target.isFile() || target.size > 1024 * 1024)
147:     return yield* blocked(`malformed-${kind}`)
148:   return yield* Effect.tryPromise({ try: () => readFile(resolved, "utf8"), catch: () => blocked(`unreadable-${kind}`) })
149: })
150: 
151: const document = Effect.fnUntraced(function* (text: string, kind: string, json = false) {
152:   if (!text.trim() || text.includes("\0")) return yield* blocked(`malformed-${kind}`)
153:   if (json) yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
154:     Effect.mapError(() => blocked(`malformed-${kind}`)),
155:   )
156:   if (!json) yield* Effect.try({ try: () => validateYamlSource(text), catch: (error) =>
157:     error instanceof Blocked ? error : blocked("unsupported-yaml-config") })
158:   // safeLoad is not Jackson-equivalent. Bind only the closed YAML source grammar checked above, or strict JSON.
159:   const value: unknown = yield* Effect.try({
160:     try: () => matter(`\0begin\n${text}\n\0end`, { delimiters: ["\0begin", "\0end"], language: "yaml" }).data,
161:     catch: () => blocked(`malformed-${kind}`),
162:   })
163:   return yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(value).pipe(
164:     Effect.mapError(() => blocked(`malformed-${kind}`)),
165:   )
166: })
167: 
168: // Supported YAML is block mappings with simple string keys and single-line scalar values. Flow collections,
169: // sequences, directives, tags, anchors, aliases, merge keys and folded/block scalars are outside this grammar.
170: // Inspect source tokens before safeLoad can resolve/coerce them; quoted punctuation remains literal data.
171: function validateYamlSource(text: string) {
172:   const ambiguous = new Set(["y", "yes", "n", "no", "true", "false", "on", "off", "null", "~", ".inf", ".nan"])
173:   for (const line of text.split("\n")) {
174:     const source = line.replace(/\r$/, "").trimStart()
175:     if (!source || source.startsWith("#")) continue
176:     if (line.includes("\t") || /[\u0085\u2028\u2029]/.test(line)) throw blocked("unsupported-yaml-config")
177:     const colon = source.indexOf(":")
178:     const key = source.slice(0, colon)
179:     if (colon < 1 || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || (source[colon + 1] !== undefined && source[colon + 1] !== " "))
180:       throw blocked("unsupported-yaml-config")
181:     const scalar = source.slice(colon + 1).trimStart()
182:     const path = key === "outputDir" || key === "inputSpec"
183:     if (!scalar || scalar.startsWith("#")) {
184:       if (path) throw blocked(`ambiguous-yaml-scalar:${key}`)
185:       continue
186:     }
187:     if (scalar[0] === "'" || scalar[0] === '"') {
188:       let end = 1
189:       for (; end < scalar.length; end++) {
190:         if (scalar[0] === '"' && scalar[end] === "\\") {
191:           end++
192:           continue
193:         }
194:         if (scalar[end] !== scalar[0]) continue
195:         if (scalar[0] === "'" && scalar[end + 1] === "'") {
196:           end++
197:           continue
198:         }
199:         break
200:       }
201:       const trailing = scalar.slice(end + 1)
202:       if (end === scalar.length || (trailing.trim() && (!trailing.startsWith(" ") || !trailing.trimStart().startsWith("#"))))
203:         throw blocked("unsupported-yaml-config")
204:       if (scalar[0] === '"') Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(scalar.slice(0, end + 1))
205:       continue
206:     }
207:     const comment = scalar.indexOf(" #")
208:     const token = (comment < 0 ? scalar : scalar.slice(0, comment)).trimEnd()
209:     // This is a closed scalar token alphabet, not a scan for selected YAML features in arbitrary source.
210:     if (!/^[A-Za-z0-9_./\\ +~-]+$/.test(token)) throw blocked("unsupported-yaml-config")
211:     if (path && (ambiguous.has(token.toLowerCase()) || !/^[A-Za-z_./\\]/.test(token) || /^\.\d/.test(token)))
212:       throw blocked(`ambiguous-yaml-scalar:${key}`)
213:   }
214: }
```

## E10 — Compatibilidade Cassandra e dialer fechado

### `packages/core/src/backend-toolkit/cassandra-metadata.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `be309cc1fe2edeeefe82c5c042987a26622d964a` · SHA-256 `adffa5bbb4e9ab695e7879cf4db83d4982562e69aa74b60b7a016072079428cb` · 5323 bytes.

Linhas 9–87 · trecho SHA-256 `64e950841263af48778d987f9deb3c26ed0048183297843fb3acb30193b31224`:

```text
9: 
10: // Apache-2.0, scylladb/gocql v1.15.3, revision e35803084ebafd200e3f7fd74a5be5dfdb409b2d.
11: // Public module sum: h1:0vJT5pm7g5v8/pCs3tuXuRAfSRWvc1kib8J846Z+Z4g=.
12: // The whole verified module (including LICENSE and notices) stays private to this engine's staging directory.
13: export const artifact = {
14:   url: "https://proxy.golang.org/github.com/scylladb/gocql/@v/v1.15.3.zip",
15:   integrity: "sha256-h+5UlJ6dhZVFcKZjNXwjEdXUoFZ4gCx9GGdF9A3Ev7E=",
16:   format: "zip",
17:   entries: [{ from: "github.com/scylladb/gocql@v1.15.3", to: "driver" }],
18: } as const satisfies PinnedArtifact.Artifact
19: 
20: export const BEFORE = "f378e73b05f84f325cccea3e20291a7802406dede1c1ced1bd9477602b67db1a"
21: export const AFTER = "a9c4427039563b57c9b2597ceeb6aa603b50fb34c918823336aaca1b24d5d111"
22: const MODULE = "88e0b9f90ed4a25ae3b4caf8ef44fd6b4d773b1ac6c18ea3b8d4adab3ada0954"
23: const REPLACED_MODULE = "813bf43cbf7732310489d0cc6dbe046e144af305952c1d2ab3eeeaa4734aac40"
24: const SUM = "05120abdde922346d67397c8bf7b5aafa0a1e5291fa051d4567c2a0d7d4d6621"
25: 
26: // Exact catalog-guard prototype. Hashes, not Go spelling heuristics, authorize this single insertion.
27: const GUARD = '\n\t// Cassandra has the standard schema catalog but not Scylla\'s optional extension table.\n' +
28:   '\titer = session.control.querySystem(`SELECT table_name FROM system_schema.tables WHERE keyspace_name = ? AND table_name = ?`, "system_schema", "scylla_tables")\n' +
29:   '\tvar extensionTableName string\n' +
30:   '\thasScyllaTables := iter.Scan(&extensionTableName)\n' +
31:   '\tif err := iter.Close(); err != nil {\n' +
32:   '\t\treturn nil, fmt.Errorf("error querying scylla table schema availability: %v", err)\n' +
33:   '\t}\n' +
34:   '\tif !hasScyllaTables {\n' +
35:   '\t\treturn tables, nil\n' +
36:   '\t}\n'
37: 
38: export function patch(source: Uint8Array) {
39:   requireHash(source, BEFORE, "driver-source")
40:   const anchor = '\n\tstmt = `SELECT * FROM system_schema.scylla_tables WHERE keyspace_name = ? AND table_name = ?`'
41:   const patched = Buffer.from(Buffer.from(source).toString("utf8").replace(anchor, `${GUARD}${anchor}`))
42:   requireHash(patched, AFTER, "patched-driver-source")
43:   return patched
44: }
45: 
46: /** Runs only inside the pinned artifact installer, before the readonly Go build. Never touches a module cache. */
47: export const prepare = Effect.fn("BackendToolkitCassandra.prepare")(function* (staging: string) {
48:   const driver = yield* read(path.join(staging, "driver", "metadata_scylla.go"), "driver-source")
49:   const module = yield* read(path.join(staging, "src", "go.mod"), "generator-module")
50:   const sum = yield* read(path.join(staging, "src", "go.sum"), "generator-sum")
51:   const generator = yield* read(path.join(staging, "src", "cmd", "schemagen", "schemagen.go"), "generator-source")
52:   const prepared = yield* Effect.try({
53:     try: () => {
54:       requireHash(module, MODULE, "generator-module")
55:       requireHash(sum, SUM, "generator-sum")
56:       const replaced = Buffer.from(module.toString("utf8").replace(
57:         "replace github.com/gocql/gocql => github.com/scylladb/gocql v1.15.3",
58:         "replace github.com/gocql/gocql => ../driver",
59:       ))
60:       requireHash(replaced, REPLACED_MODULE, "replaced-generator-module")
61:       return { driver: patch(driver), module: replaced, generator: BackendToolkitCassandraDialer.patch(generator) }
62:     },
63:     catch: (error) => error instanceof PinnedArtifact.Failed ? error : hold("source-invalid"),
64:   })
65:   yield* Effect.tryPromise({
66:     try: async () => {
67:       await writeFile(path.join(staging, "driver", "metadata_scylla.go"), prepared.driver)
68:       await writeFile(path.join(staging, "src", "go.mod"), prepared.module)
69:       await writeFile(path.join(staging, "src", "cmd", "schemagen", "schemagen.go"), prepared.generator)
70:       await writeFile(path.join(staging, "src", "cmd", "schemagen", "ORCHESTRA-MODIFICATIONS.txt"),
71:         "Orchestra cassandra4: schemagen.go changed to dial host-captured Unix routes (slash or Windows drive paths) or granted ports through the sandbox's CONNECT proxy, " +
72:         "using the pinned driver's public Dialer API.\n" +
73:         `Upstream gocqlx v3.0.4 (Apache-2.0); source SHA-256 ${BackendToolkitCassandraDialer.BEFORE}; modified SHA-256 ${BackendToolkitCassandraDialer.AFTER}.\n`)
74:       await writeFile(path.join(staging, "driver", "ORCHESTRA-MODIFICATIONS.txt"),
75:         "Orchestra cassandra1: metadata_scylla.go changed to check the standard catalog before reading optional Scylla metadata.\n" +
76:         `Upstream scylladb/gocql v1.15.3 (Apache-2.0); source SHA-256 ${BEFORE}; modified SHA-256 ${AFTER}.\n`)
77:     },
78:     catch: () => hold("write"),
79:   })
80: })
81: 
82: function requireHash(bytes: Uint8Array, expected: string, name: string) {
83:   if (createHash("sha256").update(bytes).digest("hex") !== expected) throw hold(`${name}-hash-mismatch`)
84: }
85: 
86: const read = (file: string, name: string) => Effect.tryPromise({ try: () => readFile(file), catch: () => hold(`${name}-unreadable`) })
87: const hold = (reason: string) => new PinnedArtifact.Failed({ cause: `compatibility:cassandra-metadata:${reason}` })
```

### `packages/core/src/backend-toolkit/cassandra-dialer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `94282bf8f1c851b477f80a57b006df309c243c67` · SHA-256 `3943c718ce59b671dcbd21085bd1907ad5d91de0f0e2fc34e5b2d7f85dc1e2da` · 8978 bytes.

Linhas 1–217 · trecho SHA-256 `3943c718ce59b671dcbd21085bd1907ad5d91de0f0e2fc34e5b2d7f85dc1e2da`:

```text
1: export * as BackendToolkitCassandraDialer from "./cassandra-dialer"
2: 
3: import { createHash } from "crypto"
4: import { PinnedArtifact } from "../pinned-artifact"
5: 
6: // Command-only overlay for the Apache-2.0 gocqlx v3.0.4 source. The pinned Scylla v1.15.3 Dialer API stays unchanged.
7: export const BEFORE = "614ecf03874e6ad19f6ba7878998cffc00e9bd85ddd6f3b03cd3d8ced22b15a7"
8: export const AFTER = "a60679b063cac909587c6d84c0cc6524e113f995fdb61684aca70f24df201fde"
9: 
10: // Darwin and Windows hand over fixed-target Unix broker routes; Linux hands over the granted ports, reached through the
11: // srt sandbox's own strict-allowlist HTTP CONNECT proxy. Exactly one mode may be present.
12: export const HOOK = String.raw`	// Orchestra cassandra4: host-owned exact routes use the driver's public Dialer API.
13: 	routes, unix := os.LookupEnv("ORCHESTRA_TCP_PROXY_ROUTES")
14: 	ports, connect := os.LookupEnv("ORCHESTRA_TCP_PROXY_CONNECT")
15: 	if unix || connect {
16: 		var dialer *orchestraGeneratorDialer
17: 		err := fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
18: 		switch {
19: 		case unix && !connect:
20: 			dialer, err = newOrchestraGeneratorDialer(routes, cluster.ConnectTimeout)
21: 		case connect && !unix:
22: 			dialer, err = newOrchestraConnectDialer(ports, os.Getenv("HTTP_PROXY"), cluster.ConnectTimeout)
23: 		}
24: 		if err != nil {
25: 			return gocqlx.Session{}, err
26: 		}
27: 		for _, addr := range clusterHosts() {
28: 			if _, _, err := dialer.address("tcp", addr); err != nil {
29: 				return gocqlx.Session{}, err
30: 			}
31: 		}
32: 		cluster.Dialer = dialer
33: 		cluster.WriteCoalesceWaitTime = 0
34: 	}
35: 
36: `
37: 
38: export const SOURCE = String.raw`
39: // Orchestra cassandra4: private generator transport; no library or driver API modification.
40: type orchestraGeneratorDialer struct {
41: 	routes map[string]string
42: 	proxy  string
43: 	auth   string
44: 	dialer net.Dialer
45: }
46: 
47: var _ gocql.Dialer = (*orchestraGeneratorDialer)(nil)
48: 
49: func newOrchestraGeneratorDialer(text string, timeout time.Duration) (*orchestraGeneratorDialer, error) {
50: 	entries := strings.Split(text, ";")
51: 	if len(text) == 0 || len(text) > 32*213 || len(entries) > 32 {
52: 		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
53: 	}
54: 	routes := make(map[string]string, len(entries))
55: 	paths := make(map[string]bool, len(entries))
56: 	for _, entry := range entries {
57: 		port, encoded, ok := strings.Cut(entry, ":")
58: 		n, err := strconv.Atoi(port)
59: 		if !ok || err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port || len(encoded) == 0 || len(encoded) > 206 {
60: 			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
61: 		}
62: 		decoded, err := hex.DecodeString(encoded)
63: 		socket := string(decoded)
64: 		if err != nil || !utf8.Valid(decoded) || strings.ContainsRune(socket, 0) || !orchestraAbsolute(socket) || len(decoded) >= 104 {
65: 			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
66: 		}
67: 		if _, duplicate := routes[port]; duplicate || paths[socket] {
68: 			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
69: 		}
70: 		routes[port] = socket
71: 		paths[socket] = true
72: 	}
73: 	return &orchestraGeneratorDialer{routes: routes, dialer: net.Dialer{Timeout: timeout}}, nil
74: }
75: 
76: // Darwin routes are slash paths; Windows broker routes are drive-qualified (a drive-less path would resolve against
77: // the dialer's current drive, not the broker's).
78: func orchestraAbsolute(socket string) bool {
79: 	if runtime.GOOS == "windows" && filepath.IsAbs(socket) && filepath.Clean(socket) == socket {
80: 		return true
81: 	}
82: 	return path.IsAbs(socket) && path.Clean(socket) == socket
83: }
84: 
85: // The proxy is the sandbox's own loopback listener; its strict allowlist, not this parser, enforces the grant.
86: func newOrchestraConnectDialer(text, proxy string, timeout time.Duration) (*orchestraGeneratorDialer, error) {
87: 	entries := strings.Split(text, ";")
88: 	if len(text) == 0 || len(text) > 32*6 || len(entries) > 32 {
89: 		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
90: 	}
91: 	routes := make(map[string]string, len(entries))
92: 	for _, port := range entries {
93: 		n, err := strconv.Atoi(port)
94: 		if _, duplicate := routes[port]; err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port || duplicate {
95: 			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
96: 		}
97: 		routes[port] = ""
98: 	}
99: 	parsed, err := url.Parse(proxy)
100: 	if err != nil || parsed.Scheme != "http" || parsed.Opaque != "" || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" ||
101: 		(parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1") {
102: 		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-proxy")
103: 	}
104: 	n, err := strconv.Atoi(parsed.Port())
105: 	if err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != parsed.Port() {
106: 		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-proxy")
107: 	}
108: 	auth := ""
109: 	if parsed.User != nil {
110: 		password, _ := parsed.User.Password()
111: 		auth = "Proxy-Authorization: Basic " + base64.StdEncoding.EncodeToString([]byte(parsed.User.Username()+":"+password)) + "\r\n"
112: 	}
113: 	return &orchestraGeneratorDialer{routes: routes, proxy: "127.0.0.1:" + parsed.Port(), auth: auth, dialer: net.Dialer{Timeout: timeout}}, nil
114: }
115: 
116: func (d *orchestraGeneratorDialer) address(network, addr string) (string, int, error) {
117: 	host, port, err := net.SplitHostPort(addr)
118: 	n, numberErr := strconv.Atoi(port)
119: 	if network != "tcp" || err != nil || host != "127.0.0.1" || numberErr != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port {
120: 		return "", 0, fmt.Errorf("orchestra-cassandra-dialer:invalid-address")
121: 	}
122: 	socket, declared := d.routes[port]
123: 	if !declared {
124: 		return "", 0, fmt.Errorf("orchestra-cassandra-dialer:undeclared-port")
125: 	}
126: 	return socket, n, nil
127: }
128: 
129: func (d *orchestraGeneratorDialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
130: 	socket, port, err := d.address(network, addr)
131: 	if err != nil {
132: 		return nil, err
133: 	}
134: 	if d.proxy != "" {
135: 		return d.tunnel(ctx, port)
136: 	}
137: 	conn, err := d.dialer.DialContext(ctx, "unix", socket)
138: 	if err != nil {
139: 		return nil, err
140: 	}
141: 	return &orchestraGeneratorConn{Conn: conn, port: port}, nil
142: }
143: 
144: // One CONNECT per driver connection. Headers are read byte by byte so no tunneled byte is buffered here.
145: func (d *orchestraGeneratorDialer) tunnel(ctx context.Context, port int) (net.Conn, error) {
146: 	conn, err := d.dialer.DialContext(ctx, "tcp", d.proxy)
147: 	if err != nil {
148: 		return nil, err
149: 	}
150: 	deadline, bounded := ctx.Deadline()
151: 	if !bounded && d.dialer.Timeout > 0 {
152: 		deadline = time.Now().Add(d.dialer.Timeout)
153: 	}
154: 	conn.SetDeadline(deadline)
155: 	stop := context.AfterFunc(ctx, func() { conn.SetDeadline(time.Unix(1, 0)) })
156: 	target := "127.0.0.1:" + strconv.Itoa(port)
157: 	_, err = io.WriteString(conn, "CONNECT "+target+" HTTP/1.1\r\nHost: "+target+"\r\n"+d.auth+"\r\n")
158: 	header := make([]byte, 0, 512)
159: 	next := make([]byte, 1)
160: 	for err == nil && !bytes.HasSuffix(header, []byte("\r\n\r\n")) && len(header) < 8192 {
161: 		_, err = io.ReadFull(conn, next)
162: 		header = append(header, next[0])
163: 	}
164: 	if !stop() && ctx.Err() != nil {
165: 		err = ctx.Err()
166: 	}
167: 	status := ""
168: 	if fields := strings.Fields(strings.SplitN(string(header), "\r\n", 2)[0]); len(fields) >= 2 && bytes.HasSuffix(header, []byte("\r\n\r\n")) &&
169: 		(fields[0] == "HTTP/1.1" || fields[0] == "HTTP/1.0") {
170: 		status = fields[1]
171: 	}
172: 	if err == nil && status == "" {
173: 		err = fmt.Errorf("orchestra-cassandra-dialer:proxy-invalid-response")
174: 	}
175: 	if code, _ := strconv.Atoi(status); err == nil && status != "200" {
176: 		err = fmt.Errorf("orchestra-cassandra-dialer:proxy-refused:%d", code)
177: 	}
178: 	if err == nil {
179: 		err = conn.SetDeadline(time.Time{})
180: 	}
181: 	if err != nil {
182: 		conn.Close()
183: 		return nil, err
184: 	}
185: 	return &orchestraGeneratorConn{Conn: conn, port: port}, nil
186: }
187: 
188: type orchestraGeneratorConn struct {
189: 	net.Conn
190: 	port int
191: }
192: 
193: func (c *orchestraGeneratorConn) RemoteAddr() net.Addr {
194: 	return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: c.port}
195: }
196: 
197: func (c *orchestraGeneratorConn) LocalAddr() net.Addr {
198: 	return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0}
199: }
200: `
201: 
202: export function patch(source: Uint8Array) {
203:   if (createHash("sha256").update(source).digest("hex") !== BEFORE)
204:     throw new PinnedArtifact.Failed({ cause: "compatibility:cassandra-dialer:generator-source-hash-mismatch" })
205:   const patched = Buffer.from(Buffer.from(source).toString("utf8")
206:     .replace('\t"bytes"\n', '\t"bytes"\n\t"context"\n\t"encoding/base64"\n\t"encoding/hex"\n')
207:     .replace('\t"io/fs"\n', '\t"io"\n\t"io/fs"\n')
208:     .replace('\t"os"\n', '\t"net"\n\t"net/url"\n\t"os"\n')
209:     .replace('\t"path"\n', '\t"path"\n\t"path/filepath"\n')
210:     .replace('\t"regexp"\n', '\t"regexp"\n\t"runtime"\n')
211:     .replace('\t"strings"\n', '\t"strconv"\n\t"strings"\n\t"time"\n\t"unicode/utf8"\n')
212:     .replace('\treturn gocqlx.WrapSession(cluster.CreateSession())\n', `${HOOK}\treturn gocqlx.WrapSession(cluster.CreateSession())\n`) + SOURCE)
213:   const hash = createHash("sha256").update(patched).digest("hex")
214:   if (hash !== AFTER)
215:     throw new PinnedArtifact.Failed({ cause: "compatibility:cassandra-dialer:patched-generator-source-hash-mismatch" })
216:   return patched
217: }
```

## E11 — Todos os packs backend: versão, receita e fit

### `packages/core/src/backend-toolkit/packs/ast-grep.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c59c577e3ac8b36c8cd70f3af5c62145fa72f559` · SHA-256 `4c38bf4a298cdc6d68db78893a13cdf8279a768487de6e0e44af29e7e0b08846` · 2166 bytes.

Linhas 3–30 · trecho SHA-256 `49ed453b49f5e9014923f480f20d7f34ec282b153f45098ada1663c2af60713a`:

```text
3: 
4: // npm pins are the registry's `dist.integrity`; sample archives were downloaded to check entry layouts.
5: const VERSION = "0.45.3"
6: 
7: // The npm package also ships `sg`, which shadows the shadow-utils `sg` on Linux; only `ast-grep` is exposed.
8: const target = (pkg: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "ast-grep") => ({
9:   artifact: {
10:     url: `https://registry.npmjs.org/@ast-grep/cli-${pkg}/-/cli-${pkg}-${VERSION}.tgz`,
11:     integrity,
12:     format: "tar.gz" as const,
13:     entries: [{ from: `package/${executable}`, to: executable, executable: true }],
14:   },
15:   executable,
16: })
17: 
18: export default {
19:   id: "ast-grep",
20:   version: VERSION,
21:   license: "MIT",
22:   upstream: "ast-grep/ast-grep",
23:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
24:   floor: {
25:     "darwin-arm64": { macos: "11.0" },
26:     "darwin-x64": { macos: "10.12" },
27:     "linux-arm64": { glibc: "2.18" },
28:     "linux-x64": { glibc: "2.34" },
29:     "win32-x64": {},
30:   },
```

Linhas 54–59 · trecho SHA-256 `c693339cb1994d0a686aa98563780b485dfbb49754ae101f9f60ff1b41646840`:

```text
54:   fit: {
55:     role: "generator",
56:     input: "a syntax pattern, its rewrite and the files to apply it to",
57:     skills: ["backend-refactor"],
58:   },
59: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/buf.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d8d06b5fb1f1b1df4bfbd437fbbc110e0225fc66` · SHA-256 `23eff54fd15efc953e1d9a779b64b058c54e67fdf30216bf0552a08cd5f2eedb` · 1675 bytes.

Linhas 3–30 · trecho SHA-256 `497e16ad0d646cc598dcc03cc8e540950b5644b4ee4e2ea7db9ad02a5cc9946d`:

```text
3: 
4: // Pins are the GitHub release assets' sha256 digests in SRI form; buf's sha256.txt agreed with them when pinning.
5: const VERSION = "1.73.0"
6: 
7: const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "buf") => ({
8:   artifact: {
9:     url: `https://github.com/bufbuild/buf/releases/download/v${VERSION}/buf-${asset}`,
10:     integrity,
11:     format: "raw" as const,
12:     entries: [{ from: `buf-${asset}`, to: executable, executable: true }],
13:   },
14:   executable,
15: })
16: 
17: export default {
18:   id: "buf",
19:   version: VERSION,
20:   license: "Apache-2.0",
21:   upstream: "bufbuild/buf",
22:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
23:   floor: {
24:     "darwin-arm64": { macos: "12.0" },
25:     "darwin-x64": { macos: "12.0" },
26:     "linux-arm64": {},
27:     "linux-x64": {},
28:     "win32-x64": {},
29:   },
30:   dependencies: ["protoc-gen-es"],
```

Linhas 38–39 · trecho SHA-256 `8366cab3f67bc5deb265eb6c08d657defdd149c033d38fc85675f40467998949`:

```text
38:   fit: { role: "check", input: "a Buf module of .proto files", skills: ["backend-api"] },
39: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/controller-gen.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `55bf77a6e053b7ec32e77f1c0c7ab2ecf410b150` · SHA-256 `6182cca9af788189579ba431f639e386b45791fda6d9835e1cb4879c071b0aad` · 2915 bytes.

Linhas 3–19 · trecho SHA-256 `3749f6a01e4dd3917eb7f18c2cf8c06a1105355a14692c75217411b5a3013cca`:

```text
3: const VERSION = "0.22.0"
4: 
5: export default {
6:   id: "controller-gen",
7:   version: VERSION,
8:   license: "Apache-2.0",
9:   upstream: "kubernetes-sigs/controller-tools",
10:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
11:   floor: {
12:     "darwin-arm64": { macos: "12.0" },
13:     "darwin-x64": { macos: "12.0" },
14:     "linux-arm64": {},
15:     "linux-x64": {},
16:     "win32-x64": {},
17:   },
18:   // Pins are the GitHub release assets' sha256 digests in SRI form;
19:   // the darwin-x64 asset matched its digest and runs as a bare executable.
```

Linhas 67–72 · trecho SHA-256 `d8b4c6363934d7cdc06f0e126157f0bc40eeb6e28d6048bedd4fee882cd8374f`:

```text
67:   fit: {
68:     role: "generator",
69:     input: "Go API types with kubebuilder markers the packet assigns",
70:     skills: ["backend-api"],
71:   },
72: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/datafusion-cli.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `4843bece0d3ad44712b170c25e161763caa8172f` · SHA-256 `7597abd91ed4574bf68cbf7303825f294146dc078f14a6371df0bf81230c4efd` · 2044 bytes.

Linhas 3–41 · trecho SHA-256 `da664093090bd0092340282172add0bac975f6d2e89398f245b42bc998ae7368`:

```text
3: // Apache publishes no datafusion-cli binaries, only source, so the host builds the crate. Its `rust-version` is 1.94.0,
4: // which the Rust runtime satisfies. The pin is the crate's sha256 in SRI form, from the crates.io `checksum`, which its
5: // download matched.
6: const VERSION = "55.1.0"
7: 
8: // The crate unconditionally enables cloud and Parquet dependencies. aws-lc-rs, ring, zstd and mimalloc compile C, so the build host needs a C compiler and
9: // linker: the Xcode command line tools on macOS, cc on Linux.
10: export default {
11:   id: "datafusion-cli",
12:   version: VERSION,
13:   license: "Apache-2.0",
14:   upstream: "apache/datafusion",
15:   runtime: "rust",
16:   install: {
17:     kind: "source",
18:     artifact: {
19:       url: `https://static.crates.io/crates/datafusion-cli/datafusion-cli-${VERSION}.crate`,
20:       integrity: "sha256-/7mDOhAvAaJXmU3pZsc/v3RB2DRyB9hnbIIbcxjAPuY=",
21:       format: "tar.gz",
22:       // PinnedArtifact refuses `.` as a destination, so the crate root is lifted member by member; `examples` and
23:       // `tests` come along so every target path the manifest declares exists, and `README.md` because lib.rs includes it.
24:       entries: ["Cargo.toml", "Cargo.lock", "README.md", "src", "examples", "tests"].map((name) => ({
25:         from: `datafusion-cli-${VERSION}/${name}`,
26:         to: `src/${name}`,
27:       })),
28:     },
29:     build: "cargo",
30:     path: ".",
31:     binary: "datafusion-cli",
32:     // This engine checks plans, not throughput. Keep release semantics and the full locked dependency graph, but avoid
33:     // optimizing that graph during cold acquisition. SQL, CSV and EXPLAIN support are unchanged.
34:     optLevel: 0,
35:   },
36:   launch: [],
37:   // The msvc toolchain links only through Microsoft's `link.exe`, and the standalone gnu toolchain ships a linker but
38:   // no C compiler for the C dependencies.
39:   unsupported: { "win32-x64": "needs-msvc-linker" },
40:   fit: { role: "check", input: "the schema DDL and the SQL the change wrote", skills: ["backend-data", "backend-check"] },
41: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/datamodel-codegen.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `feab5b5a517a598338b7cc18c863d10b841302d5` · SHA-256 `52c7ee7257e696d7728cd12b6c59d9d7e52afb512b8b84320e62feced373d124` · 1335 bytes.

Linhas 3–31 · trecho SHA-256 `b942f00722ea18d3bf863ff99f996fbb9508750a8c1d1a4e988d221270eaa15e`:

```text
3: 
4: export default {
5:   id: "datamodel-codegen",
6:   version: "0.83.0",
7:   license: "MIT",
8:   upstream: "koxudaxi/datamodel-code-generator",
9:   // Measured with script/toolkit-floors.ts (F5.4): the highest requirement among the compiled wheels of each target.
10:   floor: {
11:     "darwin-arm64": { macos: "11.0" },
12:     "darwin-x64": { macos: "10.13" },
13:     "linux-arm64": { glibc: "2.17" },
14:     "linux-x64": { glibc: "2.14" },
15:     "win32-x64": {},
16:   },
17:   runtime: "python",
18:   install: {
19:     kind: "pip",
20:     // One `name==version --hash=...` line per pin, with the sha256 of every wheel any target may pick.
21:     requirements:
22:       Object.entries(WHEELS)
23:         .map(([pin, wheels]) => [pin, ...Object.values(wheels).map((hex) => `--hash=sha256:${hex}`)].join(" "))
24:         .join("\n") + "\n",
25:   },
26:   launch: ["-m", "datamodel_code_generator"],
27:   // PYTHONSAFEPATH keeps `-m` from putting the working directory first on sys.path, where a project package could
28:   // shadow the pinned ones; PYTHONNOUSERSITE does the same for the user's site-packages.
29:   env: { PYTHONPATH: "{install}", PYTHONSAFEPATH: "1", PYTHONNOUSERSITE: "1" },
30:   fit: { role: "generator", input: "an OpenAPI document or JSON Schema", skills: ["backend-api"] },
31: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/datamodel-codegen.wheels.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `6385060213d539fb5547b2aa3f342a721f5f2b8c` · SHA-256 `e1882f2135d3980986ac47eb35f30b3df45bfe63a3de1489bc4e04572e3ad02b` · 6586 bytes.

Linhas 1–24 · trecho SHA-256 `b6e77107616186696b9c21322e7c19bab4aabfaf99888ab9ce2366d69b26773e`:

```text
1: // The full closure of datamodel-code-generator 0.83.0 for CPython 3.13 on the five toolkit targets, as resolved by
2: // `uv pip compile --only-binary :all: --python-version 3.13 --python-platform <target>` (the same 22 pins on every
3: // target). Each pin lists every wheel PyPI publishes for it that a target can install: platform wheels for the
4: // compiled packages and the py3-none-any wheel where one exists. Digests are PyPI's sha256, each checked against a
5: // download of the wheel when pinning.
6: export const WHEELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
7:   "annotated-types==0.8.0": {
8:     "annotated_types-0.8.0-py3-none-any.whl": "f072f4d804ea359e4eaf198b1af7a8b0943881a87f31bb764f8bf219bb9419e0",
9:   },
10:   "argcomplete==3.7.2": {
11:     "argcomplete-3.7.2-py3-none-any.whl": "6029205678bdd9c1c728a155f5f9ecf5812393f969eef58807641a2bc2aa5b19",
12:   },
13:   "black==26.10.0": {
14:     "black-26.10.0-cp313-cp313-macosx_10_13_x86_64.whl": "db0894554f5a95b33874ad7bc6040360f2b126b8d6c9b47d8ddfbd5c6a030618",
15:     "black-26.10.0-cp313-cp313-macosx_11_0_arm64.whl": "69e5bf5e22660dba002e102e43a2dce1924b098781c9665bffa1ffd2d490ebc5",
16:     "black-26.10.0-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl": "87fd0c6c769c650439e7107742f0d6493bfb117fab95d97ef1eb2381d1713258",
17:     "black-26.10.0-cp313-cp313-win_amd64.whl": "7ced1df50785931b06d5ee7264cdcd246fab0cacd83c8dc7f1b2774d85d23e05",
18:     "black-26.10.0-py3-none-any.whl": "b532e40012f21a8a0e8c5996ea8f5f8413dc89793361aa9e2f451826d0ebd711",
19:   },
20:   "click==8.5.0": {
21:     "click-8.5.0-py3-none-any.whl": "255bc9599cf7748b4b1a446ccc735421bd08a2ae529a8b88597d3de5664ee360",
22:   },
23:   "datamodel-code-generator==0.83.0": {
24:     "datamodel_code_generator-0.83.0-py3-none-any.whl": "371d80be360b2a57bc48462169553af57fa30225c0264ad85ae5f0d59b9d143a",
```

Linhas 76–93 · trecho SHA-256 `9bf9c416ae18bcc222d6983b80d7b6b1d8f1706710512c9a70cd02d4e77ed7dd`:

```text
76:   },
77:   "pyyaml==6.0.3": {
78:     "pyyaml-6.0.3-cp313-cp313-macosx_10_13_x86_64.whl": "8da9669d359f02c0b91ccc01cac4a67f16afec0dac22c2ad09f46bee0697eba8",
79:     "pyyaml-6.0.3-cp313-cp313-macosx_11_0_arm64.whl": "2283a07e2c21a2aa78d9c4442724ec1eb15f5e42a723b99cb3d822d48f5f7ad1",
80:     "pyyaml-6.0.3-cp313-cp313-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl": "ee2922902c45ae8ccada2c5b501ab86c36525b883eff4255313a253a3160861c",
81:     "pyyaml-6.0.3-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl": "0f29edc409a6392443abf94b9cf89ce99889a1dd5376d94316ae5145dfedd5d6",
82:     "pyyaml-6.0.3-cp313-cp313-win_amd64.whl": "79005a0d97d5ddabfeeea4cf676af11e647e41d81c9a7722a193022accdb6b7c",
83:   },
84:   "typeguard==4.6.0": {
85:     "typeguard-4.6.0-py3-none-any.whl": "79878165bb86f2cf5d41d159a0ff1792a796cf496882d2fe1b1c6c7049b9cdd7",
86:   },
87:   "typing-extensions==4.16.0": {
88:     "typing_extensions-4.16.0-py3-none-any.whl": "481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8",
89:   },
90:   "typing-inspection==0.4.4": {
91:     "typing_inspection-0.4.4-py3-none-any.whl": "65b8397ba37ccbce054456aaccddfc91e6e3083c92824df348d96ca832f3f147",
92:   },
93: }
```

### `packages/core/src/backend-toolkit/packs/gitleaks.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ca2e4948a9b81538b5d013c730c041490795794a` · SHA-256 `ebd3745fb377d2fe38b166497edfb68f1bbd7202ba27592d00935e9d946e8da4` · 1865 bytes.

Linhas 3–33 · trecho SHA-256 `e3ea0bdc25a12add62cd1378698106ee83033cb7e812fe9c2f29a42045c156d1`:

```text
3: 
4: // Pins are the GitHub release assets' sha256 digests in SRI form; gitleaks' checksums.txt agreed with them when pinning.
5: const VERSION = "8.30.1"
6: 
7: const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "gitleaks") => ({
8:   artifact: {
9:     url: `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_${asset}`,
10:     integrity,
11:     format: asset.endsWith(".zip") ? ("zip" as const) : ("tar.gz" as const),
12:     entries: [
13:       { from: executable, to: executable, executable: true },
14:       { from: "LICENSE", to: "LICENSE" },
15:     ],
16:   },
17:   executable,
18: })
19: 
20: // The host-side Memory scanner: it serves no entry skill and has no recipe.
21: export default {
22:   id: "gitleaks",
23:   version: VERSION,
24:   license: "MIT",
25:   upstream: "gitleaks/gitleaks",
26:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
27:   floor: {
28:     "darwin-arm64": { macos: "11.0" },
29:     "darwin-x64": { macos: "11.0" },
30:     "linux-arm64": {},
31:     "linux-x64": {},
32:     "win32-x64": {},
33:   },
```

Linhas 41–42 · trecho SHA-256 `38bafd6b8dfe371d55cb21e41cb3c475fed42e15bd8eb5b3dfeb60816ca0d2c8`:

```text
41:   fit: { role: "check", input: "Memory text before it is stored", skills: [] },
42: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/gocqlx-schemagen.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ec10ad95405ed2712bf956538ae0873484d8632c` · SHA-256 `85794568238124594e4bb9fa1ee663c88c3d606d3221079795b4a72705e7db47` · 2428 bytes.

Linhas 3–75 · trecho SHA-256 `aa705329c55992b264a4605fe771e0120f695f5c8079de57c12b8bb711ae5f9a`:

```text
3: // gocqlx's go.mod declares `go 1.21`, which the Go runtime satisfies. schemagen is a package of the v3 module, not a
4: // module of its own, so the pin is the whole module.
5: const VERSION = "3.0.4"
6: 
7: // The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir so
8: // the build runs in the module root next to its go.mod and go.sum.
9: const SOURCE = [
10:   ".github",
11:   ".gitignore",
12:   ".golangci.yml",
13:   "LICENSE",
14:   "Makefile",
15:   "README.md",
16:   "batchx.go",
17:   "batchx_test.go",
18:   "benchmark_test.go",
19:   "cmd",
20:   "dbutil",
21:   "doc.go",
22:   "doc_test.go",
23:   "example_test.go",
24:   "go.mod",
25:   "go.sum",
26:   "gocqlx.go",
27:   "gocqlxtest",
28:   "iterx.go",
29:   "iterx_test.go",
30:   "mapper.go",
31:   "migrate",
32:   "qb",
33:   "queryx.go",
34:   "queryx_bench_test.go",
35:   "queryx_test.go",
36:   "queryx_wrap.go",
37:   "renovate.json",
38:   "session.go",
39:   "table",
40:   "testdata",
41:   "transformer.go",
42:   "udt.go",
43: ]
44: 
45: // The pin is the sha256 of the proxy's module zip, computed from the download. `go mod download` of the same zip
46: // verified it against h1:37rMVFEUlsGGNYB7OLR7991KwBYR2WA5TU7wtduClas=, the hash sum.golang.org records for the module.
47: // Its dependencies are pinned by the module's own go.sum and verified against the checksum database at build time.
48: export default {
49:   id: "gocqlx-schemagen",
50:   version: `${VERSION}+orchestra.cassandra4`,
51:   license: "Apache-2.0",
52:   // Owned build: gocqlx v3.0.4 command-only Dialer overlay (Darwin Unix routes, Linux srt CONNECT proxy) + Scylla gocql v1.15.3 catalog-availability backport.
53:   // Both upstream licenses and source notices remain in the install; provenance and byte pins live in the helper.
54:   upstream: "scylladb/gocqlx",
55:   runtime: "go",
56:   install: {
57:     kind: "source",
58:     artifact: {
59:       url: `https://proxy.golang.org/github.com/scylladb/gocqlx/v3/@v/v${VERSION}.zip`,
60:       integrity: "sha256-wvq2iEEB9xQiuX2E19BS8d3AdTRECF54YDWzrOm9aDc=",
61:       format: "zip",
62:       entries: SOURCE.map((name) => ({ from: `github.com/scylladb/gocqlx/v3@v${VERSION}/${name}`, to: `src/${name}` })),
63:     },
64:     build: "go",
65:     path: "./cmd/schemagen",
66:     binary: "gocqlx-schemagen",
67:     compatibility: "cassandra-metadata",
68:   },
69:   launch: [],
70:   fit: {
71:     role: "generator",
72:     input: "a disposable Cassandra or Scylla cluster holding the packet's keyspace schema",
73:     skills: ["backend-data"],
74:   },
75: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `5cd9c5ab347992ab5abfb529ebd33221b93bc2e7` · SHA-256 `84ae51f15fced0c14efd44917c698366de7b65b33228208ff147ed452646ed51` · 1599 bytes.

Linhas 23–47 · trecho SHA-256 `13d9afa722bfaf93673512e598f8c02b7fab113ebf8b412473fe2c957bd3f461`:

```text
23: // One import and one entry per pack (ruling M6-1); `script/toolkit-pack.ts add` writes both. Keyed by each pack's own
24: // id, in the order the toolkit lists them.
25: export const ENGINES = {
26:   [astGrep.id]: astGrep,
27:   [sqlc.id]: sqlc,
28:   [buf.id]: buf,
29:   [gitleaks.id]: gitleaks,
30:   [kiota.id]: kiota,
31:   [orval.id]: orval,
32:   [protocGenEs.id]: protocGenEs,
33:   [openapiGenerator.id]: openapiGenerator,
34:   [datamodelCodegen.id]: datamodelCodegen,
35:   [ogen.id]: ogen,
36:   [sqlx.id]: sqlx,
37:   [controllerGen.id]: controllerGen,
38:   [kubeconform.id]: kubeconform,
39:   [kopium.id]: kopium,
40:   [squawk.id]: squawk,
41:   [postgresLanguageServer.id]: postgresLanguageServer,
42:   [sqlglot.id]: sqlglot,
43:   [kyselyCodegen.id]: kyselyCodegen,
44:   [datafusionCli.id]: datafusionCli,
45:   [gocqlxSchemagen.id]: gocqlxSchemagen,
46:   [modelina.id]: modelina,
47: }
```

### `packages/core/src/backend-toolkit/packs/kiota.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `62648da970ce5f94bf540acea7d84d3bfc2cdb2f` · SHA-256 `2409e1b56b8b552c34066942aca1dab95afedac59c0a09d4278bd54f12a3b91f` · 1902 bytes.

Linhas 3–34 · trecho SHA-256 `c623eef7585456fdd0a213a7bb015bafe04fcaf076aacfde6340a67b62aa5301`:

```text
3: 
4: // Pins are the GitHub release assets' sha256 digests in SRI form; kiota publishes no checksum file.
5: const VERSION = "1.35.0"
6: 
7: // The self-contained .NET single-file build reads appsettings.json beside it; the archive's debug symbols are left out.
8: const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "kiota") => ({
9:   artifact: {
10:     url: `https://github.com/microsoft/kiota/releases/download/v${VERSION}/${asset}.zip`,
11:     integrity,
12:     format: "zip" as const,
13:     entries: [
14:       { from: executable, to: executable, executable: true },
15:       { from: "appsettings.json", to: "appsettings.json" },
16:     ],
17:   },
18:   executable,
19: })
20: 
21: export default {
22:   id: "kiota",
23:   version: VERSION,
24:   license: "MIT",
25:   upstream: "microsoft/kiota",
26:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
27:   floor: {
28:     "darwin-arm64": { macos: "12.0" },
29:     "darwin-x64": { macos: "12.0" },
30:     "linux-arm64": { glibc: "2.27" },
31:     "linux-x64": { glibc: "2.27" },
32:     "win32-x64": {},
33:   },
34:   env: { KIOTA_OFFLINE_ENABLED: "true", KIOTA_CLI_TELEMETRY_OPTOUT: "true" },
```

Linhas 42–43 · trecho SHA-256 `60bc4653442b391efd6745f6f7a864e9e5ffb789b56820acfc23c31c10d30a62`:

```text
42:   fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
43: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/kopium.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c5c0d2e7d05b7cb869e899d0013c02f13c7fa15b` · SHA-256 `eb7187300e2b0966e2faad3c9048ffda2da09910ddf9dc506d3c7669ee262a9d` · 1646 bytes.

Linhas 3–37 · trecho SHA-256 `6162aefc918dc4fc6b05367128f31a3f71eb9191d380a2b237b6f7d73a0022aa`:

```text
3: // The pin is the crate's sha256 in SRI form, from the crates.io index `cksum`, which its download matched.
4: const VERSION = "0.24.1"
5: 
6: // Built from the crate: upstream's release binaries are `.tar.xz`, which PinnedArtifact does not unpack, and cover no
7: // Windows target. `cli` is the crate's only default feature and gates the binary. kube's rustls pulls in ring, which
8: // compiles C, so the build host needs a C compiler and linker: the Xcode command line tools on macOS, cc on Linux.
9: export default {
10:   id: "kopium",
11:   version: VERSION,
12:   license: "Apache-2.0",
13:   upstream: "kube-rs/kopium",
14:   runtime: "rust",
15:   install: {
16:     kind: "source",
17:     artifact: {
18:       url: `https://static.crates.io/crates/kopium/kopium-${VERSION}.crate`,
19:       integrity: "sha256-Fcw6D/0oHqbjZpbJotOmp6nm6hzw01tdq1TAIdreb8k=",
20:       format: "tar.gz",
21:       // PinnedArtifact refuses `.` as a destination, so the crate root is lifted member by member; `tests` comes along
22:       // so every target path the manifest declares exists.
23:       entries: ["Cargo.toml", "Cargo.lock", "README.md", "LICENSE", "src", "tests"].map((name) => ({
24:         from: `kopium-${VERSION}/${name}`,
25:         to: `src/${name}`,
26:       })),
27:     },
28:     build: "cargo",
29:     path: ".",
30:     binary: "kopium",
31:     features: ["cli"],
32:   },
33:   launch: [],
34:   // The msvc toolchain links only through Microsoft's `link.exe`, which the Rust runtime does not ship.
35:   unsupported: { "win32-x64": "needs-msvc-linker" },
36:   fit: { role: "generator", input: "a CustomResourceDefinition file the packet supplies", skills: ["backend-api"] },
37: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/kubeconform.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `81fb16e67c3fbc464421945d548fd96ff80e3c57` · SHA-256 `96bd9cc1cf933cdb56995a320b70d897f498a6bf738baaf5565785d2bcaefc17` · 2763 bytes.

Linhas 3–19 · trecho SHA-256 `f878c33b8243445b15d12da428122bc712dfd8fa09fbfc4e8eeeea0613cbb80b`:

```text
3: const VERSION = "0.8.0"
4: 
5: export default {
6:   id: "kubeconform",
7:   version: VERSION,
8:   license: "Apache-2.0",
9:   upstream: "yannh/kubeconform",
10:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
11:   floor: {
12:     "darwin-arm64": { macos: "12.0" },
13:     "darwin-x64": { macos: "12.0" },
14:     "linux-arm64": {},
15:     "linux-x64": {},
16:     "win32-x64": {},
17:   },
18:   // Pins are the GitHub release assets' sha256 digests in SRI form;
19:   // the darwin-x64 archive matched its digest and holds the executable at its root.
```

Linhas 67–72 · trecho SHA-256 `818f175e8c862bab16eacc27b855320951cd42a0d167b640553ac1535e5988f4`:

```text
67:   fit: {
68:     role: "check",
69:     input: "Kubernetes manifests the change wrote, with the schemas the packet supplies",
70:     skills: ["backend-check"],
71:   },
72: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/kysely-codegen.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `08c150c9918b67928ffb4cfec41b11b24dad9bc0` · SHA-256 `ef5ae2d54be68713f9a133650800f493828dfd10059b71ceccda717a6bb1b831` · 1390 bytes.

Linhas 3–37 · trecho SHA-256 `1e12ac9cd923d7fd0d23d040f09a6e44236e7d316bcaffdf54e3b595d4a7e0a8`:

```text
3: 
4: // kysely-codegen loads its database driver as an optional peer and requires `typescript` without declaring it, so the
5: // pack pins the PostgreSQL and MySQL drivers and TypeScript alongside it (`kysely` comes in as its required peer).
6: // TypeScript stays on 6.x: 7.x is the native port without the JavaScript compiler API kysely-codegen calls.
7: // SQLite's better-sqlite3 is left out: it needs a native build, and the install runs no scripts.
8: const VERSION = "0.20.0"
9: 
10: export default {
11:   id: "kysely-codegen",
12:   version: VERSION,
13:   license: "MIT",
14:   upstream: "RobinBlomberg/kysely-codegen",
15:   runtime: "node",
16:   install: {
17:     kind: "npm",
18:     // The package.json text the lock was written from, in npm's own formatting.
19:     packageJson:
20:       JSON.stringify(
21:         {
22:           name: "backend-toolkit-kysely-codegen",
23:           private: true,
24:           dependencies: { "kysely-codegen": VERSION, mysql2: "3.24.5", pg: "8.23.1", typescript: "6.0.3" },
25:         },
26:         null,
27:         2,
28:       ) + "\n",
29:     lock: JSON.stringify(lock, null, 2) + "\n",
30:   },
31:   launch: ["{install}/node_modules/kysely-codegen/dist/cli/bin.js"],
32:   fit: {
33:     role: "generator",
34:     input: "a disposable PostgreSQL or MySQL database holding the schema",
35:     skills: ["backend-data"],
36:   },
37: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/modelina.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `e3f90fbca7f3150c43a231f4029bb8caf5abc043` · SHA-256 `f2685a235805dd4b286ded02fec5d3f109256a5c9ed20a46c9fe6b405f9c882b` · 1103 bytes.

Linhas 3–28 · trecho SHA-256 `07003b6cbf27067d71fe9e6201cd901ef6d08bc8404cfcdad7b017ead63a6e08`:

```text
3: 
4: // The AsyncAPI CLI's `generate models` delegates to this package, so it is the engine itself without the CLI's
5: // server, generator and linter. The lock's `node_modules/npm/node_modules/*` entries are bundled inside the npm tarball
6: // that @oclif/plugin-plugins depends on; that tarball's integrity covers them.
7: const VERSION = "5.10.1"
8: 
9: export default {
10:   id: "modelina",
11:   version: VERSION,
12:   license: "Apache-2.0",
13:   upstream: "asyncapi/modelina",
14:   runtime: "node",
15:   install: {
16:     kind: "npm",
17:     // The package.json text the lock was written from, in npm's own formatting.
18:     packageJson:
19:       JSON.stringify(
20:         { name: "backend-toolkit-modelina", private: true, dependencies: { "@asyncapi/modelina-cli": VERSION } },
21:         null,
22:         2,
23:       ) + "\n",
24:     lock: JSON.stringify(lock, null, 2) + "\n",
25:   },
26:   launch: ["{install}/node_modules/@asyncapi/modelina-cli/bin/run_bin"],
27:   fit: { role: "generator", input: "an AsyncAPI document", skills: ["backend-api"] },
28: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/ogen.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `302a4c0f91b4fa0aef370d8c6cb7ae48ab414482` · SHA-256 `c1df3ae0c7b885ad04631d083c76d34802c836a6df049589900e2969c05daabc` · 2104 bytes.

Linhas 3–83 · trecho SHA-256 `d9f204fb471b2c03fe06577ebc8548d6fc814b17a00e7b571ac4ab1d7836ccf5`:

```text
3: // ogen's go.mod declares `go 1.25.0`, which the Go runtime satisfies.
4: const VERSION = "1.24.0"
5: 
6: // The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir so
7: // the build runs in the module root next to its go.mod and go.sum.
8: const SOURCE = [
9:   ".codecov.yaml",
10:   ".editorconfig",
11:   ".gitattributes",
12:   ".github",
13:   ".gitignore",
14:   ".golangci.yml",
15:   "CONTRIBUTING.md",
16:   "Dockerfile",
17:   "LICENSE",
18:   "Makefile",
19:   "README.md",
20:   "SECURITY.md",
21:   "_logo",
22:   "_testdata",
23:   "cmd",
24:   "conv",
25:   "dsl.go",
26:   "dsl_test.go",
27:   "gen",
28:   "gen_bench_test.go",
29:   "gen_test.go",
30:   "go.coverage.sh",
31:   "go.mod",
32:   "go.sum",
33:   "go.test.sh",
34:   "http",
35:   "internal",
36:   "json",
37:   "jsonpointer",
38:   "jsonschema",
39:   "location",
40:   "location_test.go",
41:   "middleware",
42:   "ogen.go",
43:   "ogen_test.go",
44:   "ogenerrors",
45:   "ogenregex",
46:   "openapi",
47:   "otelogen",
48:   "schema.go",
49:   "schema_backcomp.go",
50:   "schema_test.go",
51:   "security_scheme.go",
52:   "spec.go",
53:   "spec_test.go",
54:   "sse",
55:   "tools",
56:   "uri",
57:   "validate",
58: ]
59: 
60: // The pin is the sha256 of the proxy's module zip, computed from the download. Recomputing the Go dirhash over the
61: // zip's files gave h1:NehBG/8s0JeM6jYHPJeFJntBG3cE/xQgZd1q8BchPNM=, the hash sum.golang.org records for the module.
62: // Its dependencies are pinned by the module's own go.sum and verified against the checksum database at build time.
63: export default {
64:   id: "ogen",
65:   version: VERSION,
66:   license: "Apache-2.0",
67:   upstream: "ogen-go/ogen",
68:   runtime: "go",
69:   install: {
70:     kind: "source",
71:     artifact: {
72:       url: `https://proxy.golang.org/github.com/ogen-go/ogen/@v/v${VERSION}.zip`,
73:       integrity: "sha256-QAbV57ez2whdMjgjZ2SVFjcb6Cbzc4fx9PJ9lyEZOAk=",
74:       format: "zip",
75:       entries: SOURCE.map((name) => ({ from: `github.com/ogen-go/ogen@v${VERSION}/${name}`, to: `src/${name}` })),
76:     },
77:     build: "go",
78:     path: "./cmd/ogen",
79:     binary: "ogen",
80:   },
81:   launch: [],
82:   fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
83: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/openapi-generator.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `928930908862f17b5df6fb3d8a376d85ed7d5884` · SHA-256 `173c8f226dd169b990ca9ce52053a2b05cb62658df84ff994a611d4b3b7bf248` · 884 bytes.

Linhas 3–23 · trecho SHA-256 `bb53d8925cb1ae88dbabb52e52da14d2f5b177f9ba2debce518cb9bd1211db0b`:

```text
3: // The pin is the jar's sha256, computed from the download, whose Maven Central `.sha1` and `.md5` agreed.
4: const VERSION = "7.25.0"
5: 
6: export default {
7:   id: "openapi-generator",
8:   version: VERSION,
9:   license: "Apache-2.0",
10:   upstream: "OpenAPITools/openapi-generator",
11:   runtime: "java",
12:   install: {
13:     kind: "jar",
14:     artifact: {
15:       url: `https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${VERSION}/openapi-generator-cli-${VERSION}.jar`,
16:       integrity: "sha256-Qc5PawfxlmdkOdcQdZ+hzteggGbQb/G/MUaBRwKJ764=",
17:       format: "raw",
18:       entries: [{ from: `openapi-generator-cli-${VERSION}.jar`, to: "openapi-generator-cli.jar" }],
19:     },
20:   },
21:   launch: ["-jar", "{install}/openapi-generator-cli.jar"],
22:   fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
23: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/orval.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `afdc69072ae464f07a5686fd3828f73d558e0b81` · SHA-256 `cfa18aa4707d83c3ad83aab06263be68234c186145bdd2b718b9e4d3863abf5a` · 1113 bytes.

Linhas 3–31 · trecho SHA-256 `f8363a0acfab8a5bb8611ccf24d326f3f9c5c9079a35264339c0f33b56bd6bf9`:

```text
3: 
4: // The lock keeps every platform's optional packages (esbuild's among them), so one lock installs on all five targets.
5: const VERSION = "8.39.0"
6: 
7: export default {
8:   id: "orval",
9:   version: VERSION,
10:   license: "MIT",
11:   upstream: "orval-labs/orval",
12:   // Measured with script/toolkit-floors.ts (F5.4): esbuild's per-target binary, the only native file in the install.
13:   floor: {
14:     "darwin-arm64": { macos: "12.0" },
15:     "darwin-x64": { macos: "12.0" },
16:     "linux-arm64": {},
17:     "linux-x64": {},
18:     "win32-x64": {},
19:   },
20:   runtime: "node",
21:   install: {
22:     kind: "npm",
23:     // The package.json text the lock was written from, in npm's own formatting.
24:     packageJson:
25:       JSON.stringify({ name: "backend-toolkit-orval", private: true, dependencies: { orval: VERSION } }, null, 2) +
26:       "\n",
27:     lock: JSON.stringify(lock, null, 2) + "\n",
28:   },
29:   launch: ["{install}/node_modules/orval/dist/bin/orval.mjs"],
30:   fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
31: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/postgres-language-server.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `0e51cf0e5c7774ab3124e8150904301cac44c57a` · SHA-256 `f1c76d324ebb548e7ca2850bcace878da77626e4dcc716cd9f2c4974383ce951` · 2087 bytes.

Linhas 3–34 · trecho SHA-256 `adb999ee0d50d44057bebc4d458a21b7d7629c1f5d5412065222ae39bfb2f54a`:

```text
3: 
4: // Pins are the GitHub release assets' sha256 digests in SRI form. The release also ships the same CLI under its old
5: // name, `postgrestools`; the pack pins the current `postgres-language-server` assets.
6: const VERSION = "0.27.1"
7: 
8: const target = (
9:   triple: string,
10:   integrity: PinnedArtifact.Artifact["integrity"],
11:   executable = "postgres-language-server",
12: ) => ({
13:   artifact: {
14:     url: `https://github.com/supabase-community/postgres-language-server/releases/download/${VERSION}/postgres-language-server_${triple}`,
15:     integrity,
16:     format: "raw" as const,
17:     entries: [{ from: `postgres-language-server_${triple}`, to: executable, executable: true }],
18:   },
19:   executable,
20: })
21: 
22: export default {
23:   id: "postgres-language-server",
24:   version: VERSION,
25:   license: "MIT",
26:   upstream: "supabase-community/postgres-language-server",
27:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
28:   floor: {
29:     "darwin-arm64": { macos: "11.0" },
30:     "darwin-x64": { macos: "10.12" },
31:     "linux-arm64": { glibc: "2.34" },
32:     "linux-x64": { glibc: "2.34" },
33:     "win32-x64": {},
34:   },
```

Linhas 46–51 · trecho SHA-256 `825e551f048d8b7ae02d1f806e002f6f573dc49439c0b4f70764325f74908f85`:

```text
46:   fit: {
47:     role: "check",
48:     input: "the SQL the change wrote and a disposable PostgreSQL database holding the schema",
49:     skills: ["backend-data", "backend-check"],
50:   },
51: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/protoc-gen-es.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `6b8dc5112e0d5c09493f2700d2a8a44a66de4ee8` · SHA-256 `36c5526a297dba47104e6e772f4dd3c6f8a1a02b3b0d57a0b94f72f23cfb6035` · 824 bytes.

Linhas 3–25 · trecho SHA-256 `a42858b5e9f5a9b1968430a94d502460cb93a345fad5ee89cb8585a1728bd39a`:

```text
3: 
4: const VERSION = "2.16.0"
5: 
6: export default {
7:   id: "protoc-gen-es",
8:   version: VERSION,
9:   license: "Apache-2.0",
10:   upstream: "bufbuild/protobuf-es",
11:   runtime: "node",
12:   install: {
13:     kind: "npm",
14:     // The package.json text the lock was written from, in npm's own formatting.
15:     packageJson:
16:       JSON.stringify(
17:         { name: "backend-toolkit-protoc-gen-es", private: true, dependencies: { "@bufbuild/protoc-gen-es": VERSION } },
18:         null,
19:         2,
20:       ) + "\n",
21:     lock: JSON.stringify(lock, null, 2) + "\n",
22:   },
23:   launch: ["{install}/node_modules/@bufbuild/protoc-gen-es/bin/protoc-gen-es"],
24:   fit: { role: "generator", input: "a Buf module of .proto files", skills: ["backend-api"] },
25: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/sqlc.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `821a12bf764c932b5b0140be0b4317e45a0ebc8a` · SHA-256 `642f56d93028b821f8c2d39bb1da0d15e4bf93a669721364914a489cf9359084` · 1654 bytes.

Linhas 3–29 · trecho SHA-256 `0ef599fae3b887adf880efae11d92df9d31739b69b39a6d62e9983fcf5e52e0c`:

```text
3: 
4: // Pins are the GitHub release assets' sha256 digests in SRI form; sqlc publishes no checksum file.
5: const VERSION = "1.31.1"
6: 
7: const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "sqlc") => ({
8:   artifact: {
9:     url: `https://github.com/sqlc-dev/sqlc/releases/download/v${VERSION}/sqlc_${VERSION}_${asset}.tar.gz`,
10:     integrity,
11:     format: "tar.gz" as const,
12:     entries: [{ from: executable, to: executable, executable: true }],
13:   },
14:   executable,
15: })
16: 
17: export default {
18:   id: "sqlc",
19:   version: VERSION,
20:   license: "MIT",
21:   upstream: "sqlc-dev/sqlc",
22:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
23:   floor: {
24:     "darwin-arm64": { macos: "12.0" },
25:     "darwin-x64": { macos: "12.0" },
26:     "linux-arm64": {},
27:     "linux-x64": {},
28:     "win32-x64": {},
29:   },
```

Linhas 37–38 · trecho SHA-256 `bb261f3c22096a26a49939a4c50ce1a087493a13f6094c2c4696010c2c0c8236`:

```text
37:   fit: { role: "generator", input: "SQL query files and the schema DDL sqlc reads", skills: ["backend-data"] },
38: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/sqlglot.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9649773f069a32df82c9793475cfecf3e6f963fa` · SHA-256 `0a6db1cf8a8689413e40b7edc2cb7a46ac55454d6872ce9a5fc2da99147b20db` · 998 bytes.

Linhas 3–26 · trecho SHA-256 `5fe990f1d09993274afbcb6b6a51897757119fdb3c3f70f13ced272e0cf1f215`:

```text
3: // sqlglot is pure Python with no runtime dependencies, so one py3-none-any wheel (PyPI's sha256, checked against a
4: // download when pinning) installs on every target.
5: const VERSION = "30.21.0"
6: 
7: export default {
8:   id: "sqlglot",
9:   version: VERSION,
10:   license: "MIT",
11:   upstream: "tobymao/sqlglot",
12:   runtime: "python",
13:   install: {
14:     kind: "pip",
15:     requirements: `sqlglot==${VERSION} --hash=sha256:816d1a4815b7562b3976efcc0b561c928a743f976efd0fb8ad6db7a5b96c069e\n`,
16:   },
17:   launch: ["-m", "sqlglot"],
18:   // PYTHONSAFEPATH keeps `-m` from putting the working directory first on sys.path, where a project package could
19:   // shadow the pinned one; PYTHONNOUSERSITE does the same for the user's site-packages.
20:   env: { PYTHONPATH: "{install}", PYTHONSAFEPATH: "1", PYTHONNOUSERSITE: "1" },
21:   fit: {
22:     role: "check",
23:     input: "the Spark or other-dialect SQL the change wrote",
24:     skills: ["backend-data", "backend-check"],
25:   },
26: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/sqlx.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `bdaa2f4e6147bda107c67aae416b8eb97773eaae` · SHA-256 `869d64285186d2f8bc2dcdbc5dabffc5488257a903e7662d0c99b63c79dce96e` · 1729 bytes.

Linhas 3–40 · trecho SHA-256 `896488bda6a2bbc5e0f54248bd7aac512bd5afe315f3a490678a61f3a056bdae`:

```text
3: // The pin is the crate's sha256 in SRI form, from the crates.io index `cksum`, which its download matched.
4: const VERSION = "0.9.0"
5: 
6: // The feature set of research/delivery-toolkit.md: rustls instead of the default native-tls, so no system OpenSSL.
7: // ring (rustls) and the bundled SQLite still compile C, so the build host needs a C compiler and linker: the Xcode
8: // command line tools on macOS, cc on Linux.
9: export default {
10:   id: "sqlx",
11:   version: VERSION,
12:   license: "MIT OR Apache-2.0",
13:   upstream: "transact-rs/sqlx",
14:   runtime: "rust",
15:   install: {
16:     kind: "source",
17:     artifact: {
18:       url: `https://static.crates.io/crates/sqlx-cli/sqlx-cli-${VERSION}.crate`,
19:       integrity: "sha256-k+84V6SgtI/L9Ta3epEio1x2MWhvLM+8deYWM1dx6NA=",
20:       format: "tar.gz",
21:       // PinnedArtifact refuses `.` as a destination, so the crate root is lifted member by member; `tests` comes along
22:       // so every target path the manifest declares exists.
23:       entries: ["Cargo.toml", "Cargo.lock", "README.md", "LICENSE-APACHE", "LICENSE-MIT", "src", "tests"].map(
24:         (name) => ({
25:           from: `sqlx-cli-${VERSION}/${name}`,
26:           to: `src/${name}`,
27:         }),
28:       ),
29:     },
30:     build: "cargo",
31:     path: ".",
32:     binary: "sqlx",
33:     features: ["rustls", "postgres", "mysql", "sqlite", "sqlx-toml"],
34:   },
35:   launch: [],
36:   // The msvc toolchain links only through Microsoft's `link.exe`, and the standalone gnu toolchain ships a linker but
37:   // no C compiler for ring and SQLite.
38:   unsupported: { "win32-x64": "needs-msvc-linker" },
39:   fit: { role: "generator", input: "a SQLx project's migrations and a disposable database", skills: ["backend-data"] },
40: } as const satisfies Pack
```

### `packages/core/src/backend-toolkit/packs/squawk.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `fe59f063520d0a445eba6f4dcc5f300159a70c6c` · SHA-256 `ebec8aa73f4acd6b93172538f776e77805bac9877e12396a43c5cd326a6e930c` · 1730 bytes.

Linhas 3–29 · trecho SHA-256 `055da46e654facf779b7d9be3b79ad92c4c123642d45022e1eefd869c9bd6084`:

```text
3: 
4: // Pins are the GitHub release assets' sha256 digests in SRI form; squawk ships each target as one bare executable.
5: const VERSION = "2.67.0"
6: 
7: const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "squawk") => ({
8:   artifact: {
9:     url: `https://github.com/sbdchd/squawk/releases/download/v${VERSION}/squawk-${asset}`,
10:     integrity,
11:     format: "raw" as const,
12:     entries: [{ from: `squawk-${asset}`, to: executable, executable: true }],
13:   },
14:   executable,
15: })
16: 
17: export default {
18:   id: "squawk",
19:   version: VERSION,
20:   license: "Apache-2.0",
21:   upstream: "sbdchd/squawk",
22:   // Measured with script/toolkit-floors.ts (F5.4): the downloaded binary; `{}` is a static binary or one with no requirement above the Node 22 floor.
23:   floor: {
24:     "darwin-arm64": { macos: "11.0" },
25:     "darwin-x64": { macos: "10.12" },
26:     "linux-arm64": { glibc: "2.34" },
27:     "linux-x64": { glibc: "2.34" },
28:     "win32-x64": {},
29:   },
```

Linhas 37–42 · trecho SHA-256 `d8acd8780e3e5fdca383b7272a521941d14db673268c48300aedca74c3f5e296`:

```text
37:   fit: {
38:     role: "check",
39:     input: "the PostgreSQL migration files the change wrote",
40:     skills: ["backend-data", "backend-check"],
41:   },
42: } as const satisfies Pack
```

## E12 — Cinco runtimes: versões, layouts e floors

### `packages/core/src/backend-toolkit/runtimes/go.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `75c6d31c2ee8e54f9e3cfedf5f30d5449a63a417` · SHA-256 `607c8ef56bc75a8134be5535aba9ccce72efbcc44e01d2110c7577c73cc9ed4c` · 2028 bytes.

Linhas 3–62 · trecho SHA-256 `5dd6e358387fc4cff4e9b11cb9c16f9a0f0cef79c675f05d8489c32bbe67df42`:

```text
3: 
4: // Go pins are the sha256 fields of https://go.dev/dl/?mode=json&include=all for the release, in SRI form; each download
5: // hashed to the same value when pinning.
6: const GO_VERSION = "1.25.14"
7: 
8: // Every archive holds one `go/` tree with these children; all of them move, so the runtime is a complete GOROOT
9: // (`go.env` carries the toolchain's defaults, `pkg/tool` its compiler and linker).
10: const GOROOT = [
11:   "CONTRIBUTING.md",
12:   "LICENSE",
13:   "PATENTS",
14:   "README.md",
15:   "SECURITY.md",
16:   "VERSION",
17:   "api",
18:   "bin",
19:   "codereview.cfg",
20:   "doc",
21:   "go.env",
22:   "lib",
23:   "misc",
24:   "pkg",
25:   "src",
26:   "test",
27: ]
28: 
29: const go = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
30:   const windows = asset.startsWith("windows-")
31:   return {
32:     artifact: {
33:       url: `https://go.dev/dl/go${GO_VERSION}.${asset}.${windows ? "zip" : "tar.gz"}`,
34:       integrity,
35:       format: windows ? ("zip" as const) : ("tar.gz" as const),
36:       entries: GOROOT.map((name) => ({ from: `go/${name}`, to: name })),
37:     },
38:     executable: windows ? "bin/go.exe" : "bin/go",
39:   }
40: }
41: 
42: export default {
43:   id: "go",
44:   version: GO_VERSION,
45:   license: "BSD-3-Clause",
46:   upstream: "golang/go",
47:   // Measured host floor of the interpreter or toolchain (F5.4, script/toolkit-floors.ts).
48:   floor: {
49:     "darwin-arm64": { macos: "12.0" },
50:     "darwin-x64": { macos: "12.0" },
51:     "linux-arm64": {},
52:     "linux-x64": {},
53:     "win32-x64": {},
54:   },
55:   targets: {
56:     "darwin-arm64": go("darwin-arm64", "sha256-WybAtvMIJA/KJhT7AvYiz8yMDMO2nHi7pIRUiaRZAlk="),
57:     "darwin-x64": go("darwin-amd64", "sha256-sJCHpn1Xkqiw/L90IS1iVgyUrIqP11D/kg2MtfHiARg="),
58:     "linux-arm64": go("linux-arm64", "sha256-m/I06nD/7JNH/fayLOSt1RcX0zhqOKRB6Mh0P8616u4="),
59:     "linux-x64": go("linux-amd64", "sha256-ohrlYzomm81+kM92fkgiVjN5XpnYMXQsvzOXBk/udxI="),
60:     "win32-x64": go("windows-amd64", "sha256-EZBEqSs5h8NBzWrrslZnbdR4DSkve05yo+mXZneEFpc="),
61:   },
62: } satisfies Runtime
```

### `packages/core/src/backend-toolkit/runtimes/java.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `7e8f97536e3d79488f7bb05cce689162a2420b8a` · SHA-256 `02a8a16f2d274950dbde60c64750296f69488bedde47612645de894eeb34d438` · 2261 bytes.

Linhas 3–45 · trecho SHA-256 `41cbd0954e922e9da05a206a91131d4f9db67c000efffe209523c04af5444687`:

```text
3: 
4: // Pins are the Temurin release assets' sha256 digests in SRI form; each `.sha256.txt` companion agreed with them when
5: // pinning.
6: const TEMURIN = "17.0.20.1+1"
7: 
8: // Every archive holds one JRE home with these six children. They move as whole directories, so the installed tree is
9: // the complete JRE with its tar modes intact. macOS nests the home in a bundle whose launcher stub and signature
10: // resources are left out: `bin/java` loads only from the home.
11: const temurin = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
12:   const windows = asset.endsWith("_windows")
13:   const home = asset.endsWith("_mac") ? `jdk-${TEMURIN}-jre/Contents/Home` : `jdk-${TEMURIN}-jre`
14:   return {
15:     artifact: {
16:       url: `https://github.com/adoptium/temurin17-binaries/releases/download/jdk-${encodeURIComponent(TEMURIN)}/OpenJDK17U-jre_${asset}_hotspot_${TEMURIN.replace("+", "_")}.${windows ? "zip" : "tar.gz"}`,
17:       integrity,
18:       format: windows ? ("zip" as const) : ("tar.gz" as const),
19:       entries: ["NOTICE", "bin", "conf", "legal", "lib", "release"].map((name) => ({ from: `${home}/${name}`, to: name })),
20:     },
21:     executable: windows ? "bin/java.exe" : "bin/java",
22:   }
23: }
24: 
25: export default {
26:   id: "java",
27:   version: TEMURIN,
28:   license: "GPL-2.0-only WITH Classpath-exception-2.0",
29:   upstream: "adoptium/temurin17-binaries",
30:   // Measured host floor of the interpreter or toolchain (F5.4, script/toolkit-floors.ts).
31:   floor: {
32:     "darwin-arm64": { macos: "11.0" },
33:     "darwin-x64": { macos: "11.0" },
34:     "linux-arm64": { glibc: "2.17" },
35:     "linux-x64": { glibc: "2.9" },
36:     "win32-x64": { windows: "10.0" },
37:   },
38:   targets: {
39:     "darwin-arm64": temurin("aarch64_mac", "sha256-GQSAh0zM6zWMvIQDkyB/d6w+Y6TF+BKdDiPpUYuWrQU="),
40:     "darwin-x64": temurin("x64_mac", "sha256-Mzy4ESPDZWhYZkbHPI+iMm2ri63EP16jiKkP/1nJ3yc="),
41:     "linux-arm64": temurin("aarch64_linux", "sha256-uO/NWsyRCf6NNb7RMkmWQwSKJXtPYEKQbs430DyDnXc="),
42:     "linux-x64": temurin("x64_linux", "sha256-CytkDjBGtkyOxQTeCrnZG7VhAYK9oh+tRUaBzlTUWmI="),
43:     "win32-x64": temurin("x64_windows", "sha256-vCGpOSMQPNqsk+4zewrkNl5zn94234I91Fa8Z8ip01I="),
44:   },
45: } satisfies Runtime
```

### `packages/core/src/backend-toolkit/runtimes/node.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `23817c461874f9fe103c46e48cd143fdb1a1a8d9` · SHA-256 `8c461b59200597711ebec02c490dc96e5b279b41540f1042a5105fbd6750517b` · 2466 bytes.

Linhas 3–56 · trecho SHA-256 `b8b8a4328728c0bb72f8bd66e93a717a85f66a31be5653a06876e03f9f2ede65`:

```text
3: 
4: // Node pins are the sha256 lines of nodejs.org's SHASUMS256.txt for the release, in SRI form. Engine locks on this
5: // runtime are written by `npm install --package-lock-only --ignore-scripts` with the npm it bundles (10.9.8).
6: const NODE_VERSION = "22.23.2"
7: 
8: // Only the interpreter, the bundled npm and the license are installed. Archive symlinks (bin/npm, bin/npx) are left
9: // out: npm runs as `<node> lib/node_modules/npm/bin/npm-cli.js` (Windows: `node_modules/npm/bin/npm-cli.js`).
10: const unix = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => ({
11:   artifact: {
12:     url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${asset}.tar.gz`,
13:     integrity,
14:     format: "tar.gz" as const,
15:     entries: [
16:       { from: `node-v${NODE_VERSION}-${asset}/bin/node`, to: "bin/node", executable: true },
17:       { from: `node-v${NODE_VERSION}-${asset}/lib`, to: "lib" },
18:       { from: `node-v${NODE_VERSION}-${asset}/LICENSE`, to: "LICENSE" },
19:     ],
20:   },
21:   executable: "bin/node",
22: })
23: 
24: export default {
25:   id: "node",
26:   version: NODE_VERSION,
27:   license: "MIT",
28:   upstream: "nodejs/node",
29:   // Measured host floor of the interpreter or toolchain (F5.4, script/toolkit-floors.ts).
30:   floor: {
31:     "darwin-arm64": { macos: "11.0" },
32:     "darwin-x64": { macos: "11.0" },
33:     "linux-arm64": { glibc: "2.28" },
34:     "linux-x64": { glibc: "2.28" },
35:     "win32-x64": {},
36:   },
37:   targets: {
38:     "darwin-arm64": unix("darwin-arm64", "sha256-YRMPOUwWMNIR3VCuzENT03lIDzbTrJE82F27oa7VhcY="),
39:     "darwin-x64": unix("darwin-x64", "sha256-WOmQIsL/iTlVdsx/1NmM6iS7aAgUddX4i4Ae6HKfsCY="),
40:     "linux-arm64": unix("linux-arm64", "sha256-ATtZz9KBlwOm9KFKuJH8RvwqTj9bzZLeP7SSm0PjWzA="),
41:     "linux-x64": unix("linux-x64", "sha256-spSlVuY51kM4gjkg5YZsIcAnQXQtLhUp7hoiXB7JJSo="),
42:     "win32-x64": {
43:       artifact: {
44:         url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
45:         integrity: "sha256-EXe0E3ulrapWNUrkDxCAx0UOiuCc7LR9pFnRxSrJn5c=",
46:         format: "zip",
47:         entries: [
48:           { from: `node-v${NODE_VERSION}-win-x64/node.exe`, to: "node.exe", executable: true },
49:           { from: `node-v${NODE_VERSION}-win-x64/node_modules`, to: "node_modules" },
50:           { from: `node-v${NODE_VERSION}-win-x64/LICENSE`, to: "LICENSE" },
51:         ],
52:       },
53:       executable: "node.exe",
54:     },
55:   },
56: } satisfies Runtime
```

### `packages/core/src/backend-toolkit/runtimes/python.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d3744fe808d49f0710756ff40d8478e1f8da8874` · SHA-256 `d4b61a00828e88ee1cfaece927eff526458c350740c07736c6c9a16495343e4a` · 2738 bytes.

Linhas 3–65 · trecho SHA-256 `038322898ef669ce1021b421994e7da597afcc103150173902d8b3db2049a43c`:

```text
3: 
4: // Pins are the `install_only` archives of python-build-standalone release 20261003; digests are the release's
5: // SHA256SUMS lines in SRI form, which agreed with GitHub's asset digests when pinning.
6: const CPYTHON = "3.13.16"
7: const RELEASE = "20261003"
8: 
9: // Each archive holds one `python/` directory. Its top-level children move as whole trees so the interpreter keeps
10: // its standard library, bundled pip and (on Windows) its DLLs; the Windows debug symbols (`*.pdb`) are left out.
11: const unix = (triple: string, integrity: PinnedArtifact.Artifact["integrity"]) => ({
12:   artifact: {
13:     url: `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/cpython-${CPYTHON}%2B${RELEASE}-${triple}-install_only.tar.gz`,
14:     integrity,
15:     format: "tar.gz" as const,
16:     entries: ["bin", "include", "lib", "share"].map((name) => ({ from: `python/${name}`, to: name })),
17:   },
18:   executable: "bin/python3",
19: })
20: 
21: export default {
22:   id: "python",
23:   version: CPYTHON,
24:   license: "PSF-2.0",
25:   upstream: "astral-sh/python-build-standalone",
26:   // Measured host floor of the interpreter or toolchain (F5.4, script/toolkit-floors.ts).
27:   floor: {
28:     "darwin-arm64": { macos: "11.0" },
29:     "darwin-x64": { macos: "10.15" },
30:     "linux-arm64": { glibc: "2.17" },
31:     "linux-x64": { glibc: "2.17" },
32:     "win32-x64": {},
33:   },
34:   targets: {
35:     "darwin-arm64": unix("aarch64-apple-darwin", "sha256-2JddffTwj3sceq/N+svdzsPTZkFfLBpyskZraFCBWTM="),
36:     "darwin-x64": unix("x86_64-apple-darwin", "sha256-jpywhzBb+4lp9oqQX3n0FGnUqlIgwapxraf8mVO9ug8="),
37:     "linux-arm64": unix("aarch64-unknown-linux-gnu", "sha256-ZHcSHyKQSWOgZqyP+JmDuq54FRCBVZDolNqjwRzoZlI="),
38:     "linux-x64": unix("x86_64-unknown-linux-gnu", "sha256-CgJykQsQQXxlmpMS+z8tem13Tae9UQmZvno7qDJz3B8="),
39:     "win32-x64": {
40:       artifact: {
41:         url: `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/cpython-${CPYTHON}%2B${RELEASE}-x86_64-pc-windows-msvc-install_only.tar.gz`,
42:         integrity: "sha256-XhAO49WS/1APRAimJPBU0gLjLZ26ihKyImvvgQg/13g=",
43:         format: "tar.gz",
44:         entries: [
45:           { from: "python/python.exe", to: "python.exe", executable: true },
46:           ...[
47:             "DLLs",
48:             "LICENSE.txt",
49:             "Lib",
50:             "Scripts",
51:             "include",
52:             "libs",
53:             "tcl",
54:             "pythonw.exe",
55:             "python3.dll",
56:             "python313.dll",
57:             "vcruntime140.dll",
58:             "vcruntime140_1.dll",
59:           ].map((name) => ({ from: `python/${name}`, to: name })),
60:         ],
61:       },
62:       executable: "python.exe",
63:     },
64:   },
65: } satisfies Runtime
```

### `packages/core/src/backend-toolkit/runtimes/rust.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `1e2696f2f7ed5265edb397ea8e2f7f71f9256ebd` · SHA-256 `d27529a3cf34ab368d03f04ff78ed8494e013c6ab0443f88fb1448e8d1e18770` · 2526 bytes.

Linhas 3–52 · trecho SHA-256 `ceb65d58338b37b193b5f86500d6f6f33c6910d4afedaea925587b648ba5e99a`:

```text
3: 
4: // Pins are the sha256 digests in SRI form, each from its static.rust-lang.org `.sha256` companion, which the downloaded
5: // darwin-x64 archive matched.
6: const RUST_VERSION = "1.99.0"
7: 
8: // The standalone archive expects its `install.sh`; moving these component directories instead lays out the same
9: // sysroot. `rustc` finds `lib/rustlib/<triple>/lib` (from rust-std) relative to its own `bin`, and none of these
10: // destinations overlap. Cargo looks for `rustc` on PATH, so the build sets RUSTC to this runtime's `bin/rustc`.
11: const rust = (triple: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
12:   const root = `rust-${RUST_VERSION}-${triple}`
13:   const exe = triple.includes("windows") ? ".exe" : ""
14:   return {
15:     artifact: {
16:       url: `https://static.rust-lang.org/dist/${root}.tar.gz`,
17:       integrity,
18:       format: "tar.gz" as const,
19:       entries: [
20:         { from: `${root}/rustc/bin`, to: "bin" },
21:         { from: `${root}/rustc/lib`, to: "lib" },
22:         { from: `${root}/cargo/bin/cargo${exe}`, to: `bin/cargo${exe}` },
23:         { from: `${root}/rust-std-${triple}/lib/rustlib/${triple}/lib`, to: `lib/rustlib/${triple}/lib` },
24:         ...["COPYRIGHT", "LICENSE-APACHE", "LICENSE-MIT"].map((name) => ({ from: `${root}/${name}`, to: name })),
25:       ],
26:     },
27:     executable: `bin/cargo${exe}`,
28:   }
29: }
30: 
31: export default {
32:   id: "rust",
33:   version: RUST_VERSION,
34:   license: "MIT OR Apache-2.0",
35:   upstream: "rust-lang/rust",
36:   // Measured host floor of the interpreter or toolchain (F5.4, script/toolkit-floors.ts). The darwin-x64 archive's
37:   // executables need 10.12; 11.0 comes from the arm64 slice of its `rtsan` sanitizer dylib, which is installed too.
38:   floor: {
39:     "darwin-arm64": { macos: "11.0" },
40:     "darwin-x64": { macos: "11.0" },
41:     "linux-arm64": { glibc: "2.17" },
42:     "linux-x64": { glibc: "2.17" },
43:     "win32-x64": {},
44:   },
45:   targets: {
46:     "darwin-arm64": rust("aarch64-apple-darwin", "sha256-8158Wyz2PmfAddMj5Na4dQEhkxHwl0SrJMrst2HJZkM="),
47:     "darwin-x64": rust("x86_64-apple-darwin", "sha256-WWdWEBv0PNM1+yR/XMnt4MFXJFUjuv8lpmaUaCSVz8s="),
48:     "linux-arm64": rust("aarch64-unknown-linux-gnu", "sha256-QiFOaT7ABzPipZHmfBOvmPrwKoKTQQip83r9JHs3bdA="),
49:     "linux-x64": rust("x86_64-unknown-linux-gnu", "sha256-3gWByp1zIpWmR0z70CRh2yfWms1QUKggZSOo1voVmds="),
50:     "win32-x64": rust("x86_64-pc-windows-msvc", "sha256-2MIRV+cNhsboYdV9nBkaefR7lAtPzUjClECy9KPIqlE="),
51:   },
52: } satisfies Runtime
```

## E13 — Research packs e contratos de locks

### `packages/core/src/research-toolkit/manifest.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `5532b7fda4fef40c8ff7bd9e4224ac4288e35bb1` · SHA-256 `c157bc4d55f9108eee8d7328482016c831ee8763929565e04a063e8a8e9eb943` · 804 bytes.

Linhas 5–17 · trecho SHA-256 `21f2d0cd074eee12cb5e400df55f7f0b671cedc2f25ff60037b252b1b43afc85`:

```text
5: 
6: // J6.4: one pack file per engine under `packs/`, listed here once and keyed by its own id, as the backend's are. An id
7: // with no pack yet is unshipped: `status` reports it unsupported and `ensure` fails named, never empty (J6.10).
8: export const ENGINES: Readonly<Partial<Record<ResearchEngineId, ResearchPack>>> = PACKS
9: 
10: /** Every research engine id, in the order the toolkit lists them; the record keeps the list complete. */
11: export const IDS = Object.keys({
12:   "scip-typescript": true,
13:   "scip-python": true,
14:   "scip-go": true,
15:   "rust-analyzer": true,
16:   typescript: true,
17: } satisfies Record<ResearchEngineId, true>) as ReadonlyArray<ResearchEngineId>
```

### `packages/core/src/research-toolkit/packs/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c560a0cf8a33ec10e1cf199c905517a6c629da15` · SHA-256 `b48a9611134151e4e44643cf8bf21e84dba990ba9a65ad644788535133bd5b2d` · 545 bytes.

Linhas 1–15 · trecho SHA-256 `b48a9611134151e4e44643cf8bf21e84dba990ba9a65ad644788535133bd5b2d`:

```text
1: import rustAnalyzer from "./rust-analyzer"
2: import scipGo from "./scip-go"
3: import scipPython from "./scip-python"
4: import scipTypescript from "./scip-typescript"
5: import typescript from "./typescript"
6: 
7: // One import and one entry per pack, keyed by its own id (J6.4).
8: // The tree-sitter grammars and `@c4312/scip` are not packs: they are core dependencies (J6.5).
9: export const PACKS = {
10:   [rustAnalyzer.id]: rustAnalyzer,
11:   [scipGo.id]: scipGo,
12:   [scipPython.id]: scipPython,
13:   [scipTypescript.id]: scipTypescript,
14:   [typescript.id]: typescript,
15: }
```

### `packages/core/src/research-toolkit/packs/rust-analyzer.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `617871bdf12fd837043ded8b6fde6b1d19caf56c` · SHA-256 `e43f4d1b6b57910cc7b4a43306f033700443f8d79b65cf84edc3ab052e6abb96` · 1916 bytes.

Linhas 3–38 · trecho SHA-256 `28e98b06dc8f547f71d62ebfc0799e52e600fd29b4f217602dffad3be9d55c36`:

```text
3: 
4: // Pins are the GitHub release assets' sha256 digests in SRI form; the darwin-arm64 and win32-x64 downloads hashed to the
5: // same values when pinning. The per-target VS Code packages are zips (the bare `.gz` binaries are no PinnedArtifact
6: // format) that carry the server at `extension/server/`. Releases are tagged by date; the version is the server's own,
7: // from the package's package.json. `rust-analyzer scip` loads the workspace through the host's `cargo metadata`; a host
8: // without cargo keeps the tree-sitter layer (code-index/extract.ts).
9: const RELEASE = "2026-09-28"
10: const VERSION = "0.3.3065"
11: 
12: const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "rust-analyzer") => ({
13:   artifact: {
14:     url: `https://github.com/rust-lang/rust-analyzer/releases/download/${RELEASE}/rust-analyzer-${asset}.vsix`,
15:     integrity,
16:     format: "zip" as const,
17:     entries: [
18:       { from: `extension/server/${executable}`, to: executable, executable: true },
19:       { from: "extension/LICENSE.txt", to: "LICENSE.txt" },
20:     ],
21:   },
22:   executable,
23: })
24: 
25: export default {
26:   id: "rust-analyzer",
27:   version: VERSION,
28:   license: "MIT OR Apache-2.0",
29:   upstream: "rust-lang/rust-analyzer",
30:   targets: {
31:     "darwin-arm64": target("darwin-arm64", "sha256-dl+bmaJkLF7DE8eTOsELEIbi8unku9wPSRtONVoInIs="),
32:     "darwin-x64": target("darwin-x64", "sha256-Mfl7k7qWiWtr4n2Uu1Pz3shSQEOXkkODzKyb8elSgKw="),
33:     "linux-arm64": target("linux-arm64", "sha256-MyBdtpwnOct46Q1AEYVbZFNHPisYnxHgcbuSCwGYDZw="),
34:     "linux-x64": target("linux-x64", "sha256-6aU9TURNAmncTBysGQSPLgL7P4Ap9OqXIvZ+XOjD1UA="),
35:     "win32-x64": target("win32-x64", "sha256-MiOpRN4FBk0q2FI721bTnuRzG9e6qLYyJCI6xdJDMjs=", "rust-analyzer.exe"),
36:   },
37:   fit: { role: "indexer", languages: ["rust"] },
38: } as const satisfies ResearchPack
```

### `packages/core/src/research-toolkit/packs/scip-go.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `047a037a20dc3902328c76dd41c46cd7f7dafd2f` · SHA-256 `7c20e1d6fd8e2d7331a43caa152c7db860620f0dfbdbd15e74b11c48f0d89e8b` · 1765 bytes.

Linhas 3–35 · trecho SHA-256 `a0fb5fc34c0a6b4a9ae0273741fdf2eddef23a8978ca8a47ea7abf746d1294be`:

```text
3: // scip-go publishes binaries for three of the five targets only, so it builds from the module source on the private
4: // Go runtime, as the backend's ogen does. The module moved from sourcegraph to scip-code; its go.mod declares
5: // `go 1.25.0`, which the Go runtime satisfies. At index time it loads packages through the host's own `go`
6: // toolchain (`go list`); a host without one keeps the tree-sitter layer (code-index/extract.ts).
7: const VERSION = "0.2.7"
8: 
9: // The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir.
10: const SOURCE = [".agents", ".github", ".gitignore", "LICENSE", "README.md", "cmd", "flake.lock", "flake.nix", "go.mod", "go.sum", "internal"]
11: 
12: // The pin is the sha256 of the proxy's module zip, computed from the download. Recomputing the Go dirhash over the
13: // zip's files gave h1:gcHFnhoMCdp3C/0xvCn9QFuTsF/W3JSR5cLVf7uG+Us=, the hash sum.golang.org records for the module.
14: // Its dependencies are pinned by the module's own go.sum and verified against the checksum database at build time.
15: export default {
16:   id: "scip-go",
17:   version: VERSION,
18:   license: "Apache-2.0",
19:   upstream: "scip-code/scip-go",
20:   runtime: "go",
21:   install: {
22:     kind: "source",
23:     artifact: {
24:       url: `https://proxy.golang.org/github.com/scip-code/scip-go/@v/v${VERSION}.zip`,
25:       integrity: "sha256-UrTV3vykBXbGTyGhlsYeCMxUSB1yy25Yor2gfLtB5wE=",
26:       format: "zip",
27:       entries: SOURCE.map((name) => ({ from: `github.com/scip-code/scip-go@v${VERSION}/${name}`, to: `src/${name}` })),
28:     },
29:     build: "go",
30:     path: "./cmd/scip-go",
31:     binary: "scip-go",
32:   },
33:   launch: [],
34:   fit: { role: "indexer", languages: ["go"] },
35: } as const satisfies ResearchPack
```

### `packages/core/src/research-toolkit/packs/scip-python.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ba07604bc14e0b439b7fe0e92194eb07f8f078c1` · SHA-256 `b4d35ef1e9b11ec8687f39c6e51f4b3d9b2afa5908de3a46b41ea05b63e7fbd1` · 1073 bytes.

Linhas 3–32 · trecho SHA-256 `42d70cc603b9f06b4a0c959522ed8f367f75d43914f0f66c2e03f605b34ff5e9`:

```text
3: 
4: // A bundled pyright fork in pure JavaScript with no install scripts, so one lock installs on all five targets. It runs
5: // on node and reads the project's Python source and installed packages; it needs no Python interpreter to index the
6: // project's own files.
7: const VERSION = "0.6.6"
8: 
9: export default {
10:   id: "scip-python",
11:   version: VERSION,
12:   license: "MIT",
13:   upstream: "sourcegraph/scip-python",
14:   runtime: "node",
15:   install: {
16:     kind: "npm",
17:     // The package.json text the lock was written from, in npm's own formatting.
18:     packageJson:
19:       JSON.stringify(
20:         {
21:           name: "research-toolkit-scip-python",
22:           private: true,
23:           dependencies: { "@sourcegraph/scip-python": VERSION },
24:         },
25:         null,
26:         2,
27:       ) + "\n",
28:     lock: JSON.stringify(lock, null, 2) + "\n",
29:   },
30:   launch: ["{install}/node_modules/@sourcegraph/scip-python/index.js"],
31:   fit: { role: "indexer", languages: ["py"] },
32: } as const satisfies ResearchPack
```

### `packages/core/src/research-toolkit/packs/scip-typescript.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a879dd486a40a0553a6fdedf82e093251ce2ec07` · SHA-256 `97fd24e79cc805da3f89b7ae31d8e52e25a946b7249b1421a85b7923b06c4773` · 1057 bytes.

Linhas 3–31 · trecho SHA-256 `133dc6be634559b0609ce90ccfac53dde226492c398e87c5bbb508778594c2b4`:

```text
3: 
4: // Pure JavaScript with no install scripts, so one lock installs on all five targets. It carries its own TypeScript 5.x
5: // compiler; the `typescript` oracle pack is separate and pinned independently.
6: const VERSION = "0.4.0"
7: 
8: export default {
9:   id: "scip-typescript",
10:   version: VERSION,
11:   license: "Apache-2.0",
12:   upstream: "sourcegraph/scip-typescript",
13:   runtime: "node",
14:   install: {
15:     kind: "npm",
16:     // The package.json text the lock was written from, in npm's own formatting.
17:     packageJson:
18:       JSON.stringify(
19:         {
20:           name: "research-toolkit-scip-typescript",
21:           private: true,
22:           dependencies: { "@sourcegraph/scip-typescript": VERSION },
23:         },
24:         null,
25:         2,
26:       ) + "\n",
27:     lock: JSON.stringify(lock, null, 2) + "\n",
28:   },
29:   launch: ["{install}/node_modules/@sourcegraph/scip-typescript/dist/src/main.js"],
30:   fit: { role: "indexer", languages: ["ts", "js"] },
31: } as const satisfies ResearchPack
```

### `packages/core/src/research-toolkit/packs/typescript.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `781df87bba6bdb1002aadf61574498c96410155f` · SHA-256 `7c125ffd1acf9381933be0709209d97e79b91b3b1e3abccab4cb8e7d2a57f845` · 867 bytes.

Linhas 3–26 · trecho SHA-256 `74fadb445e7c4a75c490a441352de73f6179215b58deae862756d1d4fa8d83f1`:

```text
3: 
4: // The fallback oracle (J6.4). TypeScript stays on 6.x: 7.x is the native port without the JavaScript compiler API.
5: const VERSION = "6.0.3"
6: 
7: export default {
8:   id: "typescript",
9:   version: VERSION,
10:   license: "Apache-2.0",
11:   upstream: "microsoft/TypeScript",
12:   runtime: "node",
13:   install: {
14:     kind: "npm",
15:     // The package.json text the lock was written from, in npm's own formatting.
16:     packageJson:
17:       JSON.stringify(
18:         { name: "research-toolkit-typescript", private: true, dependencies: { typescript: VERSION } },
19:         null,
20:         2,
21:       ) + "\n",
22:     lock: JSON.stringify(lock, null, 2) + "\n",
23:   },
24:   launch: ["{install}/node_modules/typescript/lib/tsc.js"],
25:   fit: { role: "oracle", languages: ["ts", "js"] },
26: } as const satisfies ResearchPack
```

### `packages/core/src/backend-toolkit/packs/kysely-codegen.package-lock.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `4c258c62096c9a119896f0826836d3653645f0f1` · SHA-256 `9de6d58c097012a2022acbedbe1a1d7ff7b25d08bc23c65ca912f6a851401641` · 27939 bytes.

Linhas 1–22 · trecho SHA-256 `da25a5e89652631219a29b7c13c0bc6af6d32d86927eac63254f5b42a448143c`:

```text
1: {
2:   "name": "backend-toolkit-kysely-codegen",
3:   "lockfileVersion": 3,
4:   "requires": true,
5:   "packages": {
6:     "": {
7:       "name": "backend-toolkit-kysely-codegen",
8:       "dependencies": {
9:         "kysely-codegen": "0.20.0",
10:         "mysql2": "3.24.5",
11:         "pg": "8.23.1",
12:         "typescript": "6.0.3"
13:       }
14:     },
15:     "node_modules/@babel/code-frame": {
16:       "version": "7.29.7",
17:       "resolved": "https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.7.tgz",
18:       "integrity": "sha512-Aup7aUOfpbAUg2ROOJN6Iw5f9DMBlzu0mIkm/malLQFN/YQgO48wCj0Kxa3sEHJvPVFg7siR+qRInwXd2qhQKw==",
19:       "license": "MIT",
20:       "dependencies": {
21:         "@babel/helper-validator-identifier": "^7.29.7",
22:         "js-tokens": "^4.0.0",
```

### `packages/core/src/backend-toolkit/packs/modelina.package-lock.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9fc9ef1bc7124fcead2d83cea20f2bff4340949c` · SHA-256 `0fc1a48c86b45b4749fda6d5e811a1f9b3f55a246fa5e8dd035435e84d2149d2` · 266885 bytes.

Linhas 1–22 · trecho SHA-256 `7f431fe7064ab829eecbedee28f239d4b1ef9b6766d5beeb9ad1fd287f917e7a`:

```text
1: {
2:   "name": "backend-toolkit-modelina",
3:   "lockfileVersion": 3,
4:   "requires": true,
5:   "packages": {
6:     "": {
7:       "name": "backend-toolkit-modelina",
8:       "dependencies": {
9:         "@asyncapi/modelina-cli": "5.10.1"
10:       }
11:     },
12:     "node_modules/@apidevtools/json-schema-ref-parser": {
13:       "version": "11.9.3",
14:       "resolved": "https://registry.npmjs.org/@apidevtools/json-schema-ref-parser/-/json-schema-ref-parser-11.9.3.tgz",
15:       "integrity": "sha512-60vepv88RwcJtSHrD6MjIL6Ta3SOYbgfnkHb+ppAVK+o9mXprRtulx7VlRl3lN3bbvysAfCS7WMVfhUYemB0IQ==",
16:       "license": "MIT",
17:       "dependencies": {
18:         "@jsdevtools/ono": "^7.1.3",
19:         "@types/json-schema": "^7.0.15",
20:         "js-yaml": "^4.1.0"
21:       },
22:       "engines": {
```

Linhas 4468–4493 · trecho SHA-256 `76ec46936849570373298c8a74c5eee58d60b274276669282eda546594ad598b`:

```text
4468:       },
4469:       "funding": {
4470:         "url": "https://github.com/sponsors/sindresorhus"
4471:       }
4472:     },
4473:     "node_modules/npm/node_modules/@gar/promise-retry": {
4474:       "version": "1.0.3",
4475:       "inBundle": true,
4476:       "license": "MIT",
4477:       "engines": {
4478:         "node": "^20.17.0 || >=22.9.0"
4479:       }
4480:     },
4481:     "node_modules/npm/node_modules/@isaacs/fs-minipass": {
4482:       "version": "4.0.1",
4483:       "inBundle": true,
4484:       "license": "ISC",
4485:       "dependencies": {
4486:         "minipass": "^7.0.4"
4487:       },
4488:       "engines": {
4489:         "node": ">=18.0.0"
4490:       }
4491:     },
4492:     "node_modules/npm/node_modules/@isaacs/string-locale-compare": {
4493:       "version": "1.1.0",
```

### `packages/core/src/backend-toolkit/packs/orval.package-lock.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `af0c40af9f14e14b7703b94d2b475f1e2f159c2a` · SHA-256 `a3b052e1684e432a80198786e8d5b3744a7b4635dadb5fa4088853817a4f2026` · 50428 bytes.

Linhas 1–22 · trecho SHA-256 `163b8983a6ac3c3484473d85ee4f6b5246de708c20214dec8498369757dbdd5d`:

```text
1: {
2:   "name": "backend-toolkit-orval",
3:   "lockfileVersion": 3,
4:   "requires": true,
5:   "packages": {
6:     "": {
7:       "name": "backend-toolkit-orval",
8:       "dependencies": {
9:         "orval": "8.39.0"
10:       }
11:     },
12:     "node_modules/@commander-js/extra-typings": {
13:       "version": "15.0.0",
14:       "resolved": "https://registry.npmjs.org/@commander-js/extra-typings/-/extra-typings-15.0.0.tgz",
15:       "integrity": "sha512-yeJlba62xqmkgELUsn7356MEnzLLu/fw2x4lofFqGnXh6YysRdEs2BaLeLtg1+KU0AXvMeqQvTTp+3hBEBK+EA==",
16:       "license": "MIT",
17:       "peerDependencies": {
18:         "commander": "~15.0.0"
19:       }
20:     },
21:     "node_modules/@esbuild/aix-ppc64": {
22:       "version": "0.28.2",
```

### `packages/core/src/backend-toolkit/packs/protoc-gen-es.package-lock.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `14948253df8c32134e869f975a8e5f634dc44ad2` · SHA-256 `7bb67cf09c2d6fb3314b69705375ffda7bf68b2dda8f7917941e97da41aa03bd` · 3392 bytes.

Linhas 1–22 · trecho SHA-256 `344cdeb9b5f892025870ad3219b7bd9d33396b35642d89491d7a22a637ba2ded`:

```text
1: {
2:   "name": "backend-toolkit-protoc-gen-es",
3:   "lockfileVersion": 3,
4:   "requires": true,
5:   "packages": {
6:     "": {
7:       "name": "backend-toolkit-protoc-gen-es",
8:       "dependencies": {
9:         "@bufbuild/protoc-gen-es": "2.16.0"
10:       }
11:     },
12:     "node_modules/@bufbuild/protobuf": {
13:       "version": "2.16.0",
14:       "resolved": "https://registry.npmjs.org/@bufbuild/protobuf/-/protobuf-2.16.0.tgz",
15:       "integrity": "sha512-FWa0sPlqYGJgpTs6OxBRcL/AW4JT0OIO+W1ajerluoTVh8CV0B7XM1qsNCRgnkSCkRCgOICKHRQlY17jrsm0+Q==",
16:       "license": "(Apache-2.0 AND BSD-3-Clause)"
17:     },
18:     "node_modules/@bufbuild/protoc-gen-es": {
19:       "version": "2.16.0",
20:       "resolved": "https://registry.npmjs.org/@bufbuild/protoc-gen-es/-/protoc-gen-es-2.16.0.tgz",
21:       "integrity": "sha512-LbPrEaGd7bOxKbJHllTR5439+PZjqd6fM7xyDZkDVtZ+Efzr7TMdMqShG9Qkf/nYVyiNS/SK5r9JhRaBTFkfZw==",
22:       "license": "Apache-2.0",
```

### `packages/core/src/research-toolkit/packs/scip-python.package-lock.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d6912c185ec9c376dca28c4246ba12e7385389d8` · SHA-256 `a9bf75b6185aad8130476c5c4234026ea059400241720e7db2b11c575eecdf03` · 28385 bytes.

Linhas 1–22 · trecho SHA-256 `3f1387b3977fefa757d8799550f6efcbeb832dd01c56f912ffb76b20f2de5951`:

```text
1: {
2:   "name": "research-toolkit-scip-python",
3:   "lockfileVersion": 3,
4:   "requires": true,
5:   "packages": {
6:     "": {
7:       "name": "research-toolkit-scip-python",
8:       "dependencies": {
9:         "@sourcegraph/scip-python": "0.6.6"
10:       }
11:     },
12:     "node_modules/@cspotcode/source-map-support": {
13:       "version": "0.8.1",
14:       "resolved": "https://registry.npmjs.org/@cspotcode/source-map-support/-/source-map-support-0.8.1.tgz",
15:       "integrity": "sha512-IchNf6dN4tHoMFIn/7OE8LWZ19Y6q/67Bmf6vnGREv8RSbBVb9LPJxEcnwrcwX6ixSvaiGoomAUvu4YSxXrVgw==",
16:       "license": "MIT",
17:       "dependencies": {
18:         "@jridgewell/trace-mapping": "0.3.9"
19:       },
20:       "engines": {
21:         "node": ">=12"
22:       }
```

### `packages/core/src/research-toolkit/packs/scip-typescript.package-lock.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `e6b78e912d54fd5115fb0c4c804c41f175ac82c8` · SHA-256 `50c220b0739d12746c369da1296b8176737768b43b1ce393532f7cf306ceeb48` · 2274 bytes.

Linhas 1–22 · trecho SHA-256 `985538c6c2f793adf47441022dfac47fe3b9db3ab06e8bb509d771a99bcfea45`:

```text
1: {
2:   "name": "research-toolkit-scip-typescript",
3:   "lockfileVersion": 3,
4:   "requires": true,
5:   "packages": {
6:     "": {
7:       "name": "research-toolkit-scip-typescript",
8:       "dependencies": {
9:         "@sourcegraph/scip-typescript": "0.4.0"
10:       }
11:     },
12:     "node_modules/@sourcegraph/scip-typescript": {
13:       "version": "0.4.0",
14:       "resolved": "https://registry.npmjs.org/@sourcegraph/scip-typescript/-/scip-typescript-0.4.0.tgz",
15:       "integrity": "sha512-k+AtsrqmS41Sd5qjkZlHcmvoSQIvBOonRj4jpgp0KNFM6aqvMGpdSuPUqrUcg8ENTKjUbfaUVszgQwq3bCOvwA==",
16:       "license": "Apache-2.0",
17:       "dependencies": {
18:         "commander": "^12.1.0",
19:         "google-protobuf": "^3.21.4",
20:         "progress": "^2.0.3",
21:         "typescript": "^5.6.2"
22:       },
```

### `packages/core/src/research-toolkit/packs/typescript.package-lock.json`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `5b547b8a8d1157434b4aa5d1a46d4f4fee79651c` · SHA-256 `442acbeda058036d02d4f2483e19149512ebde276c57d65ad3aa664735ff0a76` · 667 bytes.

Linhas 1–22 · trecho SHA-256 `4e3478631da4d1bc24651e3605b57453db8c4bb02df82d723de7aa6355956a1a`:

```text
1: {
2:   "name": "research-toolkit-typescript",
3:   "lockfileVersion": 3,
4:   "requires": true,
5:   "packages": {
6:     "": {
7:       "name": "research-toolkit-typescript",
8:       "dependencies": {
9:         "typescript": "6.0.3"
10:       }
11:     },
12:     "node_modules/typescript": {
13:       "version": "6.0.3",
14:       "resolved": "https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz",
15:       "integrity": "sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==",
16:       "license": "Apache-2.0",
17:       "bin": {
18:         "tsc": "bin/tsc",
19:         "tsserver": "bin/tsserver"
20:       },
21:       "engines": {
22:         "node": ">=14.17"
```

## E14 — Caps, default adapter, packs ausentes e warm

### `packages/core/src/research-toolkit/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` · SHA-256 `9c1bfe5c5a7bc0c8d4d1f835e61031e0cca06b9ed6567415d9d04ff6e84b599c` · 14147 bytes.

Linhas 15–145 · trecho SHA-256 `c2b4d10c7704c870137f48b913deaa3bf562e8cf29e78cca9244e36bcb24602e`:

```text
15: // J6: the discovery seat's pinned engines on the BackendToolkit lifecycle, with research Root and Manifest supplied.
16: // Nothing here copies acquisition: `status`, `ensure` and `prefetch` run BackendToolkit's verbs over this toolkit's
17: // own root and packs, so installs, launchers, shims, retries and failure causes are the backend's (J6.1).
18: 
19: export type ResearchEngineId = "scip-typescript" | "scip-python" | "scip-go" | "rust-analyzer" | "typescript"
20: 
21: export type Language = "ts" | "js" | "py" | "go" | "rust"
22: 
23: /** A research engine file; it carries its own fit and never touches the backend Pack's entry skills. */
24: export type ResearchPack = Engine<string> & {
25:   readonly fit: { readonly role: "indexer" | "oracle"; readonly languages: ReadonlyArray<Language> }
26: }
27: 
28: export type State = { readonly engine: ResearchEngineId; readonly version: string } & BackendToolkit.EngineState
29: 
30: /** Owner caps (D2, 2026-10-18) and the index disk budget (J2.4); config `research.limits.*` may lower them. */
31: export const Limits = Object.freeze({
32:   indexerBytes: 2 * 1024 * 1024 * 1024,
33:   probeBytes: 1024 * 1024 * 1024,
34:   scratchBytes: 2 * 1024 * 1024 * 1024,
35:   indexBytes: 4 * 1024 * 1024 * 1024,
36:   indexCommits: 8,
37:   shardTimeoutMs: 15 * 60_000,
38: })
39: 
40: export const Root = Context.Reference<string>("@orchestra/ResearchToolkit/Root", {
41:   defaultValue: () => process.env.RESEARCH_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "research-toolkit"),
42: })
43: 
44: export const Manifest = Context.Reference<Readonly<Partial<Record<ResearchEngineId, ResearchPack>>>>(
45:   "@orchestra/ResearchToolkit/Manifest",
46:   { defaultValue: () => ENGINES },
47: )
48: 
49: /** The caps in force; the instance provides `research.limits.*` here, which may only lower `Limits`. */
50: export const Caps = Context.Reference<typeof Limits>("@orchestra/ResearchToolkit/Caps", { defaultValue: () => Limits })
51: 
52: /** `Caps` from config `research.limits.*`: each configured value lowers its owner cap and never raises it (D2). */
53: export function caps(limits?: {
54:   readonly indexer_bytes?: number
55:   readonly probe_bytes?: number
56:   readonly scratch_bytes?: number
57:   readonly index_bytes?: number
58: }): typeof Limits {
59:   const lower = (cap: number, value?: number) => Math.min(cap, value ?? cap)
60:   return Object.freeze({
61:     ...Limits,
62:     indexerBytes: lower(Limits.indexerBytes, limits?.indexer_bytes),
63:     probeBytes: lower(Limits.probeBytes, limits?.probe_bytes),
64:     scratchBytes: lower(Limits.scratchBytes, limits?.scratch_bytes),
65:     indexBytes: lower(Limits.indexBytes, limits?.index_bytes),
66:   })
67: }
68: 
69: /** One (language, project) shard of a worktree's index (J2.1), as the index store sees it at the worktree's commit. */
70: export type Shard = {
71:   /** The shard key (J2.2); a new commit that changes the project's tree is a new id. */
72:   readonly id: string
73:   readonly language: Language
74:   readonly project: string
75:   /** The project's aggregated `file_rank`; higher builds first. */
76:   readonly rank: number
77:   readonly engine: ResearchEngineId
78:   readonly state: "ready" | "stale" | "absent"
79: }
80: 
81: export type ShardState = Pick<Shard, "id" | "language" | "project"> &
82:   ({ readonly status: Shard["state"] | "building" } | { readonly status: "skipped"; readonly reason: string })
83: 
84: export class ShardFailed extends Schema.TaggedErrorClass<ShardFailed>()("ResearchToolkit.ShardFailed", {
85:   reason: Schema.String,
86: }) {
87:   override get message() {
88:     return `Research index shard not built: ${this.reason}`
89:   }
90: }
91: 
92: /**
93:  * The code index (X3) as the toolkit drives it: which shards a worktree has, and how one is built. `build` runs the
94:  * pack's indexer under `ToolSafetySandbox.confine` within `memoryBytes` and stops when interrupted; the toolkit owns
95:  * ordering, the host-wide one-indexer rule and the timeout (J6.7).
96:  */
97: export const Index = Context.Reference<{
98:   readonly plan: (worktree: string) => Effect.Effect<ReadonlyArray<Shard>, ShardFailed>
99:   readonly build: (
100:     shard: Shard,
101:     input: { readonly worktree: string; readonly executable: string; readonly memoryBytes: number },
102:   ) => Effect.Effect<void, ShardFailed>
103: }>("@orchestra/ResearchToolkit/Index", {
104:   defaultValue: () => ({
105:     plan: () => Effect.succeed([]),
106:     build: () => Effect.fail(new ShardFailed({ reason: "index-builder-unavailable" })),
107:   }),
108: })
109: 
110: /** The same verbs as BackendToolkit, over the research manifest. */
111: export const status: (id?: ResearchEngineId) => Effect.Effect<ReadonlyArray<State>> = Effect.fn("ResearchToolkit.status")(
112:   function* (id?: ResearchEngineId) {
113:     const manifest = yield* Manifest
114:     const ids = id ? [id] : IDS
115:     const states: ReadonlyArray<BackendToolkit.State<ResearchEngineId>> = ids.some((item) => manifest[item])
116:       ? yield* BackendToolkit.status<ResearchEngineId>(id).pipe(lifecycle)
117:       : []
118:     return ids.map((item): State => states.find((state) => state.engine === item) ?? unshipped(item))
119:   },
120: )
121: 
122: /** Every failure is `toolkit-not-ready:<state>:<id>[:<cause>]`, the blocker `code_query` reports (J6.10). */
123: export const ensure: (id: ResearchEngineId) => Effect.Effect<{ readonly executable: string }, BackendToolkit.NotReady> =
124:   Effect.fn("ResearchToolkit.ensure")(function* (id: ResearchEngineId) {
125:     const manifest = yield* Manifest
126:     if (!manifest[id]) return yield* new BackendToolkit.NotReady({ reason: `toolkit-not-ready:unsupported:${id}:pack-not-shipped` })
127:     return yield* BackendToolkit.ensure(id).pipe(
128:       lifecycle,
129:       Effect.mapError((error) => new BackendToolkit.NotReady({ reason: named(id, error.reason) })),
130:     )
131:   })
132: 
133: export const prefetch: (ids?: ReadonlyArray<ResearchEngineId>) => Effect.Effect<ReadonlyArray<State>> = Effect.fn(
134:   "ResearchToolkit.prefetch",
135: )(function* (ids?: ReadonlyArray<ResearchEngineId>) {
136:   const manifest = yield* Manifest
137:   const chosen = ids ?? IDS
138:   const shipped = chosen.filter((id) => manifest[id])
139:   const states: ReadonlyArray<BackendToolkit.State<ResearchEngineId>> = shipped.length
140:     ? yield* BackendToolkit.prefetch(shipped).pipe(lifecycle)
141:     : []
142:   return chosen.map((id): State => states.find((state) => state.engine === id) ?? unshipped(id))
143: })
144: 
145: // One warm-up per worktree per process; a second request while one runs joins nothing and returns.
```

Linhas 164–218 · trecho SHA-256 `2cae67d26e312aaba1350b976ad169bd02ca8acf1405d8a0bb7bc60e59a87b8e`:

```text
164: export const warm = Effect.fn("ResearchToolkit.warm")(function* (worktree: string) {
165:   const index = yield* Index
166:   const caps = yield* Caps
167:   const root = yield* Root
168:   const plan = yield* index.plan(worktree).pipe(Effect.orElseSucceed((): ReadonlyArray<Shard> => []))
169:   const pending = plan.filter((shard) => shard.state !== "ready").toSorted((a, b) => b.rank - a.rank)
170:   const engines = new Map(
171:     yield* Effect.forEach([...new Set(pending.map((shard) => shard.engine))], (engine) =>
172:       ensure(engine).pipe(
173:         Effect.match({ onSuccess: (ready) => ready, onFailure: (error) => ({ reason: error.reason }) }),
174:         Effect.map((ready) => [engine, ready] as const),
175:       ),
176:     ),
177:   )
178:   const flock = yield* EffectFlock.Service
179:   yield* Effect.forEach(
180:     pending,
181:     Effect.fnUntraced(function* (shard: Shard) {
182:       const ready = engines.get(shard.engine) ?? { reason: `toolkit-not-ready:absent:${shard.engine}` }
183:       if ("reason" in ready) return yield* record(root, worktree, shard.id, { status: "skipped", reason: ready.reason })
184:       // A query that is already building this shard is awaited, not repeated (`shard.id` is the shard key).
185:       const built = yield* CodeIndexStore.singleFlight(
186:         root,
187:         shard.id,
188:         flock
189:           .withLock(
190:             Effect.gen(function* () {
191:               yield* record(root, worktree, shard.id, { status: "building" })
192:               return yield* index
193:                 .build(shard, { worktree, executable: ready.executable, memoryBytes: caps.indexerBytes })
194:                 .pipe(
195:                   Effect.timeoutOrElse({
196:                     duration: caps.shardTimeoutMs,
197:                     orElse: () => Effect.fail(new ShardFailed({ reason: `timeout:${caps.shardTimeoutMs}ms` })),
198:                   }),
199:                 )
200:             }),
201:             "research-toolkit:indexer",
202:             path.join(root, "locks"),
203:           )
204:           // The lock waits at most five minutes per try; a shard of another worktree may hold it for fifteen.
205:           .pipe(
206:             Effect.retry({ while: (error) => error._tag === "LockTimeoutError" }),
207:             Effect.mapError((error) =>
208:               error._tag === "ResearchToolkit.ShardFailed" ? error : new ShardFailed({ reason: "indexer-lock-compromised" })),
209:           ),
210:         { describe: (error) => error.reason, join: (reason) => new ShardFailed({ reason }) },
211:       ).pipe(
212:         Effect.match({ onSuccess: () => undefined, onFailure: (error) => error.reason }),
213:       )
214:       yield* record(root, worktree, shard.id, built === undefined ? undefined : { status: "skipped", reason: built })
215:     }),
216:     { discard: true },
217:   )
218: }, Effect.provide(LayerNode.compile(EffectFlock.node)))
```

Linhas 251–263 · trecho SHA-256 `1ed173864012dc2bdc8eadd4b59f167727210296bb7a2d0e3dd181e112b11829`:

```text
251: function unshipped(id: ResearchEngineId): State {
252:   return { engine: id, version: "none", status: "unsupported", reason: "pack-not-shipped" }
253: }
254: 
255: /** BackendToolkit's blockers in the one research form; the backend's own wording stays the shell's. */
256: function named(id: ResearchEngineId, reason: string) {
257:   if (reason.startsWith("toolkit-not-ready:")) return reason
258:   if (!reason.startsWith("unsupported-target:")) return `toolkit-not-ready:failed:${id}:${reason}`
259:   // A floor refusal already names the engine: `unsupported-target:<id>:<floor>`.
260:   const rest = reason.slice("unsupported-target:".length)
261:   return `toolkit-not-ready:unsupported:${id}:${rest.startsWith(`${id}:`) ? rest.slice(id.length + 1) : rest}`
262: }
263: 
```

Linhas 276–300 · trecho SHA-256 `eebdefb995213dd335a61726c5472d96e110bc7a2ab25d103b2757837dbe2851`:

```text
276: const read = (root: string, worktree: string) =>
277:   Effect.promise(() => readFile(recordFile(root, worktree), "utf8").catch(() => "{}")).pipe(
278:     Effect.map((text) => Option.getOrElse(decodeRecords(text), (): typeof Records.Type => ({}))),
279:   )
280: 
281: /** Replace one shard's record (none clears it) through a temp file and one rename; a failed write loses only status. */
282: const record = (root: string, worktree: string, shard: string, entry?: { readonly status: "building" | "skipped"; readonly reason?: string }) =>
283:   read(root, worktree).pipe(
284:     Effect.flatMap((records) =>
285:       Effect.tryPromise({
286:         try: async () => {
287:           const file = recordFile(root, worktree)
288:           const next = Object.fromEntries([
289:             ...Object.entries(records).filter(([id]) => id !== shard),
290:             ...(entry ? [[shard, { ...entry, at: Date.now() }]] : []),
291:           ])
292:           await mkdir(path.dirname(file), { recursive: true })
293:           const temp = `${file}.${randomUUID()}`
294:           await writeFile(temp, JSON.stringify(next))
295:           await rename(temp, file).catch(() => rm(temp, { force: true }))
296:         },
297:         catch: () => new ShardFailed({ reason: "record-write" }),
298:       }).pipe(Effect.ignore),
299:     ),
300:   )
```

## E15 — Prewarm detached, status de shard e lock

### `packages/core/src/research-toolkit/index.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` · SHA-256 `9c1bfe5c5a7bc0c8d4d1f835e61031e0cca06b9ed6567415d9d04ff6e84b599c` · 14147 bytes.

Linhas 146–163 · trecho SHA-256 `8bc498fca97ddfc0ab350ba1c195c30cd8cca0af54eed300078ed8b1e4fb7932`:

```text
146: const warming = new Set<string>()
147: 
148: /** Background warm-up: ensures the packs of present languages and builds the current commit's shards; never blocks. */
149: export const prewarm: (worktree: string) => Effect.Effect<void> = (worktree) =>
150:   Effect.gen(function* () {
151:     if (warming.has(worktree)) return
152:     warming.add(worktree)
153:     yield* warm(worktree).pipe(
154:       Effect.ensuring(Effect.sync(() => warming.delete(worktree))),
155:       Effect.forkDetach,
156:     )
157:   })
158: 
159: /**
160:  * The warm-up `prewarm` forks (J6.7): every shard not ready at the worktree's commit, highest `rank` first, one
161:  * indexer at a time on the host, each within `Caps.shardTimeoutMs` and `Caps.indexerBytes`. A shard that cannot be
162:  * built is recorded `skipped` with its reason, and the others go on.
163:  */
```

Linhas 191–250 · trecho SHA-256 `b8b613c3cc154904924ae112711a4b361424cdf75ebbc56501aef5555a3030c7`:

```text
191:               yield* record(root, worktree, shard.id, { status: "building" })
192:               return yield* index
193:                 .build(shard, { worktree, executable: ready.executable, memoryBytes: caps.indexerBytes })
194:                 .pipe(
195:                   Effect.timeoutOrElse({
196:                     duration: caps.shardTimeoutMs,
197:                     orElse: () => Effect.fail(new ShardFailed({ reason: `timeout:${caps.shardTimeoutMs}ms` })),
198:                   }),
199:                 )
200:             }),
201:             "research-toolkit:indexer",
202:             path.join(root, "locks"),
203:           )
204:           // The lock waits at most five minutes per try; a shard of another worktree may hold it for fifteen.
205:           .pipe(
206:             Effect.retry({ while: (error) => error._tag === "LockTimeoutError" }),
207:             Effect.mapError((error) =>
208:               error._tag === "ResearchToolkit.ShardFailed" ? error : new ShardFailed({ reason: "indexer-lock-compromised" })),
209:           ),
210:         { describe: (error) => error.reason, join: (reason) => new ShardFailed({ reason }) },
211:       ).pipe(
212:         Effect.match({ onSuccess: () => undefined, onFailure: (error) => error.reason }),
213:       )
214:       yield* record(root, worktree, shard.id, built === undefined ? undefined : { status: "skipped", reason: built })
215:     }),
216:     { discard: true },
217:   )
218: }, Effect.provide(LayerNode.compile(EffectFlock.node)))
219: 
220: /** Each shard of the worktree as `orchestra toolkit status` shows it (J6.9). */
221: export const shards = Effect.fn("ResearchToolkit.shards")(function* (worktree: string) {
222:   const index = yield* Index
223:   const caps = yield* Caps
224:   const root = yield* Root
225:   const plan = yield* index.plan(worktree)
226:   const records = yield* read(root, worktree)
227:   return plan.map((shard): ShardState => {
228:     const base = { id: shard.id, language: shard.language, project: shard.project }
229:     const entry = records[shard.id]
230:     // A building record outlives a process that died mid-build; past the shard timeout it no longer claims the shard.
231:     if (entry?.status === "building" && Date.now() - entry.at < caps.shardTimeoutMs) return { ...base, status: "building" }
232:     if (entry?.status === "skipped" && shard.state !== "ready") return { ...base, status: "skipped", reason: entry.reason ?? "unknown" }
233:     return { ...base, status: shard.state }
234:   })
235: })
236: 
237: function lifecycle<A, E, R>(self: Effect.Effect<A, E, R>) {
238:   return Effect.gen(function* () {
239:     const root = yield* Root
240:     const manifest = yield* Manifest
241:     return yield* self.pipe(
242:       Effect.provideService(BackendToolkit.Root, root),
243:       Effect.provideService(
244:         BackendToolkit.Manifest,
245:         Object.fromEntries(Object.values(manifest).filter((pack) => pack !== undefined).map((pack) => [pack.id, pack])),
246:       ),
247:     )
248:   })
249: }
250: 
```

## E16 — Git, descoberta e identidade de shards

### `packages/core/src/research-toolkit/code-index/shard.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `2065d1521347762a7ea3599f97ff9c2f96d9036c` · SHA-256 `5177e7c28ec2351c637e199497126c1cf5ee19eba364705b2feedc84d27fb7f0` · 10497 bytes.

Linhas 24–204 · trecho SHA-256 `39fe95a4ddd42e516d741d56e5d78f727c0bff977347febbe73e51a4f6b093c8`:

```text
24: 
25: export type Indexer = { readonly id: string; readonly version: string }
26: 
27: /** One git invocation in the bound worktree; `stdin` feeds batch commands. */
28: export type Git = {
29:   readonly run: (args: ReadonlyArray<string>, stdin?: string) => Effect.Effect<Buffer, Research.Error>
30: }
31: 
32: export type Tree = {
33:   readonly commit: string
34:   /** Every tracked file at the commit with its blob id. */
35:   readonly blobs: ReadonlyMap<string, string>
36: }
37: 
38: const EXTENSIONS: Record<string, Language> = {
39:   ".ts": "ts", ".tsx": "ts", ".mts": "ts", ".cts": "ts", ".js": "ts", ".jsx": "ts", ".mjs": "ts", ".cjs": "ts",
40:   ".py": "py", ".go": "go", ".rs": "rust",
41: }
42: const MARKERS: Record<string, Language> = {
43:   "tsconfig.json": "ts", "pyproject.toml": "py", "setup.cfg": "py", "setup.py": "py", "go.mod": "go", "Cargo.toml": "rust",
44: }
45: const LOCKFILES = [
46:   "bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
47:   "uv.lock", "poetry.lock", "Pipfile.lock", "requirements.txt", "go.sum", "Cargo.lock",
48: ]
49: 
50: /** The language a source file is indexed as, or undefined when no shard kind covers it. */
51: export const language = (file: string): Language | undefined => EXTENSIONS[path.posix.extname(file)]
52: 
53: /** Git in the worktree with no caller GIT_*, NODE_OPTIONS or NODE_PATH and no global or system config (J2.14). */
54: export const live = (root: string) =>
55:   Effect.gen(function* () {
56:     const proc = yield* AppProcess.Service
57:     const env = environment()
58:     return {
59:       run: (args, stdin) =>
60:         // No output caps: an uncapped, all-pipe command is collected natively by omni (OmniSpawner.collectable).
61:         proc.run(ChildProcess.make("git", [...args], { cwd: root, env, extendEnv: false }), { stdin, timeout: "60 seconds" }).pipe(
62:           Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: `git ${args[0]} could not run` })),
63:           Effect.flatMap((result) => result.exitCode !== 0 || result.stdoutTruncated
64:             ? Effect.fail(new Research.Error({ code: "source_unavailable", message: `git ${args[0]} failed: ${result.stderr.toString("utf8").trim().slice(0, 500)}` }))
65:             : Effect.succeed(result.stdout)),
66:         ),
67:     } satisfies Git
68:   })
69: 
70: /** As modules/maestro/arsenal/src/engine/process.ts: the caller environment minus anything that redirects git. */
71: export function environment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
72:   return {
73:     ...Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined &&
74:       !entry[0].toUpperCase().startsWith("GIT_") && !["NODE_OPTIONS", "NODE_PATH"].includes(entry[0].toUpperCase()))),
75:     GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
76:     GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0",
77:   }
78: }
79: 
80: export const head = (git: Git) =>
81:   git.run(["rev-parse", "--verify", "HEAD^{commit}"]).pipe(Effect.map((out) => out.toString("utf8").trim()))
82: 
83: /** The absolute git common dir, shared by every worktree of the repository (J2.3 repoKey). */
84: export const commonDir = (git: Git) =>
85:   git.run(["rev-parse", "--path-format=absolute", "--git-common-dir"]).pipe(Effect.map((out) => out.toString("utf8").trim()))
86: 
87: export const tree = (git: Git, commit: string) =>
88:   git.run(["ls-tree", "-r", "-z", "--full-tree", commit]).pipe(Effect.map((out): Tree => ({
89:     commit,
90:     // `<mode> <type> <oid>\t<path>`; submodules (commit entries) carry no indexable files.
91:     blobs: new Map(out.toString("utf8").split("\0").flatMap((entry) => {
92:       const tab = entry.indexOf("\t")
93:       const fields = entry.slice(0, tab).split(" ")
94:       return tab > 0 && fields[1] === "blob" ? [[entry.slice(tab + 1), fields[2]!] as const] : []
95:     })),
96:   })))
97: 
98: /** Paths that differ from HEAD in the worktree: modified, added, deleted and untracked (J2.8). */
99: export const dirty = (git: Git) =>
100:   git.run(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"]).pipe(Effect.map((out) =>
101:     out.toString("utf8").split("\0").filter((entry) => entry.length > 3).map((entry) => ({
102:       path: entry.slice(3),
103:       deleted: entry[0] === "D" || entry[1] === "D",
104:     }))))
105: 
106: /** Files changed between two commits, for `changed-since-index` (J2.11). */
107: export const changed = (git: Git, from: string, to: string) =>
108:   git.run(["diff", "--name-only", "-z", "--no-renames", from, to]).pipe(
109:     Effect.map((out) => out.toString("utf8").split("\0").filter(Boolean)))
110: 
111: /** Blob contents by path at the commit, in one `cat-file --batch`. */
112: export const contents = (git: Git, tree: Tree, files: ReadonlyArray<string>) =>
113:   files.length === 0
114:     ? Effect.succeed(new Map<string, string>())
115:     : git.run(["cat-file", "--batch"], files.map((file) => tree.blobs.get(file)).join("\n") + "\n").pipe(Effect.map((out) => {
116:         const result = new Map<string, string>()
117:         // Each answer is `<oid> <type> <size>\n<content>\n`; sizes are bytes, so the buffer is walked, not the text.
118:         files.reduce((offset, file) => {
119:           const newline = out.indexOf(10, offset)
120:           const size = Number(out.subarray(offset, newline).toString("utf8").split(" ")[2])
121:           result.set(file, out.subarray(newline + 1, newline + 1 + size).toString("utf8"))
122:           return newline + 1 + size + 1
123:         }, 0)
124:         return result
125:       }))
126: 
127: /** The config files discovery and keys read: project markers and every tsconfig in the tree. */
128: export const configFiles = (tree: Tree) =>
129:   [...tree.blobs.keys()].filter((file) => {
130:     const base = path.posix.basename(file)
131:     return base in MARKERS || /^tsconfig.*\.json$/.test(base)
132:   })
133: 
134: /**
135:  * J2.1: TypeScript/JavaScript per tsconfig.json that is more than an `extends` and owns files; Python per
136:  * pyproject.toml, setup.cfg or setup.py, else the root; Go per go.mod; Rust per Cargo.toml. A file belongs to its
137:  * nearest project of its language. Files with no project are `orphans`, reported as skipped, never dropped silently.
138:  */
139: export function discover(tree: Tree, configs: ReadonlyMap<string, string>) {
140:   const files = [...tree.blobs.keys()].sort()
141:   const projects = files.flatMap((file) => {
142:     const kind = MARKERS[path.posix.basename(file)]
143:     if (!kind) return []
144:     if (kind === "ts" && !ownsSources(configs.get(file))) return []
145:     return [{ language: kind, project: path.posix.dirname(file), config: file }]
146:   })
147:   const byLanguage = Map.groupBy(projects, (project) => project.language)
148:   const owned = files.flatMap((file) => {
149:     const kind = language(file)
150:     if (!kind) return []
151:     const candidates = byLanguage.get(kind) ?? (kind === "py" ? [{ language: kind, project: ".", config: undefined }] : [])
152:     const owner = candidates
153:       .filter((project) => project.project === "." || file.startsWith(project.project + "/"))
154:       .sort((a, b) => b.project.length - a.project.length)[0]
155:     return [{ file, owner, kind }]
156:   })
157:   const groups = Map.groupBy(owned.filter((entry) => entry.owner), (entry) => `${entry.kind}:${entry.owner!.project}`)
158:   const shards = [...groups.entries()].map(([id, entries]): Shard => ({
159:     id,
160:     language: entries[0]!.kind,
161:     project: entries[0]!.owner!.project,
162:     files: entries.map((entry) => entry.file),
163:     config: entries[0]!.owner!.config,
164:   }))
165:   return { shards, orphans: owned.filter((entry) => !entry.owner).map((entry) => entry.file) }
166: }
167: 
168: // A tsconfig that is only `extends`, or a solution file with `files: []` and no include, owns no sources.
169: function ownsSources(text: string | undefined) {
170:   const config = text === undefined ? undefined : parse(text)
171:   if (!config || typeof config !== "object") return false
172:   if (Object.keys(config).every((key) => key === "extends")) return false
173:   return !(Array.isArray(config.files) && config.files.length === 0 && config.include === undefined)
174: }
175: 
176: /**
177:  * J2.2: sha256 over the indexer, its version, the project's content, the lockfiles and the config chain. The content
178:  * is the blob ids of the shard's own files, which is the project's tree hash without its nested projects: a root
179:  * project then does not rebuild when only a nested package changes (JE-AC-X8).
180:  */
181: export function key(shard: Shard, indexer: Indexer, tree: Tree, configs: ReadonlyMap<string, string>) {
182:   const blob = (file: string) => [file, tree.blobs.get(file)] as const
183:   const lockfiles = [...new Set([".", shard.project])].flatMap((dir) =>
184:     LOCKFILES.map((name) => path.posix.join(dir, name)).filter((file) => tree.blobs.has(file)))
185:   return createHash("sha256")
186:     .update(JSON.stringify([
187:       indexer.id, indexer.version, shard.id,
188:       shard.files.map(blob), lockfiles.map(blob), chain(shard.config, configs).map(blob),
189:     ]))
190:     .digest("hex")
191: }
192: 
193: // The config and its relative `extends` chain; package extends are pinned by the lockfiles.
194: function chain(config: string | undefined, configs: ReadonlyMap<string, string>, seen: ReadonlyArray<string> = []): string[] {
195:   if (config === undefined || seen.includes(config) || seen.length > 16) return []
196:   const text = configs.get(config)
197:   if (text === undefined || !config.endsWith(".json")) return [config]
198:   const parsed = parse(text)
199:   const extended = parsed && typeof parsed === "object" ? [parsed.extends].flat() : []
200:   return [config, ...extended
201:     .filter((entry): entry is string => typeof entry === "string" && entry.startsWith("."))
202:     .map((entry) => path.posix.normalize(path.posix.join(path.posix.dirname(config), entry.endsWith(".json") ? entry : `${entry}.json`)))
203:     .flatMap((next) => chain(next, configs, [...seen, config]))]
204: }
```

## E17 — Build, singleFlight, SQLite e retenção

### `packages/core/src/research-toolkit/code-index/build.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `b89de3c2f4a985c08e5789020bbf3fcf4fc5b251` · SHA-256 `bd648215442616d09b710190ee5e22fb4e9f82890bc2967430724954734f7425` · 6330 bytes.

Linhas 25–122 · trecho SHA-256 `24c0af6a719a75157eaeb55272946f698bcffed036a399528bedc51b1d21ab72`:

```text
25:   readonly storeRoot: string
26:   /** The ready pack's indexer per language; a language without one is `languagesMissing`. */
27:   readonly indexers: Partial<Record<Language, CodeIndexShard.Indexer>>
28: }
29: 
30: export type Planned = { readonly shard: CodeIndexShard.Shard; readonly indexer: CodeIndexShard.Indexer; readonly key: string }
31: 
32: export type Plan = {
33:   readonly commit: string
34:   readonly tree: CodeIndexShard.Tree
35:   /** The repository's shard directory. */
36:   readonly dir: string
37:   readonly shards: ReadonlyArray<Planned>
38:   /** Source files no project owns. */
39:   readonly orphans: ReadonlyArray<string>
40:   /** Shards of a language without a ready indexer. */
41:   readonly unindexed: ReadonlyArray<CodeIndexShard.Shard>
42: }
43: 
44: export type Progress = { readonly commit: string; readonly shardsDone: number; readonly shardsTotal: number }
45: 
46: // Process-local: a build in this process is what `index_building` and `stale` report (J2.11, J2.12).
47: const progress = new Map<string, Progress>()
48: // Plans per worktree and commit; a commit's tree never changes, so the cache only needs a bound.
49: const plans = new Map<string, Plan>()
50: const PLAN_CACHE = 16
51: 
52: export const building = (dir: string) => progress.get(dir)
53: 
54: /** Shards and their keys for the worktree's HEAD; git runs three times on a commit this process has not seen. */
55: export const plan = Effect.fn("CodeIndexBuild.plan")(function* (input: Input) {
56:   const commit = yield* CodeIndexShard.head(input.git)
57:   const cached = plans.get(`${input.root}\0${commit}`)
58:   if (cached && sameIndexers(cached, input.indexers)) return cached
59:   const dir = CodeIndexStore.directory(input.storeRoot, yield* CodeIndexStore.repoKey(yield* CodeIndexShard.commonDir(input.git)))
60:   const tree = yield* CodeIndexShard.tree(input.git, commit)
61:   const configs = yield* CodeIndexShard.contents(input.git, tree, CodeIndexShard.configFiles(tree))
62:   const discovered = CodeIndexShard.discover(tree, configs)
63:   const result: Plan = {
64:     commit, tree, dir, orphans: discovered.orphans,
65:     shards: discovered.shards.flatMap((shard) => {
66:       const indexer = input.indexers[shard.language]
67:       return indexer ? [{ shard, indexer, key: CodeIndexShard.key(shard, indexer, tree, configs) }] : []
68:     }),
69:     unindexed: discovered.shards.filter((shard) => !input.indexers[shard.language]),
70:   }
71:   plans.set(`${input.root}\0${commit}`, result)
72:   if (plans.size > PLAN_CACHE) plans.delete(plans.keys().next().value!)
73:   return result
74: })
75: 
76: /**
77:  * Build every missing shard of HEAD, one at a time (the indexer memory cap is per process), then retain. A shard
78:  * that fails is reported and left unbuilt; the others still land. A build already running for the same commit in
79:  * this process is not started twice.
80:  */
81: export const build = Effect.fn("CodeIndexBuild.build")(function* (
82:   input: Input & { readonly extract: Extract; readonly maxBytes?: number },
83: ) {
84:   const current = yield* plan(input)
85:   if (progress.get(current.dir)?.commit === current.commit) return { plan: current, built: [], failed: [] }
86:   const present = yield* Effect.forEach(current.shards, (planned) => CodeIndexStore.exists(current.dir, planned.key))
87:   const missing = current.shards.filter((_, index) => !present[index])
88:   progress.set(current.dir, { commit: current.commit, shardsDone: 0, shardsTotal: missing.length })
89:   const outcomes = yield* Effect.forEach(missing, (planned, index) =>
90:     // One build per shard in this process: a warm-up or another query already building it is awaited, not repeated.
91:     CodeIndexStore.singleFlight(input.storeRoot, planned.key,
92:       input.extract({ root: input.root, commit: current.commit, shard: planned.shard, indexer: planned.indexer }).pipe(
93:         Effect.flatMap((content) => CodeIndexStore.write(current.dir, {
94:           shardKey: planned.key, commit: current.commit, indexer: planned.indexer.id, version: planned.indexer.version,
95:         }, content)),
96:       ),
97:       { describe: (error) => error.message, join: (message) => new Research.Error({ code: "index_unavailable", message }) },
98:     ).pipe(
99:       Effect.as({ id: planned.shard.id, key: planned.key }),
100:       Effect.result,
101:       Effect.tap(() => Effect.sync(() =>
102:         progress.set(current.dir, { commit: current.commit, shardsDone: index + 1, shardsTotal: missing.length }))),
103:     )).pipe(Effect.ensuring(Effect.sync(() => progress.delete(current.dir))))
104:   const failed = outcomes.flatMap((outcome, index) =>
105:     outcome._tag === "Failure" ? [{ id: missing[index]!.shard.id, message: outcome.failure.message }] : [])
106:   const failedIds = new Set(failed.map((entry) => entry.id))
107:   yield* CodeIndexStore.retain(current.dir, {
108:     commit: current.commit, at: Date.now(),
109:     shards: current.shards.filter((planned) => !failedIds.has(planned.shard.id)).map((planned) => ({ id: planned.shard.id, key: planned.key })),
110:   }, { commits: Limits.indexCommits, bytes: input.maxBytes ?? Limits.indexBytes })
111:   return {
112:     plan: current,
113:     built: outcomes.flatMap((outcome) => outcome._tag === "Success" ? [outcome.success] : []),
114:     failed,
115:   }
116: })
117: 
118: function sameIndexers(plan: Plan, indexers: Input["indexers"]) {
119:   return plan.shards.every((planned) => indexers[planned.shard.language]?.id === planned.indexer.id &&
120:     indexers[planned.shard.language]?.version === planned.indexer.version) &&
121:     plan.unindexed.every((shard) => !indexers[shard.language])
122: }
```

### `packages/core/src/research-toolkit/code-index/store.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `f71cdf0ae1979f002fce68b53eae445647682d73` · SHA-256 `570a81a04360d060a7c67a436e531b4c079ba7a9951130a2648ca986846b5e11` · 13372 bytes.

Linhas 70–233 · trecho SHA-256 `47f3c8715042f0062e56fc93f19945f8e570110aec3b48cba700cf190b3498c7`:

```text
70: export const repoKey = (commonDir: string) =>
71:   Effect.promise(() => realpath(commonDir)).pipe(Effect.map((real) => createHash("sha256").update(real).digest("hex")))
72: 
73: export const directory = (root: string, repo: string) => path.join(root, "index", repo)
74: 
75: export const file = (dir: string, shardKey: string) => path.join(dir, `${shardKey}.sqlite`)
76: 
77: export const exists = (dir: string, shardKey: string) => Effect.promise(() => Bun.file(file(dir, shardKey)).exists())
78: 
79: /** The camelCase and snake_case parts of a name, lowercased: the FTS `tokens` column. */
80: export const tokens = (name: string) =>
81:   name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
82:     .split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.toLowerCase()).join(" ")
83: 
84: // Process-local single flight per shard (store root + shard key): the indexer runs once for a shard whether the
85: // warm-up or a query asked for it, and the others await that run. The last failure stays until a build succeeds.
86: const flights = new Map<string, Deferred.Deferred<void, string>>()
87: const failures = new Map<string, string>()
88: const flightKey = (root: string, shardKey: string) => `${root}\0${shardKey}`
89: 
90: /**
91:  * Run `work` unless the same shard is already being built in this process, in which case await that build. A failure
92:  * is remembered as `failure` (and a joiner fails with `join(reason)`), so the next caller retries and the cause shows.
93:  */
94: export const singleFlight = <E>(
95:   root: string,
96:   shardKey: string,
97:   work: Effect.Effect<void, E>,
98:   adapt: { readonly describe: (error: E) => string; readonly join: (reason: string) => E },
99: ): Effect.Effect<void, E> =>
100:   Effect.gen(function* () {
101:     const key = flightKey(root, shardKey)
102:     const mine = yield* Deferred.make<void, string>()
103:     // Checked and claimed in one synchronous step, so two callers cannot both own the build.
104:     const running = yield* Effect.sync(() => {
105:       const existing = flights.get(key)
106:       if (!existing) flights.set(key, mine)
107:       return existing
108:     })
109:     if (running) return yield* Deferred.await(running).pipe(Effect.mapError(adapt.join))
110:     return yield* work.pipe(
111:       Effect.tapError((error) => Effect.sync(() => failures.set(key, adapt.describe(error)))),
112:       Effect.tap(() => Effect.sync(() => failures.delete(key))),
113:       Effect.onExit((exit) => Effect.sync(() => flights.delete(key)).pipe(
114:         Effect.andThen(Deferred.done(mine, Exit.isSuccess(exit) ? Exit.succeed(undefined) : Exit.fail(failures.get(key) ?? "interrupted")))),
115:       ),
116:     )
117:   })
118: 
119: /** Whether this process is building the shard now. */
120: export const building = (root: string, shardKey: string) => flights.has(flightKey(root, shardKey))
121: 
122: /** Why the shard's last build in this process failed, until a later build succeeds. */
123: export const failure = (root: string, shardKey: string) => failures.get(flightKey(root, shardKey))
124: 
125: /** Write a whole shard to a temporary file and rename it into place, as pinned-artifact.ts does (J2.3). */
126: export const write = Effect.fn("CodeIndexStore.write")(function* (dir: string, meta: Meta, content: Content) {
127:   yield* Effect.promise(() => mkdir(dir, { recursive: true }))
128:   const temporary = path.join(dir, `.${meta.shardKey}.${randomUUID()}.tmp`)
129:   yield* Effect.gen(function* () {
130:     yield* Effect.gen(function* () {
131:       const sql = yield* SqlClient.SqlClient
132:       yield* Effect.forEach([...statements(CodeIndex.SCHEMA), ...INDEXES], (statement) => sql.unsafe(statement), { discard: true })
133:       yield* sql.withTransaction(Effect.gen(function* () {
134:         yield* insert(sql, "document", ["path", "language", "sha256", "lines", "layer"],
135:           content.documents.map((row) => [row.path, row.language, row.sha256, row.lines, row.layer]))
136:         yield* insert(sql, "symbol", ["id", "scip", "name", "kind", "path", "start_line", "end_line", "name_line", "exported", "container_id", "tokens"],
137:           content.symbols.map((row) => [row.id, row.scip ?? null, row.name, row.kind, row.path, row.startLine, row.endLine,
138:             row.nameLine, row.exported ? 1 : 0, row.containerId ?? null, tokens(row.name)]))
139:         yield* insert(sql, "occurrence", ["symbol_id", "path", "line", "col", "end_line", "end_col", "role", "enclosing_id", "opaque"],
140:           content.occurrences.map((row) => [row.symbolId, row.path, row.line, row.col, row.endLine, row.endCol, row.role,
141:             row.enclosingId ?? null, row.opaque ? 1 : 0]))
142:         yield* insert(sql, "relation", ["symbol_id", "target_id", "kind"], content.relations.map((row) => [row.symbolId, row.targetId, row.kind]))
143:         yield* insert(sql, "import", ["from_path", "line", "specifier", "to_path", "kind"],
144:           content.imports.map((row) => [row.fromPath, row.line, row.specifier, row.toPath ?? null, row.kind]))
145:         yield* insert(sql, "file_rank", ["path", "rank", "loc", "bytes"],
146:           ranks(content).map((row) => [row.path, row.rank, row.loc, row.bytes]))
147:         yield* insert(sql, "meta", ["key", "value"], [
148:           ["shardKey", meta.shardKey], ["commit", meta.commit], ["indexer", meta.indexer], ["version", meta.version],
149:           ["skipped", JSON.stringify(content.skipped)],
150:         ])
151:         yield* sql.unsafe("INSERT INTO symbol_name (symbol_name) VALUES ('rebuild')")
152:       }))
153:     }).pipe(Effect.provide(layer({ filename: temporary, disableWAL: true })), Effect.scoped)
154:     yield* Effect.promise(() => rename(temporary, file(dir, meta.shardKey)))
155:   }).pipe(
156:     Effect.mapError((cause) => new Research.Error({ code: "index_unavailable", message: `Shard ${meta.shardKey} could not be written: ${String(cause)}` })),
157:     Effect.ensuring(Effect.promise(() => rm(temporary, { force: true }))),
158:   )
159: })
160: 
161: /** Run `effect` against one shard opened read-only; the connection closes when it ends. */
162: export const read = <A, E>(dir: string, shardKey: string, effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
163:   effect.pipe(
164:     Effect.provide(layer({ filename: file(dir, shardKey), readonly: true, readwrite: false, create: false, disableWAL: true })),
165:     Effect.scoped,
166:     Effect.mapError((cause) => cause instanceof Research.Error ? cause
167:       : new Research.Error({ code: "index_unavailable", message: `Shard ${shardKey} could not be read: ${String(cause)}` })),
168:   )
169: 
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
216: 
217: function insert(sql: SqlClient.SqlClient, table: string, columns: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<unknown>>) {
218:   const chunks = Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, index) => rows.slice(index * CHUNK, (index + 1) * CHUNK))
219:   const values = `(${columns.map(() => "?").join(", ")})`
220:   return Effect.forEach(chunks, (chunk) =>
221:     sql.unsafe(`INSERT INTO "${table}" (${columns.join(", ")}) VALUES ${chunk.map(() => values).join(", ")}`, chunk.flat()),
222:   { discard: true })
223: }
224: 
225: const statements = (schema: string) => schema.split(";").map((statement) => statement.trim()).filter(Boolean)
226: 
227: // file_rank is computed here, once per build, so every producer gets the same T-X7 rank.
228: function ranks(content: Content) {
229:   return CodeIndexRank.ranks(
230:     content.documents.map((document) => ({ path: document.path, lines: document.lines, bytes: document.bytes })),
231:     content.imports,
232:   )
233: }
```

## E18 — Adapter real, source worktree, estrutural e opacidade

### `packages/core/src/research-toolkit/code-index/extract.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ccd710035774d754490d00f36eb16c0103355175` · SHA-256 `80b2e9c6091bb6c342bfefa9582bd164fc5dffc239cdf67417dba4c0e79747af` · 22551 bytes.

Linhas 46–225 · trecho SHA-256 `c663d70b944d93c1317b176441c250a835a29e92fc3fb5cf6ff28ebfc1872fbb`:

```text
46: export const STRUCTURAL = "tree-sitter"
47: 
48: /** The extraction X3's build runs per shard, and the overlay its queries run on dirty files, with services bound. */
49: export const make = Effect.gen(function* () {
50:   const proc = yield* AppProcess.Service
51:   return {
52:     extract: ((input) => extract(input).pipe(Effect.provideService(AppProcess.Service, proc))) satisfies CodeIndexBuild.Extract,
53:     overlay: ((input) => Effect.forEach(input.paths, (file) => outline(input.root, file), { concurrency: 8 })
54:       .pipe(Effect.map((files) => files.flatMap((file) => file ? [file] : [])))) satisfies CodeIndexQuery.Overlay,
55:   }
56: })
57: 
58: /**
59:  * The indexers a query may build with, per language, or the named blocker (J6.10). An absent pack still counts: the
60:  * first build acquires it through `ResearchToolkit.ensure`. The indexer only ever runs confined, so a platform
61:  * without `ToolSafetySandbox.confine` has no index at all (J2.12 "plataforma sem suporte").
62:  */
63: export const indexers = Effect.fn("CodeIndexExtract.indexers")(function* () {
64:   if (process.platform !== "darwin" && process.platform !== "linux")
65:     return yield* new Research.Error({ code: "index_unavailable",
66:       message: `toolkit-not-ready:unsupported:scip-typescript:sandbox-platform-unsupported: ${process.platform}` })
67:   const manifest = yield* ResearchToolkit.Manifest
68:   const states = (yield* ResearchToolkit.status()).filter((state) => manifest[state.engine]?.fit.role === "indexer")
69:   const usable = states.filter((state) => state.status === "ready" || state.status === "absent" || state.status === "fetching")
70:   const blocked = states[0]
71:   if (usable.length === 0)
72:     return yield* new Research.Error({ code: "index_unavailable", message: blocked
73:       ? `toolkit-not-ready:${blocked.status}:${blocked.engine}${"reason" in blocked ? `:${blocked.reason}` : "cause" in blocked ? `:${blocked.cause}` : ""}`
74:       : "toolkit-not-ready:unsupported:index:no-indexer-pack" })
75:   const ready = Object.fromEntries(usable.flatMap((state) => (manifest[state.engine]?.fit.languages ?? [])
76:     .map((language) => [language, { id: state.engine, version: state.version } satisfies CodeIndexShard.Indexer] as const)))
77:   return structural(ready, Bun.which, (language) => {
78:     const state = states.find((entry) => manifest[entry.engine]?.fit.languages.includes(language))
79:     return state ? `toolkit-not-ready:${state.status}:${state.engine}` : "toolkit-not-ready:unsupported:pack-not-shipped"
80:   })
81: })
82: 
83: /**
84:  * Go and Rust languages without a precise indexer, or whose host toolchain `which` cannot find, map to the STRUCTURAL
85:  * indexer; every other language keeps its own. `blocked` names why a language has no indexer.
86:  */
87: export function structural(
88:   indexers: Partial<Record<Language, CodeIndexShard.Indexer>>,
89:   which: (command: string) => string | null,
90:   blocked: (language: Language) => string,
91: ): Partial<Record<Language, CodeIndexShard.Indexer>> {
92:   const toolchains = { go: CodeIndexGo.TOOLCHAIN, rust: CodeIndexRust.TOOLCHAIN }
93:   return {
94:     ...indexers,
95:     ...Object.fromEntries((["go", "rust"] as const).flatMap((language) => {
96:       const missing = !indexers[language] ? blocked(language) : which(toolchains[language]) ? undefined : `toolchain-missing:${toolchains[language]}`
97:       return missing ? [[language, { id: STRUCTURAL, version: missing }] as const] : []
98:     })),
99:   }
100: }
101: 
102: /**
103:  * `ResearchToolkit.Index` over X3's planner and store, which `warm` and `prewarm` drive (J6.7): each shard of the
104:  * worktree's HEAD with its key as id, and a build that extracts one shard with the executable and memory cap the
105:  * toolkit hands it, writes it atomically and applies retention.
106:  */
107: export const toolkit = Effect.gen(function* () {
108:   const proc = yield* AppProcess.Service
109:   const failed = (error: { readonly message: string }) => new ResearchToolkit.ShardFailed({ reason: error.message })
110:   const prepared = (worktree: string) => Effect.gen(function* () {
111:     const root = yield* Effect.tryPromise({ try: () => realpath(worktree), catch: () => new ResearchToolkit.ShardFailed({ reason: "worktree-missing" }) })
112:     const manifest = yield* ResearchToolkit.Manifest
113:     const plan = yield* CodeIndexBuild.plan({
114:       root, git: yield* CodeIndexShard.live(root), storeRoot: yield* ResearchToolkit.Root,
115:       // The warm-up acquires absent packs, so only a missing toolchain falls back here; the fallback is no engine, so
116:       // the warm-up leaves its shard to the first query.
117:       indexers: structural(Object.fromEntries(Object.values(manifest).flatMap((pack) => pack?.fit.role === "indexer"
118:         ? pack.fit.languages.map((language) => [language, { id: pack.id, version: pack.version }] as const) : [])),
119:       Bun.which, () => "toolkit-not-ready:unsupported:pack-not-shipped"),
120:     }).pipe(Effect.mapError(failed))
121:     return { root, plan }
122:   }).pipe(Effect.provideService(AppProcess.Service, proc))
123:   return {
124:     plan: (worktree: string) => prepared(worktree).pipe(Effect.flatMap(({ plan }) => Effect.forEach(plan.shards, (planned) =>
125:       CodeIndexStore.exists(plan.dir, planned.key).pipe(Effect.map((ready) => {
126:         const engine = IDS.find((id) => id === planned.indexer.id)
127:         // An unbuilt shard has no file_rank yet; its file count stands in for the project's aggregated rank.
128:         return engine ? [{ id: planned.key, language: planned.shard.language, project: planned.shard.project,
129:           rank: planned.shard.files.length, engine, state: ready ? "ready" as const : "absent" as const }] : []
130:       }))).pipe(Effect.map((shards) => shards.flat())))),
131:     build: (shard: ResearchToolkit.Shard, input: { readonly worktree: string; readonly executable: string; readonly memoryBytes: number }) =>
132:       Effect.gen(function* () {
133:         const ready = yield* prepared(input.worktree)
134:         const plan = ready.plan
135:         const planned = plan.shards.find((entry) => entry.key === shard.id)
136:         if (!planned) return yield* new ResearchToolkit.ShardFailed({ reason: "shard-not-at-head" })
137:         const content = yield* extract({ root: ready.root, commit: plan.commit, shard: planned.shard, indexer: planned.indexer },
138:           { executable: input.executable, memoryBytes: input.memoryBytes }).pipe(Effect.mapError(failed))
139:         yield* CodeIndexStore.write(plan.dir, { shardKey: planned.key, commit: plan.commit, indexer: planned.indexer.id,
140:           version: planned.indexer.version }, content).pipe(Effect.mapError(failed))
141:         const present = yield* Effect.forEach(plan.shards, (entry) => CodeIndexStore.exists(plan.dir, entry.key))
142:         const caps = yield* ResearchToolkit.Caps
143:         yield* CodeIndexStore.retain(plan.dir, {
144:           commit: plan.commit, at: Date.now(),
145:           shards: plan.shards.filter((_, index) => present[index]).map((entry) => ({ id: entry.shard.id, key: entry.key })),
146:         }, { commits: caps.indexCommits, bytes: caps.indexBytes })
147:       }).pipe(Effect.provideService(AppProcess.Service, proc)),
148:   }
149: })
150: 
151: const extract = Effect.fn("CodeIndexExtract.extract")(function* (
152:   input: Parameters<CodeIndexBuild.Extract>[0],
153:   launch?: { readonly executable: string; readonly memoryBytes: number },
154: ) {
155:   const selected = CodeIndexFilter.select(input.shard.files)
156:   const read = yield* Effect.forEach(selected.files, (file) =>
157:     text(input.root, file.path).pipe(Effect.map((content) => ({ ...file, text: content }))), { concurrency: 16 })
158:   const sources = read.flatMap((file) => file.text === undefined ? [] : [{ path: file.path, grammar: file.grammar, text: file.text }])
159:   const outlines = yield* Effect.forEach(sources, (file) => CodeIndexTreeSitter.extract(file.path, file.text, file.grammar), { concurrency: 8 })
160:   const dump: Scip.Index = input.indexer.id === STRUCTURAL ? { indexer: undefined, documents: [], malformed: 0 } : yield* scip(input, launch, new Map(sources.map((file) => [file.path, file.text])))
161:   const resolver = yield* CodeIndexResolve.make(input.root)
162:   return assemble({
163:     sources, outlines, dump,
164:     resolve: resolver.resolve,
165:     skipped: [
166:       ...selected.skipped,
167:       ...read.filter((file) => file.text === undefined).map((file) => ({ path: file.path, reason: "missing-in-worktree" })),
168:       ...outlines.flatMap((entry) => entry.coverage.complete ? [] : [{ path: entry.path, reason: entry.coverage.reason ?? "partial-parse" }]),
169:       ...(dump.malformed ? [{ path: input.shard.project, reason: `scip-malformed-occurrences:${dump.malformed}` }] : []),
170:       ...(input.indexer.id === STRUCTURAL ? [{ path: input.shard.project, reason: `structural-only:${input.indexer.version}` }] : []),
171:     ],
172:     language: input.shard.language,
173:   })
174: })
175: 
176: /**
177:  * One indexer run (J2.5, J2.13): the pack's executable, arguments and output file are the host's; the run is confined
178:  * (no network, writes only to its scratch and the dump), spawned through AppProcess under the D2 memory cap and the
179:  * per-shard timeout, with the project directory as cwd.
180:  */
181: const scip = Effect.fn("CodeIndexExtract.scip")(function* (
182:   input: Parameters<CodeIndexBuild.Extract>[0],
183:   launch: { readonly executable: string; readonly memoryBytes: number } | undefined,
184:   // The shard's source text by repository-relative path, for dumps whose columns are not UTF-16.
185:   texts: ReadonlyMap<string, string>,
186: ) {
187:   const proc = yield* AppProcess.Service
188:   const caps = yield* ResearchToolkit.Caps
189:   const engine = IDS.find((id) => id === input.indexer.id)
190:   if (!engine) return yield* new Research.Error({ code: "index_unavailable", message: `toolkit-not-ready:unsupported:${input.indexer.id}:pack-not-shipped` })
191:   // The toolkit's warm-up has already ensured the pack and names the cap; a query-started build ensures it here.
192:   const ready = launch ?? (yield* ResearchToolkit.ensure(engine).pipe(
193:     Effect.map((ensured) => ({ executable: ensured.executable, memoryBytes: caps.indexerBytes })),
194:     Effect.mapError((error) => new Research.Error({ code: "index_unavailable", message: error.reason }))))
195:   const failed = (message: string) => new Research.Error({ code: "index_unavailable", message: `${engine}: ${message}` })
196:   return yield* Effect.gen(function* () {
197:     // The dump lives outside the worktree (JI-1); confine grants writes only to it and the run's own scratch.
198:     const directory = yield* Effect.acquireRelease(
199:       Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "orchestra-scip-"))),
200:       (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
201:     )
202:     const output = path.join(directory, "index.scip")
203:     yield* Effect.promise(() => writeFile(output, ""))
204:     const launch = yield* ToolSafetySandbox.confine({
205:       command: ready.executable, cwd: directory, write: [output],
206:       args: input.shard.language === "py" ? CodeIndexPython.args({ project: input.shard.project, output })
207:         : input.shard.language === "go" ? CodeIndexGo.args(output)
208:         : input.shard.language === "rust" ? CodeIndexRust.args(output)
209:         : ["index", "--output", output],
210:       env: { ...process.env, ...(input.shard.language === "go" ? CodeIndexGo.ENV : input.shard.language === "rust" ? CodeIndexRust.ENV : {}) },
211:     }).pipe(Effect.mapError((denied) => failed(`sandbox ${denied.reason}`)))
212:     const result = yield* proc.run(
213:       ChildProcess.make(launch.command, launch.args, {
214:         cwd: path.join(input.root, input.shard.project), env: launch.env, extendEnv: false, stdin: "ignore",
215:       }),
216:       { timeout: caps.shardTimeoutMs, maxRssBytes: ready.memoryBytes, maxOutputBytes: 64 * 1024, maxErrorBytes: 64 * 1024 },
217:     ).pipe(Effect.mapError((cause) => failed(cause.message)))
218:     if (result.exitCode !== 0)
219:       return yield* failed(`exit ${result.exitCode}: ${(result.stderr.toString("utf8") || result.stdout.toString("utf8")).trim().slice(0, 500)}`)
220:     // The temp dump is deleted when this scope closes and its path never recurs, so its decode must not outlive it.
221:     return yield* Effect.try({
222:       try: () => Scip.readScip(output, { prefix: input.shard.project === "." ? "" : input.shard.project, source: (file) => texts.get(file) }),
223:       catch: (cause) => failed(`dump unreadable: ${String(cause)}`),
224:     }).pipe(Effect.ensuring(Effect.sync(() => Scip.forgetScip(output))))
225:   }).pipe(Effect.scoped)
```

Linhas 238–371 · trecho SHA-256 `4460189e95ef3c8dc244b3fa58e1771c61becb0e2310b0f889cb6ab6814af49f`:

```text
238: }): CodeIndexStore.Content {
239:   const outlines = new Map(input.outlines.map((entry) => [entry.path, entry]))
240:   // A project's tsconfig may reach files a nested project owns; those belong to the nested shard.
241:   const docs = input.dump.documents.flatMap((doc) => {
242:     const entry = outlines.get(doc.path)
243:     return entry ? [Enclosing.join(doc, {
244:       definitions: entry.definitions,
245:       imports: entry.imports.map((item) => ({ startLine: item.line, endLine: item.line })),
246:     })] : []
247:   })
248:   const view = Callers.create(docs, { indexerName: input.dump.indexer?.name })
249:   const symbols: Row[] = []
250:   const ids = new Map<string, number>()
251:   const add = (row: Omit<Row, "id">) => {
252:     const id = symbols.length + 1
253:     symbols.push({ ...row, id })
254:     if (row.scip) ids.set(row.scip, id)
255:     return id
256:   }
257:   // An external symbol: referenced here, defined in another shard or outside every shard.
258:   const row = (symbol: string) => ids.get(symbol) ?? add({
259:     scip: symbol, name: Scip.descriptorName(symbol) ?? symbol, kind: kind(symbol), path: "", startLine: 0, endLine: 0,
260:     nameLine: 0, exported: false,
261:   })
262: 
263:   // Definitions first, so a reference before its definition in document order does not mint an external row.
264:   docs.forEach((doc) => {
265:     const ranges = new Map(doc.definitions.map((def) => [def.symbol, def.range]))
266:     const infos = new Map(doc.symbols.map((entry) => [entry.symbol, entry]))
267:     const structural = Map.groupBy(outlines.get(doc.path)?.definitions ?? [], (def) => def.nameLine)
268:     doc.occurrences.forEach((occ) => {
269:       if (!(occ.role & Role.definition) || !indexable(occ.symbol) || ids.has(occ.symbol)) return
270:       const range = ranges.get(occ.symbol) ?? occ
271:       const name = Scip.descriptorName(occ.symbol)
272:       const match = structural.get(occ.startLine)?.find((def) => def.name === name)
273:       const info = infos.get(occ.symbol)
274:       add({
275:         scip: occ.symbol, name: match?.name ?? name ?? info?.displayName ?? occ.symbol, kind: match?.kind ?? kind(occ.symbol),
276:         path: doc.path, startLine: range.startLine, endLine: Math.max(range.startLine, range.endLine), nameLine: occ.startLine,
277:         exported: match?.exported ?? false,
278:       })
279:     })
280:   })
281:   const containers = new Map(docs.flatMap((doc) => doc.occurrences.flatMap((occ, index) => {
282:     if (!(occ.role & Role.definition) || !indexable(occ.symbol)) return []
283:     const container = enclosing(doc, index)
284:     return container && ids.has(container) ? [[occ.symbol, ids.get(container)!] as const] : []
285:   })))
286:   const occurrences = docs.flatMap((doc) => doc.occurrences.flatMap((occ, index): CodeIndexStore.Content["occurrences"] => {
287:     if (!indexable(occ.symbol)) return []
288:     const resolution = view.resolution(occ)
289:     const container = enclosing(doc, index)
290:     return [{
291:       symbolId: row(resolution?.kind === "resolved" ? resolution.symbol : occ.symbol),
292:       path: doc.path, line: occ.startLine, col: occ.startCol - 1, endLine: occ.endLine, endCol: occ.endCol, role: occ.role,
293:       ...(container && ids.has(container) ? { enclosingId: ids.get(container)! } : {}),
294:       opaque: false,
295:     }]
296:   }))
297:   const relations = docs.flatMap((doc) => doc.symbols.flatMap((info) => !indexable(info.symbol) ? [] : info.relationships.flatMap((rel) => [
298:     ...(rel.implementation && indexable(rel.symbol) ? [{ symbolId: row(info.symbol), targetId: row(rel.symbol), kind: "implementation" as const }] : []),
299:     ...(rel.typeDefinition && indexable(rel.symbol) ? [{ symbolId: row(info.symbol), targetId: row(rel.symbol), kind: "type_definition" as const }] : []),
300:   ])))
301: 
302:   // Files the indexer did not cover (outside the tsconfig, or JavaScript without allowJs) keep their structural layer.
303:   const indexed = new Set(docs.map((doc) => doc.path))
304:   input.outlines.filter((entry) => !indexed.has(entry.path)).forEach((entry) => {
305:     const local = new Map<number, number>()
306:     entry.definitions.forEach((def, index) => local.set(index, add({
307:       name: def.name, kind: def.kind, path: entry.path, startLine: def.startLine, endLine: def.endLine, nameLine: def.nameLine,
308:       exported: def.exported, ...(def.container !== undefined && local.has(def.container) ? { containerId: local.get(def.container)! } : {}),
309:     })))
310:   })
311: 
312:   return {
313:     documents: input.sources.map((source) => ({
314:       path: source.path, language: input.language, sha256: createHash("sha256").update(source.text).digest("hex"),
315:       lines: outlines.get(source.path)?.lines ?? 0, bytes: Buffer.byteLength(source.text), layer: indexed.has(source.path) ? 1 : 2,
316:     })),
317:     symbols: symbols.map((entry) => containers.has(entry.scip ?? "") ? { ...entry, containerId: containers.get(entry.scip!) } : entry),
318:     occurrences,
319:     relations,
320:     imports: input.outlines.flatMap((entry) => entry.imports.map((item) => {
321:       const resolved = input.resolve(entry.path, item.specifier)
322:       return { fromPath: entry.path, line: item.line, specifier: item.specifier, ...(resolved.to ? { toPath: resolved.to } : {}), kind: resolved.kind }
323:     })),
324:     skipped: input.skipped,
325:   }
326: }
327: 
328: /** The innermost stored definition around an occurrence: its joined enclosing symbol, else the nearest global one. */
329: function enclosing(doc: Enclosing.Document, index: number) {
330:   const own = doc.enclosing[index]
331:   if (own && indexable(own)) return own
332:   const occ = doc.occurrences[index]
333:   return doc.definitions
334:     .filter((def) => indexable(def.symbol) && def.symbol !== occ.symbol &&
335:       (def.range.startLine < occ.startLine || (def.range.startLine === occ.startLine && def.range.startCol <= occ.startCol)) &&
336:       (def.range.endLine > occ.endLine || (def.range.endLine === occ.endLine && def.range.endCol >= occ.endCol)))
337:     .toSorted((a, b) => b.range.startLine - a.range.startLine || b.range.startCol - a.range.startCol)[0]?.symbol
338: }
339: 
340: // Locals, parameters (`(name)`), type parameters (`[name]`) and file modules (`path/`, Python's `module/__init__:`) are not stored.
341: function indexable(symbol: string) {
342:   return !Scip.isLocalSymbol(symbol) && !/[)\]/]$/.test(symbol) && CodeIndexPython.indexable(symbol)
343: }
344: 
345: // The SCIP descriptor suffix, for a definition the structural layer did not name and for external symbols.
346: function kind(symbol: string) {
347:   if (symbol.endsWith(").")) return "function"
348:   if (symbol.endsWith("#")) return "type"
349:   if (symbol.endsWith(".")) return "term"
350:   if (symbol.endsWith(":")) return "meta"
351:   return "symbol"
352: }
353: 
354: const text = (root: string, file: string) => Effect.promise(() => Bun.file(path.join(root, file)).text().catch(() => undefined))
355: 
356: // J2.8: the structural layer over a dirty file's current content.
357: function outline(root: string, file: string) {
358:   return Effect.gen(function* () {
359:     const grammar = CodeIndexFilter.grammar(file)
360:     if (!grammar || !CodeIndexFilter.shouldRead(file)) return undefined
361:     const content = yield* text(root, file)
362:     if (content === undefined) return undefined
363:     const result = yield* CodeIndexTreeSitter.extract(file, content, grammar)
364:     return {
365:       path: file, lines: result.lines,
366:       symbols: result.definitions.map((def) => ({
367:         name: def.name, kind: def.kind, startLine: def.startLine, endLine: def.endLine, nameLine: def.nameLine, exported: def.exported,
368:       })),
369:     }
370:   })
371: }
```

## E19 — Filtro e parser estrutural

### `packages/core/src/research-toolkit/code-index/filter.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `55fff12895cfcd287ebcf6e78a3b60933726ae98` · SHA-256 `4f64a348c5e6e2343c3451de78f32f832579576183eeba21a40c7051989cdf0a` · 3739 bytes.

Linhas 7–79 · trecho SHA-256 `3d49bc2d9dcb01a740019c0f5117a335562e15e72196241c12d97275f058ba8a`:

```text
7: /** The tree-sitter grammar a path parses with. `.js` and `.jsx` use the TSX grammar, which accepts plain JS and JSX. */
8: export type Grammar = "typescript" | "tsx" | "python" | "go" | "rust"
9: 
10: const GRAMMARS: Record<string, Grammar> = {
11:   ".ts": "typescript",
12:   ".mts": "typescript",
13:   ".cts": "typescript",
14:   ".tsx": "tsx",
15:   ".js": "tsx",
16:   ".jsx": "tsx",
17:   ".mjs": "tsx",
18:   ".cjs": "tsx",
19:   ".py": "python",
20:   ".pyi": "python",
21:   ".go": "go",
22:   ".rs": "rust",
23: }
24: 
25: export const SKIP_SEGMENTS = new Set([
26:   "node_modules", ".git", "vendor", "third_party", "third-party", "legacy", ".venv", "venv", ".tox", "build",
27:   "coverage", ".next", "out", ".cache", "__pycache__", ".pytest_cache", ".mypy_cache", ".gradle", "captured",
28:   "snapshots", "__snapshots__", "testdata", "test-data", "golden",
29: ])
30: export const LOCKFILE_BASENAMES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock", "Gemfile.lock", "composer.lock", "bun.lock", "bun.lockb"])
31: export const GENERATED_SUFFIXES = [".min.js", ".min.css", ".map", ".d.ts", ".d.mts", ".d.cts", ".generated.ts", ".generated.js", "_pb2.py", ".pb.go"] as const
32: export const BINARY_EXTENSIONS = new Set([
33:   ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".pdf", ".zip", ".tar", ".gz", ".tgz", ".bz2", ".woff",
34:   ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".mov", ".avi", ".mp3", ".wav", ".wasm", ".so", ".dylib", ".dll", ".exe",
35:   ".bin", ".parquet", ".sqlite", ".db", ".csv", ".tsv", ".lock",
36: ])
37: 
38: export function grammar(path: string): Grammar | undefined {
39:   const base = path.slice(path.lastIndexOf("/") + 1)
40:   const dot = base.lastIndexOf(".")
41:   return dot > 0 ? GRAMMARS[base.slice(dot).toLowerCase()] : undefined
42: }
43: 
44: export function isGeneratedSegment(segment: string) {
45:   return /^_gen(?:v?\d|[-_])/.test(segment) || ["_gen", "generated", "__generated__", "_generated", "generated-effect"].includes(segment)
46: }
47: 
48: /**
49:  * Splits repository-relative POSIX paths into the files the index parses and the supported-language files it skips,
50:  * each with a reason. Paths in no supported language are left out entirely: they are not index coverage.
51:  */
52: export function select(paths: Iterable<string>, grammars: ReadonlySet<Grammar> = new Set(Object.values(GRAMMARS))) {
53:   const files: Array<{ path: string; grammar: Grammar }> = []
54:   const skipped: Array<{ path: string; reason: string }> = []
55:   for (const path of paths) {
56:     const kind = grammar(path)
57:     if (!kind || !grammars.has(kind)) continue
58:     const reason = skip(path)
59:     if (reason) skipped.push({ path, reason })
60:     if (!reason) files.push({ path, grammar: kind })
61:   }
62:   return { files, skipped }
63: }
64: 
65: /** True when `path` (POSIX, repository-relative) is worth reading: not generated, vendored, a lockfile or binary. */
66: export function shouldRead(path: string) {
67:   return skip(path) === undefined
68: }
69: 
70: function skip(path: string) {
71:   const segments = path.split("/")
72:   const base = segments.at(-1) ?? ""
73:   if (segments.some((segment) => SKIP_SEGMENTS.has(segment))) return "vendored-or-build"
74:   if (segments.some(isGeneratedSegment) || GENERATED_SUFFIXES.some((suffix) => base.endsWith(suffix))) return "generated"
75:   if (LOCKFILE_BASENAMES.has(base)) return "lockfile"
76:   const dot = base.lastIndexOf(".")
77:   if (dot !== -1 && BINARY_EXTENSIONS.has(base.slice(dot).toLowerCase())) return "binary"
78:   return undefined
79: }
```

### `packages/core/src/research-toolkit/code-index/tree-sitter.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `b470c5e20ba95693296a1ac4d2520ac4bc1a10d5` · SHA-256 `b0e13b1436402cd34060218f8845de757486769df22824a357bbc05dfc39d8e2` · 16595 bytes.

Linhas 19–80 · trecho SHA-256 `6b0189225be617bdf371d88e21fd845253a7752a9185fa038fb668c1d0e59315`:

```text
19: export const MAX_BYTES = 2 * 1024 * 1024
20: 
21: export type Definition = {
22:   readonly name: string
23:   /** Dotted container chain plus name, for example `DiscoveryResult.assemble`. */
24:   readonly qualified: string
25:   readonly kind: string
26:   readonly startLine: number
27:   readonly endLine: number
28:   readonly nameLine: number
29:   readonly exported: boolean
30:   /** Index of the innermost enclosing definition in the same array. */
31:   readonly container?: number
32: }
33: 
34: export type Import = {
35:   readonly specifier: string
36:   readonly line: number
37:   /** `reexport` is `export ... from`; `dynamic` is `import("...")`; `require` is `require("...")`. */
38:   readonly form: "static" | "reexport" | "dynamic" | "require"
39:   readonly names: ReadonlyArray<string>
40: }
41: 
42: export type Extract = {
43:   readonly path: string
44:   readonly lines: number
45:   readonly definitions: ReadonlyArray<Definition>
46:   readonly imports: ReadonlyArray<Import>
47:   readonly coverage: {
48:     readonly complete: boolean
49:     readonly reason?: "partial-parse" | "too-large" | "parser-unavailable"
50:     readonly detail?: string
51:   }
52: }
53: 
54: export const extract = Effect.fn("CodeIndexTreeSitter.extract")(function* (path: string, source: string, grammar: Grammar) {
55:   const lines = source.length === 0 ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0)
56:   if (Buffer.byteLength(source) > MAX_BYTES)
57:     return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "too-large" } } satisfies Extract
58:   // The wasm runtime and grammar load are the genuinely fallible boundary; the pipeline survives them with a reason.
59:   const loaded = yield* Effect.promise(() => grammars().then(
60:     (value) => ({ value }),
61:     (cause: unknown) => ({ detail: cause instanceof Error ? cause.message : String(cause) }),
62:   ))
63:   if (!("value" in loaded))
64:     return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "parser-unavailable", detail: loaded.detail } } satisfies Extract
65:   const entry = loaded.value[grammar]
66:   const tree = entry.parser.parse(source)
67:   if (!tree) return { path, lines, definitions: [], imports: [], coverage: { complete: false, reason: "partial-parse" } } satisfies Extract
68:   const result = {
69:     path,
70:     lines,
71:     definitions: definitions(entry.tags, tree.rootNode, grammar),
72:     imports: entry.calls ? scriptImports(entry.calls, tree.rootNode)
73:       : grammar === "go" ? CodeIndexGo.imports(tree.rootNode)
74:       : grammar === "rust" ? CodeIndexRust.imports(tree.rootNode)
75:       : pythonImports(tree.rootNode),
76:     coverage: tree.rootNode.hasError ? { complete: false, reason: "partial-parse" } : { complete: true },
77:   } satisfies Extract
78:   tree.delete()
79:   return result
80: })
```

Linhas 120–198 · trecho SHA-256 `1155278f5ea6bf97245b3be1d99ac32ee4c18d1d8c73319e6f3ceb98f0492e5d`:

```text
120: function definitions(query: Query, root: Node, grammar: Grammar) {
121:   const found = new Map<number, { node: Node; name: Node; kind: string }>()
122:   query.matches(root).forEach((match) => {
123:     const definition = match.captures.find((capture) => capture.name.startsWith("definition."))
124:     const name = match.captures.find((capture) => capture.name === "name")
125:     if (!definition || !name) return
126:     const captured = definition.name.slice("definition.".length)
127:     const kind = grammar === "rust" ? CodeIndexRust.kind(definition.node, captured) : captured
128:     // Upstream and EXTRA can both match one declarator; the upstream kind (function) wins over constant.
129:     if (found.has(definition.node.id) && kind === "constant") return
130:     if (kind === "constant" && (grammar === "typescript" || grammar === "tsx") && !constantInScope(definition.node)) return
131:     found.set(definition.node.id, { node: definition.node, name: name.node, kind: kind === "constant" ? declarationKind(definition.node) : kind })
132:   })
133:   const ordered = [...found.values()].toSorted((a, b) => a.node.startIndex - b.node.startIndex || b.node.endIndex - a.node.endIndex)
134:   const index = new Map(ordered.map((item, position) => [item.node.id, position]))
135:   const result: Definition[] = []
136:   ordered.forEach((item) => {
137:     const container = enclosing(item.node, index)
138:     const parent = container === undefined ? undefined : result[container]
139:     const range = span(item.node)
140:     result.push({
141:       name: item.name.text,
142:       qualified: parent ? `${parent.qualified}.${item.name.text}` : item.name.text,
143:       kind: parent && ["class", "interface"].includes(parent.kind) && item.kind === "function" ? "method" : item.kind,
144:       startLine: range.start,
145:       endLine: range.end,
146:       nameLine: item.name.startPosition.row + 1,
147:       exported: exported(item.node, item.name.text, parent, root, grammar),
148:       ...(container === undefined ? {} : { container }),
149:     })
150:   })
151:   return result
152: }
153: 
154: // The innermost definition whose node is an ancestor; ancestors start earlier, so they are already in the result.
155: function enclosing(node: Node, index: Map<number, number>) {
156:   for (let parent = node.parent; parent; parent = parent.parent) {
157:     const position = index.get(parent.id)
158:     if (position !== undefined) return position
159:   }
160:   return undefined
161: }
162: 
163: function constantInScope(declarator: Node) {
164:   const value = declarator.childForFieldName("value")?.type
165:   if (value === "arrow_function" || value === "function_expression") return true
166:   const declaration = declarator.parent
167:   const scope = declaration?.parent
168:   if (!scope || !SCOPES.has(scope.type)) return false
169:   return scope.type !== "statement_block" || scope.parent?.type === "internal_module"
170: }
171: 
172: function declarationKind(declarator: Node) {
173:   if (declarator.type !== "variable_declarator") return "constant"
174:   const keyword = declarator.parent?.child(0)?.text
175:   return keyword === "let" || keyword === "var" ? "variable" : "const"
176: }
177: 
178: // Ranges are 1-based and closed. A decorated or exported declaration starts at its wrapper; an end at column 0
179: // belongs to the previous line.
180: function span(node: Node) {
181:   const declarator = node.type === "variable_declarator" ? (node.parent ?? node) : node
182:   const outer = ["export_statement", "decorated_definition"].includes(declarator.parent?.type ?? "") ? declarator.parent! : declarator
183:   const end = outer.endPosition.column === 0 && outer.endPosition.row > outer.startPosition.row ? outer.endPosition.row : outer.endPosition.row + 1
184:   return { start: outer.startPosition.row + 1, end }
185: }
186: 
187: function exported(node: Node, name: string, parent: Definition | undefined, root: Node, grammar: Grammar) {
188:   if (grammar === "python") return !name.startsWith("_") && (!parent || (parent.exported && parent.kind === "class"))
189:   if (grammar === "go") return CodeIndexGo.exported(name, parent)
190:   if (grammar === "rust") return CodeIndexRust.exported(node, parent)
191:   if (parent) return parent.exported && !name.startsWith("#") && !node.text.startsWith("private ") && ["class", "interface", "namespace", "module"].includes(parent.kind)
192:   const declaration = node.type === "variable_declarator" ? node.parent : node
193:   if (declaration?.parent?.type === "export_statement") return true
194:   return localExports(root).has(name)
195: }
196: 
197: // `export { a, b as c }` without a source exports local names.
198: const exportClauses = new WeakMap<Node, Set<string>>()
```

Linhas 210–267 · trecho SHA-256 `5149f32f372ac734c2c354fbcd0a13915ef3fb4a0f962c9025760d456a913c46`:

```text
210: function scriptImports(calls: Query, root: Node) {
211:   const statements = root.namedChildren.flatMap((node): Import[] => {
212:     if (node?.type !== "import_statement" && node?.type !== "export_statement") return []
213:     const source = node.childForFieldName("source") ?? node.namedChildren.find((child) => child?.type === "string")
214:     if (!source) return []
215:     const form = node.type === "import_statement" ? "static" : "reexport"
216:     return [{ specifier: stripQuotes(source.text), line: node.startPosition.row + 1, form, names: importNames(node) }]
217:   })
218:   const dynamic = calls.matches(root).flatMap((match): Import[] => {
219:     const specifier = match.captures.find((capture) => capture.name === "specifier")
220:     const call = match.captures.find((capture) => capture.name === "dynamic" || capture.name === "require")
221:     if (!specifier || !call) return []
222:     return [{ specifier: specifier.node.text, line: call.node.startPosition.row + 1, form: call.name as "dynamic" | "require", names: [] }]
223:   })
224:   return [...statements, ...dynamic].toSorted((a, b) => a.line - b.line)
225: }
226: 
227: // Default, namespace and named bindings of an import clause; for `export ... from`, the exported names.
228: function importNames(node: Node) {
229:   const clause = node.namedChildren.find((child) => child?.type === "import_clause" || child?.type === "export_clause" || child?.type === "namespace_export")
230:   if (!clause) return []
231:   if (clause.type === "namespace_export") return clause.namedChildren.flatMap((child) => (child?.type === "identifier" ? [child.text] : []))
232:   return clause.namedChildren.flatMap((child) => {
233:     if (!child) return []
234:     if (child.type === "identifier") return [child.text]
235:     if (child.type === "namespace_import") return child.namedChildren.flatMap((id) => (id?.type === "identifier" ? [id.text] : []))
236:     if (child.type === "export_specifier") return child.childForFieldName("name")?.text ?? []
237:     return child.namedChildren.flatMap((spec) => (spec?.type === "import_specifier" ? (spec.childForFieldName("name")?.text ?? []) : []))
238:   })
239: }
240: 
241: function stripQuotes(text: string) {
242:   return text.replace(/^['"`]|['"`]$/g, "")
243: }
244: 
245: function pythonImports(root: Node) {
246:   return root.namedChildren.flatMap((node): Import[] => {
247:     if (!node) return []
248:     const line = node.startPosition.row + 1
249:     if (node.type === "import_from_statement") {
250:       const module = node.childForFieldName("module_name")
251:       const names = node.namedChildren.flatMap((child) => {
252:         if (!child || child.id === module?.id) return []
253:         if (child.type === "aliased_import") return child.childForFieldName("name")?.text ?? []
254:         return child.type === "dotted_name" || child.type === "identifier" ? [child.text] : []
255:       })
256:       return module ? [{ specifier: module.text, line, form: "static", names }] : []
257:     }
258:     if (node.type !== "import_statement") return []
259:     // `import a, b.c as d`: one import per module, with no names.
260:     return node.namedChildren.flatMap((child) => {
261:       if (!child) return []
262:       const module = child.type === "aliased_import" ? child.childForFieldName("name") : child.type === "dotted_name" ? child : undefined
263:       return module ? [{ specifier: module.text, line, form: "static" as const, names: [] }] : []
264:     })
265:   })
266: }
267: 
```

## E20 — SCIP: arquivo regular, memo, encoding e empty helper

### `packages/core/src/research-toolkit/code-index/scip.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `2e8f9fa18bf6661bc7510dae3106010ef0babf81` · SHA-256 `fa1f6dee8938ca64e416758acedf759e44904e1a8d6a44c0778ae610ee9f9947` · 10599 bytes.

Linhas 8–224 · trecho SHA-256 `2cabf52c82fc5e95c945c34b86d6cad80cb378d2034897c5f909e7285739891f`:

```text
8: // package's own `deserializeSCIP`.
9: import { IndexSchema, PositionEncoding, SymbolRole } from "@c4312/scip/scip_pb"
10: import { Role } from "./types"
11: 
12: // T-X1: the SCIP reader, transplanted from Atlas `adapter-io/src/scip.ts:95-160`. Atlas projects a dump down to
13: // (symbol, definition|reference); the index needs ranges, roles, enclosing ranges and relationships, so this
14: // projection keeps them. Every range is converted once, here, from SCIP's 0-based half-open form to the index's
15: // 1-based closed lines and columns (UTF-16 units, the encoding scip-typescript declares).
16: //
17: // A document's `position_encoding` says how its columns count: UTF-8 bytes, UTF-16 or UTF-32 units. When it is unset
18: // the indexer's own convention applies (DEFAULT_ENCODING). Columns in another encoding are converted to UTF-16 against
19: // the line's text: the dump's own `text`, else the source the caller passes. Without either they stay as emitted.
20: 
21: /** Per indexer, the column encoding it uses without declaring one; any other indexer counts UTF-16 units. */
22: const DEFAULT_ENCODING: Readonly<Record<string, PositionEncoding>> = {
23:   // go/token columns are byte offsets.
24:   "scip-go": PositionEncoding.UTF8CodeUnitOffsetFromLineStart,
25:   "rust-analyzer": PositionEncoding.UTF8CodeUnitOffsetFromLineStart,
26: }
27: 
28: /** 1-based, closed. A zero-width SCIP range (a file module definition) has `endCol = startCol - 1`. */
29: export type Span = { readonly startLine: number; readonly startCol: number; readonly endLine: number; readonly endCol: number }
30: 
31: export type Occurrence = Span & {
32:   readonly symbol: string
33:   /** Bit set of `Role`: definition, or reference plus the import and write bits. */
34:   readonly role: number
35:   /** The definition's full syntax range, when the indexer emits one (scip-typescript does for most declarations). */
36:   readonly enclosingRange?: Span
37: }
38: 
39: export type Relationship = {
40:   readonly symbol: string
41:   readonly implementation: boolean
42:   readonly typeDefinition: boolean
43:   readonly reference: boolean
44:   readonly definition: boolean
45: }
46: 
47: export type SymbolInfo = {
48:   readonly symbol: string
49:   readonly kind: number
50:   readonly displayName: string
51:   readonly relationships: ReadonlyArray<Relationship>
52: }
53: 
54: export type Document = {
55:   /** Repository-relative POSIX path: the dump's `relativePath` under the `prefix` the caller passed. */
56:   readonly path: string
57:   readonly language: string
58:   readonly occurrences: ReadonlyArray<Occurrence>
59:   readonly symbols: ReadonlyArray<SymbolInfo>
60: }
61: 
62: export type Index = {
63:   readonly indexer: { readonly name: string; readonly version: string } | undefined
64:   readonly documents: ReadonlyArray<Document>
65:   /** Occurrences dropped because their range was malformed; a coverage fact, never silently zero. */
66:   readonly malformed: number
67: }
68: 
69: /**
70:  * The raw decode, memoized per (path, mtime, size). `statSync` runs on every call and a changed mtime or size
71:  * forces a fresh decode. What the key cannot see: a rewrite on the same mtime tick with the same byte length
72:  * serves the old decode, because (mtime, size) is a proxy for content. Atlas reproduced that collision with
73:  * `utimesSync`. Shard dumps here are written once under a content key (J2.2) and never rewritten in place, so the
74:  * collision needs a caller that rewrites a dump in place mid-process; such a caller must hash the bytes or bypass
75:  * the memo. A throw (missing, not a regular file, corrupt protobuf) is never cached.
76:  *
77:  * The regular-file check is the guard: `readFileSync` on a character device such as `/dev/zero` never returns, and
78:  * no `catch` can see a read that does not return. A symlink to a real dump stays supported, since `statSync`
79:  * follows links; a device, FIFO, socket or directory target is refused before any byte is read.
80:  */
81: const memo = new Map<string, { readonly mtimeMs: number; readonly size: number; readonly raw: ReturnType<typeof decode> }>()
82: 
83: /**
84:  * The memo serves back-to-back reads of one dump (`readScip` then `readScipIndexerName`), not a history. A decode holds
85:  * the whole dump as JS objects, hundreds of MB for a large repository, and the indexer writes each shard run to a
86:  * fresh temp path that is deleted afterwards and never read again, so a memo that kept every key grew by one dead
87:  * decode per shard run for the life of the server. It keeps the most recently used entries only, and a caller
88:  * that knows a dump is single-use drops it with `forgetScip`.
89:  */
90: export const MEMO_LIMIT = 2
91: 
92: export function forgetScip(file: string) {
93:   memo.delete(file)
94: }
95: 
96: export function decodeScipCached(file: string) {
97:   const stat = statSync(file)
98:   if (!stat.isFile()) throw new Error(`scip: '${file}' is not a regular file, so it is not an indexer dump`)
99:   const cached = memo.get(file)
100:   if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
101:     // Map keeps insertion order: re-insert so the entry evicted below is the least recently used.
102:     memo.delete(file)
103:     memo.set(file, cached)
104:     return cached.raw
105:   }
106:   const raw = decode(readFileSync(file))
107:   memo.delete(file)
108:   memo.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, raw })
109:   while (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value!)
110:   return raw
111: }
112: 
113: /**
114:  * Read one dump. `prefix` is the project directory relative to the repository root (the indexer's cwd); `source`
115:  * gives a document's text by that repository-relative path, for converting columns the dump counts in UTF-8 or UTF-32.
116:  */
117: export function readScip(
118:   file: string,
119:   options?: { readonly prefix?: string; readonly source?: (path: string) => string | undefined },
120: ): Index {
121:   const raw = decodeScipCached(file)
122:   const prefix = options?.prefix ?? ""
123:   const tool = raw.metadata?.toolInfo
124:   const documents = raw.documents.map((doc) => {
125:     const relative = path.posix.join(prefix, doc.relativePath.replaceAll("\\", "/"))
126:     const encoding = doc.positionEncoding || DEFAULT_ENCODING[tool?.name ?? ""] || PositionEncoding.UTF16CodeUnitOffsetFromLineStart
127:     const text = encoding === PositionEncoding.UTF16CodeUnitOffsetFromLineStart ? undefined : doc.text || options?.source?.(relative)
128:     const convert = text === undefined ? (range: ReadonlyArray<number>) => range : utf16(text.split("\n"), encoding)
129:     const occurrences = doc.occurrences.flatMap((occ) => {
130:       const range = span(convert(occ.range))
131:       if (!range) return []
132:       const enclosingRange = span(convert(occ.enclosingRange))
133:       return [{ ...range, symbol: occ.symbol, role: role(occ.symbolRoles), ...(enclosingRange ? { enclosingRange } : {}) }]
134:     })
135:     return {
136:       path: relative,
137:       language: doc.language,
138:       occurrences,
139:       symbols: doc.symbols.map((info) => ({
140:         symbol: info.symbol,
141:         kind: info.kind,
142:         displayName: info.displayName,
143:         relationships: info.relationships.map((rel) => ({
144:           symbol: rel.symbol,
145:           implementation: rel.isImplementation,
146:           typeDefinition: rel.isTypeDefinition,
147:           reference: rel.isReference,
148:           definition: rel.isDefinition,
149:         })),
150:       })),
151:     }
152:   })
153:   return {
154:     indexer: tool ? { name: tool.name, version: tool.version } : undefined,
155:     documents,
156:     malformed: raw.documents.reduce((sum, doc) => sum + doc.occurrences.filter((occ) => !span(occ.range)).length, 0),
157:   }
158: }
159: 
160: /** `readScip`, degrading to an empty index when the dump is missing, not a regular file, or corrupt. */
161: export function readScipOrEmpty(file: string, options?: { readonly prefix?: string }): Index {
162:   try {
163:     return readScip(file, options)
164:   } catch {
165:     return { indexer: undefined, documents: [], malformed: 0 }
166:   }
167: }
168: 
169: /** The indexer name in the dump's metadata, or undefined on the same failures `readScipOrEmpty` absorbs. */
170: export function readScipIndexerName(file: string) {
171:   try {
172:     return decodeScipCached(file).metadata?.toolInfo?.name
173:   } catch {
174:     return undefined
175:   }
176: }
177: 
178: /** SCIP marks document-scoped symbols with the `local ` scheme. */
179: export function isLocalSymbol(symbol: string) {
180:   return symbol.startsWith("local ")
181: }
182: 
183: /**
184:  * The identifier of a symbol's last descriptor (`greet` for `.../greet().`, `name` for `...greet().(name)`), or
185:  * undefined for a local, a file module or an anonymous descriptor. Generalized from Atlas `scipName`
186:  * (`escape/target-escapes.ts:51-61`), which read only a single top-level descriptor.
187:  */
188: export function descriptorName(symbol: string) {
189:   if (isLocalSymbol(symbol) || symbol.endsWith("/")) return undefined
190:   const match = symbol.match(/(?:\(([^)]+)\)|\[([^\]]+)\]|(?:`((?:[^`]|``)+)`|([\w$+-]+))(?:\([^)]*\)\.|[#.:!]))$/)
191:   if (!match) return undefined
192:   return match[1] ?? match[2] ?? match[3]?.replaceAll("``", "`") ?? match[4]
193: }
194: 
195: function decode(bytes: Uint8Array) {
196:   return fromBinary(IndexSchema, bytes)
197: }
198: 
199: // A range's columns re-counted in UTF-16 units of their line. An ASCII line, or a line the text does not have, keeps
200: // its columns: they are the same in every encoding there, or cannot be checked.
201: function utf16(lines: ReadonlyArray<string>, encoding: PositionEncoding) {
202:   const column = (line: number, offset: number) => {
203:     const text = lines[line]
204:     if (text === undefined || !/[^\x00-\x7f]/.test(text)) return offset
205:     if (encoding === PositionEncoding.UTF32CodeUnitOffsetFromLineStart) return [...text].slice(0, offset).join("").length
206:     return Buffer.from(text, "utf8").subarray(0, offset).toString("utf8").length
207:   }
208:   return (range: ReadonlyArray<number>) => {
209:     if (range.length === 3) return [range[0], column(range[0], range[1]), column(range[0], range[2])]
210:     if (range.length === 4) return [range[0], column(range[0], range[1]), range[2], column(range[2], range[3])]
211:     return range
212:   }
213: }
214: 
215: function span(range: ReadonlyArray<number>): Span | undefined {
216:   if (range.length === 3) return { startLine: range[0] + 1, startCol: range[1] + 1, endLine: range[0] + 1, endCol: range[2] }
217:   if (range.length === 4) return { startLine: range[0] + 1, startCol: range[1] + 1, endLine: range[2] + 1, endCol: range[3] }
218:   return undefined
219: }
220: 
221: function role(bits: number) {
222:   if (bits & SymbolRole.Definition) return Role.definition
223:   return Role.reference | (bits & SymbolRole.Import ? Role.import : 0) | (bits & SymbolRole.WriteAccess ? Role.write : 0)
224: }
```

## E21 — Callers, canonicalização e enclosing

### `packages/core/src/research-toolkit/code-index/callers.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `dbfb863c0f57df3b85f33456188a1532e9cffe6c` · SHA-256 `c5f23cb31a51945af79347ffe03db97c1ff7f184abc22d99c13c852bb48ed39c` · 6727 bytes.

Linhas 23–135 · trecho SHA-256 `680832fd831283a776f11f9765b71537d099ad19a0dc9021aa746a2fafa1f77d`:

```text
23:   | { readonly kind: "opaque" }
24:   /** A global symbol with no in-index definition, such as a library outside every shard. */
25:   | { readonly kind: "unresolved" }
26: 
27: export type Caller = {
28:   readonly path: string
29:   /** The enclosing definition's symbol; undefined for a reference outside every known definition. */
30:   readonly enclosing: string | undefined
31:   readonly range: Scip.Span | undefined
32:   readonly sites: ReadonlyArray<number>
33: }
34: 
35: /**
36:  * Atlas measured 795 of 855 distinct dist-form references landing on a real definition after this rewrite. It assumes
37:  * the `.d.ts` path mirrors the `src` path, which holds for per-file `tsc --declaration` output; a bundler that
38:  * flattens declarations could land on a wrong source symbol that still exists. Orchestra packages export `src/*.ts`
39:  * directly, so the rewrite is a fallback here, not the main path.
40:  */
41: export function canonicalizeSymbol(symbol: string) {
42:   return symbol.replace(/ dist\/(?:src\/)?((?:[^`]*\/)?`[^`]+)\.d\.ts`/, " src/$1.ts`")
43: }
44: 
45: /**
46:  * Builds the reverse view over every document of the shards in scope; a reference resolves against definitions in
47:  * any of them, which is how a call from one workspace package reaches a definition in another.
48:  */
49: export function create(docs: ReadonlyArray<Enclosing.Document>, options?: { readonly indexerName?: string }) {
50:   // The collapsed-local heuristic is trusted only for the proven indexer; otherwise every local is plain local.
51:   const trustCollapsedLocal = options?.indexerName === SUPPORTED_INDEXER
52:   const defs = new Map<string, Site>()
53:   docs.forEach((doc) =>
54:     doc.occurrences.forEach((occ) => {
55:       if (occ.role & Role.definition && !Scip.isLocalSymbol(occ.symbol) && !defs.has(occ.symbol))
56:         defs.set(occ.symbol, { path: doc.path, line: occ.startLine })
57:     }),
58:   )
59: 
60:   const resolutions = new Map<Scip.Occurrence, Resolution>()
61:   const groups = new Map<string, Map<string, Group>>()
62:   const holes: Site[] = []
63:   const opaque: Site[] = []
64:   docs.forEach((doc) => {
65:     const ranges = new Map(doc.definitions.map((def) => [def.symbol, def.range]))
66:     // `local N` means nothing across documents, so a local definition vouches only for its own document.
67:     const localDefs = new Set(
68:       doc.occurrences.filter((occ) => occ.role & Role.definition && Scip.isLocalSymbol(occ.symbol)).map((occ) => occ.symbol),
69:     )
70:     doc.occurrences.forEach((occ, i) => {
71:       if (occ.role & Role.definition) return
72:       const resolution = resolve(occ.symbol)
73:       resolutions.set(occ, resolution)
74:       const site = { path: doc.path, line: occ.startLine }
75:       if (resolution.kind === "opaque") opaque.push(site)
76:       if (resolution.kind === "unresolved") holes.push(site)
77:       // An import names a symbol without calling it; it stays a resolved reference but joins no caller group.
78:       if (resolution.kind !== "resolved" || occ.role & Role.import) return
79:       const enclosing = doc.enclosing[i]
80:       const bucket = groups.get(resolution.symbol) ?? new Map<string, Group>()
81:       groups.set(resolution.symbol, bucket)
82:       const key = `${doc.path}\0${enclosing ?? ""}`
83:       const group = bucket.get(key) ?? { path: doc.path, enclosing, range: enclosing ? ranges.get(enclosing) : undefined, sites: new Set<number>() }
84:       bucket.set(key, group)
85:       group.sites.add(occ.startLine)
86:     })
87: 
88:     function resolve(symbol: string): Resolution {
89:       if (Scip.isLocalSymbol(symbol))
90:         return trustCollapsedLocal && !localDefs.has(symbol) ? { kind: "opaque" } : { kind: "local" }
91:       if (defs.has(symbol)) return { kind: "resolved", symbol }
92:       const canonical = canonicalizeSymbol(symbol)
93:       if (defs.has(canonical)) return { kind: "resolved", symbol: canonical }
94:       return { kind: "unresolved" }
95:     }
96:   })
97: 
98:   return {
99:     /** References grouped by enclosing definition, sorted by path and start line; `[]` for a phantom or a local. */
100:     callers(symbol: string): ReadonlyArray<Caller> {
101:       return [...(groups.get(symbol)?.values() ?? [])]
102:         .map((group) => ({ ...group, sites: [...group.sites].toSorted((a, b) => a - b) }))
103:         .toSorted((a, b) => byPath(a.path, b.path) || (a.range?.startLine ?? 0) - (b.range?.startLine ?? 0) || a.sites[0] - b.sites[0])
104:     },
105:     /** Whether the symbol has an in-index definition; separates "defined but uncalled" from "cannot see it". */
106:     resolves(symbol: string) {
107:       return !Scip.isLocalSymbol(symbol) && defs.has(symbol)
108:     },
109:     /** The first definition site of a global symbol. */
110:     definesAt(symbol: string) {
111:       return Scip.isLocalSymbol(symbol) ? undefined : defs.get(symbol)
112:     },
113:     /** How a reference occurrence resolved; undefined for a definition occurrence or one from another view. */
114:     resolution(occ: Scip.Occurrence) {
115:       return resolutions.get(occ)
116:     },
117:     /** Sites of references to global symbols no shard defines. */
118:     holes: () => sorted(holes),
119:     /** Sites of collapsed local references: `coverage.opaqueSites` and `occurrence.opaque`. */
120:     opaque: () => sorted(opaque),
121:   }
122: }
123: 
124: type Group = { path: string; enclosing: string | undefined; range: Scip.Span | undefined; sites: Set<number> }
125: 
126: /** Code-unit order, so output does not depend on the host locale. */
127: function byPath(a: string, b: string) {
128:   return a < b ? -1 : a > b ? 1 : 0
129: }
130: 
131: function sorted(sites: ReadonlyArray<Site>) {
132:   return [...new Map(sites.map((site) => [`${site.path}\0${site.line}`, site])).values()].toSorted(
133:     (a, b) => byPath(a.path, b.path) || a.line - b.line,
134:   )
135: }
```

### `packages/core/src/research-toolkit/code-index/enclosing.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `bc64ec6b4850f673d603aa76096d328300c692ad` · SHA-256 `5abb45da734f51ab5446e6bbe34868e890d65fa9bde57e6e9a40251386379cd6` · 4930 bytes.

Linhas 22–92 · trecho SHA-256 `122479be2aee06e0e6d8f285ffc9cccc32cf605cf616612e6a10ebac4dfb92d0`:

```text
22: export type Definition = { readonly symbol: string; readonly range: Scip.Span; readonly source: "scip" | "tree-sitter" }
23: 
24: export type Document = Scip.Document & {
25:   /** Parallel to `occurrences`: the SCIP symbol of the innermost definition enclosing each one, if any. */
26:   readonly enclosing: ReadonlyArray<string | undefined>
27:   /** Every definition with a known range, one per symbol; the rows of the `symbol` table. */
28:   readonly definitions: ReadonlyArray<Definition>
29: }
30: 
31: export function join(doc: Scip.Document, structural: Structural = {}): Document {
32:   const definitions = definitionsOf(doc, structural.definitions ?? [])
33:   const imports = structural.imports ?? []
34:   const occurrences = doc.occurrences.map((occ) =>
35:     occ.role & Role.definition || !imports.some((stmt) => occ.startLine >= stmt.startLine && occ.startLine <= stmt.endLine)
36:       ? occ
37:       : { ...occ, role: occ.role | Role.import },
38:   )
39:   // A sweep in position order. Definitions open at their start and stay active until their end; the innermost
40:   // active one is the latest-starting. Ranges from two layers need not nest perfectly, so the active set is
41:   // filtered rather than treated as a stack. Ties on the start put the wider range first.
42:   const opening = definitions.toSorted((a, b) => compare(start(a.range), start(b.range)) || compare(end(b.range), end(a.range)))
43:   const order = occurrences.map((_, i) => i).toSorted((a, b) => compare(start(occurrences[a]), start(occurrences[b])))
44:   const enclosing = new Array<string | undefined>(occurrences.length)
45:   let cursor = 0
46:   let active: Definition[] = []
47:   for (const i of order) {
48:     const occ = occurrences[i]
49:     const at = start(occ)
50:     while (cursor < opening.length && compare(start(opening[cursor].range), at) <= 0) active.push(opening[cursor++])
51:     active = active.filter((def) => compare(end(def.range), at) >= 0)
52:     // A definition never encloses its own definition occurrence; its container does, and a container must hold the
53:     // whole declaration. Without that, a zero-width file module definition at 1:1 would sit inside its first child.
54:     const own = occ.role & Role.definition
55:     const until = end(own ? (occ.enclosingRange ?? occ) : occ)
56:     enclosing[i] = active.findLast((def) => !(own && def.symbol === occ.symbol) && compare(end(def.range), until) >= 0)?.symbol
57:   }
58:   return { ...doc, occurrences, enclosing, definitions }
59: }
60: 
61: function definitionsOf(doc: Scip.Document, structural: NonNullable<Structural["definitions"]>) {
62:   const byLine = Map.groupBy(structural, (def) => def.nameLine)
63:   const seen = new Set<string>()
64:   return doc.occurrences.flatMap((occ): Definition[] => {
65:     if (!(occ.role & Role.definition) || seen.has(occ.symbol)) return []
66:     if (occ.enclosingRange) {
67:       seen.add(occ.symbol)
68:       return [{ symbol: occ.symbol, range: occ.enclosingRange, source: "scip" }]
69:     }
70:     const name = Scip.descriptorName(occ.symbol)
71:     const match = name === undefined ? undefined : byLine.get(occ.startLine)?.find((def) => def.name === name)
72:     if (!match) return []
73:     seen.add(occ.symbol)
74:     return [{
75:       symbol: occ.symbol,
76:       range: { startLine: match.startLine, startCol: 1, endLine: match.endLine, endCol: Number.MAX_SAFE_INTEGER },
77:       source: "tree-sitter",
78:     }]
79:   })
80: }
81: 
82: function start(span: Scip.Span) {
83:   return [span.startLine, span.startCol] as const
84: }
85: 
86: function end(span: Scip.Span) {
87:   return [span.endLine, span.endCol] as const
88: }
89: 
90: function compare(a: readonly [number, number], b: readonly [number, number]) {
91:   return a[0] - b[0] || a[1] - b[1]
92: }
```

## E22 — Adapters e resolução Go/Python/Rust

### `packages/core/src/research-toolkit/code-index/go.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `cd3dd8cc3bf0af5848bb10a303e01ce41ad42eda` · SHA-256 `caec6569041361ba4ab456923846ddccc104006086b8c6a1901296b0a6aa45b9` · 3561 bytes.

Linhas 7–63 · trecho SHA-256 `8d2bf517ef8ef1e1e205add5b6f4cc867e0415340960bc18939ac5dfc5744172`:

```text
7: import type { CodeIndexTreeSitter } from "./tree-sitter"
8: 
9: // The Go half of the indexer run (J2.5) and of the structural layer. scip-go loads packages through the host's `go`
10: // (`go list`), so the toolchain is a precondition the host checks, not part of the pack. The run has no network: the
11: // module proxy is off and the toolchain is the local one, so a module missing from the cache or a newer `go` directive
12: // fails at once instead of reaching for the network. The module version is pinned for the reason scip-python's is.
13: 
14: /** The host program scip-go drives; without it a Go shard keeps the tree-sitter layer alone. */
15: export const TOOLCHAIN = "go"
16: 
17: export const ENV = { GOPROXY: "off", GOTOOLCHAIN: "local" }
18: 
19: /** Arguments after the executable; the run's cwd is the module root. */
20: export function args(output: string) {
21:   return ["index", "--quiet", "--module-root", ".", "--module-version", "0", "--output", output]
22: }
23: 
24: /** An identifier is exported when it starts with an upper-case letter; a member also needs its type exported. */
25: export function exported(name: string, parent?: CodeIndexTreeSitter.Definition) {
26:   return /^\p{Lu}/u.test(name) && (!parent || parent.exported)
27: }
28: 
29: /** Every `import` spec, with its alias as the bound name; `_` and `.` bind none. */
30: export function imports(root: Node) {
31:   return root.namedChildren.flatMap((node): CodeIndexTreeSitter.Import[] => node?.type !== "import_declaration" ? [] :
32:     node.descendantsOfType("import_spec").flatMap((spec): CodeIndexTreeSitter.Import[] => {
33:       const target = spec?.childForFieldName("path")
34:       if (!spec || !target) return []
35:       const alias = spec.childForFieldName("name")?.text
36:       return [{ specifier: target.text.slice(1, -1), line: spec.startPosition.row + 1, form: "static",
37:         names: alias && alias !== "_" && alias !== "." ? [alias] : [] }]
38:     }))
39: }
40: 
41: /**
42:  * An import path under the importing file's own module (the nearest go.mod's `module` line) resolves to the package
43:  * directory's first non-test source file; any other path is a package outside the repository.
44:  */
45: export function resolver(root: string) {
46:   const modules = new Map<string, { readonly dir: string; readonly path: string } | undefined>()
47:   const owner = (dir: string): { readonly dir: string; readonly path: string } | undefined => {
48:     if (modules.has(dir)) return modules.get(dir)
49:     const file = path.join(dir, "go.mod")
50:     const declared = existsSync(file) ? readFileSync(file, "utf8").match(/^module\s+"?([^\s"]+)"?/m)?.[1] : undefined
51:     const parent = path.dirname(dir)
52:     const found = declared ? { dir, path: declared } : dir === root || parent === dir ? undefined : owner(parent)
53:     modules.set(dir, found)
54:     return found
55:   }
56:   return (from: string, specifier: string): CodeIndexResolve.Resolution => {
57:     const module = owner(path.dirname(path.join(root, from)))
58:     if (!module || (specifier !== module.path && !specifier.startsWith(`${module.path}/`))) return { kind: "package" }
59:     const dir = path.join(module.dir, specifier.slice(module.path.length))
60:     const file = (existsSync(dir) ? readdirSync(dir) : []).filter((name) => name.endsWith(".go") && !name.endsWith("_test.go")).toSorted()[0]
61:     return file ? { kind: "alias", to: path.relative(root, path.join(dir, file)).replaceAll("\\", "/") } : { kind: "unresolved" }
62:   }
63: }
```

### `packages/core/src/research-toolkit/code-index/python.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `bd6f5a72c2d9a5682abdd1db06233e4085b174fd` · SHA-256 `6388a271df4127e60855282f05052cc12c54ba8f86e039fe2f369a83a6aec48b` · 1186 bytes.

Linhas 3–22 · trecho SHA-256 `01481c196cfebd08ffcaf3afaafdc4c3d88b8b12d2d995ce2fba634a6f80880e`:

```text
3: // The Python half of the indexer run (J2.5). The pack's executable is scip-python, a pyright fork: `index` takes the
4: // same `--output` as scip-typescript, but names the project and version in every symbol. The version is pinned to a
5: // constant because the default is the git revision, which would make a dump depend on the worktree's history; the
6: // shard key already carries the commit's tree hash (J2.2).
7: 
8: /** Arguments after the executable. The project name is the shard's directory, so shards of one repository stay distinct. */
9: export function args(input: { readonly project: string; readonly output: string }) {
10:   return [
11:     "index", "--quiet", "--project-name", input.project === "." ? "root" : input.project.replaceAll("/", "-"),
12:     "--project-version", "0", "--output", input.output,
13:   ]
14: }
15: 
16: /**
17:  * scip-python gives every module a `<module>/__init__:` symbol, defined at the top of its file and referenced by every
18:  * import of it. It is the file module, as scip-typescript's `path/` is, and no definition a caller or an outline names.
19:  */
20: export function indexable(symbol: string) {
21:   return !symbol.endsWith("/__init__:")
22: }
```

### `packages/core/src/research-toolkit/code-index/rust.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9fb795b9e7b368f4596a781516e942ec760ae020` · SHA-256 `0f3bd2e8e7615b3fb8ce0770fc66c1a00a371c20e04e0798c250b1d107058c1c` · 5480 bytes.

Linhas 7–103 · trecho SHA-256 `f9a1d2a10abd39f2dde99e835167cb835f741b671d52e88db659b2ef9cf3ca31`:

```text
7: import type { CodeIndexTreeSitter } from "./tree-sitter"
8: 
9: // The Rust half of the indexer run (J2.5) and of the structural layer. `rust-analyzer scip` loads the workspace through
10: // the host's `cargo metadata` and its sysroot, so cargo is a precondition the host checks, not part of the pack. The run
11: // has no network, so cargo is told it is offline instead of failing on the registry. rust-analyzer also runs the
12: // workspace's build scripts; they run inside the same confinement, and a failure there only costs their generated code.
13: 
14: /** The host program rust-analyzer drives; without it a Rust shard keeps the tree-sitter layer alone. */
15: export const TOOLCHAIN = "cargo"
16: 
17: export const ENV = { CARGO_NET_OFFLINE: "true" }
18: 
19: /** Arguments after the executable; the run's cwd is the crate root. */
20: export function args(output: string) {
21:   return ["scip", ".", "--output", output, "--exclude-vendored-libraries"]
22: }
23: 
24: /**
25:  * Upstream tags.scm captures every function in a `declaration_list` as a method, which a `mod` body also is: a function
26:  * is a method only inside an `impl` or a `trait`.
27:  */
28: export function kind(node: Node, captured: string) {
29:   if (node.type !== "function_item") return captured
30:   return ["impl_item", "trait_item"].includes(node.parent?.parent?.type ?? "") ? "method" : "function"
31: }
32: 
33: /** `pub` exports (`pub(crate)` does not); a trait's members follow the trait. */
34: export function exported(node: Node, parent?: CodeIndexTreeSitter.Definition) {
35:   if (parent?.kind === "interface") return parent.exported
36:   return node.namedChildren.some((child) => child?.type === "visibility_modifier" && child.text === "pub")
37: }
38: 
39: /**
40:  * Top-level `use` paths, with the names a use list or an `as` binds, and `mod name;` declarations as `self::name`: the
41:  * declaration is what pulls the module's file into the crate.
42:  */
43: export function imports(root: Node) {
44:   return root.namedChildren.flatMap((node): CodeIndexTreeSitter.Import[] => {
45:     if (!node) return []
46:     const line = node.startPosition.row + 1
47:     if (node.type === "mod_item" && !node.childForFieldName("body")) {
48:       const name = node.childForFieldName("name")?.text
49:       return name ? [{ specifier: `self::${name}`, line, form: "static", names: [] }] : []
50:     }
51:     const argument = node.type === "use_declaration" ? node.childForFieldName("argument") : undefined
52:     if (!argument) return []
53:     if (argument.type === "scoped_use_list") {
54:       const names = argument.childForFieldName("list")?.namedChildren.flatMap((child) => child ? [bound(child)] : []) ?? []
55:       return [{ specifier: argument.childForFieldName("path")?.text ?? "", line, form: "static", names }]
56:     }
57:     if (argument.type === "use_as_clause")
58:       return [{ specifier: argument.childForFieldName("path")?.text ?? "", line, form: "static", names: [argument.childForFieldName("alias")?.text ?? ""] }]
59:     if (argument.type === "use_wildcard") return [{ specifier: argument.text.replace(/::\*$/, ""), line, form: "static", names: [] }]
60:     return [{ specifier: argument.text, line, form: "static", names: [bound(argument)] }]
61:   })
62: }
63: 
64: /**
65:  * `crate::`, `self::` and `super::` paths resolve to the module file they name, the longest prefix that is a file
66:  * (`a/b.rs` or `a/b/mod.rs`); any other path is a crate outside the repository, or `std`.
67:  */
68: export function resolver(root: string) {
69:   return (from: string, specifier: string): CodeIndexResolve.Resolution => {
70:     const segments = specifier.split("::").filter(Boolean)
71:     const head = segments[0]
72:     if (head !== "crate" && head !== "self" && head !== "super") return { kind: "package" }
73:     const start = head === "crate" ? crateSource(root, from) : moduleDir(from)
74:     const ups = segments.findIndex((segment) => segment !== "super")
75:     const base = head === "super" ? path.posix.join(start ?? ".", ...Array<string>(ups === -1 ? segments.length : ups).fill("..")) : start
76:     const rest = segments.slice(head === "super" ? (ups === -1 ? segments.length : ups) : 1)
77:     const to = base === undefined ? undefined : rest.map((_, index) => rest.slice(0, rest.length - index))
78:       .flatMap((prefix) => [`${path.posix.join(base, ...prefix)}.rs`, path.posix.join(base, ...prefix, "mod.rs")])
79:       .find((candidate) => existsSync(path.join(root, candidate)))
80:     if (to) return { kind: head === "crate" ? "alias" : "relative", to }
81:     return { kind: "unresolved" }
82:   }
83: }
84: 
85: function bound(node: Node) {
86:   if (node.type === "use_as_clause") return node.childForFieldName("alias")?.text ?? ""
87:   return node.text.split("::").at(-1) ?? node.text
88: }
89: 
90: // The directory a file's child modules live in: its own for a crate root or `mod.rs`, else one named after it.
91: function moduleDir(file: string) {
92:   const base = path.posix.basename(file)
93:   if (["mod.rs", "lib.rs", "main.rs"].includes(base)) return path.posix.dirname(file)
94:   return path.posix.join(path.posix.dirname(file), base.slice(0, -".rs".length))
95: }
96: 
97: // The nearest Cargo.toml's `src`, the crate root's directory under the default layout.
98: function crateSource(root: string, file: string): string | undefined {
99:   const dir = path.posix.dirname(file)
100:   if (existsSync(path.join(root, dir, "Cargo.toml"))) return path.posix.join(dir, "src")
101:   if (dir === "." || dir === "") return undefined
102:   return crateSource(root, dir)
103: }
```

## E23 — Resolução TS/Python e rank

### `packages/core/src/research-toolkit/code-index/resolve.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c8ddb8e3acb6059962605907e00c6b37422ed2c3` · SHA-256 `e864ec0f1d25d9d81ce880c450feb4f0adf28cd79d32b0f665d753420a0fa8ba` · 8917 bytes.

Linhas 21–164 · trecho SHA-256 `9169161ba2639840496181c5620fc7fffea7e4c4c93b96535fd0f35776f71b0f`:

```text
21: export const make = Effect.fn("CodeIndexResolve.make")(function* (root: string) {
22:   const { default: typescript } = yield* Effect.promise(() => import("typescript"))
23:   const workspaces = yield* Effect.promise(() => workspaceDirs(root))
24:   const host = redirectingHost(typescript, root, workspaces)
25:   const configs = new Map<string, { options: ts.CompilerOptions; cache: ts.ModuleResolutionCache }>()
26: 
27:   const settings = (file: string) => {
28:     const config = typescript.findConfigFile(path.dirname(file), host.fileExists)
29:     const key = config ?? ""
30:     const cached = configs.get(key)
31:     if (cached) return cached
32:     const options = withDefaults(typescript, config ? parseConfig(typescript, host, config) : {})
33:     const created = { options, cache: typescript.createModuleResolutionCache(root, (name) => name, options) }
34:     configs.set(key, created)
35:     return created
36:   }
37: 
38:   const script = (from: string, specifier: string): Resolution => {
39:     const file = path.join(root, from)
40:     const config = settings(file)
41:     const resolved = typescript.resolveModuleName(specifier, file, config.options, host, config.cache).resolvedModule
42:     const to = resolved ? inside(root, resolved.resolvedFileName) : undefined
43:     if (specifier.startsWith(".") || specifier.startsWith("/")) return to ? { kind: "relative", to } : { kind: "unresolved" }
44:     const workspace = [...workspaces.keys()].some((name) => specifier === name || specifier.startsWith(`${name}/`))
45:     if (to) return { kind: workspace ? "workspace" : "alias", to }
46:     if (resolved) return { kind: "package" }
47:     // A bare specifier the repository claims (a workspace name, a paths pattern, a #subpath import) and that does not
48:     // resolve is a broken local import, not an external package.
49:     const claimed = workspace || specifier.startsWith("#") || Object.keys(config.options.paths ?? {}).some((pattern) => matches(pattern, specifier))
50:     return { kind: claimed ? "unresolved" : "package" }
51:   }
52: 
53:   const python = (from: string, specifier: string): Resolution => {
54:     const dots = specifier.match(/^\.*/)![0].length
55:     const rest = specifier.slice(dots).split(".").filter(Boolean)
56:     const bases = dots > 0
57:       ? [path.join(root, path.dirname(from), ...Array<string>(dots - 1).fill(".."))]
58:       : pythonRoots(root, path.join(root, path.dirname(from)), host.fileExists)
59:     const to = bases.flatMap((base) => {
60:       const target = path.join(base, ...rest)
61:       return [`${target}.py`, `${target}.pyi`, path.join(target, "__init__.py"), path.join(target, "__init__.pyi")]
62:     }).find((candidate) => host.fileExists(candidate) && inside(root, candidate))
63:     if (to) return { kind: dots > 0 ? "relative" : "alias", to: inside(root, to) }
64:     return { kind: dots > 0 ? "unresolved" : "package" }
65:   }
66: 
67:   const go = CodeIndexGo.resolver(root)
68:   const rust = CodeIndexRust.resolver(root)
69: 
70:   return {
71:     resolve(from: string, specifier: string): Resolution {
72:       if (from.endsWith(".go")) return go(from, specifier)
73:       if (from.endsWith(".rs")) return rust(from, specifier)
74:       return /\.pyi?$/.test(from) ? python(from, specifier) : script(from, specifier)
75:     },
76:   }
77: })
78: 
79: async function workspaceDirs(root: string) {
80:   const manifest = await Bun.file(path.join(root, "package.json")).json().catch(() => undefined)
81:   const declared: unknown = Array.isArray(manifest?.workspaces) ? manifest.workspaces : manifest?.workspaces?.packages
82:   const patterns = Array.isArray(declared) ? declared.filter((item): item is string => typeof item === "string") : []
83:   const found = await Promise.all(patterns.map(async (pattern) => {
84:     const manifests = await Array.fromAsync(new Bun.Glob(`${pattern.replace(/\/$/, "")}/package.json`).scan({ cwd: root, onlyFiles: true }))
85:     return Promise.all(manifests.map(async (file) => {
86:       const name = await Bun.file(path.join(root, file)).json().then((item) => item?.name, () => undefined)
87:       return typeof name === "string" ? [[name, path.join(root, path.dirname(file))] as const] : []
88:     }))
89:   }))
90:   return new Map(found.flat(2))
91: }
92: 
93: function redirectingHost(typescript: typeof ts, root: string, workspaces: Map<string, string>) {
94:   const redirect = (file: string) => {
95:     const normalized = file.replaceAll("\\", "/")
96:     const at = normalized.lastIndexOf("/node_modules/")
97:     if (at === -1) return file
98:     const rest = normalized.slice(at + "/node_modules/".length).split("/")
99:     const length = rest[0]?.startsWith("@") ? 2 : 1
100:     const target = workspaces.get(rest.slice(0, length).join("/"))
101:     return target ? path.join(target, ...rest.slice(length)) : file
102:   }
103:   const scopes = new Set([...workspaces.keys()].flatMap((name) => (name.startsWith("@") ? [name.split("/")[0]] : [])))
104:   const linkParent = (dir: string) => {
105:     const normalized = dir.replaceAll("\\", "/").replace(/\/$/, "")
106:     if (workspaces.size > 0 && normalized.endsWith("/node_modules")) return true
107:     const at = normalized.lastIndexOf("/node_modules/")
108:     return at !== -1 && scopes.has(normalized.slice(at + "/node_modules/".length))
109:   }
110:   const sys = typescript.sys
111:   return {
112:     useCaseSensitiveFileNames: sys.useCaseSensitiveFileNames,
113:     fileExists: (file: string) => sys.fileExists(redirect(file)),
114:     readFile: (file: string) => sys.readFile(redirect(file)),
115:     // TypeScript probes node_modules (and node_modules/@scope) before descending; uninstalled ones must still exist.
116:     directoryExists: (dir: string) => sys.directoryExists(redirect(dir)) || linkParent(dir),
117:     realpath: (file: string) => (sys.realpath ? sys.realpath(redirect(file)) : redirect(file)),
118:     getCurrentDirectory: () => root,
119:     getDirectories: (dir: string) => sys.getDirectories(redirect(dir)),
120:     // Resolution needs compiler options only; enumerating every project's include set would walk the whole tree.
121:     readDirectory: () => [],
122:   }
123: }
124: 
125: function parseConfig(typescript: typeof ts, host: ts.ParseConfigHost, config: string) {
126:   const read = typescript.readConfigFile(config, host.readFile)
127:   if (read.error) return {}
128:   return typescript.parseJsonConfigFileContent(read.config, host, path.dirname(config), undefined, config).options
129: }
130: 
131: // A file with no tsconfig, or one whose extends chain is missing, still resolves the way the repository's bundler does.
132: function withDefaults(typescript: typeof ts, options: ts.CompilerOptions): ts.CompilerOptions {
133:   const moduleResolution = options.moduleResolution ?? typescript.ModuleResolutionKind.Bundler
134:   return {
135:     ...options,
136:     moduleResolution,
137:     module: options.module ?? (moduleResolution === typescript.ModuleResolutionKind.Bundler ? typescript.ModuleKind.ESNext : undefined),
138:     allowJs: options.allowJs ?? true,
139:     resolveJsonModule: options.resolveJsonModule ?? true,
140:   }
141: }
142: 
143: function inside(root: string, file: string) {
144:   const relative = path.relative(root, file).replaceAll("\\", "/")
145:   if (relative.startsWith("../") || relative === ".." || path.isAbsolute(relative) || relative.split("/").includes("node_modules")) return undefined
146:   return relative
147: }
148: 
149: function matches(pattern: string, specifier: string) {
150:   const star = pattern.indexOf("*")
151:   if (star === -1) return pattern === specifier
152:   return specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1))
153: }
154: 
155: // The nearest ancestor holding a Python project file is the project root (else the repository root); its `src/`
156: // layout is tried before the root itself.
157: function pythonRoots(root: string, dir: string, exists: (file: string) => boolean): string[] {
158:   const project = PYTHON_ROOTS.some((name) => exists(path.join(dir, name)))
159:   if (project || path.relative(root, dir) === "" || path.relative(root, dir).startsWith("..")) {
160:     const base = project ? dir : root
161:     return [path.join(base, "src"), base]
162:   }
163:   return pythonRoots(root, path.dirname(dir), exists)
164: }
```

### `packages/core/src/research-toolkit/code-index/rank.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `47f1ac907480aa33ac17a1d0d2a6557345e4d1ba` · SHA-256 `4bf06c19df12dba5c60d6118ca7693951e7d857254cda46b43c6b716007d8911` · 3043 bytes.

Linhas 10–58 · trecho SHA-256 `ced94cd84636768509b96461539985b8e8a1d7a2129db218734aab95dbeaff11`:

```text
10: const ITERATIONS = 20
11: 
12: /** Test/benchmark/example paths describe the scaffolding, not the project's core; the map lists them after it. */
13: const TEST_DIRS = new Set(["tests", "test", "__tests__", "spec", "benchmark", "benchmarks", "examples", "example", "e2e", "fixtures"])
14: export function isTestPath(file: string) {
15:   const segments = file.split("/")
16:   if (segments.some((segment) => TEST_DIRS.has(segment))) return true
17:   return /^test[_.]|[_.]test\.|\.spec\.|^conftest\./i.test(segments.at(-1) ?? "")
18: }
19: 
20: type Document = { readonly path: string; readonly lines: number; readonly bytes: number }
21: type Import = { readonly fromPath: string; readonly toPath?: string }
22: 
23: /** One `file_rank` row per document. */
24: export function ranks(documents: ReadonlyArray<Document>, imports: ReadonlyArray<Import>) {
25:   const rank = computePageRank(documents.map((document) => document.path), imports)
26:   return documents.map((document) => ({ path: document.path, rank: rank.get(document.path) ?? 0, loc: document.lines, bytes: document.bytes }))
27: }
28: 
29: /**
30:  * PageRank over the file-import graph. Edge A → B means A imports from B (A gives rank to B), so files imported by
31:  * many others rank higher. A dangling node distributes its rank equally to all nodes.
32:  */
33: export function computePageRank(paths: ReadonlyArray<string>, imports: ReadonlyArray<Import>) {
34:   const N = paths.length
35:   if (N === 0) return new Map<string, number>()
36:   const pathSet = new Set(paths)
37:   // outgoing[path] = the files this file imports from, deduped; self and out-of-shard targets give no edge.
38:   const outgoing = new Map(paths.map((file) => [file, new Set<string>()]))
39:   imports.forEach((item) => {
40:     if (item.toPath !== undefined && item.toPath !== item.fromPath && pathSet.has(item.toPath)) outgoing.get(item.fromPath)?.add(item.toPath)
41:   })
42:   const rank = new Map(paths.map((file) => [file, 1 / N]))
43:   for (let iter = 0; iter < ITERATIONS; iter++) {
44:     const next = new Map(paths.map((file) => [file, (1 - DAMPING) / N]))
45:     paths.forEach((file) => {
46:       const targets = outgoing.get(file)!
47:       if (targets.size === 0) {
48:         const share = (rank.get(file)! * DAMPING) / N
49:         paths.forEach((target) => next.set(target, next.get(target)! + share))
50:         return
51:       }
52:       const share = (rank.get(file)! * DAMPING) / targets.size
53:       targets.forEach((target) => next.set(target, next.get(target)! + share))
54:     })
55:     next.forEach((value, file) => rank.set(file, value))
56:   }
57:   return rank
58: }
```

## E24 — Query: basis, stale e dirty overlay

### `packages/core/src/research-toolkit/code-index/types.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `f0690be298513ba918b88c59eb01c2142f8133dc` · SHA-256 `2bc3804460a0faf5ddf2e62d19ca86efd39db0a8142dc75787e60cdd2519332f` · 7619 bytes.

Linhas 7–88 · trecho SHA-256 `9fc363c9a18c0a5c6eb91acc3eecb0469915f25eccbebcf1b7527936e0a6a8f1`:

```text
7: // J2 (index and code_query) and J3 (code_search, code_locate). Lines are original-file coordinates, 1-based and
8: // closed (JI-3); columns are UTF-16 units, the encoding SCIP declares for TypeScript.
9: 
10: export type Range = { readonly path: string; readonly startLine: number; readonly endLine: number }
11: export type SymbolRef = {
12:   readonly symbol: string
13:   readonly name: string
14:   readonly kind: string
15:   readonly range: Range
16:   readonly nameLine: number
17:   readonly exported: boolean
18: }
19: 
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
41: export type CodeQuery = typeof CodeQuery.Type
42: 
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
71: }
72: 
73: export type Hit = {
74:   readonly range: Range
75:   readonly role: "definition" | "reference" | "import" | "write" | "call"
76:   readonly via?: SymbolRef
77:   readonly sites?: ReadonlyArray<number>
78:   readonly opaque?: boolean
79: }
80: 
81: export type CodeQueryResult = {
82:   /** Undefined when the name is ambiguous or absent; candidates then holds at most 20. */
83:   readonly resolved: SymbolRef | undefined
84:   readonly candidates: ReadonlyArray<SymbolRef>
85:   readonly hits: ReadonlyArray<Hit>
86:   readonly next?: number
87:   readonly basis: Basis
88: }
```

### `packages/core/src/research-toolkit/code-index/query.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `25d652ee0ce78d327427837466b5d7fe5886013f` · SHA-256 `ec1dd4a297e6e798c497d67ac5ed21cd4c6484e2aba3c2bed60dbd8f174f05e8` · 32872 bytes.

Linhas 58–261 · trecho SHA-256 `13446eca0107840359195427f73fe779688a4f7150cfb240fbb32366ffa21394`:

```text
58: const DEFAULT_LIMIT = 50
59: const CANDIDATES = 20
60: const SKIPPED_LIMIT = 200
61: 
62: type Row = {
63:   id: number; scip: string | null; name: string; kind: string; path: string; start_line: number; end_line: number
64:   name_line: number; exported: number; container_id: number | null
65: }
66: // An occurrence with its enclosing definition (LEFT JOIN: the symbol columns are null for a top-level site).
67: type SiteRow = Omit<Row, "id"> & {
68:   id: number | null; site_path: string; site_line: number; site_end: number; site_role: number; site_opaque: number
69: }
70: type Ready = { readonly planned: CodeIndexBuild.Planned; readonly key: string; readonly stale?: string }
71: type Found = { readonly ref: CodeIndex.SymbolRef; readonly shard?: Ready; readonly id?: number; readonly scip?: string }
72: type Scope = {
73:   readonly plan: CodeIndexBuild.Plan
74:   readonly ready: ReadonlyArray<Ready>
75:   readonly dirty: ReadonlySet<string>
76:   readonly overlay: ReadonlyMap<string, { readonly lines: number; readonly symbols: ReadonlyArray<CodeIndex.SymbolRef> }>
77:   readonly skipped: Array<{ readonly path: string; readonly reason: string }>
78:   readonly dirtyDigest?: string
79: }
80: type Findings = { readonly resolved?: Found; readonly candidates: ReadonlyArray<CodeIndex.SymbolRef>; readonly hits: ReadonlyArray<CodeIndex.Hit> }
81: 
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
135: 
136: // Every path the caller names is resolved against the worktree; one that leaves it is reference_invalid (J2.12).
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
170: }
171: 
172: /**
173:  * Pick each shard's file: the current key, else the newest retained key for the same shard while it rebuilds
174:  * (`stale`, J2.11). With nothing usable the query fails index_building or index_unavailable, never empty (J2.12).
175:  */
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
226: 
227: // J2.8: modified and untracked files of the scope's shards are re-read by the structural layer.
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

## E25 — Query: resolução, hits e limites de overlay

### `packages/core/src/research-toolkit/code-index/query.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `25d652ee0ce78d327427837466b5d7fe5886013f` · SHA-256 `ec1dd4a297e6e798c497d67ac5ed21cd4c6484e2aba3c2bed60dbd8f174f05e8` · 32872 bytes.

Linhas 263–524 · trecho SHA-256 `6eff3b34a0b6f27c64485a0d9c83ffa36cfc06170424b5ce041d38a159da64f3`:

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
288: 
289: type Target = { readonly name?: string; readonly path?: string; readonly symbol?: string; readonly at?: { readonly path: string; readonly line: number; readonly column?: number } }
290: 
291: /** One definition for the target, or the candidates when it is ambiguous or absent (bm25-ranked, at most 20). */
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
346: 
347: /** FTS5 over name and its camelCase/snake_case tokens, best bm25() first across shards. */
348: function fuzzy(scope: Scope, name: string, file?: string) {
349:   const match = CodeIndexStore.tokens(name).split(" ").filter(Boolean).map((token) => `"${token}"*`).join(" ")
350:   if (!match) return Effect.succeed([] as ReadonlyArray<CodeIndex.SymbolRef>)
351:   return each(scope, (sql) => sql.unsafe<Row & { score: number }>(`SELECT s.*, bm25(symbol_name) AS score FROM symbol_name
352:       JOIN symbol s ON s.id = symbol_name.rowid WHERE symbol_name MATCH ? ${file ? "AND s.path = ?" : ""}
353:       AND s.path IN (SELECT path FROM document) ORDER BY score LIMIT ${CANDIDATES * 5}`, file ? [match, file] : [match]))
354:     .pipe(Effect.map((rows) => rows.flatMap((entry) => entry.rows.filter((row) => !scope.dirty.has(row.path)).map((row) => ({ score: row.score, ref: found(entry.choice, row).ref })))
355:       .sort((a, b) => a.score - b.score).map((entry) => entry.ref)))
356: }
357: 
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
411: 
412: /** `symbols`: a file's outline with members, or every definition under a directory; a name ranks by bm25(). */
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
440: 
441: /**
442:  * `map` (T-X8): files and directories under the scope ordered by PageRank, with LOC, read from the index instead of
443:  * a new walk. A directory's rank and LOC are its files' sums; `depth` bounds how far below the scope entries go.
444:  */
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
475: 
476: // Documents examined: the index's documents in scope plus overlay files the index did not have.
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
524: 
```

## E26 — Busca lexical e limites de captura

### `packages/core/src/research-toolkit/search.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c02ca1932f9782f4a2c141a892db5938b3d2c514` · SHA-256 `5d69897854d3c3ef0b305f4977163233ff73eea0525ad40a2b1d9b606f97cc93` · 7919 bytes.

Linhas 17–175 · trecho SHA-256 `654edeea04f25f8ad8ea24e614ad4a37c85617897cb25cecf01cef206ad48c01`:

```text
17: export interface Options {
18:   readonly cwd: string
19:   readonly signal?: AbortSignal
20:   /** HEAD of the worktree, from Git.history.head; the caller owns it so search spawns nothing but ripgrep. */
21:   readonly commit?: string
22:   /** Resolves the index symbol containing a line; absent while no index exists. */
23:   readonly enclosing?: (path: string, line: number) => Effect.Effect<CodeIndex.SymbolRef | undefined>
24: }
25: 
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
56: 
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
125: 
126: // The subset of ripgrep's JSON message stream this adapter reads.
127: type Row = {
128:   type: string
129:   data: {
130:     path?: { text?: string }
131:     line_number?: number
132:     lines?: { text?: string; bytes?: string }
133:     stats?: { searches: number }
134:   }
135: }
136: 
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

## E27 — Locate: budget, ranking e verificação

### `packages/core/src/research-toolkit/locate.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d1343801f7b336d5e5b46eac860f6a07a0ae19fa` · SHA-256 `0ebac9d228ca1764020e0f7ccf260228dc02c1169c0143c07f258e7c7ac650f2` · 16148 bytes.

Linhas 24–270 · trecho SHA-256 `1e1915cc1b0ce58f9dc14d2c6e77e4a4f86f4d0c0dd11a2d6272eb0a7123da74`:

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
44: 
45: type Kind = CodeIndex.LocateResult["searches"][number]["kind"]
46: type Planned = { readonly kind: Kind; readonly query: string; readonly run: Effect.Effect<List, Research.Error> }
47: /** One ranked candidate list: its units in rank order, each with what made it a candidate. */
48: type List = { readonly units: ReadonlyArray<Unit>; readonly hits: number; readonly truncated: boolean; readonly basis?: CodeIndex.Basis }
49: type Unit = CodeIndex.Range & {
50:   readonly symbol?: string
51:   readonly why: string
52:   /** What verification rereads: a lexical hit's line and text, or a definition's name line. */
53:   readonly check?: { readonly line: number; readonly text: string }
54: }
55: 
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
111: 
112: /**
113:  * Terms a question names, without a model: identifiers (camelCase, snake_case, kebab-case, paths), quoted strings, and
114:  * words of four or more letters that are not stopwords (J3.5 step 1).
115:  */
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
129: 
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
200: 
201: /**
202:  * Reciprocal Rank Fusion, score = Σ 1/(60 + rank) over every candidate list, plus 0.1 × the normalized L5 rank. A
203:  * lexical window that falls inside a definition unit of the same file joins that definition.
204:  */
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
236: 
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
266: 
267: const STOPWORDS = new Set(("about above after again against also does doing done down during each from have having here how into " +
268:   "itself just like more most much must only other over same should some such than that their them then there these they this " +
269:   "those through under until very what when where which while whom whose will with within without would your yours code file " +
270:   "files where function method class find show work works make made used uses using").split(" "))
```

## E28 — Liveness: alcance, HTTP, DNS e limites

### `packages/core/src/research-toolkit/liveness.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `3b6335d550f6979d9aca63cd0e524b3e43b0a9b2` · SHA-256 `9703355fbfac94a32110e810f0843ce22285895cc45b8da3f534f36a61f772af` · 6955 bytes.

Linhas 7–126 · trecho SHA-256 `1beefba9239fd7a7b89d9d318c0aa7f2ffbee47554641eb79e8887bff7cfb805`:

```text
7: // J5.9-J5.11: URL liveness and the domain allow-list. Network reads of the same class as webfetch, run by the host.
8: 
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
47: 
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
70: 
71: type Outcome = Omit<Result, "url">
72: 
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

## E29 — Probe: contrato fechado, execução e verdict

### `packages/core/src/research-toolkit/probe/types.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a3859179186c2e7f55aa401fa4b3f091540eaffe` · SHA-256 `7946f380ef918f065273afa09304cdf61da2d88d78bb287cff0ad5812e45c3e6` · 3631 bytes.

Linhas 10–84 · trecho SHA-256 `0c00a033f5ddecd59da726828a53bfbcd07bab4adb6676a90d1c9ffb37700567`:

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

### `packages/core/src/research-toolkit/probe/run.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `be267f2f07e4c59a2b69f58b98ddc9499dd550ab` · SHA-256 `80ece4f75445501ac55ecc69bee4a00ca46f88bf931ba0b1f71c6ec5aa53f73c` · 8683 bytes.

Linhas 18–152 · trecho SHA-256 `eaa11c6a2aa6570cf7888c0f3040a2bfd9962a75232eb6311551e397dab2a126`:

```text
18: // J4: one probe = a fresh snapshot in scratch, one closed runner, run inside ToolSafetySandbox.confine (no network,
19: // writes only to the confine's own scratch) through AppProcess/omni, with the result condensed for the model.
20: 
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
111: }
112: 
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

## E30 — Processos: ambiente, limites e encerramento

### `packages/core/src/research-toolkit/process.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `04f6a92d3a145da49f9934983ea20fc0b2266490` · SHA-256 `4d040e1cd277492ec22ef7dc3b06fb77a4bfd73064c45ee1fe894992a8948f77` · 6087 bytes.

Linhas 16–126 · trecho SHA-256 `dc74b9c6d416cbda67fd1b756b336265076cfb31d01ca908edde92647e10d261`:

```text
16:   return {
17:     ...Object.fromEntries(Object.entries(ToolSafetySandbox.environment(input)).filter(
18:       (entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith("GIT_") && !STRIPPED.includes(entry[0]))),
19:     GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
20:   }
21: }
22: 
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
38: 
39: export class Failed extends Schema.TaggedErrorClass<Failed>()("ResearchProcess.Failed", {
40:   command: Schema.String,
41:   detail: Schema.String,
42: }) {}
43: 
44: class Overflow extends Schema.TaggedErrorClass<Overflow>()("ResearchProcess.Overflow", {}) {}
45: 
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

## E31 — Snapshots e dependências compartilhadas

### `packages/core/src/research-toolkit/probe/snapshot.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `0e89bf342e5c4567c4c2cfc180a3d3961ffec91e` · SHA-256 `c376cc01e1e893d3fac7cff70f6858888b29145546e36c36ce4d4b0a4655ea77` · 6868 bytes.

Linhas 12–113 · trecho SHA-256 `74079588aacee7da0442c433048ae91e3c0ef80cf030fe94df07edf0125f63f1`:

```text
12: // worktree is reached only through the dependency links, which the jail leaves read-only.
13: 
14: export type Snapshot = {
15:   /** Physical root of the copy. */
16:   readonly root: string
17:   /** Physical root of the original worktree, for translating paths back. */
18:   readonly origin: string
19:   readonly kind: "commit" | "worktree"
20:   readonly revision: string
21:   readonly dirtyDigest?: string
22:   readonly files: number
23: }
24: 
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
66: 
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

## E32 — Assets e runners fechados

### `packages/core/src/research-toolkit/probe/assets.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `723a227214d129eed66a8e6d43d3277ae0f199d1` · SHA-256 `3fd210e83469c18a58aa2ffade6286cd1fdbd21ea1f8280cfad9c949ef77f1d9` · 3800 bytes.

Linhas 11–64 · trecho SHA-256 `24a786b3acad579d63e68b6f17fc46c6e373fa6cf6024c59194c4afab938e16b`:

```text
11: 
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

### `packages/core/src/research-toolkit/probe/runners.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `5d56b469bb20f80dff4cd89d034706ee8db4798d` · SHA-256 `551427a96e05cf5562e8d6eff1873b91a538a9614869ae2323d4b40a7120a028` · 8962 bytes.

Linhas 15–152 · trecho SHA-256 `b17fa8c207e3f1336a2c1679e619194226778b049fd7292bc78adf093f345e6f`:

```text
15: 
16: export type Plan = {
17:   readonly kind: Probe.ProbeInput["runner"]["kind"]
18:   readonly binary: string
19:   readonly version: string
20:   /** The full argv, program first, with scratch paths. */
21:   readonly argv: ReadonlyArray<string>
22:   /** Inside the snapshot: its root, or the directory whose config picked the test runner. */
23:   readonly cwd: string
24:   readonly env: Record<string, string>
25: }
26: 
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
57: 
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
109: 
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

## E33 — Typecheck e diagnóstico estruturado

### `packages/core/src/research-toolkit/probe/typecheck.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ce72fc2597ac4a25486bc96c88411a3a7cbf9269` · SHA-256 `929d76e274a17b9eae1f25eab1349fe72f625805c9457110c25f13c618e91cb9` · 6837 bytes.

Linhas 14–118 · trecho SHA-256 `31b4fdc0bfa470d54ca6671990f479c142e326e5fe5d60572f0a60ae6181c4e0`:

```text
14: 
15: export type Diagnostic = NonNullable<Probe.ProbeResult["diagnostics"]>[number]
16: 
17: /** TS6133, TS6192 and TS6196 prove a symbol unused (brief-usage.ts:28-43), over the whole project. */
18: export const UNUSED = ["--noUnusedLocals", "--noUnusedParameters"]
19: 
20: export function argv(input: { readonly node: string; readonly tsc: string; readonly project: string; readonly heapMiB: number; readonly unused?: boolean }) {
21:   return [input.node, `--max-old-space-size=${input.heapMiB}`, input.tsc, "-p", input.project, "--noEmit", "--pretty", "false",
22:     ...(input.unused ? UNUSED : [])]
23: }
24: 
25: /** verify-in-project.ts `normErr`: the same error reads identically wherever it sits. */
26: export const signature = (item: Diagnostic) => `error ${item.code}: ${item.message}`
27: 
28: /**
29:  * verify-in-project.ts: the names a red project is missing. TS2593 is also "Cannot find name"; TS2339 names the type a
30:  * same-name global may shadow; TS18004 names a shorthand property with no value in scope.
31:  */
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
43: 
44: /**
45:  * diagnose-red.ts `diagnoseRed`, without the decomposition-specific reasons: the causes a red typecheck reduces to,
46:  * then each distinct error once with its count and first site. The condensed tail the model reads instead of raw lines.
47:  */
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
68: 
69: /**
70:  * The project tsc reads: a tsconfig or a directory as given, or for a source file the nearest tsconfig.json up to the
71:  * snapshot root (compiler.ts `findTsconfig`).
72:  */
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

## E34 — Binding nativo e invocação persistida

### `packages/core/src/research/binding.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `5f5c7f92d7ade9c902d54c0e9bce713871952e78` · SHA-256 `b64e476309f22af194c1459389814939887c117819be494adaac0b2fa73d1701` · 7351 bytes.

Linhas 22–104 · trecho SHA-256 `81588fa90bce89895d4b6bd970dfa6aab2480c4a050940554926441048e2d253`:

```text
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

## E35 — Allowance, charge idempotente e reserva irreversível

### `packages/core/src/research/allowance.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `2a2b412f57e8b34016ff5bdbfe6f638e9616cf80` · SHA-256 `177b564304a9d79e9144da70a6c97107b604d40dde16ae8185467d801fd3c3eb` · 11674 bytes.

Linhas 16–32 · trecho SHA-256 `0089ce9f0213afd48a8a844b8ddd65f8fb4349897d8b4517ef3e3ce25b4b7a3d`:

```text
16: export interface Interface {
17:   /** The caller's effort tier is fixed here; re-binding the same dispatch with another tier is a mismatch. */
18:   readonly bind: (binding: Research.Binding, dispatchCallID: string, tier?: Research.Depth) => Effect.Effect<Research.Allowance, Research.Error>
19:   readonly charge: (
20:     allowance: Research.Allowance,
21:     kind: Kind,
22:     operation: string,
23:     amount?: number,
24:   ) => Effect.Effect<void, Research.Error>
25:   /** Irreversible debit before acquisition/publication; uncertain writes keep the full reservation. */
26:   readonly reserveBytes: (allowance: Research.Allowance, operation: string, bytes: number) => Effect.Effect<void, Research.Error>
27:   /** Verify observed bytes fit the existing reservation. No credit is minted by reconciliation. */
28:   readonly reconcileBytes: (allowance: Research.Allowance, operation: string, bytes: number) => Effect.Effect<void, Research.Error>
29:   /** What the dispatch has spent of one kind, read from the same ledger `charge` checks. */
30:   readonly used: (allowance: Research.Allowance, kind: Kind) => Effect.Effect<number, Research.Error>
31: }
32: 
```

Linhas 40–181 · trecho SHA-256 `ac6d09d16cce128053c6ca744c2d095032e280720df0db6aed72c6dc735acaa2`:

```text
40: 
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
180:   }),
181: )
```

Linhas 189–197 · trecho SHA-256 `196b84c25cf76d4218912ae7829b8a1990dfdbd1d79f101e4211cede5f7ec421`:

```text
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

## E36 — Ledger, escopo, dispatch, retenção e replay

### `packages/core/src/research/ledger.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` · SHA-256 `67e07368ea820ec0c1cb791d601a10acdfa2e9259605a1bec4f556f6bb121839` · 9660 bytes.

Linhas 15–157 · trecho SHA-256 `cc2702948d2e0b5004c265feb58cd9ec6dcd92c6ef5bec6bc33f547aa60584fc`:

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
85: 
86: /**
87:  * One dispatch's ledger after its allowance was bound: sources, records, its own charges and inquiry events. A resumed
88:  * Task binds a new dispatch, so its inquiry starts open; re-entering the same dispatch reads the same stream.
89:  */
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
144: 
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

## E37 — Custódia e admissão são contratos diferentes

### `packages/core/src/research/artifacts.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `7c8bb90f269ad00d3779923dd1d8211e3d4edbd4` · SHA-256 `57e6e7d99c507014c52b887d21dfe766311a1a20a5e3e24837665fed7091d24f` · 16639 bytes.

Linhas 32–148 · trecho SHA-256 `d7e8ad0babe5978ed116d0736f3bd839975a2efcd1a32574941b882f85ba6d50`:

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

## E38 — Intent estável e filesystem imutável

### `packages/core/src/research/artifacts.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `7c8bb90f269ad00d3779923dd1d8211e3d4edbd4` · SHA-256 `57e6e7d99c507014c52b887d21dfe766311a1a20a5e3e24837665fed7091d24f` · 16639 bytes.

Linhas 149–259 · trecho SHA-256 `0772f6563c313e1078c9d29edcda07b5c1f8acc6aaab51febeb63bd82b3fd3e6`:

```text
149:   const remove = Effect.fn("ResearchArtifacts.remove")(function* (binding: Research.Binding) {
150:     yield* retained(binding)
151:     yield* Effect.tryPromise({
152:       try: async () => {
153:         const root = await directory(global.data, binding, false).catch((error: unknown) => {
154:           if (missing(error)) return undefined
155:           throw error
156:         })
157:         if (root) await fs.rm(root, { recursive: true })
158:       },
159:       catch: () => new Research.Error({ code: "publication_uncertain", message: "Research artifact removal is uncertain" }),
160:     })
161:   })
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
195:   return Service.of({ put, read, verifySource, remove, prepare })
196: }))
197: 
198: export const node = makeGlobalNode({ service: Service, layer, deps: [Global.node, Database.node] })
199: 
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

## E39 — Records e locators de evidência

### `packages/core/src/research/records.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `17f942640c19e3057ef463252be56ad72a9fa4e7` · SHA-256 `6f38acb52606d54c2b070057b301cfc82cba29f814599a0dee480c110cee558d` · 42199 bytes.

Linhas 73–128 · trecho SHA-256 `b1ea9c3da4c0df7b3980bf7ee920f3cf2d6240cd3019da7a0c44fcd48d484d3f`:

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
116: 
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
128: 
```

Linhas 492–554 · trecho SHA-256 `bfaeb55b1e9a5bcf7a61345b2ce3c4949b98690ee937bb894e4cffb367fe62ae`:

```text
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
506: }
507: 
508: function isInquiry(step: ResearchLedger.Step): step is ResearchLedger.Inquiry {
509:   return step.type === "research.inquiry.opened" || step.type === "research.inquiry.checked" || step.type === "research.inquiry.closed"
510: }
511: 
512: // Original-file lines (J5.3) address the captured span through the receipt's first line; retained lines start at 1.
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

## E40 — CAS de registros e captura admitida

### `packages/core/src/research/records.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `17f942640c19e3057ef463252be56ad72a9fa4e7` · SHA-256 `6f38acb52606d54c2b070057b301cfc82cba29f814599a0dee480c110cee558d` · 42199 bytes.

Linhas 129–259 · trecho SHA-256 `867c4d0941c25174549aedeb34e5fb34fe126015805f258dbb1dc0360de539c1`:

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
216: 
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
```

## E41 — Attempt e aquisição sem retry oculto

### `packages/core/src/research/records.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `17f942640c19e3057ef463252be56ad72a9fa4e7` · SHA-256 `6f38acb52606d54c2b070057b301cfc82cba29f814599a0dee480c110cee558d` · 42199 bytes.

Linhas 262–331 · trecho SHA-256 `513b9774170bbfac85700bfab5855c202d22b75dcde9ed920d881a7b54e39d6b`:

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
```

## E42 — Views, inquiry e citações Markdown

### `packages/core/src/research/records.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `17f942640c19e3057ef463252be56ad72a9fa4e7` · SHA-256 `6f38acb52606d54c2b070057b301cfc82cba29f814599a0dee480c110cee558d` · 42199 bytes.

Linhas 334–472 · trecho SHA-256 `c43f39ce551e7a1ff81ce72f33cb593df11acfa820a6607727ff9d68303fd37a`:

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

Linhas 556–577 · trecho SHA-256 `021c39f931d785133680ba6f911e20713708ce1cfbb40c79e374c7216c7547f4`:

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

## E43 — Declarações de seat e ferramentas retidas

### `packages/core/src/research/seat-tools.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `60cbc55506b5e3cd9cd7d937abf532399ec235b5` · SHA-256 `d88373a47e970593f281019269874b0cbe981e09b86d500604eaa4e24b29c36e` · 1258 bytes.

Linhas 1–25 · trecho SHA-256 `d88373a47e970593f281019269874b0cbe981e09b86d500604eaa4e24b29c36e`:

```text
1: export * as ResearchSeatTools from "./seat-tools"
2: 
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

## E44 — Contratos backend e artefatos pinados — NÃO EXECUTADOS

### `packages/core/test/backend-toolkit-acquisition.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `391a1ea3c8fb7a30afff29454f37449228810f6b` · SHA-256 `e1a210d6a3955f4d6b7832ee1251f003982b9f41fa54ca082971213f38f03697` · 3777 bytes.

Linhas 7–9 · trecho SHA-256 `d5529a7617d80a171ba761b7cf16793dfaabf69356e1c584dad724cba8c7e1ce`:

```text
7: it.live("shared acquisition settles typed failure, defect, cleanup rejection and interruption, then retries", () =>
8:   Effect.gen(function* () {
9:     const attempts = BackendToolkitAcquisition.make<string>(250, (cause) => Cause.hasInterrupts(cause)
```

Linhas 34–36 · trecho SHA-256 `72b3ca1705038f01f49c860568885bf77e3a344b7d02b552952f5d51b57b0e7b`:

```text
34: it.live("a throwing diagnostic formatter still settles and allows later acquisition", () =>
35:   Effect.gen(function* () {
36:     const attempts = BackendToolkitAcquisition.make<never>(0, () => { throw new Error("formatter defect") })
```

Linhas 43–45 · trecho SHA-256 `0a6aa0a0b314fb76019eefc6a11d0b978fd841d8f64e677f7939e29dfd34bf34`:

```text
43: it.live("diagnostics inspect ANSI-split tokens and actual ordinary secret values before truncation", () =>
44:   Effect.sync(() => {
45:     const token = `ghp_\x1b[31m${"x".repeat(36)}\x1b[0m`
```

### `packages/core/test/backend-toolkit-cassandra.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a0aa5c53d74b10062ad26fe52c712487c0b4f9b0` · SHA-256 `3e94bc8dbc81aab1dc9ba1946a4a890dbeee7ed24f8b68b7c86985bede387e4e` · 16059 bytes.

Linhas 31–33 · trecho SHA-256 `6148af3a0a4279c8895952f3f76e0837fccb79b54c09d2455dc721d27d024b84`:

```text
31: it.live("verified upstream source gets exactly one catalog guard and a private driver replacement", () => Effect.gen(function* () {
32:   const f = yield* fixture
33:   const before = yield* Effect.promise(() => readFile(path.join(f.original, "driver/metadata_scylla.go")))
```

Linhas 68–70 · trecho SHA-256 `737a82cf31ee5c4245a175b357b34e284046ce278c12db4d13b0567fca468398`:

```text
68: it.live("source mutations, empty/malformed bytes and missing inputs produce typed HOLD before publication", () => Effect.gen(function* () {
69:   const f = yield* fixture
70:   const before = yield* Effect.promise(() => readFile(path.join(f.original, "driver/metadata_scylla.go")))
```

Linhas 113–115 · trecho SHA-256 `91dddb25d24b9086f5d2e69a106ffa9fa3023bcc08ed3cfefc52811cefa0ce3f`:

```text
113: it.live("original, cassandra1, cassandra2 or cassandra3 ready binaries cannot satisfy cassandra4 cache identity", () => Effect.gen(function* () {
114:   const root = yield* Effect.acquireRelease(
115:     Effect.promise(() => mkdtemp(path.join(tmpdir(), "cassandra-cache-"))),
```

### `packages/core/test/backend-toolkit-cli.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `1f23219fe1d06c9c7b1dc98688a0685b36a5f666` · SHA-256 `f6d565da408d0ac9222c7f4d1dc8b3cbe270a33404254d893eac101a38fc3856` · 10060 bytes.

Linhas 33–35 · trecho SHA-256 `a45588a6be3a959e750c747c5342fb04ce49cd21605ffd3724cd78ea103f5166`:

```text
33: it.live("cold and warm Buf generation launches its pinned ES dependency from the toolkit", () =>
34:   Effect.gen(function* () {
35:     const f = yield* fixture
```

Linhas 70–72 · trecho SHA-256 `9ad838df5c9b26f395fb200cc711b630e27d5b0e0c0917917c4462d97d5f1b7f`:

```text
70: it.live("pinned SQLglot installs, parses Spark, rejects invalid SQL and transpiles Spark to DuckDB", () =>
71:   Effect.gen(function* () {
72:     const f = yield* fixture
```

Linhas 107–109 · trecho SHA-256 `1652e471cf98e2afcabf4704cb1b3926f40ab63f68fd52454cff334f5bfcc64d`:

```text
107: it.live("DataFusion either names its manifest target exclusion or builds and plans a local CSV fixture", () =>
108:   Effect.gen(function* () {
109:     const f = yield* fixture
```

### `packages/core/test/backend-toolkit-floors.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `3d1b44a6390ab81afe53686429e3faac48beb218` · SHA-256 `7046d64913ea8b3c42e23e4db3a49818336f9629cecd8960285b105c2ff8d9b4` · 7931 bytes.

Linhas 53–55 · trecho SHA-256 `24f8835a3e28cff036e021dc41ee8c6447f5982281ef944e05e79eca4187bd34`:

```text
53:   test("every runtime and downloaded binary records a floor for every target", () => {
54:     expect(owners.length).toBeGreaterThan(10)
55:     expect(
```

Linhas 60–62 · trecho SHA-256 `3b344bb683d265dc5153c6dd8e4b5d0b42caa2a5c661c86fbd836ad62f1735e1`:

```text
60:   test("recorded values are version numbers on the dimension of their target", () => {
61:     const wrong = [...owners, BackendToolkitManifest.ENGINES.orval, BackendToolkitManifest.ENGINES["datamodel-codegen"]].flatMap((owner) =>
62:       Object.entries(owner.floor ?? {}).flatMap(([target, floor]) => {
```

Linhas 73–75 · trecho SHA-256 `fba3aec758718dfbf002ce9a9a86dcc1fde3aad4bd33e6c501722c356e555f93`:

```text
73:   test("measured highs are recorded", () => {
74:     const { ENGINES, RUNTIMES } = BackendToolkitManifest
75:     expect(ENGINES["ast-grep"].floor["linux-x64"]).toEqual({ glibc: "2.34" })
```

Linhas 107–109 · trecho SHA-256 `8a1425ce4e932d7f402e4cb59fe216988d8cdbb00d68ea34dbdbec82a23b31f4`:

```text
107:   it.live("a binary's own glibc floor names the engine", () =>
108:     Effect.gen(function* () {
109:       expect(yield* refused("ast-grep", "linux-x64", { ...linux, glibc: "2.31" })).toEqual({
```

Linhas 116–118 · trecho SHA-256 `a1de17311c46ea2b2997caed646497f614b750ec7f0a80eafe14937a30a4dafc`:

```text
116:   it.live("a host that meets the floor is not refused", () =>
117:     Effect.gen(function* () {
118:       expect(yield* state("ast-grep", "linux-x64", { ...linux, glibc: "2.34" })).toBe("absent")
```

Linhas 124–126 · trecho SHA-256 `5b99f1248290c15ce2f42656fdcded7a4f01f8ff17254aa57d1f70e3b795b240`:

```text
124:   it.live("macOS names the major from the Darwin kernel", () =>
125:     Effect.gen(function* () {
126:       expect(yield* refused("sqlc", "darwin-arm64", { ...mac, kernel: "20.6.0" })).toEqual({
```

Linhas 133–135 · trecho SHA-256 `d49bf4d49fb5c38dd218f40e2e622d36970ffd6b2cc774f16b634e3461265451`:

```text
133:   it.live("a hosted engine inherits its runtime's floor", () =>
134:     Effect.gen(function* () {
135:       expect(yield* refused("orval", "linux-x64", { ...linux, glibc: "2.27" })).toEqual({
```

Linhas 142–144 · trecho SHA-256 `e6f7356cc3b68c529b148f407be5734569a81b595846a6febe3f2f54127bf0c3`:

```text
142:   it.live("an engine inherits the floor of its owned dependency's runtime", () =>
143:     Effect.gen(function* () {
144:       expect(BackendToolkitManifest.ENGINES.buf.dependencies).toContain("protoc-gen-es")
```

Linhas 149–151 · trecho SHA-256 `0dacfa7efdca7f185cb9e6a7909ad5cdc0732c791998a533450580bab2054c43`:

```text
149:   it.live("a source engine inherits its toolchain's floor", () =>
150:     Effect.gen(function* () {
151:       expect(yield* refused("ogen", "darwin-x64", { ...mac, arch: "x64", kernel: "20.6.0" })).toEqual({
```

### `packages/core/test/backend-toolkit-hosted.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `6c46f1a1df342399afb95c2db68e7e2ad0d14dde` · SHA-256 `a143a4f87382719c7ab3d496dfe176fe447034735da56361d39681060c293061` · 18371 bytes.

Linhas 159–161 · trecho SHA-256 `b09a82e64ac3ac79d8deaba96a36d8153ac6b39ad109cb5b2f6f20382246e620`:

```text
159: posix("two hosted engines share one runtime install and the launcher runs the runtime with expanded arguments", () =>
160:   Effect.gen(function* () {
161:     const f = yield* fixture
```

Linhas 193–195 · trecho SHA-256 `4388cddf3783d70df2406e531fe470ba85b738920cfc5413dd1be738291abb8b`:

```text
193: posix("a runtime that cannot be fetched blocks every engine on it with runtime-<cause> and fetches no engine bytes", () =>
194:   Effect.gen(function* () {
195:     const f = yield* fixture
```

Linhas 219–221 · trecho SHA-256 `7ed87816ac9b7ecd8dc4adabf40e338bde4e928331470fd2c374bf0242ed940d`:

```text
219: posix("prepare makes a hosted engine and its runtime ready before the command runs", () =>
220:   Effect.gen(function* () {
221:     const f = yield* fixture
```

Linhas 234–236 · trecho SHA-256 `8421726094f76be8b1a7ba408197c326fa88d50bf1e2b4974326a85e2a9021fc`:

```text
234: posix("an npm engine installs its pinned lockfile with the runtime's bundled npm and a failed install blocks it", () =>
235:   Effect.gen(function* () {
236:     const f = yield* fixture
```

Linhas 268–270 · trecho SHA-256 `de192bcad98579627ce6457b571b72792edb980ddd325f6c201b4fa217aa5190`:

```text
268: posix("installer diagnostics inspect all output before retaining a bounded tail", () =>
269:   Effect.gen(function* () {
270:     const f = yield* fixture
```

Linhas 278–280 · trecho SHA-256 `7c64dd4c7b309f285b052ff23c9f16e1fcbddf71ecb420f243267d1186cd24e7`:

```text
278: posix("an ANSI-split credential is suppressed and an ordinary host secret never reaches the installer", () =>
279:   Effect.gen(function* () {
280:     const f = yield* fixture
```

Linhas 299–301 · trecho SHA-256 `f3788f2efb2ca0d4dcd06d9517f83b91467f596d21dfda49737d4d6d7e481e30`:

```text
299: posix("a pip engine installs its hash-pinned requirements into its own directory and runs with PYTHONPATH there", () =>
300:   Effect.gen(function* () {
301:     const f = yield* fixture
```

Linhas 331–333 · trecho SHA-256 `030e92534c20884099d69a727892408f8879e1fee62dc5522a4e92852c40a065`:

```text
331: posix("prefetch for another target installs a jar engine without a shim and refuses an npm install it cannot run", () =>
332:   Effect.gen(function* () {
333:     const f = yield* fixture
```

### `packages/core/test/backend-toolkit-packs.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `360bf087226ae3c097917c477da1af1e91c5a388` · SHA-256 `657cf39e42dea2a7eb94557e3227454a63580e1dd4306eea764abab4744779f8` · 5613 bytes.

Linhas 54–56 · trecho SHA-256 `6e3a40220276c14d9c36ef47b1c0f1277237a51baa5041b9a66eb506f26dc19b`:

```text
54:   test("generated closed entry-skill names match packaged directories", () => {
55:     expect(SKILLS.length).toBeGreaterThan(0)
56:     expect(SKILLS).toEqual(BackendToolkitManifest.ENTRY_SKILLS.toSorted())
```

Linhas 58–60 · trecho SHA-256 `4679d008a9307d0e4e29b1aa897101871e50ed542b23f5f36f79155e58d08e9d`:

```text
58:   test("every pack and runtime covers each target or names why it cannot", () => {
59:     const gaps = [...runtimes, ...packs].flatMap((item) =>
60:       BackendToolkitTarget.TARGETS.filter((target) => {
```

Linhas 71–73 · trecho SHA-256 `b8093435f5146e64843ccc039e24de21aab1a7f6458c938c19f018d38df43354`:

```text
71:   test("every integrity is a distinct sha256 or sha512 SRI digest of the right length", () => {
72:     expect(artifacts.length).toBeGreaterThan(50)
73:     expect(locked.length).toBeGreaterThan(0)
```

Linhas 83–85 · trecho SHA-256 `a76c24fa4748bc501cc523b7d693b45779efe356836b33b1510261f34d183387`:

```text
83:   test("pip requirements pin every line with sha256 hashes", () => {
84:     const lines = packs.flatMap((pack) =>
85:       "targets" in pack || pack.install.kind !== "pip" ? [] : pack.install.requirements.split("\n").filter(Boolean),
```

Linhas 91–93 · trecho SHA-256 `671abded971a3c930a40484b47e7604e20cf3ec40ce72e1b8d63e477c320f556`:

```text
91:   test("every download is https from an allowed host", () => {
92:     expect(
93:       [...artifacts, ...locked]
```

Linhas 102–104 · trecho SHA-256 `677d1bf7d5e8e70648fc44a16c11f4d23e509a143a42bd5d3d92f30dfefeaa40`:

```text
102:   test("every pack declares a valid fit and carries no unfilled pin", async () => {
103:     const invalid = packs.filter(
104:       (pack) =>
```

### `packages/core/test/backend-toolkit-process.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `875625179943d1b4d540c5da6b2e454cdbdb7387` · SHA-256 `bd9c8418f5286ac92e6afab582e38bec49357f0e87e9d619607257390692ad19` · 15442 bytes.

Linhas 140–143 · trecho SHA-256 `8982d86c34d26c6865883e920c05983c0885171186ba727314761f204522e670`:

```text
140: it.live(
141:   "toolkit install runs through Omni with staging cwd, isolated installer env and npm overrides",
142:   () =>
143:     Effect.gen(function* () {
```

Linhas 164–167 · trecho SHA-256 `b343554d2bbe1174aca872b7fb2fef24dd0de3c458d4604b950471bc8a73ec48`:

```text
164: it.live(
165:   "a nonzero npm exit fails instead of publishing a completed install",
166:   () =>
167:     Effect.gen(function* () {
```

Linhas 181–184 · trecho SHA-256 `c9e718e9871ae2a924c76b61d4f5a73f4515290ae65bf41ddea92400dd8c17b1`:

```text
181:   it.live(
182:     `a zero-exit npm install exceeding 64 MiB on ${output} fails and removes staging`,
183:     () =>
184:       Effect.gen(function* () {
```

Linhas 199–202 · trecho SHA-256 `ec7bf30e12023d50f65a589b69c5208d93659559aa4480bbee57dee7f768e4d0`:

```text
199: it.live(
200:   "nonzero installer stdout is inspected for secrets before retaining its diagnostic tail",
201:   () => Effect.gen(function* () {
202:     const f = yield* fixture
```

Linhas 211–214 · trecho SHA-256 `d36f2474d8a47f64e4e4c2216279ee4efc9a453978193ed517d8347ee9a40d8f`:

```text
211: it.live(
212:   "canceling one shared toolkit waiter leaves the other waiter and one install running",
213:   () =>
214:     Effect.gen(function* () {
```

Linhas 233–236 · trecho SHA-256 `f3b2943cc265931966c721f854c5bbf50489da55af8af78bc78860f03541abf6`:

```text
233: it.live(
234:   "interrupting a direct PinnedArtifact populated-command worker stops its nonce tree before staging cleanup",
235:   () =>
236:     Effect.gen(function* () {
```

Linhas 276–279 · trecho SHA-256 `a94b21d6147ad9d0f933873b630e03cc0228bd3907d9b8f6109ea3fa6daa782e`:

```text
276: it.live(
277:   "a missing Omni addon settles shared startup failure and never leaves an engine fetching",
278:   () =>
279:     Effect.gen(function* () {
```

### `packages/core/test/backend-toolkit-project-version.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `62779ec4422ce8532dfbeebde74e6d038f737312` · SHA-256 `e9d2a53a6526adf8b7fb92082961237557ced844c212a67b1eb269f0f33c91ee` · 14524 bytes.

Linhas 32–34 · trecho SHA-256 `15ee7087ae8f77676ad2232bcb0d3ad7ac2e6fa7ab4cbea7a93762d490c9f073`:

```text
32: it.live("bench13 config-only generation blocks the existing output pin without changing bytes", () => Effect.gen(function* () {
33:   const f = yield* fixture
34:   yield* f.write("generated/.openapi-generator/VERSION", "7.12.0\n")
```

Linhas 41–43 · trecho SHA-256 `e574c068c326e69bbea8804bd43539300d0702e93d0b89a3fd13d7ae4b716722`:

```text
41: it.live("matching pins and true first generation proceed for YAML, JSON and equals output flags", () => Effect.gen(function* () {
42:   const f = yield* fixture
43:   expect(yield* f.check()).toBe("allowed")
```

Linhas 52–54 · trecho SHA-256 `f16a94cb6970f9031bd196558906fd9da3a86989e5400de69c6579009f76c812`:

```text
52: it.live("all declared pins matter, including project root pin from an approved subdirectory", () => Effect.gen(function* () {
53:   const f = yield* fixture
54:   yield* f.write("openapitools.json", JSON.stringify({ "generator-cli": { version: "6.6.0" } }))
```

Linhas 65–67 · trecho SHA-256 `bf04068fae5a30ddd9e46dc3a3419243afe8e7c44a307018488ab8e5b5f55c5d`:

```text
65: it.live("malformed and incomplete existing metadata never becomes first generation", () => Effect.gen(function* () {
66:   const f = yield* fixture
67:   for (const content of ["", "garbage\nPRIVATE_CONTENT", "7.25.0\n7.12.0\n"]) {
```

Linhas 77–79 · trecho SHA-256 `9626cbc0224d946cdca9f0dee691f95f6888e4f7864d57c4dd3f4cac9298a34b`:

```text
77: it.live("unreadable existing metadata is a named blocker, including broken symlinks", () => Effect.gen(function* () {
78:   const f = yield* fixture
79:   yield* Effect.promise(async () => {
```

Linhas 93–95 · trecho SHA-256 `d9934bcb84d35cc9aac1f4d233249c9ed75df4b8e2973b9c828d5e4e3ed06de6`:

```text
93: it.live("malformed config/project declarations and unbound or ambiguous CLI output fail closed", () => Effect.gen(function* () {
94:   const f = yield* fixture
95:   for (const content of ["outputDir: generated\noutputDir: other", "outputDir: ''"]) {
```

Linhas 124–126 · trecho SHA-256 `b38a09f006f3101c01dacf9f68947dc5c6ebc8f9099560b78cc40d2fa4ccd6ef`:

```text
124: it.live("YAML aliases cannot substitute an old output behind matching generated metadata", () => Effect.gen(function* () {
125:   const f = yield* fixture
126:   yield* f.write("generated/.openapi-generator/VERSION", `${openapiGenerator.version}\n`)
```

Linhas 141–143 · trecho SHA-256 `194659b38806e839bb80b13d860603e0d9acf29a4946bea71eeb392a2a45389e`:

```text
141: it.live("critical YAML scalars bind quoted strings/plain paths; implicit ambiguous spellings block before coercion", () => Effect.gen(function* () {
142:   const f = yield* fixture
143:   for (const key of ["outputDir", "inputSpec"]) {
```

Linhas 158–160 · trecho SHA-256 `8c82d3f932ce53e55f5c6940aab08436c8a5ec3f2a0c012e9746669e32cedac9`:

```text
158: it.live("strict-spec consumes exactly one boolean argument, including equals spelling", () => Effect.gen(function* () {
159:   const f = yield* fixture
160:   for (const value of ["true", "false"]) {
```

Linhas 170–172 · trecho SHA-256 `c9cff07690afb755a555b5430f9a440b3b8a22cbfbd1b61593b3476963de1e2c`:

```text
170: it.live("physical output, config and pin paths cannot read outside the project", () => Effect.gen(function* () {
171:   const f = yield* fixture
172:   const outside = path.join(f.directory, "outside")
```

Linhas 192–194 · trecho SHA-256 `07cd9caf415edd8279f546fbe367e614bfedc780e0b0dfdc4f22179a7ebe5277`:

```text
192: it.live("read-only validation/version do not require generation metadata", () => Effect.gen(function* () {
193:   const f = yield* fixture
194:   yield* f.write("openapitools.json", "not JSON")
```

Linhas 199–201 · trecho SHA-256 `c90df15e953a7884040a19d144ff0d0c5375a9ac3042a1ad3bafb50a8ae1dcb0`:

```text
199: it.live("cwd binding rejects symlink traversal and external placement but allows canonical in-project aliases", () => Effect.gen(function* () {
200:   const f = yield* fixture
201:   const outside = path.join(f.directory, "outside")
```

### `packages/core/test/backend-toolkit-source-readiness.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `0b5ddae83a45a11e5a546be9edc8393d1b161791` · SHA-256 `049b094e5266d65b48f48feb3cf526eccb9aefc36e00aa9e0ef79352aa03d157` · 7634 bytes.

Linhas 109–111 · trecho SHA-256 `f073ac2a393c6cff7ee3d1a3b6a19088d70d426d0f97b5789bebcb8b73a9fd09`:

```text
109:     test(`zero-exit source builder ${mode} rejected before publication through ${api}`, () => Effect.gen(function* () {
110:       const f = yield* fixture
111:       const failure = yield* f.install(mode, api).pipe(Effect.flip)
```

Linhas 124–126 · trecho SHA-256 `cdf2df2851aeb96c41f2a94273535906f4f7052f7cf9d0b98d095e8ac0ca7997`:

```text
124:   it.live(`valid source executable publishes complete cache through ${api}`, () => Effect.gen(function* () {
125:     const f = yield* fixture
126:     expectSpawn(import.meta.path)
```

### `packages/core/test/backend-toolkit-source.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `7e6d11255bd0c7711b3e50313105229b36e5366f` · SHA-256 `8f75a59e16b3d1cb07b0e32d7690b4d485b1a23a2fd1efc44d55fe3240a2804d` · 12550 bytes.

Linhas 182–184 · trecho SHA-256 `a8ad1f4556a2cdd856d8dc626bc1642436e79922581a8c3a3b94a115252f274d`:

```text
182: posix("a go source engine is extracted, built with the pinned go env, and its built binary is the launcher target", () =>
183:   Effect.gen(function* () {
184:     const f = yield* fixture
```

Linhas 224–226 · trecho SHA-256 `eb0a98c1efdb0aad0242ee46f1ee9f9b14978fc8a0df756dd9d2fc7c354b70fd`:

```text
224: posix("a cargo source engine is installed --locked into the staging root with the pinned cargo env and rustc", () =>
225:   Effect.gen(function* () {
226:     const f = yield* fixture
```

Linhas 251–253 · trecho SHA-256 `b3248a167ec8282188c4558f9df0b117a81a8853fbb7e639c6879f81d9f76922`:

```text
251: posix("a toolchain that cannot be fetched blocks the engine with runtime-<cause> and fetches no source", () =>
252:   Effect.gen(function* () {
253:     const f = yield* fixture
```

Linhas 263–265 · trecho SHA-256 `2ee9070c7278e2baac9e9f7a4bd535bb2659c5cb398906478331bdae3843c900`:

```text
263: posix("Cassandra compatibility is rejected for another Go engine before its source build", () => Effect.gen(function* () {
264:   const f = yield* fixture
265:   if (f.ogen.install.kind !== "source") throw new Error("fixture must be a source engine")
```

### `packages/core/test/backend-toolkit-target.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `bde74ba76f158a9e8c6298b787935026fa3e7c2d` · SHA-256 `d45a81b68701c819c43868425b1939210f31cbb777613c947d1f9ac29a7ab939` · 2997 bytes.

Linhas 43–45 · trecho SHA-256 `bea1c594af86c11027940ca8a54f0ac422c646205f14baa1f2d5243451953776`:

```text
43:   test("the running host resolves to a target or a reason", () => {
44:     const result = BackendToolkitTarget.detect()
45:     expect("target" in result ? BackendToolkitTarget.TARGETS.includes(result.target) : result.unsupported.length > 0).toBe(true)
```

### `packages/core/test/backend-toolkit.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `3eea6205614cc9cea12be23c820e1d53f9b6ffac` · SHA-256 `0c455829b290c1d35b67cd6bc1777918943fa1b7b1d37880c0a978075af71fa0` · 17079 bytes.

Linhas 101–103 · trecho SHA-256 `d8bb39518e355a4dfe5aa0227854c63274f336da22ec89778673915a7a55f034`:

```text
101: it.live("an absent engine becomes ready on ensure and its shim runs it with the engine environment", () =>
102:   Effect.gen(function* () {
103:     const f = yield* fixture
```

Linhas 122–124 · trecho SHA-256 `3b3f6c1ad46c2d565b51188620d13ce72cbfe21119b808a0aa00e27f660d84f8`:

```text
122: it.live("concurrent ensures share one download and a ready engine is not fetched again", () =>
123:   Effect.gen(function* () {
124:     const f = yield* fixture
```

Linhas 135–137 · trecho SHA-256 `14634f13b22f2b330c4584025d3f61ce3e87bb6ecd42c075c5df952589280677`:

```text
135: it.live("a failed fetch is remembered as failed and not fetched again inside the retry window", () =>
136:   Effect.gen(function* () {
137:     const f = yield* fixture
```

Linhas 148–150 · trecho SHA-256 `8183aac531983459fe823492afd9ac5756419b5ccf8a34ea2edf59017f296363`:

```text
148: it.live("a complete parent stays failed when its newly required owned plugin cannot be acquired", () =>
149:   Effect.gen(function* () {
150:     const f = yield* fixture
```

Linhas 161–163 · trecho SHA-256 `387c1ee46f955bdaa54a5e9e22b5715f845037c11a1408801ad0addea029a0ba`:

```text
161: it.live("complete caches need a host shim and an executable; prefetch repairs the missing shim", () =>
162:   Effect.gen(function* () {
163:     const f = yield* fixture
```

Linhas 176–178 · trecho SHA-256 `07b6d8f0ed5808eb8811d71c5fcd7bb5680568d3a4a2702d5ed9745aab968096`:

```text
176: it.live("an acquisition defect settles as a named failure instead of leaving the request fetching", () =>
177:   Effect.gen(function* () {
178:     const f = yield* fixture
```

Linhas 187–189 · trecho SHA-256 `a33b89907fc73654a247386cafd5b0bb15e85aea0713abcd2adb78f7340b3142`:

```text
187: it.live("prepare fetches nothing for a command that names no engine", () =>
188:   Effect.gen(function* () {
189:     const f = yield* fixture
```

Linhas 196–198 · trecho SHA-256 `5bca0fef55f457cfa84ea77c75e1fe43247830b13f87b8254a75ffa9bdd24705`:

```text
196: it.live("prepare fetches exactly the engines the command invokes through BACKEND_TOOLKIT_BIN", () =>
197:   Effect.gen(function* () {
198:     const f = yield* fixture
```

Linhas 214–216 · trecho SHA-256 `6f07f6aae879252cb509f87e07bdb72175e1168a64019818b9bca87c3118fea9`:

```text
214: it.live("a musl host is blocked as an unsupported target without fetching", () =>
215:   Effect.gen(function* () {
216:     const f = yield* fixture
```

Linhas 229–231 · trecho SHA-256 `0ab46087066271e098f237492b47e5c93e9c33add0ec64e84b8c6ea472c5f3f4`:

```text
229: it.live("owned dependencies are provisioned recursively without fetching unrelated engines", () =>
230:   Effect.gen(function* () {
231:     const f = yield* fixture
```

Linhas 245–247 · trecho SHA-256 `c4336267d4638d9a203fb259c56703dd64b818f11997ae211c11e572e98ba9c3`:

```text
245: it.live("every shipped engine has a valid owned dependency graph", () =>
246:   Effect.sync(() => {
247:     const engines = Object.values(BackendToolkitManifest.ENGINES)
```

Linhas 256–258 · trecho SHA-256 `a47cb9f715526d31f1a7a4a742083542b11b5e6e24dc8da63e112587f1f04753`:

```text
256: it.live("missing and cyclic owned dependencies fail by name before any download", () =>
257:   Effect.gen(function* () {
258:     const f = yield* fixture
```

Linhas 274–276 · trecho SHA-256 `8702093052b8fdb63696c0c89cf3b5c680e5f045e24a6b0968f10198d90061f3`:

```text
274: it.live("a delayed ES dependency outlives the shell waiter and continues through Buf exactly once", () =>
275:   Effect.gen(function* () {
276:     const f = yield* fixture
```

Linhas 310–312 · trecho SHA-256 `1b4ab2f003881a2679733a9778ef07adc191f795338c05b174f291347044237f`:

```text
310: it.live("prefetch for another target installs it without writing a host shim", () =>
311:   Effect.gen(function* () {
312:     const f = yield* fixture
```

Linhas 320–322 · trecho SHA-256 `3c2f9103c7cea4ca64ed1f2d4525cfa6ce2cbe4093e84eff7d4a679c68ce8324`:

```text
320: it.live("BACKEND_TOOLKIT_ROOT overrides the user-cache root", () =>
321:   Effect.gen(function* () {
322:     const previous = process.env.BACKEND_TOOLKIT_ROOT
```

### `packages/core/test/pinned-artifact.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c7eee4f2408e355edd7ab9bdaa1d0b1ac4e2c5dc` · SHA-256 `7f55d37d71175bcf32346648e5321514619eaf753b022f14ade12c352aa442d1` · 8309 bytes.

Linhas 66–68 · trecho SHA-256 `db30aeedae854fd5d0726411a19d6535525d6c51bb981cab3eb034cfe325ebe6`:

```text
66: it.live("a tar.gz install lays out its entries, marks executables 0755 and writes .complete last", () =>
67:   Effect.gen(function* () {
68:     const f = yield* fixture
```

Linhas 83–85 · trecho SHA-256 `f0491202ee0062157089220256a84fd09187149a936016f00d8fa5fa4f157537`:

```text
83: it.live("one flipped byte is refused before anything is extracted", () =>
84:   Effect.gen(function* () {
85:     const f = yield* fixture
```

Linhas 93–95 · trecho SHA-256 `d9fb64074989ac1c773be496e4f8ea7307038b5f61be8dc3d669d4ec6d152a24`:

```text
93: it.live("a digest-valid malformed archive fails extraction and leaves no completed install", () =>
94:   Effect.gen(function* () {
95:     const f = yield* fixture
```

Linhas 104–106 · trecho SHA-256 `f8122cde5052a0b67c3f7b517e8b8a0bd9453dd1a4539a79e1aed618a03cd93d`:

```text
104: it.live("a raw download is the executable itself", () =>
105:   Effect.gen(function* () {
106:     const f = yield* fixture
```

Linhas 120–122 · trecho SHA-256 `48eaa33c84c1676a8022ec1a62b9e11b204c252aeca6f89dc6fad7c30463a48d`:

```text
120: it.live("a zip extracts with the platform extractor, or names the one that is missing", () =>
121:   Effect.gen(function* () {
122:     const f = yield* fixture
```

Linhas 142–144 · trecho SHA-256 `60af5453cb96ee46f4de9b42a5ce3162214fb2907014317968a7b5c2140fdf94`:

```text
142: it.live("a missing download, an unsupported digest and an escaping entry are refused with their cause", () =>
143:   Effect.gen(function* () {
144:     const f = yield* fixture
```

Linhas 156–158 · trecho SHA-256 `85d2efb6f0c22c2978eab0c1a0872897b34462f6e00474559ee36cb3ffd2042f`:

```text
156: it.live("two concurrent installs of the same directory both succeed and leave one install", () =>
157:   Effect.gen(function* () {
158:     const f = yield* fixture
```

## E45 — Contratos de índice/toolkit — NÃO EXECUTADOS

### `packages/core/test/code-index-query.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `89bd7ce2a6edaa5af7df10dcee03de0bdd2fa06e` · SHA-256 `5759817d4df6aafb66b8a6827a4c4a0942ff8ea4f2e7f755abe3c0f952e81be4` · 25982 bytes.

Linhas 170–172 · trecho SHA-256 `95b4eb851a874a3b9435abbb3e1c65659ee058f5150917246db922d94300492d`:

```text
170:   test("one shard per tsconfig that owns files; solution, extends-only and orphan files are not shards", async () => {
171:     const repo = repository("/unused")
172:     const tree = await Effect.runPromise(CodeIndexShard.tree(repo.git, "c1"))
```

Linhas 182–184 · trecho SHA-256 `31e6954d1df576b7dfc148e3c523c826ffdc70f6376c608af95944185a5cdb4c`:

```text
182:   test("the key follows the shard's own files, its lockfiles and its tsconfig extends chain", async () => {
183:     const repo = repository("/unused")
184:     const keys = async () => {
```

Linhas 204–206 · trecho SHA-256 `2d888b3adbb6e723e3b29726dfa71f1698b366ec1d8406538e5a7f07d959f409`:

```text
204:   test("git runs without the caller's GIT_* and NODE_* variables and without global config", () => {
205:     const env = CodeIndexShard.environment({ PATH: "/bin", GIT_DIR: "/elsewhere", git_askpass: "x", NODE_OPTIONS: "--require x", HOME: "/h" })
206:     expect(env.GIT_DIR).toBeUndefined()
```

Linhas 214–216 · trecho SHA-256 `2da1d84eaee8df4bc0418053bec47e25ca44e74fb33e0b8d56853e9a7e308526`:

```text
214:   test("a new commit that changes one package rebuilds only that shard", async () => {
215:     const f = await fixture()
216:     await using _ = f.tmp
```

Linhas 226–228 · trecho SHA-256 `09e510b72ae15045d8c23439680b714bc1954f6d4a941e47a264cece72dd3581`:

```text
226:   test("a failing shard is reported and the others still land", async () => {
227:     const f = await fixture()
228:     await using _ = f.tmp
```

Linhas 241–243 · trecho SHA-256 `e2c2c14517b7fbb100c9543572eb38358d6ee4979e5927f439d2edc33ead9a17`:

```text
241:   test("definition resolves short and qualified names and reports a fresh basis", async () => {
242:     const f = await fixture()
243:     await using _ = f.tmp
```

Linhas 255–257 · trecho SHA-256 `b1b0f8d3391cbdc549ed39ed796a6798a867189751b2dab8de648aed2d174cab`:

```text
255:   test("an unknown name is not resolved and returns bm25-ranked candidates", async () => {
256:     const f = await fixture()
257:     await using _ = f.tmp
```

Linhas 265–267 · trecho SHA-256 `828fa36f471896a2b5dca6f223a429f822dac38cf3500452ac942eb067d76e87`:

```text
265:   test("callers group references by the enclosing definition with exact sites, across shards", async () => {
266:     const f = await fixture()
267:     await using _ = f.tmp
```

Linhas 283–285 · trecho SHA-256 `c6299f080d1ede3367a5f379e8182afba18d0900e65e64e6ce9a8f8a066f04ed`:

```text
283:   test("references page with next and bounds", async () => {
284:     const f = await fixture()
285:     await using _ = f.tmp
```

Linhas 296–298 · trecho SHA-256 `5d777d9225f19d2b2779115eb092ff0d51d01eea9455cb0dcd849409c7f579e9`:

```text
296:   test("imports and importers read the resolved import table", async () => {
297:     const f = await fixture()
298:     await using _ = f.tmp
```

Linhas 309–311 · trecho SHA-256 `44a29138757155d504b99cb31f925264578fc5a195af52c4d2a066e1f3f87dc6`:

```text
309:   test("symbols covers every indexed document and names the gaps; non-source files take no quota", async () => {
310:     const f = await fixture()
311:     await using _ = f.tmp
```

Linhas 324–326 · trecho SHA-256 `f24556f6a1eb810cee3a2581d3dac1c64916f521f461917d648180d9bab6a4c2`:

```text
324:   test("map lists files and directories by import rank with LOC and named gaps", async () => {
325:     const f = await fixture()
326:     await using _ = f.tmp
```

Linhas 347–349 · trecho SHA-256 `85dd35efbc206c90fd6a1d69271756834ef54a48d3c5cd2e654a96d8120322f9`:

```text
347:   test("a modified file comes back as dirty-overlay, and a definition only in the dirty file is found", async () => {
348:     const f = await fixture()
349:     await using _ = f.tmp
```

Linhas 362–364 · trecho SHA-256 `9f775b6ab2d90a7f05bd24353725e7bb12d4e8d8931937f8c142fb620c7b01c0`:

```text
362:   test("while a shard rebuilds the query answers from the previous commit as stale", async () => {
363:     const f = await fixture()
364:     await using _ = f.tmp
```

Linhas 374–376 · trecho SHA-256 `ac69a64e9c26013a99551a43224ddeb635db5315b0c41d48b5af5c125cfee093`:

```text
374:   test("named failures, never an empty success", async () => {
375:     const f = await fixture()
376:     await using _ = f.tmp
```

Linhas 397–399 · trecho SHA-256 `94ec2ce6d2453bacf6db824c365c8a3c7665ee1e74cac0721c5df454384e63fe`:

```text
397:   test("a failed build is reported with its cause and the next query retries it", async () => {
398:     const f = await fixture()
399:     await using _ = f.tmp
```

Linhas 427–429 · trecho SHA-256 `560d168498954013ee3592133b495f009da39d43827669d13b3a05c1d669de93`:

```text
427:   test("a build awaits a shard another caller is already building instead of extracting it again", async () => {
428:     const f = await fixture()
429:     await using _ = f.tmp
```

Linhas 443–445 · trecho SHA-256 `138cd87b14f470fffb2d792f8b7845f845b6416477b877aa3be9942110d97936`:

```text
443:   test("callers of one shard share a single run, and a failure is shared, remembered and then retried", async () => {
444:     const root = `flight-${crypto.randomUUID()}`
445:     const state = { runs: 0, fail: true }
```

### `packages/core/test/code-index-rank.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `3492a4ab972297533b12f9467ec92fd77bebcbdf` · SHA-256 `9ca82360fcef1061d1e42c73b1b7e3ea5cb5f1540583d11f8b66f67a71697fe2` · 2768 bytes.

Linhas 6–8 · trecho SHA-256 `7bb5e59bfdf98226344a1c2cce78f20064121adbf82bcfd1cd50734146c4dabb`:

```text
6:   test("files imported by many others rank higher, and the ranks sum to one", () => {
7:     const documents = ["a.ts", "b.ts", "c.ts", "core.ts"].map((path) => ({ path, lines: 10, bytes: 100 }))
8:     const rows = CodeIndexRank.ranks(documents, [
```

Linhas 21–23 · trecho SHA-256 `bd075591b0534a8e14f95bd5a3aabfa72aee0715abe34136dee6870b5883e196`:

```text
21:   test("self, unresolved and out-of-shard imports give no edge", () => {
22:     const documents = ["a.ts", "b.ts"].map((path) => ({ path, lines: 1, bytes: 1 }))
23:     const rows = CodeIndexRank.ranks(documents, [
```

Linhas 32–34 · trecho SHA-256 `a0469c9ab491adbbac7d6d1ba0b4744f964dcf8d11ed3e920e82b14f143e24b6`:

```text
32:   test("matches the techlead's two-node fixed point after 20 iterations", () => {
33:     // a → b, b dangling: b keeps (1-d)/2 + d·r(a) + d·r(b)/2 each step.
34:     const rank = CodeIndexRank.computePageRank(["a", "b"], [{ fromPath: "a", toPath: "b" }])
```

Linhas 41–43 · trecho SHA-256 `eb090446a5a60a70b74edfa0a644e5c3f6969b42cab3b50bea48acf6c45b20cb`:

```text
41:   test("every document is ranked, past the Arsenal's 40-entry caps", () => {
42:     const documents = Array.from({ length: 500 }, (_, index) => ({ path: `f${index}.ts`, lines: 1, bytes: 1 }))
43:     const rows = CodeIndexRank.ranks(documents, documents.slice(1).map((document) => ({ fromPath: document.path, toPath: "f0.ts" })))
```

Linhas 49–51 · trecho SHA-256 `2fa4a94a821029244ec16faabad488ef8a9a997e6df4379dfe6ef0555f5e5f02`:

```text
49:   test("test scaffolding paths are recognized", () => {
50:     expect(CodeIndexRank.isTestPath("packages/a/test/x.ts")).toBe(true)
51:     expect(CodeIndexRank.isTestPath("src/x.test.ts")).toBe(true)
```

### `packages/core/test/code-index-store.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `cb745065bf6208f70ec38456e78d0dba7bdad26d` · SHA-256 `1b6bcbc705aefe57d2620982e4cc3914fa67bd67464bcda16dfbcf587341c730` · 5359 bytes.

Linhas 23–25 · trecho SHA-256 `392ef53bd27ded6fad596d1ffbf509987996a488c497b514a8a93f7e31555f62`:

```text
23:   test("splits camelCase and snake_case names into FTS tokens", () => {
24:     expect(CodeIndexStore.tokens("assembleDiscoveryResult")).toBe("assemble discovery result")
25:     expect(CodeIndexStore.tokens("HTTPServer_start")).toBe("http server start")
```

Linhas 28–30 · trecho SHA-256 `a21f11cb3f92dc911da24f2a3fbd9221f3df7fa9e5da5c15cf1d599de97f5610`:

```text
28:   test("writes a shard atomically with the frozen schema, ranks and bm25-searchable names", async () => {
29:     await using tmp = await tmpdir()
30:     const rows = await Effect.runPromise(Effect.gen(function* () {
```

Linhas 53–55 · trecho SHA-256 `df16829fa0ad18bcd4ed5857a2d05d69763f66d4bb3c0e4dca5b688516c00912`:

```text
53:   test("keeps the most recent commits and evicts least recently used shards over the byte cap", async () => {
54:     await using tmp = await tmpdir()
55:     const keys = Array.from({ length: 10 }, (_, index) => `k${index}`)
```

Linhas 79–81 · trecho SHA-256 `413ffb10b47cf3e0340b40430f29d1b4c86d9411ff98f0d612fbbf8259334418`:

```text
79:   test("touch moves a commit to the front without dropping shards", async () => {
80:     await using tmp = await tmpdir()
81:     await Effect.runPromise(Effect.gen(function* () {
```

### `packages/core/test/research-toolkit-callers.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `17dd64948d3539303b0322d3348346c9d44fc5ca` · SHA-256 `5829cf205ff803aa208d831885d3e8727b6903962502034fb549ad16eae06c10` · 4349 bytes.

Linhas 30–32 · trecho SHA-256 `6f183481a012c499bb9f103fd32f17ac75d7301c3e48dea5cc450896139bcf12`:

```text
30:   test("groups references across workspace shards by enclosing definition, with call lines as sites", () => {
31:     const view = Callers.create(shards(), { indexerName: "scip-typescript" })
32:     expect(view.resolves(greet)).toBe(true)
```

Linhas 42–44 · trecho SHA-256 `b196455d4bde1c2070d3af40c86597b43193281ff78b09cd4cba56757def4e06`:

```text
42:   test("a phantom or local symbol has no callers and does not resolve", () => {
43:     const view = Callers.create(shards(), { indexerName: "scip-typescript" })
44:     expect(view.callers("scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/missing().")).toEqual([])
```

Linhas 50–52 · trecho SHA-256 `f2f6019b2d24e4dbec679a7be6af5a37536ac15149a2595047041001c9d86fb3`:

```text
50:   test("a local reference with no local definition in its document is opaque, only under scip-typescript", () => {
51:     const docs = [
52:       doc("a.ts", [at("local 1", 1, Role.definition), at("local 1", 2), at("local 7", 3)]),
```

Linhas 64–66 · trecho SHA-256 `551b9db7bd961bc5d9e52b528771be7ff69870145b5bb150af6ba15e69d87b28`:

```text
64:   test("a published-types reference canonicalizes onto its source definition; an unknown global is a hole", () => {
65:     const source = "scip-typescript npm @orchestra/core 1.0.0 src/`greet.ts`/greet()."
66:     const published = "scip-typescript npm @orchestra/core 1.0.0 dist/src/`greet.d.ts`/greet()."
```

### `packages/core/test/research-toolkit-enclosing.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `eba2a2164725a46200063705d1ad4a5f34f3e54f` · SHA-256 `211cd241c78fadac73c3dfa22964c1bfb41d53e6cb672c6ae76298be4f252014` · 3658 bytes.

Linhas 24–26 · trecho SHA-256 `9d71cdaf897054c53970077cbe6e11e01f0e41d5ffad487b0b766a447aada16e`:

```text
24:   test("each reference gets the innermost definition around it", () => {
25:     const doc = Enclosing.join(document("orchestra.scip", "src/main.ts"))
26:     expect(enclosingAt(doc, core + "greet().", 5)).toEqual([main + "run()."])
```

Linhas 34–36 · trecho SHA-256 `502594ae3ee65fe8f9cc5243aa2a4ad1305a0bcdf876cb1ef3e0840227b037a8`:

```text
34:   test("a definition never encloses itself; its container does", () => {
35:     const doc = Enclosing.join(document("orchestra.scip", "src/main.ts"))
36:     expect(enclosingAt(doc, main + "Loud#greet().", 9)).toEqual([main + "Loud#"])
```

Linhas 44–46 · trecho SHA-256 `4ff87893b178bad383162c93f5d57e89bcfd5b10afef7f1638b43dae9c1f2447`:

```text
44:   test("structural definitions fill the ranges scip-typescript leaves out, joined on name line and name", () => {
45:     const doc = document("core.scip", "src/greet.ts")
46:     const member = core + "Greeter#greet()."
```

Linhas 62–64 · trecho SHA-256 `5b670f5ba6b09fe71ad848579fa542925d0dffbdf3fe47e06cd89a0649226d71`:

```text
62:   test("references inside an import statement carry the import role", () => {
63:     const doc = Enclosing.join(document("orchestra.scip", "src/main.ts"), { imports: [{ startLine: 1, endLine: 2 }] })
64:     const roles = doc.occurrences.filter((occ) => occ.startLine <= 2 && !(occ.role & Role.definition)).map((occ) => occ.role)
```

### `packages/core/test/research-toolkit-liveness.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ee4caf3c595af279d91f35ec47e4b670fb884251` · SHA-256 `032ace516862a654d0a588c1d4efc6ef8d306149fe2e1c138a9f21261818741d` · 3669 bytes.

Linhas 25–27 · trecho SHA-256 `d1001305bba911217111c7909e37fd9f1762b5f8bb67c80f03fcec013ec10444`:

```text
25:   test("classifies 2xx, redirects, 4xx and loops", async () => {
26:     const results = await check([`${base}/ok`, `${base}/hop`, `${base}/gone`, `${base}/loop`, `${base}/limited`], { seen: [`${base}/gone`, `${base}/loop`] })
27:     expect(results.map((item) => item.status)).toEqual(["LIVE", "LIVE", "DEAD", "DEAD", "UNKNOWN"])
```

Linhas 31–33 · trecho SHA-256 `b78c4c457fbec0385170175e9929f62fd38b0cefa4125b737aff6162e5a15045`:

```text
31:   test("a dead URL the dispatch never saw is LIKELY_HALLUCINATED", async () => {
32:     expect((await check([`${base}/gone`]))[0].status).toBe("LIKELY_HALLUCINATED")
33:   })
```

Linhas 35–37 · trecho SHA-256 `65992448f10e9fedc1d661de447919c99da7bf3171b67bcd31a4922e969c8e29`:

```text
35:   test("HEAD first, then a one-byte ranged GET, with the fixed user agent", async () => {
36:     seen.length = 0
37:     expect((await check([`${base}/nohead`]))[0]).toMatchObject({ status: "LIVE", httpStatus: 206 })
```

Linhas 41–43 · trecho SHA-256 `3cf79ff0a250096e5e6992652a142171fef5e7e0bff0856a59412b24155b2002`:

```text
41:   test("a capture younger than 24 h is LIVE with no request", async () => {
42:     seen.length = 0
43:     const now = Date.now()
```

Linhas 51–53 · trecho SHA-256 `063c7ecd7c393ba00bd63d6afd3e91eafd1fc03a2ddf66a01e329ef4ea00e2ec`:

```text
51:   test("private addresses and unknown schemes are refused by policy, not fetched", async () => {
52:     seen.length = 0
53:     const results = await Effect.runPromise(Liveness.check([`${base}/ok`, "ftp://example.com/a", "http://localhost/x"]))
```

Linhas 58–60 · trecho SHA-256 `c7bc52a78f32d3a942c3631ef9fad8693b374fd7be920ac5b371317746319095`:

```text
58:   test("a request that exceeds the timeout is UNKNOWN", async () => {
59:     expect((await check([`${base}/slow`]))[0].status).toBe("UNKNOWN")
60:   }, 15_000)
```

Linhas 62–64 · trecho SHA-256 `469ade7075e53177cde2f3aece2ed867782d4875c0396dab845a9add3556ca53`:

```text
62:   test("domain match is by label suffix", () => {
63:     expect(Liveness.allowed("https://docs.github.com/a", ["github.com"])).toBe(true)
64:     expect(Liveness.allowed("https://github.com/a", ["github.com"])).toBe(true)
```

### `packages/core/test/research-toolkit-packs.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d5d83474b3abeeb16b95507cef2fde9f5aab0b5f` · SHA-256 `18634b672155bf2464d94b555f2e9906f55c76b8961340f341d6ee8fb2cb60dc` · 5414 bytes.

Linhas 15–17 · trecho SHA-256 `8e7221ac6a814c818854457b2e0f025ac3d47adc555e9f97d97fc40e4ca47c5b`:

```text
15:   test("ships the TypeScript, Python, Go and Rust indexers and the TypeScript oracle", () => {
16:     expect(packs.map((pack) => pack.id).toSorted()).toEqual(["rust-analyzer", "scip-go", "scip-python", "scip-typescript", "typescript"])
17:     expect(npm.map((pack) => pack.id).toSorted()).toEqual(["scip-python", "scip-typescript", "typescript"])
```

Linhas 26–28 · trecho SHA-256 `65ac13d58f810c31120e95d3fa7ca922256b68ed4642049d8dbde55cba6c1731`:

```text
26:   test("every npm pack installs from a lock whose entries all carry a registry URL and sha512 integrity", () => {
27:     for (const pack of npm) {
28:       const entries = lockOf(pack.install)
```

Linhas 37–39 · trecho SHA-256 `1aa6d3ec048d939fcf1924e03e4315009c41c931dd19f0a756251241d2c083f4`:

```text
37:   test("the lock pins the version the package.json names, and launch points inside the install", () => {
38:     for (const pack of npm) {
39:       const dependencies = Object.entries(
```

Linhas 53–55 · trecho SHA-256 `ca4a40d0349aa614aeb720d18539cbb4e5224440b6790bccae02b335eec3ca91`:

```text
53:   test("rust-analyzer pins one release's server package per target by sha256, with the server marked executable", () => {
54:     const pack = ResearchToolkitManifest.ENGINES["rust-analyzer"]
55:     if (!pack || "install" in pack) throw new Error("rust-analyzer is not a native pack")
```

Linhas 68–70 · trecho SHA-256 `02530b43990a98a86c59a0e0dff259c62a857204dbc6486156b4ed89a783098c`:

```text
68:   test("scip-go builds from the pinned module zip on the Go runtime", () => {
69:     const pack = ResearchToolkitManifest.ENGINES["scip-go"]
70:     if (!pack || !("install" in pack) || pack.install.kind !== "source") throw new Error("scip-go is not a source pack")
```

Linhas 78–80 · trecho SHA-256 `9c5b115d9e5dbe01d335bc8afa85e70be6efb75437f63a38e671a7b4dfa8184d`:

```text
78:   test("core declares the grammar and SCIP decoder the index reads offline (J6.5)", async () => {
79:     const manifest = (await Bun.file(path.resolve(import.meta.dirname, "../package.json")).json()) as {
80:       dependencies: Record<string, string>
```

### `packages/core/test/research-toolkit-scip.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `cd9313e5674805bbb9449508d352734d8c638dad` · SHA-256 `d6a06e512f263fe0e6bf50f748a6bea9840e98320260035df3b50a7acb32349f` · 7709 bytes.

Linhas 23–25 · trecho SHA-256 `63bfb1992001b73520890b67b475cf5911e28427502d9267a0e83024216d1e59`:

```text
23:   test("scip-typescript resolves the tsconfig `@/` alias and the `@orchestra/*` workspace export to source symbols", () => {
24:     const main = Scip.readScip(path.join(fixture, "orchestra.scip")).documents.find((doc) => doc.path === "src/main.ts")
25:     const refs = main?.occurrences.filter((occ) => occ.startLine === 1 || occ.startLine === 2).map((occ) => occ.symbol)
```

Linhas 36–38 · trecho SHA-256 `3545c116c5d8bb548e054e7615a34a5487e683da5df0446738792d2152ac0170`:

```text
36:   test("projects ranges to 1-based closed lines and columns and keeps enclosing ranges and relationships", () => {
37:     const index = Scip.readScip(path.join(fixture, "core.scip"), { prefix: "packages/core" })
38:     expect(index.indexer).toEqual({ name: "scip-typescript", version: "0.4.0" })
```

Linhas 60–62 · trecho SHA-256 `daf27ba8e00f74a699f35c9f598285f184da219fc7df9f2132fa6b4d1bf9ddfe`:

```text
60:   test("memoizes per path, mtime and size, and a rewrite busts the memo", async () => {
61:     await using dir = await tmpdir()
62:     const file = path.join(dir.path, "index.scip")
```

Linhas 71–73 · trecho SHA-256 `0a0f98de57a0f9c26a6fbafe08e1d6099fd4e170d7de87b30d0c7be389d93a62`:

```text
71:   test("keeps at most MEMO_LIMIT decodes however many distinct dumps are read", async () => {
72:     await using dir = await tmpdir()
73:     const files = await Promise.all(
```

Linhas 91–93 · trecho SHA-256 `fb6f8d360ca8a922665e98ab5f3c6c2a3c977a4c26ed42fb1a414841ccd17522`:

```text
91:   test("a recently read dump outlives an older one", async () => {
92:     await using dir = await tmpdir()
93:     const files = await Promise.all(
```

Linhas 107–109 · trecho SHA-256 `7eeb6811b6a1eb011fd01ce2ab1a2de5f52ed53b36088dd3892a41c032c4f5a7`:

```text
107:   test("forgetScip drops a single-use dump's decode", async () => {
108:     await using dir = await tmpdir()
109:     const file = path.join(dir.path, "index.scip")
```

Linhas 116–118 · trecho SHA-256 `a780396a72e1302507f8537626368eb84211295847e1d0a4a785af3ece5bf344`:

```text
116:   test("refuses a non-regular file and degrades a missing or corrupt dump to an empty index", async () => {
117:     await using dir = await tmpdir()
118:     const corrupt = path.join(dir.path, "corrupt.scip")
```

Linhas 129–131 · trecho SHA-256 `d2ac175253372e60d4ad04445f6221fc2edda7b34f0fc8c5de6408fc2fcff816`:

```text
129:   test("names the last descriptor of a symbol", () => {
130:     expect(Scip.descriptorName(core + "greet().")).toBe("greet")
131:     expect(Scip.descriptorName(core + "Greeter#greet().")).toBe("greet")
```

### `packages/core/test/research-toolkit.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9acd2dfc384831aaefffff06049400e121540f70` · SHA-256 `307994cee76a9d44d823921574b47cb650305561bdfafe814d8280742bc78282` · 9357 bytes.

Linhas 75–77 · trecho SHA-256 `b4c99199a91e5241b056e304378fc542809c50fc2d1b549cde6a8a762245a7e1`:

```text
75: it.live("an unshipped pack is unsupported in status and ensure fails named, never empty", () =>
76:   Effect.gen(function* () {
77:     const root = yield* temporary("research-toolkit-")
```

Linhas 87–89 · trecho SHA-256 `c127fa91ebd4f1dcc74eea1fccf341818ed1a49d0272a9dae3c7d18869f298fa`:

```text
87: it.live("research packs install on the backend lifecycle under the research root, never the backend's", () =>
88:   Effect.gen(function* () {
89:     const f = yield* fixture
```

Linhas 123–125 · trecho SHA-256 `d5845bf7769e558074cda511bc38c55dc25ea3ab9187db7176e0f848bcac818c`:

```text
123: it.live("warm builds pending shards by rank, skips what cannot build with its reason, and goes on", () =>
124:   Effect.gen(function* () {
125:     const f = yield* fixture
```

Linhas 165–167 · trecho SHA-256 `d0d6d8cb1344ae618a3ef965c649c5bd9bd5c7774a3c1268db64457fc8b15c9a`:

```text
165: it.live("one indexer runs at a time on the host, across worktrees", () =>
166:   Effect.gen(function* () {
167:     const f = yield* fixture
```

### `packages/core/test/research-toolkit/capability.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `2ea51ca30f7057c80c9a025b3e918136315323bc` · SHA-256 `a61f41b1d83c4fc2805a1730b752eb1ba9c8fe5fac6191f60fc10b258d87a574` · 5039 bytes.

Linhas 21–23 · trecho SHA-256 `65342001a92b319493abf568b2531e61e136271069fe7d113db8cbcf3357cad6`:

```text
21: it.live("with an empty manifest every engine is unsupported, and ensure names the blocker for each", () =>
22:   Effect.gen(function* () {
23:     const root = yield* temporary("research-capability-")
```

Linhas 37–39 · trecho SHA-256 `90d931b02c6d354db9e08ee7da027c3b1fdada0f71cc1bbbed2034f339f5e639`:

```text
37: it.live("a shard whose engine is missing is reported skipped with the toolkit blocker, not absent", () =>
38:   Effect.gen(function* () {
39:     const root = yield* temporary("research-capability-")
```

Linhas 65–67 · trecho SHA-256 `e01ede6f531a24c35da5ed4deb61ff25a4c72ade6ea7d56b792f8f1e824bf068`:

```text
65: test("every shipped research pack is pinned to an exact version with an allowed license and a scriptless lock", () => {
66:   const packs = Object.values(ResearchToolkitManifest.ENGINES)
67:   expect(packs.map((pack) => pack.id).toSorted()).toEqual(["rust-analyzer", "scip-go", "scip-python", "scip-typescript", "typescript"])
```

### `packages/core/test/research-toolkit/code-index-filter.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `38e5316b72362b75041977ea77233026679d24a9` · SHA-256 `367b0e31ef325b110537498f1ece2a97e22af86711164bd7df7699c74a12044d` · 2487 bytes.

Linhas 8–10 · trecho SHA-256 `ae6424e9443dfaefd2070e02b894942ebc843928e28fc0d7e2eb046823799a9f`:

```text
8:   test("only supported languages enter; skips keep a reason", () => {
9:     const result = CodeIndexFilter.select([
10:       "README.md",
```

Linhas 38–40 · trecho SHA-256 `351bd7767a16ce2d2bfebc8be9f0e9ca5537a1c82767c1a07d57d89b097ec650`:

```text
38:   test("shouldRead keeps the transplanted lockfile and binary skips", () => {
39:     expect(["bun.lock", "a/logo.png", "a/README.md"].map(CodeIndexFilter.shouldRead)).toEqual([false, false, true])
40:   })
```

Linhas 42–44 · trecho SHA-256 `65edaefa2ef2d69376f3c05684345fc4427844891c1446ac189b6a32604dba5b`:

```text
42:   test("a grammar set narrows the selection", () => {
43:     expect(CodeIndexFilter.select(["a.ts", "b.py"], new Set(["python"])).files).toEqual([{ path: "b.py", grammar: "python" }])
44:   })
```

Linhas 46–48 · trecho SHA-256 `ec0f18d8d6e069bc67823b3204fd2dad140c5d40324f267505fbfac6c13fb46c`:

```text
46:   test("every source file of packages/core/src is selected or skipped with a reason, past any 200 cap", async () => {
47:     const root = path.resolve(import.meta.dirname, "../../../..")
48:     const all = await Array.fromAsync(new Bun.Glob("packages/core/src/**/*").scan({ cwd: root, onlyFiles: true }))
```

### `packages/core/test/research-toolkit/code-index-go.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ac07bb76924812a5c41a450c20384772a7473fe2` · SHA-256 `a696f15bbdb5b60de2478ce3eb79e2706d690968b264ba21bdb5e2d79d8977ef` · 4623 bytes.

Linhas 44–46 · trecho SHA-256 `1fe4163bb700d004830f8893d9adde410e18f309713908821785242f5006a96d`:

```text
44:   test("scip-go indexes the module root at a pinned version into the host's output, offline", () => {
45:     expect(CodeIndexGo.args("/s/index.scip")).toEqual([
46:       "index", "--quiet", "--module-root", ".", "--module-version", "0", "--output", "/s/index.scip",
```

Linhas 52–54 · trecho SHA-256 `6803ae652c74ce8a7a30ecf0f4e52653d486c8e9749552d72be78a0da5811047`:

```text
52:   test("Go sources select the Go grammar and generated protobuf code is skipped", () => {
53:     expect(CodeIndexFilter.select(["main.go", "api/x.pb.go"])).toEqual({
54:       files: [{ path: "main.go", grammar: "go" }],
```

Linhas 60–62 · trecho SHA-256 `8cd51f19bb411d3d8c38f88832b93ae38670c85a90ebaae93e277389047d8e0a`:

```text
60:   test("definitions carry kinds, members and the upper-case export rule; imports keep aliases", async () => {
61:     const result = await Effect.runPromise(CodeIndexTreeSitter.extract("helpers/helpers.go", SOURCE, "go"))
62:     const by = Object.fromEntries(result.definitions.map((item) => [item.qualified, item]))
```

Linhas 83–85 · trecho SHA-256 `9e7545254a9a03b783f19fae3504a50ff4a2f16e2a67a7f4dcf8402d676740e7`:

```text
83:   test("a path under the importing file's module resolves to the package's first non-test file", async () => {
84:     await using dir = await tmpdir()
85:     const files: Record<string, string> = {
```

### `packages/core/test/research-toolkit/code-index-python.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `b590f715b28d1f3a93fde1829a0511dc741ea337` · SHA-256 `35257d6d995914fdeb69f18166a39080d38ead1ac36fbca6c72465836894d5c5` · 1370 bytes.

Linhas 6–8 · trecho SHA-256 `b4b54c4c1f96ce3c89a9be3d487670ef2fd849c682fe22c203f72c2f1d235e21`:

```text
6:   test("the arguments pin the version, name the shard's directory and write to the host's output", () => {
7:     expect(CodeIndexPython.args({ project: ".", output: "/s/index.scip" })).toEqual([
8:       "index", "--quiet", "--project-name", "root", "--project-version", "0", "--output", "/s/index.scip",
```

Linhas 13–15 · trecho SHA-256 `311c2baa19d6a4b276bdf8b4f0717d7b2dfca23b23401020e40a315464dcd66a`:

```text
13:   test("a module's __init__ symbol is not a stored definition, and a function or class is", () => {
14:     expect(CodeIndexPython.indexable("scip-python python demo 0 `pkg.core`/__init__:")).toBe(false)
15:     expect(CodeIndexPython.indexable("scip-python python demo 0 `pkg.core`/compute().")).toBe(true)
```

### `packages/core/test/research-toolkit/code-index-resolve.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `cf207199f4ccbf7862fbe0314ae9a1208e5bb6b0` · SHA-256 `868598c30f99139eaab361d95b975d655fa3b610535cb705cfb6945527872853` · 5144 bytes.

Linhas 41–43 · trecho SHA-256 `93b6bd8d581e394c43f867f0d9d583f73727a43d7b52d5d5f7fa132f6e6019db`:

```text
41:   test("TypeScript specifiers resolve to every kind, none dropped", async () => {
42:     await using dir = await fixture()
43:     const resolver = await Effect.runPromise(CodeIndexResolve.make(dir.path))
```

Linhas 62–64 · trecho SHA-256 `199d108b85a019b3ad453fdc26e8532da9a41a083d45bb165f62a8fbd44a676e`:

```text
62:   test("paths come from the nearest tsconfig's extends chain", async () => {
63:     await using dir = await fixture()
64:     await fs.writeFile(path.join(dir.path, "packages/app/tsconfig.json"), JSON.stringify({ extends: "../../tsconfig.base.json" }))
```

Linhas 69–71 · trecho SHA-256 `63b8f50d8ce3568efe865a538dbc8c0dd5f3ef8c0ba7f44d4defda00bdfca217`:

```text
69:   test("Python resolves by package roots, src layout first, and relative dots", async () => {
70:     await using dir = await fixture()
71:     const resolver = await Effect.runPromise(CodeIndexResolve.make(dir.path))
```

Linhas 81–83 · trecho SHA-256 `87523a71a5304248ae6c9881cf1af8adde6cfb73fa25facacccf51915a20f265`:

```text
81:   test("this repository's own aliases and workspace exports resolve", async () => {
82:     const root = path.resolve(import.meta.dirname, "../../../..")
83:     const resolver = await Effect.runPromise(CodeIndexResolve.make(root))
```

### `packages/core/test/research-toolkit/code-index-rust.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `3cd914ecdfbfb95edcc5b726887df31e3ac7da4b` · SHA-256 `a5ada0a8d7b636a3c88cc608f3aeb85ad37b696a62ca6a42c2da7098f849ce3e` · 4711 bytes.

Linhas 41–43 · trecho SHA-256 `6e60b1b52f0f85f70d8cf5cab75f14d22aa09c20196156a06ced51f5ad0018c5`:

```text
41:   test("rust-analyzer indexes the crate root into the host's output, with cargo offline", () => {
42:     expect(CodeIndexRust.args("/s/index.scip")).toEqual(["scip", ".", "--output", "/s/index.scip", "--exclude-vendored-libraries"])
43:     expect(CodeIndexRust.ENV).toEqual({ CARGO_NET_OFFLINE: "true" })
```

Linhas 49–51 · trecho SHA-256 `6039c23c6372fc1aa120549fd91d6cba22b26106ec62bd23dbb7480f4572c6a3`:

```text
49:   test("definitions carry kinds, members and the pub export rule; imports keep the names they bind", async () => {
50:     const result = await Effect.runPromise(CodeIndexTreeSitter.extract("src/lib.rs", SOURCE, "rust"))
51:     const by = Object.fromEntries(result.definitions.map((item) => [item.qualified, item]))
```

Linhas 71–73 · trecho SHA-256 `890b8aee7ca842b2bc27deff905005e616bb45a5f57715f44e69e3a8b5194878`:

```text
71:   test("crate, self and super paths resolve to the module file they name; other crates are packages", async () => {
72:     await using dir = await tmpdir()
73:     const files: Record<string, string> = {
```

### `packages/core/test/research-toolkit/code-index-scip-encoding.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `72dfcf7b6b82f3755923e9ab81898b15e9e33f06` · SHA-256 `84837ea6b1f329ed10c6abdbaa4d8206f15ad113584ab5a3ef8bf0f841e062cf` · 3163 bytes.

Linhas 31–33 · trecho SHA-256 `2a9502cdbec3fb6ce4aeb2d83082a685f3bb4aaf1a12dbf04685b2f54f960c3b`:

```text
31:   test("scip-go's undeclared UTF-8 byte offsets are converted against the Go source line", async () => {
32:     await using dir = await tmpdir()
33:     const file = await dump(dir.path, "scip-go", { path: "main.go", range: [3, 40, 48] })
```

Linhas 38–40 · trecho SHA-256 `99ce0d429eb6dc8ca789e2d29298f4bb2697b4d3484150566c11d5db3e60232d`:

```text
38:   test("rust-analyzer's declared UTF-8 offsets are converted, an astral character counting two units", async () => {
39:     await using dir = await tmpdir()
40:     const file = await dump(dir.path, "rust-analyzer", {
```

Linhas 46–48 · trecho SHA-256 `87b63f01846509ad8b30463f778fd4aa849a1326fa1efc0fc244f228b3fd68db`:

```text
46:   test("UTF-32 offsets convert from the dump's own text, and UTF-16 offsets stay as emitted", async () => {
47:     await using dir = await tmpdir()
48:     const utf32 = await dump(dir.path, "utf32", { path: "src/lib.rs", range: [1, 35, 44], encoding: PositionEncoding.UTF32CodeUnitOffsetFromLineStart, text: RUST })
```

### `packages/core/test/research-toolkit/code-index-structural.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `f690e5191ffde128804ed6550183918273834f1d` · SHA-256 `60e1481b763e8740c47129ef35f661e887f8f98b92a516035ea4df80959739e8` · 6494 bytes.

Linhas 30–32 · trecho SHA-256 `94b02caed3b504852911d03f9ac6ca3060723e633175bc91dab0253760f6eeb4`:

```text
30:   test("a missing toolchain or indexer maps the language to the structural indexer, naming why", () => {
31:     const blocked = (language: string) => `blocked:${language}`
32:     expect(CodeIndexExtract.structural(PRECISE, (command) => `/usr/bin/${command}`, blocked)).toEqual(PRECISE)
```

Linhas 46–48 · trecho SHA-256 `88ae142d72e727e897ed5597af76d27148988cd9d67c9d6a6ce39ac1342b1203`:

```text
46:   it.live("a structural shard answers definitions and imports with a named, incomplete basis", () =>
47:     Effect.gen(function* () {
48:       const repo = yield* temporary("code-index-structural-")
```

### `packages/core/test/research-toolkit/code-index-toolkit.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `19a2c8aeb7409ed5b0f961b9c953525f3f408f84` · SHA-256 `75ed5e2db86795b00569982cdfb973b864cbad34c4616b6d710b979a7d211ef3` · 2843 bytes.

Linhas 18–20 · trecho SHA-256 `9441d7b4b4327c371121af7bf43855cf19ab5b371757a9ca88d954777fee189c`:

```text
18:   test("a configured limit lowers its cap and never raises it", () => {
19:     expect(ResearchToolkit.caps()).toEqual(ResearchToolkit.Limits)
20:     const lowered = ResearchToolkit.caps({ indexer_bytes: 512 * 1024 * 1024, probe_bytes: 64 * 1024 * 1024 })
```

Linhas 29–31 · trecho SHA-256 `de0e416419b38aa43f4a5313ca95be5dea762c87b34deb785d00637f8c87b0cc`:

```text
29:   it.live("plans one absent scip-typescript shard per TypeScript project at HEAD", () =>
30:     Effect.gen(function* () {
31:       const repo = yield* Effect.acquireRelease(
```

### `packages/core/test/research-toolkit/code-index-tree-sitter.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `30e690998f46e33e780f39d1aedc908afd819a95` · SHA-256 `fac2770b3cc7f4de7e9bc64271a747da09ad92b5f5b007dea39a8a6b39fddd4d` · 5189 bytes.

Linhas 37–39 · trecho SHA-256 `ee5c8362cf6a32d4c8fe72ded2750e4879942d5df49924671207a3f157c71df4`:

```text
37:   test("definitions carry closed 1-based ranges, name lines, containers and export state", async () => {
38:     const result = await run("a.ts", SOURCE, "typescript")
39:     const by = Object.fromEntries(result.definitions.map((item) => [item.qualified, item]))
```

Linhas 58–60 · trecho SHA-256 `b5df572344af3da3c47504bcf8bc426d0aa7dc2e8b8be4a4dbd1bb182d7b1065`:

```text
58:   test("imports keep specifier, line and form, re-exports and dynamic imports included", async () => {
59:     const result = await run("a.ts", SOURCE, "typescript")
60:     expect(result.imports).toEqual([
```

Linhas 69–71 · trecho SHA-256 `36db8a8ee3efa417f3a5355fbd61d303d4b28ce9e8e71c8bf563e2a66c74352c`:

```text
69:   test("tsx parses JSX components", async () => {
70:     const result = await run("v.tsx", `export function View() {\n  return <div>{1}</div>\n}\n`, "tsx")
71:     expect(result.definitions).toEqual([
```

Linhas 76–78 · trecho SHA-256 `e6edafb37fe4776bf1deb7006a1736ab705bd2b7b5c56af90d820524913b659c`:

```text
76:   test("python definitions, members and relative imports", async () => {
77:     const source = `import os, a.b as ab\nfrom .pkg import x, y as z\n\nCONST = 1\n\n@dec\nclass C:\n    attr = 3\n    def m(self):\n        def n(): pass\n\ndef _h(): pass\n`
78:     const result = await run("m.py", source, "python")
```

Linhas 93–95 · trecho SHA-256 `262c4c9685991f2d7024982451a5736e04da104b2db0190e2953423e7dfaa19c`:

```text
93:   test("a file over the byte cap is reported, never parsed and never thrown", async () => {
94:     const result = await run("big.ts", `// ${"x".repeat(CodeIndexTreeSitter.MAX_BYTES)}\n`, "typescript")
95:     expect(result.coverage).toEqual({ complete: false, reason: "too-large" })
```

Linhas 99–101 · trecho SHA-256 `3401f244b5aee2afa505f427d514b5ea73005eb14ff5879a7630b22cd27cf871`:

```text
99:   test("a syntax error keeps what parsed but never certifies coverage", async () => {
100:     const result = await run("bad.ts", `export function ok() {}\nexport const = ;\n`, "typescript")
101:     expect(result.coverage).toEqual({ complete: false, reason: "partial-parse" })
```

## E46 — Contratos de evidência/budget/probes — NÃO EXECUTADOS

### `packages/core/test/research-allowance.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `0925c03cdf252fe2ae8338c6f31e6d6be172f876` · SHA-256 `4eec8c9322095c6c6f8b33a9f74ea6655400ff332678c90da62f2e9aad9edc2b` · 17963 bytes.

Linhas 38–40 · trecho SHA-256 `9e376d50b51620fa1d39907d62c99a9295c6aa364ce13e5baff05b3794766295`:

```text
38:   it.live("concurrent exact bind and charge retries admit one row; changed input conflicts", () => Effect.gen(function* () {
39:     const service = yield* ResearchAllowance.Service
40:     const native = binding()
```

Linhas 55–57 · trecho SHA-256 `bc5334707bbb78949c6d991e2025dca1f3386fc96c54f90ca494c81ba4d1b280`:

```text
55:   it.live("used reads one dispatch's spend of one kind from the ledger charge checks", () => Effect.gen(function* () {
56:     const service = yield* ResearchAllowance.Service
57:     const native = binding()
```

Linhas 72–74 · trecho SHA-256 `279d3b0f17c746a48dce58a10b0b7bbe106837ba98fe3cf68e9346b12d530e06`:

```text
72:   for (const kind of ["provider", "tool"] as const) it.live(`${kind} concurrent native transactions stop at exact ceiling and return typed exhaustion`, () => Effect.gen(function* () {
73:     const service = yield* ResearchAllowance.Service
74:     const allowance = yield* service.bind(binding(), "dispatch")
```

Linhas 90–92 · trecho SHA-256 `0d413d3fe90ebb76c9faac70f6773a2d395d3bda9e057f768f416f2b7f5168a4`:

```text
90:   it.live("byte reservations race one allowance; repeated and uncertain reconciliation never refunds", () => Effect.gen(function* () {
91:     const service = yield* ResearchAllowance.Service
92:     const allowance = yield* service.bind(binding(), "dispatch")
```

Linhas 110–112 · trecho SHA-256 `de187ffea2b16b51338e19bf2b630e8c9c7e4366506d6b0d6eaa1122029d9cb6`:

```text
110:   it.live("missing allowance, invalid charge, corrupt row and SQL failure cannot yield success", () => Effect.gen(function* () {
111:     const service = yield* ResearchAllowance.Service
112:     const allowance = yield* service.bind(binding(), "dispatch")
```

Linhas 129–131 · trecho SHA-256 `bf4e0482a55612f5129d156d432d26a6af1b3db305d839ac5d49e5d90cd44a58`:

```text
129:   it.live("file-backed allowance survives connection closure, snapshot maintenance and same dispatch retry", () => Effect.gen(function* () {
130:     const directory = yield* Effect.acquireRelease(Effect.promise(tmpdir), (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()))
131:     const native = binding()
```

Linhas 165–167 · trecho SHA-256 `7123795f06e8dbaad678373a4b07197bce35eb264b6a11e970a8fbf014dc8daa`:

```text
165:   it.live("each effort tier binds its owner-approved limits and deadline; absent tier is quick", () => Effect.gen(function* () {
166:     const service = yield* ResearchAllowance.Service
167:     const expected = {
```

Linhas 184–186 · trecho SHA-256 `309c0b0d4c89a257067e28ff8c3d8fb31184caf9b51bc0968f0c398d161497ad`:

```text
184:   it.live("an unknown tier is refused before any binding row", () => Effect.gen(function* () {
185:     const service = yield* ResearchAllowance.Service
186:     for (const tier of ["max", "toString", ""]) {
```

Linhas 194–196 · trecho SHA-256 `7dc7c0042807f691ba7db1546df2de406bf2589c82e3bdbb706e195b40578636`:

```text
194:   it.live("an admitted tier cannot be raised by re-binding or by a widened allowance", () => Effect.gen(function* () {
195:     const service = yield* ResearchAllowance.Service
196:     const native = binding()
```

Linhas 205–207 · trecho SHA-256 `001d1ad8d91d37919251a34b19873cd26fd7217f11980a266b67b8c935bf1738`:

```text
205:   for (const tier of ["focused", "deep"] as const) it.live(`${tier} provider and tool charges exhaust at the ${tier} limit`, () => Effect.gen(function* () {
206:     const service = yield* ResearchAllowance.Service
207:     const allowance = yield* service.bind(binding(), "dispatch", tier)
```

Linhas 219–221 · trecho SHA-256 `912b9a28413e5f49e4c244c7182c7cd4ed75e6b8e993b20f13c7c7d0a7f02e39`:

```text
219:   it.live("each tier binds its probe seconds, and probe charges exhaust there with the named error (J1.10)", () => Effect.gen(function* () {
220:     const service = yield* ResearchAllowance.Service
221:     for (const tier of ["quick", "focused", "deep"] as const) {
```

Linhas 232–234 · trecho SHA-256 `743d99b42b3f2abdaf824582e7ef2b25088c2264872afbf1c3ca8767f16e6494`:

```text
232:   it.live("a focused dispatch admitted before probe seconds keeps its stored limit on re-bind", () => Effect.gen(function* () {
233:     const service = yield* ResearchAllowance.Service
234:     const database = yield* Database.Service
```

Linhas 246–248 · trecho SHA-256 `c8ffb040eb20c8046ec0a913f3f983d1066f0872bf3c61f5a872127c05790ce4`:

```text
246:   it.live("a version 1 binding admitted before tiers decodes as quick and re-binds unchanged", () => Effect.gen(function* () {
247:     const service = yield* ResearchAllowance.Service
248:     const database = yield* Database.Service
```

### `packages/core/test/research-artifacts.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `31ae551a9de42954c9f06984eeecba98b725eb77` · SHA-256 `47960eef80bbae8f9aad0254f15c5278dcb5ff9e319c3a8cb74acf4303231810` · 10671 bytes.

Linhas 15–17 · trecho SHA-256 `53ea05654aaa9ec490618507b4f96ecfa42ed0d5714c5bbb57fb576410102be4`:

```text
15:   it.live("stable publication intent preserves original metadata; pre-ledger variant retry conflicts", () => researchFixture((fixture) =>
16:     Effect.gen(function* () {
17:       const artifacts = yield* ResearchArtifacts.Service
```

Linhas 40–42 · trecho SHA-256 `75bbc87062d8c2b604f755f0db0848a57ab4c2b35df4f4436ee6114c50c44f15`:

```text
40:   it.live("file-before-event recovery uses stable operation; a file/ref alone grants no read", () => researchFixture((fixture) =>
41:     Effect.gen(function* () {
42:       const artifacts = yield* ResearchArtifacts.Service
```

Linhas 65–67 · trecho SHA-256 `73e75eed93123ae613381aa1c57dc2002d0e3f95ad0c3f33fffae094b6311fdc`:

```text
65:   it.live("UTF-8 pages remain <=16KiB and exact; cursor cannot select another admitted artifact", () => researchFixture((fixture) =>
66:     Effect.gen(function* () {
67:       const records = yield* ResearchRecords.Service
```

Linhas 94–96 · trecho SHA-256 `0bca5b840b05f88769ac21927f825c18e920a5323ba2fafd2ed8245e23243430`:

```text
94:   it.live("old captures retain task lifetime; corrupt/missing bytes and symlinked roots are unavailable", () => researchFixture((fixture) =>
95:     Effect.gen(function* () {
96:       const records = yield* ResearchRecords.Service
```

Linhas 115–117 · trecho SHA-256 `22dc0b7d98d2dec577a0cea0c810ef4d48df6d221f15cafad054c4e61ced31cf`:

```text
115:   it.live("unsupported binary is retained without replacement decoding; oversized bytes fail before authorization/publication", () => researchFixture((fixture) =>
116:     Effect.gen(function* () {
117:       const records = yield* ResearchRecords.Service
```

Linhas 130–132 · trecho SHA-256 `3aecf3c31031c29f90efa295eb7f4ccebe59082af30d3458f44e10a5c0cbb92d`:

```text
130:   it.live("explicit host task removal deletes owned artifacts and makes retained receipts unavailable", () => researchFixture((fixture) =>
131:     Effect.gen(function* () {
132:       const records = yield* ResearchRecords.Service
```

### `packages/core/test/research-binding.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a0bed7ab69d086b18cd4e921e477a9b35a0ed4a9` · SHA-256 `3fc62da977ccf97ebd3fa989448432f44f8dcd861c06e831756b2ad050a45db5` · 8564 bytes.

Linhas 95–97 · trecho SHA-256 `143b08ba44b4a60c44af4a46ec2c869f9f12b3dcab09ec08d88019e2ea1c7afa`:

```text
95:   it.live("retained child binding and actual invocation admit; missing frame and forged claims fail", () => researchFixture((fixture) =>
96:     Effect.gen(function* () {
97:       const valid = yield* callFrame(fixture.binding, fixture.context, ResearchBinding.require(fixture.binding, fixture.context))
```

Linhas 109–111 · trecho SHA-256 `3ff4640f030c88b6ebdfb107c4c0bb07614bd3df92b05045f8e3b5a685da1835`:

```text
109:   it.live("caller seat/label cannot substitute for retained native owner; deleted Session loses access", () => researchFixture((fixture) =>
110:     Effect.gen(function* () {
111:       const database = yield* Database.Service
```

### `packages/core/test/research-inquiry-ledger.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `25743a3cdea9e2191146694dfdb9c9fe41e44577` · SHA-256 `5a50187b432fe80d8c07ed712c27f419c7af026263512ee81912eea04e71d0d9` · 6648 bytes.

Linhas 20–22 · trecho SHA-256 `48fc2d59c4578ed62276f7808cbdd1b379215426a6b112ee1d519d7c709e5aa2`:

```text
20:   it.live("a dispatch opens and closes its inquiry once; exact retries replay and nothing follows a close", () => researchFixture((fixture) =>
21:     Effect.gen(function* () {
22:       const records = yield* ResearchRecords.Service
```

Linhas 55–57 · trecho SHA-256 `f2046340b512fc0f3ca6bfbbbccb6992c66e659d66940a728731921cbb24b87a`:

```text
55:   it.live("original-file lines resolve through the captured span's first line (J5.3)", () => researchFixture((fixture) =>
56:     Effect.gen(function* () {
57:       const records = yield* ResearchRecords.Service
```

Linhas 71–73 · trecho SHA-256 `beaf98db6bce79a4a7c71487bb22e549416881261958f7312619c34e43931d7b`:

```text
71:   it.live("a code_locate snapshot resolves original lines inside one of its ranges", () => researchFixture((fixture) =>
72:     Effect.gen(function* () {
73:       const records = yield* ResearchRecords.Service
```

### `packages/core/test/research-locate.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `53aed544518715b880e3415295e94da7756cc9ad` · SHA-256 `ef4ff4e93af664f8810da34386b235ef33071fcbba9868bf9904aa40f72f801a` · 8418 bytes.

Linhas 67–69 · trecho SHA-256 `c8523ab721ceb9ea9895796203d593f7ef6d135ad331d26d917cdf70216314dc`:

```text
67:   test("fuses a definition and a lexical hit inside it into one verified range", async () => {
68:     const fake = sources()
69:     const result = await run({ symbols: ["assemble"], terms: ["citationCheck"] }, fake.value)
```

Linhas 83–85 · trecho SHA-256 `42c78697aeba6cdc722c5b0b64574333ae27b447eee5a2f22de2a8977e13d90b`:

```text
83:   test("drops a range whose hit no longer matches the current file and counts it", async () => {
84:     const stale: Record<string, string> = { ...FILES, "src/check.ts": ["export function renamed(x: number) {", "  return x", "}"].join("\n") }
85:     const result = await run({ terms: ["citationCheck"] }, sources({ read: (path) => Effect.succeed(stale[path]) }).value)
```

Linhas 90–92 · trecho SHA-256 `8d656171e9bbdb5fe86cd1f3c9237fb4ebffc5fddb9c4b4dd1aabe5af6f5de0e`:

```text
90:   test("drops a definition whose name is not on its declared line", async () => {
91:     const moved: Record<string, string> = { ...FILES, "src/assemble.ts": ["", "", "", "export function assemble() {", "}"].join("\n") }
92:     const fake = sources({ read: (path) => Effect.succeed(moved[path]), search: () => Effect.succeed({ matches: [], basis: basis() }) })
```

Linhas 98–100 · trecho SHA-256 `4601f8743cd7ad4a16fc7bf64b7465a5c8ce8085d96b3b3924c3c598e3f0f4ae`:

```text
98:   test("runs at most 32 searches per call", async () => {
99:     const fake = sources()
100:     const names = Array.from({ length: 16 }, (_, index) => `name${index}`)
```

Linhas 107–109 · trecho SHA-256 `7b10814512af845db9d31ca3703d12607630c13b11adf7bb2b5673235b8a773e`:

```text
107:   test("without an index runs the lexical lists only and declares the languages it reached", async () => {
108:     const result = await run({ symbols: ["assemble"] }, sources({ query: undefined }).value)
109:     expect(new Set(result.searches.map((search) => search.kind))).toEqual(new Set(["lexical", "lexical-wide"]))
```

Linhas 116–118 · trecho SHA-256 `7a19b65f1c9df3947d4e1ec4a40a5bd2f40cfcb431b7f70ed3dfa4f3fc83e642`:

```text
116:   test("an index still building degrades to the lexical lists", async () => {
117:     const fake = sources({ query: () => Effect.fail(new Research.Error({ code: "index_building", message: "building" })) })
118:     const result = await run({ terms: ["assemble"] }, fake.value)
```

Linhas 123–125 · trecho SHA-256 `363ebce1b714299b2a0419561e5e8d9635241a480fc225ecfd5e13d637b4c8e5`:

```text
123:   test("fails with index_unavailable when ripgrep is unavailable", async () => {
124:     const fake = sources({ search: () => Effect.fail(new Research.Error({ code: "index_unavailable", message: "no ripgrep" })) })
125:     expect((await Effect.runPromise(Effect.flip(Locate.run({ terms: ["assemble"] }, fake.value)))).code).toBe("index_unavailable")
```

Linhas 128–130 · trecho SHA-256 `850a5a8c7b0a62f0f90d2ccbc289dc6ea13aa798ae54f43e3066034fbff4717d`:

```text
128:   test("refuses a call with no question, terms or symbols", async () => {
129:     expect((await Effect.runPromise(Effect.flip(Locate.run({ paths: ["src/**"] }, sources().value)))).code).toBe("unsupported")
130:   })
```

Linhas 132–134 · trecho SHA-256 `bee59220b08590f04728c34a83a717eed2deb7af238c4c346da2817cbf42f4d1`:

```text
132:   test("keeps at most 3 ranges per file and honours limit", async () => {
133:     const many: Record<string, string> = { "src/a.ts": Array.from({ length: 80 }, (_, index) => index % 10 === 0 ? "needle" : "x").join("\n") }
134:     const fake = sources({ query: undefined }, many)
```

Linhas 139–141 · trecho SHA-256 `579e9370460e47c0d352bc153077421d2ea8876e4f27b9eccd6d2f95a17d50d7`:

```text
139:   test("extracts identifiers, paths, quoted strings and content words from a question", () => {
140:     const terms = Locate.extract('Where does citationCheck in O/maestro/discovery-result.ts handle "retained source" and max_bytes for read-dedup?')
141:     expect(terms).toEqual(expect.arrayContaining(["citationCheck", "O/maestro/discovery-result.ts", "retained source", "max_bytes", "read-dedup", "handle"]))
```

### `packages/core/test/research-probe-units.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `6ccd6d8718c8ffdee26279aef39e25a2dc479b05` · SHA-256 `a0acf57278b74d352af8448be69dff6d7c6a9ac214007301ddd436f1e79d87c4` · 7284 bytes.

Linhas 12–14 · trecho SHA-256 `c7e157e97f641bf1af0b3a2d755ef7d7382d197e22377350930c8356eba20ba6`:

```text
12:   test("drops git, node and guard switches and secrets; pins git to no config, prompt or locks", () => {
13:     const env = ResearchProcess.environment({
14:       PATH: "/usr/bin", GIT_DIR: "/elsewhere", GIT_ASKPASS: "x", NODE_OPTIONS: "--require evil", NODE_PATH: "/x",
```

Linhas 27–29 · trecho SHA-256 `b1663cca24c3341a3ee6ac3cadc740171cd159a091bdb96bf89d747ca6293aed`:

```text
27:   test("tsc plain lines become diagnostics in original coordinates, with continuations", () => {
28:     const output = [
29:       "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
```

Linhas 44–46 · trecho SHA-256 `e5db18385f6f889324922d887a2b64a7c70eef448a9be66ee7ada6df53525128`:

```text
44:   test("causes reduce repeated errors to one line each and name the missing pieces (diagnose-red)", () => {
45:     const at = (code: string, message: string, file = "src/a.ts") => ({ path: file, line: 1, column: 1, code, message })
46:     const lines = ProbeTypecheck.causes([
```

Linhas 62–64 · trecho SHA-256 `b184211624fab69d6896e41226cb036a4a9b8a6f176fe8e9a901050eb8623d29`:

```text
62:   test("unused: true adds the compiler's unused checks to a fixed argv", () => {
63:     const base = { node: "/bin/node", tsc: "/p/tsc", project: "tsconfig.json", heapMiB: 1024 }
64:     expect(ProbeTypecheck.argv(base)).toEqual(["/bin/node", "--max-old-space-size=1024", "/p/tsc", "-p", "tsconfig.json", "--noEmit", "--pretty", "false"])
```

Linhas 106–108 · trecho SHA-256 `0f8d1fa3b5e8911af2df2bf73739a1557c256833e83459a58ff8380cf0de5ca9`:

```text
106:   test("the nearest config picks the test runner; two configs in one directory are ambiguous", async () => {
107:     await using dir = await tmpdir()
108:     await mkdir(path.join(dir.path, "pkg", "test"), { recursive: true })
```

### `packages/core/test/research-probe.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `92f668b9b22842f2210103138cbdb7a95fa4c3a5` · SHA-256 `8b68cb18e71ba3291b86e2943b754ae701bb4f9ed8db0be059aaca3e57935bfb` · 10594 bytes.

Linhas 51–53 · trecho SHA-256 `da292e88310dc681882028d796b2b6b7535dc0216acd1495b80bb4fbc0e81343`:

```text
51: live("typecheck on a commit snapshot reproduces the planted error in original coordinates; the fixed worktree does not", () =>
52:   Effect.gen(function* () {
53:     expectSpawn(import.meta.path)
```

Linhas 71–73 · trecho SHA-256 `876dc156ffdfffc6e5e62c828aaf177b1f2566b3d37dce4ee6c780de34b91283`:

```text
71: live("unused: true proves an unused symbol with TS6133 (T-P3)", () =>
72:   Effect.gen(function* () {
73:     expectSpawn(import.meta.path)
```

Linhas 84–86 · trecho SHA-256 `6faca7b202cdd80335ced89c5babfab2a873248b37ae460cd497a2698579b94a`:

```text
84: live("a script cannot reach the network from the jail", () =>
85:   Effect.gen(function* () {
86:     expectSpawn(import.meta.path)
```

Linhas 104–106 · trecho SHA-256 `31847b20b2102743e4af06dc639cbe191ae861a609e4bb0df757abb26abdb70f`:

```text
104: live("a script cannot write outside the scratch: the original worktree is unchanged", () =>
105:   Effect.gen(function* () {
106:     expectSpawn(import.meta.path)
```

Linhas 116–118 · trecho SHA-256 `182ab5deef392ce9f178031732efa73c0d1c084167871820eae2a83daa2b4c93`:

```text
116: live("a repository test guard yields blocked_by_repo_guard; the host hands the child neither CI nor ORCHESTRA_LOCAL_TESTS", () =>
117:   Effect.gen(function* () {
118:     expectSpawn(import.meta.path)
```

Linhas 135–137 · trecho SHA-256 `9c5aa9e28d64b4200c4f69af87cc97c299e96a8181a4fe3b2f7d816c145768a9`:

```text
135: live("the timeout stops the probe and names it", () =>
136:   Effect.gen(function* () {
137:     expectSpawn(import.meta.path)
```

Linhas 149–151 · trecho SHA-256 `001659301652e2917ac0b1d7f3d1c80fc456965f97f4e392a6e9e3f0ef11fc57`:

```text
149: capped("a tree over the RSS cap is killed as memory_exceeded (J4.7)", () =>
150:   Effect.gen(function* () {
151:     expectSpawn(import.meta.path)
```

Linhas 162–164 · trecho SHA-256 `1f452fdf64a7958db9f3d75c71a82962e05df31f76008fb3b698b05b42a88c8c`:

```text
162: live("a second probe in the same dispatch waits, then fails busy", () =>
163:   Effect.gen(function* () {
164:     expectSpawn(import.meta.path)
```

### `packages/core/test/research-records.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `355e6b47b052251b57ee4f4dc56cfe1aee257e99` · SHA-256 `b2dda3fe95b4fdc32ed63d6e1fe06c10d1fe9e1cb50d28f373cd5dc79b4c879f` · 20826 bytes.

Linhas 23–25 · trecho SHA-256 `9ed22ab34b96b34063862127e84b38ff492c2c8560eae2492ec15132b0422c29`:

```text
23:   it.live("request preflight refuses unsettled/conflicting retries and returns only a settled historical source", () => researchFixture((fixture) =>
24:     Effect.gen(function* () {
25:       const records = yield* ResearchRecords.Service
```

Linhas 46–48 · trecho SHA-256 `27ce61eb7b80a6bdd9ab8c1bf4d2b02705eeb74804f3bfcd72785860bb881a36`:

```text
46:   it.live("acquisition outcomes replay durably and remain distinct from admitted corpus bytes", () => researchFixture((fixture) =>
47:     Effect.gen(function* () {
48:       const records = yield* ResearchRecords.Service
```

Linhas 68–70 · trecho SHA-256 `553a611d709441f29c819dbdce9dbae768a895f22814df4c16604fbb2cc305db`:

```text
68:   it.live("snapshot compaction preserves corpus and source; a fresh native process reads exact persisted refs", () => researchFixture((fixture) =>
69:     Effect.gen(function* () {
70:       const records = yield* ResearchRecords.Service
```

Linhas 134–136 · trecho SHA-256 `a2580755b9d15379f9a110a3727ad77f6e722ba62b8c3ce12873da68f978d22c`:

```text
134:   it.live("local message persist:false cannot disable research persistence; canonical identical replay returns actual receipt", () => researchFixture((fixture) =>
135:     Effect.gen(function* () {
136:       const records = yield* ResearchRecords.Service
```

Linhas 159–161 · trecho SHA-256 `c0f41cc83dca7750fdae26ae7022a672d2b865716d145a706f18977bae8a4199`:

```text
159:   it.live("two writers cannot publish same next revision; historical wording and exact relations survive", () => researchFixture((fixture) =>
160:     Effect.gen(function* () {
161:       const records = yield* ResearchRecords.Service
```

Linhas 190–192 · trecho SHA-256 `61a14311a85d1105d406f9b7e552da2f6fc4f129ebc09c514ac46b94ea99f18f`:

```text
190:   it.live("quotes detect overlapping ambiguity; exact qualifiers and line/JSON locators resolve only admitted bytes", () => researchFixture((fixture) =>
191:     Effect.gen(function* () {
192:       const records = yield* ResearchRecords.Service
```

Linhas 224–226 · trecho SHA-256 `df128cb0ca5d38dc36a6156e6ac0c2b01264cd9fa2ba1cb18c73e47f89395bb0`:

```text
224:   it.live("document keeps exact Markdown/body receipt; parser rejects unknown live citations and ignores fenced examples", () => researchFixture((fixture) =>
225:     Effect.gen(function* () {
226:       const records = yield* ResearchRecords.Service
```

Linhas 254–256 · trecho SHA-256 `9c402d8eccb60e52c3f3f2306e4ada5f059c1bfad48bf265f4c7277fa3340814`:

```text
254:   it.live("UTF-8 field/document/event caps reject before invocation or file/event effects", () => researchFixture((fixture) =>
255:     Effect.gen(function* () {
256:       const records = yield* ResearchRecords.Service
```

### `packages/core/test/research-search.test.ts`

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `4993ba8decd55d2bc8ed812e30227a67595e2f33` · SHA-256 `5d776ea45efbb391b7fefc1eb225b34e7701b0222fdacf077808019bd8fd45b6` · 5955 bytes.

Linhas 30–32 · trecho SHA-256 `af200065d8c22a7dc340cafc1715b584a610a248fb618d4f1a17bc52d738b1cf`:

```text
30:   it.live("reads a pattern that starts with a dash as a pattern, literally", () =>
31:     withTree({ "a.ts": "const flag = '--force'\nother\n" }, (cwd) =>
32:       Effect.gen(function* () {
```

Linhas 40–42 · trecho SHA-256 `3699f31ac81a69c5dd668881272e30575827515147ead03d31f242e3f0930a37`:

```text
40:   it.live("identifier mode bounds the match; literal does not", () =>
41:     withTree({ "a.ts": "parse(x)\nparseJson(x)\nreparse\n" }, (cwd) =>
42:       Effect.gen(function* () {
```

Linhas 51–53 · trecho SHA-256 `478cea91561291b78d69b5176d27631dbb578c160145e5640da3342074859ded`:

```text
51:   it.live("respects .gitignore without a git repository and declares it", () =>
52:     withTree({ ".gitignore": "gen/\n", "gen/x.ts": "needle\n", "src/y.ts": "needle\n" }, (cwd) =>
53:       Effect.gen(function* () {
```

Linhas 62–64 · trecho SHA-256 `4959c58169564e78a0951c711f9ddf17f808cb49c5ea515f70035e4ede7ce01d`:

```text
62:   it.live("narrows by paths globs and ignores case only when asked", () =>
63:     withTree({ "src/a.ts": "Needle\n", "test/b.ts": "Needle\n" }, (cwd) =>
64:       Effect.gen(function* () {
```

Linhas 74–76 · trecho SHA-256 `44209f83fd209fa354c9f76cff179fb20d04992f828bdbc48f19cd382638f834`:

```text
74:   it.live("pages deterministically and marks a cut page incomplete", () =>
75:     withTree(Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`f${n}.ts`, "hit\nhit\n"])), (cwd) =>
76:       Effect.gen(function* () {
```

Linhas 92–94 · trecho SHA-256 `bbc87b4247921b5ee49c337e0d712d8dff2fabe2fc9fb0c4c2957e35b4ab58bf`:

```text
92:   it.live("attaches context lines to the hit they surround", () =>
93:     withTree({ "a.ts": "one\ntwo\nhit\nfour\nfive\n" }, (cwd) =>
94:       Effect.gen(function* () {
```

Linhas 102–104 · trecho SHA-256 `7d9f1d460ad0a70465ff4514322040abcae05a1e85f1aaf4569b08052ee63539`:

```text
102:   it.live("a clean zero is complete; an invalid regex fails by name", () =>
103:     withTree({ "a.ts": "x\n" }, (cwd) =>
104:       Effect.gen(function* () {
```

Linhas 114–116 · trecho SHA-256 `1c239ed4e1b6dd57b589e9fb2be715c1122e7211b37f0d11588d3936c246abbe`:

```text
114:   it.live("counts binaries it skipped and truncates long lines", () =>
115:     withTree({ "bin.dat": "needle\u0000\u0001", "long.ts": `needle ${"x".repeat(2000)}\n` }, (cwd) =>
116:       Effect.gen(function* () {
```

Linhas 125–127 · trecho SHA-256 `f145e25bdc05ad0c62bcbe13727a3f4ccba5a3a4747bf553ac17f86022425862`:

```text
125:   test("builds the argv from the host: -e carries the pattern, globs come only from paths", () => {
126:     const args = CodeSearch.argv({ pattern: "-x", paths: ["src/**"] })
127:     expect(args.slice(args.indexOf("-e"))).toEqual(["-e", "-x", "--", "."])
```

