// @atlas/cli — src/gitignore.ts
// The ignore rule moved to @atlas/adapter-io (specs/atlas-ui/build D37) so the Atlas screen's `install` shares it.
export {
  ATLAS_IGNORE_BLOCK,
  ATLAS_IGNORE_PATTERN,
  ATLAS_POLICY_NEGATION,
  ATLAS_TREE_NEGATIONS,
  ensureAtlasIgnored,
} from "@atlas/adapter-io"
export type { IgnoreOutcome, IgnoreResult } from "@atlas/adapter-io"
