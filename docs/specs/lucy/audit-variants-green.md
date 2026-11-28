# Native audit variants: focused implementation qualification

This records the implementation GREEN for the frozen 26-case packet in
[`audit-variants-contract.md`](audit-variants-contract.md). The compiling
assertion RED and its immutable acceptance blobs are recorded in
[`audit-variants-red.md`](audit-variants-red.md). All tests and typechecks ran in
GitHub Actions. Local work was limited to source authoring, inspection and
Git/file metadata.

## Source and execution identity

| Role | Commit | Tree |
| --- | --- | --- |
| Qualified assertion RED source | `e33a106f01c444e5155c28d2ce6194dcdeed98bf` | `4a9b641fcb7e1ada2e9d33ea0d540a0861632550` |
| First implementation source | `d755584e76e455378ab3c81b4e4b93ac885f7520` | `45304c3533aefd89811d8c33b2a157764398df6a` |
| Qualified implementation source | `1cf289fbc7bd9d18ed2f70dc814fb5913543153b` | `ca1203e5ef082b04de56096bdba411dbb031760c` |
| Direct-child GREEN snapshot | `ecf8ec2931601b3ee7615d752d8108f501248c89` | `8e2413cf0f835758b58abb0d9c773fdb71420258` |

The GREEN snapshot changes only `.ci-run.json` and four additive Maestro
typecheck lines in `.github/workflows/test-ci.yml`. All production, runtime
skill, contract, test and fixture blobs are identical to the qualified source.
The ten acceptance blobs listed in the RED record remain unchanged. The
request selects the same four suites, all 26 cases, `--timeout 180000`, and an
empty requested environment. The existing native Omni control is unchanged.

Request blob: `245f1ec7859176172b2e0c82edf9ffcc045297e3`.
Request SHA256: `d0e900c444488707c36c802730e9489c449d0fb469df78fff55cc144542d4aaa`.
Snapshot workflow blob: `64d977f54e39306c0387aefac7481a1d23fb17f9`.

## Hosted GREEN

[Run 46108905269, attempt 1](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46108905269)
completed successfully. Every host passed Maestro typecheck before running the
tests, and cleanup passed.

| Host | Job | Tests | Assertions | Omni / delegated | Test skips |
| --- | --- | --- | ---: | --- | ---: |
| Ubuntu 24.04 x64 | `140867803061` | 26 pass / 0 fail | 12,303 | 4,226 / 0 | 0 |
| Windows x64 | `140867803320` | 26 pass / 0 fail | 12,303 | 3,917 / 0 | 0 |
| macOS 15 ARM64 | `140867803916` | 26 pass / 0 fail | 12,303 | 4,216 / 0 | 0 |

The native Omni positive control passed on every host. These jobs used ripgrep
15.2.0 from the source's existing runtime pins. The three logs contain the same
26 case names. The lead inspected all three logs; an independent reader also
audited the complete Linux and Windows logs and the assertions that had followed
the first RED failure in each case.

The passing assertions cover:

- Three proposal Sessions and three fresh verifier Sessions; each generation's
  actual native denominator and dispositions; eight unique report findings;
  primary and supporting quote bytes, full blob identities and retained replay.
- Omitted proposals and verification budgets retaining every native match in
  the denominator, with no replacement of selected candidates after a refusal.
- Exact stop precedence, complete-search witnesses, known-seed reproduction,
  invalid proposals, pagination and reported skipped binaries.
- One original deadline, owner/follower interruption, cleanup before terminal
  publication, two shared running permits and progress of concurrent audits.
- Semantic corruption refusal followed by exact restored replay, without
  another provider run; strict historical state-v1 and state-v2/receipt-v1
  compatibility.

Provider transport is scripted. Sessions, public Maestro requests, CODE
registration, immutable source capture, native search, artifacts, ownership and
the public reader use the repository's actual implementations. A successful
fixture is not evidence of an authenticated external-model review.

## First implementation preparation failure

[Run 46108612047](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46108612047)
tested snapshot `3f892636ebabbdfc51cfbf6a2dfab1c5573f673a`, a direct child of
`d755584e76e455378ab3c81b4e4b93ac885f7520`. All three hosts stopped at the same
TS2353 diagnostic in the pre-existing `advanced-review-catalog.test.ts`: a fresh
literal with `path` was rejected by the narrowed `ReviewCandidates.options`
parameter type. No tests or Omni positive-control executions ran, so this
attempt qualified neither assertion RED nor implementation GREEN.

The reviewed correction changed only that function's type parameter to
`T extends Pick<Merged, "class" | "severity">`. The function body, return type,
callers, tests and frozen acceptance packet were unchanged. Its final blob is
`10f5a5fd65e63665c943a007e378bf82b808cf7f`. The successful run above followed this
specific source correction; no assertion, quota, timeout or platform condition
was weakened.

## Integration and remaining gates

The reviewed integration base is `8c1c4ad4e2daf7796d228079316cc991830c0525`
(tree `447a7e56a740d5b85c7a64c829167008219c53c6`). Relative to common base
`8d2d484d68fe746f8f323c712df924603b6c6e26`, its 88 changed paths do not overlap
the qualified variant source's 36 changed paths. Integration preserves the
upstream runtime and generated files, including the separately qualified
ripgrep 16.0.0 update. The variant contract and acceptance files stay byte-exact.

The next candidate requires the 47-file Maestro preservation selection and
33-file Core selection, with typechecks on all three hosts and the repository
guards. This document records only the focused GREEN above; it does not claim
those integration gates have completed. Existing platform refusals and
historical platform-specific skips must remain visible in the integrated logs.

Fix-review, engagement probes, compliance qualification, the complete tool
ledger, CLI/Desktop artifact inspection, authenticated adversarial review and
the final epic remain separate Lucy completion gates. This record does not
issue the final Lucy GO or authorize distribution, promotion or restart.
