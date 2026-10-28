---
name: agent-screen-maintenance
description: How the Agents roster cards and the per-agent screen get their data (agent list, agent detail endpoint, toolkit engines, seat skill trees, Atlas memory) and what must not regress. Use before changing packages/app-shell/src/orchestra/chapters/agents*.tsx, the agent detail route in packages/server/src/handlers/agent.ts, `Agent.Info.toolkit` or `Agent.Info.skills`, or how seat skill trees are described.
---

# Agent screen

User guide: `docs/guides/agent-screen.md`. Avatars: `agent-avatars-maintenance`.

## Where it lives

- Roster: `AgentsRoster` in `agents-view.tsx`. A card's name button is its one link and opens
  `/orchestra/agents/<key>`; only Maestro's card has Open Chat. Counts come from `stats` in `agents.tsx` and stay
  undefined (shown as a dash) until their source answers.
- Screen: `AgentScreen` in `agents-detail.tsx`, with tabs Overview, System prompt, Tools, Toolkit, Skill tree, Memory.
  Edits on Overview, System prompt and Tools share one draft and one save bar; Create agent still uses `AgentDialog`.
- Detail data: the `AgentDetail` endpoint (`packages/protocol/src/groups/agent.ts`, served by
  `packages/server/src/handlers/agent.ts`) returns tools, skills and `engines`.
- Engines: `Agent.Info.toolkit` (`"backend" | "research"`) is set from the seat in
  `modules/maestro/coordination/src/v2/seats.ts`. The handler lists that toolkit's manifest with each engine's local
  `status()`. An agent without a toolkit gets an empty list.
- Skill tree: `Agent.Info.skills` (`packages/schema/src/agent.ts`) is a flat, depth-first list of
  `{ name, description, when, parent }` built by `describe()` in `seat-skill-content.ts`. It is flat because the client
  codegen has no recursive schemas. `agentSkills` in `agents-detail.tsx` rebuilds the tree from `parent` and appends
  catalog skills the seat does not own; `SkillNode` renders a node with children as `<details>`. Tree rules:
  `seat-skill-tree-maintenance`.
- Tool permissions: `AgentToolPermissions` (`agents-view.tsx`) lists `PERMISSION_TOOLS`, then one row per configured MCP server. `agents.tsx` reads
  the servers from the sync child created with `mcp: true`; `mcpPermission` in `agents-roster.ts` names the rule
  `<server>_*`, sanitized the way core names MCP tools (`McpCatalog.toolName`). Client code cannot import core, so keep
  the two in step. `agentFileInput` keeps any file rule the draft does not list.

## Invariants

- Code, tests and copy refer to a seat by id or role, never a default display name.
- The screen never shows secrets: the prompt is the agent's own text, and engine rows show only manifest fields and
  install status.
- Every label goes through `language.t`; the agent chapter's keys exist in every locale it ships.
- The roster's skill count is the tab's row count: roots plus catalog skills, never every node.
- After changing the protocol, run `bun run generate` in `packages/client`.
