# Inbox glass contrast — sampled live browser measurements

The owner delegated continued validation. This narrows the previously unmeasured glass contrast gap without
claiming complete WCAG or native-desktop acceptance. No production CSS, theme preference or owner app was changed.

## Instrument and scope

`agent-browser` attached to the already-running owner Chrome and selected only the existing task app tab at
`http://127.0.0.1:3005/orchestra/inbox`. A task-local Python probe read visible text-node rectangles, computed
foreground colors, font size/weight and ancestor opacity. It temporarily hid glyph paint with
`-webkit-text-fill-color: transparent` (not `color: transparent`, which could change currentColor backgrounds),
captured real composited screenshots, and sampled fifteen interior background pixels per text rectangle.
Contrast used sRGB relative luminance and the computed foreground alpha over each sampled background.

Two temporary controls were inserted on the same surface: white-on-black measured 21:1; gray-on-gray measured
approximately 1.17:1 and correctly failed the 4.5:1 threshold. Early calibration attempts failed because a control
was outside the clipped dialog and because an exact 1:1 expectation did not hold for the sampled rendering.
Those runs were rejected, not counted as passes. The accepted control requirement detects both clearly passing
and clearly failing contrast. Controls, paint overrides and temporary scheme changes were removed in `finally`.

The existing static palette measurer was also tried, but it returned no direct Inbox declarations for this check;
that attempt explicitly failed its coverage control. It was not substituted for a live glass measurement.

## Observed samples

| Surface/state | Scheme | Visible text runs measured | Lowest sampled ratio |
| --- | --- | ---: | ---: |
| Inbox list/detail | Dark | 32 | 5.59:1 |
| Inbox list/detail | Light | 32 | 5.57:1 |
| Sources, initial scroll position | Dark | 18 | 9.84:1 |
| Sources, initial scroll position | Light | 18 | 9.30:1 |
| Sources, bottom scroll position | Dark | 21 | 9.69:1 |
| Sources, bottom scroll position | Light | 21 | 9.17:1 |

Every measured actual text run exceeded its applicable text threshold in these samples. These are text-run
observations, not unique controls or an exhaustive element count. Disabled controls, clipped/occluded text,
input values/placeholders, icon contrast, focus/hover states, other palettes/viewports, intermediate scroll
positions, native controls and the installed desktop are not covered. Background sampling is not a proof of
the minimum over every glyph pixel, photograph or possible glass composition. Foreground paint occluded by
arbitrary pseudo-elements is not separately reconstructed. Those limits prevent a blanket accessibility pass.

Private reproducibility files are under the existing disposable `$TMPDIR/inbox-slack-consent-iy50xfl2` root:
`contrast_probe.py`, `contrast-page-report.json`, `contrast-sources-report.json`, and the latest
`contrast-report.json` (Sources bottom). No provider text was copied into the reports; they retain colors,
class names and numeric measurements. Original scheme was restored after each run. Sources was scrolled only
within the task tab; no provider settings were saved and no request to send or hand off was made.
