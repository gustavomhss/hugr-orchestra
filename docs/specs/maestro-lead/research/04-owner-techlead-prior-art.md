# 04 — Owner's techlead prior art: lead craft vs Maestro today

Status: research note, read-only study. No code, tests, typecheck or builds were run. No commits.
Date: 2026-10-28. Worktree HEAD: `de5cc963c6`.

## Scope

Track I4 of the Maestro lead study: the owner's own prior art for tech-lead craft over agent teams, which
Maestro does not yet carry.

Sources read in full:

- Owner skills, `TL = /Users/gustavoschneiter/Documents/HuGR/techlead/skills/` (reached through `~/.claude/skills/techlead*` symlinks):
  - `TL/techlead/SKILL.md` (charter, rigor compact, go/no-go, lifecycle, anti-patterns AP-1..AP-6)
  - `TL/techlead-contract/SKILL.md` (contract freeze, anchor code, stubs, seam test)
  - `TL/techlead-decompose/SKILL.md` and `TL/techlead-decompose/SUITE-REVIEW-BRIEF.md` (test-first decomposition, sweet spot)
  - `TL/techlead-loop/SKILL.md` (rolling scheduler, SEAL, post-flight sweep, integration, cleanup)
  - `TL/techlead-pack/SKILL.md` (dispatch packet, relay arm, budgets, return firewall)
  - `TL/techlead-verify/SKILL.md` (L0-L10 levels, V1-V4 checklists, verdicts)
  - `TL/techlead-repo-maintenance/SKILL.md` and `TL/techlead-repo-maintenance/REVIEWER-BRIEF.md` (PR budget, cold review, never-list, CI scope)
  - `/Users/gustavoschneiter/.claude/skills/agent-dispatch-and-landing/SKILL.md`
  - `/Users/gustavoschneiter/.claude/skills/instrument-calibration/SKILL.md`
- Orchestra Maestro, relative to worktree root `WT = /Users/gustavoschneiter/Documents/HuGR/orchestra-canonical/.claude/worktrees/maestro-orchestration-skills-e8a06d/`:
  - `WT/packages/core/src/agent/prompt/maestro.txt` (104 lines; "MP")
  - `WT/modules/maestro/coordination/playbooks/**` (`maestro-run` with `loop`, `governed`, `verify`, `verify/review-checks`; `maestro-repo` with `maintenance`, `maintenance/reviewer-brief`, `arsenal-operators`; `maestro-plan`; `frame-request`) ("PB")
  - `WT/modules/maestro/coordination/src/seats/prompt/backend.txt` and `lucy.txt` (execution and cold-review seat contracts)
  - `WT/packages/core/src/tool/task.ts`, `question.ts` (existence only; tool descriptions not read in depth)

Method. Each owner rule was classified LEAD (what the lead does at dispatch, return, landing, cleanup, reporting)
or PLANNING (decomposition, acceptance-suite authoring, contract freeze, sizing). In Orchestra, planning belongs
to native `archie` (MP:8-10, 38; PB `maestro-plan/SKILL.md`:8-10). PLANNING rules are listed because the lead
must still verify their output, but they are candidates for the archie seat, not for Maestro's prompt.

Orchestra-specific strengths that the owner skills lack, for balance: host-graded `relay-arm` per Task completion
with a retry budget and parking (PB `maestro-run/loop/SKILL.md`:65-68); the governed approval chain with exact
approval binding (PB `maestro-run/governed/SKILL.md`:18-83); a separate cold-review seat `lucy` (`lucy.txt`);
explicit approval-record semantics (MP:91-93; governed step 11).

Tool naming. Owner rules name Claude Code and Arsenal-MCP tools: `Agent`, `SubagentStop` hook, `Read` of
transcript JSONL, `gh`, and the `techlead`/`relay`/`context-budget-guard`/`transcript-firewall`/`model-router`
family. Orchestra equivalents are `task` (seat dispatch), `question`, `maestro_arsenal_*`, `maestro_*` governed
tools, `context_recall`/`context_compact`, and host-graded `relay-arm`. The translation column notes each case.
No `board_*` tool name appears in `MP` or `PB` (grep, 2026-10-28), so no board translation is asserted here.

## Lead rules inventory

Legend. Lead / Planning as defined above. "Present" means the rule is stated in Orchestra text at the cited
location. "Partial" means the principle is there but a concrete element is missing. "Absent" means no citation
found. Citations: `MP:n` = maestro.txt line n. `PB:path:n` = playbook file line n.

| # | Rule (owner summary) | Owner source | Lead / Planning | In Maestro today | Translation needed |
|---|---|---|---|---|---|
| 1 | Lead chews the packet before dispatch: target files, consumer surface, baseline SHA, pattern snippets, gate commands; "never go find it" | `TL/techlead-pack/SKILL.md` "dispatch packet" items 1-9 | Lead | Partial. Seat side forbids discovery and demands a packet with acceptance, write paths, checks (`backend.txt`, "Working method" 1 and 3). Lead side: `PB:maestro-plan/SKILL.md`:14-16 pins baseline and hands facts to archie. No Maestro rule to compute consumer surface or pin gate commands in the brief. | Map to `task` brief shape (MP:38 says the tool lists brief shape); `writePaths` (MP:38) |
| 2 | Every fork pre-decided before dispatch; "zero decisions left to the agent" | `TL/techlead/SKILL.md` §1, §0.5 #1; `TL/techlead-verify/SKILL.md` V1 pre-dispatch | Lead | Partial, and contrary in part. `PB:maestro-run/review-checks/SKILL.md`:26-27 lists "explicit decisions/latitude" as a V1 item (it is not "zero"). `PB:maestro-run/loop/SKILL.md`:15 says "No deterministic zero-decision promise". Backend seat "Not yours" list (`backend.txt`) makes architecture and scope decisions the packet's job. | Decide whether to adopt "zero decisions" as a checkable V1 item or keep Orchestra's softer stance (see Open questions Q6) |
| 3 | Go/no-go: disjoint slices; eliminate the shared file before fan-out; sequential if neither disjoint nor contract-bound | `TL/techlead/SKILL.md` §1 (items 1-3); `TL/techlead-decompose/SKILL.md` Step 3.2-3.3 | Planning (decompose) + lead gate | Partial. `PB:maestro-run/loop/SKILL.md`:29-34 (conflicting write sites stay reserved; avoid barriers that buy only waiting); `PB:maestro-plan/SKILL.md`:39-41 returns a proposal where "two slices write one file". Shared-file elimination as a pre-fan-out step: absent. | Use `conflict-map` (MP:35 names conflict maps; confirm operation name in arsenal catalog) |
| 4 | Concurrency cap: at most 10 agents, 6 if prompts are non-trivial; beyond that merge triage costs more than wall-clock saved | `TL/techlead/SKILL.md` §1 item 4 | Lead | Absent as a number. `PB:maestro-run/loop/SKILL.md`:34 says choose concurrency "from host capacity and review/context cost" (principle only). | Numbers are harness-calibrated (see Campaign section); decide whether to ship a default (Q4) |
| 5 | Rolling scheduler: dispatch-on-ready, merge-on-green; DAG is merge order, barrier is a degenerate case | `TL/techlead-loop/SKILL.md` L1 | Lead | Present. `PB:maestro-run/loop/SKILL.md`:29-34, 46-49 ("Do not hold ready work solely for a ceremonial batch"). Replay tool `wave-scheduler` at PB:loop:62. | None; closest equivalent already shipped |
| 6 | Seal is verification-green, not agent return; stamp sealed/merged only on evidence | `TL/techlead-loop/SKILL.md` L4, L6 | Lead | Present. `PB:maestro-run/loop/SKILL.md`:40-41 ("Worker return is not `sealed`"); `merged` needs an authorized receipt (same lines). | None |
| 7 | Living anchor tasklist outside the volatile window, updated on every SEAL | `TL/techlead-loop/SKILL.md` L3 | Lead | Partial. `PB:maestro-run/loop/SKILL.md`:54-56 (update compact task/decision record after each verified transition); MP:51 (context compaction, `context_compact`). No durable tasklist artifact is required. | Map to Orchestra task record / working memory; state the rule "state lives outside chat" explicitly |
| 8 | Scaffold-first: lead creates skeleton, agent fills it, never structures | `TL/techlead-loop/SKILL.md` L2 | Lead | Partial. `PB:maestro-run/loop/SKILL.md`:25-28 (create scaffold through authorized native edits; generators do not write; a skeleton is not completed behavior). The "agent never structures" half is absent. | Phrase as: lead writes scaffold; brief forbids structural choices |
| 9 | Return firewall: compact return card; orchestrator never reads the sub-agent transcript | `TL/techlead-pack/SKILL.md` "return firewall" (line 62-67); owner AP-2 `TL/techlead/SKILL.md` §4 | Lead | Partial. Seat return card exists (`backend.txt`, "Return card: backend-result"). `MP:7` says teammate reports show only if the owner opens the session, so the lead does not need to read them. `PB:maestro-run/verify/SKILL.md`:95 "Return compact findings and output pointers". Gap: no explicit "never read the raw teammate transcript" rule. Risk: `MP:51` tells the lead to pull masked output with `context_recall`, which can re-absorb a dump. | Add explicit rule; scope `context_recall` to specific ids |
| 10 | Relay chain armed before spawn: checklist items and `cmd` oracles the agent cannot skip; ≥1 `cmd` mandatory | `TL/techlead-pack/SKILL.md` "relay" (lines 29-41); `TL/techlead-loop/SKILL.md` L4 | Lead | Present, and stronger. `PB:maestro-run/loop/SKILL.md`:65-68: host grades every gate in order, retry budget (default 3), parks on exhaustion, release only by owner approval. Owner version is a SubagentStop hook, which is harness-specific. | Translate hook language to host-graded arm; keep the "cmd oracle mandatory" rule (check whether `relay-arm` enforces it) |
| 11 | Recovery: never trust `completed` without SEAL or BLOCKED; re-run the gate before accepting | `TL/techlead-loop/SKILL.md` L4; `TL/techlead/SKILL.md` §4 | Lead | Present. `PB:maestro-run/loop/SKILL.md`:49-53 ("`completed` without verification is still pending"); MP:91. | None |
| 12 | Push early: branch and push at the first compiling commit so a dead agent's work is resumable | `agent-dispatch-and-landing/SKILL.md` "Push early" (lines 19-30) | Lead | Absent, and conflicts with the seat contract. `backend.txt` "Repository operations ... Leave your change uncommitted"; MP:17 and MP:60 ("commit, push ... only when the owner asked"). | Design decision (Q2). Possible equivalents: durable Session evidence (PB:loop:50-53) or owner-authorized WIP commit |
| 13 | One worktree per dispatched agent; shared index and stash leak work into the wrong branch | `agent-dispatch-and-landing/SKILL.md` "Isolation is not optional" (lines 12-17); `TL/techlead-loop/SKILL.md` L5 leak check | Lead | Absent. MP:55 says the working directory may be a sandbox worktree the owner chose; MP:68 says leave others' changes alone; PB:loop:76 lists `git worktree list`. No per-dispatch worktree rule. | Check whether `task` supports per-child isolation (Q3); otherwise write `writePaths` plus a leak check |
| 14 | Brief must carry: pre-decided target, files to read by path, acceptance items as real tests, repo traps verbatim, mutation-probe requirement, stop line, one reflective question ("what did my framing get wrong?") | `agent-dispatch-and-landing/SKILL.md` "What a brief must carry" (lines 32-47) | Lead | Partial. `backend.txt` covers target, acceptance, write paths, checks, and forbids commit (the stop line is "leave uncommitted"). Absent: mutation-probe requirement for the worker, repo traps, the reflective question. `MP:38` leaves the brief shape to the `task` tool. | Add these fields to the brief template, if the `task` shape allows (verify in `task.ts`, Q8) |
| 15 | Worker must mutation-probe its own tests and report measured before/after | `agent-dispatch-and-landing/SKILL.md` step 3 (lines 60-63); `instrument-calibration/SKILL.md` "The checklist" | Lead | Present for the lead, not for the worker. `PB:maestro-run/verify/SKILL.md`:31-33 (lead plants a defect, confirms the specific test fails, restores). `backend.txt` allows test writing "only when the packet assigns it". | Require probe in brief when tests are assigned |
| 16 | Never land on a self-report; cold-check count, commit, baseline parent | `TL/techlead-verify/SKILL.md` L0; `TL/techlead/SKILL.md` AP-5; `agent-dispatch-and-landing` "Landing" (lines 49-54) | Lead | Present. `PB:maestro-run/verify/SKILL.md`:14 ("An author's report is a pointer to evidence"), :25-30 (cold-check placement, no equating `completed` with verified); `backend.txt` "Checks and honesty" ("The host's own run ... decides"); MP:91. | None |
| 17 | Off-baseline branch: inspect full delta; never merge whole; cherry-pick only added files | `TL/techlead-loop/SKILL.md` L5; `TL/techlead-verify/SKILL.md` L0 | Lead | Present, stricter. `PB:maestro-run/loop/SKILL.md`:43-45 ("An off-baseline branch is HOLD ... never blindly merge or assume cherry-picking added files makes it safe"). Baseline ancestry check at `PB:maestro-run/verify/SKILL.md`:64. | None; keep Orchestra's stricter wording |
| 18 | Read the whole file list (`git diff --name-only base...branch`), not `show --stat` on the tip; a tool-state directory contaminated 227 files and CI plus cold review still passed | `agent-dispatch-and-landing/SKILL.md` step 5 (lines 61-69); `instrument-calibration/SKILL.md` "git add -A" row | Lead | Partial. `PB:maestro-run/verify/SKILL.md`:23-25, 70 (every changed path; untracked inspected separately). The exact `--name-only` trap and the note that green CI and cold review do not look at diff shape are absent. | Add the diff-shape point to verify; name the command |
| 19 | Check CI at exact head (`gh pr checks`); when adding a CI lane, watch it go green once | `agent-dispatch-and-landing` step 6; `instrument-calibration` "The green you falsified..." (lines 114-132) | Lead | Partial. `PB:maestro-run/verify/SKILL.md`:73 (exact PR head; local green is not CI green); MP:91. "Watch a newly added lane go green once": absent. | Add one sentence to verify |
| 20 | Positive control before any absence or count claim | `instrument-calibration/SKILL.md` "The law" and "positive control" (lines 18-45) | Lead | Present. `PB:maestro-run/verify/SKILL.md`:33 ("Calibrate absence/count claims against a known positive control"). MP:91 is the general "claim only what you observed". | None |
| 21 | Shell traps that return empty instead of failing: unmatched zsh glob aborts, `cmd \| head` exit code, leading `-` in patterns, basename exclusion, verify by listing state not by echoed words | `instrument-calibration/SKILL.md` "Shell traps" (lines 47-60) | Lead | Absent. MP:34 covers only quoting and substitution inside shell commands. | Add a short trap list to the verify playbook; Orchestra's shell is zsh/bash as on the owner's Mac, so the traps apply |
| 22 | Fail-closed default covers only inputs you did not enumerate; a broken call can land on a documented "finding" exit code; one conformance test against the real binary in both directions | `instrument-calibration/SKILL.md` "Fail-closed has a hole" (lines 62-76) | Lead | Absent. Relevant where Maestro or Relay interprets exit codes from `cmd` oracles (`relay-arm`, PB:loop:65-68). | Add to the verify checklist for any new `cmd` oracle |
| 23 | An oracle's reach depends on its environment; speed work can delete coverage silently; replace a test's world only after enumerating what the old world let it see | `instrument-calibration/SKILL.md` "An oracle's reach..." (lines 92-112) | Lead | Absent. PB:verify:69 ("Broaden checks only for changed dependencies/harness") and PB:loop:80 (test:ci lanes) do not state the reverse risk (narrowing deletes coverage). | Add to verify and repo-maintenance |
| 24 | A claim that a gate protects something is the most dangerous claim; open the gate before writing the sentence | `instrument-calibration/SKILL.md` "A claim about a gate..." (lines 78-90) | Lead | Absent. MP:91 covers observed-only claims generally. | Add to verify's evidence rules |
| 25 | Artifacts have dates; check `git log` before publishing an "open finding" | `instrument-calibration/SKILL.md` "Artifacts have dates..." (lines 134-138) | Lead | Absent. | Minor; add to verify when citing a doc limitation |
| 26 | Acceptance suite is RED first; green-at-baseline items are vacuous and prove nothing | `TL/techlead-decompose/SKILL.md` Step 1 and Step 4 (lines 23-33, 73-90); `acceptance-gate.py` (source-only, see Campaign section) | Planning (suite) + lead (gate) | Partial. `PB:maestro-run/verify/SKILL.md`:29-30 ("new behavior needs meaningful red-to-green or equivalent direct evidence"). Vacuity flag absent. | Add "already green at baseline is a finding" to verify step 2 |
| 27 | Judged items (untestable criteria) escalate to a human, never auto-green | `TL/techlead-decompose/SKILL.md` Step 1 and Step 4 | Planning + lead | Present. `PB:maestro-run/verify/SKILL.md`:30 ("Named judged items remain judged"); PB:governed step 11 (owner approval). | None |
| 28 | Cold suite critic, independent, adversarial, loop until two consecutive dry rounds; never self-check the suite | `TL/techlead-decompose/SKILL.md` Step 2; `TL/techlead-decompose/SUITE-REVIEW-BRIEF.md` (5 invariants, template) | Planning (archie) | Partial. `PB:maestro-plan/SKILL.md`:18-35 gives a cold coverage-review brief with verdicts and no implementation. Single pass only; no "until dry" loop; no `missing`/`suggested_item` schema beyond `missing`/`vague`/`overreach`. | Route to archie seat; Maestro only enforces independence (MP:42, plan:20) |
| 29 | Test-first slicing by responsibility, not by line range; `plan-check` blocks non-total or non-disjoint maps | `TL/techlead-decompose/SKILL.md` Step 3.1-3.4 | Planning | Present through tools. `PB:maestro-run/verify/SKILL.md`:53-54 (`plan-check`, `brief-usage-check`); `PB:maestro-plan/SKILL.md`:39-41 (return on uncovered items, shared file, cycle, oversized slice, open fork). Responsibility-slicing principle absent. | Belongs to archie; confirm archie seat carries it |
| 30 | Sweet-spot sizing: ≤3 concepts, ≤4 acceptance items, ~50-400 LOC, zero decisions; too big → re-slice | `TL/techlead-decompose/SKILL.md` "Sizing & routing" (lines 58-68) | Planning | Absent as thresholds. `PB:maestro-plan/SKILL.md`:39-41 ("a slice is too large") without a measure; `PB:maestro-repo/maintenance/SKILL.md`:29-30 explicitly declines fixed LOC constants. | Decide whether to ship thresholds (Q4); the LOC numbers are repo-calibrated |
| 31 | Per-WP (model, context budget) pair; choose cheapest model whose budget fits; never escalate model to fit a bloated packet; re-slice instead | `TL/techlead-pack/SKILL.md` "Context budget per model"; `TL/techlead-decompose/SKILL.md` §3 | Lead | Absent. MP:38 says leave `model` unset unless owner or an instruction file names one; `effort` tiers for `jimmy` at MP:43. | Principle "re-slice, do not escalate to fit" can ship; model table is harness-specific (Campaign) |
| 32 | Contract freeze rule: FREEZE iff crosses a WP boundary AND changing it forces another WP to change; minimal surface; no speculative freezing | `TL/techlead-contract/SKILL.md` "decision rule" (lines 44-60) | Planning (archie) | Absent as a rule. `PB:maestro-run/loop/SKILL.md`:31-33 (contract- or stub-bound consumers may start early; provider dependencies still constrain integration); `PB:maestro-run/verify/SKILL.md`:56 (`contract-freezer`, `seam-checker` as evidence). | Route to archie; Maestro checks the frozen surface at return (already via `contract-freezer`) |
| 33 | Anchor code: agent transcribes exact signatures; if it must invent a signature, that is the hallucination door | `TL/techlead-contract/SKILL.md` §2; `TL/techlead/SKILL.md` AP-3 | Planning | Absent in Maestro. `PB:maestro-run/loop/SKILL.md`:26-28 (`stub-gen` generates source; skeleton not completion). `backend.txt` "Not yours: architecture" already blocks invention at the seat. | Archie-side; Maestro's brief should attach anchors when supplied |
| 34 | Seam test on the contract boundary; "each WP passed alone" is not "they fit" | `TL/techlead-contract/SKILL.md` §4 | Lead | Partial. `PB:maestro-run/verify/SKILL.md`:56 (`seam-checker`); `PB:maestro-run/loop/SKILL.md`:44-45 (shared seam rechecked before integration). Explicit "seam test is required" absent. | Require seam check when two returns share a frozen surface |
| 35 | Lead-owned AP-3 refusal: "Fix the spec, never the agent" | `TL/techlead/SKILL.md` AP-3 | Lead | Present. MP:40 ("Do not fill the gap or redispatch with wider paths"); `backend.txt` "packet blocker" rule; PB:maestro-plan:8-10. | None |
| 36 | Tiered flow: tiny change needs no ceremony; apparatus only for multi-WP demand | `TL/techlead-decompose/SKILL.md` Step 0; `TL/techlead-repo-maintenance/SKILL.md` "tiered flow" | Lead | Present. MP:59-71 (proportionate checks, no mandatory branch or wave); `PB:maestro-run/loop/SKILL.md`:13; `PB:maestro-repo/maintenance/SKILL.md`:12-13. | None |
| 37 | Independent cold reviewer for every agent-authored change (T1), author ≠ reviewer; agent verdict informs, human approves | `TL/techlead-repo-maintenance/SKILL.md` "Independent review" (lines 33-41); `REVIEWER-BRIEF.md` invariants 1 and 5 | Lead | Partial. Present for "substantial" work: `PB:maestro-run/verify/SKILL.md`:34-37 (independent cold reviewer; missing review is UNKNOWN). Governed code review by `lucy`: PB:governed steps 9 and 14. Routine agent changes do not require an independent reviewer in the text. Divergence (Q5). | Decide the tier rule (Q5) |
| 38 | Review budget: ≤~400 changed LOC per reviewer, fan out disjoint reviewers; PR target ~50, soft 200, hard 400 LOC | `TL/techlead-repo-maintenance/SKILL.md` "budgets" (lines 24-31); `REVIEWER-BRIEF.md` invariant 3 | Lead | Partial. Principle present: `PB:maestro-run/verify/SKILL.md`:35 ("Keep each review slice cognitively bounded; re-slice when too large"). Numbers absent, and `PB:maestro-repo/maintenance/SKILL.md`:29-30 rejects fixed LOC constants by design. | Decision (Q4); numbers are Campaign-calibrated |
| 39 | Reviewer brief: cold, adversarial, scoped slice plus frozen spec, bounded diff, structured verdict, `unverified` list, reviewer never approves merge | `TL/techlead-repo-maintenance/REVIEWER-BRIEF.md` (template, NEVER list) | Lead | Present, close match. `PB:maestro-repo/maintenance/reviewer-brief/SKILL.md`:13-29 (verdict set includes `unknown`; `approve` is a conclusion only; praise-only reviews need coverage inspection). Missing: "default-incomplete" stance and the "never praise-only" reject wording in full. | Minor wording |
| 40 | Never self-approve; agent never approves its own or a peer PR; human is the accountable approver | `TL/techlead-repo-maintenance/SKILL.md` "Independent review" (line 38) | Lead | Present. MP:42 (synthesis stays with lead); MP:93 ("Only the owner accepts a delivery"); PB:governed step 11 (exact approval words only). | None |
| 41 | Escalate to human when genuinely blocked; ESCALATE verdict; the buck stops with the lead | `TL/techlead/SKILL.md` §0.5 #10; `TL/techlead-verify/SKILL.md` verdicts | Lead | Present. MP:58-60 (ask only when readings differ materially); PB:verify:81-82 (ESCALATE/HOLD); PB:loop:88 (HOLD vs FAIL vs UNKNOWN). | None |
| 42 | Rigor compact: no debt, deferral or gambiarra unless a human authorizes; WAIVER record with authorized-by, reason, remediation, tracking; the lead never authorizes its own waiver | `TL/techlead/SKILL.md` §0.6 (lines 66-87) | Lead | Present in part. PB:verify:43-46 (explicit user-authorized deferral records what, who/when, reason, remediation, tracking; does not turn failed evidence into PASS). MP:92 (never weaken a test or gate). The "lead cannot self-waive" line is implied by MP:93 and PB:verify:44 but not stated in those words. | Consider the WAIVER block as a verify output field |
| 43 | Verdict format: L0..L10 PASS/FAIL, V1..V4, verdict APPROVE/FIX-FIRST/REJECT/ESCALATE, NEXT | `TL/techlead-verify/SKILL.md` "Output" | Lead | Present, in richer form. PB:verify:85-93 (levels, acceptance, mutationControls, independentReview, verdict approve/fix-first/reject/escalate/hold, next). | None |
| 44 | Lifecycle record: WAVE PLAN with go/no-go, disjointness, contract, WP table with model and budget, conflict map, return shape, DoD, merge order | `TL/techlead/SKILL.md` §3 | Lead | Partial. Plan record: `PB:maestro-plan/SKILL.md`:44-50; loop output schema PB:loop:92-99 (decisions, transitions, integration, recovery, calibration). No WP table with budget. | Keep Orchestra schema; add budget column only if Q4 adopts budgets |
| 45 | Calibration: lessons for the next brief; predicted vs observed effort | `TL/techlead-loop/SKILL.md` L1 ledger stamps; `TL/techlead/SKILL.md` §0.5 #9 | Lead | Present. PB:loop:54-56 ("lessons for the next brief", "predicted versus observed effort"); PB:loop:94-98 `calibration: []`; PB:loop:40-41 wave-ledger. | None |
| 46 | Ask the worker one question back: "what did my framing of this get wrong?" | `agent-dispatch-and-landing/SKILL.md` "What a brief must carry", last bullet | Lead | Absent. Teammates cannot ask questions (MP:39); reflective output is not requested in `backend.txt` return card. | Add as optional `nextActions` item in the brief; cheap |
| 47 | Stop line: agent opens PR or stops at "PR green, waiting for lead"; agent never merges | `agent-dispatch-and-landing/SKILL.md` "What a brief must carry" | Lead | Present in different form. `backend.txt` "Repository operations ... leave your change uncommitted"; MP:17 "never put commit, push or pull-request steps in a brief unless the owner asked". Divergence: owner's agents may commit and open PRs; Orchestra's do not (see Q2). | Decision (Q2) |
| 48 | Dead agent's locked worktree: check pid and uncommitted state before forcing removal; forcing a live worktree destroys work | `agent-dispatch-and-landing/SKILL.md` "Cleaning up" (lines 80-94) | Lead | Absent. PB:loop:55-56 (clean only owned, inactive worktrees after checking user changes). No lock or pid concept. | Add when per-dispatch worktrees exist (Q3) |
| 49 | Pruning remote branches: squash-merged branches are never ancestors; match tips against PR head SHAs | `agent-dispatch-and-landing/SKILL.md` lines 88-94 | Lead | Absent. PB:maintenance:75-79 forbids history rewrite but does not state the squash trap. | Add to maintenance cleanup step |
| 50 | Cleanup: prune merged worktrees, clear build artifacts (`target/`, `node_modules`), check disk; rolling hygiene every ~5 merges | `TL/techlead-loop/SKILL.md` L7; `TL/techlead-verify/SKILL.md` L10 | Lead | Partial. PB:loop:54-56 (owned inactive artifacts); PB:review-checks:24 (L10 "disk pressure"). Build-artifact clearing and cadence absent. | Phrase per project; no fixed cadence |
| 51 | Leak check on the main worktree every 3-5 returns (`git status` on main) | `TL/techlead-loop/SKILL.md` L5 | Lead | Partial. PB:loop:42 ("main-worktree leakage ... before integration"). Cadence absent. | Add cadence wording if wanted |
| 52 | Integration: serial merge gate; change-scoped per merge; full gate at close; union-resolve append-only; never ours/theirs on manifest or changelog | `TL/techlead-loop/SKILL.md` L6 | Lead | Present. PB:loop:46-49 (serial; deliberate union for append-only; scoped checks after integration; broader at closure). | None |
| 53 | Lockfile merges can silently downgrade a pinned security dependency; re-verify pins | `TL/techlead-verify/SKILL.md` V3 | Lead | Present. PB:review-checks:37 ("lock conflict resolution preserves security pins"). | None |
| 54 | Never-list: force-push, reset --hard, clean -fx, filter-branch, gc --prune=now, --no-verify, amend or rebase published history, moving published tags | `TL/techlead-repo-maintenance/SKILL.md` "never-list" (lines 62-77) | Lead / repo hygiene | Present. PB:maintenance:75-79. | None |
| 55 | Stage intended paths only at integration; never `git add -A` to sweep runtime or user state into a merge | `TL/techlead-repo-maintenance/SKILL.md` never-list (last item); `agent-dispatch-and-landing` | Lead | Present. PB:maintenance:37-39 ("Never use blanket staging to sweep user/runtime state into integration"); MP:68 (leave the working tree as found). | None |
| 56 | Telemetry and generated state never committed | `TL/techlead-repo-maintenance/SKILL.md` "never-list"; "telemetry in commits" incident | Lead | Present in part. PB:maintenance:80-81 ("Do not commit telemetry, generated runtime policy/state, secrets, or build artifacts by accident"). | None |
| 57 | Conventional commit and PR titles; PR body template with why, how tested, risk and rollback, closes | `TL/techlead-repo-maintenance/SKILL.md` lines 40-45 | Lead | Present. PB:maintenance:37-38 and 40-42; MP:99-100 (commit and PR text for reviewer who has not seen the conversation). | None |
| 58 | Change-scoped CI that fails toward more, with universal tripwires | `TL/techlead-repo-maintenance/SKILL.md` "Change-scoped CI" (lines 55-61) | Lead | Present. PB:maintenance:34-36 ("Scope CI toward changed domains; ambiguous harness/dependency/global changes require broader checks"). Arsenal `ci-select` at PB:maintenance/arsenal-operators:28. | None |
| 59 | Release only via a guarded recipe: clean tree, version and changelog agree, unpublished tag, full gate, signed tag; never copy the owner's scripts | `TL/techlead-repo-maintenance/SKILL.md` "release" (lines 49-53) | Lead / repo-specific | Present by design. PB:maintenance:43-46 (discover the actual recipe; "Do not copy absent release.sh, bump scripts, SSH config, or branch rules from TechLead"). | None; the signing and script details are Campaign-specific |
| 60 | Hand-curated CHANGELOG with an auto-triggered stub and a refuse-to-ship check | `TL/techlead-repo-maintenance/SKILL.md` line 46-48 | Lead / repo-specific | Absent (not required by Orchestra playbooks). | Repo-specific; keep out of shipped playbook unless the repo adopts it |
| 61 | Every intermediate verification: positive-control evidence, claim evidence scoped to what was run | `instrument-calibration/SKILL.md` checklist | Lead | Present in principle (MP:91; PB:verify:33). | None |
| 62 | Anti-pattern: story-as-prose for codegen degrades output; intent narrative chooses cases, assertions stay exact | `TL/techlead/SKILL.md` AP-6; `TL/techlead-verify/SKILL.md` V4 | Lead (V4) / planning (AP-6) | Present for V4. PB:review-checks:40-41. AP-6 is an archie-side brief-writing rule. | Keep V4; AP-6 to archie |
| 63 | Orchestrator keeps synthesis; never hands a teammate its conclusion to confirm | `TL/techlead/SKILL.md` §0.5 (delegation discipline); `TL/techlead-verify/SKILL.md` "Delegation note" | Lead | Present. MP:42. | None |
| 64 | Context budget discipline: state outside the volatile window; orchestrator window is the scarce resource | `TL/techlead-pack/SKILL.md` "return firewall" last bullet | Lead | Present. MP:51 (`context_compact` at milestones; `context_recall` for masked results). | None beyond rule 9 |

Coverage reading. Rows marked Present are the ones Maestro already carries. Partial and Absent rows are the
gaps listed below. Rows marked Planning belong to archie, and Maestro only has to verify their output. The table
is the source; no aggregate count is asserted.

Rules that assume Claude Code or Arsenal names and need translation (summary):

- `Agent`/`general-purpose` subagents and `SubagentStop` hook: translate to `task` seats with host-graded `relay-arm`.
- `Read` of sub-agent JSONL transcripts: Orchestra has no such file for the lead to read; the equivalent risk is `context_recall` (MP:51).
- Arsenal names with no Orchestra counterpart found in MP or PB: `context-packer`, `anchor-gen`, `sliceability`, `transcript-firewall`, `context-budget-guard`, `model-router`, `story-test-gen`, `acceptance-gate.py`, `verify.sh`, `change-budget.py`, `ci-select.py` (the last one exists as an arsenal operator at PB:maintenance/arsenal-operators:28). PB:verify:75 already bars invoking source-only scripts as host features.
- Owner `conflict-map` / `plan-check` / `wave-scheduler` / `wave-ledger` / `relay-arm` / `seam-checker` / `contract-freezer` / `stub-gen` / `repo-hygiene-check` / `repo-mapper` / `profile`: present in Orchestra arsenal text (PB:verify:53-59; PB:loop:62; PB:maintenance:55; PB:arsenal-operators:28-31). Operation names must be confirmed in the catalog before they are cited as tools.
- `question`: exists (`WT/packages/core/src/tool/question.ts`); MP:12 says ask with `question` when an answer blocks progress.
- `task`: exists (`WT/packages/core/src/tool/task.ts`); MP:38 says the tool lists each teammate's role, tools, return and brief shape.
- `board_*`: no reference in MP or PB. Not asserted.

## Campaign-specific rules to exclude

These are true for the owner's Mac or specific campaigns and should not ship to users. The principle column says what, if
anything, survives.

| Rule or number | Source | Why excluded | Principle kept? |
|---|---|---|---|
| CoreLink 18-agent wave, 50% off-baseline, 6 missing commits, 1 main leak (2026-05-30) | `TL/techlead/SKILL.md` AP-1 | One campaign's incident | Yes: "no fan-out without a conflict map" |
| hugr-probe 15-agent zero-conflict wave | `TL/techlead/SKILL.md` header and Section 6 | Campaign | No |
| "Agents have lied about test counts ≥3 times" | `TL/techlead/SKILL.md` AP-5 | Campaign record | Yes: never trust a self-report |
| 227 `.atlas/` files and 1300 store blobs swept by `git add -A` | `agent-dispatch-and-landing/SKILL.md` lines 49-79; `instrument-calibration/SKILL.md` "git add -A" row | Owner repository artifacts | Yes: read the file list, stage by name |
| gitleaks `--source -` exit-1 incident; 11 gates green while fake-driven | `instrument-calibration/SKILL.md` "Fail-closed" | One adapter | Yes: one conformance test against the real binary |
| `cargo check` 8m30 to 11s synthetic-workspace optimization; `.cargo/config.toml` `--cap-lints` | `instrument-calibration/SKILL.md` "An oracle's reach" | Rust campaign | Yes: enumerate what the old world exposed |
| Wine, CI Linux, `eprintln!` skip notices | `instrument-calibration/SKILL.md` "The green you falsified" | Rust/Windows CI campaign | Yes: watch a new lane go green once |
| Rust/cargo instance of L1-L3 (`#[allow]`, clippy, `forbid`, `members=["crates/*"]`) | `TL/techlead/SKILL.md`; `TL/techlead-verify/SKILL.md` Section "generalize per stack" | Stack-specific | No |
| Model budget table: Haiku 40K/100K, Sonnet 120K/300K, Opus 300K/800K | `TL/techlead-decompose/SKILL.md` line 70; `TL/techlead-pack/SKILL.md` lines 43-60 | Claude model names and sizes; Orchestra leaves `model` unset (MP:38) | Principle only: re-slice rather than escalate model to fit a packet |
| "≤10 concurrent agents; ≤6 non-trivial" | `TL/techlead/SKILL.md` §1.4 | Calibrated on the owner's Claude Code fleet | Open (Q4) |
| Numeric PR and review budgets: 50/200/400 LOC; ≤400 LOC per reviewer | `TL/techlead-repo-maintenance/SKILL.md` lines 24-31; `REVIEWER-BRIEF.md` invariant 3 | Repository-calibrated; Orchestra playbook already declines fixed LOC constants (`PB:maintenance:29-30`) | Open (Q4) |
| Sweet-spot LOC and item thresholds | `TL/techlead-decompose/SKILL.md` lines 58-66 | Repository-calibrated | Open (Q4) |
| `acceptance-gate.py`, `wave-metrics.py`, `governance/*.py`, `release.sh`, `verify.sh --scoped`, `github-ruleset.sh`, `changelog-bump.py`, `changelog-check.py` | `TL/techlead-decompose/SKILL.md` Step 4; `TL/techlead-repo-maintenance/SKILL.md` "Commands" | Source-only scripts; Orchestra forbids invoking them as host features (`PB:verify:75`) | Yes: gate semantics only |
| `.githooks/commit-msg`, `hooks/destructive-guard.py`, `hooks/bypass-guard.py`, `hooks/git_hygiene.py`, `.techlead/` telemetry | `TL/techlead-repo-maintenance/SKILL.md` never-list; `REVIEWER-BRIEF.md` filled example | Owner's repository hooks; Orchestra says hooks are not host features (`PB:maintenance:14-15`) | Yes: native interception must prove any enforcement claim (`PB:maintenance:82-83`) |
| SSH commit and tag signing setup (`gpg.format ssh` etc.) | `TL/techlead-repo-maintenance/SKILL.md` lines 51-53 | Owner Mac configuration; Orchestra forbids changing signing config (`PB:maintenance:80`) | No |
| Release recipe, annotated signed tags, changelog stub gate | `TL/techlead-repo-maintenance/SKILL.md` lines 46-53 | Owner's release process | Partly: "discover the recipe; never copy" (`PB:maintenance:43-46`) |
| CI cadence: full suite once per epic, `epic` label, local green is not CI green, no local tests on the Mac | owner memory (`epic-local-gate-scope`, `no-heavy-local-runs`, `ci-epic-cadence`) and `AGENTS.md` CI section | Owner machine and campaign budget | No; keep "CI at exact head" (`PB:verify:73`) |
| Playbook text that hardcodes this repository's commands: `bun run test:ci`, `bun typecheck`, default branch `dev`, branch names of at most three words | `PB:maintenance:58, 70-73`; `PB:verify:71-72`; `PB:loop:80-81` | Repo-specific text inside a shipped artifact (AGENTS.md "Ships" list includes playbooks) | Flagged as ship leak (Q1) |
| Tool-state contamination case, `.atlas/` ownership rules | `agent-dispatch-and-landing/SKILL.md` | Orchestra-internal state | No |
| Lightr, Dock, Projects board, live seat, Jimmy campaigns, owner memory-file rules | owner memory index | Not lead craft | No |
| Owner-authority rules: "decide and do pendências myself", "never block other sessions", "handoff: never kill" | owner memory | Owner preference, not lead craft; conflicts with MP:54 and MP:93 if shipped as-is | No |

## Gaps

Ranked by how much each gap would cost a Maestro run, not by rule count.

1. **Lead-side packet preparation has no rule.** Owner rule 1 and AP-2/AP-3 require the lead to compute consumer surface, baseline, pattern snippets and gate commands before dispatch. MP:38-40 and `PB:maestro-plan:12-16` cover pinning and handing facts to archie, but no Maestro rule requires the lead to supply the worker's checks as exact commands. (Rules 1, 14.)
2. **No worker mutation-probe requirement in the brief.** The lead probes returns (`PB:verify:31-33`), but a worker that writes tests is not told to prove they bite before reporting. The owner's brief template makes this mandatory. (Rule 15.)
3. **No per-dispatch worktree isolation rule.** Shared index and stash let an agent's commit ride into another branch. Orchestra text has none of this; `writePaths` (MP:38) constrains files, not index state. (Rule 13.)
4. **No resumability principle for a dead worker.** Push-early is contrary to the seat contract (`backend.txt`). Orchestra has durable Session evidence (`PB:loop:50-53`) but no rule that the lead must check it before re-dispatch. (Rules 12, 48.)
5. **Return firewall is implicit.** MP:7 and the return card cover most of it. No rule forbids reading raw teammate output, and `context_recall` (MP:51) can pull large masked output back in. (Rule 9.)
6. **Vacuous-green check missing.** An acceptance item already green at baseline is not flagged as proof-free (`PB:verify:29-30`). Owner AP in `TL/techlead-decompose` Step 4 treats it as a failure of the gate. (Rule 26.)
7. **Instrument-calibration family absent from the lead's verify playbook.** Shell traps, fail-closed-on-unknown-exit, the speed-work coverage deletion, gate-claim reach, and "watch a new CI lane go green once" are not in `PB:verify` or `PB:maintenance`. The verify playbook has the positive control only (`PB:verify:33`). Highest-value additions: shell traps (21), the reach-of-claim rule (24), the narrowing-deletes-coverage rule (23). (Rules 19-25.)
8. **Routine cold review is narrower than the owner's.** Owner: every agent-authored change gets an independent reviewer (`TL/techlead-repo-maintenance/SKILL.md` lines 33-41). Orchestra: substantial work only (`PB:verify:34-37`). (Rule 37, Q5.)
9. **No review-size or slice-size measure.** The principle exists (`PB:verify:35`), but without a measure the lead cannot decide when to re-slice. The owner's numbers are Campaign-calibrated, so the gap is a decision, not a copy job. (Rules 30, 38, Q4.)
10. **Zero-decision dispatch is not a rule.** Owner: a WP with a live decision is not ready (`TL/techlead/SKILL.md` §1, V1). Orchestra: "No deterministic zero-decision promise" (`PB:loop:15`) and V1 lists "explicit decisions/latitude" (`PB:review-checks:27`). (Rule 2, Q6.)
11. **Suite-critic loop is single-pass.** `PB:maestro-plan:18-35` runs one cold review. The owner loops until two dry rounds (`TL/techlead-decompose` Step 2; `SUITE-REVIEW-BRIEF.md` invariant 5). This belongs to archie's workflow; flag it there. (Rule 28.)
12. **Contract-freeze and anchor-code rules belong to archie and are not in its prompt (not checked here).** Maestro's side is only the return check (`contract-freezer`, `seam-checker`). (Rules 32-34.)
13. **Cleanup gaps.** No rule on build-artifact clearing, leak-check cadence, dead-worker worktree locks, or the squash-merge ancestry trap in branch pruning. (Rules 48-51.)
14. **Reflective worker question absent.** Cheap to add to the brief (rule 46).
15. **WAIVER record not in verify output.** Orchestra has the deferral fields (`PB:verify:43-46`) but the output schema (`PB:verify:85-93`) has no field for them. (Rule 42.)

What Orchestra already does better than the owner's skills, to keep: host-graded relay arm with a retry budget and
owner-only release (rule 10); exact approval binding and governed chain (`PB:governed`); a cold reviewer seat and
`reviewer-brief` with an `unknown` verdict (rule 39); explicit "claim only what you observed" evidence rules
(MP:91); HOLD distinct from FAIL and UNKNOWN (`PB:loop:88`).

## Open questions

Q1. **Ship leak.** `PB:maintenance:58, 70-73`, `PB:verify:71-72` and `PB:loop:80-81` hardcode this repository's
commands (`bun run test:ci`, `bun typecheck`), its default branch (`dev`) and its branch-name rule. AGENTS.md lists
playbooks among what ships. Should these be parameterized, or moved to repo-only material? Owner decision.

Q2. **Push-early versus the no-commit seat contract.** The owner's resumability rests on pushing early. Orchestra's
seat contract forbids commit and push (`backend.txt`, Repository operations). Options: rely on durable Session
evidence and the host-graded relay arm (already shipped); or let a worker make a WIP commit on its own worktree
branch, under owner authority. Which one?

Q3. **Per-dispatch isolation.** Does `task` (`WT/packages/core/src/tool/task.ts`) support a per-child worktree or
index? This study did not read `task.ts` in depth. If not, is `writePaths` plus a leak check acceptable?

Q4. **Numeric budgets.** Adopt defaults (≤10 or ≤6 concurrent workers; ~400 changed LOC per reviewer; PR 50/200/400
LOC; sweet-spot thresholds), or keep principle-only as `PB:maintenance:29-30` does? The owner's numbers came from a
Claude Code fleet and specific campaigns.

Q5. **Review tier.** Should every agent-authored change get an independent cold review (owner T1), or only
substantial work (current `PB:verify:34-37`)? The `lucy` seat makes the cost low.

Q6. **Zero-decision dispatch.** Make "zero decisions left to the worker" a checkable V1 item, or keep Orchestra's
stance that unexpected forks return to the lead (`PB:loop:15`)?

Q7. **Planning rules to archie.** Rules 28-34 (suite critic loop, sweet spot, contract freeze, anchor code, AP-6)
belong to the archie seat. Which prompt or playbook (`archie-plan`, `archie-work-package`) should carry them? Not
checked in this study.

Q8. **Brief template.** Should the brief template add the mutation-probe requirement (rule 15), the repo-traps field
(rule 14), and the optional reflective question (rule 46)? Depends on whether the `task` brief shape accepts extra
fields (`task.ts`, not read in depth).

Q9. **Context recall.** Should `context_recall` (MP:51) be restricted to specific ids so that it cannot re-absorb a
raw teammate dump (rule 9)?

Q10. **Verify output.** Add a WAIVER or deferral field to the verify output schema (`PB:verify:85-93`), following the
owner's WAIVER block (rule 42)?
