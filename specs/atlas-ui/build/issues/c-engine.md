# Lane C (engine + surface) · issues and the fixes the briefs assume

Briefs C01a–C01f implement D29–D31, D35 and D36's `promote` amendment on the Atlas side. Each item: what does not fit the decision as written, the
evidence, and the fix the briefs already apply. Items 1, 2 and 7 need a lead check before C01d, C01e and C01f run; the rest are
recorded so the host brief (C02) and the screen brief (C03) build on the same shapes.

## 1. D35 `site: string`, but the engine's `site` is a `StructRef` (lead check, C01d)

`RankedQuestion extends OpenQ` (`modules/atlas/packages/genesis/src/types.ts:99-104`), and `OpenQ.site` is a
`StructRef` (`{ kind, qualifiedPath, subtreeHash }`, `packages/contracts/src/struct.ts:20-49`). `deriveOpenQuestions`
builds it with `fileSite(path)` / `directorySite(path)` (`genesis/src/open-questions.ts:174-180`), so `qualifiedPath` is
the repository-relative file or unit path.

Fix assumed by C01d: `AtlasInterviewQuestion.site` is `q.site.qualifiedPath`. The `kind` and `subtreeHash` are not on
the wire. `rankReason` is not on the wire either, because D35 does not list it.

## 2. D35 `AtlasTerritoryInput` has no project id, so the screen cannot declare the first territory (lead check, C01e)

`declareTerritory` (`adapter-io/src/territory-write.ts:40-46`) refuses when no `TERRITORY-CATALOG.json` exists and no
`projectId` is given: "no TERRITORY-CATALOG.json exists yet: --project <id> names the project the first catalog is for
(the Orchestra project id)". The catalog's `projectId` must be the Orchestra project id the host verifies against. The
surface only knows `repoPath`, so it cannot supply that id.

Fix assumed by C01e: `AtlasTerritoryInput` gains one optional field, `projectId?: string`, passed through to
`declareTerritory`. With a catalog already on disk it must match it or is refused, as in the CLI. C02 (host) fills it
with the instance's Orchestra project id, so the user never types it. Without this field the R4 "Declare territory"
sheet works only once a catalog exists. If the lead rejects the field, delete it from C01e step 1 and from the
`territory` body. The first-catalog test case then expects the refusal.

## 3. Result shapes D29/D30 name but do not define (no check needed)

The briefs define these. C02 maps them only through the surface's `AtlasVerdict`, so they never reach the wire:
- `EmitOutcome = { emitted: boolean; id?: string; rejected?: string }`. This is the CLI's former `EmitResult`, which
  moves to `review-decide.ts` with `emitOutcomeOf(verdict)`, the former private `emitResultOf`.
- `ReviewRefusal = { ok: false; refusal: "invalid" | "governed"; reason: string }`, in `review-log.ts`. `invalid` is
  the CLI's exit 1 (`usageError`) and `governed` is exit 2 (`governedRefusal`). `reason` is the exact text both show.
- `DecideResult = { ok: true; proposal; decision; emittedId? } | ReviewRefusal`.
- `AnswerResult = { ok: true; question; answer; proposal?; pending? } | ReviewRefusal`.
- `DecisionVerdict = { ok: true; decisionId; ref? } | MemoryRejected | { ok: false; refusal: "proposal-not-open"; reason }`.

`decideProposal`, `answerQuestion` and `interviewOf` keep D29's call shape. Each also takes one optional trailing
argument (`factOf`, or `questions`) that defaults to the real store read. The CLI passes its existing ports through it,
so the CLI tests keep their in-memory fakes and the surface calls the D29 shape unchanged.

The prefix rule (an exact id, or a unique prefix of at least 8 characters) moves with the helpers:
`cli/review-common.ts resolveId` becomes `adapter-io/review-log.ts resolveReviewId`. The `foldOrRefuse` message moves
to `foldReviewLog`, and `REVIEW_INVARIANT` moves to `review-log.ts`. The CLI imports all three, so no text changes.

## 4. D31 refusal wording versus CLI no-ops (no check needed)

- `atlas hold` on a held key exits 0 ("already held — nothing was written"). D31 lists it as a refusal, so the surface
  answers `ok: false` with that exact text.
- D31 says that a missing actor is a refusal. `territory` writes no `by` (the CLI takes no `--by`; its authority is the
  ratify token), so the surface's territory write does not require an actor. The other six writes do.
- `review().unreadable` is true when the log could not be read OR has lines that do not verify. What did verify is
  still served, and every review write refuses with the `foldReviewLog` text until the log is repaired.

## 5. Godfile and ledger arithmetic (no check needed)

- The Atlas godfile gate (`harness/gates/godfile-guard.mjs`) FAILS above 600 lines and warns above 400. The 750 figure
  is the Orchestra cap; it does not apply here. `native-memory.ts` is at 558 lines, so `decideProjectRule` is written
  compact and leaves the file at about 593. `surface/types.ts` grows from 397 to about 421, which warns and passes.
- The reference-model ledger: `decideProjectRule` has no production caller between C01c and C01e. C01c moves the
  `native-memory.ts` row from 4 to 5 and `dead-value-exports` from 133 to 134, and C01e moves them back when
  `surface/review.ts` calls it. Every other new export has a CLI or surface caller in the task that adds it.

## 6. Boundary regeneration is not in these briefs

D26 has C01 regenerate `@orchestra/atlas-boundary`. C01a–C01e only change `modules/atlas/packages/**`. The lead
regenerates the boundary (the A06 procedure) after C01f, before C02.

## 7. D36 `promote` over a review log that does not verify (lead check, C01f)

`atlas promote` refuses the whole pass when the review log has a line that does not verify. A torn line could be the
very hold the pass would miss (`cli-dispatch.ts:263-266`). `AtlasPromote` has no field for that refusal: its
`refusal` is the staging read's `"contended" | "unreadable" | "untrusted"`.

Fix assumed by C01f: the surface answers `{ state: "ok", read: false, refusal: "unreadable", candidates: 0, promoted:
0, refused: 0, rows: [] }` and presents nothing. The screen already renders `read: false` as a refused pass. The review
queue's `unreadable: true` (C01d) tells the person which log is at fault. `AtlasPromote` also gains `PromoteOut`'s
optional `held` and `unknown`, mirrored field for field. An empty `nodeKeys` list means every row, as in the CLI.
