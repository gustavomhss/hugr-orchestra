# Mock parity register

Authority: owner explicitly requested 100% approved mock parity after initial
screen-only scope correction. Source: `actions-campaign/artifacts/actions-mock`.
Luna inventory `ses_ec9604105ffeZAABp8NZunUiuX` verified gallery/handler/dialog
positive controls before enumerating closed sets. Evidence snapshot: candidate
`914f478ceed441892604aeaa7689d903f7c710ff`, 2026-10-14. The former all-OPEN
register omitted observed progress; PARTIAL records that progress without claiming
closure. No row is CLOSED across all required facets.

Evidence keys J (20:51 journey), L (20:03 lifetime), H (historical CI) and C
(candidate corrections) resolve in [RESUME-VERIFICATION.md](RESUME-VERIFICATION.md).
R = native read/state; I = interaction; V = visual comparison; M = provider mutation;
L = performance/lifetime. OBSERVED is limited to the recorded scenario and source.
V was compared screen by screen on 2026-10-17; see [Visual audit](#visual-audit-2026-10-17). L remains NOISY/descriptive globally,
with per-view cleanup proof PENDING. All `providerMutationFacets` are fixture-CI
PENDING; live provider mutations are NOT AUTHORIZED. See the facet list below.

## Screens and navigation

| ID | Required surface | Facet status | Evidence / remaining gap |
| --- | --- | --- | --- |
| P01 | Workflow library/cards/recent runs/search/active-disabled | R/I PARTIAL | J `library-copy-identity`, typed library dispatch; search/state matrix pending. |
| P02 | Run history/search/status/ref/event/current and historical attempts | R/I PARTIAL | J exact run/attempt 1 and history selection; filters and other attempts pending. |
| P03 | Actual recorded Orchestra CI definitions and exact run/source identity | R OBSERVED; I PARTIAL | J run `38177025125`, 7 definitions, 15 jobs, 10 artifacts; exact source SHA below; graph remains partial. |
| P04 | Workflow graph/executions/source contextual navigation | R/I PARTIAL | J workflow-scoped typed dispatch and run graph/source; complete workflow navigation matrix pending. |
| P05 | Run graph/jobs/logs/artifacts/source contextual navigation | R/I PARTIAL | J `approved-run-*`, log preview, artifact/source tabs, Back/Forward/reload; remaining states pending. |
| P06 | Job inspector/native steps/runner/depends/source/execution identity | R/I PARTIAL | J actual job `114581461372`, steps/runner and definition inspector; all jobs/dependencies pending. |
| P07 | Logs job selector/search/bounded preview/full save/provider refresh semantics | R/I PARTIAL; save PENDING | J 400-line preview, no full save; H output qualification predates C; current desktop/Web save proof pending. |
| P08 | Artifacts metadata/download/delete/GitLab keep/expiry | R OBSERVED; download/M PENDING | J 10 native artifacts with size/expiry/digest; downloads not invoked; GitLab/current fixture qualification pending. |
| P09 | Source editor/validate/review; immutable historical run source | R/I PARTIAL; M PENDING | J local New workflow → Validate → review/cancel/explicit discard; immutable run SHA; no publish/provider acceptance. |
| P10 | Resources artifacts/environments/variables/runners/caches/schedules tabs | R/I PARTIAL | J artifact and variable views; environment scope catalog genuinely empty; full tab/dialog matrix pending. |
| P11 | Environments/policy/reviewer/ref/timer/deployment review | R/I/M PENDING | H reviewer/payload work retained; J empty environment catalog does not exercise populated rules or deployment review. |
| P12 | Variables scoped identity, secret redaction, protected/masked/hidden flags | R/I PARTIAL; M PENDING | J native scope GET, Repository option only, canceled form; populated scopes and provider-specific flags pending. |
| P13 | Runners labels/tags/state/origin/inherited restrictions | R/I/M PENDING | H exact arrays/platform/group restrictions implemented; current native UI and enrollment fixture evidence pending. |
| P14 | GitHub key/ref cache deletion; GitLab project-wide invalidation | R/I/M PENDING | H exact GH key/ref and GL request semantics; current fixture/UI qualification pending. |
| P15 | GitHub YAML schedules; GitLab CRUD/play/pause/delete | R/I/M PENDING | H command/payload evidence; current action-specific policy and GitLab fixture/UI qualification pending. |
| P16 | Settings provider/host/project/sign-in/access/retention/execution/inherited/capabilities | R/I PARTIAL; native focus OBSERVED | J native policy Escape/focus return passed after `0c386bae4a`/`914f478cee`; local-policy and stale-ownership fixture CI pending. |
| P17 | Global plus contextual navigation, reload, Back/Forward and selections | I PARTIAL | J exact run/commit survives Back/Forward/reload; L serial Home/Actions cycles; full selection/cleanup matrix pending. |
| P18 | Ready/empty/signed-out/error/read-only/queued/running/waiting/terminal states | R/I PARTIAL | J terminal run, immutable source, Unknown dispatch, empty scope catalog; H signed-out copy; full state matrix pending. |
| P19 | All dialogs/confirmation/forms/disabled states and provider-native differences | I PARTIAL; M PENDING | J typed dispatch, review cancellation, scopes, connection and native-policy Escape/focus observed; full modal matrix pending. |
| P20 | Light/dark, English forced RTL, real RTL/mixed text, narrow/keyboard/focus | I PARTIAL; scoped ar/420 OBSERVED | J English 1440px LTR/forced RTL plus Arabic RTL/light/420px connection geometry, Tab/Escape/focus and Arabic/Latin local name input passed; full widget/theme matrix pending. |

J pins `.github/workflows/test.yml` to execution commit
`e4045f16c04fefb8127ccdac5d653691b8211139`, blob
`9aba44be238b610f4a37c3324f4fbb2f9c14f3e3`; never substitute current `dev`.
J application revision is C; L remains at
`a1286c5ad3209c5e5e5b1dd5218fd156f919f7e7`. J verdict is
`COVERED_REQUESTED_READ_ONLY_JOURNEY`, overall diagnostics NOT GREEN. The corrected
Arabic prerequisite accepts existing English Actions fallback; no new translation
feature or native provider demo data was introduced. Shell relay 404 is recorded
outside Actions scope. Fixture-CI and live GitLab coverage remain pending.

`providerMutationFacets`: workflow toggle/dispatch; run retry/rerun/cancel/delete;
job retry/play/erase; deployment approval/review; artifact delete/keep; environment,
variable/secret and runner create/update/delete; cache delete/invalidate; schedule
create/update/play/pause/delete; native execution-policy writes; source
branch/write/review publication. Every applicable facet remains fixture-CI PENDING
on C and live NOT AUTHORIZED. Local draft validation and canceled dialogs do not
qualify those writes. Full log/artifact saves have separate pending transfer proof.

Gallery shot IDs: workflows, runs, real-ci, real-history, jobs, logs, artifacts,
source, environments, variables, runners, caches, gitlab-caches, schedules, settings,
dispatch-dialog, variable-dialog, environment-dialog, schedule-dialog, review-dialog.

## Visual audit 2026-10-17

Scope: V facet only, read-only. No row closes on this audit; a PASS here would still
need its R/I/M/L facets.

**Mock authority.** `_worktrees/actions-campaign/artifacts/actions-mock` no longer
existed. The 20 source files were recovered from the earlier coding-agent session database at
their last complete read (2026-10-14). Recovered `resources.css` and
`collections.css` are byte-identical to the surviving 2026-10-11 copies. Only 8 of 20
gallery PNGs were recoverable (workflows, dispatch-dialog, logs, variables,
settings, real-ci, variable-dialog, schedules). Re-rendered from the recovered source,
5 of them are pixel-identical; logs, variables and real-ci differ because the mock
changed after those shots (for example, the resource sub-tab strip was removed).
The comparison uses the re-rendered latest source, plus the recovered `real-ci.png`
for P03. The recovered mock was restored to its original path with `RECOVERED.txt`.
`APPROVAL.md` was not found in the repository or on disk.

**App under test.** `actions-bundle` `0e8a831f12`, `vite build` production preview,
own backend on `127.0.0.1:4161` with isolated XDG and `ORCHESTRA_DB`, English locale,
1512x982, dark. Real provider: `gustavomhss/hugr-orchestra` on GitHub; reference run
`38177025125`, job `114581461372`. The only write was the local repository binding in
the isolated backend. No provider mutation, no dispatch, and no dialog was submitted.

Evidence: `parity/<id>.jpg`, with the mock on the left and the app on the right.

| ID | V (2026-10-17) | Evidence | Exact difference |
| --- | --- | --- | --- |
| P01 | GAP | `workflows.jpg` | The status filter renders as glued text `AllActive`, and `Disabled` is missing; the mock has an `All / Active / Disabled` segmented control. Tabs have no count badges or icons (mock: `Workflows 4`, `Runs 4`). Workflow cards lack trigger chips, description and sample-jobs preview. Instead they show a large-type `Ref dev / Run workflow Unknown` block. The pinned `Actual Orchestra CI` card has no run status or run/attempt identity. The side list has no `Browse` group, no count and no per-workflow badges, and its search placeholder is truncated. |
| P02 | GAP | `runs.jpg` | The status filter is a glued text run (`All● Queued● Queued● completed● Skipped● …`): `Queued` appears twice and `completed` is lowercase. The table has no column headers (Run/workflow, Ref/trigger, Result, Time), no duration and no `N of M` count. Rows title the workflow name instead of the commit/run title. |
| P03 | GAP | `real-ci-shot.jpg` | Matrix jobs are not grouped (the mock shows omni ×2, unit ×5, e2e ×3 with run counts and a `Grouped jobs / Matrix executions` toggle). Nodes show unresolved `${{ matrix.* }}` names, and every node shows status `Unknown` although all 15 jobs passed. The internal token `source_partial:matrix_dynamic:jobs.e2e` is shown to the user. A direct link with only `actionsRun` shows `No runs to show`; it needs `actionsWorkflow` and `actionsRef`. |
| P04 | GAP | `source.jpg` | The library's `Actual Orchestra CI` card opens the workflow, not the recorded run. The workflow header puts a bare `Ref dev` field, `Open` and `Disabled` above `Back`. The mock header has a title, an `Active` chip, `Disable` and `Run workflow`. |
| P05 | GAP | `jobs.jpg`, `logs.jpg` | The run header is unstyled: `Delete run` floats at the top left, the attempt control renders as `Attempt1`, and `Back` is plain text. The title is the workflow name with the run id as subtitle; the mock uses run title, provider, run number and `Re-run failed jobs / Re-run all jobs / Delete run`. The `Jobs` tab has no count. |
| P06 | GAP | `jobs.jpg` | Job rows show `GitHub Actions <runner id>` instead of runner labels and `needs`. Rows have no duration and no `Inspect` / `Logs` actions. The list is narrow and centered, and a stray `Jobs` heading sits at its bottom left. |
| P07 | GAP | `logs.jpg` | The log search placeholder reuses `Search workflows, runs or source paths`. The header text runs together (`atlas scopeGitHub Actions 1000017794 · 16s`). The mock's `Download log` label is `Download`. The bounded preview and line numbers match. Full save was not invoked. |
| P08 | GAP | `artifacts.jpg` | Sizes show as raw byte counts (`30,198 byte`) instead of KB or MB. Expiry is an absolute date instead of `Expires in N days`, and the raw artifact id is shown. Row layout, `Available`, `Download` and `Delete` match. Download was not invoked. |
| P09 | GAP | `source.jpg` | `actionsView=source` shows `Source identity is unavailable for this selection.` twice (once in red); the source loads only through the workflow's `Source` tab. The ref label runs into its value (`Refdev`), and a stray `<>` icon plus `Access: Unknown` sits above the editor. There is no source-identity strip with triggers. |
| P10 | GAP | `artifacts.jpg`, `caches.jpg` | The app keeps a resource sub-tab strip whose labels are clipped to half height; the mock removed it. Deep links or reloads to any resource stay on `Idle` until the side nav is clicked. Clicking a resource scrolls the side nav so `Workflow library` and `Run history` leave the view. |
| P11 | BLOCKED | `environments.jpg`, `environment-dialog.jpg` | The provider has 0 environments, so populated rows and `Review deployment` cannot be compared. The header and the protection card match. Review dialog: no pending deployment exists. |
| P12 | GAP | `variables.jpg`, `variable-dialog.jpg` | Row and dialog icons render as solid black shapes. The `Replace` dialog shows a giant black lock filling half the dialog, and its close button is an empty square. The `Scope` select is an unstyled full-width bar above the header card. Populated provider flags were not compared (GitHub has none). |
| P13 | BLOCKED | `runners.jpg` | The provider has 0 runners, so rows, labels and inherited state cannot be compared. The header and the registration card match. |
| P14 | GAP | `caches.jpg` | Storage shows raw byte counts with no unit (`266171`), and `Last used` shows a raw ISO timestamp. There is no total usage figure, and long keys wrap across 3 lines. GitLab invalidation is BLOCKED: no GitLab binding. |
| P15 | GAP | `schedules.jpg`, `schedule-dialog.jpg` | GitHub schedules show `Provider request failed / Unavailable`, the provider badge flips to `Unavailable`, and there is no `New schedule`. The mock's GitHub schedules come from the YAML. GitLab CRUD is BLOCKED: no GitLab binding. |
| P16 | GAP | `settings.jpg` | Capabilities dump raw OAuth scope lists and `Endpoint or target eligibility has not been proved` text glued to `Unknown`. The provider select shows the internal binding id. The layout diverges from the mock's `Project connection`, `Available capabilities`, `Retention & execution policy` and `Preview states` cards. The side nav highlights an unrelated workflow (`nix-toolchain`). |
| P17 | GAP | all | The titlebar breadcrumb always reads `Orchestra / home`; the mock reads `Orchestra / Actions / <view>`. Deep links to run (without workflow and ref), source and resources do not load (see P03, P09, P10). The profile chip says `Choose a project` while a project is selected. |
| P18 | GAP | `artifacts.jpg`, `schedules.jpg` | The internal state `Idle` is shown as page content. A provider failure shows `Provider request failed / Unavailable` with no recovery copy. Empty states for environments and runners match. |
| P19 | GAP | `dispatch-dialog.jpg`, `variable-dialog.jpg`, `environment-dialog.jpg` | Dialogs open off-center (right column) instead of centered. Resource dialogs have an invisible close button. The checkbox label and hint run together (`Prevent self-reviewRequire a reviewer…`). The run dialog lacks the provider/scope header, the `Execution target` section, the branch select and the `New execution` note. Dialogs were opened and closed only. |
| P20 | GAP | `mode-light.jpg`, `mode-rtl.jpg`, `mode-narrow.jpg` | Light and forced RTL mirror correctly, apart from the P01 filter bug. At 420px, the tabs truncate (`Connection settin…`) and the search and filter row overflows. Keyboard and focus were not re-tested in this audit. |

Not covered: the GitLab provider (no GitLab binding was created), populated
environments, runners and deployment review, downloads and saves, keyboard and focus,
and the L facet.

## Visual parity closure 2026-10-18

Scope: V facet only, read-only, same mock authority and reference run as the 2026-10-17 audit. This section
supersedes the V column of that audit. R/I/M/L facets are unchanged: a V PASS does not close a row on its own.

**Changes.** Bundle branch `actions-polish`: area PRs #784, #785, #786, #787, #788, #790, #791, #793 (round 1),
#795, #796, #797, #798, #799, #800, #801 (round 2), plus lead integration commits. #801 adds `title` (GitHub
`display_title`, GitLab pipeline `name`), `number` (`run_number`, `iid`) and GitHub completed-run `duration` to
`Actions.Run`.

**App under test.** `actions-polish` merged with `dev` (`e6eee0726d` plus the fixes listed in the PR), `apps/web`
`vite build` production preview, own backend on `127.0.0.1:4161` with isolated XDG and `ORCHESTRA_DB`, English
locale, 1512x982 dark unless noted. The backend ran with `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=0` because no local
omni addon was built; this affects only how the backend spawns `gh`, not the UI. Real provider:
`gustavomhss/hugr-orchestra` on GitHub; reference run `38177025125` (run #193), job `114581461372`. The only write
was the local repository binding in the isolated backend. No provider mutation, no dispatch, no dialog submitted;
downloads and saves were not invoked.

Evidence: `parity/final/<id>.jpg`, mock on the left, app on the right (`mode-narrow.jpg` is app only).

| ID | V (2026-10-18) | Evidence | Result / residual difference |
| --- | --- | --- | --- |
| P01 | PASS | `final/workflows.jpg` | `All / Active / Disabled` segmented control, tab counts and icons, Browse and Workflows groups with counts, `Actual Orchestra CI` card with run number, attempt and status. Residual: GitHub workflows have no description or job list, so the card shows the native empty-preview line instead of sample jobs. |
| P02 | PASS | `final/runs.jpg` | Fixed status filter, column headers, `N of M` count, commit title and `#number`, workflow name second line, relative time. Duration shows `—` while a run is queued or running (native). |
| P03 | PASS | `final/real-ci.jpg` | All 15 jobs join their 7 definitions: real statuses, matrix nodes `×2`, `×5`, `×3` with run counts, `Grouped jobs / Matrix executions` toggle, job-key labels, translated diagnostics. A link with only `actionsRun` loads the run and graph. Residual: the mock's column captions, legend and per-job icons are sample-workflow decoration and were not ported; node rows are packed tighter. |
| P04 | PASS | `final/source.jpg`, `final/workflows.jpg` | The reference card opens the recorded run. Workflow header card: eyebrow, title, `Active` chip, `Disable` and `Run workflow`, path row. Residual: trigger chips appear once the workflow graph is loaded (core does not fill catalog triggers). |
| P05 | PASS | `final/jobs.jpg`, `final/logs.jpg` | Run header with provider, `Run #193`, title, status, event, actor, age, duration, attempt select, `Re-run` / `Delete run`, identity row with `7 jobs · 15 executions`, tab counts. The reference run's native title is `test` (workflow_dispatch). |
| P06 | PASS | `final/jobs.jpg` | Full-width rows with runner, declared needs, duration, `Inspect` and `Logs`; context rail groups jobs by definition with counts. |
| P07 | PASS | `final/logs.jpg` | Own log search copy, job title with runner · duration, `Completed job output · status updates separately`, `Download log`, bounded preview with line numbers. Full save not invoked. |
| P08 | PASS | `final/artifacts.jpg` | `103 kB`, `11 MB`, `Expires in 7 days`, `Run #193`, no raw id. Download not invoked. |
| P09 | PASS | `final/source.jpg` | `actionsView=source` resolves the default ref; one neutral unavailable state; ref label separated; source sits under the workflow (or run) header and tab row. |
| P10 | PASS | `final/caches.jpg` | Sub-tab strip removed; resource deep links and reloads load; resource surfaces sit in the content column; the rail keeps library and history in view. |
| P11 | BLOCKED | — | Unchanged: the provider has 0 environments and no pending deployment. No fixture was invented. |
| P12 | PASS | `final/variables.jpg`, `final/variable-dialog.jpg` | Outline icons, 16px lock note, visible close button, styled Scope select under the surface header. GitHub has no populated protected/masked flags to compare. |
| P13 | BLOCKED | — | Unchanged: the provider has 0 runners. No fixture was invented. |
| P14 | PASS (GitHub) | `final/caches.jpg` | Sizes in kB/MB, `Last used … ago`, provider-reported total, single-line keys with full key on focus/hover. GitLab invalidation remains BLOCKED (no GitLab binding). |
| P15 | PASS (GitHub) | `final/schedules.jpg` | GitHub schedules list loads from YAML (the default branch has no `schedule:` trigger, so the empty state is native); unreadable workflows are reported per item; the provider badge no longer flips. GitLab CRUD remains BLOCKED (no GitLab binding). |
| P16 | PASS | `final/settings.jpg` | Project settings header, `Project connection`, `Available capabilities` with human labels and state badges, retention and provider policy cards, provider select shows provider · project · host. Capability states read `Unknown` because authorization is unknown (AUTHORIZATION-POLICY.md). |
| P17 | PASS | all | Titlebar `Orchestra / Actions / <view>` (run: `test / Run #193`), deep links to run, source and resources load, profile chip names the project. |
| P18 | PASS | `final/caches.jpg`, `final/schedules.jpg` | No internal `Idle` text; provider failures show recovery copy with Refresh. |
| P19 | PASS | `final/dispatch-dialog.jpg`, `final/variable-dialog.jpg` | Dialogs centered in the top layer with blurred backdrop; provider/scope header, `Execution target`, `New execution` note; stacked checkbox label and hint. Opened and closed only. |
| P20 | PASS (light, narrow) | `final/mode-light.jpg`, `final/mode-narrow.jpg` | Light theme fixed (primary buttons keep their fill on hover). At 420px tabs fit and no row overflows (`scrollWidth` 420). RTL: new rules use logical properties only (code review); forced RTL was not re-shot in this pass. |

Builds: the visual pass needed five production builds of `apps/web` (first pass, then after each fix round and
after merging `dev`); no typecheck or test suite ran locally.

## Exact modal kinds

dispatch; create-workflow; approval; create-variable; edit-variable;
create-environment; edit-environment; create-runner; edit-runner;
create-schedule; edit-schedule; review-source; connection; project-settings;
delete-run; cancel-run; delete-variable; delete-environment; delete-runner;
delete-schedule; delete-artifact; delete-cache; clear-caches.

Each modal is matched to `dialogs.js` fields/options, not a generic form imitation.
Source variables and hidden/masked/secrets reset on close and never enter preferences.
Read-only/historical/inherited states disable the same native mutations as the mock.

## Exact action contract

Navigation: close-dialog, tab, back, workflow, workflow-source, run, view, resource,
filter, refresh, zoom, job, job-open, job-logs, log-job.
Mutation/download: toggle-workflow, retry-run, rerun-all, retry-job, play-job,
toggle-schedule, play-schedule, lint-source, download-log, download-artifact,
keep-artifact; plus the modal kinds above.
Preview-only theme/direction/reset controls belong to preview validation; app
theme/direction remain its existing global controls, not duplicate demo state.

## Constraints

- Owner-approved explicit-request semantics are recorded in `AUTHORIZATION-POLICY.md`.
  Authorization unknown is displayed as unknown; native requests do not invent permission.
- Mock graph definitions never become fake provider executions or approval jobs.
- No provider demo data in production, no pretend success for unavailable handler.
- Missing visible controls require narrowly scoped backend integration. Native
  provider exclusions need actual evidence, not implementation gaps as a reason.
- Scope does not expand to APIs absent from the mock (global account/org/billing,
  Secure Files/resource-group queues/test report administration etc.).
- Same view-owned bounded Store, deferred source/graph/log work and cleanup rules
  apply to new resource screens. Raw downloads never collect complete large files.
- Baseline/final navigation and retained-heap curves remain required. A screenshot
  alone does not close interaction or performance rows.
