# S2 proposed isolated evaluation plan

State: `MATERIALIZED_PLAN_PROPOSAL_NOT_RUNTIME_PREPARED`.

The new root is `/workspace/scratch/5cfbb6c803f1/s2-evaluation`. It contains 716 regular files totaling 8,839,171 bytes. The 667 files consumed by the prior native prepare were copied byte for byte and checked against their recorded hashes and real Git tree bindings. The root has no `.git` or `.atlas`; `git rev-parse HEAD` failed as recorded, so its observed HEAD is honestly `null`.

The original native package remains SHA-256 `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b`. Original candidate `4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522`, prepared SHA-256 `476891f3bf1edf24f7d2c486a1218bab5b0cd5b2b36b8295c3892917724c2b4a`, and original contract `9f3829c9ebdd70aa303b9eb1f167bda77adf2f3b1988e98a973205d712ddfce2` are preserved as original evidence. They are not IDs for a future evaluation candidate, and they are not the historical r4 artifacts.

## Exact proposed inputs

| Object | Bytes | SHA-256 |
| --- | ---: | --- |
| evaluation-plan.json | 33,613 | b49e58fad813cf5a6bbbc68a605cfbaf216eb8cc11575d0e3b8bf78b99870e63 |
| obligation-set.json | 6,308 | 3533555bc7ced4ec21d236493bfafe98238643f989278fc07b9fab428e746229 |
| materialization-manifest.json | 724,569 | bb9cb02a14eb9504568ee27482c850e83ed2cab3aaa11cd9fb23263cc1af9ff7 |
| build_plan.py | 25,346 | b4f9125d625e5171af8b93835c460523ee74c3921622c80294748c9ba091b8bb |
| static-reconciliation.json | 1,618 | ab540cdc3ffa865957dacb69f4779aa54487ae0afa54611d005a9c1ffb32c0db |

The plan's repository-relative path is:

`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2/evaluation-plan.json`

The root includes 28 additive copies of implementation sources and package manifests at runtime `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`, and 14 additive normative documents. Copied normative and implementation paths use payload references; the catalog separately records each actual historical commit, original path and Git blob. No source baseline file was overwritten to pretend that db9 was the baseline.

The obligation set preserves all 11 original criteria with status `PENDING_FINAL_EVIDENCE`. It binds 15 normative references, including the original contract bytes, and four frozen oracle/question references. The plan binds all 13 entries and their 26 original semantic review uses. Unchanged semantic content is reused; this work issues no new semantic or admission decision.

## Phase and remaining obligations

The initial phase covers the 14 frozen consumer cases only, using their exact routine/deep budgets. `consumer_ids` are case/budget identifiers, not invented host-agent identities. Actual fresh native consumer identities must be recorded when dispatched. Reserved answers are not embedded in the plan; they remain in the separately preserved obligation references and must not be supplied to consumers.

The proposed initial policy operation set is `admit`, `index`, and `read`, expressly excluding `evaluation-maintenance`. No policy was created. S2-U1 remains mandatory and `NOT_RUN`, with the original graph and controls unchanged. Before maintenance, a distinct target plan must fix its concrete behavior patch, expected observable changes, producer recipe and exact target/recovery operations, followed by fresh result-specific semantic evidence and two exact target admission decisions. The independent reviewers must decide whether this initial-phase boundary is adequate for `ADMIT-ISOLATED-PLAN`; this file asserts no PASS.

The original AC descriptions retain their historical headers and qualification text. They were not edited to imply new observations. The v2 protocol preserves those final obligations instead of changing their meaning.

## Verification boundary

`build_plan.py` performed file materialization, SHA-256/Git-blob comparisons and read-only Git tree inspections. `static-reconciliation.json` checked all referenced payload bytes and records a derived union of 690 expected observed paths. It did not compute Atlas source versions or candidate IDs.

No Atlas function, `prepareEvaluation`, initialization, admission, policy, index/read, consumer, maintenance operation or product test was executed. A future prepare must still perform the real runtime validation and capture its full installed runtime/dependency identity. A compatible S4 release, actual new admission judgments and explicit isolated initialization/policy remain necessary before admission and consumption.

The initial plan proposal was amended before any runtime operation to bind the public question deck explicitly into the obligation set. The previous never-prepared proposal is preserved in `history/initial-proposal-before-deck-binding/`; the exact reason and old/new hashes are in `pre-prepare-amendment.json`.
