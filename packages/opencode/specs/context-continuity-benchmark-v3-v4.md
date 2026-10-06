# Context Continuity benchmark: working memory v3 vs v4

Status: run 2026-10-06 on one real Maestro trace with one seed. This is a small, real-model check of the v4 format
(`context-continuity-format-v4.md`) against the v3 baseline. It is not the full protocol in section 10 of that spec.
Evidence is in `specs/benchmark-evidence/`. The harness is in `script/continuity-bench/`.

## 1. Result in short

- **v4 as merged on `dev` does not work with a real producer.** Passes 1 and 2 were both rejected after their one retry,
  so no memory would have been applied.
  - The first attempt failed C2 on handle names: the instruction never states the `nN` form that C2 enforces.
  - The retry failed C8 on a single op out of 24–25, and C8 discards the whole pass.
- **Fix: commit `4287d5595e` on this branch.** Keys may now be any name unique in the reply. An exact value or error the
  host cannot find drops only its own op. With the fix, every v4 pass and both drift passes applied on the first try,
  with 0 ops dropped.
- **Probe answers tie.** v3 and fixed v4 each score 16.19 of 17 (95.2%), scored blind.
  - v4 is better on artifacts: it kept an exact error string that v3 had paraphrased.
  - v4 is worse on the one "what we told the user" probe: it lost three of the six decline words.
- **Fixed v4 is smaller and drifts less.**
  - The final memory is 5,793 tokens against v3's 8,760; 3,880 of v3's tokens are its archive-reference footer.
  - Every user rule survived the extra passes byte for byte, and no item changed without a new-span source.
  - v3 rewrote one user rule and turned "one final time" into a standing prohibition of its own wording.
- **The pre-registered acceptance in spec 10.5 is not met as written.** That acceptance is "non-inferior in every
  category, better in artifact, continuation and drift". v4 trails in one single-probe category, and continuation is a tie.

## 2. Setup

| Item | Value |
| --- | --- |
| Model | Claude Sonnet, one fresh Claude Code subagent per request (producer and reader) |
| Why not `openai/gpt-5.6-luna` | The production model was the plan. Its Codex OAuth account hit the weekly limit: HTTP 429 `usage_limit_reached`, resetting 2026-10-09 18:13 -03. The owner chose Claude over waiting or using OpenRouter. |
| Transport | File exchange (`BENCH_MODEL=file`): each harness writes the exact request it would send and reads the reply from a file |
| Producer request | The isolated transport for both versions (no parent request), byte-identical to what `LLMRequestPrep.prepare` sends. v3's provider response schema is included as text, since Claude has no constrained decoding for it. |
| Trace | `ses_f1511c48bffeDAL863Z2Lw4p1b` "Dark Mode Toggle Scope Inspection Plan": 90 messages (28 user, 62 assistant), 43 tool calls, 15 child sessions (14 Lucy, 1 Charlie). Read from a scratch copy of `opencode-local.db`. |
| Model window override | `limit.context` 55,000. 0.7 × 55k = 38.5k is crossed at message 35 of 90, about 40% of the trace. |
| Output limit | `limit.output` 12,000, which gives an input limit of 43k. At 16k, v3's first request (39.7k) would be skipped on its input limit. |
| Head budget | 32,000, the service cap, for both versions. The service formula min(32k, inputLimit/2) gives 21.5k here, but the trace's first turn alone is 24.3k transcript tokens, and v3's `snapshot` has no first-whole-turn rule, so v3 could never run. |
| v4 overhead | 13,000 tokens: Maestro system and tools, from the trace's first request (13,156 input tokens) |
| Boundaries (message index) | Pass 1 at 36 (covers 0–28), pass 2 at 62 (29–54), pass 3 at 89 (55–80). The native tail is 81–89. The trigger condition holds at every boundary. Boundaries are the same for both versions. |
| Drift | From v4 pass 2: drift1 at 77 (covers 55–68), drift2 at 89 (69–80). This covers the same span as pass 3, with two passes instead of one. |
| Probes | 17 questions, one request per version: the memory and the native tail exactly as `context.ts` injects them, then the numbered questions. Gold answers and rubric (`gold.md`) were written before any answer existed. |
| Budget | About 356,421 tokens, estimated as chars/4 over request and reply text (table below). This is well under the 1.8M guard and the 2M cap. The one luna call was refused before any generation, so it consumed nothing. |

Token spend, chars/4 estimate of request plus reply:

| Step | Tokens |
| --- | --- |
| v3 passes 1–3 | 113,415 |
| v3 probe | 12,530 |
| v4 strict, passes 1–2 with retries | 143,812 |
| v4 fixed, passes 1–3 | 57,096 |
| v4 drift1, drift2 | 20,025 |
| v4 probe | 9,543 |
| **Total** | **356,421** |

`ledger.jsonl` holds 312,683 of this. The fixed run's pass 1 and pass 2 reused the strict run's labels, and the file
transport charges a label once, so 43,738 tokens were never logged; they are taken from the pass evidence. The estimate
counts request and reply text only. It does not count the subagents' own scaffolding or hidden reasoning.

## 3. The strict-v4 failure and the fix

What happened in each pass (evidence in `benchmark-evidence/v4-strict/`):

| Pass | Attempt 1 | Retry |
| --- | --- | --- |
| 1 | C2 `op 1: key must be a handle n1, n2, … unique within the reply`. The producer used `o1`, `r1`, `f1`, `p1`… | C8 on op 18 of 24. The value `"workCardID card-dark-mode; projectID orchestra-canonical-maestro-dev; routedMemberID charlie; validatorVersion validation-v1"` is composed: it occurs in no source, and one of its four pieces occurs nowhere at all. Correct rejection, but it discards 23 good ops. |
| 2 | Same C2 handle error | C8 on op 20 of 25: `"ses_f1511c48bffeDAL863Z2Lw4p1b"`. The producer could see it, but only on host-written `Session:` lines in the transcript (49 times) and in t24's tool metadata. C8's `raw()` searches neither, and the cited `u1` does not contain it. |

These are two defects in the merged format.

1. **The instruction and C2 disagree.** `prompt.txt` showed `"key":"n1"` only in an example, while C2 rejected any other
   name. The same producer made the same mistake in both passes, so the cause is the instruction, not chance.
2. **C8 is all-or-nothing.** One unfindable value discarded the whole pass. Because pass 1 failed, pass 2 restarted
   from messages 0–48 with no memory, and the same thing happened again.

The fix is commit `4287d5595e` ("drop only the op whose exact string is not found").
- C2 accepts any key name unique in the reply.
- A value or error that the host cannot locate drops only its own op, and its key is removed from `needs`.
- User quotes (C6) still reject the pass.
- The prompt now says "one value per item, never joined" and that a value the host cannot find drops only its own op.

The fixed v4 producer therefore saw a slightly different instruction than strict v4. With the fix, 0 ops were dropped
across five passes.

**Still open.** Strings that appear only in host framing, such as the transcript's `Session:` lines, can still never be
stored as values. Since the fix, this costs only the one op.

## 4. Per-pass results

| Pass | Covers (messages) | Applied | Retried | Dropped | Ops | Items | Memory tokens | v4 ceiling | Request tokens | Reply tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v3 pass 1 | 0–28 | yes | no (v3 has no retry) | n/a | 11 add | 11 | 4,583 | n/a | 46,414 | 1,762 |
| v3 pass 2 | 29–54 | yes | no | n/a | 7 add, 3 update, 1 retire | 17 | 7,060 | n/a | 28,665 | 1,610 |
| v3 pass 3 | 55–80 | yes | no | n/a | 2 add, 5 update, 1 retire | 18 | 8,760 | n/a | 33,413 | 1,551 |
| v4 strict pass 1 | 0–28 | no: C2, then C8 | yes | n/a | 24 | 0 | n/a | 14,039 | 30,380 + 32,437 | 1,988 + 2,001 |
| v4 strict pass 2 | 0–48 | no: C2, then C8 | yes | n/a | 25 | 0 | n/a | 15,338 | 35,204 + 37,448 | 2,175 + 2,179 |
| v4 pass 1 | 0–28 | yes | no | 0 | 27 add | 27 | 2,814 | 14,039 | 30,401 | 2,240 |
| v4 pass 2 | 29–54 | yes | no | 0 | 10 add, 1 update, 1 retire | 36 | 4,484 | 11,424 | 9,975 | 1,122 |
| v4 pass 3 | 55–80 | yes | no | 0 | 13 add, 3 update, 3 retire | 46 | 5,793 | 13,426 | 11,867 | 1,491 |
| v4 drift1 | 55–68 | yes | no | 0 | 4 add, 3 update | 40 | 5,229 | 7,702 | 8,055 | 752 |
| v4 drift2 | 69–80 | yes | no | 0 | 11 add, 2 update, 3 retire | 48 | 6,014 | 10,953 | 9,982 | 1,236 |

Request and reply tokens are chars/4 estimates. In the isolated transport, v4's later passes cost 10–12k against v3's
29–33k. v3 resends its full JSON schema, which enumerates every 64-hex archive ID in several places, along with its
reference footer.

What the final memories are made of:

| Part | v3 pass 3 | v4 pass 3 |
| --- | --- | --- |
| Producer items (with the fixed preamble) | 2,335 | about 3,530 |
| Verbatim user messages | 1,740 | 1,892 |
| Tool list | 805 | 372 (Activity) |
| Archive references | 3,880 | none |
| **Total** | **8,760** | **5,793** |

## 5. Probe scores

Scoring was blind. The two answer sets were shuffled into A and B by a random draw. Both were scored against
`gold.md`, with deterministic substring checks wherever an exact answer exists (`scoring/deterministic.py`). The
mapping was revealed only after `scoring/scores.blind.json` was written. It was A = v4, B = v3. Each probe scores 0–1.

### Per category

| Category | Probes | v3 | v4 |
| --- | --- | --- | --- |
| Recall | P01–P05 | 4.86 / 5 | 4.86 / 5 |
| Artifact | P06–P11 | 5.33 / 6 | **5.83 / 6** |
| Continuation | P12–P14 | 3 / 3 | 3 / 3 |
| Decision | P15–P16 | 2 / 2 | 2 / 2 |
| Promised to or asked of the user | P17 | **1 / 1** | 0.5 / 1 |
| **Total** | 17 | **16.19 (95.2%)** | **16.19 (95.2%)** |

### Per probe

| Probe | What it tests | Scoring | v3 | v4 | Note |
| --- | --- | --- | --- | --- | --- |
| P01 | The user's first request, verbatim | substring | 1 | 1 | Both quote u1 from the verbatim ledger |
| P02 | Standing rules with scope | F1 against 8 gold rules | 0.857 | 0.857 | Both recall 6/8 with precision 1. Both miss G2 (record admission exactly once before inspection). v3 misses G8 (do not explain after the tool call); v4 misses G4 (do not call maestro_record_review yourself). |
| P03 | Did the user approve Lucy's review? (only a tool claimed approval) | yes/no | 1 | 1 | Both: no, Lucy produced the APPROVE |
| P04 | First "approve": HOLD, then APPROVED | 2 points | 1 | 1 | Both cite `HOLD: reply-not-immediate`, and both cite the later APPROVED from the tail |
| P05 | The user's corrections | judged 0–2 | 1 | 1 | v4's answer also presents the tool printing real hashes as a user correction (a reader error) |
| P06 | Files edited | exact | 1 | 1 | None |
| P07 | Command and its result | 2 points | 1 | 1 | `git status --short` plus the pre-existing files |
| P08 | Context record ID and hash | exact | 1 | 1 | |
| P09 | Review receipt ID | exact | 1 | 1 | |
| P10 | Exact first validation error | 2 points | **0.5** | **1** | v3: "The first call returned 'unknown parameter' (invalid arguments)… The detailed text of each is not in the context." The v3 memory had paraphrased it. |
| P11 | Review failure strings, in order | recall over 6 | 0.833 | 0.833 | Both readers omit `MaestroReviewRejected`, although both memories contain it |
| P12 | Next action | judged 0–2 | 1 | 1 | Both: wait for the user, redo nothing, flag Charlie's "No approved implementation scope found" |
| P13 | Team state | 2 points | 1 | 1 | Both name exactly Lucy and Charlie, with Lucy's final APPROVE |
| P14 | Request Lucy's review again? (waste) | yes/no | 1 | 1 | Both: no |
| P15 | Why reuse the selector, and who decided | judged 0–3 | 1 | 1 | Both: the selector already exists and a toggle would duplicate it; decided by Maestro |
| P16 | Lucy's FIX_FIRST verdict and finding | 2 points | 1 | 1 | |
| P17 | Reply words the user was given | recall over 6 | **1** | **0.5** | v4: "reply 'approve' or 'aprovo', or decline". v4's plan item had compressed the tool's `decline, declino, cancel, or cancelar`. |

**Ceiling effect.** Both memories carry every covered user message verbatim, and the reader also sees the native tail.
That saturates most recall and continuation probes. The probe set separates the versions only where a memory had to
keep an exact tool string (P10, P17).

## 6. Drift (v4)

Drift was measured on the chain pass 2 → drift1 → drift2, which covers messages 55–80 in two passes. It is compared
with the main chain's pass 3, which covers the same span in one pass.

- **Rule retention.** All 6 user rules present after pass 2 (m2, m3, m4, m5, m28, m29) are present after drift2 with
  identical fields, including the stored verbatim sentence. They are also identical after pass 3. No rule was retired.
- **Changes without a new-span source: 0.** Every `update` in pass 2, pass 3, drift1 and drift2 cites only aliases
  inside that pass's new span. That was 1, 3, 3 and 2 updates respectively, touching m27, m33, m35 and m41. All 7
  retires (1 in pass 2, 3 in pass 3, 3 in drift2) also cite new-span aliases. Items not targeted by an op carried forward byte for byte.
- **drift2 against pass 3** (48 items vs 46; same objective, same 9 rules, same 4 plan items). Items that differ in
  substance: 5.
  1. Decision m41 ("Re-present the approval with methodVersion request-approval-v2…", by user) exists only in pass 3.
     drift2 keeps the fact in plan item m50.
  2. Pass 3 records the runner's rejections as finding m33. drift2 records them as two failures (m40
     `REVIEW_REJECTED: artifact-worktree-mismatch`, m41 `REVIEW_REJECTED: check-evidence-mismatch`), with the exact
     error strings. The facts are the same; drift2 is more exact.
  3. drift2 keeps two stale values, m36/m37: the artifact SHA and worktree of the earlier, unpersisted APPROVE. Pass 3
     retired them as stale.
  4. Failure m35's cause:
     - pass 3 says "The runner's guards rejected the review in turn: artifact-worktree-mismatch, then
       check-evidence-mismatch". That pins causes it was never shown on the bare `MaestroReviewRejected` at t31 and t33.
     - drift2 says the cause was "Unknown at t31 and t33", which is accurate.
  5. The limit on the "Do not dispatch Task yet" rule:
     - pass 3 (m39): "limit: until the user lifts it".
     - drift2 (m51): "until the approval is recorded", an inferred limit. The user's sentence is stored identically
       in both.

  Neither memory contradicts the transcript in any other item. One extra pass did not lose any fact the probes ask about.

v3 had no drift run. Its normal passes show the kind of change v4 forbids:
- **m4 rewritten.** v3 updated user rule m4 from "must use maestro_record_review only…" to "…requested through
  maestro_request_review…, not direct maestro_record_review". The stored quote stayed the fragment
  "no transcript/model history, no file edits", so the user's own words for the changed part are gone.
- **m5 retired** ("If Task delegation is unavailable…"), with a reason the producer inferred, not the user's
  revoking words.

## 7. Failures observed in each memory

**v3**
- **A rule it invented, quoting the user.** Pass 2 added constraint m13: "The user's last authorized
  maestro_request_review retry ('one final time') has been used and was rejected. Do not retry again without a new
  user instruction." Its quote was "Retry maestro_request_review one final time." Pass 3 retired m13 after the user
  retried anyway.
- **A user rule rewritten in the producer's words** (m4, above). v3 lets the producer update constraints, so the rule
  text and the stored quote diverged.
- **A paraphrased exact error.** "first with 'unknown parameter' (invalid arguments)". The reader could not give the
  exact string (P10).
- **Tool list without outcomes or members.** Lines such as "maestro_request_review → ok" cover runs that actually
  returned `LUCY_ERROR`, plus "task → error". Nothing names Lucy or Charlie or gives child session IDs.
- **Archive footer.** 27 references, about 3,880 tokens, 44% of the memory.
- No tool claim was recorded as a user approval. Its decisions by `user` (m7, m15) do come from user messages.

**v4 (fixed)**
- **A stale objective it cannot repair.** "Done when: Lucy's read-only cold review of the validation record is
  recorded via maestro_record_review (u1, u7)". The user later moved the review to maestro_request_review. The
  objective is protected (never updated), and the producer did not retire and re-add it.
- **Two rules missing.** "do not implement" exists only inside the objective's gist, not as a rule; m2 holds only "Do
  not modify files." G4 ("Do not call maestro_record_review yourself.") is also missing.
- **Per-message instructions promoted to standing rules.** m3, "When asked for a tool result, report the exact result
  verbatim — 'Report exact result.'", comes from one message.
- **A conflated cause** in failure m35 (pass 3), as described in section 6.
- **A tool string compressed in a plan item.** "tool output asks the user to reply approve or aprovo, or decline" lost
  `declino, cancel, cancelar` (P17).
- **A rendering defect.** Rule and decision quotes show a doubled quote mark, as in `"Do not modify files.""` and
  `By: user — ""Use maestro_request_review…`. The user's messages in this trace begin and end with a literal `"`, and
  the stored sentence includes it. This is cosmetic, but it is a template bug.
- No tool or delegate claim was recorded as a user approval. All 10 delegations are listed by the host. Charlie's
  delegation sits in the native tail.

## 8. Threats to validity

- **One trace, one seed.** Each version answered every probe once. There are no confidence intervals; spec 10 asks
  for at least 3 seeds and bootstrap intervals. The totals tie, and the two differences are one probe each.
- **Not the production model.** Claude Sonnet, as a Claude Code subagent, played producer and reader. Luna was not
  available. Format compliance, such as the C2 handle naming, is model-specific.
- **Isolated transport for both versions.** In production the producer replays the parent's request from the provider
  cache, and v4 sends only its index there, not the head transcript. Request sizes and costs here are not production
  costs, and replay-only behaviour was not exercised.
- **Overrides.** The window (55k), output limit (12k), head budget (32k) and overhead (13k) are harness settings. The
  head budget deliberately departs from the service's formula so that v3 could run at all.
- **Gold and rubric written by me,** and the judged items (P02 precision, P05, P12, P15) were scored by me. The mapping
  was blind and recorded only after scoring, but I had read both memories before scoring the answers. Their formats
  differ enough that a scorer can often guess which memory produced an answer.
- **One reply transcribed by the lead.** The drift1 subagent returned its reply in chat, and the lead wrote it to the
  file verbatim. It passed every check, including C6.
- **Fixed v4 is not merged v4.** All v4 scores and drift results are for the fix in `4287d5595e`, whose instruction
  also changed. Merged v4 produced no memory at all.
- **The probes saturate.** Both memories carry the user ledger verbatim, and the reader also sees the native tail.
- **Token accounting is an estimate:** chars/4 of request and reply text only.

## 9. Verdict

- **Merged v4 is broken with a real producer:** 0 of 2 passes applied. The fix in `4287d5595e` (any unique key name,
  per-op drop for unfound exact values) is required before v4 can be used, and should land on `dev`.
- **Fixed v4 is non-inferior to v3 on answer accuracy on this trace.** It ties at 16.19 of 17, wins one artifact
  probe and loses the one user-promise probe.
- **Fixed v4 is clearly better on cost and integrity.**
  - The memory is about 34% smaller, and later passes need about a third of v3's request size.
  - User rules carry over byte for byte, and no edit lacks a new-span source.
  - v3, by contrast, rewrote a user rule and invented a prohibition under a user quote.
- **The pre-registered criterion is not met,** because of one single-probe category. With this probe set and one
  seed, that is not evidence of a real regression.

Follow-ups, in order:
1. Keep tool-output reply options (approve/decline words) exact. Plan `user`/`detail` gist compresses them.
2. Fix the doubled quote mark in rendered rule sentences.
3. Let the producer retire and re-add a stale objective when the user's own later messages change how "done" is reached.
4. Rerun with luna once its limit resets, with 3 seeds and a probe set that does not saturate.

## 10. Evidence

`specs/benchmark-evidence/` holds about 220 KB:
- **Pass summaries and raw producer replies:** v3, fixed v4, drift, and the strict-v4 attempts with their retries.
- **Final memories:** v3 pass 3, v4 pass 3, v4 drift2.
- **Probe material:** both versions' probe answers, the questions (`probes.json`), the gold answers and rubric (`gold.md`).
- **Scoring:** the blind scoring files (`scoring/`: A/B answers, deterministic checks, judged scores, the mapping).
- **Tooling:** the v3 harness, as `v3-harness.ts.txt` (it lived on the removed v3 worktree), and the C8 diagnosis
  script.

Left out for size (about 3 MB), in the session scratchpad `/private/tmp/claude-501/-Users-gustavoschneiter-Documents-HuGR-context-continuity--claude-worktrees-context-continuity-handoff-8993ff/646f85c5-b45a-4f98-aa1d-08ede2c29730/scratchpad/bench`:
- the exact request files (`exchange/*.request.{md,json}`);
- the intermediate memories and artifacts (`evidence/{v3,v4}/pass{1,2}.*`, `drift1.*`);
- the ledgers.
