# A-U API: what the Atlas views build on

Lane A-U infrastructure (A12–A18) fixes these names. The view briefs (A19–A33) rely on them and do not change them. All paths are under `packages/app-shell/src/orchestra/chapters/atlas/` unless they say otherwise.

## Files

| File | Task | What it holds |
|---|---|---|
| `atlas-route.ts` | A12 | `ATLAS_VIEWS`, `AtlasViewId`, `AtlasRoute`, `parseAtlasRoute`, `atlasHref`, `withQuery` |
| `atlas.css` | A13a–c | `mock/atlas.css` scoped under `.atlas-scope`, plus the frame parts of `mock/shell.css` |
| `i18n/orchestra-chapters/atlas*.ts` | A12, A14a, A14b | Copy: `atlas.ts` spreads `atlas-frame.ts`, `atlas-kit.ts` and one file per view |
| `atlas-types.ts` | A15a | Wire types read off the generated SDK |
| `atlas-model.ts` | A15a, A15b | `createAtlasModel(snapshot)`: the pure port of `mock/model.js` |
| `atlas-model.fixture.ts` | A15a | `atlasFixture()`: a small snapshot for tests |
| `atlas-api.ts` | A16 | `createAtlasAPI(sdk)`, `AtlasAPIError`, `isAtlasEmpty` |
| `atlas-controller.ts` | A16 | `createAtlasController(describe)`: the store |
| `atlas-context.ts` | A17a | `AtlasContext`, `useAtlas()`, `AtlasContextValue` |
| `kit/icons.ts`, `kit/format.ts`, `kit/chips.tsx` | A17a | Icons, text helpers, vocabulary chips |
| `kit/controls.tsx`, `kit/dialog.tsx`, `kit/toast.tsx` | A17b | Buttons, bars, sections, rows, the dialog, the toast |
| `atlas.tsx`, `atlas-rail.tsx`, `views/index.ts` | A18a | The page, the rail, the view registry |
| `atlas-palette.tsx` | A18b | Search palette, keyboard, shortcuts sheet |
| `views/<view>.tsx` | A19–A31 | One view each (default export) |

## Routes (`atlas-route.ts`)

```ts
export const ATLAS_VIEWS = ["overview", "explore", "unit", "fact", "review", "activity", "genesis", "architecture", "ownership", "how", "memory"] as const
export type AtlasViewId = (typeof ATLAS_VIEWS)[number]
export type AtlasRoute = { view: AtlasViewId; param: string; query: Record<string, string> }
export type AtlasQueryPatch = Record<string, string | undefined>
export const ATLAS_BASE = "/orchestra/atlas"
export function parseAtlasRoute(pathname: string, search: string): AtlasRoute
export function atlasHref(view: AtlasViewId, param?: string, query?: AtlasQueryPatch): string
export function withQuery(route: AtlasRoute, patch: AtlasQueryPatch): string
```

- `param` is everything after the view, decoded and joined with `/`: `unit/<path>`, `fact/<key>`, `memory/<seat>[/task/<id>[/transcript]]`.
- An unknown or missing view parses to `overview`.
- `atlasHref` encodes `param` as one segment (`%2F`) and drops empty query values.
- Port rule for mock hrefs: `#/explore?view=map` becomes `atlasHref("explore", "", { view: "map" })`. `#/unit/${encodeURIComponent(p)}` becomes `atlasHref("unit", p)`. `#/own` becomes `atlasHref("ownership")`. `withQuery({...})` becomes `withQuery(props.route, {...})`; to navigate with it, call `atlas.setQuery({...})`.
- The query keys `fact` (inspector) and `why` belong to the frame. Each view owns its other keys (`view`, `tab`, `q`, `n-<id>`, `show`, ...).

## Wire types (`atlas-types.ts`)

The types are read off the generated client `sdk.client.atlas.<call>` (D4). No view writes a wire shape by hand.

```ts
export type AtlasCall = "snapshot" | "reasoning" | "own" | "health" | "promote" | "draft" | "emit" | "link" | "verify"
export type AtlasOutput<K extends AtlasCall>   // the call's 200 payload
export type AtlasInput<K extends AtlasCall>    // the call's parameters minus directory/workspace
export type AtlasSnapshot                      // AtlasOutput<"snapshot"> without { state: "empty" }
export type AtlasSnapshotFact = AtlasSnapshot["facts"][number]
```

The snapshot fields are exactly `specs/atlas-ui/mock/extract.py`'s output minus `reasoning` (D3), plus `state: "ok"`. Python `None` is `null`, and arrays are readonly. The shape is the one in `tasks/A01.md` (`AtlasSnapshot`, `AtlasFact`, `AtlasDrift`); the model code was typechecked against it.

## Model (`atlas-model.ts`)

`createAtlasModel(snapshot: AtlasSnapshot)` returns the members of the mock's `A.m` (`mock/model.js:360`) under the same names. `export type AtlasModel = ReturnType<typeof createAtlasModel>`. It is pure: no I/O, no Solid. The frame makes one per snapshot.

Porting rule for views: `M().x` becomes `props.model.x`; `R()` and `M().R` become `props.model.R` (the snapshot).

| Member | Type | Note |
|---|---|---|
| `R` | `AtlasSnapshot` | |
| `OWN_CAP` | `1500` | |
| `SLOT_GROUPS` | `readonly [titleKey, meaningKey, readonly slot[]][]` | **Changed:** copy keys, not text. Render with `language.t(group[0])`. |
| `SLOT_MEANING` | `Record<slot, copyKey>` | **Changed:** copy keys. `language.t(model.SLOT_MEANING[slot])`. |
| `tokens(text)` | `number` | |
| `state(x)` | `"fresh" \| "drifted" \| "retired"` | retired = `authoring === "SUPERSEDED"` (D19) |
| `isGotcha(x)`, `governing(x)` | `boolean` | |
| `facts`, `candidates` | `AtlasFact[]` | |
| `byKey` | `Record<string, AtlasFact>` | |
| `live()` | `AtlasFact[]` | |
| `unitOf(file)`, `areaOf(file)` | `string` | |
| `unitGroup(id)` | `"code" \| "docs" \| "harness" \| "root"` | |
| `units()`, `areas()` | `AtlasUnit[]` | `files` is a `Set<string>` |
| `territories()` | `AtlasTerritory[]` | Always `[]`: not in the snapshot (D3) |
| `territoryOf(unitId)` | `AtlasTerritory \| undefined` | |
| `tree()` | `AtlasTreeNode` | root `name` is `R.project` (the mock hard-coded `atlas`) |
| `findNode(path)` | `AtlasTreeNode \| undefined` | **Changed:** `undefined`, not `null` |
| `under(path)` | `(x: { file }) => boolean` | |
| `briefing(path)` | `AtlasBriefing` | |
| `dependents(path)` | `string[]` | |
| `snapshot` | `AtlasOwnSnapshot` | **Changed:** empty (`revision ""`, no units): the Own snapshot is not in the DTO and the mock's fixture is not shipped (D12) |
| `packOwner(unitId)` | `string[]` | |
| `dependentFacts(path)` | `number` | |
| `provenance()` | `"trusted" \| "tracked-provable" \| "tracked-staging"` | |
| `stats()` | `AtlasStats` | |
| `curationCount()` | `number` | |
| `codeChanges()` | `AtlasCodeChange[]` | |
| `memory` | `Record<AtlasMemberId, AtlasMember>` | **Changed:** every member empty (`maestro` unbound); the mock's evidence task and illustrations are not shipped (D12) |
| `frecency(rule)`, `header(member)`, `appendRecord()`, `words(text)`, `headerText(member)` | | `headerText` is machine text, shown verbatim, never translated |
| `awareness` | `AtlasAwareness[]` | **Changed:** `source` is a copy key |
| `actor` | `"seat:orchestrator"` | |
| `writable()` | `boolean` | |
| `checks(x, opts?)` | `AtlasChecks` | **Changed:** a gate's `remedy` is a code (`reground`, `raise-tier`, `grant-scope`, `token-billy`, `token`), plus `scope` for `grant-scope`; render with `useAtlasWords().remedy(gate)` |
| `promoteRun(token)` | `AtlasPromoteRun` | |
| `reconcile()` | `AtlasReconcile` | |
| `why(x)` | `{ class: "semantic"; plan: "retire" } \| undefined` | |
| `health()` | `AtlasHealth` | from the snapshot; the `health` endpoint is separate (controller) |
| `activity()` | `AtlasEvent[]` | **Changed:** always `[]`: session receipts are not served (D12). Events carry no `text`, `example` or `task`; the view words them. |
| `unitGraph()` | `AtlasUnitGraph` | |
| `fileGraph(unitId)` | `AtlasFileGraph` | |

`AtlasFact` is the snapshot fact with `kind: "fact" | "candidate"` (the mock's override), `factKind` (the CAS kind), and `retired`, `regrounded`, `promotedNow`, `discarded` (booleans; only `retired` can be true), `proposedTier?`. The mock-only `example` field does not exist (D12): drop every `x.example` branch. The other exported types (`AtlasUnit`, `AtlasTreeNode`, `AtlasBriefing`, `AtlasGate`, `AtlasHealth`, `AtlasMemberId = "backend" | "jimmy" | "archie" | "maestro"`, ...) are in the file.

## Transport and store (`atlas-api.ts`, `atlas-controller.ts`)

Views never call the transport. They use `useAtlas().controller`:

```ts
controller.state: {
  key?: string
  snapshot?: AtlasSnapshot
  empty: boolean            // D5: no .atlas/ at the worktree
  unavailable: boolean      // the server has no atlas routes
  loading: boolean
  error?: string            // already worded for the screen
  health?: AtlasOutput<"health">
  reasoning: Record<string, AtlasOutput<"reasoning">>   // by id
  own: Record<string, AtlasOutput<"own">>               // by scope
  pending: ("promote" | "draft" | "emit" | "link" | "verify")[]
}
controller.refresh(): Promise<void>
controller.reasoning(id: string): Promise<AtlasOutput<"reasoning"> | undefined>   // cached in state.reasoning
controller.own(scope: string): Promise<AtlasOutput<"own"> | undefined>           // cached in state.own
controller.health(): Promise<AtlasOutput<"health"> | undefined>
controller.promote(input: AtlasInput<"promote">): Promise<AtlasOutput<"promote"> | undefined>
controller.draft | emit | link | verify   // same shape
```

- Every write except `verify` rereads the snapshot when it finishes (D6). A failed write leaves `state.error` set and resolves `undefined`.
- `reasoning`, `own` and `health` may also answer `{ state: "empty" }`. Test it with `isAtlasEmpty(value)` from `atlas-api.ts`.
- The input of a write is the generated parameter object without `directory`/`workspace`. Its field names come from the A08 declarations; the sheet brief (A32) reads them from `packages/sdk/js/src/v2/gen/sdk.gen.ts`.

## Context (`atlas-context.ts`)

```ts
const atlas = useAtlas()
atlas.route(): AtlasRoute
atlas.model(): AtlasModel | undefined
atlas.controller
atlas.go(href: string, replace?: boolean)            // mock A.go(href)
atlas.setQuery(patch: AtlasQueryPatch, replace?)     // mock history.replaceState/withQuery + render
atlas.open(key: string)                              // mock actions.open
atlas.close()                                        // mock actions.close
atlas.toast(text: string, icon?: AtlasIconName)      // mock A.toast (plain text only; no Undo link)
atlas.crumbs(items: string[])                        // the crumbs after "Atlas"
atlas.setFlush(on: boolean)                          // mock view.flush
atlas.palette(prefix?: string)                       // mock actions.palette
atlas.shortcuts()                                    // mock actions.shortcuts
```

## Views (`views/index.ts`)

```ts
export type AtlasViewProps = { route: AtlasRoute; model: AtlasModel }
export type AtlasInspectorProps = AtlasViewProps & { factKey: string }
export const atlasViews: Partial<Record<AtlasViewId, Component<AtlasViewProps>>> = {}
export const atlasInspector: Component<AtlasInspectorProps> | undefined = undefined
```

Rules for every view brief:

1. The view is `views/<view>.tsx` with `export default function Atlas<View>View(props: AtlasViewProps)`.
2. The brief adds one line inside the `atlasViews` object: `  <view>: lazy(() => import("./<view>")),`, plus `import { lazy } from "solid-js"` (once) and `import type { Component } from "solid-js"`, which is already there. A24 replaces `undefined` in `atlasInspector` with `lazy(() => import("./inspector"))`.
3. The frame renders the view only while a snapshot is loaded, so `props.model` is always defined.
4. Mock `crumbs: [["Atlas", ...], ["Review"]]` becomes `createEffect(() => atlas.crumbs([language.t("orchestra.atlas.review.crumb")]))`. Drop the first `"Atlas"` crumb, because the titlebar already shows the chapter name. The frame clears the crumbs when the page unmounts.
5. A view that the mock marks `flush: true` calls `atlas.setFlush(true)` in `onMount` and `atlas.setFlush(false)` in `onCleanup`.
6. Mock `view.html` strings become JSX; `A.esc(x)` becomes plain JSX text; `data-action="X" data-value="V"` becomes `onClick={() => ...}` calling the context or the controller. Keep `data-action="open"` and `data-value={key}` on rows that open a fact, because the frame's `j`/`k` keys read them (`FactRow` already does this).
7. `details[data-acc]` sections use `ref={rememberOpen(id, open)}` and never set `open` themselves.
8. The frame owns: the rail, the store banner, the loading, empty and unavailable states, the inspector aside, the toast, the palette and the keyboard. Views do not port `app.js` render, renderRail, renderPanel, the banner or the keyboard.

## Kit (`kit/*`)

`kit/icons.ts`: `ATLAS_ICONS`, `type AtlasIconName` (the 64 names of `mock/ui.js` `paths`).

`kit/format.ts` (pure):

| Export | Mock |
|---|---|
| `num(n: number): string` | `A.num` |
| `short(hex: string \| null \| undefined, n = 8): string` | `A.short` |
| `hash(seed: string): string` | `A.hash` |
| `seatName(id: string): string` | names inside `A.agent`: the id with a capital first letter; ids with `:` stay as they are |
| `esc(text: string): string` | `A.esc`, only for `highlight` |
| `highlight(line: string): string` | `A.highlight`: escaped HTML, safe for `innerHTML` |

`kit/chips.tsx`:

| Component / hook | Props | Mock |
|---|---|---|
| `Icon` | `{ name: AtlasIconName; class?: string }` | `A.icon(name, cls)` |
| `StateChip` | `{ state: "fresh" \| "drifted" \| "retired" \| "pending" }` | `A.chip` |
| `TierChip` | `{ tier: string }` | `A.tier`, `A.band(x)` = `<TierChip tier={x.tier} />` |
| `FamilyChip` | `{ family: string }` | `A.family` |
| `Second` | `{ fact: AtlasFact }` | `A.second` (no example branch) |
| `OutcomeChip` | `{ outcome: string; reconciled?: boolean }` | `A.outcome(c)` = `<OutcomeChip outcome={c.outcome} reconciled={c.reconciled} />` |
| `Help` | `{ text: string }` | `A.help` |
| `HashV` | `{ hash?: string \| null }` | `A.hashv` |
| `Seat` | `{ id: string }` | `A.agent` |
| `FilePath` | `{ path: string }` | `A.file` |
| `NewCap` | `{ id: AtlasReq }` | `A.newcap` |
| `NewDot` | `{ id: AtlasReq }` | `A.newdot` |
| `Badge` | `{ label: string; tone?: string }` | `A.badge` |
| `useAtlasWords()` | returns `{ familyWord(f), origin(x), refusal(code), requirement(id), remedy(gate) }` | `A.familyWord`, `A.origin`, `A.refusal`, `A.REQS[id]`, gate remedy text |

`AtlasReq = "R1" | ... | "R11"`.

`kit/controls.tsx`:

| Component | Props | Mock |
|---|---|---|
| `Btn` | `{ label?; onClick?; primary?; icon?: AtlasIconName; disabled?; tip?; ariaLabel?; cap?: AtlasReq; write?; type? }` | `A.btn(label, action, opts)`: `opts.label` → `ariaLabel`, `opts.value` → the closure in `onClick`. With `write`, the button is disabled on a store in git and its tooltip gives the reason. |
| `Bar` | `{ parts: readonly (readonly [tone, value])[]; class? }` | `A.bar` |
| `Meter` | `{ label; value; cap; tone? }` | `A.meter` |
| `Empty` | `{ title; children; action? }` | `A.empty(title, body, action)` |
| `Tech` | `{ rows: readonly ([label, JSX] \| false \| null \| undefined)[]; label? }` | `A.tech` |
| `Code` | `{ file; start; lines; highlight?: number[]; kinds?: Record<number, string>; sha?; head?: JSX }` | `A.code` |
| `Kpi` | `{ label; value: JSX; foot: JSX; tone? }` | `A.kpi` (views.js) |
| `Acc` | `{ id; icon; title; purpose; summary?; open?; children }` | `acc(...)` (views.js:12) |
| `rememberOpen(id, fallback?)` | a ref for any `<details>` | the mock's `data-acc` memory |
| `Seven<T>` | `{ id; rows: readonly T[]; first?; children: (row: T) => JSX }` | `A.seven(rows, id, render, first)` |
| `FactRow` | `{ fact: AtlasFact; noFile?; short?; extra?: JSX }` | `factRow(x, state, opts)` (views.js:24) |

`kit/dialog.tsx`: `AtDialog { title; text?; wide?; onClose; onSubmit?; children; footer? }` and `AtDialogFoot { note?; label; onConfirm; onCancel; disabled? }`, which are the mock's `head()`/`foot()` around `#dialog`. To open a sheet, mount it under a `<Show>`; to close it, unmount it in `onClose`/`onCancel`.

`kit/toast.tsx`: `createToaster()` and `Toast`. Only the frame uses them; views call `atlas.toast`.

## Copy

- Keys are `orchestra.atlas.<view>.<name>` (D9). Each view adds its keys only to `i18n/orchestra-chapters/atlas-<view>.ts`, which A14b creates empty and which already exports `ATLAS_<VIEW>_COPY`. The files are overview, explore, unit, fact, review, activity, genesis, architecture, ownership, how, memory and sheets. The English is verbatim from the mock.
- Kit words (states, tiers, families, outcomes, refusals, R1–R11, slots, remedies) are already in `atlas-kit.ts`. Use the kit, not new keys.
- Count-sensitive copy uses `language.plural("orchestra.atlas.<view>.<name>", count, params)` with `.one` and `.other` keys. A14a widens `PluralKey` to accept `orchestra.atlas.*`. The mock's `plural(n, "fact")` (`"1,234 facts"`) becomes `language.plural("orchestra.atlas.explore.facts", n, { n: num(n) })` with `"orchestra.atlas.explore.facts.one": "{{n}} fact"` and `"orchestra.atlas.explore.facts.other": "{{n}} facts"`. `plural` sets `count` to the raw number itself, so the formatted number goes in `n`.
- Seat names come from `seatName(id)`, never from copy (AGENTS.md "Agent Names").
