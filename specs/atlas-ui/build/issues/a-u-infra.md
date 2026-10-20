# Lane A-U infrastructure (A12–A18): issues and the fixes the briefs assume

Each item names the problem and the fix the briefs already use. None of them changes a decision; some extend one.

## 1. Wire types come from the client signature, not a schema name (D3, D4)
- **Problem.** A08 (lane A-H) chooses the HttpApi schema identifiers, so the generated type names (`AtlasSnapshot`? `AtlasSnapshotResult`?) are not known while A-U is briefed. A brief that imports `type { AtlasSnapshot } from "@orchestra/sdk/v2/client"` would break if the name differs.
- **Fix (A15a `atlas-types.ts`).** Read the types off the generated client: `AtlasOutput<K> = NonNullable<Awaited<ReturnType<DirectorySDK["client"]["atlas"][K]>>["data"]>`, `AtlasInput<K> = Omit<Parameters<...>[0], "directory" | "workspace">`, and `AtlasSnapshot = Exclude<AtlasOutput<"snapshot">, { state: "empty" }>`. These are still the generated types, and they hold whatever identifiers A08 uses. They were checked against A01's `AtlasSnapshotResult = AtlasEmpty | AtlasSnapshot` (`state: "ok"`, readonly arrays).
- **Assumed names (A16 stops if they differ).** The group is `sdk.client.atlas`. The methods are `snapshot`, `reasoning` with path parameter `id`, `own` with query `scope`, `health`, `promote`, `draft`, `emit`, `link` and `verify`, each taking `directory`.
- **Order.** A15a's tests run without A10, but its typecheck, and all of A16, need A10 merged into `atlas-build-a-u` first. The lead merges A10 into the lane branch before A16.

## 2. D11 needs type packages and a lockfile update
- **Problem.** `d3-hierarchy` and `d3-shape` ship no TypeScript types. The app typechecks with `strict`, so a dynamic import of either fails as an implicit `any` module. `force-graph` ships its own types.
- **Fix (A12).** Add `@types/d3-hierarchy@3.1.7` and `@types/d3-shape@3.1.7` to `devDependencies`. This extends D11.
- **Problem.** Workers never install, and CI restores `node_modules` from a cache keyed on `bun.lock` (`.github/actions/setup-bun/action.yml:51`). If `bun.lock` is unchanged, CI runs without the new packages.
- **Fix.** After A12, the lead runs `bun install` at the root and commits `bun.lock` with A12.

## 3. Count-sensitive copy needs one line outside the lane's files
- **Problem.** `language.plural` takes only the keys listed in `PluralKey` (`packages/app-shell/src/context/language.tsx:33-40`). The mock words counts with `plural(n, "fact")`, which the app's i18n rules forbid as concatenation. `language.tsx` is not in the lane's file list.
- **Fix (A14a).** Add `` | `orchestra.atlas.${string}` `` to `PluralKey`. That one line lets every Atlas view use `.one`/`.other` keys without touching shared files again.

## 4. A14 split
A14a holds the kit and frame copy plus the plural line. A14b creates the 12 empty view copy files and spreads them into `atlas.ts`. A14b touches 13 files, above the five-file guideline, but each file is two lines, so it stays one task.

## 5. Copy the mock does not have (D9 says verbatim)
The real screen has states the mock never shows. A18 uses new keys for them, all in `atlas-frame.ts`:
- `loading` "Loading Atlas…"
- `retry` "Try again"
- `refresh` "Refresh" (D6 requires the button)
- `search` "Search"
- `unavailable` "This server does not provide Atlas."
- `empty.title` "Atlas has no store in this project"
- `empty.body` "There is no .atlas/ folder at this project's root, so there is nothing to show yet."
- `pending` "This view is not built yet." (shown only until each view task lands)

The mock's HOLD screen ("Atlas isn't connected to this project", about `maestro.atlas` config) is a different condition and is not ported. Owner review of these strings is welcome; changing them is a one-file edit.

## 6. Model members that differ from the mock (D12 and D9)
The mock's `A.m` names are all kept. These values differ, and A-U-API.md lists each one for the view writers:
- `SLOT_GROUPS`, `SLOT_MEANING`, `awareness[].source` and a gate's `remedy` hold copy keys or codes, not English, because the model is pure and every visible string goes through `language.t`.
- `memory` holds every member empty. The mock's backend task came from evidence files, and its rules and PRs came from illustrations (D12).
- `snapshot` (the committed Own snapshot) is empty. It is not in the DTO (D3), and the mock's `packages/genesis` pack is a fixture. **Open for A29 or Track C:** serve `OWN-SNAPSHOT.json` from the surface if the Ownership view must show it.
- `activity()` returns `[]`, because session receipts are not served (D12). `territories()` returns `[]` (not in D3).
- `state(x)` reads `retired` from `authoring === "SUPERSEDED"` (D19). The mock set it only by a simulated action.
- `findNode` returns `undefined`, not `null`. The tree root's `name` is `R.project`, not the literal `atlas`.

## 7. Search shortcut: `/`, not ⌘K
- **Problem.** The app binds `mod+k` to its own command palette on chapter routes (`context/command.tsx:16`, `orchestra/shell/navigation-commands.tsx:174`), with a capturing listener.
- **Fix (A18b).** Atlas opens its search with `/` and the rail's Search button, and never handles modified keys. The shortcuts sheet shows `/` for Search and drops the "Search this list" row.
- Also dropped from the mock: the `g s` and `g c` chords, the Settings, Chat and gallery entries, and the light/dark action. There is no Settings route in D7, and the theme belongs to the app.

## 8. CSS scoping (D10)
- **Problem.** Vite loads chapter CSS globally. The mock's file has about 100 selectors that are not `.at-*` (`[data-tip]`, `kbd`, `.nav-item`, `.mx-dialog`, `.ins-*`, `.tk-*`, `.clamp`, `main.flush`, `#toast`), and these would restyle the whole app.
- **Fix (A13a–c).** Every such selector is prefixed with `.atlas-scope`, which is the page root's class. The briefs list each changed line. The port was simulated end to end and matches the scripted result byte for byte.
- `#toast` becomes `.at-toast`, and `main.flush` becomes `.atlas-main.flush`.
- The frame block from `shell.css` (workbench, rail, dialog, toast, the rail's responsive rules) goes at the top of `atlas.css`. The rest of `shell.css` (preview bar, global sidebar, titlebar, fonts, body) is mock-only and is not ported.
- The page imports `kit.css`, `relay/relay.css` (for `wf-ic`, `wf-count`, `wf-dot` and the `--wf-*`/`--cv-*` tokens the mock links) and `atlas.css`.

## 9. Seat names
The mock prints default display names. AGENTS.md says code addresses a seat by id. The kit's `seatName(id)` therefore shows the id with a capital first letter, like `agentLabel` in `pages/session/timeline/orchestra-turn.tsx:55`. For the four Atlas members this gives exactly the mock's labels. It does not read the user's `agent.<id>.name` setting; Track C can wire that in if the owner wants it.

## 10. Smaller choices the briefs make
- **Rail actions.** Search and Refresh sit in a new `.atlas-rail-actions` row under the rail head, styled in the A13a frame block. The mock's titlebar is the app's.
- **Number format.** Numbers format `en-US` as in the mock (`A.num`); `ORCHESTRA_COPY` is English-only.
- **Verify.** `controller.verify` does not reread the snapshot ("Check a claim … Nothing is saved"). Every other write does (D6).
- **Inspector slot.** The frame renders the inspector only once A24 registers `atlasInspector`. Until then `?fact=` only marks the row as selected.
