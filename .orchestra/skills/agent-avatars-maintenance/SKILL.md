---
name: agent-avatars-maintenance
description: How agent avatars work end to end (the `avatar` key in agent files, the bundled picture library, seat portraits, uploads) and what must not regress. Use before changing the Agents editor's avatar picker, the avatar schema, the library in packages/app-shell/src/orchestra/avatars, or how agent files load the key.
---

# Agent avatars

User guide: `docs/guides/agent-avatars.md`.

## Where it lives

- Value schema: `Agent.Avatar` in `packages/schema/src/agent.ts`. It is `lib:<slug>` or a PNG, JPEG or WebP
  `data:` URL of at most 200,000 characters. Every config path reuses it: `ConfigAgent`, `AgentFile.fields`, the
  legacy decoder `ConfigUpgradeAgent` (with `avatar` in `KNOWN_KEYS`) and `migrateAgent`.
- Agent files: `ConfigAgentFile.parse` and `render` (`packages/core/src/config/agent-file.ts`) read and write the key.
- Plugin agents: `avatar` is in `agentKeys` (`packages/core/src/config/plugin/agent.ts`). A front-matter key missing
  there sends the file through the legacy decoder, and a key missing from `KNOWN_KEYS` becomes a provider option sent
  to the model.
- App: `src/orchestra/avatars.ts` globs `src/orchestra/avatars/*.webp`. `seat-<id>.webp` is a native seat's portrait
  and stays out of the picker; every other file is in the library. `agentAvatar` in `agents-roster.ts` falls back to
  `lib:seat-<id>`.

## Invariants

- SVG and remote URLs are never accepted: the value is rendered as an `<img src>`.
- Seat portraits are addressed by seat id, never by a display name.
- Library files are 128 px WebP, about 5 KB each. Add pictures by dropping files in the folder; the code needs no list.
- After changing the schema, run `bun run generate` in `packages/client`.
