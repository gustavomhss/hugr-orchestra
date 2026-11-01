---
name: maestro-orchestra-agents-skills
description: Where skills come from, which one wins a name clash, how trees and the internal flag work, how the skill list is bounded, and which agent may load what.
internal: true
when: The owner asks where to put a skill, why a skill is not listed or not loadable, why one replaced another, what the Skills screen shows, or how seat trees are guarded.
not-when: The question is which skill to load for a task; read the skill list in your context.
covers: []
---

# Skills

A skill is a folder with a `SKILL.md` (front matter `name`, `description`, optional `internal`, `when`, `not-when`).
Agents load one by exact name with the `skill` tool. The loader is `packages/core/src/skill.ts`.

## Sources, in order

1. Packaged skills that ship with the app.
2. Each config directory's `skill/` and `skills/`, then the global folder.
3. Config `skills` items (a path or a URL).
Project skill roots (`skill/file.ts`), searched in the project: `.orchestra/skills`, `.orchestra/skill`, `.claude/skills`, `.agents/skills`.

Maestro's seat-tree sources and playbooks are added first. A later source wins a same-name clash.

A source marked reserved owns its names: Maestro's playbooks are reserved, so a skill of the same name from any other
source is dropped with a warning. Seat trees are not reserved, so config can replace one.

## Trees

- A `SKILL.md` inside another skill's folder is a tree node: loadable by its name, not listed on its own.
- Loading a node ends with a **Next level** index of its children, each with a `when` and a `not-when`. The agent opens
  one level at a time and reads only the branch the task needs.
- A node's name is its path joined with `-`; a child names its parent.
- Maestro's playbook is such a tree: this leaf is `maestro-orchestra-agents-skills`.

## The internal flag

`internal: true` (or `yes`) sets `internal` on the skill. It hides it from user pickers: the Skills chapter and a workflow
step's skill list. Agents still discover and load it, and a step that names it still runs. Seat tree roots and Maestro's
playbooks are internal.

## The list in the system prompt

Sorted by name. A description is cut at 300 characters and ends with an ellipsis, so put what decides loading first. The
described list stops at a budget of 12,000 characters; after that the remaining skills are named in one line without
descriptions, and loading by exact name still works (`skill/guidance.ts`).

## Who may load what

| Rule | Effect |
|---|---|
| Foreign trees | `foreign(id)` denies the skill roots of other seats |
| Playbooks | denied to every agent except Maestro (`v2/seats.ts` `visibility`) |
| Own tree | a seat cannot edit its own skill tree |
| Seat skills | a seat gets only the roots listed in its `seat.skills` |
| Shared | `team-stack` is one shared tree that `backend` lists |

Seat trees are not in the Skills chapter; the agent screen shows a seat's tree in its **Skill tree** tab.

## What ships and what stays

Seat trees (`Seats.skillSource`, embedded at build time) and Maestro playbooks ship. Repository-only skills under
`.orchestra/skills` appear only when this repository is the open project. Knowledge an agent needs at runtime goes in its
prompt or a shipped seat skill, never only in a repository skill. A maintenance or ownership skill is never added to a
seat's `skills`.

## Adding one

To give the owner a skill: create `.orchestra/skills/<name>/SKILL.md` in the project (or the global folder), with a
`description` that starts with when to use it. To hide it from pickers add `internal: true`. If it does not show, check
the name clash order above and that the front matter parses.
