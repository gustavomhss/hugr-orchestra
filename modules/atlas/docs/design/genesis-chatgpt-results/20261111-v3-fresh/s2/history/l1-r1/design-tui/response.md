# L1 completed and submitted for judgment — design-tui

The concrete L1 evidence base is complete for the assigned 2,087-path population at source commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`, using protocol commit `ee2521a5b966bd505cc95bd1c733e09e12f33531`. This is a submission, not an acceptance decision or a later-layer artifact.

## Delivered files

| File | Contents |
|---|---|
| [l1.md](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/l1.md) | Source-grounded account of terminal lifecycle, V2 data/actions, prompts, requests, keys/plugins, native integration, utility/export/demo contracts, UI primitives/context/i18n/themes, generation, Storybook and historical design records. |
| [coverage.json](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/coverage.json) | Every original input entry mapped exactly once, with classification, depth, representatives, reason, and source/consumer/maintenance implications across 67 families. |
| [sources.json](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/sources.json) | 196 exact source captures, complete source bodies, original response paths, source pin, Git blob SHA, SHA-256 and byte length. |
| [decisive-evidence.md](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/decisive-evidence.md) | 28 critical-claim groups with 40 bounded verbatim slices and source line/blob references. |
| [response.md](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/response.md) | This completion response, execution record and limits. |
| [verification.json](sandbox:/workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/verification.json) | Mechanical artifact verification only; not product test results. |

The source captures total **2,350,789 bytes**, comprising 185 assigned paths and 11 necessary boundary reads. All 196 bodies have verified Git blob and SHA-256 bindings. Active coverage is **185 inspected / 1,889 family-supported / 13 metadata-only**. The first ledger is preserved as `coverage-v1.json`; its finite terminal utility/demo and UI service implementation gaps were closed by 30 additional pinned reads and meaningful family separation.

## Material findings and limits

The evidence traces the actual CLI-to-TUI boundary, scoped renderer cleanup, injected-event/SSE ownership, hydration/live-event merging, ordered V2 session actions, prompt admission and dispatch timing, permission/question identity, model/KV/history persistence, key modes, plugin registry and native/editor integration. Supporting utility exports, transcript omission/order, demo interception, replay projection and thinking preference migration now have direct source evidence.

The current CLI adapter supplies empty plugin-host methods; built-in source presence therefore does not establish activation. The plugin API facade's lifecycle registration is also a placeholder. The prompt race test mirrors the implementation, and several prompt actions clear input without awaiting successful completion. These limits are explicit rather than hidden behind test inventory.

UI evidence includes field labeling, overlay lifetime/focus, virtual-list/scroll contracts, animation cleanup, locale/layout separation, caller-owned worker pools and the two theme APIs. Segmented-control arrow direction needs runtime RTL verification. Storybook uses mocks, its accessibility configuration remains `todo`, and its CSS-edit middleware can write source files.

Actual generator ownership is recorded for schema output, the desktop-schema mirror, Tailwind colors, default-theme v2 overrides, file/provider sprites and matching README illustrations. Preset and asset provenance is not guessed from extensions. The TUI schema was fully recovered by exact blob read after an empty initial file response: **1,131,057 bytes** are available and verified. The controller-reported **256,000-byte observer cap** remains a runtime import limitation, separate from source availability.

No product tests, typechecks, builds, generators, browser/terminal sessions, audio playback, native OS integrations or remote mutations ran. Read tests are not PASS results. Historical receipts do not establish current verification. Family support does not imply per-leaf correctness of locales, styles, icons, stories, small dialogs/plugins or unread test assertions. The 13 metadata-only entries are ten unpaired documentation images, UI license text, and app sprite/type artifacts with unverified provenance/consumption; their semantics are not asserted.

## Commands and tools actually used

Read-only connector operations were `mcp__codex_apps__github_fetch_file` at the exact source ref, `mcp__codex_apps__github_fetch_blob` for the oversize schema's exact assigned SHA, and `mcp__codex_apps__github_fetch` for pinned directory boundaries. Original responses were retained in this unit's capture directories. No GitHub write tool or `gh` command was used.

Shell command forms actually used were:

- `pwd` to establish the working directory.
- `cat` to read the public request, frozen protocol/principles/L1/transport references and governing source instructions.
- `rg -n` over this unit's captured source bodies to locate imports, exports, consumers, symbols, test descriptions and policy lines.
- `python - <<'PY'` for bounded source/JSON reads, line numbering, assigned-tree inventory, counts, original-ledger preservation and source comparison. These scripts did not import or run product TypeScript.
- `python /workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/hydrate-captures.py` to reconstruct connector bytes and compute/verify cryptographic bindings.
- `python /workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/build-ledger.py` to produce the one-to-one family ledger and recheck every capture hash.
- `python /workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/build-decisive.py` to extract unchanged source intervals.
- `python /workspace/scratch/992c54067adf/genesis-s2/producers/design-tui/verify-artifacts.py` to validate this deliverable's mechanical integrity.

`apply_patch` wrote only this unit's own evidence, capture and helper files. The managed runtime skill was read for environment handling; it did not cause any product command, network probe or approval request. No reserved oracle, judgment, sibling output or later-layer artifact was read or produced.
