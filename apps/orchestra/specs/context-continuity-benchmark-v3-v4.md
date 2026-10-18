# Context Continuity benchmark: working memory v3 vs v4

Status: run 2026-10-06 on one real Maestro trace with three seeds. This is a small, real-model check of the v4 format
(`context-continuity-format-v4.md`) against the v3 baseline. It is not the full protocol in section 10 of that spec.
Evidence is in `specs/benchmark-evidence/`. The harness is in `script/continuity-bench/`.

## 1. Result in short

- **v4 as first merged on `dev` does not work with a real producer.** In seed 1, passes 1 and 2 were both rejected
  after their one retry, so no memory would have been applied.
  - The first attempt failed C2 on handle names: the instruction never states the `nN` form that C2 enforces.
  - The retry failed C8 on a single op out of 24–25, and C8 discards the whole pass.
- **Fix: commit `4287d5595e` on this branch.** Keys may now be any name unique in the reply. An exact value or error the
  host cannot find drops only its own op.
  - With the fix, every v4 pass in all three seeds and both drift passes applied on the first try.
  - Only seed 3's pass 1 dropped anything: 2 ops, of the same two kinds that had sunk seed 1's strict passes.
- **Fixed v4 scores at least as well as v3 in every seed.** Scored blind, with a fresh A/B shuffle per seed, out of 17:

  | Seed | v3 | v4 |
  | --- | --- | --- |
  | 1 | 16.19 | 16.19 |
  | 2 | 15.86 | 16.83 |
  | 3 | 16.31 | 16.86 |
  | **Mean** | **16.12 (94.8%)** | **16.63 (97.8%)** |

  - v4 wins artifact (mean 5.94 vs 5.44 of 6) and recall (4.85 vs 4.68 of 5).
  - It ties continuation and decision.
  - It trails on the single user-promise probe in seed 1 only (mean 0.83 vs 1.00).
- **Fixed v4 is smaller and does not rewrite user rules.**
  - The final memory averages 6,137 tokens against v3's 8,780 (−30%).
  - In seed 1's drift run, every user rule survived byte for byte, and no item changed without a new-span source.
  - In all three seeds, v3 invented the same rule ("the final retry is used; do not retry again") under a user quote,
    then retired it a pass later.
- **The pre-registered acceptance in spec 10.5 is still not met as written.** It needs "non-inferior in every category,
  better in artifact, continuation and drift".
  - User-promise: v4 is inferior on the mean (0.83 vs 1.00), from one probe in one seed.
  - Continuation: a tie at the ceiling.
  - Drift: measured on v4 only.

## 2. Setup

| Item | Value |
| --- | --- |
| Model | Claude Sonnet, one fresh Claude Code subagent per request (producer and reader) |
| Why not `openai/gpt-5.6-luna` | The production model was the plan. Its Codex OAuth account hit the weekly limit (HTTP 429 `usage_limit_reached`), and the owner then confirmed there are no GPT credits. Every run is on Claude. |
| Seeds | 3 independent runs of the same steps (passes 1–3 and the probe, per version). "Seed" means a fresh subagent per request; Claude Code exposes no sampling seed. Seeds 2 and 3 never read seed 1's evidence (`BENCH_SEED`). |
| Transport | File exchange (`BENCH_MODEL=file`): each harness writes the exact request it would send and reads the reply from a file |
| Producer request | The isolated transport for both versions (no parent request), byte-identical to what `LLMRequestPrep.prepare` sends. v3's provider response schema is included as text, since Claude has no constrained decoding for it. |
| v4 code | Seed 1: strict run at `6d601b939e` (as merged), then the fixed run at `4287d5595e`. Seeds 2–3: `97de756523`, which adds the quote-rendering change in `278042aa09` and a merge of `dev`. The producer prompt is the same for all fixed runs; the seed-2 pass-1 request is byte-identical to seed 1's apart from session IDs. |
| Trace | `ses_f1511c48bffeDAL863Z2Lw4p1b` "Dark Mode Toggle Scope Inspection Plan": 90 messages (28 user, 62 assistant), 43 tool calls, 15 child sessions (14 Lucy, 1 the backend specialist). Read from a scratch copy of `orchestra-local.db`. |
| Model window override | `limit.context` 55,000. 0.7 × 55k = 38.5k is crossed at message 35 of 90, about 40% of the trace. |
| Output limit | `limit.output` 12,000, which gives an input limit of 43k. At 16k, v3's first request (39.7k) would be skipped on its input limit. |
| Head budget | 32,000, the service cap, for both versions. The service formula min(32k, inputLimit/2) gives 21.5k here, but the trace's first turn alone is 24.3k transcript tokens, and v3's `snapshot` has no first-whole-turn rule, so v3 could never run. |
| v4 overhead | 13,000 tokens: Maestro system and tools, from the trace's first request (13,156 input tokens) |
| Boundaries (message index) | Pass 1 at 36 (covers 0–28), pass 2 at 62 (29–54), pass 3 at 89 (55–80). The native tail is 81–89. The trigger condition holds at every boundary. Boundaries are the same for both versions and all seeds. |
| Drift | Seed 1 only. From v4 pass 2: drift1 at 77 (covers 55–68), drift2 at 89 (69–80). This covers the same span as pass 3, with two passes instead of one. |
| Probes | 17 questions, one request per version and seed: the memory and the native tail exactly as `context.ts` injects them, then the numbered questions. Gold answers and rubric (`gold.md`) were written before any answer existed and were not changed for seeds 2–3. |
| Budget | About 747,954 tokens, estimated as chars/4 over request and reply text (table below). This is well under the 1.8M guard and the 2M cap. The one luna call was refused before any generation, so it consumed nothing. |

Token spend, chars/4 estimate of request plus reply:

| Step | Tokens |
| --- | --- |
| Seed 1, total | 356,421 |
| — v3 passes 1–3 | 113,415 |
| — v3 probe | 12,530 |
| — v4 strict, passes 1–2 with retries | 143,812 |
| — v4 fixed, passes 1–3 | 57,096 |
| — v4 drift1, drift2 | 20,025 |
| — v4 probe | 9,543 |
| Seed 2 (`ledger-seed-2.jsonl`) | 195,487 |
| Seed 3 (`ledger-seed-3.jsonl`) | 196,046 |
| **Total** | **747,954** |

Seed 1's `ledger.jsonl` holds 312,683 of its 356,421. The fixed run's pass 1 and pass 2 reused the strict run's labels,
and the file transport charges a label once, so 43,738 tokens were never logged; they are taken from the pass evidence.
The estimate counts request and reply text only. It does not count the subagents' own scaffolding or hidden reasoning.

**Transcribed replies.** Two subagents returned their reply in chat instead of writing the file, and the lead
transcribed each verbatim: seed 1 drift1 and seed 2 v4 pass 3. Both passed every check, including C6 quote location.

## 3. The strict-v4 failure, the fix, and what still drops

What happened in each pass of seed 1's strict run (evidence in `benchmark-evidence/v4-strict/`):

| Pass | Attempt 1 | Retry |
| --- | --- | --- |
| 1 | C2 `op 1: key must be a handle n1, n2, … unique within the reply`. The producer used `o1`, `r1`, `f1`, `p1`… | C8 on op 18 of 24. The value `"workCardID card-dark-mode; projectID orchestra-canonical-maestro-dev; routedMemberID backend; validatorVersion validation-v1"` is composed: it occurs in no source, and one of its four pieces occurs nowhere at all. Correct rejection, but it discards 23 good ops. |
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

The fixed v4 producer therefore saw a slightly different instruction than strict v4.

**C8 drops after the fix.** Across the three fixed seeds, 2 ops were dropped, both in seed 3's pass 1
(`seed-3/v4/c8-drops-diagnosis.ts.txt`):

| Op | Value | Why the host could not locate it |
| --- | --- | --- |
| 21, `values`, src `u1` | `ses_f1511c48bffeDAL863Z2Lw4p1b` (named "sessionID") | It appears only in host framing: the transcript's `Session:` lines and the request header. It is in no covered source's text, `KEY_ARGS` input or output; t24's metadata is outside pass 1's span. This is the same case as strict pass 2. |
| 28, `values`, src `t23` | `"projectID orchestra-canonical-maestro-dev; workCardID card-dark-mode; routedMemberID backend; validatorVersion validation-v1"` (named "validation binding") | It was composed by joining arguments, despite the new "never joined" instruction. It occurs nowhere, not even in the request. This is the same case as strict pass 1. |

Both drops cost only their own item, and the other 31 ops of the pass applied. The session ID would be lost in every
run that tries to store it. Either the host should accept strings from its own framing, or the transcript should not
show session headers the producer cannot cite.

## 4. Per-pass results

| Seed | Version | Pass | Applied | Dropped | Items | Memory tokens | v4 ceiling | Request tokens | Reply tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | v3 | 1 | yes | n/a | 11 | 4,583 | n/a | 46,414 | 1,762 |
| 1 | v3 | 2 | yes | n/a | 17 | 7,060 | n/a | 28,665 | 1,610 |
| 1 | v3 | 3 | yes | n/a | 18 | 8,760 | n/a | 33,413 | 1,551 |
| 2 | v3 | 1 | yes | n/a | 10 | 4,450 | n/a | 46,414 | 1,521 |
| 2 | v3 | 2 | yes | n/a | 15 | 7,101 | n/a | 28,532 | 1,507 |
| 2 | v3 | 3 | yes | n/a | 16 | 8,380 | n/a | 33,757 | 2,262 |
| 3 | v3 | 1 | yes | n/a | 13 | 4,941 | n/a | 46,414 | 1,917 |
| 3 | v3 | 2 | yes | n/a | 20 | 7,313 | n/a | 29,630 | 1,485 |
| 3 | v3 | 3 | yes | n/a | 22 | 9,199 | n/a | 33,969 | 1,711 |
| 1 | v4 strict | 1 | no: C2, then C8 | n/a | 0 | n/a | 14,039 | 30,380 + 32,437 | 1,988 + 2,001 |
| 1 | v4 strict | 2 | no: C2, then C8 | n/a | 0 | n/a | 15,338 | 35,204 + 37,448 | 2,175 + 2,179 |
| 1 | v4 | 1 | yes | 0 | 27 | 2,814 | 14,039 | 30,401 | 2,240 |
| 1 | v4 | 2 | yes | 0 | 36 | 4,484 | 11,424 | 9,975 | 1,122 |
| 1 | v4 | 3 | yes | 0 | 46 | 5,793 | 13,426 | 11,867 | 1,491 |
| 1 | v4 | drift1 | yes | 0 | 40 | 5,229 | 7,702 | 8,055 | 752 |
| 1 | v4 | drift2 | yes | 0 | 48 | 6,014 | 10,953 | 9,982 | 1,236 |
| 2 | v4 | 1 | yes | 0 | 35 | 3,225 | 14,039 | 30,401 | 2,621 |
| 2 | v4 | 2 | yes | 0 | 46 | 4,997 | 11,835 | 10,386 | 1,280 |
| 2 | v4 | 3 | yes | 0 | 60 | 6,468 | 13,939 | 12,381 | 1,616 |
| 3 | v4 | 1 | yes | 2 | 33 | 3,491 | 14,039 | 30,401 | 2,711 |
| 3 | v4 | 2 | yes | 0 | 38 | 4,892 | 12,101 | 10,652 | 852 |
| 3 | v4 | 3 | yes | 0 | 48 | 6,150 | 13,834 | 12,276 | 1,138 |

Notes on the table:
- No fixed v4 pass needed its retry, and v3 has no retry.
- Request and reply tokens are chars/4 estimates.
- In the isolated transport, v4's later passes cost 10–12k against v3's 29–34k. v3 resends its full JSON schema, which
  enumerates every 64-hex archive ID in several places, along with its reference footer.
- Final memory size: v3 averages 8,780 tokens (range 8,380–9,199) and v4 averages 6,137 (5,793–6,468).
- v4 holds 2–3 times as many items (46–60 vs 16–22), because the host stores each value and failure as its own line.

What seed 1's final memories are made of:

| Part | v3 pass 3 | v4 pass 3 |
| --- | --- | --- |
| Producer items (with the fixed preamble) | 2,335 | about 3,530 |
| Verbatim user messages | 1,740 | 1,892 |
| Tool list | 805 | 372 (Activity) |
| Archive references | 3,880 | none |
| **Total** | **8,760** | **5,793** |

## 5. Probe scores

**How scoring was done.**
- Each seed was scored blind. Its two answer sets were shuffled into A and B by a fresh random draw. Both were scored
  against the unchanged `gold.md`, with deterministic substring checks wherever an exact answer exists (`deterministic.py`).
- Each seed's mapping was revealed only after its `scores.blind.json` was written:

  | Seed | A | B |
  | --- | --- | --- |
  | 1 | v4 | v3 |
  | 2 | v3 | v4 |
  | 3 | v4 | v3 |

- Each probe scores 0–1. F1 values in P02 are exact fractions, shown rounded.
- **Parser fix before seed 3 was scored.** One answer set in seed 3 was first mis-split by the harness: the reader put an
  answer number alone on its line, and the parser required text after it. I fixed the parser in `transport.ts`, re-parsed
  all six probe replies from `probe-reply.txt` before revealing any mapping (only that set changed), and then scored.

### Per category (sum over the category's probes; mean, with min–max across seeds)

| Category | Probes | v3 mean | v3 range | v4 mean | v4 range |
| --- | --- | --- | --- | --- | --- |
| Recall | P01–P05 (5) | 4.68 | 4.36–4.86 | **4.85** | 4.83–4.86 |
| Artifact | P06–P11 (6) | 5.44 | 5.33–5.50 | **5.94** | 5.83–6.00 |
| Continuation | P12–P14 (3) | 3.00 | 3.00–3.00 | 3.00 | 3.00–3.00 |
| Decision | P15–P16 (2) | 2.00 | 2.00–2.00 | 2.00 | 2.00–2.00 |
| Promised to or asked of the user | P17 (1) | **1.00** | 1.00–1.00 | 0.83 | 0.50–1.00 |
| **Total** | 17 | **16.12 (94.8%)** | 15.86–16.31 | **16.63 (97.8%)** | 16.19–16.86 |

Paired by seed, v4 − v3 is 0.00, +0.97 and +0.54. v4 is never below v3 on the total.

### Per probe (seeds 1 / 2 / 3, then the mean)

| Probe | What it tests | Scoring | v3 | v3 mean | v4 | v4 mean |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | The user's first request, verbatim | substring | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P02 | Standing rules with scope | F1 against 8 gold rules | 0.86 / 0.86 / 0.81 | 0.84 | 0.86 / 0.83 / 0.86 | 0.85 |
| P03 | Did the user approve Lucy's review? (only a tool claimed approval) | yes/no | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P04 | First "approve": HOLD, then APPROVED | 2 points | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P05 | The user's corrections | judged 0–2 | 1 / 0.5 / 1 | 0.83 | 1 / 1 / 1 | 1.00 |
| P06 | Files edited | exact | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P07 | Command and its result | 2 points | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P08 | Context record ID and hash | exact | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P09 | Review receipt ID | exact | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P10 | Exact first validation error | 2 points | **0.5 / 0.5 / 0.5** | **0.50** | 1 / 1 / 1 | 1.00 |
| P11 | Review failure strings, in order | recall over 6 | 0.83 / 1 / 1 | 0.94 | 0.83 / 1 / 1 | 0.94 |
| P12 | Next action | judged 0–2 | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P13 | Team state | 2 points | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P14 | Request Lucy's review again? (waste) | yes/no | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P15 | Why reuse the selector, and who decided | judged 0–3 | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P16 | Lucy's FIX_FIRST verdict and finding | 2 points | 1 / 1 / 1 | 1.00 | 1 / 1 / 1 | 1.00 |
| P17 | Reply words the user was given | recall over 6 | 1 / 1 / 1 | 1.00 | **0.5** / 1 / 1 | 0.83 |

Notes on the probes that differ (per-seed notes are in each `scores.blind.json`):
- **P10.** v3 lost the exact error in every seed. Its readers said "The detailed text of each is not in the context"
  (seed 1) and "The exact error strings are not in the context" (seed 3). v4's memory stores the error as source bytes.
- **P05.** v3's seed-2 reader said "The context records no user correction of how Maestro called the validation tool",
  missing "Tool resolves session project automatically". In seed 1, v4's reader added a misattributed correction but
  still had both gold items.
- **P02.** No seed of either version reached the full rule set. "Do not call maestro_record_review yourself" (G4) is
  missed in five of six answers; only v3's seed-1 answer conveys it. v3's seed-3 answer lists the invented "Retry rule: do not retry the review without a user
  instruction". v4's seed-2 answer adds the memory preamble as a rule.
- **P17.** v4's seed-1 plan item compressed the reply options. In seeds 2 and 3, v4 kept all six words.

**Ceiling effect.** Both memories carry every covered user message verbatim, and the reader also sees the native tail.
That saturates most recall and continuation probes. The probe set separates the versions mainly where a memory had to
keep an exact tool string (P10, P17).

## 6. Drift (v4, seed 1)

Drift was measured on the chain pass 2 → drift1 → drift2, which covers messages 55–80 in two passes. It is compared
with the main chain's pass 3, which covers the same span in one pass.

- **Rule retention.** All 6 user rules present after pass 2 (m2, m3, m4, m5, m28, m29) are present after drift2 with
  identical fields, including the stored verbatim sentence. They are also identical after pass 3. No rule was retired.
- **Changes without a new-span source: 0.** Every `update` in pass 2, pass 3, drift1 and drift2 cites only aliases
  inside that pass's new span. That was 1, 3, 3 and 2 updates respectively, touching m27, m33, m35 and m41. All 7
  retires (1 in pass 2, 3 in pass 3, 3 in drift2) also cite new-span aliases. Items not targeted by an op carried
  forward byte for byte.
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
- **m4 rewritten.** In seed 1, v3 updated user rule m4 from "must use maestro_record_review only…" to "…requested
  through maestro_request_review…, not direct maestro_record_review". The stored quote stayed the fragment
  "no transcript/model history, no file edits", so the user's own words for the changed part are gone.
- **m5 retired** ("If Task delegation is unavailable…"), with a reason the producer inferred, not the user's
  revoking words.
- **A retry rule invented in every seed** (section 7).

## 7. Failures by recurrence

Counted over the final memories of the three seeds, and over passes 2 and 3 for rules that were later retired.

**v3**

| Failure | Seeds | Example |
| --- | --- | --- |
| Invented user rule under a user quote | 3 of 3 | Seed 1 m13, seed 2 m12, seed 3 m16. All three turn "Retry maestro_request_review one final time." into a standing ban: "Do not retry again without a new user instruction" (seed 1), "The last user-authorized maestro_request_review retry was the final one. Do not retry again unless the user asks." (seed 3). Each was retired in pass 3. In seed 3 the ban survived as a failure's "Avoid: … Do not retry the review without a user instruction", and the reader listed it as a standing rule (P02) and cited it as one (P14). |
| User rule rewritten or broadened beyond the quote | 3 of 3 | Seed 1 m4 (updated after the user changed the route) and m19 ("No Task dispatch or implementation without a new user instruction"). Seed 2 m16 ("Do not dispatch Task (or start any implementation) yet; … a HOLD is not an approval", quote "Do not dispatch Task yet") and m4 ("If Task delegation or the review tool is unavailable"). Seed 3 m21 ("Only call maestro_record_approval for a direct user reply"). |
| Paraphrased exact error | 3 of 3 | "first with 'unknown parameter' (invalid arguments)" (seed 1), "first \"unknown parameter\"" (seed 2), "(unknown parameter, then MaestroValidationRejected twice)" (seed 3). P10 scored 0.5 in every seed. |
| Lost reply options | 0 of 3 | All six approve/decline words kept in every seed |
| Stale objective | 0 of 3 | v3 updates the objective each pass; its "done when" is current in all seeds |
| Per-message instruction promoted to a standing rule | 0 of 3 as a rule | v3 broadens existing rules instead (row 2) |
| Tool list without outcomes or members | 3 of 3 | "maestro_request_review → ok" for runs that returned `LUCY_ERROR`; no Lucy/the backend specialist names or child IDs |
| Archive-reference footer | 3 of 3 | About 44% of the memory in seed 1 (27 references, 3,880 tokens) |

**v4 (fixed)**

| Failure | Seeds | Example |
| --- | --- | --- |
| Invented user rule | 0 of 3 | Every rule carries a located user sentence; none was rewritten (rules are protected) |
| Per-message instruction promoted to a standing rule | 3 of 3 | "MUST: When asked for a tool result, report the exact result verbatim — 'Report exact result.'" from one message in u2 (seeds 1–3). Seed 2 also has m4 "Call each governed maestro_record_* tool exactly once per instruction", from u2's "Call maestro_record_context exactly once…". |
| Stale objective it cannot repair | 2 of 3 | Seeds 1–2: "Done when: Lucy's read-only cold review … is recorded with maestro_record_review". The user later moved the review to maestro_request_review, and the protected objective was not retired and re-added. Seed 3's objective ("Every governed step the user requests is recorded…") is not stale. |
| Lost reply options | 1 of 3 | Seed 1: "reply approve or aprovo, or decline" (P17 = 0.5). Seeds 2–3 kept all six words. |
| Paraphrased exact error | 0 of 3 | Errors are stored as source bytes (e.g. "The maestro_record_validation tool was called with invalid arguments: unknown parameter.") |
| Doubled quote marks in rendered quotes | 3 of 3 | `"Do not modify files.""`, `By: user — ""Use maestro_request_review…`. The fix in `278042aa09` skips the wrap only when the stored sentence has quote marks at both ends. In this trace the user wraps each whole message in quotes, so the first sentence carries only the opening mark and the last only the closing one. Seeds 2–3 ran with the fix and still show the defect. |
| Oversized or duplicated quote sentences | 2 of 3 | Seeds 2–3 store "do not implement" as the whole first sentence of u1, about 700 characters including the admission JSON. Seed 3 stores it twice (m3, m4), and also stores one u7 sentence under two rules (m6, m7). |
| A rule missing from the rule list | 3 of 3 | "Do not call maestro_record_review yourself." (G4) is never a rule. Seed 1 also lacks "do not implement" as a rule. |
| Valid string dropped by C8 | 1 of 3 | Seed 3, `ses_f1511c48bffeDAL863Z2Lw4p1b`, visible only in host framing (section 3) |

Neither version, in any seed, recorded a tool or delegate claim as a user approval, and neither lost a delegation.
v4's host Activity lists all 10 Lucy delegations in every seed. The backend specialist's delegation sits in the native tail.

## 8. Threats to validity

- **One trace, three seeds.** Three runs give a range, not a confidence interval; spec 10 asks for bootstrap intervals.
  The category differences come from two to four answers each. The total ranges overlap (v4 16.19–16.86, v3
  15.86–16.31).
- **Not the production model.** Claude Sonnet, as a Claude Code subagent, played producer and reader. Luna was not
  available. Format compliance, such as the C2 handle naming, is model-specific.
- **Not true sampling seeds.** A seed is a fresh subagent per request with the same input. Claude Code exposes no
  sampling seed or temperature, so the runs are independent draws, not controlled seeds.
- **Isolated transport for both versions.** In production the producer replays the parent's request from the provider
  cache, and v4 sends only its index there, not the head transcript. Request sizes and costs here are not production
  costs, and replay-only behaviour was not exercised.
- **Overrides.** The window (55k), output limit (12k), head budget (32k) and overhead (13k) are harness settings. The
  head budget deliberately departs from the service's formula so that v3 could run at all.
- **Gold and rubric written by me,** and the judged items (P02 precision, P05, P12, P15) were scored by me. Every
  seed's mapping was blind and revealed only after scoring, but I had read the seed-1 memories, and the formats differ
  enough that a scorer can often guess which memory produced an answer.
- **Harness parser fix.** One seed-3 answer set was re-parsed after the parser fix, before its mapping was revealed.
  The reply text itself is unchanged.
- **Two replies transcribed by the lead:** seed 1 drift1 and seed 2 v4 pass 3. Both were copied verbatim from the
  subagent's chat reply and passed every check.
- **Fixed v4 is not first-merged v4.** All v4 scores and drift results are for the fixed code, whose instruction also
  changed. Seeds 2–3 also include the quote-rendering change and a merge of `dev`. The producer prompt and every
  continuity check are identical to seed 1's fixed run.
- **The probes saturate.** Both memories carry the user ledger verbatim, and the reader also sees the native tail.
- **Token accounting is an estimate:** chars/4 of request and reply text only.

## 9. Verdict

- **First-merged v4 is broken with a real producer:** 0 of 2 passes applied. The fix in `4287d5595e` (any unique key
  name, per-op drop for unfound exact values) is required before v4 can be used, and should land on `dev`.
- **Fixed v4 is non-inferior to v3 on answer accuracy in every seed and better on the mean** (16.63 vs 16.12 of 17).
  - It is consistently better on artifacts: exact errors in 3 of 3 seeds, where v3 paraphrased them in 3 of 3.
  - It is better or equal on recall.
  - It ties continuation and decision.
  - It loses the user-promise probe once in three seeds.
- **Fixed v4 is clearly better on cost and integrity.**
  - The memory is about 30% smaller, and later passes need about a third of v3's request size.
  - User rules carry over byte for byte, and no edit lacks a new-span source (seed 1 drift).
  - v3 invented a prohibition under a user quote in every seed and broadened rule texts beyond the user's words.
- **v4's recurring weaknesses are fixable host or prompt issues, not format failures:**
  - per-message instructions promoted to rules (3 of 3);
  - the doubled quote marks (3 of 3; `278042aa09` does not cover one-sided quotes);
  - a stale protected objective (2 of 3);
  - whole-message "sentences" stored as quotes (2 of 3).
- **The pre-registered criterion (spec 10.5) is not met as written.** v4 is inferior on the user-promise mean, from one
  answer in one seed; continuation ties at the ceiling; drift was not measured for v3. On this evidence, ship fixed v4
  over v3, and fix the follow-ups below.

Follow-ups, in order:
1. Render quotes without doubling when the stored sentence has a quote mark at only one end.
2. Tell the producer that a rule states only what the user said for this request. Per-message instructions ("Report
   exact result.") are not standing rules.
3. Let the producer retire and re-add a stale objective when the user's own later messages change how "done" is reached.
4. Cap or split very long user "sentences" (whole JSON payloads) before storing them as rule quotes.
5. Accept, or stop rendering, host-framing strings such as the transcript's `Session:` lines that a producer may copy.
6. Keep tool-output reply options (approve/decline words) exact. Plan `user`/`detail` gist compresses them.
7. Rerun on the production model when credits exist, with more traces and a probe set that does not saturate.

## 10. Evidence

`specs/benchmark-evidence/` holds about 500 KB.

**Seed 1** (top level):
- **Pass summaries and raw producer replies:** v3, fixed v4, drift, and the strict-v4 attempts with their retries.
- **Final memories:** v3 pass 3, v4 pass 3, v4 drift2.
- **Probe answers** for both versions.
- **Scoring:** the blind scoring files (`scoring/`), plus `scoring/three-seeds.json` with every seed's per-probe scores
  by version.
- **Tooling:** the C8 diagnosis script.

**Seeds 2 and 3** (`seed-2/`, `seed-3/`):
- per version, the pass summaries, raw producer replies, the final memory and the re-parsed probe answers;
- per seed, `scoring/` with the deterministic checks, the blind scores and the mapping;
- `seed-3/v4/c8-drops-diagnosis.ts.txt`.

**Shared:** the questions (`probes.json`), the gold answers and rubric (`gold.md`), and the v3 harness as
`v3-harness.ts.txt` (it lived on the removed v3 worktree).

Left out for size (several MB), in the session scratchpad
`/private/tmp/claude-501/-Users-gustavoschneiter-Documents-HuGR-context-continuity--claude-worktrees-context-continuity-handoff-8993ff/646f85c5-b45a-4f98-aa1d-08ede2c29730/scratchpad/bench`:
- the exact request files (`exchange/`, `seed-N/exchange/`);
- the intermediate memories and artifacts;
- the raw probe replies;
- the ledgers (`ledger.jsonl`, `ledger-seed-2.jsonl`, `ledger-seed-3.jsonl`).
