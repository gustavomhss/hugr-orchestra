# Actions evidence ledger — runtime candidate 914f478cee

Snapshot date: 2026-10-14. Candidate C:
`914f478ceed441892604aeaa7689d903f7c710ff`. Real delivery root:
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/actions-delivery`.
Owned docs worktree/branch: `actions-evidence-ledger`, originally created from
`92af2d68bb492a28a9f905c20fea2c714d622fc7`. C is the observed manual-runtime source;
later delivery integration is `6d88f1f978cccdf7f636a49aff1bd0e54c1b6b88`.
No final bundle SHA/tree, account authority or user data is inferred from a path,
browser screenshot, historical run, or another checkout's HEAD.

## Exact artifact references

All TEMP names below resolve under `$TEMP_ROOT`, the original reserved temporary
root for this capture. Set `TEMP_ROOT` to that capture root; filenames are unchanged.

| Key | Exact TEMP filename | Source / verdict |
| --- | --- | --- |
| J | `actions-final-journey-2026-10-14T20-51-34-156Z.json` | App C; COVERED_REQUESTED_READ_ONLY_JOURNEY; JOURNEY_COMPLETE_WITH_DIAGNOSTICS_NOT_OVERALL_GREEN. |
| Previous J | `actions-final-journey-2026-10-14T19-53-48-787Z.json` | App `a1286c5ad3209c5e5e5b1dd5218fd156f919f7e7`; old focus/Arabic prerequisite blocks retained as history. |
| L | `actions-final-lifetime-2026-10-14T20-03-54-395Z.json` | App `a1286c5ad3209c5e5e5b1dd5218fd156f919f7e7`; MEASUREMENT_COMPLETE_WITH_DIAGNOSTICS_NOT_OVERALL_GREEN. |
| B | `actions-ui-baseline.json` | `e6d9a35f1b2434262ae846f37d5725b1f062e085`; old native CI/CD surface. |
| J harness | `actions-final-journey.ts` | Corrected Arabic prerequisite/mixed local input executed in latest J; English Actions fallback retained. |
| Stack | `actions-final-bundle-body-20261014.md` | TEMPLATE, now 44 draft children including focus #630; closing PR pending. |
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
  `792ed6cc7c03f64bb2b75e1d1f4f751e32732ce5`; canceled, never dispatched.
- `new-workflow-local-draft`, `new-workflow-validate`,
  `new-workflow-review-cancel-discard`: observed native base, local one-job parse,
  review form, cancel and explicit discard. `draft:sha256:` is a local identity,
  not a provider blob or acceptance. Only recorded non-GET app request was the
  successful local `validate-draft` POST; binding was reused.
- `library-native-scopes-dialog`: native environments GET succeeded with an empty
  catalog; Repository option observed, no variable save. Populated scopes unproven.
- `native-policy-dialog`: Escape closed it and restored invoker focus. This passes
  the previously blocked native facet after `0c386bae4a` and `914f478cee` corrections
  in `settings.tsx`; no policy save. Local-policy/stale-ownership fixtures await CI.
- `ltr-dark`/`rtl-dark`: English, 1440px, centered/in-bounds dialog, correct computed
  direction, Tab containment, Escape/focus return; margin mutation broke centering
  and restoration recovered it. Screenshots still need full approved-mock comparison.
- `rtl-light-420`: OBSERVED. Real `ar`/RTL/light/420px connection dialog was centered
  and in bounds, with computed RTL, Tab containment, Escape and focus return. Local
  workflow-name input `اختبار CI` passed mixed Arabic/Latin value/direction checks.
  The corrected prerequisite accepts existing English Actions fallback: no new
  translation feature and no native provider demo data. Full widget parity unproven.
- Capture controls saw a deliberate exception, console error, 404, transport failure
  and denied POST. Actual shell `GET /api/relay/run` 404 remains a diagnostic;
  controls do not erase it. J now covers the requested read-only journey, not an
  overall-green run. The recorded relay source is shell-owned, outside Actions scope.

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
baseline or causal speed/regression comparison. Latest dev `792ed6cc7c` additionally
contains four prompt changes (#625–#628); final bundle must preserve them. L is not
a new measurement of C or the dev-reconciled tree. Retention/cleanup and matched
performance evidence remain pending; shell relay 404 remains separately recorded.

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
- **Recorded diagnostic:** shell relay 404 is outside Actions scope. It keeps the
  overall diagnostic verdict non-green; this ledger does not recommend unrelated fixes.
- **Final evidence remaining:** final-tree CI/review binding, full mock/state/dialog/
  native GitLab matrix, streaming save/cancel/finalization, populated scopes, per-view
  cleanup and matched-workload performance/retention. Native-policy Escape/focus and
  scoped Arabic/420px connection/local-input facets now have manual J evidence.
- **Publication:** original 43 children plus `actions-dialog-focus` #630 are packaging
  READY (44 draft children in latest template). Focus tip
  `0433b0af72d8fc37616b55d361d8241f80c9f5e4`, reserved-overlay tree
  `fcaead16648fcf84074a2b3256f897188f5fa5ab`, matches frozen C. Root integration
  `6d88f1f978` merged latest dev's four prompt changes; final bundle must retain that
  ancestry. Closing PR, final tree/dependencies and CI remain PENDING.

Current owner cadence: automated tests/heavy validation run only in final-bundle CI;
no intermediate focused CI. Manual UI and performance measurement are distinct from
tests and remain scoped observational evidence, not CI green. Heavy tests cannot be
reclassified as manual measurement. This docs delta runs no CI/tests/typecheck/build
or manual measurements.
