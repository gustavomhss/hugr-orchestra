# Change summary — S2 L1 correction r2

Execution: `46d09d97-39a9-482a-a290-646ba1d94c99`.
Source: `gustavomhss/hugr-orchestra` at `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
Producer: `/root/s2_l1_corrections`.
Status: **producer correction ready for principal reconciliation and independent judgment**. This is not a semantic verdict, runtime acceptance or complete-layer gate.

## Bounded changes

### app-session

The complete candidate is `app-session/l1.md`. Existing prose is retained except the necessary capture/depth accounting, an explanatory delta sentence and the added `## Skills catalog, editing and ownership` section. That independently addressable section is **5,976 UTF-8 bytes**, below the reader's 16,000-byte routine request budget communicated by the principal.

It supplies the exact array/field contract, required strings and optional nullable metadata, whole-load malformed-response error, internal/tree-node visibility, lexical source/access rules, the Atlas-governed root, editable project roots, cache and file identity, page refresh/error handling, dialog path/mtime inputs, write orchestration, pinned API declarations and handler error mapping. It explicitly preserves the distinction between UI checks, declared protocol semantics and unverified filesystem behavior. No decoder, UI, server or write execution is claimed.

The complete inherited `Assets, localization and verification evidence` section and final caveats are byte-identical. No previously cited source path was removed. `family-delta.json` updates only the existing `mcp-skills` family's semantic fields and representatives, distinguishing newly inspected decoder/editor/API boundaries from remaining family-supported MCP leaves and unverified filesystem behavior. The principal owns count recalculation and incorporation.

### design-tui

The complete candidate is `design-tui/l1.md`. The original DataProvider/catalog paragraph keeps its cache/catalog facts; its abbreviated action description is replaced by `## V2 session action boundary`, containing **5,817 UTF-8 bytes**.

The new section covers every exposed adapter operation, POST paths, modelID-to-id conversion, agent/model selection order, truthy-directory placement, optional synthetic editor context with `resume: false`, file/agent source-span conversion, permission request identity, revert staging versus commit, compact/shell semantics declared by the protocol, and wrapper limits around IDs, retry, cancellation and transactionality. Test expectations remain explicitly unexecuted.

`## Terminal interaction and supporting contracts` closes the new section before the original `### Selection, local persistence and prompt admission`. This is the minimum additional boundary needed to keep unrelated terminal material out of the action-contract read. The remaining terminal block is **11,795 bytes** and the earlier `Terminal application` block is **5,143 bytes**. All original text from the Selection heading through the final document tail is byte-identical. No inherited cited source path was removed.

### desktop-web

The complete candidate is `desktop-web/l1.md`. Only the first paragraph of `## 1. Startup, readiness and shutdown` changes: it now states the exact `join(app.getPath("userData"), "global")` directory, recursive creation and handoff as cwd, and separately attributes the maintenance rule and historical timing rationale. Reversing that sentence replacement and its added citation reproduces the complete original document.

`decisive-delta-desktop.md` adds the publicly requested readiness cap/race/health predicate, main startup/cwd/readiness publication, startup-maintenance rule, typed native translations and typed named `window.api` exposure. Existing static discrepancies and all other desktop findings remain unchanged. All five desktop files were already captured; there is no new canonical source count.

## Source incorporation without double counting

`sources-delta.json` provides exact path, bytes, SHA-256, Git blob SHA, pin, capture path, original-response path and per-unit incorporation action. Its **14 file captures total 120,553 bytes**: eight fresh connector reads and six reverified existing captures. Directory discovery responses are preserved separately and are not counted as source files.

| Unit | Original unique captures | Unique additions | Revised unique captures | Assigned population and depth |
|---|---:|---:|---:|---|
| app-session | 251 | 4 | 255 | 1,887 paths; 234 inspected, 1,623 family-supported, 30 metadata-only |
| design-tui | 196 | 2 | 198 | 2,087 paths; 185 inspected, 1,889 family-supported, 13 metadata-only |
| desktop-web | 193 | 0 | 193 | 532 paths; original depth ledger unchanged |

App additions are `skills-data.ts`, `skills-dialog.tsx`, `packages/protocol/src/groups/skill.ts` and `packages/server/src/handlers/skill.ts`: **15,578 new unique source bytes**. Skills data/dialog promote existing assigned entries; the two API files are boundary sources.

TUI additions are `packages/protocol/src/groups/session.ts` and `packages/protocol/src/groups/permission.ts`: **35,101 new unique source bytes**, bringing its unique-source total to **2,385,890 bytes**. They do not add assigned paths or change assigned-entry depth.

Fresh re-reads of skills.tsx/session-actions.ts and reuses of the TUI action tests and five desktop sources do not count again. The session protocol was already in app-session's original source index; its new incorporation is for design-tui only.

## Conservation and exact evidence

The original three coverage ledgers still describe **4,506 unique paths**, with no reduction or duplicates. Recomputed sorted-path SHA-256 is:

`8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582`

Twelve original L1/coverage/sources/decisive-evidence files were hashed and remained unchanged by this producer. All body edits, copies and evidence outputs are inside the assigned `corrections/l1-r2` area.

All 14 source bodies round-trip to the preserved connector responses and match byte length, SHA-256 and Git blob SHA. Thirty-eight quoted spans were independently reparsed from the two decisive-delta files and matched against the exact captured source lines. These are artifact/provenance checks, not product tests or a semantic sufficiency judgment. The checks and per-section measurements are recorded in `verification.json`; exact source-span hashes are in the two excerpt manifests.

## Invariants and remaining gates

| Invariant | Treatment |
|---|---|
| GO-I1 | Originals remain preserved; corrected full bodies, exact requests, public response, source responses, diffs and new hashes have separate identity. |
| GO-I2 | Source comments, protocol descriptions, historical measurements, UI rules and unverified runtime/filesystem behavior remain distinct. Existing desktop static discrepancies remain visible. |
| GO-I7 | No oracle or judge packet was accessed. There were no product edits, remote writes, gh use, credential extraction or runtime/host mutation. |
| GO-I8 | Hashes, counts, excerpts and reader-size checks are mechanical evidence only. The producer issues no semantic PASS. |

L2–L4 remain blocked until the complete L1 layer is judged. The principal incorporates source/family metadata, binds the exact candidate bytes and performs any later remote publication after its gate. Zero product tests, builds, typechecks, decoder runs, UI sessions, application restarts or backend actions were executed for this correction.

## Deliverables

- Complete bodies and exact diffs: `app-session/l1.md`, `design-tui/l1.md`, `desktop-web/l1.md`, with a sibling `l1.diff` for each.
- Evidence: `decisive-delta.md`, `decisive-delta-desktop.md`, `sources-delta.json`, `family-delta.json`, `sources/` and `original-responses/`.
- Provenance: `producer-request.md`, `producer-response.md`, `preserved-originals.json`, `excerpt-manifest.json`, `excerpt-manifest-desktop.json` and `verification.json`.
- Reproducible artifact assembly/checks: `prepare-correction.py`, `extend-desktop.py`, `verify-artifacts.py`. These process documents and captured bytes; they do not run product code.

