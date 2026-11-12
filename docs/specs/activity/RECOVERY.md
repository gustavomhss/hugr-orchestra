# Session recovery — 2026-11-11

Recovered from OpenCode session `ses_e3a46f57bffeLA50uDzLD1M90u`, title **Activity monitor**, slug `clever-planet`.

## Current checkpoint

Continuation in progress: bounded manual disk collection and authenticated cached/read APIs are now connected to Cache, Temporary and Logs. The changes are not yet a validated checkpoint: focused hosted Core (Linux/Windows), Server and App requests are waiting for runner capacity. Schema, Protocol, Client, Server and App typechecks passed; Core passed before the final issue-deduplication/socket-test change and is rerunning. Guardrails passed 78 rules with zero findings. Independent scoped collector and API/UI reviews approved the source. Manual isolated inspection confirmed unread-before-request, a complete 17-byte reading, retention after a partial retry and filter-miss behavior. Final receipts will follow below.

### Previously validated checkpoint

The recovered implementation now has a real Worktrees registry inventory, a server process observation ledger, session provenance captured at spawn, authenticated snapshot/explicit membership APIs, generated Client methods, and a Trees table with native tree identity and named host CPU readings. Source changes are preserved in small commits (the initial layered series `638b02293f` through `cabe9d6d7f`, then the interpolation fix `1cee929822`), each under 400 changed lines. They have not been merged or loaded into the owner's running app.

Native hosted validation passed on Linux, Windows and macOS. Core passed 35 focused tests on each of Linux and Windows, including the corrected first snapshot. Server passed six focused tests. The final App pack passed 25 unit tests and three browser-condition store tests on Linux. Manual isolated inspection exposed incorrect interpolation syntax, and source review found stale optional CPU could survive a server-instance replacement; both corrections now have hosted regression proof. Package typechecks, formatting, guardrails and independent scoped reviews passed. Detailed receipts and snapshot boundaries appear below. No local test suites ran.

Disk/cache measurement, the remaining six collectors, durable action ledgers, process controls and cleanup are still unimplemented. This is continued implementation, not completion of R1–R20. The recovered original design, requirements, acceptance prose, mock and research files remain preserved in this worktree; they are separate from the committed implementation.

- Branch: `activity-monitor`.
- Worktree: `/Users/gustavoschneiter/.local/share/opencode/worktree/6d2de9/activity-monitor`.
- Starting commit: `ae88ee7f81`.
- Source database was opened read-only. No session records were changed.

## Owner decisions recovered

Build an Orchestra activity monitor integrated with Omni, including process management, disk/cache management, worktrees, Docker, temporary files, logs, IN/OUT and quarantine. Categories are tabs at the top. Their names stay in English. The UI follows Orchestra’s visual identity. A recorded session name belongs in Owner; lifecycle belongs in a separate flag/state. Do not spend model tokens generating opinions about processes. Design and requirements have equal authority as representations of the same product. Work happens in a separate branch and worktree.

The latest user correction asks for the actual app implementation with consistent typography, spacing and alignment, and real data; another HTML mock does not satisfy it.

## Verified interruption point

The last assistant action attempted to launch an Electron preview and was interrupted. Before that, the session removed its experimental desktop IPC and native `treeId` additions. At recovery, no native, desktop, Core, Protocol or Server changes remained in the worktree.

The pending changes were chapter registration, navigation, translations, a placeholder UI, research, mock and product documents. `recordedTrees()` always returned `[]`; all eight tabs used the same empty array. Existing reading tests validated projection rules, not integration with a collector. The product was not implemented despite the long transcript.

## Resumed work

The Worktrees tab now reads the existing server project/directory registry, with bounded request fanout, atomic publication, cancellation on leaving the tab, refresh, original sample timestamps retained on errors, filtering, and explicit limits on what registrations prove. Other tabs identify their missing collectors instead of rendering a fabricated empty machine. Category controls use the shared keyboard handler and a labelled tab panel.

That first recovery change provided a registered-worktree inventory. It did not complete R1–R20. Subsequent work is recorded below.

## Next implementation boundary

1. Record session identity at process creation in the server-side spawn path; retain the real supervisor identity separately from sampled PIDs. Establish read-only snapshot and lifecycle contracts with Schema → Core/Protocol → Server dependencies, then regenerate Client.
2. Expose that data to Trees with named readings, timestamps and explicit inspection failures. Validate a real spawn-to-screen path on hosted CI before adding process actions.
3. Add bounded disk/cache collectors and per-object use proofs; connect the remaining categories. Keep uncertain readings explicit.
4. Implement previews, generation checks, human confirmation and verified postconditions before exposing cleanup or process-control actions.

The recovered acceptance document is prose, not an executable acceptance suite. Its oracle list must become change-scoped tests alongside each implementation boundary. The existing spec/status text also predates later implementation authorization in the recovered conversation; it is not evidence that the work is complete.

## Validation of the recovery change

- Package-local `bun typecheck`: passed.
- `bun run check:guards --base origin/dev`: passed, 78 rules, zero gate/warn findings. The initially shallow shared checkout had no common ancestor available; fetching 200 additional ancestors restored the correct comparison.
- `git diff --check`: passed.
- Hosted request: `bun run test:ci app src/orchestra/chapters/activity/inventory.test.ts src/orchestra/chapters/activity/reading.test.ts src/orchestra/navigation.test.ts src/orchestra/tab-keys.test.ts`. The upload completed; the command is waiting for runner capacity before creating its temporary CI branch. There is no CI pass or workflow URL yet.
- Visual validation in a running app has not been performed. Existing app/server processes were not restarted.


## Process observations — follow-up

Added Schema’s `ActivityMonitor` wire contract, Core’s process-global observer, a provenance reference bound by ToolRegistry, authenticated `GET /api/activity`, generated Client methods, and the Trees table. ToolRegistry captures the stored session title through its captured SessionStore dependency before tool execution; the pipe spawner records it with the invocation metadata. Empty provenance stays empty.

The observer samples actual supervisor membership, retains old readings with their timestamps on inspection failure, distinguishes root exit from tree exit, coalesces concurrent inspection passes, bounds an HTTP snapshot read to two seconds, and retains the last 32 closed/unavailable observations. It uses weak child references and never consumes child output, stops a child, changes adoption or owns process lifetime.

Coverage is explicitly server pipe spawns through OmniSpawner, since this process started. Native collection calls, PTYs, desktop processes and historical machine processes remain outside this initial observer. There is no CPU/footprint/RSS collection, durable process ledger, supervisor address or process control. `recordID` is an observation UUID, never an action address. These limits are visible in the API contract and UI. The initial observation registry is process-local and is lost on server restart.

Focused tests cover real supervisor membership, output independence, immutable recorded provenance, snapshot isolation, actual spawner instrumentation, surviving descendants after root exit, invocation scoping and authenticated project-independent HTTP reads. Hosted proof is still pending; no local tests were run.


Follow-up validation: package typechecks passed for Core, Server, App Shell, Schema, Protocol and Client. Spawn-imports passed (3,857 files, 66 allowlisted sites); Guardrail passed (78 rules, zero findings); formatting and diff checks passed. Hosted Core (Linux and Windows), Server (Linux) and the earlier App request are pending runner capacity. None is reported as a CI pass. The source changes have not been integrated into the running desktop app.


## Native identity and first resource reading

Added the generation-qualified native `treeId` forwarding chain and channel tests, with a server/observer `instanceID` and optional `supervisorID` in each observation. The UI now displays the native id separately from root PID. The frozen additive contract and acceptance criteria are in `NATIVE-IDENTITY.md`. Pipe/PTY binding tests are part of the native hosted gate. An older loaded native binary retains explicit unread identity.

Added a host CPU reading derived from `node.os.cpus` cumulative time deltas: named source, actual window, timestamp and minimum sample window. No first-sample zero, no rate without a window, no unmeasured memory pressure or attribution to sessions. Pure acceptance cases cover idle/busy extremes, weighted aggregate time, counter resets, missing CPUs, topology changes and invalid values. Client reading age now combines server-relative timestamps with elapsed client monotonic time, so remote clock offsets cancel.

Earlier App snapshot proof: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43106296609 — 22 passed, 0 failed, Linux, snapshot a75912c654771b69781ab9e492671c41b797240f. It predates this native identity/CPU change and is not proof of the new changes. Original Core/Server requests remain separate pending runs. New native, Core, API and client validation will be recorded with their own exact snapshots.


### R20 correction: ledger refresh versus explicit membership inspection

Source review found that Unix `Child.processes()` enumerates the OS process table (`omni-supervisor/src/unix/procs.rs`). Automatic membership reads in the original observer would therefore violate R20. The final tick now reads only the recorded spawn ledger, cached readings and host logical-CPU counters. Root exit updates the recorded state to unknown without enumerating members. Membership is measured only through authenticated explicit `GET /api/activity/:recordID/inspection`, invoked by **Read members**. Missing members remain unread; prior readings retain their source and age. Root exit is never silently reported as tree exit.

A real-child boundary test counts native membership calls and requires zero calls from repeated snapshots and root exit, then exactly one per requested inspection. The snapshot source is now `orchestra.omni.ledger`; successful member readings name `omni.processes` per record. Observation UUIDs address these read-only lookups and still do not authorize control. This correction supersedes the earlier automatic sampling description above.

### Validation checkpoint

- Earlier Core snapshot: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43109519347 — 28 passed on each of Linux and Windows, including the real-spawn positive control. Earlier Server snapshot: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43109594137 — 5 passed on Linux. These predate native identity, host CPU and explicit membership inspection and do not validate those additions.
- Native commit `2ec68ea5f07d5dd9100465e0080744dafa0fa029`: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43111882364 — Linux passed; Windows failed the new PTY acceptance marker because ConPTY prepended terminal initialization sequences; macOS was cancelled. Commit `d208ed873d` corrects only the test’s marker handling with `stripVTControlCharacters`, and rejects EOF before the marker. A new hosted gate is required.
- Independent read-only ledger/provenance review approved the implementation. HTTP/UI review found disclosure rows were recreated by polling; keyed reconciliation now preserves rows within one observer instance and resets them for a new instance.
- Package typechecks passed for Core, App Shell, Schema, Protocol and Client. The latest Server typecheck is pending. Spawn imports passed (3,858 files, 66 allowlisted sites); guardrails passed (78 rules, zero findings); diff checks passed.
- Current Core (both operating systems), Server and App test requests were started after the explicit-inspection and disclosure fixes. Results remain pending. No local tests were run, and the running app/server was not restarted.
- Session owner lookup now runs at actual spawn, rather than before tool execution. Observation registration occurs in the synchronous acquire callback immediately after spawn, so interruption cannot leave a created pipe process unrecorded.
- The first retry used an abbreviated checkout ref and failed before testing; it was cancelled and replaced with a full-SHA dispatch. In run https://github.com/gustavomhss/hugr-orchestra/actions/runs/43115231627, Linux passed, Windows remained in progress, and macOS was cancelled before runner allocation with annotation `The configuration 'macos-14-arm64-us-default' is not supported`. GitHub’s [runner image catalog](https://github.com/actions/runner-images) confirms macOS 14 retirement. Commit `8bc0ccdbde4f63db9ab788e3a5fdcda7f82939ce` updates only the Omni gate’s macOS image to `macos-15`; the Linux/Windows lanes, test commands and trigger policy remain the same. A fresh native matrix was requested on that exact commit.
- Native exact-SHA proof: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43115787678 — **success on Linux, Windows and macOS 15**, commit `8bc0ccdbde4f63db9ab788e3a5fdcda7f82939ce`. Rust tests were scoped by `tree_identity`; the native script also ran its binding contract/hardening and new pipe/PTY acceptance steps. Independent cold review approved the committed native diff with no concrete defects and reproduced the SHA/diff gates. No merge or release has occurred.
- A tool-server interruption lost the local terminal handles while child checks continued. The three existing hosted-test request processes were found alive and were not duplicated. Orphaned Core/Server typechecks were stopped and restarted with persistent output/exit files so their results can be recovered after another interruption. This does not restart the running Orchestra app or its server.
- The recovered Core and Server typechecks completed with exit 0 (`/tmp/activity-core-typecheck.exit`, `/tmp/activity-server-typecheck.exit`). Core finished just as a diagnostic trace rerun was being started; that redundant trace process was then stopped. No compiler defect or source change was inferred from the delay.
- Locale review checked process/CPU terminology against [Firefox’s pt-BR process-manager help](https://support.mozilla.org/pt-BR/kb/gerenciador-de-tarefas-do-firefox) and the maintained [VS Code C# pt-BR corpus](https://github.com/dotnet/vscode-csharp/blob/main/package.nls.pt-br.json), and consulted the [ABL vocabulary entry point](https://www.academia.org.br/nossa-lingua/busca-no-vocabulario). The ABL page did not return a queried lexical result, so it is not claimed as verification of a particular word. Corrected the unexplained `Logical` leftover to `Lógico` and used `corresponde` for filter matching. English source copy is unchanged. Retained tab names follow the owner’s explicit decision; `CPU`, `PID`, `Id`, literal sources, percent/time placeholders, Omni and Monitor are identifiers, units or product names. `Footprint` remains the technical metric named by the requirements. These terminology checks do not constitute visual acceptance of the page. The hosted App snapshot predates these two copy-only changes.

### Current integration proof

- App: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43119117846 — 23 passed, zero failed, Linux, snapshot `faf61ab4455b006ec027e083822273de3987d4b7`. These unit tests do not preload or require the Omni positive control; they do not exercise native spawns or visual rendering.
- Server: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43119132209 — 6 passed, zero failed, Linux, snapshot `83f31ca4fcc32938171a6177f87fd2c27f780b55`. Positive control passed with one real Omni spawn and zero delegated spawns. Authenticated explicit inspection retained the native identity through the actual HTTP implementation.
- Core: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43119129867 — Linux failed one of 35 tests: the first CPU sample emitted an own `cpu: undefined` key, which is invalid for the omission-based optional wire contract. The other 34 tests passed, including the observer boundary and surviving-descendant regressions; the positive control passed with 15 Omni spawns and zero delegated spawns. Windows was still running when the fix was prepared.
- Corrected the observer to omit the absent CPU key and strengthened the first-snapshot schema acceptance test. The public contract did not change, so Client regeneration is not needed for this correction. A new Core-only hosted request on Linux and Windows, plus Core typecheck and guardrail checks, was started. The corrected Core source remains pending runtime proof.
- The corrected Core typecheck passed (exit 0), formatting passed, and guardrails passed again (78 rules, zero findings). Targeted independent review approved the CPU omission fix and first-snapshot regression. A separate independent review approved the Worktrees inventory/read/error/cancellation implementation. Shell/navigation review found no functional defects; its proposed change from `não colapsei` was rejected by the lead because R11 and `SPEC.md` explicitly require that exact product wording. Visual rendering remains unverified.

### Isolated manual preview and interpolation correction

Started a separate backend on `127.0.0.1:5096` with fresh temporary data/config/cache/state/home paths, a preview-only password and no daemon registration; started this worktree's web frontend on `127.0.0.1:5037`. The first backend launch correctly refused missing native binaries. The preview then used the existing matching addon/supervisor pair from the canonical checkout, read-only; that older binary does not expose `treeId`, so the actual UI correctly showed unread identity. No local Rust build, test suite or owner app/server restart was performed.

Manual `agent-browser` inspection used a fresh browser profile and actual HTTP responses. Trees displayed real startup process observations with blank owners, named host CPU/window/age, and unmeasured cells. Worktrees showed the real empty temporary registry. Cache/Docker/Quarantine showed collection unavailable, never an invented empty machine. Arrow and End navigation changed the selected tab and labelled panel; the layout was inspected at 1440×1000 and 1000×800. Expanded tree details remained open across several automatic refreshes. Captures are in `/tmp/activity-preview-trees-fixed.png`, `/tmp/activity-preview-worktrees.png` and `/tmp/activity-preview-narrow.png`; these temporary artifacts are not a production Electron acceptance claim.

The preview found literal `{value}`, `{count}`, window/age and category placeholders: the shared `LanguageProvider` uses `@solid-primitives/i18n`'s `resolveTemplate`, which requires double braces. Commit `1cee929822` fixes only placeholder syntax (the wording is unchanged) and adds two locale cases exercising all seven dynamic messages through that actual formatter, including window age. The corrected preview displayed real numeric values and category names. App typecheck, formatting, guardrails (78 rules, zero findings) and independent targeted review passed; the new hosted App request includes the formatter regression plus the earlier four files. Runtime proof remains pending.

The same manual preview was inspected in pt-BR after selecting it through Settings. Numeric values were substituted, owners remained blank without provenance, and the eight category names remained in English. The capture is `/tmp/activity-preview-br.png`. This extends the earlier visual checkpoint; it does not validate a packaged desktop build or the new native getter in a local binary.

### Core retry and client source-lifetime boundary

Core retry https://github.com/gustavomhss/hugr-orchestra/actions/runs/43123398968, snapshot `0da76de87e5bf02bbc707b2d938ae60111cf9e6b`: **35 passed, zero failed on each of Linux and Windows**, with 15 real Omni spawns and zero delegated spawns per OS. Both positive-control verdicts passed; the `test:ci` command finished with exit 0. No Core source has changed since that uploaded snapshot.

Review of the installed Solid store implementation found that returning a fresh object to the nested `snapshot` setter merges its properties, so an absent CPU reading from a new server lifetime could leave the old one present. Commit `fb6d67e529` moves reconciliation into a small production updater returning the root partial `{ snapshot }`. Same-instance records reconcile by `recordID`; a new instance replaces the complete snapshot, including absent optional fields and row identities. Three browser-condition store regressions test the actual updater: initial unread CPU without losing other UI state, same-instance row identity/update/removal, and instance replacement even if record IDs repeat. The acceptance critic approved the oracles before implementation, and independent implementation review approved the result.

The earlier still-queued App interpolation request was terminated before branch/run creation and replaced by one combined request including the five unit files plus `test-browser/activity-snapshot.test.ts`. App typecheck passed after the final updater change. Hosted runtime proof for this final UI snapshot is pending.

The temporary browser session and both preview servers were closed after inspection; ports 5037 and 5096 were confirmed unbound. The pre-existing native supervisor remained running. Preview captures were preserved outside the repository at `/Users/gustavoschneiter/Documents/HuGR/orchestra-recovery/2026-11-11/activity-monitor-previews` (`trees-en.png`, `trees-br.png`, `worktrees-en.png`, `narrow-en.png`). Final committed-source guardrails passed again: 78 rules, 69 changed paths, zero findings. The final combined App request is the remaining runtime gate for this implementation checkpoint.

### Final focused gate receipt

This receipt supersedes earlier pending/failed checkpoint statuses above; those are preserved as the recovery history, not the final verdict.

- Native: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43115787678 — scoped Rust identity test plus the native script's binding/contract/hardening gates passed on Linux, Windows and macOS 15. The native source and Omni workflow have not changed since its tested commit `8bc0ccdbde4f63db9ab788e3a5fdcda7f82939ce`.
- Core: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43123398968 — 35 passed on each of Linux and Windows; positive controls passed with 15 Omni spawns and zero delegations per OS; CLI exit 0. The tested Core tree `dd9c0aa34d920024b49e55e2da0ba10e1531de15` exactly matches the committed package tree.
- Server: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43119132209 — six passed on Linux, positive control passed with one real Omni spawn and zero delegations. The tested Server tree `2026c3997652c2677a4391bac8ddd862d8c536ec` exactly matches the committed package tree. The subsequently corrected Core producer omits undefined CPU before encoding; the public HTTP contract is unchanged.
- App: https://github.com/gustavomhss/hugr-orchestra/actions/runs/43127909053 — snapshot `765c8d721fde32153484a17378825570c987a9cc`, 25 unit tests plus three real Solid-store browser-condition tests passed, zero failures; CLI exit 0. The browser run's Omni control correctly reported not applicable with zero spawns and zero delegations. The tested App Shell tree `08295ad5a9c256f572bed2420f335394278dac2a` exactly matches the committed package tree.

All focused runtime gates for this checkpoint passed. The monitor remains a read-only implementation stage with the coverage and unimplemented product requirements stated at the top; this is not a full-suite, packaged-desktop or R1–R20 completion claim. Original recovered design/mock/research files and the unrelated inherited Relay SQLite sidecars remain uncommitted and preserved locally.

## Manual disk collection continuation

- Source units: `7421be3329` (collector and wire contracts, 350 changed lines), `e99a8d4db1` (authenticated API and generated clients, 156), `2ecb89c3b8` (three category views and translations, 222), `aaf1e483f5` (deduplicate unread scopes and cover real unsupported sockets, 14). No merge, release or installed-app restart occurred.
- Contract: cached `GET /api/activity/disk`; explicit `POST /api/activity/disk/:rootID/read` with only `cache`, `logs`, `temporary`. The server supplies `Global.Path.cache`, `.log`, `.tmp`. Clients cannot submit paths. Snapshot reads do not walk; per-root overlapping reads coalesce. Each server lifetime has an independent UUID.
- Collector: regular-file lengths per path, streaming directory enumeration, 10,000 admitted entries, depth 64 and cooperative two-second elapsed budget. Links are not followed. Unavailable/unsupported/changed/limit/overflow scopes make the attempt partial; at most 32 issue details are returned with a deduplicated full issue count. A root limit covers the unfinished remainder. Metadata calls are not cancellable OS I/O timeouts; a detected elapsed overrun cannot produce `complete`.
- Retention: only a complete attempt replaces Logical and its timestamp. Partial attempts show their own observed bytes, entries, issue scopes and age separately. Before a complete attempt, Logical and Age remain unread. Owner stays empty, Unique stays not collapsed, Use check stays unproved. No process table scans, filesystem mutation, use proof, allocated/unique/reclaimable total or cleanup action was introduced. Mutable metadata windows are not atomic snapshots or action identity proofs.
- Acceptance oracles were written before collector implementation, then expanded from independent coverage criticism. Two final cold coverage rounds found no remaining scoped gaps. No hosted red-baseline execution was captured, so no executed red-to-green claim is made. Ten collector cases exercise real files, empty/nested directories, hardlinks, symlinks, missing paths, entry/depth/time budgets, stable cached snapshots, per-root singleflight, stale-value retention, permission gaps, sparse-file sum overflow, Unix sockets and issue-detail limits. Permission/socket fixtures have explicit Windows skips; sparse overflow runs on Linux only.
- Independent code review found an elapsed-budget gap; it was fixed and the actual correction was re-inspected. Manual preview found duplicate root-limit scopes; the deduplication fix and its regression oracle were separately inspected. API/UI review checked authentication, fixed root selection, GET-only mounting, manual POST, cancellation, whole-snapshot replacement, translated copy and stale reading ages. Relay arms were created, but the previously disclosed missing SubagentStop hook remains unwired; these were manual reviews and gates.
- Manual preview used a new isolated backend on 5096, Vite on 5037, a fresh browser profile and temporary XDG/data/tmp roots. It used actual HTTP and filesystem metadata, not a mocked API. Cache produced a partial walk with named symlink/budget gaps. Temporary initially stayed unread, measured a real 17-byte file, then retained that value and its original age after a deliberate symlink gap; the latest attempt showed its separate age. A nonmatching filter said no match. Screenshots: `activity-monitor-previews/disk-temporary-en.png`, `disk-partial-en.png` under the recovery artifact directory. The older local native binary was reused read-only; this is not new native-binding or packaged-Electron validation.
- Localization terminology was cross-checked against [Mozilla's pt-BR storage copy](https://support.mozilla.org/pt-BR/kb/limpe-cookies-e-dados-de-sites-no-firefox) and [Microsoft's pt-BR read/cache terminology](https://learn.microsoft.com/pt-br/visualstudio/ide/configure-languages-c-cpp-intellisense). Technical source identifiers, byte symbol, code paths and the owner-required English tab names remain unchanged; R11's explicit “não colapsei” remains intact.
- Focused requests pending: Core `test/activity-disk.test.ts --os both` (`/tmp/activity-disk-core-sealed-ci.log`), Server `test/activity-http.test.ts` (`/tmp/activity-disk-server-ci.log`), App's existing five unit files plus `test-browser/activity-snapshot.test.ts` (`/tmp/activity-disk-app-ci.log`). Superseded Core upload/wait processes were canceled before creating a CI branch when source/tests changed; none is evidence of a runtime failure. The helper waits up to 30 minutes behind existing queued workflows before starting. No local tests ran.

Disk coverage remains limited to three declared Orchestra roots; per-worktree disk collection, external caches, other collectors, durable action ledgers, per-object use proofs, process controls and cleanup remain outstanding product work.
