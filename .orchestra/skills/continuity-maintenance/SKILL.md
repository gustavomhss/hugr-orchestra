---
name: continuity-maintenance
description: Use when changing Continuity V2 archive, context recall, masking, compaction strategy or host export boundaries.
---

# Continuity maintenance

This is a repo-only maintainer map, not a runtime seat skill.
Start with [Continuity README](../../../modules/continuity/README.md).

## Owners and sources

| Concern | Source of authority |
|---|---|
| Public exports and host contribution | `modules/continuity/package.json`, `src/v2/index.ts` |
| Archive and local masks | `modules/continuity/src/v2/archive.ts` |
| Lexical ranking | `modules/continuity/src/archive-search.ts` |
| Masking policy | `modules/continuity/src/masking-rules.ts`, `src/v2/masking.ts` |
| Strategy and recall tools | `modules/continuity/src/v2/strategy.ts`, `src/v2/tools.ts` |
| Committed context boundary | `@orchestra/atlas-boundary/context`; `atlas-maintenance`, Context continuity row |

## Authority and lifecycle traps

- The V2 contribution replaces core compaction and registers `context_recall` and
  `context_compact`; `apps/cli/src/host.ts` registers the contribution.
- Archive chunks are scrubbed before splitting and hashing; do not hash raw secrets.
  For host-only record-commit export and scrub/hash details see the Context continuity
  row of [Atlas maintenance](../atlas-maintenance/SKILL.md), not a duplicated policy.
- Archive list and search are local; a reference missing locally may be read from the
  calling seat's committed context in the project. Exported blobs depend on commit
  policy; a local archive or reference alone is not a universal replay guarantee.
- The module has local archive and mask files; the host owns committed persistence
  and process lifetime. Do not promise new retention or cross-session durability.
- Search is lexical, not semantic. Preserve the distinction between a local search
  and fallback by a specific reference.
- Masking protects selected tool outputs and recent context; changing policy affects
  recoverability and token budgets, not just presentation.

## Safe change checklist

1. Trace the contribution, mask, archive and recall path together for affected behavior.
2. Preserve scrub-before-hash, hash validation and the host-only export boundary.
3. Check local versus committed lookup and missing-blob behavior explicitly.
4. Update the README and related user-facing docs if behavior changes.
5. Follow repository testing and guardrail instructions for the actual change.

## Existing test witnesses

- `modules/continuity/test/v2-tools.test.ts`: archive read/list/search, committed
  reference fallback, scrubbing before hashing and recall permission.
- `modules/continuity/test/v2-strategy.test.ts`: masking, protected recall access
  and failed-output preservation.
- `modules/continuity/test/v2-maintenance.test.ts`: summary scheduling, stale result
  rejection and fallback after a failed summary.
- `modules/atlas/packages/adapter-io/test/context-log.test.ts` covers the Atlas side;
  see `atlas-maintenance` for host export and broader verification limits.
