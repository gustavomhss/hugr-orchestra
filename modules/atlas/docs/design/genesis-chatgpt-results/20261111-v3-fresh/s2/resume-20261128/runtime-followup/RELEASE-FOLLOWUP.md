# S4 follow-up: prepared S2 is byte-compatible with the hosted qualification

The observed S4 branch is `09a4c4afc7aab2f9a153eb059d13df0ecf15595c`. Its [qualification run 46114652347](https://github.com/gustavomhss/hugr-orchestra/actions/runs/46114652347) is successful and runs the exact runtime `db9b4235022c4df32fe3bfd4faeea8adcd69abb7` in a separate worktree. The changes from db9 are workflow, harness, docs and evidence; runtime sources did not change.

## Decisive comparison

The hosted S2 candidate `b8715607230a23d0bcbea34e91a43cae2935d9db257cf7dab4bd54c31d1d71f6` and the local S2 candidate `4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522` differ in exactly two candidate fields:

| Field | Hosted | Local |
| --- | --- | --- |
| repo_root | /home/runner/work/_temp/genesis-runtime-46114652347-1/data/s2 | /workspace/scratch/5cfbb6c803f1/s2-corpus |
| observed_head | 1cde2ff7a71bcf7aecb5d030917b577165135d38 | bb2a931301d541692b11e5a7f1eab234cd9ed2fd |

Every other field is deeply equal, including implementation hashes, 626 observations, all 13 entries/results/inputs/dependencies, contract, criteria, references, roots, required keys and transport. This establishes package/prepare compatibility, while preserving the distinct execution identities.

The artifact ZIP SHA-256 is `f1747366c2312c80ff6cd071aea15693ceb14962b3e974f6614ddf450ac14606` and matches the Actions metadata. All 23 files indexed by its evidence-index match their recorded lengths and SHA-256. The local prepared SHA-256 is `476891f3bf1edf24f7d2c486a1218bab5b0cd5b2b36b8295c3892917724c2b4a`; hosted prepared SHA-256 is `9c2f896b3b87c0f7bb7a881ba13d2d8c4098da80fe446e0cc99e2bcfc7ea88c3`.

A read-only Git check still found runtime HEAD db9 and corpus HEAD bb2 with no tracked diff in either.

## Reuse opinion

**Yes: a new release that pins this db9 runtime and covers this exact S2 package may reuse the already executed local prepare, without repeating prepare merely because release documentation was published later.** Keep the local root, HEAD, code/dependencies and inputs intact; preserve the local receipt and candidate ID. The original publish entrypoint re-derives the candidate and will reject drift. If the eventual release selects a different runtime, re-evaluate actual compatibility rather than silently changing the candidate.

The current discovery manifest read at 09a4c4af is still r3, blob `7513fcca63664ca02094e9ed9b8fab090c20295d`. The successful qualification run is not itself a published release. Root should consume the final immutable release and perform the final branch check.

## Remaining prerequisites

Two independent new S2 binding decisions must cover the exact candidate, contract, all named criteria and all 13 entry tuples. The declared purpose is runtime preservation/transformation. Binding PASS cannot be relabeled as complete consumer, maintenance or global campaign ACs; historical semantic decisions remain separate.

The isolated policy must authorize the responsible actor for the actual scope. Missing/malformed policy denies writes. Ownership publication is composed and requires full ratification; these declarations are local responsibility controls, not credentials or production activation. CAS/projection are locally produced state and must not be staged as served state. No policy or runtime operation was performed by this review.

The hosted qualification explicitly records binding/publication NOT_ATTEMPTED and independent runtime acceptance SEPARATE. It covers full S1-03 (12 artifacts, 694 observations, six large inputs), full S2 (13 artifacts, 626 observations, three large inputs) and a real EACCES refusal. Guards at harness09a succeeded with zero gates, five warnings and zero errors against dev `3aaa5e0645f99940b66ee90d28aef93166f09ab1`.

## Files

- `release-followup.json`: complete structured opinion and refs.
- `followup-byte-comparison.json`: independent complete candidate comparison.
- `followup-prepare.zip` and `followup-artifact/`: downloaded Actions bytes and extraction.
- `followup-hosted-summary.json`: actual qualification summary extracted from the job log.
- `followup-qualification.py`, `followup-workflow.yml`: immutable harness/workflow captures.
- `followup-prepare.log`, `followup-guards.log`: actual job logs.

One observation round was performed. No product tests, new prepare, binding, policy creation, publication, consumer, maintenance, remote mutation or polling loop occurred.
