# Orchestra identity — delivery

Date: 2026-10-01. Integration branch/worktree: `orchestra-identity`.
Base: `5e4bea3b519c04cebfb787e98dfa171f5771d25c`.

## Verified delivery

The approved identity is integrated into the real frontend. Final static
dark/light × LTR/RTL captures use the rebuilt production bundle and actual
application components, without replacement CSS.

- 230px sidebar, 45px toolbar, 6px gutters and approved shared glass.
- Official 121×32px HuGR mark, `Human Guardrail`, continuous mountain background.
- Bottom 46px repository profile card; metadata 12px; upward menu portal.
- Reference margin colors, default 400 text weight and light toggle paint.
- 98px stacked composer with natural multiline/attachment/translated-placeholder sizing.
- Full-width stacked compact Review, readable populated diff, correct closed-sidebar geometry.
- Historical principal-model identity; running pulse, human-wait bounce and reduced motion.

## Checks

App unit suite: 750 passed. Browser-condition suite: 43 passed.
Final delivery E2E suite: 21 passed. App/E2E typechecks passed.
Desktop typecheck, packaged native asset loading and position-only App Dock
resize bridge proofs are indexed in `VERIFICATION.md`.
Final desktop main/preload/renderer build and five native geometry tests passed.

Performance evidence preserves both the software-renderer cost and the warmed
Metal comparison; it does not claim identical performance on all hardware.
Whole-frame pixel equality across different repository data, fonts and native
window controls is not claimed.

## Final screenshots and evidence

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
Owner authorized commit + push to `fork/orchestra-identity` on 2026-10-01.
Native caption alignment now follows actual toolbar geometry and the owning
window's zoom, including hidden headers, RTL and fullscreen transitions.
