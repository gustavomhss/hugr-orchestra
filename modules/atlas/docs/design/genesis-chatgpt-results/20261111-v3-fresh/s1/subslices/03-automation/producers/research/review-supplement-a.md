# Suplemento literal research-a — RE-A1 a RE-A5

**Corpo avaliado permanece congelado:** `body.md`, SHA-256 `1213f85cf16f73feed220e8c1b33ed52b2af75afd570b154a29eaf8f99f27d73`. Este arquivo responde somente ao pedido de evidência pública encaminhado pela principal. Não contém oracle, parecer, resultado de teste ou novo aceite. As únicas transformações não literais são as projeções mecânicas explicitamente marcadas de cobertura/contagens; não são apresentadas como rows integrais.

**Leitura:** cada fonte recebe uma identidade completa na primeira ocorrência; referências seguintes usam esse mesmo ID. Intervalos são linhas originais e não contêm código reescrito. Índice e recibo: `review-supplement-a-index.json` e `review-supplement-a-receipt.json`. O histórico integral é preservado sem prefixos de linha dentro de seu bloco. Os demais blocos acrescentam apenas números de linha. A suficiência é decisão dos juízes, não deste produtor.

## RE-A1

### RA1-01 — Corpo histórico integral — 3.942 bytes

**RA-S001 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/a/bodies/research.md`**

Commit `a8df22ae3a140c58c63f62ce2a634c84f415c943` · Git blob `d7c550b41f36ba6ae001ef5f7d8c041b26854f2f` · SHA-256 `76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202` · 3942 bytes.

Linhas 1–25.

~~~markdown
# Pinned toolkits and retained research evidence

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

BackendToolkit has explicit absent/fetching/ready/failed/unsupported states, a root separated by engine version and target, and manifest-supplied engines/runtimes. `ensure` rejects an unsupported host and checks dependency ordering and host floor before acquisition. Downloaded engines use `PinnedArtifact.install`; hosted engines use the hosted lifecycle. Readiness requires installed markers, executable files, runtime executables where needed and exact host shim text. A cache marker alone is insufficient. Cross-target prefetch does not execute that target or write its host shim. [1]

`prepare` recognizes commands naming `BACKEND_TOOLKIT_BIN` engines and acquires only those engines and dependencies. The source describes a 60-second shell preparation wait while acquisition may continue; installation has its own attempt lifecycle. The README assigns lockfiles and generated entry skills to owning packs and keeps Core independent of product specialist modules. Those manifest pins and platform floor values are inputs, not evidence that an engine was downloaded or qualified on this machine. [1,2]

ResearchToolkit reuses BackendToolkit with its own root and manifest. Default owner caps are 2 GiB indexer, 1 GiB probe, 2 GiB scratch, 4 GiB index storage, eight commits and a 15-minute shard timeout; config can lower byte caps, not raise them. The default index adapter plans no shards and fails a build as unavailable, so providing the real adapter is necessary. Prewarm records building/skipped state outside the worktree, uses a host-wide file lock for indexer work and retries lock timeouts. A building status older than the shard timeout no longer claims live building. Status writes are best effort and may lose status without making the underlying index successful. `warm` also catches a planning error as an empty shard list: a no-work warm-up is therefore not proof of complete index coverage. [3]

ResearchLedger canonicalizes JSON with sorted object keys, omitted undefined fields and preserved array order. Operation identity derives from Session/message/call/action; event identity derives from execution Session and operation key. Retained entries query versioned event types within project and execution scope, decode each row and reject scope/receipt mismatches. Placement is re-resolved before reuse. A repeated operation with a different input hash or multiple matching records fails conflict. This is retained evidence identity, not a proof of the truth of admitted source text. [4]

## Normative intent and limits

The bodies establish acquisition, readiness, resource-cap and evidence-ledger boundaries. Individual engine manifests, parsers, language indexes, sandbox build adapters and research source/document validation remain owned by the corresponding toolkit/leaf families in coverage. No engine install, language server, index build, source admission or research publication was executed. “Ready” here describes the source predicate, not a current host observation.

## Source anchors

- **1.** `packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — state, prepare, acquire and readiness, lines 17–107,108–179,180–279.
- **2.** `packages/core/src/backend-toolkit/README.md:a7efc8b49f165ad767f51cb49ad9bdbb220215d1` — pack ownership, lockfiles and generated entry skills, lines 1–24.
- **3.** `packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — caps, adapter boundary, prewarm and shard status, lines 15–107,150–218,220–300.
- **4.** `packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` — canonical identity, retained scope and replay, lines 30–84,145–157.
~~~

### RA1-02 — A3: supported, quatro inputs e 39/38 folhas retidas

**RA-S041 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a3-v1-dossier.md`**

Commit `a8df22ae3a140c58c63f62ce2a634c84f415c943` · Git blob `285e56c1680153ce75c71fd99bcf9455bde70d4d` · SHA-256 `36416073165d59eec9c7d847a26f414d855cc2a40758d548f4dd49669dccc5d4` · 177076 bytes.

Linhas 225–251.

```text
225:   "key": "s1.core.research",
226:   "title": "Pinned toolkits and retained research evidence",
227:   "layer": 1,
228:   "need": "component",
229:   "body": {
230:     "path": "producers/a/bodies/research.md",
231:     "encoding": "utf-8",
232:     "byte_length": 3942,
233:     "sha256": "76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202"
234:   },
235:   "authority": {
236:     "scope": "orchestra.s1",
237:     "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
238:     "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
239:   },
240:   "validity": "supported",
241:   "gaps": [
242:     "Toolkit manifests, index adapters and individual research validators need leaf inspection for operation-specific changes.",
243:     "No engine availability or platform qualification was measured."
244:   ],
245:   "input_keys": [
246:     "file:packages/core/src/backend-toolkit/index.ts",
247:     "file:packages/core/src/backend-toolkit/README.md",
248:     "file:packages/core/src/research-toolkit/index.ts",
249:     "file:packages/core/src/research/ledger.ts"
250:   ],
251:   "build_dependencies": []
```

Linhas 431–442.

```text
431: ### `s1.core.research` — `component`
432: 
433: Corpo congelado: `bodies/research.md`, SHA256 `76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202`. Validade original: `supported`.
434: 
435: **Gaps originais, verbatim:**
436: 
437: - Toolkit manifests, index adapters and individual research validators need leaf inspection for operation-specific changes.
438: - No engine availability or platform qualification was measured.
439: 
440: **Inputs originais:** `file:packages/core/src/backend-toolkit/index.ts`, `file:packages/core/src/backend-toolkit/README.md`, `file:packages/core/src/research-toolkit/index.ts`, `file:packages/core/src/research/ledger.ts`.
441: 
442: **Explicitação nova nesta revisão:** Acquisition/readiness e identidade de pesquisa retida. Ler manifests/adapters/validators antes de usar algoritmos específicos; no-work após erro e adapter vazio não comprovam índice.
```

Linhas 485–499.

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

Linhas 587–601.

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

### RA1-03 — A4: população, profundidades e limite de verificação

**RA-S042 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/review-packets/l1-a4-v1-dossier.md`**

Commit `a8df22ae3a140c58c63f62ce2a634c84f415c943` · Git blob `6f872ea0e22097d8084fd587f585751a436f607e` · SHA-256 `83b544ac46f99b2bf3585ff4e607bcd403e49eb20dd128deb5b6a029a772ead0` · 155061 bytes.

Linhas 269–269.

```text
269: | backend-toolkit | 59 | `s1.core.research` |
```

Linhas 289–289.

```text
289: | research | 71 | `s1.core.research` |
```

Linhas 299–301.

```text
299: Decisive implementation/control-flow and normative reads back the claims actually made in the other bodies. An unread substantive implementation is explicitly classified `representative_family_boundary`, never silently converted to support or semantic acceptance. Exact operation-specific leaf behavior remains a deeper-read obligation. This bounded L1 grouping covers the entry, authority and lifecycle questions; it does not certify every line of every member.
300: 
301: Historical migrations retain compatibility authority under the inspected migration engine. Generated schema/export/support files remain tied to their generators and owning contracts. The vendored Copilot family remains an upstream compatibility boundary. Tests, fixture trees, assets and harnesses have grouped validation disposition; their existence proves no executed result. Runtime pins and bundled text are change-sensitive inputs even when their leaf content is not interpreted here. Historical phase plans, runtime-closure qualification documents and old V2 sketches are retained as historical/normative inputs to compare with current code, never promoted by filename to current behavior or a fresh PASS. [1,3]
```

Linhas 309–313.

```text
309: ## Verification boundary and open work
310: 
311: Performed: connector capture, canonical Git-object/SHA-256/size checks, source inspection, line-anchor reconciliation, per-entry population reconciliation and artifact/excerpt binding checks. No product tests, provider calls, shell tools inside Orchestra, database migrations, external mutations, remote commits or Atlas publication were performed. The producer's local Python only processed evidence and authored this transport fragment. Hash validity is not semantic acceptance; independent judges and principal packaging are separate steps.
312: 
313: Unresolved limits include runtime/OS qualification, unread leaf-specific semantics, native engine/provider boundaries outside Core, historical document reconciliation beyond the cited conflicts, and the observed implementation gaps called out per body. All source-reading status remains visible. This unit is a source-supported L1 candidate, not an accepted complete S1 delivery or live Atlas publication.
```

### RA1-04 — Projeção histórica: contagens e validade literais

**RA-S043 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/revisions/a-l1-evidence-v1/coverage-needs-projection.json`**

Commit `a8df22ae3a140c58c63f62ce2a634c84f415c943` · Git blob `2e91d0f916dfa95a2dd0ef7ae74ff8c1bb427045` · SHA-256 `05485c4bd0ac9c76814e44537788818bbcf1fbcbfb87dd8063ce30bf1a67e0cf` · 726892 bytes.

Linhas 12954–12961.

```text
12954:         "family": "backend-toolkit",
12955:         "population_count": 59,
12956:         "artifact_keys": [
12957:           "s1.core.research"
12958:         ],
12959:         "read_source_paths": [
12960:           "packages/core/src/backend-toolkit/README.md",
12961:           "packages/core/src/backend-toolkit/index.ts"
```

Linhas 13013–13025.

```text
13013:       "derived_counts": {
13014:         "by_depth": {
13015:           "decisive_source_read": 2,
13016:           "grouped_generated_contract": 1,
13017:           "grouped_support_contract": 4,
13018:           "grouped_validation_inventory": 13,
13019:           "representative_family_boundary": 39
13020:         },
13021:         "by_read_status": {
13022:           "not_read": 57,
13023:           "semantically_read_decisive_ranges": 2
13024:         },
13025:         "unread_substantive_count": 39
```

Linhas 14262–14270.

```text
14262:         "family": "research",
14263:         "population_count": 71,
14264:         "artifact_keys": [
14265:           "s1.core.research"
14266:         ],
14267:         "read_source_paths": [
14268:           "packages/core/src/research-toolkit/index.ts",
14269:           "packages/core/src/research/ledger.ts"
14270:         ],
```

Linhas 14318–14329.

```text
14318:       "derived_counts": {
14319:         "by_depth": {
14320:           "decisive_source_read": 2,
14321:           "grouped_support_contract": 3,
14322:           "grouped_validation_inventory": 28,
14323:           "representative_family_boundary": 38
14324:         },
14325:         "by_read_status": {
14326:           "not_read": 69,
14327:           "semantically_read_decisive_ranges": 2
14328:         },
14329:         "unread_substantive_count": 38
```

Linhas 14337–14343.

```text
14337:       "artifacts_actually_citing_family_sources": [
14338:         "s1.core.research"
14339:       ],
14340:       "clarification_authored_in_this_revision": {
14341:         "supported_boundary": "ResearchToolkit e Ledger sustentam caps, adapter vazio padrão, status best effort e identidade/replay da evidência.",
14342:         "mandatory_remaining_boundary": "38 leaves e três inputs não lidos retêm validação de documentos, índices, parsers e sandbox builds. Planejamento que falhou e virou lista vazia não comprova cobertura; conteúdo admitido não comprova sua verdade.",
14343:         "semantic_acceptance": false
```

Linhas 16522–16542.

```text
16522:         "key": "s1.core.research",
16523:         "scope": "orchestra.s1",
16524:         "title": "Pinned toolkits and retained research evidence",
16525:         "layer": 1,
16526:         "need": "component",
16527:         "body": {
16528:           "path": "bodies/research.md",
16529:           "encoding": "utf-8",
16530:           "byte_length": 3942,
16531:           "sha256": "76a39828caccbb41b99fe0f7d480f4a35abac7722d5c34ddfe5c7ddd67c7c202"
16532:         },
16533:         "authority": {
16534:           "scope": "orchestra.s1",
16535:           "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
16536:           "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
16537:         },
16538:         "validity": "supported",
16539:         "gaps": [
16540:           "Toolkit manifests, index adapters and individual research validators need leaf inspection for operation-specific changes.",
16541:           "No engine availability or platform qualification was measured."
16542:         ],
```

Linhas 16553–16558.

```text
16553:         "input_keys": [
16554:           "file:packages/core/src/backend-toolkit/index.ts",
16555:           "file:packages/core/src/backend-toolkit/README.md",
16556:           "file:packages/core/src/research-toolkit/index.ts",
16557:           "file:packages/core/src/research/ledger.ts"
16558:         ],
```

### RA1-P — Projeção MECÂNICA de população e coverage (não são rows integrais)

**RA-S044 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/03-automation/sources.jsonl`**

Commit `70234d541a9a3539935ef16f19e33c8f2d5f30ec` · Git blob `71374892d3a7bda60aaf48cc8bd2c43e4d9e4c85` · SHA-256 `1643a358ccaafe0ca9e6a9051d7c1a9bc9a1922834d6183e52703f6de2db077c` · 119405 bytes.

**RA-S045 — `producers/research/coverage.jsonl`**

Artefato local congelado · Git blob `48b8beafa81098be06c37b4f4ec1a3044e77414d` · SHA-256 `bb06bcef77a2dbeccabc70dd00dc10d70bf22cb338588661d7ecc9f49e01eec9` · 127215 bytes.

Operação: selecionar no inventário `legacy_artifact_key == "s1.core.research"`; comparar o conjunto de paths com `coverage.jsonl`; contar `family` e `kind`. Resultado mecânico: **130 = 59 backend-toolkit + 71 research**; **80 implementation + 41 test_code + 7 runtime_data_or_pin + 1 generated_output + 1 documentation**. Os 130 paths coincidem, sem ausentes/duplicados; os bytes capturados somam 1.212.271. Isso não é aceite semântico.

Projeção abaixo: campos `path`, `role`, `need`, `read_depth`, `body_sections` das **130 rows**. Destas, **103** têm interseção com R0–R7 (59 backend-toolkit e 44 research); as outras **27** servem R8–R14 e permanecem aqui para compartilhar a mesma população integral com research-b. O número inicial é a linha do JSONL congelado; o índice contém os valores projetados, a pertinência a R0–R7 e o hash da row original.

| Linha coverage | path | role | need | read_depth | body_sections |
| ---: | --- | --- | --- | --- | --- |
| 1 | `packages/core/src/backend-toolkit/acquisition.ts` | `implementation` | `component` | `implementation_control_flow` | `R2` |
| 2 | `packages/core/src/backend-toolkit/attempts.ts` | `implementation` | `component` | `implementation_control_flow` | `R2` |
| 3 | `packages/core/src/backend-toolkit/cassandra-dialer.ts` | `implementation` | `component` | `implementation_control_flow` | `R4` |
| 4 | `packages/core/src/backend-toolkit/cassandra-metadata.ts` | `implementation` | `component` | `implementation_control_flow` | `R4` |
| 5 | `packages/core/src/backend-toolkit/diagnostics.ts` | `implementation` | `component` | `implementation_control_flow` | `R2` |
| 6 | `packages/core/src/backend-toolkit/entry-skills.gen.ts` | `generated_registry` | `component` | `generated_contract_read` | `R1` |
| 7 | `packages/core/src/backend-toolkit/hosted.ts` | `implementation` | `component` | `implementation_control_flow` | `R2` |
| 8 | `packages/core/src/backend-toolkit/index.ts` | `implementation` | `component` | `implementation_control_flow` | `R2` |
| 9 | `packages/core/src/backend-toolkit/launcher.ts` | `implementation` | `component` | `implementation_control_flow` | `R2` |
| 10 | `packages/core/src/backend-toolkit/manifest.ts` | `implementation` | `component` | `implementation_control_flow` | `R1` |
| 11 | `packages/core/src/backend-toolkit/packs/ast-grep.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 12 | `packages/core/src/backend-toolkit/packs/buf.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 13 | `packages/core/src/backend-toolkit/packs/controller-gen.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 14 | `packages/core/src/backend-toolkit/packs/datafusion-cli.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 15 | `packages/core/src/backend-toolkit/packs/datamodel-codegen.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 16 | `packages/core/src/backend-toolkit/packs/datamodel-codegen.wheels.ts` | `acquisition_pin_data` | `component` | `hash_list_and_platform_contract` | `R3` |
| 17 | `packages/core/src/backend-toolkit/packs/gitleaks.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 18 | `packages/core/src/backend-toolkit/packs/gocqlx-schemagen.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 19 | `packages/core/src/backend-toolkit/packs/index.ts` | `pack_registry` | `component` | `manifest_recipe_and_constraints` | `R1,R3` |
| 20 | `packages/core/src/backend-toolkit/packs/kiota.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 21 | `packages/core/src/backend-toolkit/packs/kopium.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 22 | `packages/core/src/backend-toolkit/packs/kubeconform.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 23 | `packages/core/src/backend-toolkit/packs/kysely-codegen.package-lock.json` | `acquisition_lock` | `component` | `locked_data_contract_inspection` | `R3` |
| 24 | `packages/core/src/backend-toolkit/packs/kysely-codegen.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 25 | `packages/core/src/backend-toolkit/packs/modelina.package-lock.json` | `acquisition_lock` | `component` | `locked_data_contract_inspection` | `R3` |
| 26 | `packages/core/src/backend-toolkit/packs/modelina.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 27 | `packages/core/src/backend-toolkit/packs/ogen.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 28 | `packages/core/src/backend-toolkit/packs/openapi-generator.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 29 | `packages/core/src/backend-toolkit/packs/orval.package-lock.json` | `acquisition_lock` | `component` | `locked_data_contract_inspection` | `R3` |
| 30 | `packages/core/src/backend-toolkit/packs/orval.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 31 | `packages/core/src/backend-toolkit/packs/postgres-language-server.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 32 | `packages/core/src/backend-toolkit/packs/protoc-gen-es.package-lock.json` | `acquisition_lock` | `component` | `locked_data_contract_inspection` | `R3` |
| 33 | `packages/core/src/backend-toolkit/packs/protoc-gen-es.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 34 | `packages/core/src/backend-toolkit/packs/sqlc.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 35 | `packages/core/src/backend-toolkit/packs/sqlglot.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 36 | `packages/core/src/backend-toolkit/packs/sqlx.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 37 | `packages/core/src/backend-toolkit/packs/squawk.ts` | `engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 38 | `packages/core/src/backend-toolkit/project-version.ts` | `implementation` | `component` | `implementation_control_flow` | `R4` |
| 39 | `packages/core/src/backend-toolkit/README.md` | `documentation` | `component` | `normative_contract_read` | `R1` |
| 40 | `packages/core/src/backend-toolkit/runtimes/go.ts` | `runtime_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 41 | `packages/core/src/backend-toolkit/runtimes/java.ts` | `runtime_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 42 | `packages/core/src/backend-toolkit/runtimes/node.ts` | `runtime_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 43 | `packages/core/src/backend-toolkit/runtimes/python.ts` | `runtime_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 44 | `packages/core/src/backend-toolkit/runtimes/rust.ts` | `runtime_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 45 | `packages/core/src/backend-toolkit/target.ts` | `implementation` | `component` | `implementation_control_flow` | `R2` |
| 46 | `packages/core/src/pinned-artifact.ts` | `implementation` | `component` | `implementation_control_flow` | `R2` |
| 47 | `packages/core/src/research-toolkit/code-index/build.ts` | `implementation` | `component` | `implementation_control_flow` | `R6` |
| 48 | `packages/core/src/research-toolkit/code-index/callers.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 49 | `packages/core/src/research-toolkit/code-index/enclosing.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 50 | `packages/core/src/research-toolkit/code-index/extract.ts` | `implementation` | `component` | `implementation_control_flow` | `R5,R6,R7` |
| 51 | `packages/core/src/research-toolkit/code-index/filter.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 52 | `packages/core/src/research-toolkit/code-index/go.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 53 | `packages/core/src/research-toolkit/code-index/python.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 54 | `packages/core/src/research-toolkit/code-index/query.ts` | `implementation` | `component` | `implementation_control_flow` | `R8` |
| 55 | `packages/core/src/research-toolkit/code-index/rank.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 56 | `packages/core/src/research-toolkit/code-index/resolve.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 57 | `packages/core/src/research-toolkit/code-index/rust.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 58 | `packages/core/src/research-toolkit/code-index/scip.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 59 | `packages/core/src/research-toolkit/code-index/shard.ts` | `implementation` | `component` | `implementation_control_flow` | `R6` |
| 60 | `packages/core/src/research-toolkit/code-index/store.ts` | `implementation` | `component` | `implementation_control_flow` | `R6` |
| 61 | `packages/core/src/research-toolkit/code-index/tree-sitter.ts` | `implementation` | `component` | `implementation_control_flow` | `R7` |
| 62 | `packages/core/src/research-toolkit/code-index/types.ts` | `implementation` | `component` | `implementation_control_flow` | `R8` |
| 63 | `packages/core/src/research-toolkit/index.ts` | `implementation` | `component` | `implementation_control_flow` | `R5` |
| 64 | `packages/core/src/research-toolkit/liveness.ts` | `implementation` | `component` | `implementation_control_flow` | `R8` |
| 65 | `packages/core/src/research-toolkit/locate.ts` | `implementation` | `component` | `implementation_control_flow` | `R8` |
| 66 | `packages/core/src/research-toolkit/manifest.ts` | `implementation` | `component` | `implementation_control_flow` | `R3` |
| 67 | `packages/core/src/research-toolkit/packs/index.ts` | `pack_registry` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 68 | `packages/core/src/research-toolkit/packs/rust-analyzer.ts` | `research_engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 69 | `packages/core/src/research-toolkit/packs/scip-go.ts` | `research_engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 70 | `packages/core/src/research-toolkit/packs/scip-python.package-lock.json` | `acquisition_lock` | `component` | `locked_data_contract_inspection` | `R3` |
| 71 | `packages/core/src/research-toolkit/packs/scip-python.ts` | `research_engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 72 | `packages/core/src/research-toolkit/packs/scip-typescript.package-lock.json` | `acquisition_lock` | `component` | `locked_data_contract_inspection` | `R3` |
| 73 | `packages/core/src/research-toolkit/packs/scip-typescript.ts` | `research_engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 74 | `packages/core/src/research-toolkit/packs/typescript.package-lock.json` | `acquisition_lock` | `component` | `locked_data_contract_inspection` | `R3` |
| 75 | `packages/core/src/research-toolkit/packs/typescript.ts` | `research_engine_recipe` | `component` | `manifest_recipe_and_constraints` | `R3` |
| 76 | `packages/core/src/research-toolkit/probe/assets.ts` | `implementation` | `component` | `implementation_control_flow` | `R9` |
| 77 | `packages/core/src/research-toolkit/probe/run.ts` | `implementation` | `component` | `implementation_control_flow` | `R9` |
| 78 | `packages/core/src/research-toolkit/probe/runners.ts` | `implementation` | `component` | `implementation_control_flow` | `R9` |
| 79 | `packages/core/src/research-toolkit/probe/snapshot.ts` | `implementation` | `component` | `implementation_control_flow` | `R9` |
| 80 | `packages/core/src/research-toolkit/probe/typecheck.ts` | `implementation` | `component` | `implementation_control_flow` | `R9` |
| 81 | `packages/core/src/research-toolkit/probe/types.ts` | `implementation` | `component` | `implementation_control_flow` | `R9` |
| 82 | `packages/core/src/research-toolkit/process.ts` | `implementation` | `component` | `implementation_control_flow` | `R9` |
| 83 | `packages/core/src/research-toolkit/search.ts` | `implementation` | `component` | `implementation_control_flow` | `R8` |
| 84 | `packages/core/src/research/allowance.ts` | `implementation` | `component` | `implementation_control_flow` | `R10` |
| 85 | `packages/core/src/research/artifacts.ts` | `implementation` | `component` | `implementation_control_flow` | `R11,R12` |
| 86 | `packages/core/src/research/binding.ts` | `implementation` | `component` | `implementation_control_flow` | `R10` |
| 87 | `packages/core/src/research/ledger.ts` | `implementation` | `component` | `implementation_control_flow` | `R11,R12` |
| 88 | `packages/core/src/research/records.ts` | `implementation` | `component` | `implementation_control_flow` | `R11,R12` |
| 89 | `packages/core/src/research/seat-tools.ts` | `implementation` | `component` | `implementation_control_flow` | `R10` |
| 90 | `packages/core/test/backend-toolkit-acquisition.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 91 | `packages/core/test/backend-toolkit-cassandra.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 92 | `packages/core/test/backend-toolkit-cli.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 93 | `packages/core/test/backend-toolkit-floors.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 94 | `packages/core/test/backend-toolkit-hosted.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 95 | `packages/core/test/backend-toolkit-packs.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 96 | `packages/core/test/backend-toolkit-process.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 97 | `packages/core/test/backend-toolkit-project-version.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 98 | `packages/core/test/backend-toolkit-source-readiness.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 99 | `packages/core/test/backend-toolkit-source.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 100 | `packages/core/test/backend-toolkit-target.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 101 | `packages/core/test/backend-toolkit.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 102 | `packages/core/test/code-index-query.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 103 | `packages/core/test/code-index-rank.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 104 | `packages/core/test/code-index-store.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 105 | `packages/core/test/pinned-artifact.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R2,R3,R4,R13` |
| 106 | `packages/core/test/research-allowance.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R8,R13` |
| 107 | `packages/core/test/research-artifacts.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R8,R13` |
| 108 | `packages/core/test/research-binding.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R8,R13` |
| 109 | `packages/core/test/research-inquiry-ledger.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R8,R13` |
| 110 | `packages/core/test/research-locate.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R8,R13` |
| 111 | `packages/core/test/research-probe-units.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R9,R13` |
| 112 | `packages/core/test/research-probe.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R9,R13` |
| 113 | `packages/core/test/research-records.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R8,R13` |
| 114 | `packages/core/test/research-search.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R8,R13` |
| 115 | `packages/core/test/research-toolkit-callers.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 116 | `packages/core/test/research-toolkit-enclosing.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 117 | `packages/core/test/research-toolkit-liveness.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 118 | `packages/core/test/research-toolkit-packs.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 119 | `packages/core/test/research-toolkit-scip.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 120 | `packages/core/test/research-toolkit.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 121 | `packages/core/test/research-toolkit/capability.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 122 | `packages/core/test/research-toolkit/code-index-filter.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 123 | `packages/core/test/research-toolkit/code-index-go.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 124 | `packages/core/test/research-toolkit/code-index-python.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 125 | `packages/core/test/research-toolkit/code-index-resolve.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 126 | `packages/core/test/research-toolkit/code-index-rust.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 127 | `packages/core/test/research-toolkit/code-index-scip-encoding.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 128 | `packages/core/test/research-toolkit/code-index-structural.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 129 | `packages/core/test/research-toolkit/code-index-toolkit.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |
| 130 | `packages/core/test/research-toolkit/code-index-tree-sitter.test.ts` | `test_contract_not_executed` | `component` | `decisive_validation_contract_read` | `R5,R6,R7,R8,R13` |

## RE-A2

### RA2-01 — 21 engines backend: identidade, aquisição, restrições e fit

**RA-S002 — `packages/core/src/backend-toolkit/packs/ast-grep.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c59c577e3ac8b36c8cd70f3af5c62145fa72f559` · SHA-256 `4c38bf4a298cdc6d68db78893a13cdf8279a768487de6e0e44af29e7e0b08846` · 2166 bytes.

Linhas 3–22.

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
```

Linhas 54–59.

```text
54:   fit: {
55:     role: "generator",
56:     input: "a syntax pattern, its rewrite and the files to apply it to",
57:     skills: ["backend-refactor"],
58:   },
59: } as const satisfies Pack
```

**RA-S003 — `packages/core/src/backend-toolkit/packs/sqlc.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `821a12bf764c932b5b0140be0b4317e45a0ebc8a` · SHA-256 `642f56d93028b821f8c2d39bb1da0d15e4bf93a669721364914a489cf9359084` · 1654 bytes.

Linhas 3–21.

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
```

Linhas 37–38.

```text
37:   fit: { role: "generator", input: "SQL query files and the schema DDL sqlc reads", skills: ["backend-data"] },
38: } as const satisfies Pack
```

**RA-S004 — `packages/core/src/backend-toolkit/packs/buf.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d8d06b5fb1f1b1df4bfbd437fbbc110e0225fc66` · SHA-256 `23eff54fd15efc953e1d9a779b64b058c54e67fdf30216bf0552a08cd5f2eedb` · 1675 bytes.

Linhas 3–21.

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
```

Linhas 30–30.

```text
30:   dependencies: ["protoc-gen-es"],
```

Linhas 38–39.

```text
38:   fit: { role: "check", input: "a Buf module of .proto files", skills: ["backend-api"] },
39: } as const satisfies Pack
```

**RA-S005 — `packages/core/src/backend-toolkit/packs/gitleaks.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ca2e4948a9b81538b5d013c730c041490795794a` · SHA-256 `ebd3745fb377d2fe38b166497edfb68f1bbd7202ba27592d00935e9d946e8da4` · 1865 bytes.

Linhas 3–25.

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
```

Linhas 41–42.

```text
41:   fit: { role: "check", input: "Memory text before it is stored", skills: [] },
42: } as const satisfies Pack
```

**RA-S006 — `packages/core/src/backend-toolkit/packs/kiota.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `62648da970ce5f94bf540acea7d84d3bfc2cdb2f` · SHA-256 `2409e1b56b8b552c34066942aca1dab95afedac59c0a09d4278bd54f12a3b91f` · 1902 bytes.

Linhas 3–25.

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
```

Linhas 34–34.

```text
34:   env: { KIOTA_OFFLINE_ENABLED: "true", KIOTA_CLI_TELEMETRY_OPTOUT: "true" },
```

Linhas 42–43.

```text
42:   fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
43: } as const satisfies Pack
```

**RA-S007 — `packages/core/src/backend-toolkit/packs/orval.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `afdc69072ae464f07a5686fd3828f73d558e0b81` · SHA-256 `cfa18aa4707d83c3ad83aab06263be68234c186145bdd2b718b9e4d3863abf5a` · 1113 bytes.

Linhas 5–5.

```text
5: const VERSION = "8.39.0"
```

Linhas 7–31.

```text
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

**RA-S008 — `packages/core/src/backend-toolkit/packs/protoc-gen-es.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `6b8dc5112e0d5c09493f2700d2a8a44a66de4ee8` · SHA-256 `36c5526a297dba47104e6e772f4dd3c6f8a1a02b3b0d57a0b94f72f23cfb6035` · 824 bytes.

Linhas 4–4.

```text
4: const VERSION = "2.16.0"
```

Linhas 6–25.

```text
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

**RA-S009 — `packages/core/src/backend-toolkit/packs/openapi-generator.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `928930908862f17b5df6fb3d8a376d85ed7d5884` · SHA-256 `173c8f226dd169b990ca9ce52053a2b05cb62658df84ff994a611d4b3b7bf248` · 884 bytes.

Linhas 4–4.

```text
4: const VERSION = "7.25.0"
```

Linhas 6–23.

```text
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

**RA-S010 — `packages/core/src/backend-toolkit/packs/datamodel-codegen.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `feab5b5a517a598338b7cc18c863d10b841302d5` · SHA-256 `52c7ee7257e696d7728cd12b6c59d9d7e52afb512b8b84320e62feced373d124` · 1335 bytes.

Linhas 4–31.

```text
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

**RA-S011 — `packages/core/src/backend-toolkit/packs/ogen.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `302a4c0f91b4fa0aef370d8c6cb7ae48ab414482` · SHA-256 `c1df3ae0c7b885ad04631d083c76d34802c836a6df049589900e2969c05daabc` · 2104 bytes.

Linhas 4–4.

```text
4: const VERSION = "1.24.0"
```

Linhas 8–13.

```text
8: const SOURCE = [
9:   ".codecov.yaml",
10:   ".editorconfig",
11:   ".gitattributes",
12:   ".github",
13:   ".gitignore",
```

Linhas 31–32.

```text
31:   "go.mod",
32:   "go.sum",
```

Linhas 63–83.

```text
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

**RA-S012 — `packages/core/src/backend-toolkit/packs/sqlx.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `bdaa2f4e6147bda107c67aae416b8eb97773eaae` · SHA-256 `869d64285186d2f8bc2dcdbc5dabffc5488257a903e7662d0c99b63c79dce96e` · 1729 bytes.

Linhas 4–4.

```text
4: const VERSION = "0.9.0"
```

Linhas 9–40.

```text
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

**RA-S013 — `packages/core/src/backend-toolkit/packs/controller-gen.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `55bf77a6e053b7ec32e77f1c0c7ab2ecf410b150` · SHA-256 `6182cca9af788189579ba431f639e386b45791fda6d9835e1cb4879c071b0aad` · 2915 bytes.

Linhas 3–9.

```text
3: const VERSION = "0.22.0"
4: 
5: export default {
6:   id: "controller-gen",
7:   version: VERSION,
8:   license: "Apache-2.0",
9:   upstream: "kubernetes-sigs/controller-tools",
```

Linhas 20–29.

```text
20:   targets: {
21:     "darwin-arm64": {
22:       artifact: {
23:         url: `https://github.com/kubernetes-sigs/controller-tools/releases/download/v${VERSION}/controller-gen-darwin-arm64`,
24:         integrity: "sha256-Xg18Fu2cwK6IfALr9SRKJzlJXJPuqnsgzN06uyClOEY=",
25:         format: "raw",
26:         entries: [{ from: "controller-gen-darwin-arm64", to: "controller-gen", executable: true }],
27:       },
28:       executable: "controller-gen",
29:     },
```

Linhas 67–72.

```text
67:   fit: {
68:     role: "generator",
69:     input: "Go API types with kubebuilder markers the packet assigns",
70:     skills: ["backend-api"],
71:   },
72: } as const satisfies Pack
```

**RA-S014 — `packages/core/src/backend-toolkit/packs/kubeconform.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `81fb16e67c3fbc464421945d548fd96ff80e3c57` · SHA-256 `96bd9cc1cf933cdb56995a320b70d897f498a6bf738baaf5565785d2bcaefc17` · 2763 bytes.

Linhas 3–9.

```text
3: const VERSION = "0.8.0"
4: 
5: export default {
6:   id: "kubeconform",
7:   version: VERSION,
8:   license: "Apache-2.0",
9:   upstream: "yannh/kubeconform",
```

Linhas 20–29.

```text
20:   targets: {
21:     "darwin-arm64": {
22:       artifact: {
23:         url: `https://github.com/yannh/kubeconform/releases/download/v${VERSION}/kubeconform-darwin-arm64.tar.gz`,
24:         integrity: "sha256-+E9N++v0prCyMDhfoGWjnqNeAmCMK1DQJdz2R3WmnWc=",
25:         format: "tar.gz",
26:         entries: [{ from: "kubeconform", to: "kubeconform", executable: true }],
27:       },
28:       executable: "kubeconform",
29:     },
```

Linhas 67–72.

```text
67:   fit: {
68:     role: "check",
69:     input: "Kubernetes manifests the change wrote, with the schemas the packet supplies",
70:     skills: ["backend-check"],
71:   },
72: } as const satisfies Pack
```

**RA-S015 — `packages/core/src/backend-toolkit/packs/kopium.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c5c0d2e7d05b7cb869e899d0013c02f13c7fa15b` · SHA-256 `eb7187300e2b0966e2faad3c9048ffda2da09910ddf9dc506d3c7669ee262a9d` · 1646 bytes.

Linhas 3–37.

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

**RA-S016 — `packages/core/src/backend-toolkit/packs/squawk.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `fe59f063520d0a445eba6f4dcc5f300159a70c6c` · SHA-256 `ebec8aa73f4acd6b93172538f776e77805bac9877e12396a43c5cd326a6e930c` · 1730 bytes.

Linhas 3–21.

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
```

Linhas 37–42.

```text
37:   fit: {
38:     role: "check",
39:     input: "the PostgreSQL migration files the change wrote",
40:     skills: ["backend-data", "backend-check"],
41:   },
42: } as const satisfies Pack
```

**RA-S017 — `packages/core/src/backend-toolkit/packs/postgres-language-server.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `0e51cf0e5c7774ab3124e8150904301cac44c57a` · SHA-256 `f1c76d324ebb548e7ca2850bcace878da77626e4dcc716cd9f2c4974383ce951` · 2087 bytes.

Linhas 3–26.

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
```

Linhas 46–51.

```text
46:   fit: {
47:     role: "check",
48:     input: "the SQL the change wrote and a disposable PostgreSQL database holding the schema",
49:     skills: ["backend-data", "backend-check"],
50:   },
51: } as const satisfies Pack
```

**RA-S018 — `packages/core/src/backend-toolkit/packs/sqlglot.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9649773f069a32df82c9793475cfecf3e6f963fa` · SHA-256 `0a6db1cf8a8689413e40b7edc2cb7a46ac55454d6872ce9a5fc2da99147b20db` · 998 bytes.

Linhas 5–5.

```text
5: const VERSION = "30.21.0"
```

Linhas 7–26.

```text
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

**RA-S019 — `packages/core/src/backend-toolkit/packs/kysely-codegen.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `08c150c9918b67928ffb4cfec41b11b24dad9bc0` · SHA-256 `ef5ae2d54be68713f9a133650800f493828dfd10059b71ceccda717a6bb1b831` · 1390 bytes.

Linhas 3–37.

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

**RA-S020 — `packages/core/src/backend-toolkit/packs/datafusion-cli.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `4843bece0d3ad44712b170c25e161763caa8172f` · SHA-256 `7597abd91ed4574bf68cbf7303825f294146dc078f14a6371df0bf81230c4efd` · 2044 bytes.

Linhas 3–41.

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

**RA-S021 — `packages/core/src/backend-toolkit/packs/gocqlx-schemagen.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ec10ad95405ed2712bf956538ae0873484d8632c` · SHA-256 `85794568238124594e4bb9fa1ee663c88c3d606d3221079795b4a72705e7db47` · 2428 bytes.

Linhas 5–5.

```text
5: const VERSION = "3.0.4"
```

Linhas 7–15.

```text
7: // The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir so
8: // the build runs in the module root next to its go.mod and go.sum.
9: const SOURCE = [
10:   ".github",
11:   ".gitignore",
12:   ".golangci.yml",
13:   "LICENSE",
14:   "Makefile",
15:   "README.md",
```

Linhas 24–25.

```text
24:   "go.mod",
25:   "go.sum",
```

Linhas 45–75.

```text
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

**RA-S022 — `packages/core/src/backend-toolkit/packs/modelina.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `e3f90fbca7f3150c43a231f4029bb8caf5abc043` · SHA-256 `f2685a235805dd4b286ded02fec5d3f109256a5c9ed20a46c9fe6b405f9c882b` · 1103 bytes.

Linhas 3–28.

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

### RA2-02 — Cinco runtimes: versão, estrutura, executável e floors

**RA-S023 — `packages/core/src/backend-toolkit/runtimes/go.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `75c6d31c2ee8e54f9e3cfedf5f30d5449a63a417` · SHA-256 `607c8ef56bc75a8134be5535aba9ccce72efbcc44e01d2110c7577c73cc9ed4c` · 2028 bytes.

Linhas 3–54.

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
```

**RA-S024 — `packages/core/src/backend-toolkit/runtimes/java.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `7e8f97536e3d79488f7bb05cce689162a2420b8a` · SHA-256 `02a8a16f2d274950dbde60c64750296f69488bedde47612645de894eeb34d438` · 2261 bytes.

Linhas 3–37.

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
```

**RA-S025 — `packages/core/src/backend-toolkit/runtimes/node.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `23817c461874f9fe103c46e48cd143fdb1a1a8d9` · SHA-256 `8c461b59200597711ebec02c490dc96e5b279b41540f1042a5105fbd6750517b` · 2466 bytes.

Linhas 3–36.

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
```

**RA-S026 — `packages/core/src/backend-toolkit/runtimes/python.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d3744fe808d49f0710756ff40d8478e1f8da8874` · SHA-256 `d4b61a00828e88ee1cfaece927eff526458c350740c07736c6c9a16495343e4a` · 2738 bytes.

Linhas 3–33.

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
```

**RA-S027 — `packages/core/src/backend-toolkit/runtimes/rust.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `1e2696f2f7ed5265edb397ea8e2f7f71f9256ebd` · SHA-256 `d27529a3cf34ab368d03f04ff78ed8494e013c6ab0443f88fb1448e8d1e18770` · 2526 bytes.

Linhas 3–44.

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
```

### RA2-03 — Cinco packs research: compiler separado, toolchains e VSIX

**RA-S028 — `packages/core/src/research-toolkit/packs/rust-analyzer.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `617871bdf12fd837043ded8b6fde6b1d19caf56c` · SHA-256 `e43f4d1b6b57910cc7b4a43306f033700443f8d79b65cf84edc3ab052e6abb96` · 1916 bytes.

Linhas 4–29.

```text
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
```

Linhas 37–38.

```text
37:   fit: { role: "indexer", languages: ["rust"] },
38: } as const satisfies ResearchPack
```

**RA-S029 — `packages/core/src/research-toolkit/packs/scip-go.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `047a037a20dc3902328c76dd41c46cd7f7dafd2f` · SHA-256 `7c20e1d6fd8e2d7331a43caa152c7db860620f0dfbdbd15e74b11c48f0d89e8b` · 1765 bytes.

Linhas 3–10.

```text
3: // scip-go publishes binaries for three of the five targets only, so it builds from the module source on the private
4: // Go runtime, as the backend's ogen does. The module moved from sourcegraph to scip-code; its go.mod declares
5: // `go 1.25.0`, which the Go runtime satisfies. At index time it loads packages through the host's own `go`
6: // toolchain (`go list`); a host without one keeps the tree-sitter layer (code-index/extract.ts).
7: const VERSION = "0.2.7"
8: 
9: // The module zip's top-level children under its `<module>@<version>/` prefix, moved to the root of the source dir.
10: const SOURCE = [".agents", ".github", ".gitignore", "LICENSE", "README.md", "cmd", "flake.lock", "flake.nix", "go.mod", "go.sum", "internal"]
```

Linhas 15–35.

```text
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

**RA-S030 — `packages/core/src/research-toolkit/packs/scip-python.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ba07604bc14e0b439b7fe0e92194eb07f8f078c1` · SHA-256 `b4d35ef1e9b11ec8687f39c6e51f4b3d9b2afa5908de3a46b41ea05b63e7fbd1` · 1073 bytes.

Linhas 4–32.

```text
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

**RA-S031 — `packages/core/src/research-toolkit/packs/scip-typescript.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a879dd486a40a0553a6fdedf82e093251ce2ec07` · SHA-256 `97fd24e79cc805da3f89b7ae31d8e52e25a946b7249b1421a85b7923b06c4773` · 1057 bytes.

Linhas 4–31.

```text
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

**RA-S032 — `packages/core/src/research-toolkit/packs/typescript.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `781df87bba6bdb1002aadf61574498c96410155f` · SHA-256 `7c125ffd1acf9381933be0709209d97e79b91b3b1e3abccab4cb8e7d2a57f845` · 867 bytes.

Linhas 4–26.

```text
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

**RA-S046 — `packages/core/src/research-toolkit/packs/index.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c560a0cf8a33ec10e1cf199c905517a6c629da15` · SHA-256 `b48a9611134151e4e44643cf8bf21e84dba990ba9a65ad644788535133bd5b2d` · 545 bytes.

Linhas 7–15.

```text
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

### RA2-04 — Sete locks e wheels: campos de aquisição e exceções bundled

**RA-S033 — `packages/core/src/backend-toolkit/packs/kysely-codegen.package-lock.json`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `4c258c62096c9a119896f0826836d3653645f0f1` · SHA-256 `9de6d58c097012a2022acbedbe1a1d7ff7b25d08bc23c65ca912f6a851401641` · 27939 bytes.

Linhas 6–14.

```text
6:     "": {
7:       "name": "backend-toolkit-kysely-codegen",
8:       "dependencies": {
9:         "kysely-codegen": "0.20.0",
10:         "mysql2": "3.24.5",
11:         "pg": "8.23.1",
12:         "typescript": "6.0.3"
13:       }
14:     },
```

Linhas 352–357.

```text
352:     "node_modules/kysely-codegen": {
353:       "version": "0.20.0",
354:       "resolved": "https://registry.npmjs.org/kysely-codegen/-/kysely-codegen-0.20.0.tgz",
355:       "integrity": "sha512-LSi2KBG7uDmNCZ+XurLSA9LH7XFyyoQ6xb5DLJSInPTSYLVApjOP2KwO8mSaREWTtoX+C2AG2GTlYR0DLjTbcA==",
356:       "license": "MIT",
357:       "dependencies": {
```

**RA-S034 — `packages/core/src/backend-toolkit/packs/modelina.package-lock.json`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9fc9ef1bc7124fcead2d83cea20f2bff4340949c` · SHA-256 `0fc1a48c86b45b4749fda6d5e811a1f9b3f55a246fa5e8dd035435e84d2149d2` · 266885 bytes.

Linhas 6–11.

```text
6:     "": {
7:       "name": "backend-toolkit-modelina",
8:       "dependencies": {
9:         "@asyncapi/modelina-cli": "5.10.1"
10:       }
11:     },
```

Linhas 111–116.

```text
111:     "node_modules/@asyncapi/modelina-cli": {
112:       "version": "5.10.1",
113:       "resolved": "https://registry.npmjs.org/@asyncapi/modelina-cli/-/modelina-cli-5.10.1.tgz",
114:       "integrity": "sha512-qBPW0XDfQkHNyhrStd4e5midehoy9PUPHVz0koyf2s9rg/SpossUyCFCYWD6n34ru1tNH1Mkjhuuu9iFNcAMvg==",
115:       "license": "Apache-2.0",
116:       "dependencies": {
```

Linhas 265–271.

```text
265:     "node_modules/@hyperjump/json-pointer": {
266:       "version": "0.9.8",
267:       "resolved": "https://registry.npmjs.org/@hyperjump/json-pointer/-/json-pointer-0.9.8.tgz",
268:       "integrity": "sha512-6D6okhpH5VOS3oSYUtxu8nClsOcp59aC+sS06/tCxEta4T5Gk1yaycLiCkG8kE9eh+9AJUHsvQEJJrWBfLOjvA==",
269:       "hasInstallScript": true,
270:       "license": "MIT",
271:       "dependencies": {
```

Linhas 4289–4298.

```text
4289:     "node_modules/npm": {
4290:       "version": "11.21.0",
4291:       "resolved": "https://registry.npmjs.org/npm/-/npm-11.21.0.tgz",
4292:       "integrity": "sha512-Zov8KhamNneiLdELtj5YALtNmJW4L4fCLTzjfpzXG2w6MSHcf0UxgdlK5uloCuksWT+7mGUU7wi79cO6RqivPg==",
4293:       "bundleDependencies": [
4294:         "@isaacs/string-locale-compare",
4295:         "@npmcli/arborist",
4296:         "@npmcli/config",
4297:         "@npmcli/fs",
4298:         "@npmcli/map-workspaces",
```

Linhas 4473–4480.

```text
4473:     "node_modules/npm/node_modules/@gar/promise-retry": {
4474:       "version": "1.0.3",
4475:       "inBundle": true,
4476:       "license": "MIT",
4477:       "engines": {
4478:         "node": "^20.17.0 || >=22.9.0"
4479:       }
4480:     },
```

**RA-S035 — `packages/core/src/backend-toolkit/packs/orval.package-lock.json`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `af0c40af9f14e14b7703b94d2b475f1e2f159c2a` · SHA-256 `a3b052e1684e432a80198786e8d5b3744a7b4635dadb5fa4088853817a4f2026` · 50428 bytes.

Linhas 6–11.

```text
6:     "": {
7:       "name": "backend-toolkit-orval",
8:       "dependencies": {
9:         "orval": "8.39.0"
10:       }
11:     },
```

Linhas 277–292.

```text
277:     "node_modules/@esbuild/linux-x64": {
278:       "version": "0.28.2",
279:       "resolved": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.2.tgz",
280:       "integrity": "sha512-4xTZr1FUmSoQW4XIWmit3tzQrUTZM+N3P0XV8xROKYF50XfI7xeO90+1bZvNwxIufQ9hDQVRJH5YhgPVF8A/HQ==",
281:       "cpu": [
282:         "x64"
283:       ],
284:       "license": "MIT",
285:       "optional": true,
286:       "os": [
287:         "linux"
288:       ],
289:       "engines": {
290:         "node": ">=18"
291:       }
292:     },
```

Linhas 899–905.

```text
899:     "node_modules/esbuild": {
900:       "version": "0.28.2",
901:       "resolved": "https://registry.npmjs.org/esbuild/-/esbuild-0.28.2.tgz",
902:       "integrity": "sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==",
903:       "hasInstallScript": true,
904:       "license": "MIT",
905:       "bin": {
```

Linhas 911–919.

```text
911:       "optionalDependencies": {
912:         "@esbuild/aix-ppc64": "0.28.2",
913:         "@esbuild/android-arm": "0.28.2",
914:         "@esbuild/android-arm64": "0.28.2",
915:         "@esbuild/android-x64": "0.28.2",
916:         "@esbuild/darwin-arm64": "0.28.2",
917:         "@esbuild/darwin-x64": "0.28.2",
918:         "@esbuild/freebsd-arm64": "0.28.2",
919:         "@esbuild/freebsd-x64": "0.28.2",
```

Linhas 1215–1220.

```text
1215:     "node_modules/orval": {
1216:       "version": "8.39.0",
1217:       "resolved": "https://registry.npmjs.org/orval/-/orval-8.39.0.tgz",
1218:       "integrity": "sha512-QHMA1sYzmUCAh5CJN3t/s+/JfphIM8JUjShi1oRhhX4YDk59nAnl/lDXMSMWprw0kFmZJs3HTnYBInLW4CafyQ==",
1219:       "license": "MIT",
1220:       "dependencies": {
```

**RA-S036 — `packages/core/src/backend-toolkit/packs/protoc-gen-es.package-lock.json`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `14948253df8c32134e869f975a8e5f634dc44ad2` · SHA-256 `7bb67cf09c2d6fb3314b69705375ffda7bf68b2dda8f7917941e97da41aa03bd` · 3392 bytes.

Linhas 6–11.

```text
6:     "": {
7:       "name": "backend-toolkit-protoc-gen-es",
8:       "dependencies": {
9:         "@bufbuild/protoc-gen-es": "2.16.0"
10:       }
11:     },
```

Linhas 18–23.

```text
18:     "node_modules/@bufbuild/protoc-gen-es": {
19:       "version": "2.16.0",
20:       "resolved": "https://registry.npmjs.org/@bufbuild/protoc-gen-es/-/protoc-gen-es-2.16.0.tgz",
21:       "integrity": "sha512-LbPrEaGd7bOxKbJHllTR5439+PZjqd6fM7xyDZkDVtZ+Efzr7TMdMqShG9Qkf/nYVyiNS/SK5r9JhRaBTFkfZw==",
22:       "license": "Apache-2.0",
23:       "dependencies": {
```

**RA-S037 — `packages/core/src/research-toolkit/packs/scip-python.package-lock.json`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `d6912c185ec9c376dca28c4246ba12e7385389d8` · SHA-256 `a9bf75b6185aad8130476c5c4234026ea059400241720e7db2b11c575eecdf03` · 28385 bytes.

Linhas 6–11.

```text
6:     "": {
7:       "name": "research-toolkit-scip-python",
8:       "dependencies": {
9:         "@sourcegraph/scip-python": "0.6.6"
10:       }
11:     },
```

Linhas 55–60.

```text
55:     "node_modules/@sourcegraph/scip-python": {
56:       "version": "0.6.6",
57:       "resolved": "https://registry.npmjs.org/@sourcegraph/scip-python/-/scip-python-0.6.6.tgz",
58:       "integrity": "sha512-qoKL1Rggg0o5newAFbCFAKlS0AjWxG5MA+mC28BtgxOv0DhO4zdL8u7151FxEppDpXMVvm7+yXSjXotoVH9cMQ==",
59:       "license": "MIT",
60:       "dependencies": {
```

**RA-S038 — `packages/core/src/research-toolkit/packs/scip-typescript.package-lock.json`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `e6b78e912d54fd5115fb0c4c804c41f175ac82c8` · SHA-256 `50c220b0739d12746c369da1296b8176737768b43b1ce393532f7cf306ceeb48` · 2274 bytes.

Linhas 6–26.

```text
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
23:       "bin": {
24:         "scip-typescript": "dist/src/main.js"
25:       }
26:     },
```

Linhas 51–56.

```text
51:     "node_modules/typescript": {
52:       "version": "5.9.3",
53:       "resolved": "https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz",
54:       "integrity": "sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==",
55:       "license": "Apache-2.0",
56:       "bin": {
```

**RA-S039 — `packages/core/src/research-toolkit/packs/typescript.package-lock.json`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `5b547b8a8d1157434b4aa5d1a46d4f4fee79651c` · SHA-256 `442acbeda058036d02d4f2483e19149512ebde276c57d65ad3aa664735ff0a76` · 667 bytes.

Linhas 6–24.

```text
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
23:       }
24:     }
```

**RA-S040 — `packages/core/src/backend-toolkit/packs/datamodel-codegen.wheels.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `6385060213d539fb5547b2aa3f342a721f5f2b8c` · SHA-256 `e1882f2135d3980986ac47eb35f30b3df45bfe63a3de1489bc4e04572e3ad02b` · 6586 bytes.

Linhas 1–24.

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

Linhas 76–93.

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

### RA2-P — Contagem MECÂNICA de campos dos sete locks

Procedimento: decodificar cada JSON integral fixado e contar entradas de `packages`, sem executar npm/pip. `resolved-registry` e `integrity-sha512` contam entradas não-root. Exceções sem integrity individual são examinadas em `inBundle`; não são apagadas nem substituídas. A tabela é cálculo de dados, não trecho literal e não certificação upstream.

| Lock | packages (com root) | resolved-registry | integrity-sha512 | sem integrity | todas as exceções inBundle | hasInstallScript | optional |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| `packages/core/src/backend-toolkit/packs/kysely-codegen.package-lock.json` | 66 | 65 | 65 | 0 | True | 0 | 1 |
| `packages/core/src/backend-toolkit/packs/modelina.package-lock.json` | 613 | 469 | 469 | 143 | True | 6 | 2 |
| `packages/core/src/backend-toolkit/packs/orval.package-lock.json` | 105 | 104 | 104 | 0 | True | 1 | 26 |
| `packages/core/src/backend-toolkit/packs/protoc-gen-es.package-lock.json` | 8 | 7 | 7 | 0 | True | 0 | 0 |
| `packages/core/src/research-toolkit/packs/scip-python.package-lock.json` | 62 | 61 | 61 | 0 | True | 0 | 20 |
| `packages/core/src/research-toolkit/packs/scip-typescript.package-lock.json` | 6 | 5 | 5 | 0 | True | 0 | 0 |
| `packages/core/src/research-toolkit/packs/typescript.package-lock.json` | 2 | 1 | 1 | 0 | True | 0 | 0 |

O lock Modelina integral de 266.885 bytes continua em `sources/`, com a mesma identidade de captura. Este suplemento seleciona campos; não o substitui como input nem modifica o bloqueio de transporte informado pela principal.

## RE-A3

### RA3-01 — prepare/prefetch: variável, espera, PATH e estado por engine

**RA-S047 — `packages/core/src/backend-toolkit/index.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` · SHA-256 `d420651f26050d31c924b078a59fff12081be914cb8cb94685aad720a9275d9a` · 15426 bytes.

Linhas 65–65.

```text
65: const PREPARE_MS = 60_000
```

Linhas 86–134.

```text
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

### RA3-02 — Allowlist e HOME/config privados; Go/Cargo e limites

**RA-S048 — `packages/core/src/backend-toolkit/diagnostics.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `82c79df31ad65365a2945d516a2e890e2da0d9af` · SHA-256 `d556fb8a95fdaff9ca4ec23b8ff137f37c3a7547c8ceb4d2d83810e7c2c86814` · 1795 bytes.

Linhas 18–29.

```text
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

**RA-S049 — `packages/core/src/backend-toolkit/attempts.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `320456d5837420999da0034870cedf86b5b8dc05` · SHA-256 `75382ae48fcc113ed71ea4a61d4122dc24b5ad5c6e4f3d5af52d3938688290eb` · 1652 bytes.

Linhas 20–23.

```text
20: // A failed fetch is retried by a later need after this window, not by every command.
21: const RETRY_MS = 5 * 60_000
22: // A cold cargo build of a CLI with its whole dependency graph takes minutes.
23: export const INSTALL_MS = 30 * 60_000
```

**RA-S050 — `packages/core/src/backend-toolkit/hosted.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `987657dcb1ce8d9cc9f623713673f99dd376e86c` · SHA-256 `6d3ea35691832eddb90ce8563679390a1030b71d636a01a4c5cd59ad78ebeb34` · 11390 bytes.

Linhas 61–70.

```text
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
```

Linhas 79–99.

```text
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
```

Linhas 101–146.

```text
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
```

Linhas 179–210.

```text
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
```

### RA3-03 — Parser e caminhos do guard OpenAPI

**RA-S051 — `packages/core/src/backend-toolkit/project-version.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `00be68470409c48e585aa1ab764e6d8872ddd44e` · SHA-256 `c82bf83182a6d03b13755e5c97eed67bf4dd8298226bd9f79277c94bff94e263` · 11911 bytes.

Linhas 18–30.

```text
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
```

Linhas 50–60.

```text
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
```

Linhas 82–107.

```text
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
106:   return options
107: }
```

Linhas 109–148.

```text
109: function inside(root: string, file: string) {
110:   const relative = path.relative(root, file)
111:   return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
112: }
113: 
114: // Walk from the canonical project, checking each existing component before reading any bytes.
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
```

Linhas 151–185.

```text
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
```

Linhas 187–214.

```text
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

### RA3-04 — Cassandra: inputs, staging/replace, licença/notices, modos e túnel

**RA-S052 — `packages/core/src/backend-toolkit/cassandra-metadata.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `be309cc1fe2edeeefe82c5c042987a26622d964a` · SHA-256 `adffa5bbb4e9ab695e7879cf4db83d4982562e69aa74b60b7a016072079428cb` · 5323 bytes.

Linhas 10–44.

```text
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
```

Linhas 46–79.

```text
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
```

Linhas 82–87.

```text
82: function requireHash(bytes: Uint8Array, expected: string, name: string) {
83:   if (createHash("sha256").update(bytes).digest("hex") !== expected) throw hold(`${name}-hash-mismatch`)
84: }
85: 
86: const read = (file: string, name: string) => Effect.tryPromise({ try: () => readFile(file), catch: () => hold(`${name}-unreadable`) })
87: const hold = (reason: string) => new PinnedArtifact.Failed({ cause: `compatibility:cassandra-metadata:${reason}` })
```

**RA-S053 — `packages/core/src/backend-toolkit/cassandra-dialer.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `94282bf8f1c851b477f80a57b006df309c243c67` · SHA-256 `3943c718ce59b671dcbd21085bd1907ad5d91de0f0e2fc34e5b2d7f85dc1e2da` · 8978 bytes.

Linhas 12–34.

```text
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
```

Linhas 129–188.

```text
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
```

## RE-A4

### RA4-01 — Caps, engine ausente e estados de shard

**RA-S054 — `packages/core/src/research-toolkit/index.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` · SHA-256 `9c1bfe5c5a7bc0c8d4d1f835e61031e0cca06b9ed6567415d9d04ff6e84b599c` · 14147 bytes.

Linhas 30–67.

```text
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
```

Linhas 69–83.

```text
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
```

Linhas 111–143.

```text
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
```

Linhas 221–235.

```text
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
```

Linhas 251–254.

```text
251: function unshipped(id: ResearchEngineId): State {
252:   return { engine: id, version: "none", status: "unsupported", reason: "pack-not-shipped" }
253: }
254: 
```

### RA4-02 — Git, .pyi, descoberta por projeto e órfãos

**RA-S055 — `packages/core/src/research-toolkit/code-index/shard.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `2065d1521347762a7ea3599f97ff9c2f96d9036c` · SHA-256 `5177e7c28ec2351c637e199497126c1cf5ee19eba364705b2feedc84d27fb7f0` · 10497 bytes.

Linhas 38–51.

```text
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
```

Linhas 54–78.

```text
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
```

Linhas 87–97.

```text
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
```

Linhas 112–126.

```text
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
```

Linhas 128–179.

```text
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
```

### RA4-03 — Memo de plano, build em curso, singleFlight e falhas

**RA-S056 — `packages/core/src/research-toolkit/code-index/build.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `b89de3c2f4a985c08e5789020bbf3fcf4fc5b251` · SHA-256 `bd648215442616d09b710190ee5e22fb4e9f82890bc2967430724954734f7425` · 6330 bytes.

Linhas 47–74.

```text
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
```

Linhas 81–122.

```text
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

**RA-S057 — `packages/core/src/research-toolkit/code-index/store.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `f71cdf0ae1979f002fce68b53eae445647682d73` · SHA-256 `570a81a04360d060a7c67a436e531b4c079ba7a9951130a2648ca986846b5e11` · 13372 bytes.

Linhas 86–123.

```text
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
```

### RA4-04 — Store: transação, rename, leitura scoped e manifesto

**RA-S057** — mesma fonte e identidade declaradas acima.

Linhas 126–172.

```text
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
```

Linhas 177–195.

```text
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
```

Linhas 203–223.

```text
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
```

### RA4-05 — Adapter real: plataforma, ordem do fallback, HEAD e processo SCIP

**RA-S058 — `packages/core/src/research-toolkit/code-index/extract.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `ccd710035774d754490d00f36eb16c0103355175` · SHA-256 `80b2e9c6091bb6c342bfefa9582bd164fc5dffc239cdf67417dba4c0e79747af` · 22551 bytes.

Linhas 63–100.

```text
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
```

Linhas 107–149.

```text
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
```

Linhas 181–225.

```text
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

## RE-A5

### RA5-01 — Filtro, bytes, parse parcial, exports e imports

**RA-S059 — `packages/core/src/research-toolkit/code-index/filter.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `55fff12895cfcd287ebcf6e78a3b60933726ae98` · SHA-256 `4f64a348c5e6e2343c3451de78f32f832579576183eeba21a40c7051989cdf0a` · 3739 bytes.

Linhas 10–36.

```text
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
```

Linhas 52–79.

```text
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

**RA-S060 — `packages/core/src/research-toolkit/code-index/tree-sitter.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `b470c5e20ba95693296a1ac4d2520ac4bc1a10d5` · SHA-256 `b0e13b1436402cd34060218f8845de757486769df22824a357bbc05dfc39d8e2` · 16595 bytes.

Linhas 19–19.

```text
19: export const MAX_BYTES = 2 * 1024 * 1024
```

Linhas 54–79.

```text
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
```

Linhas 120–153.

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
```

Linhas 163–196.

```text
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
```

Linhas 210–267.

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

### RA5-02 — SCIP: defaults/UTF-16/span e memo global de duas entradas

**RA-S061 — `packages/core/src/research-toolkit/code-index/scip.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `2e8f9fa18bf6661bc7510dae3106010ef0babf81` · SHA-256 `fa1f6dee8938ca64e416758acedf759e44904e1a8d6a44c0778ae610ee9f9947` · 10599 bytes.

Linhas 12–26.

```text
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
```

Linhas 69–110.

```text
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
```

Linhas 117–133.

```text
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
```

Linhas 153–162.

```text
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
```

Linhas 199–224.

```text
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

### RA5-03 — enclosing e callers: associação, canonicalização e resolução

**RA-S062 — `packages/core/src/research-toolkit/code-index/enclosing.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `bc64ec6b4850f673d603aa76096d328300c692ad` · SHA-256 `5abb45da734f51ab5446e6bbe34868e890d65fa9bde57e6e9a40251386379cd6` · 4930 bytes.

Linhas 31–79.

```text
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
```

**RA-S063 — `packages/core/src/research-toolkit/code-index/callers.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `dbfb863c0f57df3b85f33456188a1532e9cffe6c` · SHA-256 `c5f23cb31a51945af79347ffe03db97c1ff7f184abc22d99c13c852bb48ed39c` · 6727 bytes.

Linhas 13–25.

```text
13: export const SUPPORTED_INDEXER = "scip-typescript"
14: 
15: export type Site = { readonly path: string; readonly line: number }
16: 
17: export type Resolution =
18:   /** An in-index definition, directly or after canonicalization; `symbol` is the defined (source) form. */
19:   | { readonly kind: "resolved"; readonly symbol: string }
20:   /** A document-scoped local with a local definition in the same document. */
21:   | { readonly kind: "local" }
22:   /** A local with no local definition in its document: a cross-package reference the indexer collapsed. */
23:   | { readonly kind: "opaque" }
24:   /** A global symbol with no in-index definition, such as a library outside every shard. */
25:   | { readonly kind: "unresolved" }
```

Linhas 38–125.

```text
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
```

### RA5-04 — Adapters Go, Python e Rust

**RA-S064 — `packages/core/src/research-toolkit/code-index/go.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `cd3dd8cc3bf0af5848bb10a303e01ce41ad42eda` · SHA-256 `caec6569041361ba4ab456923846ddccc104006086b8c6a1901296b0a6aa45b9` · 3561 bytes.

Linhas 15–63.

```text
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

**RA-S065 — `packages/core/src/research-toolkit/code-index/python.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `bd6f5a72c2d9a5682abdd1db06233e4085b174fd` · SHA-256 `6388a271df4127e60855282f05052cc12c54ba8f86e039fe2f369a83a6aec48b` · 1186 bytes.

Linhas 4–22.

```text
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

**RA-S066 — `packages/core/src/research-toolkit/code-index/rust.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `9fb795b9e7b368f4596a781516e942ec760ae020` · SHA-256 `0f3bd2e8e7615b3fb8ce0770fc66c1a00a371c20e04e0798c250b1d107058c1c` · 5480 bytes.

Linhas 15–80.

```text
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
```

Linhas 85–103.

```text
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

### RA5-05 — Resolução TS/Python/workspace e PageRank

**RA-S067 — `packages/core/src/research-toolkit/code-index/resolve.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `c8ddb8e3acb6059962605907e00c6b37422ed2c3` · SHA-256 `e864ec0f1d25d9d81ce880c450feb4f0adf28cd79d32b0f665d753420a0fa8ba` · 8917 bytes.

Linhas 21–77.

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
```

Linhas 93–141.

```text
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
```

Linhas 157–164.

```text
157: function pythonRoots(root: string, dir: string, exists: (file: string) => boolean): string[] {
158:   const project = PYTHON_ROOTS.some((name) => exists(path.join(dir, name)))
159:   if (project || path.relative(root, dir) === "" || path.relative(root, dir).startsWith("..")) {
160:     const base = project ? dir : root
161:     return [path.join(base, "src"), base]
162:   }
163:   return pythonRoots(root, path.dirname(dir), exists)
164: }
```

**RA-S068 — `packages/core/src/research-toolkit/code-index/rank.ts`**

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38` · Git blob `47f1ac907480aa33ac17a1d0d2a6557345e4d1ba` · SHA-256 `4bf06c19df12dba5c60d6118ca7693951e7d857254cda46b43c6b716007d8911` · 3043 bytes.

Linhas 9–19.

```text
9: const DAMPING = 0.85
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
```

Linhas 24–58.

```text
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

## Proposta separada de precisão textual do memo

A evidência literal RA5-02 inclui `const memo = new Map<string,...>()`, `MEMO_LIMIT = 2`, `memo.get(file)`, substituição por `memo.set(file, ...)` e evicção por `memo.size`. O índice registra uma proposta mínima **não aplicada** para explicitar duas entradas no total, uma por path, com validação por mtime/size. `body.md` permanece no SHA-256 congelado acima; a proposta não é parecer semântico.
