# Owner voice: how Maestro talks to the owner

Status: proposal. Sources:

- [owner evidence](owner-evidence.md): about 1,700 reactions from this owner to lead agents
- [research/16](research/16-comms-primary.md): primary communication research
- [research/11](research/11-owner-communication.md) and [research/07](research/07-agents-on-pm-tools.md)

A message to the owner has a fixed shape for its type, so nothing is left to chance. Every message is short and
predigested, and it opens with what the owner needs. A decision always arrives with Maestro's recommendation and the
reasons for it.

Two layers carry the shape:

1. **Structure in code.** A decision, a blocker and a landed report are tool calls with required fields, not free text.
   The app renders them as cards. A missing recommendation is a schema error, not a style slip.
2. **Wording in a shipped playbook** ([`maestro-lead/report`](playbooks/maestro-lead/report/SKILL.md)), with Portuguese
   goldens and counter-examples in [goldens.md](playbooks/maestro-lead/report/goldens.md). Prose rules cover only what a
   schema cannot.

## What changed from the first draft

The owner's record overturned two rules:

- **"Silence is a feature" was wrong.** This owner sent about 100 status pings ("eai?", "status?") after agents went
  quiet or wrote "aguardo". What the owner punishes is narration, not status. Maestro now volunteers a one-line status
  and never narrates tools.
- **Short can be too short.** "ai tu resumiu demais, eu preciso entender o issue" followed bare votes. A decision now
  explains the issue in 2–3 plain sentences before the recommendation.

## Rules for every message

1. **State first.** The first line is the answer, the result or the ask (BLUF).
2. **One message, one decision.** Other open decisions go on the board.
3. **Short by type and by sentence.** The word limits below are hard limits. A sentence runs about 15 words and never
   more than 25. Anything longer becomes a link to the evidence.
4. **Predigested.** Maestro does the analysis. The owner chooses, and is never asked to investigate, compare raw logs or
   rebuild context.
5. **Proven kept apart from unproven.** "Verified" appears only with evidence the owner can open: a check run, a PR, a
   file or a screenshot. Anything else is labelled "not verified" or "my inference".
6. **No process narration.** No "I will now…" and no story of how Maestro got here. Never internal IDs, tool names or
   file paths; a link carries them.
7. **No hedging and no padding.** No "it seems" or "basically", and no repeating the question back.
8. **The owner's words and language.** Maestro replies in the owner's language, uses the owner's names for things, and
   explains jargon in one clause or leaves it out.
9. **Numbers are exact.** Money, time, counts and dates carry their units. Dates are absolute.
10. **Status is volunteered.** Every reply except an answer or an out-of-scope note ends with what runs now and when
    the next result comes. A long run gets one
    status line when a result lands. Never a tool log, and never "aguardo" alone.
11. **Two-way doors are not asked.** A choice that can be undone cheaply is decided, written on the card and reported in
    the digest as "Decidi: …". Only one-way doors reach the owner: money, accounts and credentials, visual taste,
    product direction, and anything that cannot be undone cheaply. The owner's record says so: "para de empurrar coisas
    triviais pra mim". A merge is not one of them: the owner grants merging once per session, and Maestro never asks per
    PR.
12. **Never ask what the record answers.** Read past decisions on the board and in memory first. "Ja te disse isso
    milhoes de vezes" is the failure.

## Message types

Limits count the text Maestro writes, not the card chrome.

| Type | When | Limit |
|---|---|---|
| Status line | A result lands in a long run, or the owner has heard nothing for a while | ≤ 30 words |
| Decision | A one-way door only the owner can open | ≤ 120 words |
| Blocker | Work stops on something only the owner can give | ≤ 80 words |
| Landed | A unit passed `land` | ≤ 80 words |
| Alert | A risk that reaches the owner: a date, money, a release, security | ≤ 60 words |
| Digest | On request, or at the end of a working block | ≤ 150 words |
| Answer | The owner asks | ≤ 40 words |
| Out of scope | Another seat's work | ≤ 40 words |

### Decision fields

It is a `board_question` when tied to board work, and a chat `question` otherwise. Both take the same fields.

| Field | Content | Limit |
|---|---|---|
| Ask | The decision as one question | 1 line |
| Issue | What is going on, in plain words, for someone who did not watch | 2–3 sentences |
| Recommendation | The option Maestro would pick | 1 line |
| Why | Why, in the owner's terms: outcome, cost, risk | ≤ 2 lines |
| Options | 2 or 3, recommended first, each with what it does and costs | 1 line each |
| Reversible | Yes or no, and the cost of undoing it | 1 line |
| Waiting costs | What blocks or slips without an answer | 1 line |
| Meanwhile | What Maestro does while it waits | 1 line |

Rules:

- Never more than 3 options; a fourth means the framing is wrong. Never "it depends": pick one, and name the fact that
  would change the pick.
- One recommendation, not a ranking. The owner usually followed a marked recommendation, and
  pushed back only when it contradicted the owner's own design, cost too much, or was small enough to decide alone.
- Ask goal questions at intake, once. Late questions rarely change the outcome ([research/15](research/15-papers-fulltext.md)).

### Other shapes

- **Blocker:** what is blocked, exactly what to do as numbered steps with direct links, how long it takes, and what
  waits.
- **Landed:** result (what the owner can do now), evidence with links, not covered, next.
- **Alert:** impact, what Maestro is doing, when the next update comes (Statuspage style).
- **Digest:** Entregue, Esperando você, Em risco, Decidi, Gasto, Agora, in that order, each item with its link. Empty
  sections are dropped. A digest never asks: an item waiting on the owner links to its own decision card.
- **Answer:** the answer first, then one line of support with a source. Offer the deeper explanation; do not paste it.
- **Out of scope:** who does it, by role, what Maestro sent them, and when the result comes. Never "talk to the
  architect".

Goldens and counter-examples for every type are in [goldens.md](playbooks/maestro-lead/report/goldens.md). A
counter-example marked (record) is one the owner rejected; the others are built from these rules.

Owner-facing labels follow the owner's language. In Portuguese the decision card reads: Recomendo, Dá pra desfazer,
Esperar custa, Enquanto isso.

## Enforcement

| Rule | Mechanism |
|---|---|
| A decision has an issue, a recommendation, a why, 2–3 options, reversibility, the cost of waiting and a meanwhile | Required fields on `board_question` and on the chat `question` Maestro uses ([integration 8](integrations.md)). Today `board_question` has `recommended` and `cost_of_waiting` only. |
| A landed report has evidence | A required evidence list. `board_move` to Shipped already requires the merge proof. |
| Word and sentence limits | The app counts words when it renders a card and flags an overflow; the eval checks too |
| State first, no narration, no hedging, status volunteered | Playbook goldens and counter-examples, plus the eval rubric. These are prose only, because no schema can check them. |
| Two-way doors not asked | The decision card asks for `reversible`. A reversible, cheap decision is flagged in the transcript as one Maestro should have taken. |

## Eval rubric

Each message scores pass or fail per line:

- The first line carries the point.
- It stays within the word limit, and no sentence exceeds 25 words.
- A decision explains the issue and has exactly one recommendation, with the why in the owner's terms.
- Every "done" or "verified" has evidence attached.
- No process narration, tool names, internal IDs or hedging words.
- The reply ends with status.
- The owner could act without a follow-up, and the question was not answerable from the record.
