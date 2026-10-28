# Maestro native integrations

Status: proposal. Each change states what exists today (with a code anchor), what changes and why. They are in order of
value per cost.

| # | Integration | Today | Change |
|---|---|---|---|
| 1 | `task` ↔ board | `task` input is `description`, `prompt`, `subagent_type`, `model?`, `task_id?`, `directory?` (`packages/core/src/tool/task.ts`); it never touches the board | Optional `issue`. The host links the child Session to the card, sets the seat and moves Ready to Building. A crash sets `crash_reason`. |
| 2 | Move on facts | `board_move` checks the merge proof (`packages/core/src/board/github.ts`) | A linked PR moves its card to Review, and a merged PR moves it to Shipped, under the same proof. A revert flags the card; it does not move it. |
| 3 | `board_note` | none | Maestro writes notes on a card and answers the owner's notes. Notes are mirrored to GitHub, so the working ledger stays out of them. |
| 4 | Wake on owner action | `board_question` answers, hold releases and project resumes only write rows and activity (asked at `board.ts:1043`, answered at `:1078`); nothing prompts Maestro | Each of these admits a prompt to Maestro's Session and wakes it, through the admit-only `SessionV2.prompt` path. Until then the playbooks ask with `question` or tell the owner to message Maestro. |
| 5 | Stall signal | none | Each card in Building carries a stall count: +1 for a check with no new child-Session activity or artifact, or with the same error again; −1, floored at 0, for progress (Magentic-One). At 2 the card shows as at-risk and Maestro must write a cause before acting. It never retries on its own. |
| 6 | Digest | `board_read` with `since` | `board_read` returns a `digest` shape: shipped, waiting, blocked, at risk, spend. |
| 7 | Roster in `task` text | `ToolText.task` is static (`packages/core/src/tool/text.ts:13-18`) | The description lists each visible seat with its role and brief shape. Being tool text, it reaches Claude mode too. |
| 8 | Decision card fields | `board_question` takes `text`, 2–4 `options`, `recommended`, `cost_of_waiting?`, `blocking?`, and a required `reason`, plus `issue` and `epic` (`packages/schema/src/board.ts:599-618`) | Add a required `why`, `reversible` and `meanwhile`. Cap `options` at 3. Chat `question` gets the same fields when Maestro asks. This enforces the [owner voice](owner-voice.md). |
| 9 | Atlas memory for Maestro | Only seats with `atlasMemory: true` get `atlas_memory_*` (`modules/maestro/coordination/src/v2/seats.ts:212-216`), and Maestro is not a seat, so it has none | Grant recall and emit to `AgentV2.defaultID`. This holds owner preferences, retro lessons and routing history across Sessions. |
| 10 | PR and CI status | The board's `gh` runner exists only for the mirror and the merge proof | A read-only `board_pr` (or a field on `board_read`) gives PR state, checks and review state per linked card. Maestro then stops shelling out to `gh` for status. |
| 11 | Structured return | Governance fills `structured.workResult` with `outcome` done or blocked and a terminal reason for the backend seat, `archie` and `jimmy` (`modules/maestro/coordination/src/v2/governance/work-result.ts:18`) | Add needs decision and failed, plus `evidence[]` and `not_covered[]`, and fill it for every seat with a return card. Until `land` passes, the app labels a done "not independently verified". The return vocabulary lives in [skills](skills.md#return-vocabulary-all-seats). |
| 12 | Arsenal placement | The arsenal goes to Maestro and `archie` (`seats.ts:207-208`) | Authoring operations (`decompose`, `stub-gen`, `move-in`, `repo-mapper`) go to `archie` only. Maestro keeps the scheduling and checking operations. |
| 13 | Honest limits | The owner learns caps (agents, depth, budget) only when work hits them | `board_read` and the digest show the effective limits in force: agent cap, depth, budget left. |
| 14 | Owner attention budget | none | The app counts owner questions per request and flags a second one, and flags any question whose `reversible` is yes and cost is low. |
| 15 | Control vs owner messages | Seat results and owner messages arrive as the same kind of prompt | Seat returns, CI events and owner text are labelled by source in Maestro's Session, so a seat's text never reads as the owner's word. |
| 16 | Card worktree (done in this change) | `task` had no directory input, so every child ran in the parent's directory | Optional `directory`: the absolute root of another git worktree of the same repository. Task checks it with `Project.resolve`, the child Session runs there, and write roots and settle use that worktree. Maestro creates the worktree; seats never do. |

What stays out:

- No new store. The board and Sessions are the state.
- No auto-retry and no framework runtime ([strategy](strategy.md)).
- No crash replay of provider work until its own design exists (AGENTS.md, V2 Session Core).

## Gaps nobody fills

[research/14](research/14-products-primary.md) found nine things no shipped lead agent does. Seven close in code, two
only in the playbooks:

| Gap | Closed by |
|---|---|
| Stall detection | 5, `track` |
| Verifying a worker's done | 11, `land` |
| Brief completeness enforced | `dispatch` refusal checks |
| Worker noise reaching the human | 11 (120-word return), `report` |
| Control vs human messages | 15 |
| Effective limits shown | 13 |
| One decision inbox | 8 with 3 (board questions and notes) |
| Report checked against the brief | `land` |
| Cadence tuned to the human | 14, `report` status line |

First slice, as recommended: integrations 7, 8 and 11 (tool text and schemas only), then 5, 1 and 2.
