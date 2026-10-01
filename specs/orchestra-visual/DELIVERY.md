# Orchestra identity — delivery

Current campaign state and recovery entry: [HANDOFF.md](HANDOFF.md). Local
delivery checks below do not imply CI acceptance: the broader Linux/Windows
E2E run on implementation commit `791b3bc9d0` failed and blocks merge.

Date: 2026-10-01. PR integration branch/worktree: `identity-integration`.
Base: `fork/dev@da2b75aff12e21c9974ebc5be41ae138302de40b`.
Published identity source: `orchestra-identity@9c535be9e98021b34500794bdc207199b120217a`.

## Verified delivery

The approved identity is integrated into the real frontend on current `dev`.
Candidate dark/light × LTR/RTL captures use the existing production bundle and
actual application components, without replacement CSS. The original delivery
captures below retain their separate source-branch provenance.

- 230px sidebar, 45px toolbar, 6px gutters and approved shared glass.
- Official 121×32px HuGR mark, `Human Guardrail`, continuous mountain background.
- Bottom 46px repository profile card; metadata 12px; upward menu portal.
- Reference margin colors, default 400 text weight and light toggle paint.
- 98px stacked composer with natural multiline/attachment/translated-placeholder sizing.
- Full-width stacked compact Review, readable populated diff, correct closed-sidebar geometry.
- Historical principal-model identity; running pulse, human-wait bounce and reduced motion.

## Checks

Candidate app unit suite: 761 passed. Browser-condition suite: 51 passed.
Final delivery E2E suite: 21 passed. App/E2E typechecks passed.
Desktop typecheck, packaged native asset loading and position-only App Dock
resize bridge proofs are indexed in `VERIFICATION.md`.
Candidate desktop main/preload/renderer build and five native geometry tests passed.
The unchanged Godfile gate passes against `fork/dev`; locale dictionaries and
Janitor behavior are preserved. GitHub CI acceptance is tracked on the PR.

Performance evidence preserves both the software-renderer cost and the warmed
Metal comparison; it does not claim identical performance on all hardware.
Whole-frame pixel equality across different repository data, fonts and native
window controls is not claimed.

## Final screenshots and evidence

Current-dev candidate captures: [`screenshots/README.md`](screenshots/README.md).

Original published identity evidence (not a new performance run on this port):

Root:
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/visual-evidence-delivery`

For every `{dark,light}` × `{ltr,rtl}` combination:

- `app-<scheme>-<direction>-chat.png`
- `app-<scheme>-<direction>-menu.png`
- `app-<scheme>-<direction>-permission.png`
- `app-<scheme>-<direction>-review-populated.png`
- `app-<scheme>-<direction>-review-sidebar-closed.png`

`checks.json`, `geometry.json`, `panels.json`, `source-graph.json` retain values
and bundle/source provenance. Prior broken captures were retained as controls.

Capability-screen chapters remain pending one at a time. This delivery adds
their marked navigation entries, not simulated production configuration/CI jobs.
Owner authorized the original commit + push on 2026-10-01, then a clean PR from
`fork/identity-integration` against `dev`. Extra App Dock/RPC/CI ancestors are
excluded; the source branch remains published intact.
Native caption alignment now follows actual toolbar geometry and the owning
window's zoom, including hidden headers, RTL and fullscreen transitions.
