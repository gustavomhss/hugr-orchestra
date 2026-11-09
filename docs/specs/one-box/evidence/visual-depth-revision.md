# Inbox material-depth revision — 2026-11-06

**Owner approval:** after this revision was shown, the owner said “ta ok aprov”. The revised visual finish is
approved; this supersedes the review-open status recorded at the end of this receipt, not outstanding technical
acceptance or the restriction against publication without separate authorization.

Owner feedback superseded the earlier visual approval: “glass transparente demais, cards e modais sem
profundidade, volume, sem efeito float, sem sombra”. The work is limited to Inbox materials, not a new layout
or a global Orchestra theme replacement. Independent model review remains blocked by the existing xAI constraint.

## Diagnosis and implementation

The actual task Chrome's computed styles showed the split frame fully transparent, its list well only 15%
effective white in light mode, and its reading pane just a transparent wash. The modal used the right shared
40px float blur but only one 30px/100px diffuse shadow. This explained why the surfaces lacked separation even
though individual text samples had sufficient contrast.

`inbox.css` now defines local material tokens: 90% modal content fill, denser tonal card faces, upper/lower edge
lighting and distinct contact/broad shadows. The source-account choices share raised faces with 8px gaps. Modal
fill reaches 96% at its base; its contact/mid/broad shadows distinguish its plane from the canvas. Modal height
is bounded to 820px or viewport minus 96px, giving visible breathing room. The shared float blur and scrim remain;
no per-card blur, global glass-token mutation or additional backdrop-filter layer was introduced. Source copy
and the selection well gained breathing room without changing text or acquisition behavior.

`DESIGN.md` records the new values and the superseding owner decision. All palette output was regenerated using
the existing generator, never manually edited. API, credentials and provider behavior are unchanged.

## Actual verification

- Full task app screenshots inspected in dark/light: page and Sources modal. They are production components in
  the running isolated app, not fabricated renderings or the synthetic preview.
- At 960×720, the actual modal occupied x=240/y=48, 480×624, leaving 48px above and below. Its footer bottom
  was 671px, the body was scrollable, and Escape returned keyboard focus to Sources. The viewport was restored.
- Calibrated background-pixel text sampling measured 38 visible Inbox text runs per base scheme: lowest dark
  5.59:1, light 5.83:1. Revised Sources samples measured 22 runs per scheme: lowest dark 9.26:1, light 10.32:1.
  Synthetic passing/failing controls still measured 21:1/about 1.17:1. These remain sampled text observations,
  not complete WCAG, icon, input, interaction-state or native-desktop acceptance.
- The probe was strengthened after two instrument artifacts: partial occlusion by its own synthetic control
  and sampling transitioning button colors before the screenshot settled. Per-sample-point hit testing now
  excludes occluded pixels, and transitions are disabled before scheme switching/foreground measurement.
  Those diagnostic failures were not fixed by changing production text or weakening the contrast threshold.
  Every injected control/style and original scheme was restored; no provider writes occurred.
- Authorized local app-shell check: **65 tests passed**, 396 assertions, seven files covering Inbox/navigation
  and palettes. The palette suite includes its existing below-AA mutation control. `bun typecheck` completed.
  These are local results, not CI or independent design approval.

Private captures and oracles remain in the existing disposable QA root: `design-before.png`,
`design-after-page-{dark,light}.png`, `design-after-modal-{dark,light,narrow}.png`,
`design-narrow-oracle.json`, `contrast-revised-modal-report.json` and the revised page `contrast-report.json`.
Earlier visual approval and contrast snapshots do not certify the new appearance. Owner visual review is open.
