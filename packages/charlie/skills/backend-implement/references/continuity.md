# Atlas continuity

## Applicability

- An Atlas header is in context, or the host marks it absent or degraded.
- The packet declares a resume of work you did before on the same logical task.
- The host advertises the bound Atlas recall or emit tool to you.

## Non-trigger

- No header, no resume and no bound tools: work from the packet alone. There is nothing to simulate, and a local notes file is never a substitute for Atlas.
- Orchestrator logbook authoring: that belongs to the orchestrator. Logbook content reaches you only as a reference in the packet.

## Inputs

- The header the host injects: Awareness and Orientation (shared, derived project context) and your own top 12 `project` Rules. Task, PR and logbook history are not in it.
- The logical task ID and, when assigned, the PR ID, both from the packet.
- On a resume, the resume fold: your latest admitted checkpoint for that task, which the host adds to history once.

## Steps

### Header

1. Never fetch the header yourself; the host injects it.
2. Apply the Rules as constraints on how you work. They never widen your role or the packet, and the packet wins where they disagree.
3. Header absent or degraded: continue only if the packet alone is enough for the change. Otherwise return an `atlas` blocker that names the unavailable slab or capability. An empty Orientation field is a missing source, not a current fact.

### Recall

1. Recall only when the assigned work needs earlier experience on this task or PR, and only your own `task` or `pr` records by their ID.
2. Never recall across owners, and never recall `project` or `logbook` records.
3. A `complete` empty result means nothing is recorded. A `partial` or `unavailable` result is never read as empty.

### Resume

1. The host admits the resume fold once. Do not ask for it again. If compaction has removed it from context, recall it explicitly.
2. Continue from the retained work only while it is still current: the same scope and write paths, and named targets that still match what the checkpoint describes.
3. A stale packet or a changed scope is a `packet` blocker. Do not investigate the drift.
4. A fresh task with no fold is normal. When the packet's resume depends on prior context and the fold is missing or ambiguous, return a `packet` blocker; when the store is `partial` or `unavailable`, return an `atlas` blocker. Neither triggers a search or a recall across owners.

### Checkpoint

1. Write only through the bound emit tool, and only at meaningful events: an approach attempted, a failure observed, the stopping point, a reusable lesson. Not after every tool call.
2. A task entry uses exactly the `TaskMemoryEntry` keys: `taskId`, `attempted[]`, `failedWith[]`, `stoppedAt`, `lesson`, and optional `ref` pointing at an artifact or check. Add no other key: no `checkpoint`, `status`, `checks`, `sessionId`, `supersedes` or provenance.
3. A PR entry, only when the packet assigns a PR identity, uses exactly `prId`, `decisions[]`, `reviewOutcomes[]`, `knowledgeDelta[]` and optional `ref`. Recording a `knowledgeDelta` does not admit it to shared Knowledge.
4. Record only what you observed. No root-cause conclusion, no unobserved success, and never a generated skeleton recorded as a completed task. A missing lesson is not permission to invent one.
5. Never write an entry labelled final or closing. An abrupt stop leaves the last admitted checkpoint, and neither you nor the host fabricates a final fold.
6. Resubmitting an identical entry is not a new checkpoint.

### Project rules

1. Propose a `project` rule deliberately, only on evidence observed in this work, with `grounding` pointing at that evidence. Not after every success.
2. Never choose a `frecency` value. Atlas policy sets it.

### Write outcomes

1. A memory write has its own outcome, separate from the change and the checks. A refused or uncertain write never changes your outcome, your changes or your check results, and never makes you rerun a tool or generator to recreate a note.
2. After a failure where the entry may have been appended, reconcile before any retry. Retry only when reconciliation reports the entry absent from a `complete` store. Never append the same entry blindly again.
3. Never report a refused or unconfirmed write as remembered. The host records memory receipts; the `charlie-result` card has no memory field.

## Tools and outputs

- Only the bound recall and emit tools, and only when they are advertised. They take no owner, root, project or actor argument; the host binds those.
- Never read or edit `.atlas/` files with file tools, never launch the Atlas CLI or MCP binaries, and never keep a private store, ranking or identity.

## Limits and checks

- Memory is scoped by Atlas project and stable member ID. A new Session or a renamed seat keeps the same memory.
- The store is shared plaintext, not confidential. Never put secrets in an entry; the pre-write scanner refuses them, and without a scanner every write is refused.
