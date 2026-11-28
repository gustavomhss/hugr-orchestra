# Native audit variants: predecessor qualification

This records the compiling assertion RED required by
[`audit-variants-contract.md`](audit-variants-contract.md) before production
implementation. It does not certify implementation GREEN or the Lucy GO gate.
All tests and typechecks ran in GitHub Actions. Local work was limited to source
authoring, inspection and Git/file metadata.

## Qualified source and snapshot

| Role | Commit | Tree |
| --- | --- | --- |
| Integration parent | `8d2d484d68fe746f8f323c712df924603b6c6e26` | `86f20529cd6bea84fcb86e2a0820029dfe594f87` |
| Frozen source | `e33a106f01c444e5155c28d2ce6194dcdeed98bf` | `4a9b641fcb7e1ada2e9d33ea0d540a0861632550` |
| Direct-child RED snapshot | `2e49c395b822e65a909e92f0d1def119d3640fee` | `d285814db430640f5e613335ae9f0ca0d4a349b9` |

The source adds the contract, four suites and their companion fixtures. The
existing evidence helper only gains strict discriminated receipt-v1/v2 decoding.
It does not change the v1 producer bytes, quotas or assertions. No production
source or runtime skill was changed before RED qualified.

The snapshot changes only `.ci-run.json` and four additive Maestro typecheck
lines in `.github/workflows/test-ci.yml`. Every contract, test and fixture blob
is identical to the frozen source. The request executes all four suites with
`--timeout 180000` on Linux, Windows and macOS. The normal Omni positive control
remains enabled.

Contract SHA256:
`62f6cccde3b2bf92bc3955c688ecb14e436802b5312dfbc0711f5a35744442f0`.

## Hosted result

[Run 46105758201, attempt 1](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46105758201)
completed with the expected test failures after successful typecheck on every
host. Cleanup passed.

| Host | Job | Maestro types | Tests | Assertions | Omni / delegated | Test skips |
| --- | --- | --- | --- | ---: | --- | ---: |
| Linux | `140858004668` | PASS | 3 pass / 23 expected fail | 3,342 | 3,499 / 0 | 0 |
| Windows | `140858004501` | PASS | 3 pass / 23 expected fail | 3,342 | 3,256 / 0 | 0 |
| macOS | `140858004759` | PASS | 3 pass / 23 expected fail | 3,342 | 3,500 / 0 | 0 |

All 26 cases executed. The intended failure classes are:

| Assertion class | Cases | Observed predecessor behavior |
| --- | ---: | --- |
| Proposal count or presence | 14 | No native variant proposal existed; the main case expected three generations. |
| Required receipt version | 5 | Receipt-v1 was returned where the new contract requires receipt-v2. |
| Arrival at a variant lifecycle stage | 4 | The original invocation completed before reaching the absent stage. |

The three passing controls were rejection of forged initial tool evidence,
constructed historical state-v1 replay and constructed historical state-v2 /
receipt-v1 replay. Those fixtures retain real source and producer bodies.

The cases exercised real Sessions, native CODE registration, immutable Git
capture, durable artifact storage and the real public request/reader paths.
Only provider transport was scripted. The native controls preceding the RED
targets included explicit paths overriding ignore rules within captured
authority, later live/probe mutation isolation, actual match counts, pagination
and late binary coverage.

Independent reviewers audited the Linux and Windows logs. The lead audited
macOS and compared all 23 assertion targets and expected values with Windows.
No setup, import, missing-runtime, timeout or infrastructure failure was counted
as RED. Assertions following the first failure in each case still require GREEN;
this predecessor result does not claim those later assertions ran.

## Frozen acceptance blobs

Paths below are under `modules/maestro/coordination/test/`, except the contract.

| File | Git blob |
| --- | --- |
| `docs/specs/lucy/audit-variants-contract.md` | `acbb61403885d70f4ca8308511752878692bb421` |
| `fixture/lucy-engagement-artifacts.ts` | `b9c051b5b7c76b0bf36b3466fe1ce74fd49af3d6` |
| `fixture/lucy-variant-schema.ts` | `3df428bc1ff40fb5c14f7ce67db5005c9da66ded` |
| `fixture/lucy-variants.ts` | `c9d8a543e18cd852f19db8ac42b26bc11e39459e` |
| `fixture/lucy-variants-source.ts` | `f36e1569e5a97fb07b550d17ddb15cba9d391d9c` |
| `fixture/lucy-variants-assertions.ts` | `c5172fdba97e1cc84cc5b214b90978c6e479d0ae` |
| `lucy-audit-variants.test.ts` | `b715e088e74c3db4394d5b07ca9357ead146b7d3` |
| `lucy-audit-variant-witness.test.ts` | `81e85ae23f8797f2501293b881485a6e4fddf5f9` |
| `lucy-engagement-variant-lifecycle.test.ts` | `0e9eae31177cfae686aec2938b6f18ed49a4a225` |
| `lucy-engagement-variant-replay.test.ts` | `4af78fd588f352ebe529c971911706e1a5552abf` |

Production implementation must preserve these blobs. Changes to older tests
are limited to the explicit transitions in contract section 12, with every
numerical bound, byte identity and actual native producer control preserved.

## Earlier preparation failures

Neither earlier run qualified RED, and neither was retried without a reviewed
source correction.

| Attempt | Source | Snapshot | Hosted run | Cause |
| --- | --- | --- | --- | --- |
| 1 | `352e5c024f6a9981b2e79f0c4487e03d2f5f271d` | `69009e4c702402698976cc9c9bc5a0a61cdd8ec7` | [46105038122](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46105038122) | All hosts stopped at TS1005/TS1128: one extra closing parenthesis in the replay test. No tests ran. |
| 2 | `c0bc5902a92f86ef325ae31e39b9454e0f7e1e07` | `3e952858794c3f41f142ced07f3177591884d1dc` | [46105319941](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46105319941) | All hosts stopped at eight identical TS2769 matcher typing diagnostics. No tests ran. |

Attempt 2 removed only the extra parenthesis. Attempt 3 widened an actual
ordinal array's static element type, constructed expected branded Session IDs
through the existing constructor, and added explicit missing-value guards before
unchanged equalities. The four-file delta was +13/-7. No case, equality, expected
value, control or limit was removed or weakened. Production and contract bytes
remained unchanged through all three attempts.
