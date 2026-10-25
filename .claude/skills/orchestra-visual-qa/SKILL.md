---
name: orchestra-visual-qa
description: >
  Operational kit for seeing and checking Orchestra's UI without a dev build, a local test run or a restart of
  the owner's app: launch the installed HuGR Orchestra.app with a debug port, drive it over CDP, inject edited
  CSS live, take full or zoomed screenshots in dark and light, re-run the palette generator and the WCAG AA gate,
  and gate the work through test:ci and a single bundled epic. Use whenever you change anything visual in
  packages/app-shell (CSS, tokens, glass, palettes), when you need to see the real app, or when the installed
  app shows "Could not reach Local Server".
---

# Orchestra visual QA

Scripts live in `scripts/` next to this file. Design rules and values: `orchestra-design-system` and
`packages/app-shell/src/orchestra/DESIGN.md`. Copy them to your scratchpad before running them: `inject.ts` writes
`inject-expr.js` next to itself.

## 1. Get a live app to look at

- The installed app is `/Applications/HuGR Orchestra.app`. If it is not running, open it with a debug port:
  `open -a "HuGR Orchestra" --args --remote-debugging-port=9333`. Never stop or restart an instance the owner
  started; quitting the one you launched yourself is fine (`osascript -e 'quit app "HuGR Orchestra"'`).
- **"Could not reach Local Server"**: read `~/Library/Application Support/ai.hugr.orchestra/logs/<latest>/server.log`.
  In 0.2.1 the CLI cache `…/ai.hugr.orchestra/cli/<version>-…/` was extracted without `hugr_omni.node` and
  `hugr-omni-supervisor`, so serve crash-loops on the omni preflight. `HUGR_OMNI_ADDON` and `HUGR_OMNI_SUPERVISOR`
  are not forwarded to the child. Workaround: copy both files from `HuGR Orchestra.app/Contents/Resources/omni/`
  into that cache folder, then relaunch.
- The installed build lags `dev`. CSS injection is accurate for CSS. TSX changes cannot be seen this way; say so.

### 1b. Dev app from your worktree (sees TSX too)

Run the desktop dev build from `apps/desktop` with every state path isolated, so it never touches the owner's data
or their running app. Start it as a background task and stop only that task when done:

```bash
S=<scratchpad>/devapp; cd apps/desktop && OMNI_ARTIFACTS=$S/omni XDG_DATA_HOME=$S/data XDG_CONFIG_HOME=$S/config \
  XDG_STATE_HOME=$S/state XDG_CACHE_HOME=$S/cache ORCHESTRA_DB=$S/orchestra.db bun run dev > $S/dev.log 2>&1
```

- CDP listens on port 9222 (renderer on localhost:5173): prefix every helper call with `CDP_PORT=9222`.
  Wrap calls as `timeout 20 bun cdp.ts … </dev/null` so a stuck socket never hangs the shell.
- Vite hot-reloads CSS and TSX edits; no injection needed.
- Navigate with `nav a, nav button` by text; switch themes in Settings by clicking the theme button by its text
  ("Graphite", "AMOLED", "Nord"…). Restore the theme you found when finished.
- A modal (for example Maestro governance) can cover the first shot: send `key Escape` and reshoot.

## 2. Drive it (`scripts/cdp.ts`, port 9333, or `CDP_PORT=9222` for the dev app)

- `bun cdp.ts shot out.png` takes the full viewport (1280×800 CSS px at DPR 1).
- `bun cdp.ts shot out.png x,y,w,h,scale` takes a zoomed crop. Use scale 2–2.5 to judge rims, grain, hairlines
  and text rendering.
- `bun cdp.ts eval "<js>"` evaluates in the page and returns JSON.
- `bun cdp.ts key Escape` sends a real key event. A synthetic `KeyboardEvent` does not close Kobalte dialogs.
- **Navigate a chapter:** click the sidebar entry by its text:
  `[...document.querySelectorAll(".orchestra-sidebar a,.orchestra-sidebar button")].find(x=>x.textContent.trim().startsWith("Home")).click()`
- **Switch scheme for a screenshot:** `document.documentElement.dataset.colorScheme='light'`. This lasts until reload.
- **Open the ⌘K palette:** dispatch `keydown` `{key:'k',metaKey:true}` on `document`.

## 3. Inject edited CSS

`bun inject.ts <css files…>`, then `bun cdp.ts eval "$(cat inject-expr.js)"`. This appends one `<style id="__inj">`
that wins at equal specificity, and running it again replaces it. Inject every file you touched together:
injecting `session.css` without `composer.css` from the same tree mis-lays the composer. After each injection,
check computed values (for example the plate's `backdropFilter`) rather than trusting the screenshot alone.

Injection only adds rules. A declaration you *deleted* (say a `font-family: monospace`) still applies from the
installed build's sheet, so the screenshot lies. Either set the replacement explicitly in the source (preferred when
a utility class would otherwise win anyway) or override it in a throwaway snippet just for the check. To find who
sets a property, walk `document.styleSheets` and list rules whose selector `matches()` the element.

## 4. Palettes and the contrast gate

- Generated palettes (`src/orchestra/palette/generated/*`) come from Orchestra's stylesheets. After any color,
  glass or overlay change, run `bun run script/orchestra-palettes.ts` from `packages/app-shell`. It exits non-zero
  if a palette cannot hold AA. The test fails if the shipped files differ from the generator's output.
- Base Dark/Light are gated only on the 12 role tokens. `scripts/aa.ts` (copy it into
  `packages/app-shell/script/`, run it, delete it) prints every measured text color below 4.5:1 for both schemes.
  It is a script, not a test run.
- `scripts/fix-aa.ts` nudges failing text tokens in OKLCH lightness only (hue kept) until they reach 4.6:1, or
  3.1:1 for tokens named icon, button or chevron. Review the diff afterwards: in light mode, faint and muted can
  collapse together.
- The gate composites the glass over the photograph's per-band darkest and brightest pixels (`measure.ts`
  `BANDS`). If you change the narrowest glass blur, remeasure with `scripts/bands.js` (eval it over CDP) and
  check first that it reproduces the old bands (positive control).
- After any change to an Orchestra stylesheet (not only colors) re-run the generator: palettes copy every rule that
  carries a color, so a moved border or background leaves the generated files stale and the test fails.
- `scripts/motion.py <css…>` rewrites one-shot `transition`/`animation` durations to the motion tokens (≤140ms fast,
  ≤250ms base) and their easing to `--orchestra-ease-out`, skipping infinite loops and custom curves.
- `scripts/lits.py <css…>` lists color literals in ordinary declarations, ignoring custom-property definitions.
- `python3 -I scripts/sheet.py out.png a.png b.png …` tiles screenshots two per row (960×600 each) into one
  contact sheet, for showing dark/light pairs to the owner.
- Measured values (spacing, radii, sizes) belong in `packages/app-shell/src/orchestra/DESIGN.md`; update it when a
  change moves them.

## 5. Gates

- Tests run only on Actions: `bun run test:ci @orchestra/app <files…>`. The selector is the package *name*:
  `app-shell` fails with `TEST_PACKAGE_NOT_FOUND`. Run it in the background.
- `test-browser/` files need `--conditions=browser`. Under `solid`, solid-js loads its server build and every
  reactive test freezes. Fixed in the test-ci workflow by PR #885; if those tests fail, check that first.
- Typecheck: `gh workflow run typecheck.yml --ref <branch>`. Never run `tsgo` or `bun typecheck` on the Mac.
- **Cadence (owner, repeated):** finish the whole campaign first, merge its PRs into one bundle branch, and put the
  `epic` label on it once. Do not run test:ci after every edit. Report which gate actually ran.
- e2e specs that freeze visuals: `e2e/orchestra/identity.spec.ts` (glass fingerprint, 10px radius),
  `hit-areas.spec.ts` (focus outline color), `regression/new-session-panel-corner.spec.ts`. Read the new
  computed values from the live app over CDP and paste them in. Do not hand-normalize them.
