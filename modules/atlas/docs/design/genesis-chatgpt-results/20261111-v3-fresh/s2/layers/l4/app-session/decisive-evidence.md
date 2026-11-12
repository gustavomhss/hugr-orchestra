# Decisive evidence for s2.l4.app-session

## Evidence status

Source revision `1cde2ff7a71bcf7aecb5d030917b577165135d38`. The L4 contribution is operational prescription derived from accepted L1–L3: trigger, identity checks, edit owner, deepening evidence, stop boundary and update consequences. New direct precision consists of attributed current maintenance instructions and declared package typecheck/benchmark scripts, not new implementation behavior or runtime findings. This producer record gives no semantic verdict. All source instructions and declared scripts remain unexecuted.

## Accepted predecessor identities

| Key | Body path relative to deliverable | SHA256 | Bytes |
|---|---|---|---:|
| `s2.l3.app-session` | `layers/l3/app-session/body.md` | `7611e2ddfb015b2538a2d38a174d383e47bac7e2879e83f9622146ed30cf80b7` | 14334 |
| `s2.l3.desktop-web` | `layers/l3/desktop-web/body.md` | `fb0609ee88fddc8a87b36b16d584fcd5d074842052cf7d092cc7aaa9bd11f37e` | 14715 |
| `s2.l3.design-tui` | `layers/l3/design-tui/body.md` | `cbd099450a7072e72449b9fd3ef31b5032f171f64f7222405abfce0b88072730` | 15780 |
| `s2.l2.app-session` | `layers/l2/app-session/body.md` | `302011411d509ca96abf0fc538425a2d0db7c73d49186f1ac45f83db5d2e3de7` | 24434 |
| `s2.l1.app-session` | `layers/l1/app-session/l1.md` | `67a2787d0813738c8930a23253c9d185933cc228e997d530056cd4fa98b0b16e` | 42047 |

All three accepted-layer manifests were read and byte-verified; dependencies.json records their exact dispatched hashes. Permitted manifest review metadata was not followed. No L4 body is a factual predecessor.

## Section-to-evidence map

### Orientation

Accepted static scope and ownership; protocol prescriptions are maintenance inferences, not product execution.

- `s2.l3.app-session` § “Reading the handoffs”.
- `s2.l3.desktop-web` § “Orientation and evidence boundaries”.
- `s2.l3.design-tui` § “Orientation and accepted ownership”.

### Maintenance protocol

Trigger/owner/stop map synthesizes accepted failure boundaries. Exact current source instructions add contract, naming, localization, codegen and documentation obligations. Rebuild/update consequences are recommendations, not claimed Atlas runtime automation.

- `s2.l3.app-session` § “Enter the intended server and workspace”.
- `s2.l3.app-session` § “Submit once, then hand the draft to its session”.
- `s2.l3.app-session` § “Recover the projection without inventing execution recovery”.
- `s2.l3.app-session` § “Answer requests without transferring server authority to the UI”.
- `s2.l3.app-session` § “Change settings and Skills under the original owner”.
- `s2.l3.app-session` § “Render and localize under caller-owned lifetimes”.
- `s2.l2.app-session` § “Navigation, settings and feature controllers”.
- `s2.l1.app-session` § “Requests, terminals and auxiliary lifetimes”.
- `s2.l1.app-session` § “Rendering, evidence and reusable utility contracts”.
- `s2.l1.app-session` § “Assets, localization and verification evidence”.
- `s2.l3.design-tui` § “Terminal input becomes admission through ordered, separate operations”.
- `s2.l3.design-tui` § “Generated products reach consumers through distinct maintenance paths”.
- `s2.l3.desktop-web` § “Launch, choose a server and identify the health decision”.

### Verification and boundaries

Existing test paths/assertion scopes are accepted L1 evidence. Direct package scripts and current instructions specify future gates. Test-runner package-selector resolution and authorized benchmark execution remain unresolved; no guessed concrete invocation or performed gate is asserted.

- `s2.l1.app-session` § “Assets, localization and verification evidence”.
- `s2.l2.app-session` § “Verification limits and ownership use”.
- `s2.l3.app-session` § “Route a change through its affected contracts”.
- `s2.l3.desktop-web` § “Verification status and remaining evidence”.
- `s2.l3.design-tui` § “Change impact and verification ownership”.

## Bounded exact source excerpts

Each block preserves complete UTF-8 excerpt bytes including its final newline. Hashes below identify excerpts; sources.json identifies full captures.

### E01: AGENTS.md:160–166

Attributed remote-test command and snapshot-write implications. Its owner-only local exception is not authorized in this campaign.

Excerpt SHA256 `f73cdebf400dd09e83700a6a890e30ae7d9e609df5d2b8ee2b1e2217d325dd32`; 2187 bytes.

```text
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
  - Named test files run exactly and in the order given. Any other argument, such as a directory, is a Bun substring filter that may match several files, which Bun runs in its own order.
  - It uploads a snapshot of your working tree to a temporary `ci-run-*` branch, waits for the `test-ci` workflow, prints the result and exits non-zero when tests fail. No commit is needed; untracked files that are not gitignored are included, so keep secrets out of the tree.
  - A run takes a few minutes: give the shell call a long timeout or run it in the background.
  - A Python package (a `requirements-dev.txt` and no `package.json`) runs pytest instead. In a package with both, such as `modules/relay`, naming only `.py` files runs pytest, for example `bun run test:ci relay tests/test_authoring.py`, and anything else runs `bun test`; `-t` becomes pytest's `-k`.
  - The omni positive control (`script/test-omni-control.ts`) prints one `omni positive control:` line per run, and `test:ci` fails a job without it or whose verdict is neither `pass` nor `not applicable`. Full lanes and whole-package `test:ci` runs expect every run to spawn through omni; a narrower `test:ci` run (`ORCHESTRA_OMNI_CONTROL=declared`, derived from the request) expects it only from tests that declared it. A test that must spawn through omni calls `expectSpawn(import.meta.path)` from `packages/core/test/fixture/omni-expect.ts` in its body, before it spawns; it then fails unless it made an omni spawn of its own. `packages/core/test/omni-expect-guard.test.ts` requires the call in test files that import omni's spawn surface. `test:ci` accepts only `1` or `strict` for `--env ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`: `0` or a typo would run the tests on legacy with the control off. Legacy rollback runs only in test.yml's named lanes.
  - A local `bun test` stops with a pointer to `test:ci` (`script/test-guard.ts`). Only the owner may allow a local run, with `ORCHESTRA_LOCAL_TESTS=1`.
```

### E02: AGENTS.md:175–179

Attributed change-scoped versus epic CI cadence and gate-reporting distinction.

Excerpt SHA256 `a7559450c128d291de1974f6e21f105b39409e3c3c58f0e703b8de11d930d903`; 380 bytes.

```text
## CI Cadence

- The full suite runs once per epic, not per unit of work. Gate each unit with change-scoped tests through `bun run test:ci` and a local package typecheck.
- To run CI, add the `epic` label to the epic PR (remove and re-add it to rerun) or dispatch the workflow manually. Pushes and unlabeled PRs run nothing.
- A local green is not a CI green; say which gate ran.
```

### E03: AGENTS.md:194–205

Attributed guard, restart boundary and package-local typecheck rules; none executed.

Excerpt SHA256 `c297e5d83bc49bbb8b9b2ebfe0092931750c5fc716168d10f636d47e8ff2446d`; 674 bytes.

```text
## Guardrail

- Before calling a change done, run `bun run check:guards --base origin/dev`; CI runs the same rules on every PR. Load the `guardrail-usage` skill to read a finding.
- Fix the finding. Use `guardrail-ignore: <rule id> <reason>` only where the rule's `clearedBy` allows it, and apply a `guardrail-approved` label only if you are Maestro: any other agent asks Maestro, who decides.

## Local Runtime

- You may be running inside the Orchestra desktop app or its local server. Do not stop or restart either; ask the owner when a restart is needed.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `apps/cli`), never `tsc` directly.
```

### E04: packages/app-shell/AGENTS.md:1–8

Attributed priorities, mandatory before/after production benchmark and strict app/server no-restart instruction.

Excerpt SHA256 `2b184427fbfa30f512f1aba9c9e15be2111318a1c6c8eca2b793520188af48f7`; 272 bytes.

```text
## Priorities

- Prioritise, in this order: stability, simplicity, performance.
- Before changing session or timeline code, record a production benchmark baseline and compare it after the change.

## Debugging

- NEVER try to restart the app, or the server process, EVER.
```

### E05: packages/app-shell/e2e/AGENTS.md:8–16

Attributed observable-state, exact-identity and single-mutation E2E discipline; no E2E test was authored or run.

Excerpt SHA256 `e6506595d36c4b0657470d03578abf41dbb706226594ec26f573286356b1962e`; 1200 bytes.

```text
- Test user-visible behavior with isolated, deterministic data and scoped, unique locators.
- Prefer role, label, text, and explicit test-contract locators. Do not use `.first()` or `.last()` merely to silence strictness errors.
- Use locator actions, Playwright auto-waiting, and web-first assertions for observable readiness and outcomes.
- NEVER use `waitForTimeout`, `setTimeout`, sleeps, animation-frame counts, or other wall-clock delays to synchronize a test. Wait for the specific UI state, request, response, event, or application outcome instead.
- Do not treat navigation, a network response, DOM attachment, or visibility alone as proof that asynchronously rendered UI is ready. Assert the state the next action actually requires.
- Register event and network waits before the action that triggers them.
- Do not retry state-changing actions. Retry idempotent readiness checks, then perform the action once and assert its outcome.
- Keep action and assertion timeouts adaptive. Do not use short timeouts as readiness probes or rely on retries to hide flakes.
- Assert exact outcomes and identities so stale state, duplicate rendering, and interactions with the wrong element cannot pass.
```

### E06: packages/app-shell/e2e/performance/AGENTS.md:7–13

Attributed serial production diagnostics, lossless data, completion-only assertions and separate normal discovery.

Excerpt SHA256 `0661dc69d3758c808adeeae64ecb2778d50cc9fe8b6126f3fb4c9db8de709879`; 406 bytes.

```text
- Run benchmarks serially to avoid cross-test contention.
- Run benchmarks against production builds.
- Keep detailed profiling opt-in when it changes workload behavior.
- Preserve raw diagnostic data or use lossless representations.
- Do not enforce machine-dependent performance thresholds.
- Assert scenario completion and metric collection only.
- Keep normal test discovery free of manual benchmarks.
```

### E07: packages/schema/AGENTS.md:71–83

Attributed ID-compatibility and focused contract-change obligations; no migration or contract change was implemented.

Excerpt SHA256 `d3e76e4d2c54c7946f299c54bff9ce700406523f339504bb95ae4eb2115e66ae`; 1090 bytes.

```text
## IDs And Identifiers

- Current ID constructors expose `create()`.
- Directional constructors such as `ascending()` or `descending()` remain only where ordering semantics are part of the public contract or compatibility requires the old method.
- New generated ID schemas must validate exactly the prefix they emit, including the underscore.
- Do not tighten legacy loose ID validators without an explicit compatibility and migration decision; existing callers and tests may rely on accepted non-canonical IDs.
- Reusable exported public schemas get stable, domain-qualified identifiers such as `Model.Ref` or `Agent.Color`.
- Public schema identifiers and brands must be unique and stable. Private one-use nested schemas may remain anonymous.

## Tests For Contract Changes

- Add focused tests when changing contract behavior or generated surface.
- Cover optional properties omitting `undefined`, no accidental current-contract `Schema.Any`, stable and unique public identifiers, exact facade/schema identity, and current Protocol manifests holding only events a current client needs.
```

### E08: AGENTS.md:146–154

Attributed shipped versus repository-only knowledge and user-guide update boundary.

Excerpt SHA256 `8fa4debd4f7a4a28198b8620029467c1cd1f107c3645ff0157969b637a752721`; 1131 bytes.

```text
## What Ships and What Stays in the Repo

The release carries only what someone who installs and uses Orchestra needs. Material for people who change the code stays in the repository.

- Ships: compiled code, including seat prompts (`modules/maestro/coordination/src/seats/prompt/*.txt`); the skill trees a seat lists in `seat.skills` (`Seats.skillSource`, embedded at build time by `modules/maestro/coordination/src/seat-skills-module.ts`); Maestro playbooks (`modules/maestro/coordination/playbooks`), including the Orchestra guide under `maestro-orchestra`; the `extraResources` in `apps/desktop/electron-builder.config.ts`; the CLI package's `bin`.
- Repo-only: `.orchestra/skills/*` (maintenance, ownership and contributor usage skills, seen only when this repository is the open project), `docs/` (specs and guides), and this file.
- Knowledge an agent needs at runtime goes in its prompt or a shipped seat skill, never only in `.orchestra/skills`.
- Never add a maintenance or ownership skill to a seat's `skills`.
- `docs/guides` is written for users but is not published yet; a user-facing change still updates its guide.
```

### E09: packages/app-shell/package.json:21–21

New declared-script precision: app typecheck uses tsgo -b; not an executed result.

Excerpt SHA256 `fa3986ff4e93993a5e0e06eef16fd397b6103c3bbcf6323b83bd277b131cf175`; 28 bytes.

```text
    "typecheck": "tsgo -b",
```

### E10: packages/session-ui/package.json:44–44

New declared-script precision: session-UI typecheck uses tsgo --noEmit; not an executed result.

Excerpt SHA256 `f97ed21fa3b73e2720ba13fe9eaeaa0ab62caefe17c8c82315c60fb679bad42e`; 34 bytes.

```text
    "typecheck": "tsgo --noEmit",
```

### E11: packages/app-shell/package.json:33–33

New declared-script precision: the manual benchmark includes Bun test and Playwright execution, so manual classification alone does not establish permission to execute it here.

Excerpt SHA256 `9c509385d8b8f9aef2619be36d46a719a0ed5ec3b93d9582013fe20057e0c604`; 117 bytes.

```text
    "test:bench": "bun test ./e2e/performance/unit && playwright test --config e2e/performance/playwright.config.ts"
```

### E12: .orchestra/skills/agent-screen-maintenance/SKILL.md:32–41

Attributed deferred Atlas loading, stable seat IDs, secret-free presentation, localization and protocol-generation obligations.

Excerpt SHA256 `dcf279f4d9867db199a547e92e3740cb07e4e670457c77aee82eec02105a3d5d`; 835 bytes.

```text
- Loading: the roster paints as soon as `agents.list` resolves. The Atlas snapshot (`["agent-atlas", directory]` in `agents.tsx`) is the only source of per-agent memory counts and is large, so its query is enabled after the first paint, never alongside the list. Keep new detail reads out of the list's critical path the same way.

## Invariants

- Code, tests and copy refer to a seat by id or role, never a default display name.
- The screen never shows secrets: the prompt is the agent's own text, and engine rows show only manifest fields and
  install status.
- Every label goes through `language.t`; the agent chapter's keys exist in every locale it ships.
- The roster's skill count is the tab's row count: roots plus catalog skills, never every node.
- After changing the protocol, run `bun run generate` in `packages/client`.
```

## Preserved limits and unexecuted work

Accepted representative coverage remains representative. Preserve admission ambiguity and unsent edits, bounded SSE without replay, local receipt versus canonical policy provenance, non-atomic TUI calls, desktop/WSL health differences and stable-exit restart discrepancy, native/browser durability differences, partial IPC evidence, request UI versus authorization, terminal buffer growth, uninspected SkillV2 filesystem enforcement and visual/translation/asset limits. Root test:ci package-selector implementation was not inspected, so the official <package> placeholder is retained rather than inventing an alias. A permitted benchmark execution route remains to be established before a future session/timeline change claims that gate; its manual script includes product tests. No current permission or execution is inferred from repository commands.

No product tests, typecheck, guards, benchmark, generation, browser/desktop/terminal session, native/provider calls, source changes, remote writes or CI ran. No new remote source was fetched. No private oracle/judgment/closure material, review packets or transport receipts were read during this L4 authoring. No judge contact, agent inventory or additional subagent occurred.
