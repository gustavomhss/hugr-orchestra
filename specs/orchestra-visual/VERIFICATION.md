# Orchestra identity — verification handoff

Campaign/resumption entry: [HANDOFF.md](HANDOFF.md). The broader GitHub E2E
run `36932235243` failed on Linux and Windows for `791b3bc9d0`; logs and the
complete check snapshot are preserved under `handoff/`. Resolve those failures
before merge. The passing local delivery suite is narrower than that CI suite.

PR integration: `identity-integration`, base
`fork/dev@da2b75aff12e21c9974ebc5be41ae138302de40b`.
Published source: `orchestra-identity@9c535be9e98021b34500794bdc207199b120217a`.
The owner authorized publication and then a clean PR against current `dev`.

## Implemented identity

- Official compact HuGR SVGs and continuous mountain photograph, byte-preserved.
- Desktop frame, 230px sidebar, 45px toolbar, 6px gutters, shared dark/light glass.
- Bottom repository profile picker with upward portal; independently scrolling navigation.
- Session tabs below toolbar; per-session executed-model logos, running pulse and human-wait bounce.
- Production reduced-motion behavior; real theme toggle and persisted scheme.
- Native macOS caption controls follow measured toolbar geometry, native zoom and fullscreen lifecycle.
- Final 98px stacked composer, natural multiline/attachment sizing, 1px panel inset.
- Compact Review: full-width file list above readable diff; preserved copy, focus, resize and mode controls.
- Real handlers and session execution retained. C01–C13 capability-screen chapters remain pending.

Identity-specific copy is composed through the shared typed i18n fallback to
preserve the approved reference. Existing locale dictionaries and Janitor plural
keys remain unchanged. Identity copy is intentionally retained in its reference
language; this migration does not claim new translations for that namespace.

## Executed checks

Run from the indicated package directories, never repository root:

| Check                                                                                 | Recorded result                                                      |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/app`: `bun typecheck`                                                       | Passed                                                               |
| `packages/app`: `bun run typecheck:e2e`                                               | Passed                                                               |
| `packages/app`: `bun run test:unit`                                                   | 761 passed on the PR candidate                                       |
| `packages/app`: `bun run test:browser`                                                | 51 passed on the PR candidate                                        |
| Production build + Orchestra identity/native-frame/request-dock/model-selection specs | 21 passed                                                            |
| `packages/desktop`: `bun typecheck`                                                   | Passed on the final integrated tree                                  |
| `packages/desktop`: `bun test src/main/titlebar-frame.test.ts`                        | 5 passed                                                             |
| `packages/desktop`: `bun run build`                                                   | Main, preload and renderer production build passed                   |
| Real Electron 42.3.3 packaged asset probe                                             | SVG/photo requests 200; byte hashes match                            |
| Real AppsPanel + recording preload resize proof                                       | Position-only x=440→540 updated once; cleanup/deduplication verified |

The last candidate delivery receipt is
`packages/app/e2e/test-results/orchestra/.last-run.json`: `status: passed`, no
failed test IDs. The candidate passed the unchanged Godfile gate against
`fork/dev` after four scoped extractions. Independent cold reviews also checked
current Janitor sources, locale dictionaries and native-browser preservation.
Local results do not imply that GitHub CI or Windows/Linux lanes have passed.

The final production run uses `e2e/orchestra/playwright.config.ts`; it builds the
real frontend and runs deterministic backend fixtures. It verifies actual
rendered controls/reducers, not a copy of the static mock controller.

The two repaired existing E2E specs preserve and strengthen their outcomes:
the new profile-picker entry replaces the retired Home project row; exact
provider-key payload and project/draft/model/prompt reload persistence are checked.
Question collapse/restore uses unique accessible controls and deterministic
onboarding state. Mutation probes rejected omitted actions, duplicate controls,
wrong credentials, missing glass, wrong geometry and disabled motion.

## Performance evidence and reach

No runtime dependency was added. Exact identity assets total 156,966 bytes.
Source and bundle measurements are not a claim that all lazy assets transfer at startup.

Historical source-branch hardware comparison, not rerun on the current-dev port:
headed Electron 42.3.3 / Chromium 148, Intel UHD630,
ANGLE Metal / GraphiteDawnMetal, compositing enabled. Matched warmed workload:
18 history turns, 64 deltas, CPU1, batch1, DPR1, onboarding disabled.

| Theme | Baseline RAF-gap p95 | Migrated RAF-gap p95 | Initial visible content, baseline→migrated |
| ----- | -------------------- | -------------------- | ------------------------------------------ |
| Dark  | 17.5ms               | 17.4ms               | 371.8→608.9ms                              |
| Light | 17.5ms               | 17.6ms               | 369.8→596.7ms                              |

The migrated 2.4s running pulse stayed active; real permission events verified
the 1.15s waiting bounce/shadow. Every delta was delivered; row/Markdown identity
and bottom anchoring were retained. These hardware samples preceded the final
composer/compact-review refinements; they are not a full-platform performance certification.

Software-renderer limitation is measured: restored large conversation backdrop
filters increase frame gaps substantially. Hardware results do not erase those
software observations. Cached/fused-filter prototypes that altered reference
pixels were rejected and were not integrated. Native Windows/Linux caption
hit zones and whole-frame equality across differing fonts/data remain unmeasured.

## Evidence locations

Temporary root: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode`.

- `orchestra-identity-baseline/`: pinned baseline logs, bundle and screenshots.
- `visual-evidence-final/`: same-viewport reference/production captures and geometry.
- `fix-glass-*`, `fix-frame-details-*`: optimizer, pixel/geometry and mutation evidence.
- `composer-evidence-20261001/`: composer controls, multiline, attachment and gate repairs.
- `review-rail-evidence/`: populated compact diff, 430/360px rails, RTL and virtualization.
- `identity-gpu-20260930/FINAL.md`, `final-summary.json`: hardware workload and raw samples.
- `desktop-check-20260930/`: packaged asset and native resize bridge proofs.
- `packages/app/e2e/test-results/orchestra/`: last production suite results.
- [`screenshots/`](screenshots/README.md): current-dev candidate captures from the
  geometry/profile-portal tests, using the existing production bundle.

The performance and native AppKit artifacts above were collected on the original
published identity branch. They retain that provenance; current-dev validation
consists of the candidate checks and cold reviews listed here.

## Work isolation

Each correction/research phase used its own branch/worktree: `fix-glass`,
`fix-locales`, `fix-test-runtime`, `fix-profile-races`, `desktop-check`,
`visual-evidence`, `perf-backdrop`, `perf-renderer`, `perf-gpu`,
`fix-frame-details`, `fix-composer`, and `fix-review`.

Current-dev extraction worktrees: `identity-tab-limit`, `identity-panel-limit`,
`identity-dock-limit` and `identity-rail-limit`, each branched from `fork/dev`.

Lead owns integration and file review. Owner authorized commit + push on
2026-10-01 and then PR preparation/publication. Merge remains subject to CI and
review. The native geometry bridge uses a
data-only app type subpath, sender-bound main-frame IPC, bounded per-window
state and cleaned-up observers.

Native evidence extends the original asset-only probe: real production
renderer/preload/main flow places AppKit controls at `{26,28}` for zoom 1 and
`{32,36}` for 1.25/RTL. Hidden/mobile/fullscreen states clear the frame; native
resize/exit restores measured placement. Dead-window calls return safely;
foreign WebContents/iframes and malformed geometry are rejected.
Artifacts: `native-titlebar-20261001/INTEGRATED.md` and
`native-header-20261001/EVIDENCE.md` under the temporary evidence root.

The delivery runner now uses an explicit test-match set: 21 cases across four
spec files, confirmed with `--list`. Manual timeline/performance oracles retain
their separate runner; a broad CLI path expression had matched the worktree
name and selected those benchmarks accidentally. That timed-out run was not
used as delivery evidence. The corrected runner completed all 21 cases.
