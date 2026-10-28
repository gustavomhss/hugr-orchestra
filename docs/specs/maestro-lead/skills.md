# Maestro lead skills

Status: proposal. Drafts live in [playbooks/maestro-lead/](playbooks/maestro-lead/SKILL.md). They would ship under
`modules/maestro/coordination/playbooks/maestro-lead/` once the owner approves.

The tree has one root and five leaves, one per step of the lead's job. Each leaf is 1.5–3 KB and holds a trigger, steps,
a fixed output, a golden and counter-examples. Rules that a tool or guard enforces stay out of the leaves.

| Leaf | Trigger | Output | Grounded in |
|---|---|---|---|
| [root](playbooks/maestro-lead/SKILL.md) | Any owner request beyond an answer | Routes to the step; three standing rules | owner evidence rules 3, 6, 7 |
| [intake](playbooks/maestro-lead/intake/SKILL.md) | A request arrives or scope changes | Outcome, constraints, unknowns, at most one question, route | Ask Less (one-question cap: −73% user-attention cost, simulated users; goal questions pay only early), Codex asks ≤ 3 and never what it can discover |
| [dispatch](playbooks/maestro-lead/dispatch/SKILL.md) | Before every `task` call | The packet, with refusal checks | ImpossibleBench (54% to 9% cheating with an "impossible" path), OrchestraBench ambiguous delegation 0.30, Devin brief, owner "tudo mastigado" |
| [track](playbooks/maestro-lead/track/SKILL.md) | A seat returned, a task failed, or cards are in flight | Card fields and Maestro's per-card block; stall count in the step's `now`; return handling | Magentic-One ledgers and stall threshold, AutoGen's decrement, OpenHands and Roo loop limits, OrchestraBench latent faults 0.0 |
| [land](playbooks/maestro-lead/land/SKILL.md) | A done return, or verified work waiting to publish | Checks run by Maestro, write-set diff, cold review that breaks the test, PR and merge under the session grant, card through Review to Shipped | False success 45–48% in τ² retail and airline, judges ≤ 0.65 AUROC; MAST +15.6 for verification; Goose and Cline verify in code |
| [report](playbooks/maestro-lead/report/SKILL.md) + [goldens](playbooks/maestro-lead/report/goldens.md) | Before any message to the owner | One of eight shapes | [owner voice](owner-voice.md), [owner evidence](owner-evidence.md), research/16 |

## What changed from the first draft

The first draft had 14 sub-leaves. They are folded into five, because each sub-leaf was too thin to stand alone:

- `intake/frame` and `intake/route` became `intake`.
- `dispatch/packet` and `dispatch/parallel` became `dispatch`. Brief-back was dropped: a packet that leaves nothing to
  decide needs no restatement, and the refusal checks catch what brief-back would.
- `track/ledger`, `track/board` and `track/unblock` became `track`. The card fields and Maestro's per-card block are the ledger, rewritten, not
  appended.
- `land/verify`, `land/fix-loop` and `land/integrate` became `land`. A failed check counts toward the stall limit of 2
  instead of a separate two-round loop.
- `report/owner` and `report/digest` became `report`. `report/retro` is deferred until Atlas memory reaches Maestro
  (integration 9).

## Packet

Defined in [dispatch](playbooks/maestro-lead/dispatch/SKILL.md). It sits inside the brief shape `task` lists for each
execution seat; `jimmy` gets a question, a scope and the lowest `effort` that answers. Against the first draft it adds:

- **Budget**: the turn or time limit, and what to return when it runs out. Advisory: `task` has no input that
  enforces it.
- **If impossible**: the sanctioned way to say the task cannot be done, and a ban on weakening a check.
- **Done when** replaces "Acceptance", and must be a check Maestro can run itself.

## The card ledger

Magentic-One's facts and progress ledgers, split by who may read them. The card body and steps are mirrored to GitHub
(`MIRRORED`, `packages/core/src/board/board.ts:121`) and the body is replaced whole, so neither holds working state.
What must survive compaction sits in what is not mirrored: `crash_reason` marks a card at the stall limit
(`packages/schema/src/board.ts:560-575`), and a decision Maestro took alone is the `reason` of the board write that
applies it, which the card's activity returns. `attempts` stays the board's count of tries out of 3. `board_decision`
only records what came of an owner's answered question. The write set and stall count go in the building step's `now`, which GitHub does not
show (`render`, `github.ts:578`). Facts, guesses, evidence and flaky checks
stay in Maestro's Session and are rebuilt from the board, the worktree and the checks after a compaction. Evidence
reaches the owner in the PR description.

## Return vocabulary (all seats)

Governance already fills `structured.workResult` for the backend seat, `archie` and `jimmy`
(`modules/maestro/coordination/src/v2/governance/work-result.ts`): `outcome` done or blocked, and a terminal reason
ended, blocked or failed. That record does not reach Maestro's context: `toModelOutput` sends only the text (`packages/core/src/tool/task.ts:85-87`), and background returns are text only. Maestro classifies the text and return card. It maps the
return into four outcomes:

| Outcome | Meaning | Maestro's next step |
|---|---|---|
| done | Done when is met, with evidence | `land` |
| blocked | A missing resource or fact, or the task is impossible | `track` |
| needs decision | A choice outside the packet | `track`: decide if local and cheap to undo, otherwise ask the owner |
| failed | Tried and could not | `track`: retry once only a loud error; otherwise re-brief |

Integration 11 ships with the tree: `workResult` gains the two outcomes it lacks, needs decision and failed, every
seat with a return card fills it, and `toModelOutput` and the background return include it, so classification stops
being a guess. A done shows as "not independently verified" until `land`
passes, as Kilo labels it.

## Mapping from today's playbooks

- `frame-request` stays. It is the governed intake, and `maestro-run-governed` needs its admission JSON. `intake` is the
  ungoverned intake.
- `maestro-run/loop` is removed, so two loops with different rules never ship side by side. Its rules move:
  concurrency from host capacity and one worktree per writing card go to `dispatch`; no
  repository-wide `reset --hard` or `clean -fd`, and reading evidence before resuming go to `track`. The arsenal
  wave tools stay in `maestro-repo`.
- `maestro-run/verify` stays. `land` loads it for governed work.
- `maestro-run/governed` stays as it is.
- `maestro-plan` stays a Maestro playbook. `intake` routes an epic through it: `archie` authors, a cold review checks
  coverage, Maestro adopts.
- Shipped text names no repository's commands, releases or CI cadence; goldens use `<project test command>` and
  invented products.

## Prompt edits that ship with the tree

`maestro.txt` ranks above playbooks, so the tree lands with these edits in the same change:

1. **Playbooks line** (`maestro.txt:86`) names `maestro-lead` for ungoverned work, and `maestro-run` lists only
   governed and verify. The `maestro-run/SKILL.md` root drops its loop branch.
2. **Publish grant** (`maestro.txt:60`). The rule stays: commit, push, pull requests, merges and releases need the
   owner's request or a session grant. One line is added: ask for that grant once, with `question`, on the first
   verified result. The permission prompt then covers each call, with no second ask in chat (`maestro.txt:16`).
3. **Briefs.** No change: `archie` authors briefs, small ones included, and Maestro checks them.

Seats without skill trees (`skills: []`) are routed like any other; the tree says nothing about them.
