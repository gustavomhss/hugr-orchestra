# E2E findings — remediation (FROZEN decision-record)

> The user-simulating black-box suite (`packages/e2e-blackbox`) surfaced 7 findings, all lucy-verified.
> Owner 2026-07-20: fix ALL. 6 file-DISJOINT WPs (no shared-contract freeze — each against existing frozen
> types), fan out ≤6 concurrent. Each cold-reviewed (F3→billy, F1→bobby, all→lucy). red→green: the fix flips
> the story that documented the gap.

## WP-F1 — wire symbol-level anchors so `subsumes` fires (the keystone)

FINDING: `foldAstUnits` (`adapter-io/src/ast.ts:188`, FileTree→FileTree adding `::` AST units) is imported
but only `void`-referenced (`wire.ts:167`); the index builds file/dir nodes only → every grounded fact's
anchor is a file path (no `::`) → `deriveSubsumes` (needs proper `::` containment) is dead on real data.
FIX: wire `foldAstUnits` into the FileTree pipeline BEFORE `build(...)` in the composition (compose.ts /
wire.ts — where `walkFileTree` feeds `build`), handling the `initAst()` grammar warmup (ast.ts:15-28). After
this, a fact grounded at a symbol gets a `::` anchor and a module⊃function claim pair derives a `subsumes`.
Flip the S3 story: the `.todo`/absent-subsumes assertion becomes a POSITIVE subsumes assertion.
FILES: `packages/adapter-io/src/{wire.ts|compose.ts, ast.ts}`, `packages/e2e-blackbox/test/s3-dedup.blackbox.test.ts`.
REVIEW: bobby (arch — index granularity) + lucy.

## WP-F3 — governed write door MINTS identity (integrity)

FINDING: `governed-emit.ts` routes `upsert` on `nodeKey: node.id` (author-supplied payload) — an author can
spoof/collide/dodge dedup identity. FIX: recompute `nodeKey(node)` (the real identity formula, already used
for `contentHash`/`primaryAnchor`) and route on THAT, never the payload `node.id`. Verify no other emit
constructor (mine.ts) trusts payload id. FILES: `packages/adapter-io/src/governed-emit.ts` (+ check mine.ts).
REVIEW: billy (exploitability: identity forgery) + lucy.

## WP-F2F5 — fail-closed is legible on BOTH doors

FINDING (F2): `handler.ts:157` wraps every leg return `ok:true` — an emit `EmitOut{emitted:false}` is a
NON-error over MCP (`server.ts` sets `isError` only on `ok:false`); a naive agent sees success. FINDING (F5):
the CLI never renders `data.rejected` (the reason). FIX: in the handler, map a fail-closed emit
(`data.emitted === false`) → `{ ok:false, rejected: data.rejected, guidance }` — uniform across doors (MCP
`isError:true`, CLI exit 2 via the standard `ok:false` path; drop any CLI emitted:false special-case). Render
`v.rejected` on the CLI (`render.ts`). Flip S2 (CLI shows reason) + S5 (MCP `isError` on fail-closed emit).
FILES: `packages/tools/src/handler.ts`, `packages/cli/src/render.ts` (+ deriveStatus), `packages/e2e-blackbox/test/{s2-guardrails,s5-mcp-parity}.blackbox.test.ts`.
REVIEW: lucy (governance legibility).

## WP-F4 — `--at <sha>` (space form) accepted

FINDING: `parse.ts` treats `--at` as a bare boolean → `atlas emit f --at <sha>` drops the sha; only
`--at=<sha>` works. FIX: parse `--at` as a valued flag (accept both `--at=<sha>` and `--at <sha>`).
FILES: `packages/cli/src/parse.ts` (+ marshal/tests). REVIEW: lucy.

## WP-F6 — `mine` abstain-by-design is DOCUMENTED, not faked

FINDING: `atlas mine` writes 0 grounded candidates. VERDICT: NOT a bug — honest fail-closed: the extractor
abstains without a model wired (`genesis/extract.ts:118` "model abstained"); forcing candidates would
fabricate ungrounded facts (violates the thesis). FIX: make the abstention LEGIBLE — a clear `mine` render
line ("0 candidates: no proposer model wired — abstain-by-design, never fabricated") + a short doc/comment.
Do NOT invent a fake miner. FILES: `packages/cli/src/mine.ts` (message) + a doc note. REVIEW: lucy.

> RESOLVED (WP-F6): mining is MODEL-GATED and fails CLOSED by default. With no proposer wired the extractor
> abstains at every site (`genesis/extract.ts:118`) rather than fabricate an ungrounded fact; a default pass
> seeds 0 candidates BY DESIGN, not by error. `mine.ts` now renders `MINE_ABSTAIN_LINE`
> (`mine: 0 candidates — no proposer model wired (abstain-by-design; facts are never fabricated)`) whenever a
> 0-candidate run is caused by the absent model, so the abstention is legible. No fake miner was introduced —
> facts still come solely from real gate verdicts (GEN-6).

## WP-F7 — `reconcile` stops leaking git worktree chatter to stderr

FINDING: `rev-index.ts` `git worktree add` writes progress to stderr (stdout stays clean/deterministic).
FIX: silence that git invocation's stderr (`stdio: 'ignore'` on the worktree-add, keep error surfacing on
real failure). FILES: `packages/adapter-io/src/rev-index.ts`. REVIEW: lucy.

## Conflict map — CONFLICT-FREE

adapter-io: F1(wire/compose/ast) · F3(governed-emit) · F7(rev-index) = distinct files. cli: F2F5(render) ·
F4(parse) · F6(mine) = distinct files. tools: F2F5(handler). e2e tests: F1(s3) · F2F5(s2,s5) = distinct
files. No WP changes an interface another consumes → no contract freeze. Merge order: F1 last (largest;
touches shared compose path) after the small fixes land + rebuild.
