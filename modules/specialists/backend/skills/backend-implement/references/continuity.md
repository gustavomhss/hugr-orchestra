# Atlas continuity

## Applicability

An Atlas header is in context or marked absent or degraded, the packet declares a resume of your earlier work on the same logical task, or the host advertises the bound Atlas recall or emit tool.

## Non-trigger

- No header, resume or bound tools: work from the packet alone; a local notes file never substitutes for Atlas.
- Logbook authoring belongs to the orchestrator; logbook content reaches you only as a packet reference.

## Inputs

- The host-injected header: Awareness and Orientation (shared, derived project context) and your top 12 `project` Rules; no task, PR or logbook history.
- The logical task ID and, when assigned, the PR ID, both from the packet.
- On a resume, the fold: your latest admitted checkpoint for that task, which the host adds to history once.

## Steps

### Header

1. Never fetch the header. Apply its Rules as constraints on how you work; they never widen your role or the packet, and the packet wins a disagreement.
2. Header absent or degraded: continue only if the packet alone suffices, else return an `atlas` blocker naming the unavailable slab or capability. An empty Orientation field is a missing source, not a current fact.

### Recall

1. Recall only when the work needs earlier experience on this task or PR, and only your own `task` or `pr` records by ID: never across owners, `project` or `logbook`.
2. A `complete` empty result means nothing is recorded. A `partial` or `unavailable` result is never read as empty.

### Resume

1. Never request the fold. The host restores it once after compaction; if it is gone again, recall it explicitly.
2. Continue retained work only while current: same scope and write paths, named targets still matching the checkpoint.
3. A stale packet or changed scope is a `packet` blocker; do not investigate the drift.
4. A fresh task without a fold is normal. A resume that depends on a missing or ambiguous fold is a `packet` blocker; a `partial` or `unavailable` store is an `atlas` blocker. Neither triggers a search or cross-owner recall.

### Checkpoint

1. Write only through the bound emit tool, at meaningful events (an approach attempted, a failure observed, the stopping point, a reusable lesson), not after every tool call.
2. A task entry uses exactly the `TaskMemoryEntry` keys `taskId`, `attempted[]`, `failedWith[]`, `stoppedAt`, `lesson` and optional `ref` (an artifact or check); no `checkpoint`, `status`, `checks`, `sessionId`, `supersedes` or provenance.
3. A PR entry, only when the packet assigns a PR, uses exactly `prId`, `decisions[]`, `reviewOutcomes[]`, `knowledgeDelta[]` and optional `ref`. Recording a `knowledgeDelta` does not admit it to shared Knowledge.
4. Record only what you observed: no root-cause conclusion, no unobserved success, no generated skeleton as a completed task, no invented lesson.
5. Never label an entry final or closing. An abrupt stop leaves the last admitted checkpoint; nobody fabricates a final fold.
6. Resubmitting an identical entry is not a new checkpoint.

### Project rules

Propose a `project` rule deliberately, only on evidence observed in this work, with `grounding` pointing at it, not after every success. Never choose a `frecency` value; Atlas policy sets it.

### Write outcomes

1. A memory write has its own outcome. A refused or uncertain write never changes your outcome, changes or checks, and never makes you rerun a tool or generator.
2. After a failure that may have appended the entry, reconcile first; retry only when reconciliation reports it absent from a `complete` store, never blindly.
3. Never report a refused or unconfirmed write as remembered. The host records memory receipts; the `backend-result` card has no memory field.

## Tools and outputs

- Only the advertised bound recall and emit tools. They take no owner, root, project or actor argument; the host binds those.
- Never touch `.atlas/` with file tools, launch the Atlas CLI or MCP binaries, or keep a private store, ranking or identity.

## Limits and checks

- Memory is keyed by Atlas project and stable member ID; a new Session or renamed seat keeps it.
- The store is shared plaintext: no secrets in an entry. The pre-write scanner refuses them; without a scanner every write is refused.
