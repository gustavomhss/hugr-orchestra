---
name: seat-skill-tree-maintenance
description: The rules a seat's skill tree must follow (node shape, names, depth, children, when/not-when routing, references, links), where trees live and how they ship, and the steps to add a node or a root. Use before adding, moving or editing anything under a seat's `skills` folder or `modules/specialists/team/skills`, changing `seat.skills`, or changing the validator in `seat-skill-content.ts` or the "Next level" index in the `skill` tool.
---

# Seat skill trees

Design: `docs/specs/seat-framework/skill-tree.md`. User view: `docs/guides/skills.md`, `docs/guides/agent-screen.md`.

Maestro itself (prompt, roster, dispatch, board, playbooks): `maestro-ownership`, `maestro-usage`, `maestro-maintenance`.

## Where they live

- A seat's tree is the folder `Seats.skillSource(id)` returns (`modules/maestro/coordination/src/seats/seat.ts`):
  `modules/specialists/<id>/skills` for backend and archie, `packages/<id>-specialist/skills` for the others.
- Shared roots (`team-*`, today `team-stack`) live once in `modules/specialists/team/skills` (`Seats.sharedSource()`).
  A seat that needs one lists it in its own `skills`.
- Maestro's playbooks are a tree too, under `modules/maestro/coordination/playbooks`. They hold orchestration and project management only: planning content goes to archie, implementation guidance to backend.
- A release embeds every tree through `apps/cli/script/packaged-skills.ts`; `seat-skill-root.ts` extracts it to the
  cache at run time. Running from source reads the folders in place.

## Rules (`SeatSkillContent.validate` enforces them at build and load)

- A node is a directory with a `SKILL.md`. Its frontmatter `name` is its path joined with `-`, for example
  `backend-implement-stack-python-fastapi`.
- The roots are exactly the seat's `skills` entries, each starting with `<id>-` (or `team-` in the team tree).
- Depth: at most four directories from the root down, the root included. At most 10 children per node.
- Every node below a root has non-empty `when` and `not-when`. The parent's "Next level" index is generated from
  them by the `skill` tool (`packages/core/src/tool/skill.ts`); never write an index by hand.
- A node holds children or content. A leaf may keep a flat `references/` folder; no other directory may sit on a
  path without being a node (orphan).
- A link inside a node below a root stays inside that node's directory. Shared text moves up to the common parent.
- Permissions: a seat may load any node under its own roots and nothing under another seat's
  (`modules/maestro/coordination/src/v2/seats.ts`).

## Add a node

1. Pick the parent by axis: a domain branch for what the work is, `stack` (or `team-stack`) for the language or
   framework. Shared stack knowledge goes in `team-stack`, never copied into one seat.
2. Create `<parent>/<segment>/SKILL.md` with `name`, a `description` that names the trigger, `when` and `not-when`.
   `not-when` names the sibling to open instead when the two could be confused.
3. Start the body with a two-line summary, then the content. Long tables go in `references/` of that leaf.
4. If the parent was a leaf, move its content down into children first: a node is either a branch or a leaf.
5. Gate: `bun run test:ci maestro test/seat-framework.test.ts test/v2-skills.test.ts` and
   `bun run check:guards --base origin/dev`.

## Add a root

Add the directory, add its name to the seat's `skills` in `src/seats/<id>.ts`, and add one line to the seat's prompt
saying when to open it. Keep a seat at about eight roots.
