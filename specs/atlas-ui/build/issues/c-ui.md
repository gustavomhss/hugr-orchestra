# Lane C, UI · issues and the fixes the briefs assume

Briefs C03a–C03f and C04c (the screen side of D34). Each item records what D31–D35 cannot carry as written, or a
choice they leave open, with the fix the briefs already apply. Items 1 and 2 need the lead before the named brief runs.

## 1. Accept on one staged candidate needs `promote` by key, and the screen's promote must skip held rows (C01, C02a → C03b)

- **Evidence.**
  - The engine already has both: `createGovernedPromote(...).promote(at, select?: PromoteSelect)` with
    `PromoteSelect = { only?: readonly string[]; held: ReadonlySet<string> }`
    (`modules/atlas/packages/adapter-io/src/governed-promote.ts:96-101`, `:140`). `atlas promote [nodeKey...]` passes it
    (`cli/src/promote.ts:115`).
  - The surface does not: `surface/index.ts:123-126` calls `composeWith(repoPath, input.token).promote(asHash(...))` with
    no `select`, and `AtlasPromoteInput` is `{ token? }` (surface `types.ts:347-349`, host `groups/atlas.ts:327`).
  - D31 adds `hold`/`release` but no keyed promote. D34 lists "R2 Keep/Accept on a staged candidate (hold/release)".
- **Two consequences.**
  - The screen's "Promote all" (`PromoteAllSheet`) would promote held rows, so a hold made on the screen would not
    survive the screen's own next promote (R2 acceptance: "manter no staging sobrevive ao próximo promote").
  - "Accept" (promote this one row) cannot be built: `release` only undoes a hold, it promotes nothing.
- **Fix the briefs assume.**
  - C01: surface `promote(input)` takes `nodeKeys?: string[]` and always passes
    `{ only: input.nodeKeys, held: <held keys folded from the review log> }`, the same fold `atlas promote` uses.
  - C02a: `AtlasPromoteInput = Schema.Struct({ token: Schema.optional(Schema.String), nodeKeys:
    Schema.optional(Schema.Array(Schema.String)) })`. The SDK's `promote` then takes `nodeKeys?: Array<string>`.
  - C03b: "Keep for later" writes `hold`; on a held row the screen shows "Kept for later" and "Put back" (`release`);
    "Accept" calls `promote({ nodeKeys: [key] })` and shows the existing promote-result sheet.
  - C03b's "Read first" stops when the regenerated `promote` has no `nodeKeys`.

## 2. "Add rule" has no write to propose a person's rule (C03d)

- **Evidence.** D34 wants Add rule as "the person's rule is proposed then indexed in one action". D31's only memory write
  is `memoryDecide({ proposalId, ... })`, which needs an existing proposal. No D31 write appends a `memory-proposal`.
  The engine has `proposeProjectRule` (C-R1), but only the seat's `atlas_memory_emit` reaches it, and it proposes as the
  member, not as the person.
- The same gap covers "Index…" on a lesson read from a task checkpoint. A lesson is not a proposal, so it has no
  `proposalId`.
- **Fix the brief applies (C03d).**
  - Add rule and a lesson's Index stay disabled, keep the `R1` dot, and carry a tip that names the missing step.
  - Index and Discard on the member's real proposals (`review().memoryProposals`) are wired through `memoryDecide`.
  - The rule sheet now opens only for a real proposal.
- **To close R1 fully, later.** Add a D31 write `memoryPropose({ member, rule, scope })` that returns the proposal id.
  Add rule then chains it with `memoryDecide({ verdict: "indexed" })`, and a lesson's Index does the same.

## 3. A tier answer must be exactly `T1` or `T0` to open a proposal (C03e, C04a)

- **Evidence.** The engine's tier options read `"Rule · T1"`, `"Core · T0"` and `"Keep as a hint"`
  (`genesis/src/open-questions.ts:88`). The answer path proposes only when the answer is exactly `"T1"` or `"T0"`
  (`cli/src/interview-cli.ts:64`; D29's `answerQuestion` is ported from it).
- **Fix (C03e).** `interviewAnswer(question, index)` in `views/genesis-data.ts` sends tier option 0 as `"T1"`, option 1
  as `"T0"`, and every other option as its own text. It is tested.
- **For the lead (C04a).** A drafted tier answer is accepted as its exact text. So the delegate prompt should tell the
  model to answer a tier question with exactly `T1`, `T0` or `Keep as a hint`. Otherwise an accepted draft records an
  answer but opens no proposal. C04a is not changed by these briefs.

## 4. The SDK method names are assumed from the operation identifiers (C03a, C04c)

- **Evidence.** The generator names each method after the last segment of the OpenAPI identifier: `atlas.promote` →
  `Atlas.promote`, `find.text` → `Find.text`, `experimental.controlPlane.moveSession` → `moveSession`
  (`packages/sdk/js/src/v2/gen/sdk.gen.ts`). C02c and C04b use the identifiers `atlas.review`, `atlas.hold`,
  `atlas.release`, `atlas.propose`, `atlas.decide`, `atlas.answer`, `atlas.memoryDecide`, `atlas.territory` and
  `atlas.delegate`.
- **Assumed methods.** `sdk.client.atlas.review / hold / release / propose / decide / answer / memoryDecide / territory /
  delegate`. Each takes `directory` plus the payload fields, flattened, the same way `promote` does.
- C03a's "Read first" checks all nine and stops if any is missing. So **C03a runs after C04-GEN**, the regeneration
  that adds `delegate`, not only after C02-GEN.

## 5. ID clash: the delegate sheet is C04c, not C04b

- `tasks/C04b.md` is the host's `POST /atlas/delegate` (lane C, host). The screen's delegate sheet is `tasks/C04c.md`.

## 6. Lane order the UI briefs need

`C02-GEN → C04a → C04b → C04-GEN → C03a → C03b → C03c → C03d → C03e → C03f → C04c`.

- C03b needs item 1 in C01 and C02a, before C02-GEN.
- Each brief's anchors assume the briefs before it in this order have landed. For example, C03d replaces `RuleSheet`
  through the end of `more-sheets.tsx`, after C03c added `TerritorySheet` above it.

## 7. Not briefed: R3 on the Review page

- D34 lists no R3 marker, and these briefs do not wire R3. The controller exposes `propose` and `decide`, and
  `review().proposals` is loaded.
- Review's "To ratify" tab still lists `x.proposedTier` from the snapshot (`views/review.tsx:236`).
- If the lead wants R3 on screen (the open proposals with Ratify and Reject), it is one more brief over `review.tsx` and
  the ratify sheet.

## 8. Choices the briefs make where D34 is silent

- **Interview.**
  - Picks and typed answers stay on the screen. "Ratify the batch" writes one `answer` per answered question, one at a
    time; each write rereads (D34).
  - A draft's Accept writes its answer at once.
  - Kind counts cover this session's batch. The engine returns only a deferred count, not deferred kinds.
- **Delegate sheet.**
  - The models are `useModels().list()` (the app's connected providers), minus hidden ones.
  - The preselected model is the most recent one used, else the first.
  - The mock's "It reads" checkboxes are left out, because the host decides what the model reads (D33).
  - The "Writes" row follows D14 and D33 (drafts are written as `answer` records), not the mock's "writes nothing".
- **Territory sheet.**
  - Owner is free text, because `atlas territory --owner <seat>` takes any seat string.
  - Covers is a space-separated glob list, prefilled with `<unit>/**`.
  - The tier defaults to Hint (T2).
