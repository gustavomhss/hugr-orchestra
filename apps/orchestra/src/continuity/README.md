# Continuity domain

## Purpose and ownership

- Session continuity: admission, archive and archive search, checkpoints, checklist and review seals, fork, masking, transcripts and triggers.
- Prompts: `apps/orchestra/src/continuity/prompt.txt` and `apps/orchestra/src/continuity/review-prompt.txt`.
- Product-owned files outside this folder: `apps/orchestra/src/tool/context-compact.ts`, `apps/orchestra/src/tool/context-recall.ts`, `apps/orchestra/src/tool/context-recall-archive.ts`, `apps/orchestra/src/session/prompt-continuity.ts`.
- Target: modules/continuity (a future path).

## Public entry points and consumers

- Consumers: claude-code and maestro (allowed product edges).
- Session, tool and server importers are declared exceptions under rule R11.

## Dependencies and boundaries

- May import the platform.
- Never imports maestro, claude-code, acp or janitor.

## Assets, schemas and generated files

- `apps/orchestra/src/continuity/archive-format.ts` defines the on-disk archive format, a compatibility contract.

## Persistence, identity and lifetime

- Archive files are user data: their paths and format must not change in a reorganization.

## Commands

- `bun run test:ci orchestra test/continuity/<file>`

## Contracts and verification limits

- None beyond the archive format above.
