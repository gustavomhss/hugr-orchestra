# Rag Studio — work packages

`plan-check` ok. `conflict-map` conflict-free. Contract `fb61d451`. Not dispatched.

Each package writes one file and turns its ids green. It imports `seam.ts`. It does not redeclare a signature. It does not edit `api.ts`, `chapter-route.tsx`, `navigation.ts`, `module-architecture.json`, or `packages/core/src/rag-studio/sql.ts`. Those are the lead's.

A package is done when its ids pass and the contract hash is still `fb61d451`. J-ids are the owner's, not a green test.

## Engine

| WP | File | Ids |
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

## Screens

| WP | File | Ids |
| --- | --- | --- |
| wp-ui-files | `packages/app-shell/src/orchestra/chapters/rag-studio/files.tsx` | J02 J05 J09 |
| wp-ui-question | `packages/app-shell/src/orchestra/chapters/rag-studio/question.tsx` | J01 J04 J06 J07 J10 |
| wp-ui-maintain | `packages/app-shell/src/orchestra/chapters/rag-studio/maintain.tsx` | J03 J08 |

## Tasks

The task is the id. There is no second list. Order when the owner says go:

1. Lead writes the sql file, the HTTP group, and the chapter register.
2. Engine packages, at most six at a time. They do not share a write.
3. Screen packages after `ask` and `runPass` return real data.

## Closed

Do not split these packages again. Do not merge them into one module file. Do not add embedding, a preview route, a reindex button, or a chat. Do not dispatch until the owner says so.

## Convergence packaging — 2026-11-09

The Block 2 disposition in `WAVE.md` supersedes the original dispatch order above. Package code imports types from the byte-identical `modules/rag-studio/src/seam.ts` copy; the documentary seam remains frozen. The integration owner maintains that copy, shared context, SQL and package registration. Work packages do not edit those files or import the stub functions as implementations.
