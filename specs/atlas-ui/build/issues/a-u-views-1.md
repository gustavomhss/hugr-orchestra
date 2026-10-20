# Lane A-U views, part 1 (A15c, A19a–A24c): issues and the fixes the briefs assume

Each item names the problem and the fix the briefs use. Items 1–4 record how these briefs follow the contracts of `issues/a-u-views-2.md` items 1–4 (A32a, which runs before A19); none changes a decision.

## 1. Sheets: A32a's `openAtlasSheet`, plus Retire inside the inspector
- **Aligned.** No view creates a sheet host. Every opener calls `openAtlasSheet({...})` from `sheets/state.ts` (A32a); the frame mounts `<AtlasSheetHost />` once. Every brief from A19a on depends on A32a.

| Opener | Call |
|---|---|
| Explore heading, Check a claim… (A20) | `{ kind: "verify", scope: "" }` |
| Fact Technical details, Check against the code… (A24a) | `{ kind: "verify", scope: fact.file }` |
| Fact Related, Link… (A24a) | `{ kind: "link", key }` |
| Inspector Edit, and Rewrite (R8 dot) on a changed fact (A24b) | `{ kind: "edit", key }` |
| Inspector Classify / Ratify… (A24b) | `{ kind: "classify", key }` / `{ kind: "ratify", key }` |
| Unit head, Add fact… (A23b) | `{ kind: "add-fact", path }` |
| Unit briefing, Publish / Republish (R7 dot) (A23b) | `{ kind: "republish" }` |

- **Declare territory (R4).** A32 ports no territory sheet (views-2 item 8 says it opens only from Settings; the mock's unit head also has it). A23b keeps the button with its `cap="R4"` dot and toasts the kit's capability text (`orchestra.atlas.kit.newcap.tip`), per D13.
- **Retire.** Not a sheet in A32a's union. The real write is draft with `supersede` then emit (A32b's `writeFact`) and needs an approval key, so it cannot stay a bare button. A24b keeps the mock's pre-write refusal for a ratified or core fact and leaves a marked line for the rest; **A24c** (depends on A32b, runs after it in lane order) replaces it with a small dialog inside the inspector (Checks strip, Writing as, locked note), as views-2 item 2 allows for view-only dialogs. The lead must schedule A24c after A32b.
- My earlier `sheets/index.tsx` registry and its A19a brief were withdrawn; the A19 tasks were renumbered (A19a travel and keep, A19b health, A19c Home page).

## 2. D13 for controls whose mock action was a simulated write
"Accept" and "Keep for later" on a staged candidate (R2) did a simulated in-memory write in the mock; there is no real single-row promote today. A24b keeps their `cap="R2"` dots and toasts `orchestra.atlas.kit.newcap.tip` with the `sparkle` icon. No new copy.

## 3. Copy markup and links: A32a's `Rich` and `AtlasLink`
- **Aligned.** Copy keeps the mock's `<code>`, `<b>` and `<em>` tags and renders through `Rich` (`kit/text.tsx`). In-app links are `AtlasLink`. Only numbers, paths and Atlas ids go into a tagged key's params, never a claim.
- **Loss.** `Rich` renders bare tags, so the hero's drifted count (`<b class="warm">` in the mock) is a plain `<b>`. If the owner wants the colour back, A32a's `Rich` could accept `<mark>` styled warm in `atlas.css`; nothing in these briefs depends on it.
- Plain `<a>` stays only where the target is not an Atlas route (the hero's two in-page scroll links) or needs a `title` (`AtlasLink` has no `title` prop: the map's fact dots).
- Where a sentence holds a link (the fact body's "Unit <link>."), the link text is its own element after a complete sentence.

## 4. Exported parts, at the paths views-2 expects
- `views/overview-travel.tsx`: `TravelSection()`; `views/overview-keep.tsx`: `KeepSection()` (A19a; A28c imports both). Their copy stays in `atlas-overview.ts`.
- `views/briefing-build.tsx`: `BriefingBuild(props: { path: string; focus?: string })` (A23a; A30 imports it). It reads the model from `useAtlas()`. Its copy is in `atlas-unit.ts`.
- `views/graph.ts`: `mountGraph(host, options)` returns `{ select, fit, zoom, dispose }`; the caller passes the `offline` text.
- `views/fact-detail.tsx`: `FactBody`, `useCopyLink`.
- Query keys: the inspector owns `fact` (and `why`); these views use `view`, `group`, `sort`, `q`, `unit` (Explore), `type` (unit page), `show` (Home) and the kit's `n-<id>`. None collides with A30's `pick`.

## 5. Dropped: the health section's pointer to Settings › Store
The mock's Health ends with "Versions, archive, hot set and calibration are in Settings › Store." There is no Settings route (D7, issue a-u-infra 7). A19b drops the line. The maintainer diagnostics (`A.diagnostics`: versions, archive, hot set, calibration) are not in my lane; if the architecture view's store chapter (A28) shows them, the line can come back pointing there.

## 6. Values that differ from the mock on purpose
- Overview eyebrow: "Atlas · project {{name}}" with `R.project`; the mock hard-coded `atlas` (same reason as the model's tree root, a-u-infra 6).
- Unit page default: the mock opened `packages/knowledge` (a path of its own repository) when the URL had none; here it is the unit with the most facts, else `(root)`.
- Fact Technical details "kind · family" prints `factKind` (the CAS kind); the mock printed its overridden `kind`, which reads "fact" or "candidate".
- Graph colours come from the host's computed style, so the `.atlas-scope` tokens (`--mx-warm`, D10) apply; the mock read `document.documentElement`.
- "Rosie, the maintainer" is `"{{name}}, the maintainer"` with `seatName("rosie")` (AGENTS.md "Agent Names").
- A map scope with no facts shows `0%` held, not `NaN%`.

## 7. Dropped as illustrated-only (D12)
The `example` pills (Delivered story, fact rows), the unit's "Proven structure" rows and "Pinned by plans" section (`A.illustrations`), the fact's "Proposed for …" history row (`proposedBy`), and the scanner's "gitleaks ready" state (`R().illustrated`). Each real-mode branch and empty text is kept.

## 8. Shapes the briefs assume, and where a worker must stop
- `controller.state.reasoning[id]` is the generated union of A01's `AtlasReasoningResult`, discriminated on `state`, with `text` on `state: "ok"` (A24a narrows on it).
- force-graph 1.43.5's typings: `ForceGraph()(element)`, `d3Force(name)` returning `ForceFn | undefined`, `_destructor()` (A22a; checked against the published `dist/force-graph.d.ts`). A22a passes a plain arrow function as the custom `gravity` force; if the typecheck refuses it against `ForceFn`'s index signature, the fix is a cast through the second parameter type of `d3Force`.
- The generated `AtlasSnapshot` carries D3b's `own`, `memory`, `orientation`, `territories` with A01's field names (A15c, and the fixture every model test uses).

## 9. A15c (added to this lane by the lead): what the model fills, and what it cannot
- `snapshot` (committed Own), `memory` and `territories()` now come from the snapshot (A15c's mapping table). A-U-API's "Model" rows that say these are always empty are superseded by A15c; the lead may update A-U-API.
- `activity()` stays `[]`. Orientation events carry only a channel and a label (no member, time or outcome), and memory records carry no time except logbook entries, so neither yields the `AtlasEvent`s the Activity view draws. Session receipts remain the only source (D12); Track C or A26 decides.
- A PR record has no title and its `knowledgeDelta` is a list of facts, not per-unit counts, so `prs[].title` is `""` and `knowledgeDelta` is `[]`. The memory view (A31) should show the PR id where the mock showed a title.
- `memory.maestro.bound` stays `false`; the orchestrator's logbook (records of the actor `orch`) fills `memory.maestro.logbook`.
- `snapshot.catalog` is `territories.length > 0`: a catalog file with no territories reads as absent.

## 10. Smaller choices
- The explore search writes `q` with `replace` 140 ms after the last keystroke, keeping `id="list-search"` for the frame's `/` key; the toolbar sits outside the body switch so typing keeps focus.
- The explore graph remounts on a group change or a new snapshot, not on a pick; a pick writes `?unit=` with `replace`.
- The unit page is keyed on its path, so remembered sections and the briefing build start fresh per unit, and `?fact=` does not remount it.
- The inspector's previous/next disabled state is read one animation frame after the fact changes.
- Each view's crumbs drop the mock's leading "Atlas"; the unit and fact pages keep the mock's "Knowledge" crumb text.
