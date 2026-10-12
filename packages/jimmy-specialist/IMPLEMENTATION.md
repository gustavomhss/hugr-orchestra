# Discovery integration evidence

## CURRENT — final evidence checkpoint, 2026-10-10

**Feature implemented; final main CI passed all 12 jobs. Qualification failed; release acceptance blocked.** Final tested source: `fa00d95cb660de09ebbeffc0e1fafc9d02bb7e5c`, product tree `a3ecd03c8e6078edda9cf81fc9844daf9b2663e5`. Final main [38030684084](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38030684084) tested snapshot `86704ea0f4844f9b8099e54852c20befcd71f61f`; complete path/mode/type/SHA comparison and reconstructed product-tree hash match after excluding only `.ci-run.json`. Altered-SHA control rejected. [HANDOFF.md](HANDOFF.md) records exact remaining acceptance boundaries.

### Completed scoped mechanical evidence

| Scope | Actual run | Measured reach |
| --- | --- | --- |
| Repaired consolidated native controls | [38015590391](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38015590391) | 126 passed on each of Linux, Windows and macOS |
| Core controls | [38024639488](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38024639488) | 22 passed on each of Linux, Windows and macOS |
| App locale parity | [38025246533](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025246533) | 5 passed on each of Linux and Windows |
| Client controls | [38025246237](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025246237) | 13 passed on each of Linux, Windows and macOS |
| Codegen controls | [38014205713](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38014205713) | 67 passed on Linux; old-producer detecting control [38013811655](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38013811655) retained seven failures |
| Permission/deadline controls | [38023867171](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38023867171) | 41 passed on each of Linux and Windows; detecting mutant [38023900771](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38023900771) remains separate evidence |
| Bounded-log production desktop proof | [38025429218](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025429218) | Linux: 3 passed, actual guard proof, typecheck and cleanup controls. Whole Linux/Windows workflow RED because Windows proof is unsupported; no Windows qualification credit |

Production Chromium [38027999108](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38027999108) completed 28 passing cases. Final macOS Electron [38028275423](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38028275423) completed three passing cases, including actual native/artifact proof, scoped typecheck and detecting cleanup controls. SDK/plugin ordering [38030580678](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38030580678) completed two passing cases with real generation/compilation and removed-edge rejection.

### Latest full main and prior ancillary lanes

Latest full main [38030684084](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38030684084) is **GREEN: 12 successful jobs**. Production E2E: 469 passed, one existing fixme skip. All five Orchestra shards executed: 9,409 passing shard records, 91 skips, two TODO, zero failures. Linux other-package Turbo executed 20 tasks with zero cached tests; four subsequent dependency builds replayed cache. Generated-client and full HttpApi gates executed successfully. Specialized Electron cases and Windows E2E retain their distinct lanes and omissions.

The final full HTTP CLI executed coverage, auth and effect modes: **271 scenarios / 233 routes in each mode, zero failures, missing cases, extra cases or skips**. All 13 research scenarios passed in every mode. Coverage proves registration/completeness; auth and effect execute their production request paths. [EPIC-CONFIRMATION.md](EPIC-CONFIRMATION.md) preserves all earlier RED checkpoints followed by final GREEN evidence.

Prior native [38022081085](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022081085), typecheck [38022083326](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022083326), Storybook [38022088731](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022088731) and Nix [38022093645](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022093645) passed on their exact prior source. They were not rerun on the final source. Nix evaluated required outputs/devShells for four systems; optional desktop attributes warned. Evaluation is not a desktop build or feature claim.

### Study and performance outcome

Original v15 candidate `4df291b7e832385257eca092a475bb1db6d3082f`: **37 pass / 5 fail / 42**; baseline: **30 pass / 9 fail / 3 unsupported / 42**. All 84 original trials and grades were retained in the sealed original ledger. Candidate-only confirmation `f8e276c20dc292369f9cf8958e4b3e1f049f4462`, loaded roster/worker hash `9a00703e9ba953b12ae6bb03d5f5ce47dff0c1b7b63997a0b23183c6e97fb912`: **35 pass / 7 fail / 42** after v18 saved-output reconciliation. All 38 native returns received valid cold grades; no new native task was rerun. Three completed-parent publication defects remain (R05 rep3 provenance; R08 rep1/rep2 applicability), plus four overall-budget missing-native failures, one each in R11–R14. Reconciliation preserved original grades and inconclusive records when it ran. Public evidence and recorded seals: [STUDY-CONFIRMATION.md](STUDY-CONFIRMATION.md), v17/v18. Raw private backup availability is now unverified. No superiority claim.

[BASELINE-BENCHMARK.md](BASELINE-BENCHMARK.md) records candidate median common-stream completion **1.410× slower**, descriptively: 319724.9 ms versus 226821 ms. Hosted-machine equivalence and the candidate installed dependency graph are unknown. Research rendering/opening is candidate-only; no method speedup is established. Billing, billed/total native tokens and raw-read bytes remain unknown.

Historical paragraphs below preserve dated evidence and original failures. Their then-pending plans are superseded by this checkpoint and the blocked handoff. Public study reports were recovered from Git after temporary directories became unavailable; private ledger backup availability is unverified. No private oracle content was imported or recreated.

## Historical integration checkpoints

Status: committed integration checkpoint, 2026-10-09. This is not release acceptance or evidence of research quality. The final charter, independent audition and complete target-runtime qualification remain open. Current closure ownership and verification cadence are in [DELIVERY.md](DELIVERY.md).

Implementation baseline: `73651a0e69a2912d9244dbb73e985c5828c03058`, branch `jimmy-discovery`. Initial implementation checkpoint: `6b5a831c0cbd915f8855f438fce39150a85fdf32`. Follow-up runtime, consumer and evaluation-preparation commits are integrated on that branch. Planning contracts live in the owner's planning checkout at `specs/jimmy-specialist/`.

## Native vertical slice

- Native discovery invocations resolve the retained Task/Session/project and actual assistant/tool identity. Session rules are carried separately from the immutable native deny floor.
- `research_capture` acquires through the existing `read` and `webfetch` tools. File acquisition uses the same permission and ToolSafety checks, including the physical target of discovery reads. It does not provide a second file/fetch implementation.
- Discovery reads retain bounded bytes observed by the native reader before line cropping, then retain the selected line representation separately. Receipts record original byte/line extents. Evidence locators are relative to the retained representation, starting at line 1.
- Web acquisition enforces the body cap while streaming, retains received bytes before conversion, and retains the selected representation with its transformation and original reference. Generic model-facing truncation does not replace artifact retention.
- Native LSP captures preserve structured results and zero-based UTF-16 coordinate metadata. Atlas Own captures preserve the verified unit, content/receipt hashes and returned coverage. These receipts do not certify runtime behavior or universal language coverage.
- Discovery LSP validates canonical source permissions before opening a document. Its strict query path reports per-server RPC failure/timeout, missing clients and omitted results; unavailable analysis is not an empty successful result. It reuses active clients or starts explicitly owner-configured commands, without activating implicit installers.
- Acquisition outcomes use durable `research.source.attempted.1` events. Source bodies remain outside the ledger. `research_view` exposes bounded corpus handles and acquisition attempts as distinct projections.
- Host request admission precedes acquisition. An exact native call retries its settled historical source without a live read/fetch. Changed selectors, failed prior acquisition and unsettled requests stop explicitly; the host must issue a new call for a new attempt. If a reader exceeds the retained source cap, its explicit prefix remains partial and cannot authenticate a projection beyond it.
- Discovery excludes configured plugin and MCP/resource tool paths. Product writes, arbitrary shell and child delegation remain denied.
- The discovery decoder separates card parsing, reference checks, authored sufficiency and native termination. It verifies that finding references address findings and exposes retained corpus handles when the final card is unavailable or invalid.
- The artifact HTTP handler reads the exact admitted revision and rejects an artifact belonging to a different execution Task, even within the same project. The UI adapter uses the regenerated SDK. Document pagination binds every page to the expected receipt and refuses incomplete, oversized or repeating continuations.
- Native Session deletion removes its managed research artifacts before deleting the binding. Current roster hashes preserve the superseded baseline hash instead of rewriting historical receipts.
- The native Session tool boundary explicitly receives the captured research allowance service. Native Task tracking likewise carries its captured corpus service into discovery decoding; a public caller does not have to expose those services in its own ambient context.

## Measured checks

All tests below ran through `bun run test:ci` on GitHub Actions. No local test suite ran.

| Check | Evidence | Observed result |
| --- | --- | --- |
| Native records, artifacts, binding and allowance | [37817831208](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37817831208) | 21 passed on Linux; 21 passed on Windows |
| UI document continuation and malformed-page controls | [37817825146](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37817825146) | 2 passed on each platform |
| Joined read/capture/document/decoder/HTTP/deletion path | [37820091601](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37820091601) | 3 passed on each platform |
| Acquisition request preflight, immutable retries and joined vertical slice | [37826368060](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37826368060) and [37826365425](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37826365425) | 4 integration tests and 10 record tests passed on each platform |
| Final acquisition retry and over-cap provenance controls | [37828089079](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37828089079) | Linux and Windows jobs succeeded; the Windows log records all 5 integration cases passing without test skips. The local follower lost its network connection; the existing run was recovered with `gh run view`, not reexecuted. |
| Finite Git history and current skill extraction | [37830908147](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37830908147) | 31 passed on each platform |
| Independent boundary corrections and actual TypeScript semantic transport | [37837309092](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37837309092) and [37837418566](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37837418566) | 14 Orchestra and 16 Core cases passed on each platform |
| Complete malformed UTF-8 rejection paired with valid split-scalar projection | [37842409856](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37842409856) | 9 joined integration cases passed on each platform |
| Actual Task interruption, own Atlas full recall and corpus continuity | [37847457441](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37847457441) | Native Task case passed on each platform |
| Task decoder uses captured corpus service without ambient caller exposure | [37856206857](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37856206857) | Same native continuity case passed on each platform with caller corpus service removed |
| Bun and Node skill-tree extraction, roster-hash history and seat-label checks | [37821373280](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37821373280) | These named cases passed on both platforms. The run failed three other cases, corrected in the next row. This run is not an overall green. |
| Repaired generic second-seat source/bundle fixture and native-team profile expectations | [37822787998](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37822787998) | 11 passed on each platform; the generic second-seat fixture exercised its existing isolated mutations |
| Existing read/webfetch, native allowance maintenance, Atlas Own/owner and resume controls | [37817749600](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37817749600) | These cases passed. The original joined HTTP case failed and was repaired in 37820091601. Six legacy Task-resume cases skipped on Windows and provide no Windows evidence. |

The joined HTTP fixture initially built separate native runtimes and returned 404 for the fixture's published document. Sharing the native memo map made that path observable; keeping unrelated cases on isolated runtimes prevented a closed shared scope from interrupting later tests. The production handler was not changed to bypass admission or return a fabricated success.

The generic seat fixture previously copied only the backend skill tree. It now snapshots resident specialist trees without importing the registry before its loader is installed. The compiled skill tests check both backend and discovery, compare actual extracted bytes and assert that the compiled process's authored source root is unavailable.

Earlier local `bun typecheck` completed from the affected package directories: Schema, Core, Orchestra, Protocol, Server, Client, legacy JavaScript SDK, session-ui, UI and app. Those earlier checks do not qualify later edits. Client generation and `./packages/sdk/js/script/build.ts` regenerated the public consumers; generated files were not hand-edited.

## Consolidated closure wave

The owner authorized commits and parallel work, moving heavy tests to final closure and removing repeated per-edit typechecks. Three isolated implementation packages returned committed changes; separate cold reviewers inspected their deltas. Final test and mutation execution was explicitly deferred, so reviewed code below is not a new runtime green.

- Packaged proof now follows actual Bun executable settings and the Node desktop CommonJS shim/external dependencies. It loads embedded skills, performs native capture/finding/document/view operations, deletes the original evidence file before reopening retained bytes, and verifies a persisted final card. Build and proof subprocesses have deadlines and reader/process cleanup. This does not yet qualify the actual desktop sidecar/provider/HTTP path.
- Document reading now compares the full admitted receipt and assembled UTF-8 SHA-256, bounds continuation requests, and cancels continuation/stale writes on replacement or disposal. Generated-client callbacks bind one server. Shared UI buttons, selected-document headings and live status preserve direction/i18n patterns. Browser-safe hashing also works without secure-context Web Crypto; actual browser/RTL/a11y qualification remains pending.
- Evaluation preparation now records frozen source/prompt/skill/runner identity, refuses reused state and redirected Git environments, isolates native config paths, and exports exact scoped document bytes. Provider aggregates remain unknown. The driver is still provisional and explicitly rejects unsupported R14; [EVALUATION.md](EVALUATION.md) gives paired scheduling, setup prerequisites and grader-packet rules.
- Cold review found subprocess lifetime, HTTP/LAN hashing, Git identity redirection and Windows environment-case defects. Each returned correction was reviewed before integration. The consolidated compiler run additionally detected a dynamic-import type annotation and a missing explicit EventV2Bridge service in the packaged fixture; both were corrected.
- One consolidated typecheck batch completed for Orchestra, session-ui, app and Client. Only the failed Orchestra check was repeated after those two fixes. Client and mandatory legacy SDK generation completed from their prescribed scripts, producing unchanged generated outputs relative to the committed checkpoint. The new hash dependency reused installed packages; its lockfile workspace entry is updated.
- Temporary writer worktrees were removed after their committed changes were integrated and their status inspected. Historical evaluation/review artifacts were preserved. No feature branch push, PR or release occurred.

No new heavy suite or model trial ran during this wave. The CI table above remains historical evidence for its exact tested revisions; final suite, mutation controls and model qualification must run against the frozen integrated candidate.

## Joined qualification preparation

The next isolated wave produced three committed packages: a compiled native Maestro/Task/provider/HTTP control, actual timeline/browser and production benchmark controls, and a native R14 interruption/resume collector. These are implemented controls, not execution results.

- The compiled fixture drives a real native Maestro provider-issued Task through SessionPrompt and a localhost Node HTTP provider, derives references from actual durable admissions, returns verified corpus/document handles to the parent and reopens the same document through the generated Client and actual HttpApi handler. A sibling Task must get 404. Both compiled runtime lanes remain queued for final execution.
- Browser controls render the actual ResearchResult in V1 and canonical V2 REST/event paths. Review exposed missing structured Task metadata and the canonical `session.next.tool.success` event name in the compatibility adapter. Lead fixes preserve running/completed structured output, source snapshots and optional durable facts. A narrow validated JSON conversion bridges native readonly/unknown metadata to the older bundled rendering client without type casts or fabricated receipts.
- Native AbortSignal now reaches the generated artifact request. Replacement/disposal controls observe actual aborted browser requests; envelope cancellation is tested before a fresh selection can mask missing cleanup. Production benchmark controls reuse the existing common streaming workload, validate input identity/parameters and distinguish candidate-only research render/open metrics from comparative metrics.
- R14 observes real admitted own checkpoint/finding/contrary records, authenticates source provenance to host-retained original fixture bytes, witnesses provider-stream interruption and resumes only the exact native logical Task under retained authority. It calls the native latest-checkpoint selector, revalidates after cancellation and reports deadline/reference/store/source failures separately. Scanner/Atlas/semantic provisioning and actual independent trials remain unqualified.
- Review found a missed native startup signal. Task now rejects pre-aborted calls, checks cancellation before job startup and handles a signal fired before listener registration by cancelling prompt and owned job. Controls cover native startup metadata and the exact real registry-start boundary; the existing graceful cancellation assertion was updated to the explicit cancelled outcome. This is still source-level closure pending final execution, not a hard cleanup-time measurement.
- Additional source controls reject duplicate/wrong result fences and extra authority fields while retaining documents, and exercise overlapping same-process backend/Jimmy Memory writers and identical retry admission. [QUALIFICATION.md](QUALIFICATION.md) names the remaining N/A and platform gaps instead of inferring full coverage from these additions.
- Consolidated `bun typecheck` completed for Orchestra and session-ui; app compilation uses `bun typecheck tsconfig.json e2e/tsconfig.json` and completed with the new browser/benchmark files included. Compiler findings exposed an incorrect generated-client method path, an erased layer type, pinned Effect codec namespace and compatibility-client JSON/tuple/durability constraints. Existing performance helper typing also needed repair once its actual dependencies entered the E2E project. Failed/invalidated checks were rerun after fixes; one timed-out parallel Orchestra check was unknown until a successful sequential retry. No new CI, browser, benchmark, model trial or mutation ran.

## Remote mechanical closure checks (2026-10-09)

The consolidated final-stage checks below ran on GitHub Actions, including an explicitly asserted native macOS arm64 runner. These are measured scoped results, not full epic, desktop Electron or real-model acceptance.

| Scope | Run | Result |
| --- | --- | --- |
| Request/report guards plus Core research binding/artifacts/records/allowance | [37970558238](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37970558238) | 54 passed on each of Linux, Windows and macOS arm64 |
| Consolidated native research/Task/Atlas/packaging | [37970558341](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37970558341) | 86 passed and 3 failed per OS. Background/failure, actual compaction, ownership, capture, budgets and Task cancellation controls passed. This run is not an overall green. |
| Repaired compiled Bun/Node native Task/provider/Client/HTTP and live Atlas header/compaction controls | [37973737525](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37973737525) | All 4 targeted cases passed on each OS |
| Exact document receipt/digest/paging/cancellation loader | [37980139958](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37980139958) | 6 passed per OS |
| Native event/Task structured-output projection and compatibility helpers | [37982434542](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982434542) | 20 passed per OS with the browser export condition |
| Final production Chromium research result regression after mock authority binding | [37985413261](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37985413261) | 28 passed; actual V1/V2, faults, navigation/cancellation, keyboard, mixed-direction text and locale fallback |
| Candidate production timeline/research benchmark | [37985414156](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37985414156) | 3 predeclared repetitions completed and reported metrics; common workload is 320 history turns, 160 deltas, 30× CPU throttling. No original-baseline comparison has run. |

Runtime failures exposed two previously invisible boundaries: the native schema filter let a scoped skill-root edit deny mask the wildcard discovery deny, and strict Research schemas rejected Solid store symbols. The immutable discovery profile now filters provider-visible schemas independently of mutable Session rules; the presentation boundary detaches the JSON wire shape before strict decoding. Atlas fixture Rules were evicted by genuine per-record decay, so harmless checkpoint records are seeded before the live Rules, with direct-header and provider-header positive controls retained.

Browser infrastructure first tried to start both dev and production servers because multi-argument `defineConfig` concatenates servers. The production override now supplies one configuration. Subsequent actual browser failures localized to inaccessible active Task ancestors and a fixture title/child-message identity mismatch; both were corrected without increasing timeouts or removing assertions. The final artifact mock binds declared authority, receipt Session/revision and any supplied directory header. The benchmark also needed its build-default backend authority forwarded into the existing mock; no workload or CPU settings were reduced.

Historical failures remain: browser infrastructure [37972358847](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37972358847), absent presentation [37973736220](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37973736220), two lifecycle failures [37978207483](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37978207483), benchmark bootstrap [37981405049](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37981405049), and incorrectly selected Solid SSR exports [37981403059](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37981403059). Successful targeted reruns close their named failures; they do not retroactively change those runs or certify all current code through one epic run.

Actual model execution, fresh private calibration, original-baseline byte/capability comparison, source/setup isolation, final charter freeze, detecting mutations and complete desktop/epic acceptance remain pending. The independently authored baseline driver and pinned real TypeScript Language Server are prepared outside checkout; preparation is not runtime qualification.

## Independent review and provisional real-model pilots

Read-only cold review identified six concrete defects: LSP source-permission bypass, semantic failures hidden as empty complete results, foreign-task availability disclosed before scope rejection, split UTF-8 parent validation, missing retained-read invocation checks, and worker sufficiency rewriting native terminal facts. Corrections were independently rechecked. That review also detected malformed complete UTF-8 being silently replacement-decoded after the partial-parent fix; native acquisition now rejects it before publishing a textual projection, while permitting an unfinished valid trailing scalar in a partial observed prefix.

Real native Task execution subsequently exposed two composition gaps that direct leaf tests could not see: the Session tool boundary lacked its research allowance service, and the discovery decoder depended on the public caller exposing the corpus service. Both are now captured/provided at their native boundaries. The continuation test preserves the canonical reduced Atlas closing fold; full own Memory recall retrieves the actual evidence pointer, then `research_view` reopens exact retained bytes.

The owner authorized use of existing OpenAI OAuth and delegated model choice. Available IDs were queried without printing credential values; selected model is `openai/gpt-6.1-sol`. Pilot credentials are read-only runtime loans from the existing legacy provider-auth store. The pilot neither persists nor refreshes that store, uses a separate native database and disclosed-source directory, and keeps grading oracles outside candidate access and repository/CI snapshots.

Independent fixture preparation drafted R01–R13 inputs/oracles with actual source hashes and explicit source completeness. R14 quality setup remains not-ready. Initial calibration lacked a genuinely insufficient-source variant; private v2 variant/freeze records preserve the originals instead of rewriting scheduled trials.

- R01 provisional pilot: fresh cold evaluator reported calibration pass and candidate pass, with native parsed card, checked references and `ended` terminal. Enumerated child trace is 4 provider responses and 11 tool calls; aggregate effort/cost is unknown. The first pilot remains archived as inconclusive because host verification was unavailable and the evaluator saw candidate method bodies in the raw transcript.
- R08 provisional analytical pilot: native execution produced an admitted document exported through digest-checked artifact reads. A fresh R08-only packet evaluation reported calibration pass, candidate pass and document checked. Its packet-level host facts are reported, not independent runtime attestation; child trace/aggregate cost were unavailable in that packet. The earlier evaluator judgment is archived separately because it read unrelated evaluation/control material.

These are single provisional pilots. They do not close the three-repetition paired study, final-prompt confirmation, full R01–R14 quality matrix or comparative performance. Sanitized evaluator exports exclude candidate skill/prompt bodies and raw tool metadata; original native transcripts remain private evidence.

## Qualification still required

- Complete the independent R01–R14 grading/continuation setup, calibrated variants and three-repetition paired runs outside candidate access. Disclosed mechanical fixtures and provisional pilots do not replace that matrix.
- Extend semantic qualification only for explicitly offered configured operations/languages. The actual TypeScript alias/RPC/truncation fixture establishes its measured scope, not universal semantic or runtime activation coverage.
- Join Atlas checkpoint pointers, artifact restoration and final Task/continuation paths across the complete A/N case matrix, including background, interruption and invalid-reference variants.
- Qualify full compiled provider/tool/HTTP paths and the real desktop Node sidecar. The passing Bun/Node skill-tree tests prove extraction, not the complete sidecar's research behavior. Native macOS runtime evidence remains open.
- Validate UI behavior, accessibility, mixed-direction/RTL rendering, locale fallback and the required production timeline performance baseline/comparison. Type checking and document-reader tests do not close these checks.
- Resolve every method/reference link against the installed asset tree; finalize the capability-accurate system prompt only after mechanical closure, then run the independent real-model R01–R14 audition through Maestro.
- Run the change-scoped cold review and final epic suite before release acceptance. No quality score, comparative performance result or production-readiness claim is made at this checkpoint.
