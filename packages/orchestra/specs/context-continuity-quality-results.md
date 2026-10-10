# Context Continuity quality results — 2026-10-09

**Acceptance verified within the scope below; publication to `dev` is pending.** This records observed
behavior and its limits, not universal semantic correctness or superiority over legacy compaction.

## Source and evidence custody

- Accepted implementation: `ed3bb035e607f7e1828da20d8dab662cbfe6b3bd` (`ed3bb035e6`).
- Source tree: `2e3ba63e276a11a18dc5875cae5472abcd338a7f`; live receipts record matching before/after
  identities for `quality-proof` and `claude-code-continuity` worktrees.
- Contract: [context-continuity-quality.md](context-continuity-quality.md). Implementation inspected:
  `src/continuity/{review.ts,review-seal.ts,fork.ts,archive-search.ts,service.ts}`,
  `src/claude-code/llm.ts` and `src/tool/context-recall-archive.ts`.
- External evidence root: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/quality-live-20261009`
  (`/private/var/...` in captured receipts). Paths below are relative to that root.
- Read receipts: `summary.json`, `verification-final.json`, `production-repair.json`, `matched-eval.json`,
  `repair-sequence.json`, `resume-result.json`, `workspace/handoff.json`, `inspect.ts`, provider finish
  records in `*-events.jsonl`, and `evidence-manifest.json`; findings are not based only on an agent claim.
- `evidence-manifest.json` pins receipt bytes with SHA-256; its `verification-final.json` entry is
  `f1255d7d82bba5c387f83c5f4fea91b183e73a4e1948385ef85f635140f85860`.
- Expected backup: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/quality-live-20261009.tgz`.
  **Awaiting backup confirmation.** Evidence currently referenced through the external scratch path.

## Verified CI and mutation controls

[Run 37998630211](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37998630211) completed
successfully on both platforms. GitHub metadata and test logs were inspected. Snapshot commit
`4cfa5034b192f0d0345707d77ae46d9b071e6dd9` has the accepted source as parent and adds only `.ci-run.json`.
Its request runs `test/continuity`, `test/claude-code`, and the four named tool suites
`context-recall{,-source,-archive,-ranked}.test.ts` with `--timeout 180000` (49 files per platform).
This is scoped integration CI, not the repository-wide suite.

| Platform | Pass | Skip | Fail | `expect()` assertions |
| --- | ---: | ---: | ---: | ---: |
| Linux | 529 | 2 | 0 | 8,451 |
| Windows | 509 | 11 | 0 | 8,373 |

Skip reach, from the actual logs:

- Linux: Windows-only capability-authoring rejection before catalog reads/output creation; native
  keychain precedence over an explicit plaintext credential file.
- Windows: nine capability-preparation cases — `../case` rejection/private contained output; refusal
  of existing symlink, directory, public-file, private-file and manifest outputs; refusal of symlink,
  public-directory and file output roots. Also native keychain precedence, and POSIX directory/side-file
  privacy modes with symlink rejection. These skips do not establish Windows ACL or macOS keychain behavior.

[Mutation red 37989942198](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37989942198)
disabled complete exact-data C17 rejection, semantic accept/cursor/issues rejection, and all-term
membership checking. All three targeted Linux tests failed (0 pass, 3 fail, 7 assertions):
`critical-retention.test.ts`, `review-execution.test.ts`, and `context-recall-ranked.test.ts`.
[Restored 37990150718](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37990150718)
passed the same three (3 pass, 0 fail, 52 assertions; 18 filtered out in both runs).
This calibrates those protected behaviors, not every assertion in the larger CI run.

## Live continuation and archive recovery

The single small receipt case used `openai/gpt-6-luna`, OpenAI ChatGPT OAuth, throughout parent,
producer, reviewer and matched readers: **19 real calls, 20 stream attempts, one pretransport block**
(attempt 13, dedicated producer-role admission). Failed harness phases remain in the accounting.
Session: `ses_edd1b3944ffe62Gfzm7Pwg0Efc`.

The natural candidate was accepted on its first production pass. A fresh process resumed with the
persisted reviewed memory; the source receipt file had been removed. The actual new-user consumer wire
carried memory and excluded covered raw source messages. The pre-input projection still retained its
current covered user anchor; that intermediate view is not the actual resumed consumer request.
Cold seal validation and critical value/rule retention are recorded in `verification-final.json`.

The resumed model called real `context_recall` twice: terms search for `validation receipt checksum`
returned one complete match, then exact reference lookup read that same archive fragment. It used
`apply_patch` to create `handoff.json` with exactly release `ORCHID-QUALITY-6D29`, region `sa-east-1`,
validation `passed`, checksum `6d290123456789abcdef0123456789abcdef0123456789abcdef0123456789ab`, and
next `wait-for-owner`. The recorded consumer tool trace contains those two recalls and the patch;
it contains no validation rerun or deployment. **The checksum was already in memory**: this proves
executed ranked retrieval/reference recovery, not that retrieval was necessary to answer correctly.

The offline oracle compared the preserved SQLite prefix with `history-before.json`, and four source
messages with five role/content-projected pre-compaction wire messages. Prefix digest:
`338e16270d8619646a4612760997f1d813805d64583000436954f19bd872aade`.
`durable-snapshot.sqlite`, request/event traces and exact handoff bytes support the receipt.

## Matched readers and defective-candidate repair

`matched-eval.json` records production decoding of the original producer reply and evaluation of original
and reviewed memory against the same frozen nine fields (`matched-questions.json`). Candidate text is
identical; one real reader per candidate scored **9/9 each**, with no omissions or contradictions on
those fields. This is a tie, not evidence that reviewed memory outperforms the original or legacy memory.

A separate structurally valid stale candidate claimed validation should rerun. A real review rejected
it with C18 and a contradiction grounded in `u1`, `u2`, `a2`. This checks rejection, not natural incidence.

`production-repair.json` and `repair-sequence.json` record a separate real production-fork probe:
producer → review repair/C18 → corrected producer → review accept/seal. Four real calls used one shared
correction allowance. The harness deliberately instructed the real producer to induce a defect; replies
were not fabricated. It emitted empty items and an unsupported diagnostic cursor, **not the
requested rerun candidate**. Review identified missing receipt/rules plus contradiction/stale cursor;
correction restored them and received a closed/wait-user seal. This probe did not publish to the parent.
The earlier `matched-eval.json` “Not induced” field predates this probe; `verification-final.json`
incorporates the later production-repair evidence rather than rewriting that earlier receipt.

## Actual usage, including failed phases

Usage comes from recorded provider `finish` events, not input-budget estimates. Cache-read tokens are
reported separately as a subset of input; do not add them again. Reasoning is likewise not added to output.

| Category | Real calls | Input tokens | Output tokens | Cache-read input tokens |
| --- | ---: | ---: | ---: | ---: |
| Parent/consumer, including failed setup attempts | 10 | 22,938 | 468 | 13,312 |
| Producer, including induced defect/correction | 3 | 12,015 | 1,925 | 2,816 |
| Reviewer, including rejections | 4 | 13,019 | 1,431 | 0 |
| Matched readers | 2 | 1,156 | 162 | 0 |
| **Total** | **19** | **49,128** | **3,986** | **16,128** |

Input plus output totals 53,114; cache writes were zero. In particular, failed seed-read harness phase
`produce-1791586711938` consumed calls 1–3: 5,647 input / 125 output / 3,072 cache-read tokens.
`produce-1791586776977` ended on the projection assertion after calls 4–8: 13,966 input / 845 output /
3,072 cache-read tokens, including the successful producer/review. Both subsets are already included.
Attempt 13 was blocked before transport and has no provider usage receipt; cumulative `calls` fields
in failure files are checkpoints, not extra calls to sum.

## Preserved failures and oracle limits

`verification-final.json` retains eight failure receipts: missing `@orchestra/LLM` harness service;
missing seed read; covered-raw-source projection assertion; Effect initializer TypeError; dedicated
producer-role admission; ArrayBuffer hashing TypeError; and two repair-oracle failures that wrongly
expected a rerun-specific candidate. Final inspection follows the actual omission/stale-cursor trace.
These failures were preserved alongside successful evidence, not discarded as if every attempt passed.

`inspect.ts` uses non-model checks and mutation controls for exact handoff fields (checksum/extra/next),
seal Now/critical-ID/digest, durable-prefix and wire content, raw-source absence with injected positive
control, review accept/malformed/reject, and reader region/next/noDeploy. Its reach is exact captured
fields, source integrity and recorded tool behavior. It is not an independent semantic judge of arbitrary
tasks; production decoding/seal helpers are reused, and one small case with one reader per candidate
cannot establish general reliability, causality or superiority. This receipt case contains no nonzero
expected-negative source outcome. Structural CI, live evidence and semantic assessment remain distinct.

This documentation closeout reuses those receipts; no new paid calls, tests or typecheck were needed.
Acceptance is verified as scoped above. Default-branch publication and backup confirmation remain pending.
