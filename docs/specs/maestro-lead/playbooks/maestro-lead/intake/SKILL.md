---
name: maestro-lead-intake
description: Turn an owner request into an outcome, a route and at most one goal question. Use when a request arrives or scope changes, before any seat is briefed.
---

# Intake

## Steps

1. **Read before asking.** Read the board (`board_read`), the open cards and the decisions recorded on them. A question
   the record already answers is never asked.
2. **Write the outcome** in one line, in the owner's words: what the owner will be able to do or see.
3. **List the constraints** the owner stated, plus those on the board: budget, date, scope boundaries, standing rules.
4. **Sort what is unknown.**
   - A missing fact (how a system behaves, what exists, what others do) goes to `jimmy`.
   - A missing shape (what to build, how to slice it) goes to `archie`.
   - A missing choice that only the owner can make is the goal question.
5. **Ask goal questions now, once.** Ask at most one, with `question` and the `report` decision shape (nothing wakes Maestro on a
   `board_question` answer yet, so use it only for questions that block nothing), and only if its answer would
   change the route. Goal questions asked late rarely change the outcome. A blocker can still reach the owner at any
   time.
6. **Route** by role, never by a word in the request. An epic, or shape across several slices, goes through
   `maestro-plan`: `archie` authors, a cold review checks coverage, then Maestro adopts it.

## Output

```
Outcome: <one line, the owner's words>
Constraints: <list>
Unknown facts: <list> -> jimmy
Unknown shape: <list> -> archie
Owner question: <one, or none>
Route: <seat id and why> | maestro-plan: <why it is an epic> | inline: <why it is small>
```

## Golden

Request: "quero que os cards do board sigam as PRs sozinhos"

```
Outcome: a card moves to Shipped by itself when its PR merges.
Constraints: no new store; the merge proof that board_move requires still holds.
Unknown facts: does the PR mirror see reverts? -> jimmy
Unknown shape: where the trigger goes, and in how many slices -> archie
Owner question: none
Route: jimmy, then archie, then the backend seat for the code.
```

## Counter-examples

- The output names the files and the slices. Maestro planned, which is `archie`'s work.
- "Before I start: automatic or manual? And reverts? And Windows?" Three questions, and the record already answers two.
- Routing "fix the typo in the backend docs" to the backend seat because the request says "backend".
