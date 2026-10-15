# Change-scoped review matrix

Each applicable check records PASS, FAIL, or UNKNOWN plus evidence; NOT-APPLICABLE requires a reason.
These levels organize review; they are not a new runtime gate. No blanket binary green hides judgment.

| Level | Check |
| --- | --- |
| L0 sanity | Actual delta, baseline ancestry, source identity, claimed commits/checks; include dirty work |
| L1 build/lint | Real project compiler/runner; no hidden suppressions or bypass flags |
| L2 charter | Project invariants, architecture boundaries, ownership/context rules |
| L3 security/privacy | Applicable authorization, audit-before-mutation, input/error handling, secret protection |
| L4 test quality | Behavior/value assertions, negative cases, non-vacuity, mutation teeth |
| L5 docs | Public API docs and material architectural decisions |
| L6 spec/migration | Spec validators and safe schema/migration compatibility |
| L7 integration | Dependency order, conflict resolution, actual post-integration checks |
| L8 decision record | Evidence links, remaining decisions, explicit authorized deferrals |
| L9 release risk | Mocked/human-bound/unknown paths, data-loss/security blast radius, rollback limits |
| L10 rolling hygiene | Owned worktrees/artifacts, disk pressure, validator trends when relevant |

V1 before dispatch: cohesive slice; exact target; explicit decisions/latitude; disjoint or contract-bound;
current baseline; bounded model working set; runnable acceptance/quality checks; compact return.
V1 at return: actual baseline/delta; every acceptance item accounted; owned paths only; shared seam intact;
lead-reproduced checks; claimed commits verified if applicable; no bypass/skips hidden; docs updated.

V2 PR: scope matches request; code and meaningful evidence cover each acceptance item; invariants preserved;
security/migrations reviewed where applicable; public docs/ADRs current; independent findings resolved;
exact-head CI distinguished from local runs; lead judgment and existing approval requirements respected.

V3 hygiene: intended dirty/untracked state distinguished from strays; no committed build/runtime state;
ownership-safe worktree cleanup; baseline/branch identity verified; conflict markers checked in scoped files;
secrets scan calibrated if claimed; manifests/locks agree; lock conflict resolution preserves security pins;
spec validators do not regress; disk failures cannot masquerade as successful builds.

V4 intent-story: use WHY/invariant/failure modes to choose cases, not loose prose as implementation.
Assertions stay exact. Golden/oracle independence requires more than cloning the algorithm.

For independent PR review, load `maestro-repo-maintenance` only when performing that procedure; its
`reviewer-brief.md` supplies a compact cold-review template. Coverage critique belongs to decompose.
