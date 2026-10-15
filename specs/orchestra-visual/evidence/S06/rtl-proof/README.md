# Compact navigation: provider-driven RTL follow-up

This receipt supersedes the RTL exclusion in `../result.json` and the old
DOM-only RTL captures. It covers English LTR, English forced RTL through the
existing debug direction toggle, and the actual Arabic locale, each in dark and
light mode. The full application uses its real LanguageProvider, UiI18nBridge,
Kobalte providers and navigation consumers with deterministic backend fixtures.

The profile portal inherits document text direction. Its logical alignment is
resolved by Kobalte independently. Tests therefore verify both computed direction
and placement. They also temporarily inset the real shell by 320px on both sides
so viewport collision flipping cannot conceal a wrong provider direction. Normal
layout screenshots are captured before this calibration step.

Each matrix case verifies the logical selection marker, side tooltip and its
accessible description, keyboard order, profile selection, mixed-script project
identity, LTR path isolation, Escape focus restoration and short-window keyboard
reach. Locale dictionaries are existing product copy; this is not a linguistic
translation review.

The additional coverage exposed a production focus bug: project metadata
enrichment returns new objects, causing the profile menu to replace its keyed
radio items during refresh. The sidebar now keys those items by worktree. Each
matrix case renames the fixture project through subsequent real API responses
and asserts the same DOM node, selected identity and keyboard focus survive.
The production direction/provider plumbing itself required no change.

The native-frame fixture supplies the real OrchestraNavigationToggle to the real
Titlebar and loads production shell CSS for that case. It verifies no-drag,
physical macOS control clearance, hit testing, focus and unchanged frame reports
in LTR/RTL at zoom 1, 1.25 and 2. Host IPC/providers and unrelated titlebar content
remain fixture adapters. This does not claim live Electron or OS-native clicks.

`result.json` records commands, source/artifact hashes, mutation outcomes and
limits. Historical S06 receipts remain intact for their original scope. This
follow-up was authored by the reviewer after write authorization, so its final
self-review is not a second independent cold review.
