# TechLead WAVE PLAN — rag-studio-v1

Official cut: `work-packages.md`. `plan-check` ok. `conflict-map` conflict-free. Contract `fb61d451`. Seam from `stub-gen`: `seam.ts`. Not dispatched.

The four-package note in `TASKS.md` is withdrawn. It dropped the ownership the tool had already checked.

Baseline: `f927028fe5` (branch `rag-studio`). Data: 4 de novembro de 2026.
Contrato: `docs/specs/rag-studio/CONTRACT.md`, hash `fb61d451`.
Suíte: `docs/specs/rag-studio/ACCEPTANCE.md`. Crítico frio: duas passagens seguidas sem furo novo. Itens ausentes no runner, portanto vermelhos. Nenhum teste foi executado; a ausência é o vermelho.

```
GO/NO-GO     : HYBRID, não disparado
DISJOINTNESS : shared-file eliminated. api.ts, navigation.ts, chapter-route.tsx
               e module-architecture.json ficam com o lead. Cada WP escreve um arquivo.
CONTRACT     : frozen, docs/specs/rag-studio/CONTRACT.md #fb61d451
CONFLICT-MAP : CONFLICT_FREE em todos os pares. parallelSafe true.
CAP          : 6 por leva, quando o dono mandar implementar. Não nesta sessão.
RETURN-SHAPE : não se aplica. Nada foi despachado.
DOD          : suíte vermelha→verde, mais typecheck do pacote e check:guards.
               J01–J10 não ficam verdes sozinhos. São julgamento do dono.
MERGE ORDER  : lead registra o capítulo e o grupo HTTP; depois as fatias, em levas de 6.
```

| WP | escreve | dono de |
| --- | --- | --- |
| wp-admit | `modules/rag-studio/src/admit.ts` | A01 A02 A03 A76 |
| wp-refuse | `modules/rag-studio/src/refuse.ts` | A04 A77 A95 A47 |
| wp-parse | `modules/rag-studio/src/parse.ts` | A05 A07 A51 A08 |
| wp-span | `modules/rag-studio/src/span.ts` | A12 A19 |
| wp-revision | `modules/rag-studio/src/revision.ts` | A15 A16 A70 A93 |
| wp-search | `modules/rag-studio/src/search.ts` | A52 A74 A79 A48 |
| wp-embed | `modules/rag-studio/src/embed-off.ts` | A65 A83 A87 A92 |
| wp-trace | `modules/rag-studio/src/trace.ts` | A20 A21 A59 A75 |
| wp-lights | `modules/rag-studio/src/lights.ts` | A22 A23 A24 A62 |
| wp-drop | `modules/rag-studio/src/prompt.ts` | A25 A26 A27 A71 |
| wp-report | `modules/rag-studio/src/report.ts` | A58 A61 A63 A78 |
| wp-proof | `modules/rag-studio/src/proof.ts` | A28 A29 A30 A31 |
| wp-compare | `modules/rag-studio/src/compare.ts` | A33 A73 A60 A82 |
| wp-guard | `modules/rag-studio/src/guard.ts` | A84 A66 A89 A91 |
| wp-reparse | `modules/rag-studio/src/reparse.ts` | A67 A85 A96 A55 |
| wp-rechunk | `modules/rag-studio/src/rechunk.ts` | A81 A68 A88 A94 |
| wp-fill | `modules/rag-studio/src/fill.ts` | A35 A36 A69 A80 |
| wp-orphan | `modules/rag-studio/src/orphan.ts` | A49 A56 A72 A97 |
| wp-isolate | `modules/rag-studio/src/isolate.ts` | A86 |
| wp-ui-files | `packages/app-shell/.../rag-studio/files.tsx` | J02 J05 J09 |
| wp-ui-question | `packages/app-shell/.../rag-studio/question.tsx` | J01 J04 J06 J07 J10 |
| wp-ui-maintain | `packages/app-shell/.../rag-studio/maintain.tsx` | J03 J08 |

`plan-check`: ok. Nenhum item sem dono. Nenhuma escrita compartilhada.

## Block 2 convergence disposition — 2026-11-09

Astra via GitHub MCP, by owner directive. This section supersedes the original merge/dispatch order above; it does not mark an acceptance item green.

- Start from Board snapshot `b164c3d52540612fed56267e801e7c01a3efcb48`, preserving its J1 corrections and receipt.
- The first candidate is isolated foundation + admit. Reuse the shared foundation from `1b67aee2c62df880c3f384ee3305912f54dfe227` and `8d75753364cf779791e3a047a9358861c71dbe97`, then the admit slice `9138b677fda57d13c2fa31da83e0c578bf48a5ee`. Transplant those paths onto the Board snapshot; do not merge the unrelated ancestry of the old RAG base.
- Keep one shared context and SQL definition. The SQL and admit test stay byte-preserved. The context and admit change only their type-import paths to the byte-identical package-local seam. Workspace/lock entries are applied to the Board versions, not copied wholesale.
- Register the package for the test runner and boundary checks, and assign the SQL path to the Core domain. This is package integration, not HTTP or visible chapter registration.
- The lead cold-checks the diff and runs package/Core typechecks, focused admit tests, README checks, boundaries and guards. The first manual merge is this candidate into a convergence branch based on the Board snapshot, only after those checks. No automatic PR, merge or deployment.
- Preserve the remaining candidates: parse `6b2cf947dcf779aad8097938ac15099da88a98bc`, search `9f7a90d6944a0a42ebee8b482a6fcb3530913e83`, proof `948db45b017603a90ba6d64151d256e0e4657bc3`. Bring each slice's source and test once, retargeting only its seam type import before separate functional corrections.
- Next establish the real host storage/permission boundary, revision/fill and one composition path each for `ask` and `runPass`. Then converge admit/refuse, parse/span, search, trace/prompt/lights/report, proof/compare and the separate maintenance passes by their acceptance dependencies. A memoryStore test is not proof of filesystem, PermissionV2, SQLite or HTTP integration.
- Parse initially writes chunks; `runPass("reparse")` must not be delegated to that operation because reparse writes no chunks. Define how revision membership, pipeline/K, the saved question and its trace remain associated before closing search/proof.
- The owner must accept the corrected Board J1 before work on the visible RAG cockpit. UI packages also require `ask` and `runPass` returning real data and the required source/revision/proof-set data available through the allowed client paths. No silent extension of the frozen seam.
- Technical acceptance and RAG J01–J10 remain open until their own evidence and owner judgments exist. No local execution or CI result is claimed by this commit.
