# S3 resumption — first custody result

Execution record: `15cc9853-0e71-4950-8813-0bfb66f82c8a` (local record UUID, not a host ID). Branch: `genesis-s3-resume`. Initial HEAD: `19b909ef3bf27e0332f24fc30e3a5c471ea37d78`. Source: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocol: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

## Result

Recovered and checked the three original public L1 bodies and six final J1/J2 judgments. Preserved their static semantic acceptance. Recovered and checked the eight published upper-layer alternatives from the concurrent recovery. Their canonical bytes equal the archived bytes and the provenance matrix. The complete original eleven-artifact package, original upper-layer hashes/bodies/judgments, prepared candidate and original prepare/binding/publication receipts were not recovered in the bounded routes recorded here.

The public `s3/native-package.json` contains three artifacts and eleven required keys. Its exact SHA-256 is `cd19bf501df6ec40386b812725d38747707c00609afd612212e4b6c16feb5f4a`, byte length 495714, Git blob `ec9009fc8c3ac15da93aff074fcdd999918011f3`. It is not the reported original package `0f9444211faa6a20ff7d56bd583e784e62b1393708d90c046d2028e95964a400`.

The original branch `genesis-fresh-s3` remains at `68fca8e90c3150416e4e7ef8410df1cc42ee9d1b`. The starting resumption diff adds only the briefing (31 lines); no product file differs from its parent as part of that preparation.

## Per-body inventory

Paths below are relative to `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/`, read at immutable `19b909ef3bf27e0332f24fc30e3a5c471ea37d78`. The three L1 were already public at original checkpoint `68fca8e90c3150416e4e7ef8410df1cc42ee9d1b`. The eight alternatives are from recovery `e51ef44b-a6d6-47b0-a6ea-dd5aef7d7c3e`, archived from `e801b3aef2389d489cc6f9737cdd77a8a78336bd` in `receipts/concurrent-recovery-e801b3a/bodies/`.

| Artifact key | Body | Bytes | SHA-256 | Custody and acceptance |
| --- | --- | ---: | --- | --- |
| `s3-l1-integrations` | `bodies/l1-integrations.md` | 23985 | `81685f16fb32aae6958671939413d121e4f5babaf01d3b9565b03a50f7842e8a` | Original L1; two final historical judgments verified |
| `s3-l1-maestro` | `bodies/l1-maestro.md` | 19752 | `75b4438d79ebd9667db94f03a6fea884329cd5c72e2c69f649eff1047e7b1918` | Original L1; two final historical judgments verified |
| `s3-l1-relay` | `bodies/l1-relay.md` | 23932 | `369d2610ba4507a0950bd16cfce045dede276b67dee05f5d0086ef9ea503ffcb` | Original L1; two final historical judgments verified |
| `s3-l2-integrations` | `bodies/l2-integrations.md` | 6833 | `5b65c606ab258eea521adbf0cdf4bdf43b0755ec2ec0a7be5a2efc25545ce0c3` | Concurrent-recovery alternative; no valid judgment for this hash located |
| `s3-l2-maestro` | `bodies/l2-maestro.md` | 6733 | `7505522f3e92fa25dfda8dac896a2717d6eac71d9bd3a928d0bf4ae5e5b08d7e` | Concurrent-recovery alternative; no valid judgment for this hash located |
| `s3-l2-relay` | `bodies/l2-relay.md` | 7235 | `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037` | Concurrent-recovery alternative; no valid judgment for this hash located |
| `s3-l3-flows` | `bodies/l3-flows.md` | 11409 | `d69898e99b6e6eb4d9309b46c9e1541059effdbbdcc59fd2efb29ddd860947b7` | Concurrent-recovery alternative; no valid judgment for this hash located |
| `s3-l4-entry` | `bodies/l4-entry.md` | 5187 | `43dfa1d4d82c7072c911f8e28e6abecce9686f0dea1be7d19077f3d2c27de871` | Concurrent-recovery alternative; no valid judgment for this hash located |
| `s3-l4-maintenance` | `bodies/l4-maintenance.md` | 7433 | `31821e9ed5533a9e48fd590fad4bf94373c7a2241615e563038eb27c8b7d0cf8` | Concurrent-recovery alternative; no valid judgment for this hash located |
| `s3-l4-operational` | `bodies/l4-operational.md` | 7014 | `4f6a500ee4b575d9c06aa6c070ee8071f3b580c76c0f55da3871e567ebba7d81` | Concurrent-recovery alternative; no valid judgment for this hash located |
| `s3-l4-ownership` | `bodies/l4-ownership.md` | 5914 | `6c27da488bf8a376b0153150b59584766abd2a8c420910ec9ed542b8c2d4bfa3` | Concurrent-recovery alternative; no valid judgment for this hash located |

## Exact recovered final L1 judgments

The historical pair is `/root/judge_j1` and `/root/judge_j2` in the original executor. These are not callable handles in this resumption. The receipts are preserved as historical evidence, not attributed to new agents. Each final decision repeats its body hash, records PASS for the static unit and leaves no mandatory finding open.

| Artifact | Final judgment | Judgment SHA-256 |
| --- | --- | --- |
| `s3-l1-integrations` | `judgments/J1-L1-C-v3.json` | `1f60db67ea177bde0fae1f4f4ce2c30d356e527e8ca4e478218fc0c068796706` |
| `s3-l1-integrations` | `judgments/J2-L1-C-v3.json` | `57f762e9e074b81044dfb308885b366afe59c189a941d2125f0404601a15a893` |
| `s3-l1-maestro` | `judgments/J1-L1-A-v1-final.md` | `20b148e9540e6de0238c6699b02f12ed2cad31bb0e14941ca462bffb2d9a0bbd` |
| `s3-l1-maestro` | `judgments/J2-L1-A-v1-final.md` | `a85a4c67e691c2da7d8e7f71d4bbd3f0e22f006f8a1c11e8d750f46d3687735c` |
| `s3-l1-relay` | `judgments/J1-L1-B-v2.json` | `e5a2d69f618dbc35adc3a635a57c480be497a738b0ab7306249d2364f0de38bc` |
| `s3-l1-relay` | `judgments/J2-L1-B-v2.json` | `5e6ea8916baeeae4aad90a058937f337605955ec44a989ef9a0622ab3c1efc77` |

## Verification and scope limits

`custody-verification.json` records exact SHA-256, byte lengths and reconstructed Git blob SHA-1 (`sha1("blob " + length + NUL + bytes)`) for all captured files. All 38 Git blob checks, all 11 body checks, all six final L1 judgment checks and all eight canonical/archive comparisons passed. This is deterministic custody verification, not a product test or runtime proof.

`custody-search.json` records six S3 branch heads, primary history, directories, other integration refs, branch-specific Actions queries, exact identity searches, releases, export exclusions and limits. The global Actions artifact endpoint was rejected by the connector; it was not inspected. Indexed code search does not cover every ref. Absence in these routes does not prove absence in the original executor or in uninspected custody.

The browser connected, but host security policy denied ChatGPT navigation before the recovery conversation opened. No workaround was attempted. The export request is in `original-export-request.md`. Private evidence stays at its authorized origin.

## Historical precision

The old matrix calls thirteen support files conflict-free, but `concurrent-branch-reconciliation.json` marks `work.md` conflicting as well as the eight bodies (nine conflict flags in total). Preserve both records; this does not change any body hash. The old dispatch's generic `judgments/judge-{1,2}-L1-{A,B,C}.json` references are not the actual filenames; use the six names above.

## State

`ORIGINAL_CUSTODY_PARTIAL`. Original L1 acceptance is reusable. Original upper-layer acceptance and operational claims remain unverified. No new content judgment, Atlas operation, product test, merge or activation is asserted by this custody checkpoint. The residual review queue is a subsequent decision, limited to versions whose acceptance could not be recovered.

## Public sources

- [Original checkpoint and execution report](https://github.com/gustavomhss/hugr-orchestra/blob/68fca8e90c3150416e4e7ef8410df1cc42ee9d1b/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/work.md)
- [L1 acceptance](https://github.com/gustavomhss/hugr-orchestra/blob/19b909ef3bf27e0332f24fc30e3a5c471ea37d78/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/evidence/L1-acceptance.json)
- [Upper-layer provenance matrix](https://github.com/gustavomhss/hugr-orchestra/blob/41cac646d2934785a6288d756e618137ec2b1c1f/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3-small-20261114/provenance-matrix.md)
- [Concurrent-recovery preservation manifest](https://github.com/gustavomhss/hugr-orchestra/blob/19b909ef3bf27e0332f24fc30e3a5c471ea37d78/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/evidence/concurrent-branch-reconciliation.json)
- [Earlier resumption handoff](https://github.com/gustavomhss/hugr-orchestra/blob/7233f437b4a46c5845e9d88f68dadf8106224fe5/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3-resume-20261114/handoff.md)
