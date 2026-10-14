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
V remains PENDING for full mock comparison. L remains NOISY/descriptive globally,
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
