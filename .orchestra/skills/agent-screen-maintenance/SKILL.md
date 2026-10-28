---
name: agent-screen-maintenance
description: How the Agents roster cards and the per-agent screen get their data (agent list, agent detail endpoint, toolkit engines, seat skill references, Atlas memory) and what must not regress. Use before changing packages/app-shell/src/orchestra/chapters/agents*.tsx, the agent detail route in packages/server/src/handlers/agent.ts, `Agent.Info.toolkit` or `skills[].references`, or how seat skills are described.
---

# Agent screen

User guide: `docs/guides/agent-screen.md`. Avatars: `agent-avatars-maintenance`.

## Where it lives

- Roster: `AgentsRoster` in `agents-view.tsx`. A card's name button is its one link and opens
  `/orchestra/agents/<key>`; only Maestro's card has Open Chat. Counts come from `stats` in `agents.tsx` and stay
  undefined (shown as a dash) until their source answers.
- Screen: `AgentScreen` in `agents-detail.tsx`, with tabs Overview, System prompt, Tools, Toolkit, Skills, Memory.
  Edits on Overview, System prompt and Tools share one draft and one save bar; Create agent still uses `AgentDialog`.
- Detail data: the `AgentDetail` endpoint (`packages/protocol/src/groups/agent.ts`, served by
  `packages/server/src/handlers/agent.ts`) returns tools, skills and `engines`.
- Engines: `Agent.Info.toolkit` (`"backend" | "research"`) is set from the seat in
  `modules/maestro/coordination/src/v2/seats.ts`. The handler lists that toolkit's manifest with each engine's local
  `status()`. An agent without a toolkit gets an empty list.
- Knowledge: `Seats` describe each seat skill through `describe()` in `seat-skill-content.ts`, whose `references`
  lists every `.md` under the skill's `references/` folder: `kind` is the first folder, `family` the second, `title`
  the file's `# ` heading. The screen groups them by `kind` (`KNOWLEDGE` in `agents-detail.tsx` sets the order and
  which kinds have a translated label; any other kind shows its folder name).

## Invariants

- Code, tests and copy refer to a seat by id or role, never a default display name.
- The screen never shows secrets: the prompt is the agent's own text, and engine rows show only manifest fields and
  install status.
- Every label goes through `language.t`; a new reference `kind` with a label needs its `toolkit.kind.*` key in every
  locale and an entry in `KNOWLEDGE`.
- After changing the protocol, run `bun run generate` in `packages/client`.
