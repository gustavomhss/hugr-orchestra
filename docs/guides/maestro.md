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
| `lucy` | Cold review of finished work before it ships; records governed reviews |
| `live` | Live meeting copilot you talk to directly |

The other seats (frontend, security, docs, process audit) are not available yet.

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

Orchestra holds Maestro to the team when it sends work out, in Claude mode too:

- A teammate that is not available yet cannot be sent work.
- Work for a teammate that builds code names its card on the board, so every change is tracked. Maestro creates the
  card first when there is none. A card that shipped or was cut takes no new work.
- An agent outside the teammates that can change files gets an explicit list of the files or folders it may change, or
  none for read-only work. It cannot write anywhere else.
- Files in a teammate's areas cannot be handed to anyone else: Maestro is told to send that teammate.

Orchestra also keeps Maestro conducting rather than doing the work itself, in Claude mode too:

- Before it changes the board or sends a teammate to a card, Maestro reads that project's board in the same turn.
- After ten reads (files, searches, web pages, shell commands) without sending work out, Maestro must hand the
  investigation to the research teammate.
- Maestro's own edits stay small: once its changes in a turn pass 20 lines or 2 files, further edits go to the
  teammate that owns the area. This needs snapshots on (the default) in a git project.
- Maestro never merges a pull request itself; it queues the card and Orchestra merges it.

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

## Asking Maestro about Orchestra

Maestro carries a guide to every part of Orchestra: the apps, the agents and their skills, engines and Claude mode,
the tools, the board and merge queue, setup, and common errors. Ask it how any part works and it opens the matching page
of the guide and answers from it, in Claude mode too. For how the code behaves right now, it sends the research teammate
to look.

## Claude mode

Maestro is the same in Claude mode: same team, same board, same screens. See [Claude mode](claude-mode.md).
