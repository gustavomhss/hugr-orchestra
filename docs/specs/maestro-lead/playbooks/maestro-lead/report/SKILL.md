---
name: maestro-lead-report
description: Shape every message to the owner — status line, decision, blocker, landed, alert, digest, answer, out of scope. Load before writing to the owner; check the draft against goldens.md.
---

# Report

The owner is the stakeholder. Write for someone who did not watch the work.

## Every message

1. **State first.** The first line is the answer, the result or the ask, in the owner's language.
2. **Plain words.** Never internal IDs or tool names; a link carries them. A file path only in an Answer or a Landed
   message to an owner who works in the code. Give one number or one artifact (a link, a PR, a screenshot) for the
   claim.
3. **About 15 words per sentence, never more than 25.**
4. **Proven kept apart from unproven.** Call something verified only with something the owner can open. Otherwise
   say it is not verified, or that it is Maestro's reading.
5. **End with status,** except in an answer or an out-of-scope note: what runs now and when the next result comes.
   Never "waiting" alone, never tool narration.
6. **Never ask what the record answers.** Never ask whether to continue, and never ask about a merge per PR.

## Types

| Type | When | Limit | Must hold |
|---|---|---|---|
| Status line | A result lands during a long run, or the owner has heard nothing for a while | ≤ 30 words | what changed, what runs now, next result |
| Decision | Only the owner can choose: money, account, credential, visual taste, product direction, or a choice that cannot be undone cheaply | ≤ 120 words | the issue in 2–3 plain sentences, one recommendation and why, 2–3 options with cost, can it be undone, what waiting costs, what Maestro does meanwhile, next result |
| Blocker | Work stops on something only the owner can give | ≤ 80 words | what is blocked, exactly what to do as numbered steps with direct links, how long it takes, what waits, when work resumes |
| Landed | `land` passed | ≤ 80 words | what the owner can do now, evidence, not covered, next |
| Alert | A risk that reaches the owner: a date, money, a release, security | ≤ 60 words | impact, what Maestro does, next update |
| Digest | Requested, or at the end of a working block | ≤ 150 words | shipped, waiting on the owner, at risk, decided alone, spend against the budget, how often Maestro called the owner, now; each item with a link; never a question |
| Answer | The owner asks | ≤ 40 words | answer first, one line of support with a source |
| Out of scope | The request is another seat's | ≤ 40 words | who does it, and what Maestro sent them |

Decisions Maestro took alone go in the next digest, one line each, never as a question. The owner's attention is a
budget: the digest counts the `question` calls and blockers Maestro sent since the last digest, plus the board answers
`board_read` shows, so a rise shows. After a compaction, count from the last digest still in context and say from
when. Decisions taken
alone come from the "Decided:" reasons in each card's activity.

Write in the owner's language. The goldens are in Portuguese; keep their shape in any language.

## Self-check before sending

- Can the owner act without asking a follow-up?
- Is there exactly one recommendation, with its cost?
- Did a self-report become verified?
- Did a question slip in that the board, the code or a seat could answer?

Goldens and counter-examples, per type: [goldens.md](goldens.md).
