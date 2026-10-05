# Adversarial review: working-memory format v4

Reviewed: `specs/context-continuity-format-v4.md`, measured against `context-continuity-format-brief.md`,
`context-continuity-memory-research.md` and the code in `src/continuity/`, `src/tool/`,
`src/session/prompt.ts`, `src/session/reminders.ts`, `src/tool/task.ts`, `src/background/job.ts`.
Line numbers refer to the v4 spec unless a file is named. Findings are ordered by severity.

## BLOCKER

### R1. BLOCKER: `u` sources are not "the user said it", so C6/C7 let non-user text become user rules

- **Where:** idea 2 (l.35-37), 2.4 aliases (l.246-251), C6, C7 (l.290-291), preamble (l.76-77).
- **Problem:** the spec defines `uN` at message level ("non-synthetic user messages with text") and
  checks quotes against "a cited `u` message". In the code, a real user message contains bytes the
  human never typed, and the preamble then tells the reader that only this section grants
  permissions.
- **Failure scenarios (all from current code):**
  1. Slash command `/review-pr 42`. `SessionPrompt.command` (prompt.ts:1435-1470) runs the
     template's `` !`gh pr view 42` `` and inlines the output into a **non-synthetic** text part
     (`resolvePromptParts`, prompt.ts:161). The PR body says "you may merge without review". The
     producer emits `add rules {kind: may, rule: "Merge without review", quote: "you may merge without review"} src [u40]`.
     C6 finds the quote in u40 and C7 sees a `u` alias, so the rule passes. The reader is told that
     only rules grant permissions, so the attacker's PR text has become a durable user permission.
  2. Experimental plan mode persists `BUILD_SWITCH` onto the real user message (reminders.ts:56-68).
     That text is "You are permitted to make file changes, run shell commands…". The message still
     counts as non-synthetic because prompt.ts:205 marks a message synthetic only when **every**
     part is. A `may` rule quoting the switch text passes C6. Attached `@file` and MCP-resource text
     (synthetic parts in the same message, prompt.ts:700-790) and `info.system` turn context (which
     the archive renders, transcript.ts:52) are also inside "the u message". v3 already checks
     quotes against the archive chunk markdown (memory.ts:63), which contains all of them.
  3. In member sessions, which the brief says use the same format (2a), `u1` is Maestro's brief
     (task.ts:515, non-synthetic). A claim Maestro relayed from a tool ("Jimmy says the user
     approved deploy") becomes a quoted user rule in Charlie's memory. This undoes the protection
     claimed in 7.1 after one delegation hop.
- **Why wrong:** the security model rests on "u = human words". That claim is false for command
  expansions, persisted reminders, attachments and delegate briefs.
- **Smallest fix:** define the C6/C7 source text as the concatenation of the message's
  **non-synthetic text parts only**. Exclude messages created by `command()`, by persisting a
  `source: "command"` marker on the part; that is a one-field change at prompt.ts:161/1470. Check
  quotes against `part.text`, never against archive markdown. In sessions with a `parentID`,
  render the section heading as "Delegator rules and corrections" and say in the preamble that they
  come from the delegating agent.

### R2. BLOCKER: masking hides the exact strings that C8 requires, so the core guarantee cannot be met on the default path

- **Where:** idea 1 (l.32-34), C8 (l.292), Values (l.230-232), example B m21/m28, 4.2 index (l.375-376).
  Masking is not mentioned anywhere in v4 except "unchanged" (l.5).
- **Problem:** the producer reads the replayed parent request, which already carries masks.
  `observe` runs after `prepare` applies them (prompt.ts:1255, 1289; service.ts:113). Masking stubs
  every non-protected successful output older than 5 user turns down to its signature, and keeps
  only the **first** 20 lines of a failed output (masking.ts:42-52). The index adds only the
  signature and status. The producer therefore cannot see the bytes that C8 checks against "the
  full archived output".
- **Failure scenario:** job k masks everything older than 5 user turns, including what becomes job
  k+1's head (masking runs first in every job, service.ts:271-284). Synthetic background-task
  notices count as user turns in `candidates`, so in Maestro sessions the cutoff moves fast. In job
  k+1 the head contains: t812 `git rev-parse HEAD` → stub; t744 `gh run view` (exit 0) → stub;
  t20 `bun test` (exit 1, 300 lines, `Expected/Received` at line 240) → first 20 lines. The
  producer wants example B's m28 (`743221e7ea`), m21's error, and example A's m7 error. It either
  fabricates them, and C8 rejects the whole pass (three such passes open the breaker,
  service.ts:47), or it writes the same "facts" as unchecked findings. Example A's m10
  ("built 2026-09-12T08:14:03Z", from t31 read output) is exactly such a fact. Its source is
  invisible, and no check covers a finding. The isolated fallback (fork.ts:153-171) sends full
  archive fragments, so the same session passes or fails depending on which transport ran.
- **Why wrong:** the design's main improvement over v3 (verified exact strings) is unreachable on
  the default path, and the failure mode is systematic, not random, so it trips the breaker.
- **Smallest fix:** C8 checks only bytes the producer was shown: tool input, the stub's retained
  lines, and the index. Extend each index line for a call in the span. For a failed call, append
  the **last** 20 output lines, where test runners and stack traces put the error. For a successful
  call whose output is at most 500 characters (the CliffCompaction rule in the research digest),
  append the output. Otherwise append nothing, and the item cites the alias for recall. Use the
  same rule in both transports. State in the instruction: "copy only strings you can see".

### R3. BLOCKER: the producer cannot reliably map aliases, and delegation returns have no in-span alias

- **Where:** 2.4 (l.246-251), C4, C8, C9, 4.2 (l.375-379), 7.5.
- **Problem:** the replayed conversation carries no alias labels. The producer has to map `tN` by
  counting tool calls in order across a head of up to 32k tokens (`headBudget`, service.ts:265),
  using index lines that are identical for repeated calls. A background return carries the
  **launch** alias. If the launch was covered by an earlier pass, that alias is absent from the
  new-span index, and C4 treats it as old.
- **Failure scenarios:**
  1. The span holds six `read filePath=src/x.ts → ok` calls and four
     `bash command=bun test test/a.test.ts → exit 1` calls. The producer cites t57 for an error that
     appeared in t61. C8 fails and the whole pass is rejected. If both outputs contain the string,
     the wrong alias passes, and provenance time and recall point at the wrong call.
  2. Bobby is launched at t912 (pass 4). His notice arrives in pass 5's span (task.ts:589-606: a
     synthetic user message with `<task id=ses_…>`). The pass 5 index lists no line for it. The
     producer wants `update m36 {status: verify} src [t912]`, and C4 rejects it because t912 is not
     in the new span. If Maestro's reply after the notice has no text (a tool call only), no
     in-span alias exists at all. For Maestro, the primary reader, the most important event (a
     member returns) is the one the format cannot record.
  3. `task_id` resume and `background.extend` (task.ts:624) give one notice for several task
     calls. "The alias of the task call that launched it" picks the oldest call, which is again out
     of span.
- **Smallest fix:** the host locates sources. For C6/C8, the producer gives the string plus an
  alias hint. The host searches the cited message first, then the whole new span (normalized as in
  R13), and stores the alias where the string actually occurs. In the index, list each delegation
  return that lands in the span as its own line (`t912↩ task bobby "…" → returned 21:52`). C4
  counts such a return as in-span.

### R4. BLOCKER: under cache replay the producer often sees the previous-but-one memory while its ops apply to the current one

- **Where:** 4.2 "The replayed context already shows the prior memory with its aliases" (l.378-379);
  C5; C10.
- **Problem:** a parent turn that completes while job k runs is queued as `pending` (service.ts:404-407).
  Its request was observed **before** job k swapped in memory k, so it carries memory k−1. When
  job k finishes, `finish` schedules job k+1 at once with that request (service.ts:230-244, 324).
  `replay()` checks only that the head messages were sent (fork.ts:60-61), and they were, because
  the old request started at the older `tailStart`. The producer sees memory k−1 plus a span it
  does not know was already covered, while `merge` applies its ops to memory k's items.
- **Failure scenario:** pass k retired m6 and added m10–m15. Pass k+1 replays memory k−1. The
  producer updates m6 → C5 rejects (failure 1). Or it re-adds the "cache is stale" finding and the
  build command citing a new-span re-run → **duplicates pass every check**, which breaks "one
  current value per fact". Or it emits `needs: [m9]` for an item it believes is still live. Maestro
  sessions keep the parent busy (background notices start turns), so `pending` is the common case,
  not an edge case.
- **Smallest fix:** store the artifact identity (producer ID or a text hash) next to each observed
  request in `observe`. `replay()` returns undefined unless it equals the current artifact. The
  service then waits for the next parent turn instead of using the isolated path, which keeps the
  owner's "always reuse the cache" directive.

## MAJOR

### R5. MAJOR: a substring quote can drop a negation and turn a prohibition into a permission

- **Where:** C6 (l.290), "what the checks cannot do" (l.299-302), preamble (l.76-77).
- **Problem:** C6 accepts any substring, and the reader sees only the producer's fragment as the
  user's words.
- **Failure scenario:** u2 = "e não faz deploy sem eu aprovar explicitamente". The producer emits
  `add rules {kind: may, rule: "Deploy without asking", quote: "faz deploy sem eu aprovar"} src [u2]`.
  C6 and C7 pass. The rendered line is `MAY: Deploy without asking — "faz deploy sem eu aprovar" (u2)`,
  and the preamble says this section grants permissions. The spec's own caveat covers only
  one-word quotes ("sim"), not dropped negations. Dropped negations are the documented
  constraint-loss mode in the evidence it cites (Compaction Cliff).
- **Smallest fix:** the host renders the **enclosing sentence** of the matched span. Sentence
  boundaries are message start or end, `.`, `!`, `?` and newline. The producer's fragment is used
  only to locate it. The reader then sees "e não faz deploy sem eu aprovar explicitamente". This
  rejects nothing new; example A's "sem mexer no banco" still passes.

### R6. MAJOR: the C4 "new-span source" rule does not prevent drift, and it causes false rejections

- **Where:** idea 3 (l.39-41), C4 (l.288), 7.7 (l.797-798), probe 10.5 bullet 3 (l.959-960),
  rationale citing ACE and Bartlett.
- **Problem:** any update can cite **any** new-span alias, and every pass has some. The host cannot
  check relevance. So "an item cannot be reworded pass after pass" is false, and the drift probe
  "changed without a new-span source: must be 0" is true by construction and measures nothing. The
  real anti-drift mechanism is delta ops plus carrying unchanged bytes. ACE and Bartlett support
  that mechanism, not C4. Meanwhile C4 rejects legitimate ops: late recording of an item the
  previous pass missed, and delegation returns (R3).
- **Failure scenario:** each pass the producer rewrites m17's `finding` citing the newest
  assistant alias (`a88`, then `a97`). C4 passes and the wording erodes anyway. In a different
  pass, the producer adds the error from t24 (an older span), which it missed earlier, citing only
  t24. C4 rejects the whole pass.
- **Smallest fix:** C4 keeps only "every alias exists up to the boundary". Drop the new-span
  clause, the "anti-drift guarantee" wording and the tautological probe. Measure drift from the op
  log as updates per item per pass.

### R7. MAJOR: the C9 self-report rule can be bypassed and also rejects legitimate review work

- **Where:** C9 (l.293), 7.5, 7.6.
- **Problem:** "all sources are task calls to one member" becomes false as soon as **any** other
  alias is added.
- **Failure scenarios:**
  1. `update m50 {status: done, detail: "APPROVE"} src [t130, a131]`, where a131 is Maestro saying
     "Charlie finished, marking done". C9 passes, so the delegate's self-report closes the item.
  2. Charlie's card "all tests pass" is recorded as `findings {status: confirmed}` citing t130.
     C9 restricts only `done` items, so the self-report becomes a "Confirmed" fact.
  3. m53 "Cold review of branch A" is DONE citing only t140 (Lucy's own task). Lucy's verdict
     **is** the deliverable, but C9 rejects it. Example 7.5 has to add an unrelated "Maestro's own
     read t142" to get past the rule.
- **Smallest fix:** drop the single-member clause. Render delegation provenance with the member
  name (`(t130 charlie)`) so the reader can see that the evidence is a member report. Keep `verify`
  as a producer convention. This also reduces producer load.

### R8. MAJOR: `needs` cannot reference an item added in the same pass, and C10 blocks normal replacement

- **Where:** 2.2 (`needs` array of `mN`), C10 (l.294), example A pass 2 `"detail":"Stale card cache (m10)"`
  (l.514), 8.2 row on `supersede.by` (l.860).
- **Problem:** the host assigns IDs after decode, and retired IDs are never rendered (l.164). The
  producer therefore cannot know the next `mN`. The spec rejects `supersede.by` for exactly this
  reason, and then requires the same thing for `needs`.
- **Failure scenario:** m50 (WAITING) needs m45 (Jimmy's finding). A new tool result refines m45.
  The spec's own pattern for this (example A: retire m5, add m10) needs `update m50 {needs: [<new id>]}`.
  The producer guesses `m61` from the highest rendered ID, but m61 is a retired, unrendered ID, so
  the real new ID is m63. C10 then rejects, either because m61 is not live or because m45 is retired
  while still needed. Whether `needs: []` is valid is unspecified, so the last dependency of an open
  item may never be removable. Example A only works because `(m10)` sits in unchecked free text and
  no retirement happened before it.
- **Smallest fix:** pass-local handles. An `add` may carry `"key":"n1"`, and `needs` or text in the
  same pass may cite `n1`; the host rewrites handles to `mN`. Allow `needs: []`. Also render the
  next free ID in the Size block of 4.2.

### R9. MAJOR: Activity misreports in-flight delegations and cannot answer "who is late"

- **Where:** Activity rules (l.157-161), template l.116, C12 trimming, brief 2a ("who is blocked
  or waiting, and what is late"; "must not redelegate work … in flight").
- **Problem:** state comes only from transcript events, the trim is oldest-first, and the sort key
  is ambiguous.
- **Failure scenarios:**
  1. A background job is cancelled (`notify` returns `Effect.void` for non-completed or non-error
     results, task.ts:610-617), or the process restarts. `BackgroundJob` is in-memory
     `InstanceState`. No notice ever arrives, so Activity says `→ running` on every later pass.
     Maestro trusts it and never redelegates, and the work is never done.
  2. Bobby is launched at t912 and runs for two hours. Maestro then makes 300 reads and edits.
     With maxTokens/8 at about 2–4k tokens (see R11), the delegation line is the oldest by last
     touch and is trimmed **while still running**. The probe "who is working on what" fails and
     Maestro redelegates.
  3. "Late" needs the current time. The block has times, but the system prompt has only the date
     (`toDateString()`, session/system.ts:81), so "running since 16:58" cannot be judged late or not.
  4. Example B's Activity is not sorted by last touch: t871 (18:02) sits above a return at 18:31,
     and t751 sits above t810. "Last touch" for a delegation (launch or return?) is undefined.
     `read` lines are re-readable discovery, the same as the excluded globs, and they dominate the
     line count in Maestro and Jimmy sessions.
- **Smallest fix:**
  - Delegation lines form their own group above files and commands and are never trimmed while
    `running`.
  - Render `running` as `no return seen as of {coverage time}`, so the reader knows it is
    unconfirmed.
  - Define the sort key as the latest event time.
  - Drop `read` lines.
  - State plainly that lateness is judged against the coverage time, which is a lower bound on
    "now".

### R10. MAJOR: one large user message empties the whole user-message ledger

- **Where:** User messages rule (l.162-163), C12 ("v3: maxTokens/4"); code memory.ts:159-168.
- **Problem:** `bounded()` walks newest-first and stops at the first entry that overflows. If the
  newest message alone exceeds the ceiling, `start` stays at `entries.length` and the ledger is
  empty.
- **Failure scenario:** the owner pastes a 10k-token CI log as u62, with ceiling maxTokens/4 = 8k.
  The rendered ledger is `u1–u62 omitted`, and all short answers ("pode regenerar", "sim, abre o PR")
  disappear. The brief 2a requirement "never re-ask what the user already answered" fails, and so
  does the probe 10.3 "re-asked answered questions".
- **Smallest fix:** cap each ledger entry (for example its first 1,000 characters plus
  `… context_recall {"reference":"u62"}`), and skip an oversized entry instead of stopping.

### R11. MAJOR: the C12 ceiling is not window-scaled; it is capped by the model's output limit

- **Where:** C12 (l.296) "v3 computation"; code fork.ts:201
  (`maxTokens = min(inputLimit − native − reserve, model.limit.output)`), memory.ts:123-124.
- **Problem:** v3 capped the size by the output limit because a producer once wrote the memory. In
  v4 the producer emits only ops, yet the output cap still bounds the rendered memory, the ledger
  (/4) and the activity table (/8). This contradicts the brief's "window-scaled ceilings" (brief §2,
  §8.5).
- **Failure scenario:** a model with a 200k window and an 8k output limit gives maxTokens = 8k,
  so the ledger gets 2k and Activity 1k (about 30 lines). Items cannot be trimmed: rules need a
  user message to retire (C7), needed items are locked (C10), and DONE items are only retired if
  the producer remembers to. Once the items exceed 8k, every pass fails C12 → breaker → maintenance
  stops → the session overflows. That is the failure continuity exists to prevent.
- **Smallest fix:** remove `model.limit.output` from the memory ceiling (keep it for the fork's
  reply). When C12 fails, the retry (R13) names the overflow and lists the DONE items as retire
  candidates.

### R12. MAJOR: C8's source bytes and normalization are unspecified, and C3 corrupts "exact" values

- **Where:** C3 (l.287), C8 (l.292), Values "exact strings to reuse" (l.230), rendering (l.156).
- **Problems and scenarios:**
  1. If C8 reuses v3's check against archive chunk markdown (memory.ts:63), tool input appears
     JSON-encoded (`json(state.input)`, transcript.ts:118). The value `git commit -m "fix tier"`
     does not occur in that text, which reads `git commit -m \"fix tier\"`, so C8 rejects. Outputs
     are split into 32 KiB chunks (archive-format.ts:7,58-68), so a string that straddles a split
     never matches.
  2. C6 collapses whitespace on both sides; C8 does not. A two-line error
     (`Expected: "Gold"` newline `Received: "Legacy"`), written on one line as the instruction
     requires, does not match the source.
  3. C3 collapses a multi-line command (`cd packages/opencode` newline `bun test`) to
     `cd packages/opencode bun test` and renders it as an "exact string to reuse". Run as written,
     it executes a different command.
- **Smallest fix:** C8 compares against the raw part fields (`state.input` string values,
  `state.output`, `state.error`), with whitespace collapsed and NFC on both sides, as C6 does. A
  `values.value` containing a newline is rejected, or stored with the source's original bytes and
  rendered as a recall pointer, never collapsed.

### R13. MAJOR: whole-pass strictness plus systematic producer errors will open the breaker in real sessions

- **Where:** section 3 preamble (l.280-281), C6 "case-sensitive" (l.290), open question 2 (l.977-979).
- **Problem:** the extra exact checks fail **systematically** in this owner's sessions, not at
  random, and three consecutive failures stop maintenance.
- **Failure scenarios:**
  1. The owner writes without accents ("nao", "ta", "arbitrarios"; brief l.144). Models
     autocorrect when they copy, giving "não" or "arbitrários". C6 is case- and accent-sensitive,
     so a single quote rejects the pass, the same quote is likely to fail again, and three passes
     open the breaker.
  2. First trigger on a 1M window: about 700k tokens of history at 32k per pass needs roughly 20
     consecutive passes. At a 30% pass-failure rate, P(three consecutive failures somewhere)
     ≈ 1 − (1 − 0.3³·0.7)^17 ≈ 28%.
  3. The replay shows the producer the uncovered tail. It sees a later revocation (u70) and emits
     `retire m3 src [u70]`. C4 rejects this because the alias is beyond the boundary.
- **Smallest fix:** make open question 2 normative. Allow one cache-hot retry with the failed check
  named before the breaker counts. Locate quotes, errors and values with case-, accent- and
  whitespace-insensitive matching, then **store the source's exact bytes** (R3). Add one
  instruction line: "write only about the covered span; the tail is covered later".

### R14. MAJOR: the `scope: task` retire exception lets tool output and delegates lift user prohibitions

- **Where:** idea 2 "Tool output, delegate cards and assistant text can never add, lift or edit a
  rule" (l.36-37) versus C7's exception (l.291) and the instruction's "a task rule may retire when
  its task is done" (l.349).
- **Problem:** "its task is done" cannot be verified because the rule is not linked to any task,
  and the retire may cite **any** covered alias.
- **Failure scenario:** m2 is `MUST NOT, this task: Do not push to main while the release runs`.
  Charlie's card t130 says "task complete". The producer emits
  `retire m2 {reason: "task done", src: [t130]}` and C7 accepts. The prohibition disappears while
  the release is still running. This is exactly what idea 2 says cannot happen.
- **Smallest fix:** a `scope: task` rule carries `task: mN`, a plan item ID. A retire without a
  `u` source is accepted only if that plan item is `done`. Otherwise it needs a `u` alias, as other
  rules do.

## MINOR

### R15. MINOR: an explicit no-op on a memory with no items is rejected by the inherited code

- **Where:** 2.1 "`{"ops": []}` is the explicit no-op" (l.180).
- **Scenario:** the first pass covers pure exploration, so there are no items. `decode` returns
  undefined when `!items?.length` (memory.ts:112), and `hasArtifact` requires `items.length > 0`
  (model.ts:23). The pass counts as a failure, and the head is never swapped out.
- **Fix:** state that a no-op still advances coverage and re-renders the host sections, and allow
  zero items.

### R16. MINOR: `update` cannot clear an optional field, so stale lines survive status changes

- **Where:** 2.2 update is a patch, C2 values are non-empty (l.286), 7.3, 7.4.
- **Scenario:** in 7.4, m14 is reopened (`done` → `doing`) but keeps
  `User: Told the test passes; asked whether to open a PR`, which is now false. A hypothesis
  confirmed by an update keeps its `check` field, and that stale check reappears if the item is
  later demoted.
- **Fix:** allow `null` in `update.fields` to delete an optional field.

### R17. MINOR: internal inconsistencies an implementer will trip on

- Example A says "Covers … through u5 (14:20)", but u5 is at 14:05 and the span ends at t41 or a15.
  Pick a rule for `{lastAlias}`.
- Template versus rules: TODO's detail label "Note" never appears in the template; `Done when` is
  shown only for DOING in the template but also for DONE in the examples.
- Migration (l.890-891) refers to "a stored artifact with version: 3", but artifacts live only in
  the in-memory `Map` in context.ts:6. Nothing is stored, and the op log and "replay audit" (7.7)
  are lost on restart.
- context.ts:39 still wraps the block in v3's "Historical working memory follows…" preamble, so the
  reader would get two preambles. The spec does not say to replace it.
- Recall: aliases live in the in-memory artifact, so `context_recall` (a 64-hex `reference` today,
  context-recall.ts:27) needs a dependency on the continuity service. "Launch and return" for a
  delegation are two messages. The trimmed-Activity footer points to `archive_list`, which returns
  hashes, not aliases, so it is a dead end. The "small tool change" (l.976) is understated.
- Evidence: Δ markers are dropped with "same reason" (PI-LLM, l.858). PI-LLM concerns old values
  sitting next to new ones; a marker shows no old value. The cited evidence (shift handover) argues
  for keeping it. The justification is wrong, even if the cut stands.

## Over-engineering summary (from the findings above)

These elements cost producer attention, rejections and code without delivering what they claim:

- C4's new-span clause (R6);
- C9's single-member clause (R7);
- C10's block on retiring needed items when no same-pass handles exist (R8);
- `read` lines in Activity (R9).

Removing or simplifying them lowers the rejection rate (R13) with no loss of protection.

## Verdict: FIX_FIRST

The structure is implementable once the following change; R1–R4 are blockers:

1. R1: define `u` text as non-synthetic, non-command text parts; label delegator rules in member
   sessions.
2. R2: C8 checks only bytes the producer was shown; extend the index with the last 20 lines of
   failed calls and short outputs; use the same rule in both transports.
3. R3: host-located sources; index lines for delegation returns, counted as in-span.
4. R4: replay only when the observed request carries the current artifact.
5. R5: render the enclosing sentence of rule quotes.
6. R6, R7: drop the C4 new-span clause and the C9 single-member clause; add member names to
   provenance.
7. R8: pass-local handles for same-pass references; allow `needs: []`.
8. R9, R10, R11: never trim running delegations; cap ledger entries per message instead of
   emptying the ledger; remove the output-limit term from the memory ceiling.
9. R12, R13: specify C8's raw-field normalization; make one feedback retry normative; use
   accent-, case- and whitespace-insensitive locating that stores the source's bytes.
10. R14: bind `scope: task` rules to a plan item.
