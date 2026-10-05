# Orchestra visual identity migration

Campaign/resumption entry: [HANDOFF.md](HANDOFF.md). The current state is in the
Status section at the end. Sections marked "History" record the identity
migration of 2026-10-01 and 2026-10-02 and are kept as history.

## History: baseline and reference

- PR integration branch: `identity-integration`.
- Integration worktree: `../_worktrees/identity-integration` (removed after the merge;
  the branch remains on the fork).
- PR base: `fork/dev`, `da2b75aff12e21c9974ebc5be41ae138302de40b`, including native App Dock.
- Published source: `orchestra-identity`, commit `9c535be9e98021b34500794bdc207199b120217a`.
  Its original benchmark base was `5e4bea3b519c04cebfb787e98dfa171f5771d25c`.
  Only the identity delta was ported; the source branch's extra App Dock/RPC/CI
  ancestors are not included in this PR.
- Approved reference: `/Users/gustavoschneiter/Downloads/orchestra-replica-static/app.html`,
  `mock-features.js`, `MOCK-GUIDE.md`, and `CHAPTERS.md`.
- The desktop identity design (the approved mock) is approved; owner acceptance of
  the integrated implementation is still pending. At migration time the individual
  capability-screen rework chapters were pending; a visual migration does not
  approve their domain workflows. Wave 1 chapters later landed in #240 (see Status).

## Frozen visual contract

Use the measured reference, not an approximate redesign:

- Official compact HuGR SVGs, byte-preserved; `Human Guardrail` descriptor.
- One continuous `mtn-src.jpg` workspace background, never one image per panel.
- Sidebar **230px** in the expanded shell (from 1440px wide), toolbar **45px**,
  workspace gutter/padding **6px**;
  panel radius **9px**. Reference outer frame: margin **12px**, radius **13px**.
- Compact navigation (wave B, not yet in `dev`): 208px is visible only at
  1280–1439px, the layout forces a 56px rail below 1280px or when collapsed, and
  at 768–1023px the rail is hidden behind a titlebar button. See Status.
- Dark/light palette, glass gradient/filter/border/shadow values match reference.
- Sidebar, session strip and active session tab use the same glass tokens.
- Repository profile picker stays at the bottom; its menu opens upward through
  a portal. Navigation scrolls independently.
- Session tabs belong below the toolbar, spanning conversation and side panel;
  close preserves history, new uses the selected repository.
- Branch label: dark `#d5ae68`, light `#8a641f`, monospace `10px`, weight `500`.
- Principal executed model owns each session logo. Known manufacturer first,
  router fallback, neutral fallback. No transport/name guessing.
- Running logo pulses `2.4s`; human wait bounces `1.15s` with impact/shadow;
  idle/error/interrupted static. Production respects reduced motion.
- Preserve real session execution, admission, permissions, questions, tab memory,
  virtualizer, filesystem, and native App Dock behavior. No mock fixtures in
  production and no heavy runtime dependencies for the skin.
- RTL uses logical geometry; native window controls remain physical/native.

## History: execution waves and isolation

Each agent owns an isolated worktree at the same base. No shared file is edited
by two authors. Lead owns stylesheet imports, localization keys, app startup
branding, integration and final acceptance.

| Work package       | Owned files                                                                               | Dependencies                     |
| ------------------ | ----------------------------------------------------------------------------------------- | -------------------------------- |
| Brand/theme        | `src/orchestra/theme.css`, `brand.tsx`, official SVG assets                               | Frozen reference                 |
| Shell/profile      | `pages/layout-new.tsx`, `pages/home.tsx`, `src/orchestra/sidebar.tsx`, `shell.css`        | Theme, `Titlebar.tabsMount`      |
| Session tabs/model | `components/titlebar.tsx`, `titlebar-tab-*`, `src/orchestra/model-logo*`, `tabs.css`      | Production baseline, shell mount |
| Session surfaces   | App-local `src/orchestra/session.css`, session frame/side-panel/composer/tasks data hooks | Production baseline, theme       |
| Verification       | Baseline performance evidence; visual integration checks                                  | Baseline, integrated code        |

`Titlebar` receives `tabsMount?: HTMLElement`. Its existing controllers and
commands stay mounted once; the desktop strip portals into
`#orchestra-session-tabs` in the shell. Mobile/legacy behavior stays on its
existing branch. Profile tab filtering is presentation-only; durable tab
identity remains server/session based.

The owner explicitly authorized **Commit + push** on 2026-10-01 and subsequently
approved base auditing and PR preparation/publication. The PR used
`identity-integration` against `dev` in `gmhelmold/HuGR-Orchestra`; the published
source branch remains intact. Merge required CI and review acceptance; #239 merged
on 2026-10-02 (squash `9fc1af89b9`).

## History: integration on `dev` (2026-10-01)

The native browser contract required by the skin already exists on `fork/dev`.
Conflict resolution preserves current AppsPanel handlers, task-section hooks,
Janitor frontend behavior, plural APIs and native translation bundles. Existing
app/UI locale dictionaries remain byte-identical to the PR base; typed
`ORCHESTRA_COPY` is composed through the shared language fallback instead.

Four independently reviewed extractions preserve behavior without changing the
Godfile guard or its waiver ledger:

- `createNativeTitlebarFrame`: measured toolbar lifecycle and cleanup.
- `createOrchestraPanelSizing`: 430/360px review rail and persisted explicit resize.
- `createAppDockBoundsSync`: coalesced position/size updates, generation and cleanup.
- `LegacyFileTreePanel`: reactive file selection, empty/loading states and RTL resize.

## Acceptance

1. Record a production benchmark at the unchanged base before session/timeline
   modifications, then repeat the same workload after integration.
2. Package `bun typecheck`; applicable unit/browser checks; production build.
3. Real-app browser coverage: dark/light, LTR/RTL, session navigation/close/new,
   profile selection, permissions/questions, reduced motion and native Dock
   layout boundaries. Calibrate new checks by breaking their protected property.
4. Compare captured geometry/colors/assets with the fixed approved reference;
   inspect screenshots rather than relying only on test authors' reports.
5. Cold independent review per disjoint slice, lead review of every file, and
   explicit report of measured evidence. Do not claim pixel equality for data,
   fonts, platform-native controls or pending chapters that were not compared.

## Status

Current state on 2026-10-04:

- The identity is in `dev` through PR #239 (squash `9fc1af89b9`); wave 1 chapters
  through #240; the wave 2 fixes are at `fork/dev@76015a9dcd`. At integration
  time, app checks and the 21-case delivery UI suite passed locally, and the
  broader E2E failures were fixed before #239 merged.
- The cockpit waves A and B are not yet in `dev`. They await GitLab merge requests
  !38, !27, !31, !33, !34 and !37; the final wave B candidate is
  `cockpit-review-fixes@607c2bf4c6`.
- The remote `fork` is now GitLab `gmhelmold/hugr-orchestra`; GitHub
  `gusmhs/HuGR-Orchestra` is an archive only. GitLab CI has never executed a test,
  so the owner runs a local gate on macOS; the Windows lanes and `nix-eval` remain
  unproven.
- Wave B's compact navigation changes the sidebar width outside the expanded
  shell: 208px is visible only at 1280–1439px. The 208px CSS rule spans
  768–1439px, but the layout forces the 56px rail below 1280px, and at 768–1023px
  the rail is hidden behind a titlebar button.
- Owner acceptance is pending for the integrated identity, each wave 1 chapter and
  the integrated bundle of waves A and B.

`VERIFICATION.md` records the identity-era evidence, measured performance, and
verification reach. No pending chapter has been promoted to approved. Native caption geometry is
reported by the renderer and converted using the owning window's native zoom;
macOS controls retain physical placement in RTL, zoom and fullscreen transitions.
