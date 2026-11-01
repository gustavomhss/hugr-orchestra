# Maestro: your lead agent

Maestro is the agent you talk to. It understands what you want, sends the work to the right teammate, keeps the
Projects board current, checks what comes back and tells you where things stand. It does not write the plan or do the
research itself: those go to the planning and research teammates.

## Your team

Each teammate has a role. You can rename any of them with the setting `agent.<id>.name`; Maestro's name is fixed.

| Teammate id | Does |
|---|---|
| `backend` | Builds backend changes |
| `archie` | Product, architecture, specs, plans and briefs |
| `jimmy` | Discovery and research, at the depth Maestro asks for |

The other seats (frontend, review, security, docs, process audit) are not available yet.

Maestro reads its team from a list Orchestra builds on every turn: each teammate's id, the name you gave it, the work
that goes to it and the parts of the project it owns. A new teammate, a rename or an area change reaches Maestro on its
next turn, in Claude mode too. Investigation goes to the research teammate, plans to the planning teammate, and code to
the teammate that owns its area; Maestro checks and integrates the results.

To say which teammate owns which part of a project, set `areas` in the project's config:

```json
{
  "agents": {
    "backend": { "areas": ["packages/core", "packages/server"] }
  }
}
```

## How work is sent out

When a step belongs to a teammate, Maestro starts it as its own Session. You see it as a task row in Maestro's
Session; open it to follow the teammate live. A teammate that changes code works in its own copy of the repository
(a git worktree under `.worktrees` in the project), so its edits never mix with yours or another teammate's.

## The board

Maestro is the only agent that writes the Projects board. Cards move in two ways:

- **On facts, by Orchestra.** When Maestro sends a teammate to a card, the card shows that teammate and moves to
  Building. When the card's pull request opens, it moves to Review; when the pull request merges, it moves to Shipped.
  This needs the project's GitHub repository set.
- **By Maestro, with a reason.** Moving a card to Ready or Cut, or to Shipped when the project has no GitHub repository.
- **Through the merge queue.** When Maestro has verified a card, it puts the card in the Queue column. Orchestra
  tests queued cards together and merges them when they pass; each card then moves to Shipped. A card that fails goes
  back to Review with a note. See [Checks and the merge queue](merge-queue.md).

Only you move a card out of Intake, and only you archive a project. A paused project takes no board changes except questions, a hold on a card keeps
it from shipping, and a spent budget starts no new work. Questions that change the plan appear on the board with options and Maestro's
recommendation; answer them there.

## Long and governed work

For a published workflow Maestro records each step (admission, plan, your approval, review, validation, decision) so
you can see what was agreed and what was checked. Large changes can use its repository and wave planning tools.

## Claude mode

Maestro is the same in Claude mode: same team, same board, same screens. See [Claude mode](claude-mode.md).
