# Actions evidence ledger — candidate 92af2d68bb

Snapshot date: 2026-10-14. Candidate C:
`92af2d68bb492a28a9f905c20fea2c714d622fc7`. Real delivery root:
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/actions-delivery`.
Owned docs worktree/branch: `actions-evidence-ledger`, created from C.
No final bundle SHA/tree, account authority or user data is inferred from a path,
browser screenshot, historical run, or another checkout's HEAD.

## Exact artifact references

All TEMP names below resolve under this exact root:
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode`.

| Key | Exact TEMP filename | Source / verdict |
| --- | --- | --- |
| J | `actions-final-journey-2026-10-14T19-53-48-787Z.json` | App `a1286c5ad3209c5e5e5b1dd5218fd156f919f7e7`; BLOCKED, DIAGNOSTICS_PRESENT. |
| L | `actions-final-lifetime-2026-10-14T20-03-54-395Z.json` | Same app revision; MEASUREMENT_COMPLETE_WITH_DIAGNOSTICS_NOT_OVERALL_GREEN. |
| B | `actions-ui-baseline.json` | `e6d9a35f1b2434262ae846f37d5725b1f062e085`; old native CI/CD surface. |
| J harness | `actions-final-journey.ts` | Later mixed-input correction is source only; J is its earlier execution record. |
| Stack | `actions-final-bundle-body-20261014.md` | TEMPLATE, 43 published draft children; closing PR not published in this record. |
| Packaging | `actions-qualification-result-20261014.json` | Frozen source `a1286c5ad3209c5e5e5b1dd5218fd156f919f7e7`; mechanical packaging, not runtime proof. |

Repository historical sources: `specs/actions/COMPACTION-HANDOFF.md`,
`IMPLEMENTATION-STATE.md` before this update, `W1-BRIEF.md`, `W1-DISPATCH.md`,
`W2-READ-BRIEF.md`, `W2-ASSEMBLY.md`, `W3-COMMAND-BRIEF.md`.
Credentials, CLI config contents, raw secret values and user-data dumps are omitted.

## J: observed scope, not overall completion

- Native oracle: `gustavomhss/hugr-orchestra`, workflow `375039997`, run
  `38177025125`, attempt 1, completed/success. Its execution commit is
  `e4045f16c04fefb8127ccdac5d653691b8211139`; source path
  `.github/workflows/test.yml`, blob `9aba44be238b610f4a37c3324f4fbb2f9c14f3e3`.
- `checks[approved-run-graph]`: 7 definitions, partial structural graph.
  `checks[approved-run-jobs]`: 15 native jobs. `checks[approved-artifact-metadata]`:
  10 actual metadata entries; downloads not invoked. These are different sets.
- `approved-job-inspector` and `approved-job-log-preview`: actual job
  `114581461372`, native steps/runner, 400 preview lines; full save not invoked.
- `approved-immutable-source` and `approved-history-selection`: immutable commit,
  actual artifact/source tabs, Back/Forward/reload identity retained.
- `library-dispatch-hydration` and `workflow-dispatch-hydration`: typed
  `windows_e2e`/`cold`, native `dev` source resolved to
  `e87fd95799cba0220abf5c86b203bc8d82b29732`; canceled, never dispatched.
- `new-workflow-local-draft`, `new-workflow-validate`,
  `new-workflow-review-cancel-discard`: observed native base, local one-job parse,
  review form, cancel and explicit discard. `draft:sha256:` is a local identity,
  not a provider blob or acceptance. Only recorded non-GET app request was the
  successful local `validate-draft` POST; binding was reused.
- `library-native-scopes-dialog`: native environments GET succeeded with an empty
  catalog; Repository option observed, no variable save. Populated scopes unproven.
- `native-policy-dialog`: Escape closed it but invoker focus failed. Real product
  bug, corrected for native/local policy hydration by `0c386bae4a390bb2478ada8d3bb6f62f56c564c5`
  in C (`settings.tsx`, `test-browser/actions-policy.test.ts`); final UI proof pending.
- `ltr-dark`/`rtl-dark`: English, 1440px, centered/in-bounds dialog, correct computed
  direction, Tab containment, Escape/focus return; margin mutation broke centering
  and restoration recovered it. Screenshots still need full approved-mock comparison.
- `rtl-light-420`: BLOCKED with `REAL_ARABIC_UI_NOT_OBSERVED`; Arabic Actions copy
  fell back to English. Corrected harness checks real Arabic locale plus local name
  input `اختبار CI`, preserving native provider names. New result pending; this is
  local input, not a provider mutation/demo or completed 420px geometry proof.
- Capture controls saw a deliberate exception, console error, 404, transport failure
  and denied POST. Actual shell `GET /api/relay/run` 404 remains a diagnostic;
  controls do not erase application failures. J's blocked stages remain blocked.

## L: descriptive performance/retention, NOISY

5 warmups / 20 measured serial cycles, fresh headless Chromium, explicit GC and
heap/DOM/listener samples. Separate control context observed +16,069,692 heap bytes,
release of 16,006,468 bytes, and addition/removal of 257 nodes and 128 listeners.
Controls closed before measured context; these validate observation, not product cleanup.

Retained Home heap: 20,413,852 → 21,318,348 bytes; median 21,291,968; slope
38,095.12 bytes/cycle, OLS 95% interval [19,877.86, 56,312.39]. Documents stayed
4; listeners ranged 178–179; nodes alternated 6,282–8,811. Overall retention remains
NOISY/unresolved, not a leak-absence claim. L deliberately reports descriptive curves
without pass/fail classification; OLS ignores serial correlation and native memory.

Actions navigation wall median 5,052.01ms versus B's 1,071.27ms includes idle floors
and different native work. B and L use different surfaces, source revisions, backend
ports and live workloads. Publishing dev `e87fd95799cba0220abf5c86b203bc8d82b29732`
contains 225 commits not reachable from B's revision. This is not a matched-workload
baseline or causal speed/regression comparison. Final source-bound CI performance,
retention/cleanup evidence and relay diagnostic resolution remain pending.

## H: qualified historical CI, before current review corrections

Run links use `https://github.com/gustavomhss/hugr-orchestra/actions/runs/<ID>`.
Results below are preserved historical reports, not newly rerun or current-C green.

| Scope | Run ID(s) | Historical reach |
| --- | --- | --- |
| W1 binding | `38215728565` | Linux 17 / Windows 15 passed; two named POSIX skips on Windows. |
| W1 operations / migration | `38214880315`, `38210909375`, `38211669826`, `38252950210` | Reviewed foundations; last run 29 passed per OS using production migration. |
| W1 raw Client | `38213149427`, `38207523705` | Reviewed stream/error/download scope. |
| W1 transport | `38245206834`, `38248960760` | Reviewed transport and TLS-disposition scope. |
| W2 facade / HTTP | `38391576019`, `38422976687` | 35 / 8 passed per OS; source/readback and four assembled HTTP groups. |
| W3 native commands | `38424841106`, `38406651884`, `38425873127` | GH guarded dispatch; GL last run 30 passed per OS. |
| Native empty acknowledgements | `38403587519` | 16 passed per OS; documented 201/202/204. |
| App controllers | `38556178871`, earlier `38525980329` | 68 / 41 passed per OS; latest 9 explicit files, 400 assertions; not DOM parity. |
| Native catalog | `38527206685` | 20 passed per OS; defaultRef/read semantics. |
| Backend mixed batch | `38560201762` | Linux 103 pass/10 fail; Windows 104 pass/9 fail. Not green. |
| Focal backend | `38566931111`, `38571003301` | 37 pass/3 fail, then 6 pass/2 fail per OS; fixture/oracle faults retained. |
| Signed output follow-up | `38574604017` | 6 passed, 111 assertions per OS; reported 45 real Omni spawns and TLS fingerprint controls. |

W1/W2 review records include observed red/restored-green controls for their reviewed
protections. Later focal green qualifies its changed scope, not every earlier failed
batch. All precede C's review corrections; none establishes final-candidate closure.

## Pending final campaign and gap classification

- **All new focused CI: PENDING.** App controllers/store snapshots/browser policy,
  Core native authoring/resources/commands/output, Server HTTP/resource queries,
  Client transfers, desktop renderer/main/native saves and mutation controls need
  current-source results. Existing test source and CI wiring are not passing evidence.
- **All `providerMutationFacets`: fixture-CI PENDING; live NOT AUTHORIZED.** Exact
  facet list is in `UI-MOCK-PARITY.md`. The Unknown-request clarification does not
  authorize live provider mutations for validation. Native reads and local validation
  cannot close provider write facets.
- **Actual fix remaining:** shell relay 404 must be repaired for an overall clean
  diagnostic claim. It is outside Actions proof and was not repaired by these docs.
  Other untested Actions facets remain unknown. Policy focus has a code correction,
  not final proof. Mixed-input harness correction also exists; execution is pending.
- **Final evidence remaining:** source-bound CI/review, policy focus and Arabic/420px
  UI, full mock/state/dialog/native GitLab matrix, streaming save/cancel/finalization,
  populated scopes, per-view cleanup and matched-workload performance/retention.
- **Publication:** 43 child PRs packaging READY, draft/unmerged, ending at #620
  (`actions-epic-coverage`, tip `9a63c6d35102cca72632b331c5b8bc2763b85dc5`). Older
  reserved-overlay tree `4c4ba27a277607cf0727b9759ddae5cff52a95b7` matches frozen
  `a1286c5ad3`, not later C. Closing PR, final tree/dependency reconciliation and
  candidate-bound review/qualification remain PENDING.

Current owner instruction: tests and performance qualification are CI-only at the
final bundled campaign. Earlier per-unit `test:ci` guidance does not authorize new
focused runs now. No local test/browser/performance harness, mutation run, alternate
test command, intermediate label or dispatch loophole. Existing local J/L artifacts
are historical observations only. This docs task runs no tests/CI/typecheck/build.
