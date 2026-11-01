---
name: maestro-orchestra-agents-custom
description: How an owner defines, edits and tunes their own agents: agent files, config fields, avatars, permissions and what cannot be changed.
internal: true
when: The owner asks to add, rename, restyle, restrict, disable or give a model to an agent, or asks what the Agents screen saves.
not-when: The question is about the built-in seats' roles or staffing; open team. For skills an agent may load, open skills.
covers: []
---

# Custom agents

An agent is defined in a file or in config. Both end in the same record, `ConfigAgent.Info`
(`packages/core/src/config/agent.ts`), keyed by the agent id.

## Where it lives

| Place | Detail |
|---|---|
| Agent file | `.orchestra/agent/<id>.md` or `.orchestra/agents/<id>.md`; `agents/` wins when both exist |
| Config | top-level `agents` record, id to fields (`packages/core/src/config.ts`) |
| Legacy | `{agent,agents}/**/*.md` and `{mode,modes}/*.md` are still read; a mode file is primary |

The file name is the id. The front matter holds the fields below; the markdown body, when not empty, becomes `system`.
Saving from the Agents screen writes the file: it edits the winning file, writes beside it and renames over it so a reader
never sees a partial file, and refuses a same-name file in different letter case or a path that resolves outside the
profile through a symlink.

## Fields

| Field | Meaning |
|---|---|
| `name` | display label; the id stays the address. Rules are in team |
| `description` | what the agent is for; shown in pickers and, for a subagent, to the model that dispatches it |
| `system` | the system prompt |
| `model`, `variant` | `provider/model` and the reasoning level |
| `request` | extra `headers` and `body` for the provider request |
| `engine` | `orchestra` or `claude-code` |
| `mode` | `subagent`, `primary` or `all` |
| `hidden` | keeps it out of pickers and the team list |
| `color`, `avatar` | look |
| `steps` | positive integer: provider turns allowed per user input |
| `disabled` | removes the agent |
| `permissions` | rules `{action, resource, effect}`, effect `allow`, `ask` or `deny`; later rules win |
| `areas` | list of strings; the project areas the team list shows for routing code work |

Top-level `permissions` in config apply to every agent; an agent's own rules are added after them. Path resources for
`read`, `edit` and `external_directory` expand `~` and `$HOME`; `bash` resources are raw shell text and are not expanded.

## Avatar

A bundled picture key `lib:<slug>` (for example `lib:set2-07`) or an uploaded PNG, JPEG or WebP inlined as a `data:` URI
of at most 200,000 characters. The screen crops an upload to 192 px. SVG is refused because it can carry script.

## What cannot change

- Maestro cannot be disabled or taken out of primary mode, and its name is fixed.
- A seat keeps its role: config can set its model, name, areas and permissions, not turn an unstaffed seat into a
  staffed one.
- A custom agent gets no seat skill tree. Skills it may load come from the skill catalog (open skills).
- Hooks, tools and the dispatch tool follow the agent's permissions; the `task` tool dispatches only a visible `subagent` or `all` mode agent;
  `hidden` or `primary` agents are not targets.

## Examples

A read-only reviewer: a file `.orchestra/agents/reviewer.md` with `mode: subagent`, `permissions` that deny `edit`, and a
body describing the review method. Restricting a command: a `bash` rule with resource `git push *` and effect `deny`.
Maestro and `general` ask before `git push`, `gh pr create`, `gh pr merge` and `gh release`; config can allow them.
