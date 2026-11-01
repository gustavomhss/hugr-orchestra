# Maestro as lead: study and proposal

Status: research synthesis and proposal for the owner to decide. Built since (2026-10-28): proposal 1 as the `task` field
`card` (not `issue`) with the claim to Building, proposal 2 (PR follow to Review and Shipped), the board lines in
`maestro.txt` (`board_read` without `project` lists projects), the `<board-drift>` and `<team>` context blocks and the `maestro-orchestra`
map playbook, and the dispatch gates in `v2/governance.ts` (unstaffed seat, required `card`, no shipped or cut card,
required `writePaths` for a writing non-seat agent, no paths in another teammate's areas). The rest is still a proposal; the current state is in `.orchestra/skills/maestro-ownership`.
Recorded: 2026-10-28. Baseline: `de5cc963c6` (`dev`).

This study asks why Maestro feels raw as an orchestrator, project manager and team lead next to the backend specialist
(60 skill leaves) and `archie`. It also asks what a strong lead seat should hold. The reports in [research/](research/) are
the evidence. This page is the conclusion.

The concrete design lives in these pages:

| Page | What it fixes |
|---|---|
| [playbooks/maestro-lead/](playbooks/maestro-lead/SKILL.md) | The drafted skill tree: a root and five leaves (intake, dispatch, track, land, report), with Portuguese goldens for every message type |
| [owner-voice.md](owner-voice.md) | How Maestro talks to the owner: eight message types with fixed shapes, word and sentence limits, and schema enforcement |
| [owner-evidence.md](owner-evidence.md) | What this owner rewards and punishes, from about 1,700 reactions to lead agents |
| [skills.md](skills.md) | The leaf catalog with its evidence, the packet and the return vocabulary |
| [integrations.md](integrations.md) | Fifteen native changes, each with today's code anchor, and the nine gaps no product fills |
| [strategy.md](strategy.md) | Build or adopt (build the protocol, adopt no runtime), the margins where Maestro can win, and the proof plan |

## Role boundary

Maestro delegates, decides, moves work, orchestrates, keeps the Projects board current and reports to the owner.
It does not plan: product, architecture, specification, decomposition and briefs belong to `archie`.
It does not do discovery or research: that belongs to `jimmy`. Every proposal below stays inside this boundary.

## Method and evidence

| Report | Kind | Question |
|---|---|---|
| [01](research/01-prompt-anatomy.md) | Internal | What `maestro.txt` spends its lines on |
| [02](research/02-playbooks-arsenal.md) | Internal | What the playbooks and arsenal teach, and where they conflict with the role |
| [03](research/03-board-dispatch.md) | Internal | How dispatch and the board connect in code |
| [04](research/04-owner-techlead-prior-art.md) | Internal | The owner's `techlead` skills (64 rules) against Maestro today |
| [05](research/05-production-orchestrators.md) | External | 12 production orchestrators (Claude Code, Codex, Devin, Cursor, Copilot agent, and others) |
| [06](research/06-multi-agent-frameworks.md) | External | Frameworks and papers (Magentic-One, MAST, Anthropic multi-agent, Cognition, OrchestraBench) |
| [07](research/07-agents-on-pm-tools.md) | External | Agents on PM tools (Linear, Notion, Jira Rovo, Asana, Height) |
| [08](research/08-lead-craft.md) | External | Human lead craft (commander's intent, briefback, OODA, andon, DoR, escalation) |
| [09](research/09-orchestration-skills.md) | External | Published orchestration skill collections (obra/superpowers, CCPM, others) |
| [10](research/10-frameworks-build-vs-adopt.md) | External | Framework primitives: build or adopt |
| [11](research/11-owner-communication.md) | External | Owner communication, first pass |
| [12](research/12-proof-and-evals.md) | External | Proof plan and evals |
| [13](research/13-oss-orchestrator-code.md) | External, code | The lead logic in open-source orchestrators, read in their code: verification, stall limits, question rules |
| [14](research/14-products-primary.md) | External, primary | How shipped products delegate, report, ask and prove done; the nine gaps nobody fills |
| [15](research/15-papers-fulltext.md) | External, full text | Eight mechanisms and their numbers from papers read in full |
| [16](research/16-comms-primary.md) | External, primary | Communication rules from primary sources, with the conflicts between them resolved |
| [owner evidence](owner-evidence.md) | Internal | This owner's reactions to lead agents, ranked |

Reports 13–16 replace the summary-level research of the first pass. Each claim there cites a fetched primary source or
code line. Two figures were corrected on verification: false success is 45–48% of failures in τ² retail and airline (not
one figure for all domains), and Codex's worker cap under V2 is unconfirmed: one open issue reports 4 slots where 10 were configured.

Claims marked [UNV] in a report were not confirmed from a primary source. I rechecked the claims this page relies on:

- In source: `task.ts:86` returns `task_id` and the child's full text inside `<task_result>`, with no status field. The Shipped proof is enforced at `board.ts:915-935`.
  `CONTRACT.md:171-172` promises a prompt line that `maestro.txt` never got (zero mentions of the board).
  Governed step 7 has Maestro author the work card and the brief (`governed/SKILL.md:42-44`). The upstream allowlist
  leaves `decompose`, `stub-gen`, `move-in` and `repo-mapper` out of `archie`'s reach (`upstream-arsenal.ts:7-21`).
  `review-checks/SKILL.md:44` points at the deleted decompose playbook. The playbooks hardcode this repository's
  commands in 8 places.
- From the primary papers:
  - MAST (arXiv 2503.13657) reports premature termination 6.2%, missing verification 8.2%, incorrect verification
    9.1% and step repetition 15.7%. Its interventions measured +9.4 points for role specification combined with the CEO's final say, and +15.6 points
    for a verification step.
  - Magentic-One (arXiv 2411.04468): replacing the whole Orchestrator, ledgers included, drops GAIA performance by 31%, and the stall threshold is ≤2.
  - OrchestraBench (arXiv 2608.05263): the agent recovered none of the latent faults (0.0), and retry policies pooled 0.08 (small sample; full text not read).
    These come from controlled probes, not real workloads.

## Diagnosis

Maestro's lead craft exists. It is buried, it is partly misplaced, and the half that touches the board is missing.

1. **The craft exists but is buried in ceremony.**
   - Of the owner's 64 lead rules, 31 are present in the prompt or the playbooks, 17 partial and 16 absent
     ([04](research/04-owner-techlead-prior-art.md)).
   - About 66% of the 46 KB of playbooks is governance and ceremony ([02](research/02-playbooks-arsenal.md)).
   - Of the prompt's 3,643 words, 34% are lead craft. Permission and governance take 30%, harness description 25% and
     attribution 12% ([01](research/01-prompt-anatomy.md)).
   - Several prose-only rules are not enforced anywhere: reporting, "never revert or stash" and "never weaken tests".

   A lead skill is hard to find in that.
2. **Maestro has the planner's tools, and its own texts contradict the role.** The governed playbook has Maestro write
   the work card and the brief. `frame-request` proposes scope. The prompt lists decomposition among Maestro's offers.
   The authoring arsenal (`decompose`, `stub-gen`, `move-in`, `repo-mapper`) is reachable only by Maestro.
3. **The board is not wired to the work.**
   - `task` never touches a card.
   - A merged PR does not move a card to Shipped.
   - A crashed seat does not set `crash_reason`.
   - `seat` on an issue is free text.
   - No tool writes or answers a note, so journeys J6, J4-E1 and J30 have no path.
   - An owner's answer does not wake Maestro.
   - Nothing detects a stall, and nothing writes a digest or a retrospective.
   
   The prompt teaches the generic `question`, not `board_question` ([03](research/03-board-dispatch.md)).
4. **The receiving contract is one-sided, and the prompt points at text that is not there.** Seats have a packet table
   they expect (backend). Maestro has no written standard for the packet it sends, and none for the report it gives
   the owner: what is fact, what is a decision, what is a blocker.
   - The prompt says `task` lists each teammate's role and brief shape (`maestro.txt:38`, `:80`). `ToolText.task`
     (`tool/text.ts:13-18`) is static and carries neither.
   - The brief-shape contract was in `maestro-plan/pack`, which was deleted in `37abd465e1`. It now lives only in
     `archie`'s skills, and Maestro cannot load those.
   - Maestro's own prompt never names the `backend` seat, the main execution seat.
   - The prompt also cites `completion.beforeDispatch` and a HOST CHECK FAILED protocol. Neither has a producer in code
     ([01](research/01-prompt-anatomy.md)).
5. **There are two Maestros.** Native V2 gets `maestro.txt`. Claude mode gets only a ~2 KB note
   (`claude-code/src/host/options.ts`), so lead craft placed in the prompt does not reach it. Only shipped playbooks
   and tool text reach both.
6. **Ship leak.** Shipped playbooks name `bun run test:ci`, `bun typecheck`, the `dev` branch and this repository's
   branch rule. They are Orchestra's own rules, and a user's project does not have them.
7. **Roster drift.** The roster still lists the stubs `patty`, `lucy`, `billy`, `rosie` and `frankie`, and `bobby` is missing.
   MAESTRO-100 names GitHub Project #2 as the source of truth, while the built board uses GitHub Issues.

## What the field converges on

These patterns recur across products, papers and human practice, with their evidence:

- **Fresh context means the brief is the whole contract** (05, 09). The packet carries everything, and the worker never
  goes looking.
- **Returns are summaries in a closed vocabulary**: done, done with concerns, blocked, needs context (09,
  obra/superpowers). The lead never absorbs the worker's dump.
- **A separate verifier, and done only on evidence** (MAST +15.6%; 05; owner rule L4/L6). A worker's return is not done.
- **Two ledgers: the task facts and plan, and progress with a stall counter.** A stall triggers a replan, not a retry
  (Magentic-One, −31% without its Orchestrator; OrchestraBench: retry recovers 0.08 of latent faults).
- **Parallel only on disjoint writes, depth one** (05, Cognition). A single writer per file.
- **Human gates at the plan and at irreversible steps, not per step** (05, 07 Notion approval modes).
- **On a PM tool: read back after every write, move a stage only on evidence, log the actor, send a digest instead of
  pings, and keep elicitation separate from error** (07 Linear and Rovo; Rovo's false-success report is the
  counter-example).
- **Lead craft:** commander's intent, briefback, pre-mortem for risky work, andon (anyone may stop the line),
  disagree and commit, and an escalation budget (08).

## Adopt and avoid

Adopt:

- A dispatch-packet standard that Maestro checks before `task`. Its parts are intent, acceptance, `writePaths`,
  checks, decisions already made and how to return. Archie authors the content, and Maestro verifies it is complete.
- A closed return vocabulary. A failed check counts toward the stall limit of 2; at 2 the cause is written down and
  the card is re-briefed, rerouted or sent back to `archie`.
- A progress record per epic with a stall rule: no progress in two checks means re-plan through `archie` or ask the
  owner. Never retry blind.
- Board moves derived from facts the system already knows, such as a dispatch, a PR, a merge or a crash. Maestro
  narrates. It does not hand-carry state.
- An owner digest instead of chat noise. Its parts are what shipped, what is blocked, which decisions wait, and the spend.

Avoid:

- Maestro authoring cards, briefs, scope or decomposition. That is the planner's job (02).
- More governance prose in the prompt. Guard-enforced rules stay in code (memory: prompt design, benchmark first).
- Per-step approval ceremony (05, 07).
- Fan-out on overlapping files, nesting deeper than one level, and unbounded fix loops (05, 06, MAST step repetition 15.7%).
- Reporting success without evidence. This is Rovo's failure, and MAST's incorrect verification at 9.1%.
- Hardcoding this repository's commands in shipped text.

## Proposal

### Skill tree (playbooks, shipped)

Drafted in [playbooks/maestro-lead/](playbooks/maestro-lead/SKILL.md), one leaf per step of the lead's job. Each leaf
holds a trigger, steps, a fixed output, a golden and counter-examples; [skills.md](skills.md) gives the evidence behind
each one.

```
maestro-lead/     route to the step; decide two-way doors, never idle, believe state not claims
  intake/         outcome, constraints, unknowns to jimmy or archie, at most one owner question
  dispatch/       the packet and its refusal checks; fill free slots
  track/          card fields plus a per-card block in the Session; stall count; what to do with each return
  land/           verify and probe, integrate in order, publish under the grant, move the card
  report/         eight message shapes; goldens.md in the owner's language
```

The existing playbooks map into it. Governance stays in `maestro-run/governed` and loads only for governed work.
`track` and `land` replace `loop` for ungoverned work and carry its recovery rules; `verify`, `frame-request` and
`maestro-plan` stay.

### Tool and code changes

These are in order of value per cost. Most are small, and all of them belong to the board or the dispatch host, not
to new agent infrastructure.

1. **Link `task` to the board.** `task` takes an optional `issue`. The host links the session, sets the seat from the
   validated roster and moves Ready to Building. A crash sets `crash_reason`.
2. **Move on facts.** A merged PR moves its card to Shipped, under the same proof check `board_move` uses today. A
   linked PR moves its card to Review.
3. **Board notes.** `board_note` lets Maestro write a note and answer the owner's notes (J6, J30).
4. **Wake on answer.** An owner's answer to a `board_question` wakes Maestro's Session (an admit-only prompt plus a wake).
5. **Stall signal.** A stall count per card (Magentic-One rule, threshold 2) surfaces as at-risk. It does not auto-retry.
6. **Digest.** `board_read` gains a digest shape, or a playbook builds one from it. No new store.
7. **Prompt and tool text.**
   - Add the line `CONTRACT.md` promised: `board_question`, `board_read` with `since`, and keeping the board current.
   - Point to `maestro-lead`.
   - Remove the decomposition offer and the phantom `completion.beforeDispatch` and HOST CHECK FAILED text.
   - Make the `task` description list the roster with each seat's role and brief shape, as the prompt already claims
     it does. Being tool text, this also reaches Claude mode.
8. **Arsenal placement.** Move the authoring operations (`decompose`, `stub-gen`, `move-in`, `repo-mapper`) to
   `archie`. Maestro keeps `conflict-map`, `wave-scheduler`, `wave-ledger`, `context-packer`, `brief-usage-check`
   and `repo-hygiene-check`.
9. **Cleanup.** Fix the stale `review-checks` line. Delete the dead `ability-*` descriptors and `classifyOutcome`.
   Reconcile the roster and the MAESTRO-100 board source.

## Owner decisions

Each comes with my recommendation.

1. **Approve the five leaves, their prompt edits and the structured return, and ship them together?** Recommend yes.
   They replace the run loop for ungoverned work; `frame-request`, `maestro-plan`, `verify` and the governed flow stay.
   The edits name the tree and ask for one publish grant per session
   ([skills](skills.md#prompt-edits-that-ship-with-the-tree)). The one code change is integration 11, so a seat's
   outcome is a field, not prose Maestro has to classify.
2. **First code slice?** Recommend integrations 7, 8 and 11: the roster in the `task` text, the decision card fields
   and the structured return. They are tool text and schemas only, so they also reach Claude mode. Then 5, 1 and 2.
3. **Move the authoring arsenal to `archie`?** Recommend yes. Maestro keeps the scheduling and checking operations.
4. **Default agent cap?** Recommend 3 parallel seats, raised by host capacity. Codex defaults to 6; its real cap under
   V2 is unconfirmed.
5. **When is Eval A run?** Recommend after the first slice lands and one real epic runs through `maestro-lead`, and
   only with your permission.
