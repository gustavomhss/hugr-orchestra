# Lean: selected Orchestra profile dashboard

## Owner and source

User rejected dense per-tool/context UI. One dedicated Lean chapter follows the
currently selected Orchestra repository profile (`server + directory`), exactly
like existing chapter pages. Switching profile remounts data, history and controls.
Scope derives from native instance project ID and canonical directory; server
identity partitions requests/storage. Different profile directories remain distinct
even for one Git project ID; the non-Git shared `global` ID never joins profiles.
No App Dock profile or agent/seat nativeProfile is the dashboard owner.
User clarified: every visible Orchestra interface belongs to the selected profile;
changing it must show a different Lean screen with independent preferences/totals.

Expansion is merged PR129 in Lean utility/integration, db767483c06b57614fbed6c3fe7f70ae810e46a4,
same runtime tree as reviewed94d17f5d89a220b4aed80680a04d20b5a2d538ab.
Inventory groups 20 default IDs and 25 exact-corpus families into Schema
LeanCoverage.items. Exact evidence is preservation, not a new reducer; Jest/Vitest
plaintext reduction was withdrawn. Inventory must agree with actual pinned package.

## Frozen presentation and wire contract

Schema LeanCoverage and LeanDashboard own public data. Primary table:
item name, saved bytes, saved estimated tokens, independent on/off. No raw debug
metrics wall. Native MxPage/kit fonts/palette, refined compact rows, aligned numeric
columns, restrained brand marks, category/search filtering and clear empty states.
Header totals show bytes AND tokens. Item detail shows actual commands/executions,
time/status and both savings fields; missing measurement is unavailable, not zero.

History is durable saved instrumented profile history, not loaded browser Session
cache, billed cost, pre-instrumentation usage or lifetime deleted executions.
Bounded collector reports complete=false when capped. BigInt sums; unavailable
outside safe range, no clamping/rounding. Tokens chars-per-token-4 estimated and
signed; mixed missing-token measurements cannot masquerade as a full token total.
Identical original-owner metrics dedup; conflicting evidence discarded; copied
fork metadata must match containing native Session/call/directory or be excluded.
Command details come from existing durable input, never numeric metric metadata.

Standard backend declared HttpApi Project group endpoints:
GET /project/lean (project.lean), PATCH /project/lean (project.leanUpdate),
GET /project/lean/history/:itemID (project.leanHistory). Native InstanceContext derives
scope; requests cannot choose arbitrary profile IDs. Real SDK generated after routes.
Protocol without this capability displays unavailable; it must not fake enabled or
empty successful counters. Client/UI never imports privileged Core/Server runtime.

## Controls and execution

Profile preferences live in private host data, addressed by a hash of native
project ID + canonical profile directory. Absent file defaults from available
global Lean configuration; explicit profile master and individual item overrides
persist independently. Atomic named-file writes, bounded strict decode, serialize
same-profile updates. Read/write failure surfaces in UI; uncertain preferences do
not apply a reduction. Disabled item preserves output; disabling Cargo cannot
disable pytest/Go/Vitest. Disabling preserves previously earned savings.

Lean core stays one pure TypeScript package. Add only safe public snapshots of
built-in profiles and literal command tokenizer for host selection; no new reducers,
command rewriting or core I/O. Actual expanded source is built/packed in CI and
pinned by commit + archive digest + full license material. No invented release.
Native adapter uses actual capture and existing post-policy projector, preserving
unknown/failure/truncation/permissions/plugins. Numeric metadata may carry itemID,
but never command/output. Historical old engine decisions remain readable.

Lean selection exports are `getProfiles(): readonly Profile[]` (detached frozen
snapshots) and existing `tokenizeCommand(command): readonly string[] | undefined`.
Core LeanProcessor adds `identify(command): LeanCoverage.ItemID | undefined` and
`process(observation, items?: LeanCoverage.Settings)`; ambiguity must remain exact
even if disabling one profile would otherwise remove the overlap. Exact-only
families get honest preservation attribution, no made-up reducers. Parent alone
owns LeanEngine.current/accepted source pin updates after artifact verification.
Preference dependency signatures are frozen in orchestra/session/lean-profile-preferences;
current implementation is named unavailable, not a successful default preference.

## Disjoint owners and verification

Parent owns these Schema contracts and integration. Separate worktrees:
P Lean public selection API/artifact pin; N native item selection/telemetry;
B backend preferences/durable collector/declared routes/SDK; U chapter UI/style;
R route/sidebar/controller plus simplification of rejected mounts; V visual/native
proof after dependencies. No shared edits, no production stubs dressed as green.
Focused tests/builds in CI only, actual package typechecks, targeted preservation
mutants RED -> exact restore -> GREEN. Source hashes/cold review verified by lead.
Named staging, first compiling push, small PRs <=400 changed lines; no merge.
