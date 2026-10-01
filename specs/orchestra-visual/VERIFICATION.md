# Orchestra identity — verification handoff

Integration: `orchestra-identity`, base `5e4bea3b519c04cebfb787e98dfa171f5771d25c`.
Owner authorized commit and publication to `fork/orchestra-identity`.

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

Identity-specific copy is shared through typed i18n dictionaries to preserve the
approved reference. It is intentionally retained in its reference language;
this migration does not claim new translations for that namespace.

## Executed checks

Run from the indicated package directories, never repository root:

| Check | Recorded result |
| --- | --- |
| `packages/app`: `bun typecheck` | Passed |
| `packages/app`: `bun run typecheck:e2e` | Passed |
| `packages/app`: `bun run test:unit` | 750 passed |
| `packages/app`: `bun run test:browser` | 43 passed |
| Production build + Orchestra identity/native-frame/request-dock/model-selection specs | 21 passed |
| `packages/desktop`: `bun typecheck` | Passed on the final integrated tree |
| `packages/desktop`: `bun test src/main/titlebar-frame.test.ts` | 5 passed |
| `packages/desktop`: `bun run build` | Main, preload and renderer production build passed |
| Real Electron 42.3.3 packaged asset probe | SVG/photo requests 200; byte hashes match |
| Real AppsPanel + recording preload resize proof | Position-only x=440→540 updated once; cleanup/deduplication verified |

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

Hardware comparison: headed Electron 42.3.3 / Chromium 148, Intel UHD630,
ANGLE Metal / GraphiteDawnMetal, compositing enabled. Matched warmed workload:
18 history turns, 64 deltas, CPU1, batch1, DPR1, onboarding disabled.

| Theme | Baseline RAF-gap p95 | Migrated RAF-gap p95 | Initial visible content, baseline→migrated |
| --- | --- | --- | --- |
| Dark | 17.5ms | 17.4ms | 371.8→608.9ms |
| Light | 17.5ms | 17.6ms | 369.8→596.7ms |

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

## Work isolation

Each correction/research phase used its own branch/worktree: `fix-glass`,
`fix-locales`, `fix-test-runtime`, `fix-profile-races`, `desktop-check`,
`visual-evidence`, `perf-backdrop`, `perf-renderer`, `perf-gpu`,
`fix-frame-details`, `fix-composer`, and `fix-review`.

Lead owns integration and file review. Owner authorized commit + push on
2026-10-01. No PR or merge was requested. The native geometry bridge uses a
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
