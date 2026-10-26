# Guardrails screen: how the module works and what the interface must be

Brief for the Interface session. The owner asked for this screen. The UX and UI bar is "absolutely impeccable": the owner judges the result by the Orchestra design system (`packages/app-shell/src/orchestra/DESIGN.md`, `.claude/skills/orchestra-design-system/SKILL.md`), not by whether it works. Read both before drawing anything.

Logic (the engine, the rules, the data contract below) belongs to the Guardrail session. Screens belong to you. If the contract below is missing something the screen needs, ask for it; do not scrape CLI text and do not reimplement rule logic in the renderer.

## 1. What Guardrails is, in one paragraph

Guardrails is a set of 73 small, deterministic checks that run on every pull request in this repository. They catch the mistakes AI agents and fast-moving people make most often: skipping or deleting a test to make CI green, silencing the type checker with `@ts-ignore`, leaving `console.log` and `TODO` markers, committing a secret, adding a dependency with no lockfile change, a destructive database migration, an unsafe GitHub Actions workflow. There is no AI in it. A rule is a text file; the engine applies it to the lines a change adds and the paths it touches. The same input always gives the same answer, so a finding can be trusted, explained and reproduced.

It is an add-on to Orchestra CI, not a separate product. Today it exists only as a CLI and a GitHub workflow. This screen is the first time a human sees it inside the app.

## 2. Who uses the screen and what they want

Three people, in this order of frequency:

1. **The author of a change (a person or an agent supervised by a person)** wants to know, before pushing, "will my change trip a guard, which line, why, and what do I do about it". Seconds matter. This is the main job of the screen.
2. **A reviewer or approver** wants to know "what did this change try to get past the guards": suppressions added (`guardrail-ignore`), protected paths touched, rules cleared by approval. They may grant an approval.
3. **The owner/maintainer** wants to browse the rule set: what is guarded, how strict each rule is, which rules are noisy, and to read exactly what a rule does before changing it.

Design for 1 first. 2 and 3 are secondary views on the same data.

## 3. How the engine works (so the screen tells the truth)

You must understand these ten facts. Every one of them changes what the interface may claim.

1. **Input is a diff, not the repository.** The engine compares the current branch with its merge-base with the target branch (`dev`). It reads *lines the change adds* and *paths the change touches*. Old code never fails. A finding therefore always points at something the author just wrote. The screen must say "in your change", never "in your code".
2. **Three rule kinds.**
   - `added-lines`: a regular expression over each added line. Reports file and line.
   - `changed-paths`: fires on a file path (a file added, deleted, renamed, or edited), sometimes only when a companion file did not change (a dependency manifest edited without its lockfile). Reports a file, no line.
   - `line-balance`: fires on one file when more matching lines were removed than added (assertions or test cases removed). Reports a file, no line.
3. **Two severities.** `gate` fails the pull request. `warn` is shown but never blocks. A rule is `warn` when a regex cannot decide it exactly. Current counts: 48 gate, 25 warn. The screen must make "this blocks you" visually unmistakable and "this is advice" visibly calmer; never use the same weight for both.
4. **Rules come from the target branch, not from the change.** A pull request cannot weaken its own guards: the rules and config are read from the merge-base. If the change edits `script/guards/**` the screen must show that the rules shown are the base's, and that the changed rules take effect after merge. When the base has no rules at all the engine prints `BOOTSTRAP`; show that as a distinct state ("first introduction of the guards").
5. **Moved code does not count.** A line identical to one removed elsewhere in the same change is treated as moved, one removal excusing one addition. Renames are followed. So a finding list can legitimately be empty for a big diff.
6. **Generated and vendored files are skipped** by line rules (list in `script/guards/config.toml`), and the engine's own rule samples are excluded. A finding is never reported there.
7. **Three ways to get past a finding, each with a different cost.**
   - *Fix it.* Always the right first answer.
   - *`guardrail-ignore: <rule id> <reason>`* written on the offending line. The reason is required; without one it does not count. The line passes, but a warning rule (`guardrail-ignore-added`) lists every new ignore so a reviewer sees it. This is the author's escape; it is visible, not silent.
   - *Approval of a path rule.* Rules that fire on a path (for example `protected-paths`, `test-file-deleted`) cannot be ignored on a line. An approver with write access applies the label `guardrail-approved:<rule id>` to the pull request. A plain `guardrail-approved` label means only `protected-paths`. Approval clears exactly one rule, never the others.
8. **Every rule has samples.** Each rule carries at least one line it must flag (`positive`) and one similar line it must not (`negative`). The engine will not load a rule without them and a test runs every rule against its own samples. This is the best explanation a rule can give: show the pair.
9. **Messages are the product copy.** Each rule's `message` says what is wrong and what to do. It is the whole error text. Use it as the finding's explanation, verbatim. If a message reads badly in the UI, the fix is to improve the rule's message (ask the Guardrail session), not to paraphrase it in the renderer.
10. **Nothing runs on the author's behalf yet.** The engine does not auto-fix and does not post comments. The screen may show a finding and explain it; it may open the file at the line; it must not promise a one-click fix.

The app does not run the guards when the view opens: the engine is the repository's own `script/guards` code, so it starts only when the user presses "Check again", and with a minimal environment (no API keys or tokens).

## 4. What each rule is made of (the fields the UI can show)

| Field | Meaning | Example |
|---|---|---|
| `id` | Stable name, also the file name | `test-file-deleted` |
| `severity` | `gate` or `warn` | `warn` |
| `on` | `added-lines`, `changed-paths` or `line-balance` | `changed-paths` |
| `paths` / `exclude` | Which files it looks at | test globs |
| `statuses` | For path rules: which git changes (A added, M modified, D deleted, R renamed) | `D`, `R` |
| `match` | The regular expression (added-lines, line-balance) | `@ts-ignore` |
| `message` | Plain-language explanation and the fix | "Test file deleted. If..." |
| `positive` / `negative` | Samples that must / must not fire | two short lists |

Other engine options exist (`flags`, `skip_comments`, `new_only`, `leaves_scope`, `requires_changed`, `touches`, `modes`, `min_bytes`, `binary`, `no_shebang`). They are implementation detail. Do not surface them as controls. If a rule detail view shows them, show them as one plain sentence generated by the Guardrail side, never as raw option names.

Suggested grouping for browsing (UI-only grouping, the files are flat; the Guardrail session will ship it as a `group` field so the screen does not guess from ids):

- **Tests**: skipped, focused, retried, deleted, loosened or removed tests (`js-test-*`, `py-test-skipped`, `rs-test-ignored`, `test-*`, `js-loose-assertion`, `py-assert-trivial`, `rs-should-panic-bare`).
- **Silenced checks**: `ts-ignore`, `lint-disable`, `py-type-ignore`, `py-noqa-blanket`, `py-no-cover`, `ts-any-added`, `ts-double-cast`, `ts-strict-relaxed`, `hook-bypass`, `guardrail-ignore-added`, `tls-verify-off`.
- **Secrets and environment**: `secret-token`, `private-key`, `client-env-secret`, `env-file`, `local-abs-path`.
- **Leftovers**: `js-console-log`, `js-debugger`, `py-breakpoint`, `rs-dbg-macro`, `rs-todo-macros`, `wip-marker`, `heredoc-residue`, `agent-scratch`, `llm-elision`, `merge-artifacts`, `conflict-markers`, `os-junk`, `build-output`.
- **Dependencies and migrations**: `dep-*`, `lockfile-stale`, `cargo-lockfile-stale`, `migration-*`.
- **Workflows**: `gha-*`.
- **Repository hygiene**: `binary-added`, `large-file`, `exec-bit`, `symlink-added`, `submodule-added`, `protected-paths`, `local-tests-escape`, `destructive-shell`, `js-empty-catch`, `py-bare-except`.

## 5. Data contract

Frozen so you can build against fixtures now. The Guardrail session owns producing it; until it ships, build with a fixture file that follows these shapes exactly and keep the fixture in the repo so tests use it.

```ts
type Severity = "gate" | "warn"

type Rule = {
  id: string
  group: "tests" | "silenced" | "secrets" | "leftovers" | "dependencies" | "workflows" | "hygiene"
  severity: Severity
  kind: "added-lines" | "changed-paths" | "line-balance"
  message: string          // verbatim product copy
  summary: string          // one sentence on what it looks at, written on the Guardrail side
  positive: string[]       // lines or paths that fire
  negative: string[]       // look-alikes that do not
  paths: string[]          // globs the rule reads (already expanded)
  clearedBy: "fix" | "ignore" | "approval"   // see 3.7: line rules can be ignored, path rules need approval
}

type Finding = {
  rule: string             // Rule.id
  severity: Severity
  path: string
  line: number | null      // null for path and line-balance rules
  message: string          // same copy as Rule.message
  excerpt: string | null   // text of the offending added line; null for path rules
  match: [number, number] | null  // [start, end) of the match inside excerpt, in UTF-16 units
}

type Failure = "no-repository" | "base-not-found" | "no-rules" | "rules-invalid" | "other"

type Report = {
  base: string | null      // merge-base commit; null if it could not be resolved
  bootstrap: boolean       // rules were read from the change, not the base
  rules: number            // how many rules were applied
  files: number            // how many changed paths were examined
  findings: Finding[]      // sorted: gate first, then path, then line
  errors: { kind: Failure; message: string }[]  // setup errors; non-empty means the run proves nothing
  approved: string[]       // rule ids cleared by approval for this run
  touchesGuards: boolean   // the change edits script/guards/**
}
```

Mapping to what exists today: `Report` is exactly what `runGuards` in `script/guards/run.ts` returns; `Finding` is `Finding` in `script/guards/engine.ts`. `Rule` is derived from the TOML files plus the added `group`, `summary` and `clearedBy`. What does not exist yet and the Guardrail session will add: a `--json` output for the runner, a listing command for rules, and a server route the app can call. State this plainly in the interface: until those land, the screen runs on the fixture and must say so in development builds only.

Hard rule: `errors` non-empty is **not** "no findings". It is a failed check. Never render a clean state when `errors.length > 0` or when `rules === 0`. A guard that ran nothing proves nothing, and the engine itself refuses to pass in that case; the screen must not be more optimistic than the engine.

## 6. The screens

One chapter page, in the style of the existing chapters (see `packages/app-shell/src/orchestra/chapters/` and the kit in `chapters/kit.tsx` and `kit.css`). Register it in `navigation.ts` and `chapter-route.tsx` like the others. Name in the sidebar: "Guardrails". Label strings go through the i18n files like every other chapter; no hard-coded copy.

### 6.1 Overview (default)

The question it answers: "Is my change clean, and if not, what do I do next?"

- Top: one status block. Four states, each with a different treatment:
  - **Clean**: rules ran, no findings. Calm, one line, the numbers ("73 rules, 14 files checked").
  - **Warnings only**: findings exist, none block. Neutral emphasis, "Nothing blocks this change".
  - **Blocked**: at least one `gate` finding. This is the one saturated element on the page. It names how many and offers a single primary action: go to the first blocking finding.
  - **Could not check**: `errors` non-empty, no base, or zero rules. Never green, never red like a finding; its own distinct, honest state with the reason and a retry.
  - Plus the **bootstrap** note when `bootstrap` is true.
- Below: the findings list, grouped by file, gates before warnings. Each finding shows the rule name, the line (when there is one) with the offending line's text, the message, and the way forward (section 6.3). Selecting a finding opens the file at that line using the app's existing file/diff viewing, not a new viewer.
- A running state while the engine works (it takes seconds). Skeleton, not spinner-only; cancel is not needed.
- Empty states are real states: no changes against the base, no git repository, base branch not fetched. Each one explains what to do.

### 6.2 Rules

The question: "What is guarded?"

- A searchable, filterable list of the 73 rules, grouped as in section 4. Filters: severity, kind, group. Search by id and message.
- Row: id, severity chip, group, one-line summary. Gate vs warn must read at a glance without color alone (shape or label too, for accessibility and for the 4.5:1 contrast rule in the design system).
- Detail (side panel or sheet, not a modal over the glass): message, summary, how a finding is cleared, the positive and negative samples side by side with the diff-style highlighting the app already uses, and the paths it reads. This is where a person learns what the rule means; spend design effort here.
- Read-only. Editing rules happens in git, through a pull request; the screen links to the rule file but does not edit it. Say so once, calmly, in the detail.

### 6.3 Getting past a finding

Inside a finding, show only the options that are true for that rule (`clearedBy`):

1. **Fix it** is always first and always shown, with the rule's message as the instruction.
2. **Ignore this line** for line rules: show the exact comment to add (`guardrail-ignore: <rule id> <reason>`), explain that a reason is required and that reviewers will see it. A copy button is enough. Do not write the comment into the file from the screen.
3. **Ask for approval** for path rules: explain that someone with write access applies the label `guardrail-approved:<rule id>`, show the label name with a copy button. Do not apply labels from the screen.

Never present ignore or approval as the easy path. It must read as a deliberate, visible exception.

### 6.4 Review view (secondary)

For the reviewer: a compact list of exceptions in this change: new `guardrail-ignore` lines (they arrive as `guardrail-ignore-added` findings), approved rules (`Report.approved`), and edits to `script/guards/**`. Reuse the Overview components; this is a filtered presentation, not a new data source.

## 7. Behavior and states checklist

Every one of these is required before the screen is considered done:

- Loading, running, clean, warnings-only, blocked, could-not-check, bootstrap, empty diff, no repository, base not found.
- Long lists: hundreds of findings must scroll smoothly (virtualize) and stay grouped; a change that adds 5,000 lines is realistic.
- Long lines and wide paths: truncate in the middle for paths, never break the layout; the full value is available on hover and to assistive technology.
- Dark and light, both with the wallpaper visible behind glass, text at 4.5:1, icons at 3:1, measured with the repository's palette tooling, not by eye.
- Keyboard first: arrow through findings, Enter opens the file, `/` focuses search on the Rules view, Escape closes the detail. Focus ring uses the design-system token.
- Screen reader: severity and kind are spoken as words, not color; each finding reads as one sentence ("Blocking: ts-ignore, src/app.ts line 12, ..."). Live region announces when a run finishes and its result.
- Reduced motion: the owner's machine has Reduce Motion on. All transitions respect `prefers-reduced-motion`; nothing essential is conveyed by motion.
- Narrow widths: the panel can be narrow (a side rail). The list and detail must degrade to a single column without horizontal scroll.
- i18n: all strings through the i18n catalog, copy for every state written, no string concatenation that breaks other languages. The Portuguese strings matter (the owner works in Portuguese).
- Rule messages are shown verbatim (they come from the data); everything else is UI copy and must be short, specific and calm. No exclamation marks, no blame ("you broke"), no jargon like "regex" in user-facing text.

## 8. UX principles specific to this screen

- **Calm by default, loud only for what blocks.** Most of the time the screen says "clean" or shows a few warnings. The single saturated element is the blocked state's primary action.
- **Explain, do not scold.** A finding is a fact about a line plus a way forward. The tone is a colleague pointing at a line.
- **Show the evidence.** The offending line, in context, with the part that matched emphasized, next to the sample the rule was built from. People trust a finding they can verify in two seconds.
- **Honest about limits.** A regex rule can be wrong. Warnings are advice and the screen says so. A clean result means "the guards found nothing", not "the change is correct"; word it that way.
- **No dead ends.** Every state names the next action or says there is nothing to do.
- **One thing at a time.** Resist dashboards, charts and counts for their own sake. The numbers on the page exist to answer "is it clean".

## 9. What not to build

- No rule editor, no rule creation form, no toggling rules on and off from the screen. Turning a rule down to `warn` is a one-line change in a pull request on purpose.
- No auto-fix, no auto-ignore, no label application from the screen.
- No history/trend charts, leaderboards or "score". The engine has no memory of past runs.
- No second implementation of the matching logic in the renderer. Findings come from the engine.

## 10. Definition of done

- The Overview, Rules and the finding detail work against the contract with fixtures covering every state in section 7, and with the real runner once the Guardrail side ships it.
- Tests: pure view-model code (grouping, sorting, state selection, the "never green on errors" rule) has unit tests; the states have browser tests in the style of the existing chapters (`test-browser`).
- Light and dark screenshots of every state attached to the pull request, with the contrast gate from the design system run.
- The screen is reachable from the sidebar, from a link in a failing guards run summary (later), and by keyboard.
- Pull request opened by you, small enough to review, referencing this document.

## 11. Where things live (for orientation)

- Engine and rules: `script/guards/` (`README.md` there explains each option; `rules/*.toml` are the rules; `run.ts` is the runner and prints the report; `engine.ts` has `Finding`).
- CI wiring: `.github/workflows/guards.yml` (runs on every pull request, computes approvals from labels, runs the base branch's engine).
- Background: `docs/guardrail/pilot-catalog.md` (why each rule exists), `validation.md` (what each rule did over 600 real commits), `sources.md` (where patterns were borrowed).
- Chapters, kit and design: `packages/app-shell/src/orchestra/` (`DESIGN.md`, `navigation.ts`, `chapter-route.tsx`, `chapters/kit.tsx`).

## 12. Questions to ask the Guardrail session before you start

1. The exact `--json` shape and the server route, so you do not wait on it. (Section 5 is the proposal; confirm or adjust.)
2. The final wording of `summary` per rule, or whether you write it and they review it.
3. Whether the screen should also run the engine against the working tree and not only against a pull request base (assumed yes: the author wants to check before pushing).
