# I3: Board, dispatch and team execution as Maestro sees them

## Scope and baseline

- Worktree `/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical/.claude/worktrees/maestro-orchestration-skills-e8a06d`, branch `claude/maestro-orchestration-skills-e8a06d`, HEAD `de5cc963c6`, 2026-10-28.
- Read-only study. No tests, typecheck, builds or git writes were run. Claims are from reading source; nothing was executed.
- Sources: `docs/specs/projects-board/{CONTRACT,JOURNEYS,PLAN}.md`, `packages/core/src/board/*.ts`, `packages/schema/src/board.ts`, `packages/core/src/tool/task.ts`, `packages/core/src/agent/prompt/maestro.txt`, `modules/maestro/coordination/src/{roster.ts,route-grant.ts,seats/*.ts,seats/prompt/*.txt,v2/seats.ts,v2/governance.ts}`, `modules/maestro/coordination/playbooks/**`, `docs/specs/hugr-maestro/MAESTRO-100-CONTRACT.md`, `docs/specs/upstream-specialist/maestro-planning-handoff.md`.
- Fact versus inference is marked as **[F]** or **[I]**.

Headline: the board's invariants (proof before Shipped, hold, pause, reason, undo) are enforced in code, but almost every board transition is a manual Maestro call. Maestro's own prompt never mentions the board, so the tool descriptions are its only instruction. Several journeys that expect Maestro behavior have no mechanism at all.

## Spec-expected Maestro behavior

Columns: expected behavior | journey (JOURNEYS.md id, or CONTRACT section) | implemented mechanism | taught to Maestro (prompt, playbook, or tool description).

"Prompt" means `packages/core/src/agent/prompt/maestro.txt`. That file has zero occurrences of `board`, `board_*` or `Projects` **[F]**. No playbook under `modules/maestro/coordination/playbooks` mentions the board **[F]**.

| # | Expected Maestro behavior | Journey / spec | Implemented mechanism | Taught |
|---|---|---|---|---|
| 1 | Only Maestro writes the board; every write has a non-empty reason | CONTRACT §1.1, §4 | Guard `guard()` allows only `AgentV2.defaultID` (`packages/core/src/board/tools.ts:103-106`); reason is `Schema.Trim.check(isNonEmpty())` (`packages/schema/src/board.ts:520-522`) | Tool descriptions only |
| 2 | Read the board at the start of each turn with `since` | CONTRACT §4 ("Maestro's prompt says ... read `board_read` with `since` at the start of each turn", CONTRACT.md:171-172) | `board_read` (`tools.ts:34-40`); cursor (`schema/board.ts:336-337`, `526-530`); activity default 100 non-Maestro rows (CONTRACT §5, as built) | Tool description says pass `cursor` as `since` (`tools.ts:36`). **The promised prompt line is absent.** |
| 3 | Create an issue (lands in Backlog) with title, body, type, epic, seat, session, branch, PR, depends_on | §4, PLAN §1.1 | Create path sets `stage: "backlog"` (`packages/core/src/board/board.ts:784-835`) | Tool description (`tools.ts:54-60`) |
| 4 | Link branch, PR, session and seat to the card | §3, §4; J3 | Plain column writes (`board.ts:795-805`, `852-870`); no automatic link | Tool description lists the fields; nothing says where `session` comes from |
| 5 | Move a card, with proof: Review needs a PR, Shipped needs the PR merged | §1.5, J3-F1, J33 | Review checks only that `pr_number` is non-null (`board.ts:915-916`); Shipped re-reads the PR live and refuses if not merged (`board.ts:896-935`, `934-935`) | Tool description (`tools.ts:61-63`) |
| 6 | Shipped without a PR only with a reason | §1.5 | Accepted when `pr_number` is null (`board.ts:921` branch skipped); reason only checked for non-empty | Tool description |
| 7 | Intake is the owner's; Maestro cannot move a card into it | §4 | Refused into intake (`board.ts:893-895`) and out of intake (`board.ts:914`, "the owner accepts or declines it first") | Tool description (`tools.ts:63`) |
| 8 | Hold before merge blocks Shipped and "do not merge its PR" | §1.6, J32-H2, J16-E1 | Refused with "Do not merge its PR" text (`board.ts:917-920`) | Refusal text only |
| 9 | Pause stops Maestro writes except `board_question` | §1.7, J16-H1 | `requireActive()` (`board.ts:353-365`, owner-paused project and issue) applied to issue, move, steps, epic and project writes (`board.ts:733`, `788`, `852`, `912`, `974`); question exempt (`board.ts:998-1000` comment) | Tool description for question says "Works while the project is paused" (`tools.ts:76`) |
| 10 | Steps replaced as a list; at most one `active`; `now` is the live line | §3 board_step, J2-H1, J3 | `steps()` rejects >1 active (`board.ts:968-969`) and requires not paused (`board.ts:974`) | Tool description (`tools.ts:68-73`) |
| 11 | Ask the owner with 2-4 options, recommended option, cost of waiting, blocking flag, instead of chat | §4, J4-H1, J14-H2, J19-E1 | `question()` ask path (`board.ts:1040-1052`); schema `QuestionInput` (`schema/board.ts:599`) | Tool description (`tools.ts:74-80`). **Maestro's prompt teaches only the generic chat `question` tool** (`maestro.txt:12`), which is a different tool; nothing tells Maestro to use `board_question` instead of it. |
| 12 | Withdraw a stale question with a reason | J4-E2 | Withdraw path (`board.ts:1003-1012`) | Tool description |
| 13 | After an owner answer, Maestro resumes the work ("LCH-63 resumed 09:14") | J4-H1, J4-F1 | Answer writes status `answered` (`board.ts:1060-1088`). A blocking open question stops counting in forecast once answered (`shared.ts:170-176`). **Nothing wakes Maestro**: no `SessionExecution`/`sessions.prompt` call in `packages/core/src/board/` (grep: no matches) **[F]** | None |
| 14 | Record what came of a decision | J20-H1 | `board_decision` (`tools.ts:89-95`) → `decisionOutcome` (`board.ts:1100-1102`) | Tool description |
| 15 | Maestro is told when the owner undoes or contests its action | J7-H1 | Undo is owner-only (`board.ts:1245`); the undo row is an owner activity and appears in `board_read since` (`board.ts:583-630`) | Not taught; visible only if Maestro reads |
| 16 | Maestro answers owner notes, corrections, and asks back on a question thread | J6-H1, J6-E1, J4-E1, J30 | **No Maestro note tool.** The `board_*` list (`tools.ts:34-95`) has no note write. `note()` is owner-only (`board.ts:1108-1115`). GitHub notes are authored `github:<login>` (`github.ts:432-447`) | None |
| 17 | "Note delivered to backend at 14:06"; "Not read yet" after one cycle | J6-H2, J6-F1 | No delivery or acknowledgement state in `packages/core/src/board/` (grep for delivered/ack: none) **[F]** | None |
| 18 | Triage a new GitHub issue into a proposed card with type, epic and reason; intake waits for the owner | J31-H1, J31-E1, §6 | Intake created from GitHub with stage `intake` (`github.ts:325-344`); Maestro may then edit type and epic through `board_issue` (no stage guard in `issue()`, `board.ts:784-870`) | Tool description only; no triage procedure |
| 19 | GitHub comment becomes a note Maestro reads | §6 | `comment()` inserts note `github:<login>` (`github.ts:432-447`); read via `board_read since` | Automatic |
| 20 | Closed or reopened GitHub issue raises a question to Maestro | §6 | `question.ask` with `blocking: false` (`github.ts:390-423`) | Automatic |
| 21 | Maestro asks before the budget is exceeded (90% of forecast) | J13-H2 | `evaluate()` inserts one question, actor `maestro`, kind `budget:<n>`, options raise/cut/continue (`money.ts:103-152`) | Automatic; Maestro does not write it |
| 22 | Warn at 80% | J13-H2, PLAN §2F | `WARN = 0.8` drives only the `warn` state (`spend.ts:12`, `money.ts` budget); no question, no notification | UI state only |
| 23 | At 100% new work pauses; project shows "Paused · budget" | J13-E2 | Refuses only a move into `building` from another stage (`money.ts:153-160`, applied at `board.ts:937`). **No code sets project `status` to paused for budget** (`board.ts` has only owner `pause`/`resume`, `board.ts:1296+`) | Tool description (`tools.ts:82-83`) and refusal text |
| 24 | Spend per card, epic, seat and model | J13-H1, J22-H3 | Read-time sum over `SessionTable.cost` for sessions linked by `issue.session_id` plus their child sessions (`money.ts:20-62`; `spend.ts:30-55`). Without a link: "no session linked" (`spend.ts:39-40`) | Tool description mentions `session` only |
| 25 | A card costing 3x its epic peers is flagged | J13-E1 | `flags()` (`spend.ts:82-93`), read-time | Automatic |
| 26 | Cheaper model suggestion as a question | J13-E3 | None. Spend by model exists (`spend.ts:33-37`), no suggestion logic **[F]** | None |
| 27 | Forecast slip: at risk after 2 consecutive late evaluations; cause named by Maestro | J14-H1, J14-F1 | Streak updated on each committed write (`money.ts:103-112`); `at_risk` (`board.ts:567`; `sql.ts:33`). Cause sentence is prose, not stored | Automatic streak; cause not taught |
| 28 | Recovery options offered as a question | J14-H2 | Manual via `board_question` only | Not taught |
| 29 | Attempts: show "attempt 2 of 3"; after 3 failures ask the owner | J19-H1, J19-E1 | `attempts` column and "of 3" display (`proof.ts:13`, `proof.ts:54`); tool field `attempts` (`schema/board.ts:570-571`). **No increment and no question at exhaustion** | Tool description mentions `attempts` (`tools.ts:56`) |
| 30 | Seat crash shows reason; Maestro restarts or reassigns; gap kept in history | J19-F1 | `crash_reason` field and proof display (`proof.ts:56`). No detection; the only signal is the `task` tool failure path (`packages/core/src/tool/task.ts`, "finished without a completed assistant reply") | Tool description (`tools.ts:56`); no link from the task failure to the field |
| 31 | Guardrail block shown in plain words | J19-E2 | `guardrail_rule` set by Maestro; plain summary via `ruleSummary` (`board.ts:649`, `343`) | Tool description |
| 32 | CI red names the failing check | J19-H1 | Live trail, `failing` check name (`proof.ts:52`) from `pull-request.ts` | Automatic on read |
| 33 | Stale-activity warning ("No activity for 40 min") | J2-F2 | None. grep for stall/activity timing in `packages/core/src/board/`: no match **[F]** | None |
| 34 | Card says "Status out of date: PR closed" and Maestro restages within one cycle | J3-F1 | Proof shows PR state (`proof.ts:40-47`). Nothing compares stage with PR state or schedules a Maestro turn | None |
| 35 | Split or merge a card; tombstone for the old ref | J3-F2, J7-H2 | No split, merge or tombstone code in `packages/core/src/board/` **[F]** | None |
| 36 | Morning digest, three sentences, names cards | J1-H1 | None: no digest tool or store; chat only **[I]** | None |
| 37 | Project shipped when last card ships; retro; leftover question | J24-H1, J24-E1 | No code sets project `status: shipped` (grep: none) | None |
| 38 | Ask for new work; propose cards, create only after acceptance | J17-H1, J9-H2 ("Start?") | No proposal entity. `issue()` creates directly in Backlog (`board.ts:784-835`); `move()` to `ready` or `building` needs no owner approval (`board.ts:892-937`) | None |
| 39 | Dependency across projects, cycle refused | J29, CONTRACT §3 | `setDependencies` with cycle check (`board.ts`, `reaches()` at `board.ts:1491-`); `depends_on` in `tools.ts:54-60` | Tool description |
| 40 | Owner-declared hold or pause is honored, and Maestro never overrides it | §1.6-1.7 | Enforced in write paths (see rows 8-9) | Refusal text |

## Automatic vs manual transitions

### Automatic (code, no Maestro call)

- Forecast and streak recomputed on every committed board write (`money.ts:103-112`; `board.ts:145` tap evaluates); `at_risk` at streak 2 (`board.ts:567`, `sql.ts:33`).
- Budget forecast question at 90% (`money.ts:103-152`), actor `maestro` but written by service code.
- Spend accrues without a Maestro call, but only for a session Maestro has linked as `session_id`. Child sessions are included by `parent_id` (`money.ts:31-45`). Subscription engines (`claude-code`) are "not metered" (`spend.ts:10`, `:127-129`).
- CI minutes cached on a 60 second poll (`board.ts:508-530`, `github.ts:122-207`, `CI_TTL` at `github.ts:124`). Read-time only.
- PR and CI trail read live with a 30 second cache (`board.ts:119`, `board.ts:202-232`). Not stored.
- GitHub pull, intake, comment-to-note, closed-to-question (`github.ts:250-447`); push of dirty cards (`board.ts:492`, `870`).
- Forecast and the 3x flag are computed on read (`spend.ts:82-93`; CONTRACT §3, "computed on read, never stored").

### Manual (requires a Maestro call, or an owner call)

- Any stage change, including Review and Shipped (`board.ts:892-937`). The proof gate runs only when Maestro calls `board_move`.
- Linking `branch`, `pr`, `session`, `seat` (`board.ts:795-805`, `852-870`). `pr` is not checked against GitHub: any positive number is accepted for Review.
- `steps` and `now` (`board.ts:967-1000`).
- `attempts`, `crash_reason`, `guardrail_rule` (`board.ts:802-804`, `826`).
- Questions, withdraw, decision outcome (`board.ts:998-1012`, `1100-1102`).
- Epics and projects, target date and budget (`board.ts:1104-1106`, `tools.ts:81-88`).

### Explicit non-automatic cases (checked)

- **Dispatching a `task`:** no link. `packages/core/src/tool/task.ts` does not import the board. The only identifier it emits is `task_id: <child sessionID>` in the tool result (`task.ts:86`). Maestro must copy it into `board_issue.session` and the agent id into `seat`. The `seat` field is free text; nothing validates it against the roster, because `packages/core/src/board/` has no roster reference (grep: none) **[F]**.
- **Merged PR to Shipped:** no hook. Shipped happens only when Maestro calls `board_move` with stage `shipped`, and then only if the live check shows `merged` (`board.ts:921-935`).
- **Seat crash to `crash_reason`:** no link. `crash_reason` is written only through `board_issue`.
- **Budget 100%:** blocks only new moves into `building` (`money.ts:153-160`). The project status is unchanged, so "Paused · budget" (J13-E2) is not implemented.
- **Owner answer to Maestro:** no wake-up. The answer is recorded and Maestro sees it only at its next `board_read` **[F]**.

## Roster as Maestro sees it

- **Roster:** `roster.ts:182-192` builds `maestro` plus every entry in `Seats.all`. Each seat's `memberId`, `role`, `abilityClass`, `returnCard`, `forbiddenActions` and profile are in `roster.ts:194-209`.
- **Seat list in code** (`modules/maestro/coordination/src/seats/index.ts:19-30`): `backend`, `archie`, `patty`, `lucy`, `billy`, `jimmy`, `rosie`, `frankie`, `live`. The display label defaults are at `roster.ts:195-197`.
- **What Maestro sees through `task`:** each visible seat is registered as an agent with `name = label`, `description = Seats.all[id].description`, `mode = subagent` (`v2/seats.ts:96-103`). `live` is primary and not dispatchable (`seats/seat.ts:44-45`, `seats/live.ts`). The charter, including `Return card:` and `Forbidden:`, is the seat's own system prompt (`v2/seats.ts:96`, via `roster.renderPrompt`). Maestro does not see those lines unless it reads the route grant (`route-grant.ts:1-22`), which is used by review records (`v2/tools/review-records.ts`) **[F]**.
- **Built versus stub (skills and prompt length):**

| Seat | skills | writeRoots | Prompt | Status |
|---|---|---|---|---|
| `backend` | 8 entries (`seats/backend.ts`, tree at `modules/specialists/backend/skills`) | true | 64 lines | Built |
| `archie` | `archie-plan`, `archie-work-package` (`modules/specialists/archie/skills`) | true | 26 lines | Built (named archie; the handoff says walt) |
| `jimmy` | `jimmy-calibration`, `jimmy-web-research` (`packages/jimmy-specialist/skills`) | false | 22 lines | Built, research engine |
| `patty` | `[]` | false | 5 lines (`seats/prompt/patty.txt`) | Stub |
| `lucy` | `[]` | false | 5 lines | Stub |
| `billy` | `[]` | false | 5 lines | Stub |
| `rosie` | `[]` | false | 5 lines | Stub |
| `frankie` | `[]` | false | 5 lines | Stub |
| `live` | `[]` | false | 28 lines | Direct seat, not dispatchable |

- **Write scope binding:** `writePaths` are bound only for seats with `writeRoots` true (`v2/governance.ts:110`). Four execution-profile seats (`patty`, `rosie`) therefore get no bound write roots even though the base execution profile allows `edit` (`roster.ts:45`) **[F]**. Whether that is intended is an open question.
- **Forbidden actions:** the seat-level lists are in `seats/*.ts` (`forbiddenActions`), mirrored in the charters (`seats/prompt/*.txt`, "Forbidden:" lines).

## Promised versus built

| Promised | Source | Built | Evidence |
|---|---|---|---|
| Maestro prompt says what tools cannot, including reading `board_read since` each turn and asking through `board_question` | CONTRACT §4 (CONTRACT.md:171-172) | No | `maestro.txt` has no board text |
| Playbook or prompt teaches board use | CONTRACT §4, PLAN §1.1 | No | No playbook matches |
| Maestro tools: create, update, move, steps, question, read, settings, decision | CONTRACT §4 | Yes, all eight plus `board_decision` | `tools.ts:34-95` |
| Proof before Review and Shipped | CONTRACT §1.5 | Yes, at move time only | `board.ts:912-935` |
| Hold and pause enforced for Maestro | CONTRACT §1.6-1.7 | Yes | `board.ts:353-365`, `917-920` |
| Undo of Maestro actions, inverse entry, "changed since" refusal | CONTRACT §3 | Yes, owner-only | `board.ts:122`, `1245-1256` |
| Budget warn at 80%, pause at 100% of new work | CONTRACT, PLAN §2F, J13-E2 | Partly: 90% forecast question, 100% blocks new building moves | `money.ts:103-160`; no status change, no 80% question |
| Dispatch links the child session to the card | Implied by §3 `session_id` and J13 spend | No | `task.ts` has no board reference |
| Merged PR moves a card to Shipped | Implied by §1.5 and J3 | No, Maestro must call `board_move` | `board.ts:921-935` is reached only from `move()` |
| Crash, attempts and guardrail fields feed the card | J19 | Fields only | `proof.ts:13-58`; no writer |
| Attempts exhausted becomes a question | J19-E1 | No | none |
| Maestro writes notes or replies on the thread | J6, J4-E1, J30, J32 | No tool | `tools.ts:34-95` |
| Owner answers wake Maestro | J4-H1 "resumed" | No | no wake call in `packages/core/src/board/` |
| GitHub Project #2 as operational ledger with Stage/Status/Seat fields | MAESTRO-100 "GitHub Operational Ledger" (`MAESTRO-100-CONTRACT.md:255-306`) | No product code calls `gh project` or Projects v2 **[F]** (a grep for `gh project`, `projects/2`, `PVTSSF` in product source hit only test files, which were not inspected) | PLAN §4 says "Not in v1: GitHub Projects (v2 boards) sync" (`PLAN.md`, section 4) |
| Team roster: eight specialists including `bobby` (architecture) | MAESTRO-100 Team table (`MAESTRO-100-CONTRACT.md:207-225`) | `bobby` absent; `archie` and `live` present | `seats/index.ts:19-30` |
| Upstream seat named `walt` | `maestro-planning-handoff.md:14-16` | Active id is `archie` (naming correction) | `seats/archie.ts:4`, `docs/specs/upstream-specialist/NAMING-CORRECTION.md` |
| Seat ids in board examples: `backend`, `frontend`, `review` | CONTRACT §3, J-ground rules | Ids are `backend`, `patty`, `lucy` | `roster.ts:182-192`, `seats/*.ts` |
| Upstream planning authorship through `task` with the `upstream` profile, not installed | handoff status line (`maestro-planning-handoff.md:7-9`) | Partly: `maestro.txt:38` routes planning to `archie`; the handoff says the replacement "is not installed" | `maestro.txt:38`, handoff lines 7-9 |

## Gaps

Ordered by how much they break the Maestro-board loop.

1. **Maestro is not taught the board.** `maestro.txt` says nothing about `board_*`. No playbook covers it. Maestro's only guide is tool descriptions. Worse, `maestro.txt:12` teaches the generic `question` tool for owner questions, so Maestro may ask in chat instead of `board_question` (CONTRACT §4 says ask "through `board_question` instead of chat").
2. **No dispatch-to-card link.** `task` returns `task_id: <sessionID>` (`task.ts:86`). Nothing copies it to `session` or the seat id to `seat`, and `seat` is not validated (no roster reference in `packages/core/src/board/`). Spend, the live trail and the seat column all depend on Maestro doing this by hand.
3. **Proof transitions are manual.** No hook on PR merge, no check that a Review card's PR is open (`board.ts:916` checks only non-null), and no re-check when a PR closes unmerged (J3-F1). `pr` is accepted without a GitHub read.
4. **Maestro cannot write notes.** The owner's notes reach Maestro only through `board_read since`. Maestro cannot reply on a card, answer corrections (J30), or answer a question thread (J4-E1). No "Maestro reads every note" proof exists (J6-F1).
5. **No wake-up.** An owner answer, note or undo does not start a Maestro turn (no `SessionExecution` call in the board package **[F]**). Until Maestro runs for another reason, a blocking question sits unseen.
6. **Crash, attempts and guardrail have no writer.** `crash_reason` and `attempts` change only when Maestro calls `board_issue`. Attempts never trigger the owner question (J19-E1). A crashed `task` produces only a tool failure (`task.ts`, "finished without a completed assistant reply"), with no link to the card.
7. **No approval gate for starting work.** Moves to `ready` and `building` need no owner yes (`board.ts:892-937`). J9-H2 ("Nothing runs until I say yes") and J17-H1 ("creates them only after I accept") are not enforced.
8. **Budget is partial.** 80% is a UI state only (`spend.ts:12`). At 100% only new building moves are refused, and the project is not marked paused (J13-E2). No cheaper-model question (J13-E3).
9. **Missing mechanisms with no code path:** stall detection (J2-F2), split, merge and tombstone (J3-F2, J7-H2), revert (J7-E1), digest (J1), retro and leftovers (J24), answer-failed path (J4-F1), note delivery and acknowledgement (J6-H2, J6-F1), intake triage with dedup and flood grouping (J31-E1, E2).
10. **Two ledgers.** MAESTRO-100 names GitHub Project #2 as operational truth (`MAESTRO-100-CONTRACT.md:255-306`). The board uses native GitHub Issues and explicitly excludes Projects v2 (PLAN §4). The code implements only the second. Which one Maestro's governed flow should trust is undecided in the docs.
11. **Roster drift.** Spec and handoff use `bobby`, `walt`, `frontend`, `review`. Code has `archie`, `patty`, `lucy`, plus `live`, and no `bobby` (`seats/index.ts:19-30`). CONTRACT section 2 says seats are ids, but the example ids in CONTRACT and JOURNEYS (`backend`, `frontend`, `review`) do not match live ids.
12. **Built seats are three of nine.** Only `backend`, `archie` and `jimmy` have skill trees. The other five (`patty`, `lucy`, `billy`, `rosie`, `frankie`) have 5-line charters and no skills. Maestro dispatching them gets a bare charter.

## Open questions

1. Is `BoardTools.node` active in the default Maestro runtime, or only on the V2 path? It is registered in `modules/maestro/coordination/src/v2/seats.ts:241` **[F]**; I did not trace V1 or Claude-mode registration.
2. Does `task`'s agent list carry each seat's `description` to Maestro's model context (`v2/seats.ts:96-103`)? The code assigns it; I did not verify the rendered tool listing.
3. Which write scope do `patty` and `rosie` (`writeRoots: false`) get for `writePaths`? `v2/governance.ts:110` binds them only for `writeRoots` seats. Is that intended, or does the base execution profile govern?
4. Should the owner's answer wake Maestro? Nothing does today. Is a scheduled `board_read` at turn start (CONTRACT §4) meant to cover it?
5. Is `board_question` supposed to replace chat questions for Maestro (CONTRACT §4) given `maestro.txt:12` teaches the generic `question`? Which one is the owner-facing path?
6. Does the Projects board ever become the MAESTRO-100 GitHub Project #2 ledger, or does it stay separate? PLAN §4 excludes Projects v2 sync.
7. Is a Shipped move without a PR (`board.ts:921`) allowed with any reason, or should a reason category be checked?
8. Where do the 40-minute stall rule (J2-F2) and the digest (J1) belong: a service field, or Maestro's prompt? Neither exists.
