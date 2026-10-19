# Lane A-U views, part 2 (A25–A33): issues, contracts and the conventions the briefs assume

Items 1–4 are contracts other tasks depend on; the lead should relay 1–4 to the views-1 brief writer (A19–A24). Items 5–14 are problems with the fix the briefs use. The last section is the porting convention every brief in this part follows.

## 1. Copy with inline markup (`<code>`, `<b>`) needs one renderer
- **Problem.** About a third of the mock's sentences carry inline markup (`Keep <code>.atlas/</code> out of git`). D9 wants the English verbatim in copy files. The app has no precedent for markup in copy, and `innerHTML` on translated text would let a parameter (a claim, a file name) inject HTML.
- **Fix (A32a).** `kit/text.tsx` exports `Rich`, which renders exactly five tags (`code`, `b`, `em`, `mark`, `small`) as elements and everything else as text, plus `richParts` (pure, tested). Copy values keep the mock's tags. HTML entities become their characters (`&lt;` → `<`, `&amp;` → `&`); `<address>`-style text is safe because only the five tags are parsed.
- A mock link inside a sentence (`<a class="mx-link" href=…>Settings › Store</a>`) becomes its own key, rendered as an `AtlasLink` after the sentence.
- **Views-1 should use the same `Rich`.** If A19–A24 already define another helper, the lead keeps one and fixes the imports.

## 2. One sheet host, opened from any view (A32a runs before A19)
- **Problem.** The sheets live in A32, but their openers are in earlier tasks: the inspector (A24: Ratify, Edit, Classify, Link), the unit page (A23: Add fact, Check a claim, Republish), Overview diagnostics (A19: Hot set), Explore (A20: Check a claim). A view cannot import a sheet component that does not exist yet.
- **Fix.** A32a creates `sheets/state.ts` with `openAtlasSheet(sheet)`, `closeAtlasSheet()`, `atlasSheetState` and the `AtlasSheet` union, plus `sheets/host.tsx` with a registry (`atlasSheets`, like `atlasViews`) that A32c–A32e fill. The frame mounts `<AtlasSheetHost />` once. A view calls, for example, `openAtlasSheet({ kind: "ratify", key: x.key })`; a kind whose sheet is not built yet opens nothing.
- **Order.** A32a depends only on A18b and must run before A19. The rest of A32 (A32b–A32e) runs in ID order after A31.
- The kinds and their fields are in `tasks/A32a.md` step 3. Sheets that belong to one view only (the genesis delegate sheet) stay inside that view.
- **Writes from the inspector.** A24's Retire, Accept and Keep for later are inspector actions, not sheets, and this part does not touch A24. A32b's `writeFact(controller, { ..., supersede: true })` (`sheets/write.ts`) is the draft-then-emit helper a retire needs; since A24 runs first, the lead can move A32b ahead of A24 (it depends only on A32a) if A24 wants it.

## 3. Travel and Keep sections (A19 → A28)
A28c imports `TravelSection` from `views/overview-travel.tsx` and `KeepSection` from `views/overview-keep.tsx`, both `() => JSX.Element` with no props (the mock's `A.travelSection()` / `A.keepSection()`). A19 must export them under these names and paths.

## 4. The briefing builder (A23 → A30)
- The mock's `A.buildBriefing(host, path, focus)` is used by the unit page ("Watch it being built", A23) and by Follow one fact (A30).
- **Contract.** A23 exports `BriefingBuild` from `views/briefing-build.tsx`, `(props: { path: string; focus?: string }) => JSX.Element`, a port of `mock/views-explore.js:482-516` with its "Build again" button. A30 imports it and does not rebuild it.
- If A23 names it differently, the lead edits one import line in A30.

## 5. Reasoning is not in the snapshot (D3)
- Genesis (A27b) and Follow one fact (A30) read `R().reasoning[x.why]`. They use `controller.reasoning(x.why)` instead (cached, `{ state: "ok", text }` or `{ state: "missing" }`), through `createResource`.
- Genesis's sample used to pick the first fact whose reasoning mentions a refutation, and counted refutations over all stored answers. Both need every reasoning entry, one request each. **Fix:** the sample is the first live fact with a `why`, and the count sentence keeps its words without the two numbers (new key, item 13).

## 6. The surface has no tier input, and draft is always T2
- **Problem.** Ratify (T1/T0) and Edit of a ratified fact need a write at a tier above T2. `AtlasDraftInput` has no tier, and `atlas draft` always drafts T2 (`tools/src/draft.ts` `DRAFT_TIER`). A T2 rewrite over a T1 fact is refused as `governance-downgrade`.
- **Fix (A32b, `sheets/write.ts`).** `writeFact` drafts, then emits the drafted fact with `tier` and `scope` set to the target values before `emit`. `draft.ts` says the drafted `scope` "is a structural placeholder an author may override before `atlas emit`"; setting `tier` the same way is how a CLI user ratifies (edit the fact, emit with a token). The emit door re-runs every gate. The draft's own dry-run check (always T2) is not used to decide; the emit verdict is.
- **Risk for the lead / A-S.** Facts mined without a slot (`slot: null`) are drafted with `slot: ""`. The A-S surface must accept `""` as "no slot" or the draft for such a fact is refused. If A05 rejects it, Edit and Ratify of unslotted facts show the refusal toast; nothing else breaks.

## 7. `atlas mine` and the producers cannot run from the app
- The surface has no `mine`, `derive-relations`, `transition` or `test-vacuity` method, and they are not one of R1–R11, so D13's marker does not apply.
- **Fix (A32d).** The Mine sheet's primary button becomes "Copy command" (the mock's own label) and copies the composed `atlas mine .` line with the chosen knobs; the toast is the mock's "Copied". Each producer's Run button becomes "Copy command" with its command. The mock's sample "Genesis finished" result is illustrated and is not ported (D12).

## 8. Sheets with no opener
- Suggest territories, Import a store and Declare territory open only from Settings, which D7 does not route. They are not ported.
- Republish (R7) opens from the unit page (A23) and, so the lead's request has a home, from a "Republish…" button in the Ownership hero (A29a), marked `cap="R7"`.

## 9. Activity events
- `model.activity()` is `[]` (D12): session receipts are not served, and no Track C task serves them.
- **Fix (A26).** The view words each event kind from the mock's templates (`mock/model.js:310-322`) in a tested helper, so rows render the day receipts arrive, but the event sheet (`A.eventSheet`) is not ported: it has no data and no producer. Rows are not clickable. Code events (from `codeChanges()`) work fully.

## 10. Memory pages without session transcripts
- The mock's task list, task page and transcript come from `A.spawns` (session evidence, illustrated, D12).
- **Fix (A31).** The member page reads `model.memory[member]` (filled by A15c from `.atlas/memory.jsonl`, D3b): project rules, proposals from `tasks[].lesson`, and one memory-log row per `taskId`. The task page shows the checkpoints of that task (tried, failed with, stopped at, lesson) without calls, times or tokens. The transcript route (`memory/<seat>/task/<id>/transcript`) shows the task page.

## 11. Ownership without the hard-coded snapshot
- `views-own.js` hard-codes `SNAP` (packages/genesis, its blobs and content hash).
- **Fix (A29).** Every number comes from `model.snapshot` (A15c, D3b): the first published unit and its pack. The blob list and content-hash row are dropped, because `AtlasOwnSnapshot` carries neither; the "One byte flips it to HOLD" demo keeps its simulated chain. The note "This one unit is a curated example…" is dropped.

## 12. `proposedBy` is not in the model
- Review's "To ratify" rows show "proposed by …" from `x.proposedBy`, which `AtlasFact` does not have. The extra is dropped; the list is empty until R3 lands anyway.

## 13. Strings the mock does not have
New keys, each in its view's copy file, for states only the real screen has. Owner review is welcome:
- Sheets: `sheets.link.done` "Linked.", `sheets.verify.proven` "Proven", `sheets.verify.refuted` "Refuted", `sheets.verify.abstain` "Couldn't decide: {{reason}}", `sheets.rule.newcap` "Indexing is a new capability (R1)." (the mock's pattern for R4/R5/R7/R11). "Ratified.", "Now core.", "Added as a hint.", "Saved. Both sentences are sent (R8).", "Pick the other fact first." are the mock's own.
- `how.none` "No fact to follow yet." (a store with no live fact).
- `genesis.sample.note` without the two counts (item 5).
- Memory (A31): `task.history.purpose` "Every checkpoint saved for this task, from memory.jsonl" (the mock's "Saved and refused writes, from the session" would be false), the Tech labels "Ref" and "Source", `tokensWord`.
- Architecture (A28c): "present" / "not built" for `index.scip`, and the computed sizes ("{{n}} objects", "{{n}} rows").

## 14. Plural one-forms
The mock's `plural(n, "fact")` gives the `.one`/`.other` pair verbatim. Where the mock's sentence around it was wrong for one, the `.one` form is fixed: "{{n}} thing waits for a decision.", "{{n}} file imports this file, so its facts sit in its blast radius.", "Would block the merge: {{n}} fact lost its code", "{{n}} suggestion (kept ones too…)…", Genesis's "… {{n}} waits for the next". Several new `.one` forms (tokens, rules indexed, tasks, decisions, objects, rows, suggestions) exist only because the app's i18n rules forbid the mock's string concatenation.

## 15. The test fixture lacks the D3b keys, and A15c has no brief
- `atlasFixture()` (A15a) has no `own`, `memory`, `orientation` or `territories`. Once A10 lands, the generated `AtlasSnapshot` will require them and the fixture (and every test that builds a model from it) fails to typecheck.
- **Fix the briefs assume.** A15c adds the four keys to the fixture with their empty values and fills `snapshot`, `memory` and `territories` in the model. A33 copies whatever keys the fixture then has. No A15c brief exists in `tasks/` yet; the lead should write or assign it before A25.

## 16. The checks preview judges the mock's actor
- `model.checks` (A15b) tests the write group against the constant `actor = "seat:orchestrator"`. The store's real actor is `health().actor` (`ATLAS_ACTOR`, else the git e-mail). On a real store the preview's Allowed gate can disagree with the door.
- **Fix in this lane.** `WritingAs` (A32b) shows the real actor (it reads `controller.health()` once when a sheet opens), and every sheet acts on the door's verdict, never on the preview. **Proposed for A15c or Track C:** pass the actor into `checks`.

## 17. Small deviations the briefs make on purpose
- **Edit's preview** (A32c) runs the gates at the fact's own tier and group, because the write keeps them (item 6). The mock previewed a T2 draft, which shows a downgrade refusal for every ratified fact.
- **Republish's pre-checks** (A32e): "Built from a commit in this branch" and "Source files unchanged" need the reviewed snapshot, which no command builds (R7). They show as not run (`idle`) instead of the mock's red.
- **Follow one fact** (A30) selects its fact with the query key `pick`, because `fact` belongs to the frame's inspector. It also counts a gotcha as "part of the briefing" (the mock missed the gotcha band).
- **Genesis interview answers** (A27c) are keyed by batch position. A refresh that reorders the batch moves typed answers; C03/C04 should key them by `kind|site|key`.
- **Genesis scan panel** (A27b) shows the sum of `dependentCount`; the mock printed `[object Object]`.
- **Architecture** (A28a) keeps one marker per chapter as `{null /* A28X: … */}` (a `<Match>` needs a child). Its tables keep Atlas code tokens (ids, `DEDUP`, file names, identity formulas) as data and everything worded as copy. It keeps two mock oddities as they are: the Waiting box counts candidates plus facts, and the identity stamp `atlas-identity-2026-08-02` is fixed text.
- **Ownership** (A29) names seats in copy through `{{backend}}`, `{{jimmy}}`, `{{archie}}`, `{{rosie}}` filled by `seatName`. The receipt drops the mock's "Snapshot" name and "Coverage: COMPLETE" rows (not in `AtlasOwnSnapshot`). "Advisory facts · Relations · Drill: empty" stays as the mock words it.
- **Memory** (A31): task ids that contain `/` are cut at the first segment (as in the mock); dismissed proposals live in the page and are lost on leaving it; the Checkpoints KPI says "none refused" because `memory.jsonl` holds only admitted records.

## 18. Run order and size
- Order in this part: **A32a before A19**, then after views-1: A25, A26, A27a–c, A28a–d, A29a–b, A30, A31a–c, A32b–e, A33. A30 needs A23 (item 4); A28c needs A19 (item 3); A32d needs A27a (`mineCommand`).
- Four briefs exceed the ~400-line guideline, almost all of it verbatim copy and data tables: A27a (~665 lines), A27b (~530), A31a (~540), A28d (~470). The split keeps each under five files.

## Porting convention for A25–A33 (binding)
1. **Files.** Views: `views/<view>.tsx` (default export), sub-parts `views/<view>-<part>.tsx`, pure helpers `views/<view>-data.ts` with `views/<view>-data.test.ts`. Sheets: `sheets/<group>-sheets.tsx`. Copy: only the view's own `i18n/orchestra-chapters/atlas-<view>.ts` (`atlas-sheets.ts` for sheets).
2. **Copy file edits.** The first task to add keys to a copy file replaces its line `export const ATLAS_<VIEW>_COPY = {}` with the opened object; every later task replaces the file's last line `}` with its keys followed by `}`. Keys are full literals; lookup tables hold full keys `as const`, never keys built from templates (the dictionary type rejects them).
3. **Markup.** Copy keeps the mock's tags; render with `<Rich text={language.t(key, params)} />`. Plain copy uses `{language.t(key)}`.
4. **Counts.** `language.plural("orchestra.atlas.<view>.<name>", n, { n: num(n) })` with `.one`/`.other` keys.
5. **Links and actions.** `href="#/x?..."` becomes `<AtlasLink href={atlasHref(...)}>`; `data-action="go"` becomes `onClick={() => atlas.go(atlasHref(...))}`; `withQuery` patches become `atlas.setQuery({...})`; `data-action="<sheet>"` becomes `openAtlasSheet({ kind: ... })`; `data-action="toast" data-value=V` becomes `atlas.toast(language.t(key), "info")`; `data-action="open-fact-page"` becomes `atlas.go(atlasHref("fact", key))`; `data-action="copy"` becomes `navigator.clipboard.writeText(text).then(done, done)` with `done = () => atlas.toast(language.t("orchestra.atlas.<view>.copied"), "copy")`.
6. **Buttons.** `A.btn(label, action, opts)` becomes `<Btn label=… onClick=… primary icon write cap tip ariaLabel />` (`opts.label` → `ariaLabel`). `A.newcap(R)` becomes `<NewCap id="R" />`.
7. **Lists.** `A.seven(rows, id, render, first) || empty` becomes `<Show when={rows.length} fallback={empty}><Seven id rows first>{render}</Seven></Show>`; fact rows are `<FactRow fact extra short noFile />`.
8. **Sections.** `acc(...)` becomes `<Acc>`; a bare `<details data-acc=id>` uses `ref={rememberOpen(id, open)}`.
9. **Illustrated branches** (`R().illustrated`, `x.example`, `A.spawns`, `A.illustrations`, `<span class="at-pill">example</span>`) are dropped (D12).
10. **Seat names** come from `seatName(id)`; the mock's `names` maps are not ported.
11. **Tests.** Every pure helper a brief extracts has a test over `atlasFixture()` (`atlas-model.fixture.ts`). Acceptance is `bun run test:ci app <test files>` plus `gh workflow run typecheck.yml --ref atlas-build-a-u`; A33 runs the rendered views.
