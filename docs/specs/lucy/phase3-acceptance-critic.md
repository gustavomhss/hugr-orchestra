# Phase 3 acceptance: independent criteria critique

Baseline `750a23b8ed40af0ceef23f3323ae4910d470718a`; demand is approved
`build-plan.md:627-666` and `de3254b1a1:docs/specs/lucy/phase3-execution.md`.
This critiques the initial flat criteria, not an implementation: the independent
acceptance test was not inspected or authored here. Verdict: **incomplete as stated**;
the following must be explicit in the acceptance, not inferred from labels.

1. Catalog: exact lens/node/class/proof mappings, option bounds and reference validity;
   existing classes preserved; pack version and integrity match backend pin, both
   JS/TS rule IDs, class, lens, severity, triage, probation and digest change.
2. All seven overlays: binding paths, suggestion-only added content, unrelated
   negatives and root/nested cases. Path outranks content; removed-only content
   does not suggest; PR prose cannot suppress; permutation, caps/deviations,
   current budgets and Deep fallback remain deterministic.
3. Run the real authored runtime skill tree through the real catalog check;
   missing node, unknown reference and unreachable node must each fail. Check
   declared class citations, route reachability, actual seat build, root and
   discovery, not merely a synthetic fixture or a directory listing.
4. Ast-grep: pinned real binary, real host dispatch and host-owned rules; match,
   benign, comments, strings, invalid rule and hostile repo configuration controls.
   Verify actual JSON and exit semantics, absent binary not installed/not-run,
   invalid or unreadable output is acquisition-error with retained raw artifact;
   distinguish head-only, base-only and unchanged results and verify no worktree write.
   A fake executable can test failure plumbing, not binary conformance.
5. Exercise a real `pr` request outside governed flow: PR prose remains data,
   card reaches Maestro, neither receipt nor posting occurs. Tests must prove both
   positive delivery and absence of those side effects at their real boundary.
6. Native Lucy lead and lens sessions read Atlas catalog and units for changed
   paths; stale snapshot produces the same guard-grounded finding. Held Atlas is
   not-run with reason. Memory, header and resume remain denied independently.
7. Diff-review scope exposes only the routed privacy leaf, never the whole audit
   tree; prove both privacy routing and non-privacy exclusion at actual grants.
   Privacy leaf source gaps [A9] must be closed before shipping, not asserted by a
   mocked scope test; check the required guide and repo-only skill documentation.

Tests must call production registry and real public seams, with positive controls
for every negative. Existing phase-3 packet lists the package-specific CI commands;
the cross-cutting acceptance file supplements rather than replaces those gates.
No tests, binary, server, CI workflow or acceptance implementation were run here.
