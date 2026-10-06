# Context Continuity v4: code review

Reviewer stance: cold, adversarial. Subject: `2b733d5770..38149b2c59` on `continuity-memory-v4`
(bc43a25105, 38149b2c59). Contract: `specs/context-continuity-format-v4.md` revision 3.

**Verdict: FIX_FIRST.**

## Method

- Read the whole spec, the full diff, and every touched source file. Traced each check C1–C13 and
  each render rule in code, not by test name.
- Ran the continuity scope (`src/continuity test/continuity test/tool/context-recall.test.ts
  test/session/continuity-*.test.ts`) at both commits with the JUnit reporter: 262 → 238, both
  green. Also ran `test/tool/task.test.ts` (25 pass) and the new `prompt.test.ts` case (pass).
- Mutation and probe runs. Each was restored with `git checkout`, and `git status` is clean.

| # | Mutation or probe | Result |
| --- | --- | --- |
| M1 | `indent()` in `memory.ts:342` made the identity function | **Survived**: 145/145 in `test/continuity` |
| M2 | C7 "revoking words in the new span" filter removed (`memory.ts:286`) | Killed (C7 test) |
| M3 | C6 "exactly one sentence" (`hit.size !== 1`) removed (`memory.ts:292`) | Killed (C6 test) |
| M4 | C10 live-`needs` check disabled (`memory.ts:162`) | Killed (C10 test) |
| M5 | `userText` command-invocation branch removed (`alias.ts:40`) | Killed (alias and C6 tests) |
| M6 | `task` and `maestro_request_review` removed from `PROTECTED` (`masking.ts:11`) | Killed (masking test) |
| M7 | Activity "never trimmed while running" pin forced to `false` (`memory.ts:442`) | **Survived** |
| M8 | C2 top-level extra-key check removed (`memory.ts:79`) | **Survived**: 145/145 |
| P1 | `update m2 {status: done}` citing only `a3`; `update {status: confirmed}` citing only `a3` | **Accepted** (C-R5) |
| P2 | Foreground `task` resumed on the same `task_id` in a later span | Unchanged item's bytes change `(t4 jimmy · …)` → `(t4 · …)` (C-R7) |
| P3 | Ledger at ceiling 8,000 with ten 3,000-character user messages | **7 entries** kept; spec promises at least 8 (C-R9) |
| P4 | `{"ops":[]}` first pass over a one-sentence head via `run()` | C12: "~291 tokens, over the ceiling of 206 … retire without a quote: none"; retry also fails (C-R4) |

## Findings

### C-R1 · MAJOR · `fork.ts:165`, `fork.ts:176`, `fork.ts:156`, `service.ts:326-329`, `service.ts:192`

**Problem.** Every early `return` in `run()` yields `undefined`. The service then reports
`invalid-artifact` and calls `outcome(false)`. That covers four cases: no positive ceiling, an
isolated request over the input limit, a workflow provider, and a retry skipped because it would
exceed the input limit (item 11). Spec 2.6 says that with no positive ceiling "no pass runs" and
masking applies as today. Spec 2.7.2 says only a failed retry counts toward the breaker. Once
`failures` reaches 3, `schedule` returns at `service.ts:192`, before the masking step, so masking
also stops for the session until an edit or revert.

**Failure scenario.** The user sets `continuity.trigger: 0.15`, which `settings()` accepts. Then
`(trigger − PREPARE_MARGIN) × window ≤ 0`, so the ceiling is always ≤ 0. After three turns past
the trigger, the breaker opens and masking stops for good. A trigger of 0.3 on a 200K window gives
30K minus overhead (typically 15–25K) minus the protected tail, which is also usually ≤ 0. v3's
ceiling did not depend on the trigger, so this is a regression. At the default trigger, a protected
tail with two or three large unmasked reads in the last 8 messages trips the breaker the same way.
The protected tail is over-estimated by JSON (see C-R2).

**Smallest fix.** Return a tagged skip from `run` (for example `{ skipped: "no-ceiling" | "input-limit"
| "workflow" | "retry-over-limit" }`). The service logs it as a diagnostic and does not call
`outcome(false)`. Count only check failures that survived the retry, or had no retry because the
retry would not fit.

### C-R2 · MAJOR · `fork.ts:159`, `fork.ts:161-164`

**Problem.** The second ceiling term is `sent(head) + previous`, where `sent` is
`Token.estimate(JSON.stringify(stored WithParts))`. That counts storage fields the provider never
sees:

- message `info` (ids, tokens, cost, path);
- bash `metadata.output`, which duplicates `output` (`shell.ts`, `metadata: { output: last || preview(output) }`);
- edit `metadata.diff`, plus `metadata.filediff.patch` (the same diff again), plus `metadata.diagnostics` (`edit.ts:181-207`);
- part ids and times.

Spec 2.6 says this term "guarantees that every swap shrinks the context". As measured, the term is
roughly 2–3× what the swap actually removes on tool-heavy heads.

**Failure scenario.** A long first catch-up on a 1M window, so the first term is not binding. The
head is 32K of JSON-estimated tokens and about 12K of real model tokens (bash and edit heavy). The
ceiling becomes `32K + P`. The ledger budget (`ceiling/4`) and the Activity budget (`ceiling/8`)
grow with it and re-admit older omitted user messages and commands, about 12K. That is before the
producer adds any items. The swap removes about 12K and adds 12K or more, so the context does not
shrink and the convergence argument in section 9 is false.

**Smallest fix.** Measure the head and the protected tail in the units the parent request uses:
the model-message projection with masks applied, not the storage JSON. One option is
`Token.estimate(JSON.stringify(MessageV2.toModelMessages(applyMasks(…))))` or the same converter
`LLMRequestPrep` uses. Add a test whose head carries a large edit diff in metadata.

### C-R3 · MAJOR (pre-existing code; it falsifies the v4 convergence claim) · `service.ts:258`, `fork.ts:95-101`

**Problem.** `headBudget = min(32_000, inputLimit/2)`, and `snapshot()` only takes whole user turns
whose archive transcript fits that budget. A single user turn whose transcript is over 32K never
fits. On the next pass `end === start`, so there is no snapshot, and coverage stalls permanently
(`no-current-snapshot`). The replay transport does not send the head transcript at all: only the
index is appended. So the cap protects nothing on the path that is used whenever a parent request
exists. Passes also run at most once per completed user turn, and a turn in flight across a swap is
discarded as `stale-request`.

**Failure scenario.** A 1M-window session. One autonomous turn reads about 30 files (over 32K of
transcript). Maintenance covers the turns before it and then never advances. The context grows to
native compaction, so "a long first catch-up converges" (spec 9, 2.6) does not hold.

**Smallest fix.** When a replayable parent request exists, do not cap the head by transcript size.
The index is what the request carries, and its cost is bounded per line. Otherwise, allow one whole
oversized turn when the isolated request still fits `inputLimit`. If this is deferred, amend spec
section 9 and record it as a known limitation.

### C-R4 · MINOR · `memory.ts:164-172`; fixtures `memory-fixture.ts:58`, `memory-fork.test.ts:24`, `fork-replay.test.ts:19`

**Problem.** The fixed scaffold (preamble, 9 headings with `(none)`, the ledger and the end line) is
about 290 tokens and is not retirable. With a small head on a first pass, the ceiling (`head + 0`)
is below the scaffold. C12 then fails with "Items you can retire without a quote: none", the retry
cannot comply, and the failure counts toward the breaker (C-R1). The three fixtures were padded
with `"historical context ".repeat(1_000)` to make the existing tests pass, not to test this case.

**Failure scenario.** This is P4. In practice it happens when the first turn is short and the next
turn exceeds the head budget (C-R3): three such turns open the breaker.

**Smallest fix.** Exempt the fixed scaffold from the second term (`head + previous + scaffold`), or
skip the pass without a failure when the empty render already exceeds the ceiling.

### C-R5 · MAJOR · `memory.ts:151-155`

**Problem.** C9 is checked against the item's accumulated `src`: inherited sources from earlier
passes plus located aliases. It is not checked against the sources of the op that makes the item
`done` or `confirmed`. Spec C9 and 7.3 ("update m7 {status: confirmed} citing a t or u source")
require the op to cite the evidence. Plan items are normally added citing the user's request
(`u1`), so C9 never fires for them again.

**Failure scenario.** This is P1, and it was accepted. `{"op":"update","id":"m2","src":["a3"],"fields":{"status":"done","detail":"I think it works"}}`
renders `DONE … (u1, t1, a3)`. A hypothesis first cited to `t1` becomes `Confirmed` on assistant
text alone. This is the "inference recorded as fact; done with no evidence" failure C9 exists to
prevent.

**Smallest fix.** When an add or update sets `status` to `done` or `confirmed`, require
`op.src` (plus that op's located aliases) to contain a `t` or `u` alias. Add the P1 cases as
negative tests.

### C-R6 · MAJOR · `session/prompt.ts:1480-1492`, `continuity/alias.ts:35-44`

**Problem.** In subtask mode (`agent.mode === "subagent"` or `cmd.subtask === true`), the parent's
user message holds only a `subtask` part. The marked template text part is never persisted, so
`userText()` returns `""` and the typed invocation gets no `u` alias. Spec 2.4 requires the
invocation to be user text. `SubtaskPart` keeps neither the arguments nor any metadata.

**Failure scenario.** The user types `/review-pr 42 não faz merge sem eu aprovar`, and the
`review-pr` command runs a subagent. The user's words are missing from the ledger and cannot be
quoted (C6). A `must_not` rule cannot be recorded, because C7 needs a `u` alias and the only alias
is the `task` call's `t`. This is exactly the class of user constraint v4 exists to keep.

**Smallest fix.** On the subtask path, persist the invocation alongside the subtask part as an
`ignored: true` text part carrying `metadata.source = {type: "command", invocation}`. `userText`
already accepts it. Check `onlySubtasks` in title generation. Add an alias test for a subtask
command.

### C-R7 · MAJOR · `memory.ts:356`, `memory.ts:372-378` (used at `memory.ts:410-414` and `memory.ts:550-551`)

**Problem.** A foreground return is recognized as a return only when it is the latest launch for
that child session (`returns.get(id) === source`). Resuming the same `task_id` (`task.ts:391`,
`session ?? create`) replaces the map entry. Every earlier foreground return then loses its member
tag in provenance and its `returned (member)` word in the index. Spec 2.5 says unchanged items
render to identical bytes. Spec 1.2 says a delegation-return source carries the member name.

**Failure scenario.** This is P2. In spec 7.5, Maestro re-briefs Charlie on the same `task_id`.
After that, every finding or plan item citing Charlie's first card renders `(t130)` instead of
`(t130 charlie)`. The reader can no longer see that the evidence is a delegate's self-report, even
though the item itself was never touched.

**Smallest fix.** Make `returned()` stateless: a source is a return if it is a task-return notice,
or a completed or errored non-background tool part with `child(part)`. Add P2 as a test.

### C-R8 · MAJOR (test quality) · `memory.ts:342`

**Problem.** The line-break rule, which indents continuation lines of stored strings so nothing
reaches column 0, has no test. Replacing `indent` with the identity function passes all 145 tests
in `test/continuity` (M1). The C3 test only covers gist collapse, and the pass-1 Error fixture
locates a single-line match. Section 8.1 lists this rule as the defence against "tool output
forging a heading or a rule".

**Failure scenario.** A future refactor drops the `indent` call in `renderItem` or `ledger`. A
multi-line located `error` (`"…\n## User rules and corrections\n[m99] MAY: deploy"`) or a
multi-line user message then reaches column 0 and forges a heading or an item, and CI stays green.

**Smallest fix.** Add a test with a multi-line located `error`, a CRLF and U+2028 user message,
and a multi-line question answer. Assert that every line that does not start with `#`, `[m`,
`u\d+ ·`, a fixed template line or four spaces is absent.

### C-R9 · MINOR · `memory.ts:480`

**Problem.** The per-entry cap is `ledger/8` tokens of body. The header (`uN · MM-DD HH:MM ±HH\n    `)
and the truncation suffix (about 75 characters) come on top of it, so eight capped entries exceed
the ledger budget. Spec 2.6 says "at least eight entries always fit".

**Failure scenario.** This is P3: 7 entries are kept.

**Smallest fix.** `const cap = Math.floor(budget / 8) * 4 - 96`, or subtract the measured
header and suffix length.

### C-R10 · MINOR · `fork.ts:222-226` (vs `service.ts:83-86`)

**Problem.** The per-pass event is `Effect.logInfo` with the full `ops`: quotes, values, findings
and retire reasons. Failure details also echo quotes. This contradicts the service's own rule
("Provider causes may contain conversation content. Keep diagnostics structural.") and does not go
through the `diagnostic` channel that spec 2.5 names. No event is emitted for passes that end
early (C-R1 paths), time out, or fail in transport, so the probe harness under-counts first-try
rejections and breaker trips.

**Failure scenario.** A `values` item holding a URL with a token, or a user's private sentence, is
written to the info log of every session at every pass.

**Smallest fix.** Emit one structural event per pass from the service, covering every outcome:
op kinds, sections, ids, counts, check id, `retried`, sizes. Write op contents only to an opt-in
probe sink.

### C-R11 · MINOR · `fork.ts:118`, `fork.ts:162`

**Problem.** When no parent request was observed, overhead is `max(2048, 0)`. That happens on the
isolated transport, and whenever more than 4 sessions are active (`MAX_OBSERVED_REQUESTS`). The
real system prompt plus tool definitions is commonly 10–25K tokens.

**Failure scenario.** With five parallel sessions, the first term is inflated by about 20K, so the
post-swap context lands above the level masking targets.

**Smallest fix.** Fall back to measuring the agent's system prompt and the registered tool
definitions, or skip the first-term relief when no request was observed.

### C-R12 · MINOR · `fork.ts:127-143`

**Problem.** In the isolated transport, the transcript is keyed by `msg_…` and `prt_…` ids, while
the index and every check use `u`, `a` and `t` aliases. The producer has to map the two by
160-character snippets or by `signature()`, which is ambiguous for repeated commands such as
several `bun test` runs.

**Failure scenario.** The producer cites `t12` (the first `bun test`, exit 1) for "tests pass" when
the passing run is `t19`. Provenance is wrong but passes C4 and C9.

**Smallest fix.** Prefix each transcript message and tool section with its alias from `aliases()`.

### C-R13 · MINOR · `memory.ts:542`

**Problem.** An index line for a `question` answer looks like any other user message
(`u52 … "Yes"`). Spec 1.2 renders `· answer to t51` in the ledger, but the producer is never told
which question the answer belongs to.

**Failure scenario.** "Yes" is recorded against the wrong question, or as a free-standing
permission.

**Smallest fix.** Append ` · answer to ${source.answers}` to `u` index lines when it is set.

### C-R14 · MINOR (coverage lost or never added)

**Problem.** Several guards have no test.

- The Activity "never trimmed while `running`" pin (M7 survived).
- The C2 top-level shape check: `{"ops":[],"extra":true}` is accepted when line 79 is mutated (M8 survived).
- The v3 C13 decode cases: 9 snapshot mutations (missing boundary, tailStart inside the head,
  empty head, shifted tail, duplicated head message, foreign session, foreign part, producer equal
  to parent) are now 2.
- The `0 / −1 / NaN / Infinity` ceiling guard at `memory.ts:71-72`.
- The `/* comment */` and escaped duplicate-key (`"what"`) C1 inputs.

**Failure scenario.** A refactor of `within()` or `validSnapshot` silently loses one of these
guards with CI green.

**Smallest fix.** Restore those inputs as table cases in the C1, C2 and C13 tests. Add a running
delegation to the Activity trim test.

### C-R15 · MINOR (test passes for the wrong reason) · `test/tool/context-recall.test.ts:170-171`

**Problem.** The cross-session assertion asks the foreign session for `a1`. The foreign seed's
assistant message has no text part, so `a1` does not exist there, and the result is `unavailable`
whatever recall does across sessions.

**Failure scenario.** A change that resolved aliases against the caller's parent session, or
against any session, would still pass this test.

**Smallest fix.** Ask the foreign session for `u1`, which exists in both sessions. Assert that the
content is the foreign session's text and that `ZX-19` is not in it.

## Implementer's resolutions (items 1–12)

| # | Resolution | Judgment |
| --- | --- | --- |
| 1 | Markers in `metadata.source` on text parts | **Accept.** `TextPart.metadata` already exists and persists (prompt test). An API client can forge one, but it can forge any user text the same way. The gap is subtask mode (C-R6). |
| 2 | Task-return marker also carries `state` | **Accept.** It is used only for the producer index word. It never reaches the reader view. |
| 3 | Overhead measured from the observed parent request, 2048 floor | **Accept with C-R11.** Subtracting the memory from the system parts is correct. The no-request fallback understates overhead. |
| 4 | Protected tail = region no pass can cover, masks applied | **Accept.** Passes can cover turns inside the last 5 user turns, so the spec's "and the last 5 user turns" is wrong in the spec, not in the code. The JSON measurement over-estimates (C-R2) and feeds C-R1. |
| 5 | Archive no longer gates memory | **Accept.** The memory holds no archive ids, and alias recall reads stored messages. Masks still depend on the archive, which is unchanged behaviour. |
| 6 | Isolated transport: 4.1 as system, memory + transcript + index in the user message | **Accept with C-R12.** `request.ts:68,94` confirms `agent.prompt` becomes the system prompt for maintenance. |
| 7 | Activity, ledger and coverage recomputed from full stored history each pass | **Accept.** It is equivalent to "merged, latest wins", deterministic, and consistent with `context_recall`. |
| 8 | Located alias added to `src`; C7 on the producer's own `src` | **Accept for C7**, which is stricter than the spec. **Reject the consequence for C9**: accumulated `src` hollows C9 (C-R5). |
| 9 | Smaller rendering choices | **Accept**, except C-R13. `launched (member)` in the index is an improvement. |
| 10 | Diagnostic event | **Reject as built** (C-R10): wrong channel, content-bearing, and not one per pass. |
| 11 | Retry skipped when it would exceed the input limit | **Accept the skip.** **Reject counting it** toward the breaker (C-R1). |
| 12 | v3 `responseSchema` removed, no replacement | **Accept.** C1 plus one retry covers it. The v4 grammar would need a large per-section union. Nothing else depended on the schema (`continuity-request.test.ts` updated). |

## Areas checked with no finding

- **C1–C13 traced in code.** C1 is `reduce` plus `parseTree`/`uniqueKeys`. C2 is `shape`, plus the
  `needs` handle check at line 88. C3 is line 128. C4 is line 91. C5 is lines 94-103. C6 is
  `quote`, with `fold` and `sentences`. C7 is lines 112-116 and 136. C8 is `exact` and `raw`, with
  `KEY_ARGS` and the line-break rejection. C10 is lines 159-162. C11 is line 102. C12 is lines
  164-172. C13 is `validSnapshot` plus `service.ts:331-342`. The only weakened check is C9 (C-R5).
- **Authority.** Command expansion: the marker is set after `resolvePromptParts`, and only the
  invocation counts. Plan-mode and build-switch reminders, `@file` attachments, agent parts and
  "Summarize the task tool output" are all `synthetic` and excluded. Question answers come from
  `metadata.answers`. Task returns are `t` aliases, never `u`. A member session renders the
  Delegator headings and preamble. No path turns tool, assistant or delegate text into a `u`
  source, except the subtask omission in C-R6, which is a loss, not an escalation.
- **Column 0.** Gist fields are collapsed. Quotes are single sentences, and `\r` and U+2028 are
  indented. Ledger bodies are indented. Activity uses `signature()`, `oneLine` and `cut`.
  Provenance is host-written and appended last. Today no stored byte reaches column 0; the guard is
  simply untested (C-R8).
- **Cache.** `artifact.text` is stored and injected byte for byte (`context.ts:37`). Nothing
  re-renders between swaps. The replay keeps the parent prefix (`prompt-http` prefix-equality
  assertion retained), and the retry appends after it.
- **Effect.** The retry runs inside the same 180 s timeout and scope. An interrupt during the retry
  is classified `cancelled` and not counted. Generation, `safe` and boundary rechecks, and
  `isCurrent` after `run`, are unchanged, and a new test covers history growing during a pass. The
  stale-request path is unchanged.
- **Outside continuity.** `command()` only adds metadata to the persisted template part.
  `task.ts` inject adds metadata to an already-synthetic part. `context_recall` hash recall uses
  the same code path, with the pattern widened. Alias recall loads only `ctx.sessionID`. The
  question tool is unchanged; recall projection now adds `answers`. The `context_recall`
  description bytes changed, which is a one-time prompt-cache prefix change at upgrade.
- **Over-engineering.** None found. Each added mechanism maps to a spec clause.

## Deleted v3 tests and where their coverage went

Runtime count: 262 → 238. 55 runtime cases were removed and 31 added. 29 of the removed cases are
parametrized C1/C2 inputs folded into two tests.

| Deleted v3 test (file) | Coverage now |
| --- | --- |
| G1 missing middle continuation … declines before LLM streaming (`memory-boundaries`) | Removed by design (item 5). Its replacement is "a missing/corrupt archive fragment leaves memory and alias recall intact". |
| active reference missing / corrupt prevents pruning; repaired bytes restore stored context ×2 (`service-capability`) | Inverted by design: "a missing / corrupt archive fragment leaves memory and alias recall intact" ×2. |
| caller capacity counts the rendered block; there is no size target (`memory`) | C12 test (size−50 rejects, size+400 accepts). **Lost**: the exact token boundary and the invalid-ceiling inputs (C-R14). |
| checks raw assembled input, native parent reserve and output capacity, allowing memory above 6000 (`memory-fork`) | "the ceiling is derived from the trigger and the head …" (output-limit independence, C12 against the head, no positive ceiling, `input: 10_000` decline) and "the parent's system and tool definitions count against the ceiling". **Lost**: observed parent tokens near the limit (195K) and the `context 21K / output 20K` input-limit case. |
| closed transport becomes historical Markdown with host coverage, item IDs and references (`memory`) | "pass 1 renders the fixed template …" |
| constraints carry the user's exact words, checked against the archive (`memory`) | C6 test and pass-1 test (whole-sentence rendering). |
| durable Markdown fragments … survive reference retirement (`working-memory-acceptance`) | Same test, renamed "… survive memory retirement". |
| field values are single lines, so producers cannot forge template lines or item IDs (`memory`) | C3 test (gist collapse). **Not covered**: the line-break indent rule (C-R8). |
| host collects verbatim user messages and tool calls from covered history (`memory`) | Pass-1 test (ledger, Activity) and "ledger and Activity trim oldest-first …". |
| host coverage must match real own-session messages and a whole tail turn, 9 cases (`memory`) | C13 test, 2 cases. **Lost**: 7 cases (C-R14). |
| host reference labels cannot inject Markdown links, headings or HTML (`memory`) | Removed with references. The analogous column-0 guard is untested (C-R8). |
| native schema mirrors the closed operation contract … (`memory`) | Removed with `responseSchema` (item 12), no replacement. |
| objective and constraints retire only with the covered user turn that changed them (`memory`) | C7 test (new-span revoking words; `may` exception). |
| prepare rechecks entry/generation/artifact after held archive ×5 (`memory-prepare-race`) | Removed: `prepare` no longer awaits archive reads. The "after held model" ×5 cases remain. |
| reader accepts version 3 only … (`memory-context`) | "reader accepts version 4 only …" |
| reference retirement preserves real recall; append-only publication … (`service-capability`) | "memory aliases recall exact sources; append-only publication …" |
| references must belong to the supplied own-session inventory (`memory`) | C4 test (unknown aliases, aliases after the span, `m1` as src). |
| rejects input outside the operation contract ×21 (`memory`) | C2 test (about 18 op-level inputs) and the C1 test. **Lost**: top-level `{}`, `{"ops":{}}` and the extra top-level key (M8 survived; C-R14). |
| request is natural Markdown prior memory plus only the displaced archive chunks (`memory-fork`) | "isolated request carries the prior memory, the new span transcript and the index". |
| requires complete JSON without duplicate keys ×8 (`memory`) | C1 test (8 inputs). **Lost**: the comment input and the escaped duplicate key (C-R14). |
| unchanged items carry forward exactly; updates and retirements touch only their targets (`memory`) | Pass-2 test (byte equality of m1, m3, m4, m5). It does not cover P2 (C-R7). |
| uses only passed head chunks and declines incomplete archive coverage (`memory-fork`) | Archive part removed by design. The `canRecall` part became "declines without recall capability". |

Areas the lead named that keep their tests:

- **Cancellation**: `memory-cancellation`, complete / cancel / cancel-immediate.
- **Held stale A**: `prompt-http` "held HTTP maintenance …".
- **Native compaction**: `memory-boundaries` G1 "every durable source, including pre-compaction history …".
- **Capacity**: `continuity-capacity`.
- **Archive recall**: `service-capability` and `context-recall` hash tests.
- **Prompt-http prefix equality**: the `forkMessages.slice(0, -1)` equals `triggerMessages` assertion is retained.

## Fixes required for APPROVE

1. **C-R1.** Non-pass outcomes and over-limit retry skips do not count toward the breaker; a
   ceiling ≤ 0 skips the pass. Add a service-level test with `trigger: 0.15` that keeps masking
   alive after three turns.
2. **C-R2.** Measure the head and the protected tail in model-message units, not storage JSON.
   Add a test where edit/bash metadata inflates the JSON.
3. **C-R5.** C9 on the op's own sources when the op sets `done` or `confirmed`, with the P1
   negatives.
4. **C-R6.** Subtask-mode commands keep the typed invocation as user text, with a test.
5. **C-R7.** Stateless foreground-return detection, with P2 as a byte-equality test.
6. **C-R8.** A column-0 test that kills M1.
7. **C-R3.** Either size the head by the transport actually used (the replay path does not need
   the 32K transcript cap), or amend spec sections 2.6 and 9 to state that catch-up stalls on a
   turn over the head budget, and track it.

Recommended in the same change because each is a few lines: C-R4, C-R9, C-R13, C-R14, C-R15.
C-R10 to C-R12 can follow.
