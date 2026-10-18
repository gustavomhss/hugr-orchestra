// @atlas/cli — src/gitignore.ts  (`atlas init` installs the durable-store ignore rule)
//
// ── WHY THIS IS A DEPLOYMENT DEPENDENCY, NOT A NICETY ────────────────────────────────────────────────────
// The provenance tripwire (`adapter-io/store-provenance.ts`) refuses to serve a durable store that is TRACKED
// BY GIT, because a committed `.atlas/` publishes rows past every governed door. That refusal is correct and
// it is fail-closed — which means that for a user whose repo has no ignore rule, the FIRST `git add -A` after
// an emit TURNS ATLAS OFF. Everything they wrote stops being served, and every subsequent write refuses.
//
// Atlas's own repository has the rule (`.gitignore`, task #90). A user's repository does not, and nothing in
// the product ever put it there: `atlas init` is a `$0`-LLM structural walk that returns a skeleton and
// writes nothing at all. So the ONE control standing between an ordinary user and a silently disabled
// product was a line in a file they were never told to add.
//
// ── WHY THIS IS NOT A NEW WRITE DOOR (INV-TOOLS-1 / ADR-0003 / ADR-0004 UNTOUCHED) ───────────────────────
// `WRITE_PATHS` governs writes to KNOWLEDGE — the projection, the CAS, the staging sidecar. Not one byte of
// any of those is touched here. This writes a repository CONFIGURATION line, the way `git init` writes a
// template config, and it is deliberately implemented in the CLI ENTRYPOINT rather than behind the
// `atlas-init` tool leg: `createInit` is a PURE planner (ADR-0004, AUTHOR-2 — "no planner writes, mutates,
// stages, caches, or queues any byte") and it stays pure. `GOVERNANCE_SURFACE` is still 5, `WRITE_PATHS` is
// still 2, and the CLI-2 authority matrix still classifies `init` as read, because the LEG it binds is a
// read leg. That last point is the one a reviewer should check rather than take on trust.
//
// ── THE RULE IS COPIED FROM ATLAS'S OWN `.gitignore`, DELIBERATELY, INCLUDING THE ORDERING TRAP ──────────
// `.atlas/*` (not `.atlas/`) then `!.atlas/policy.json`. Git cannot re-include a path under an EXCLUDED
// DIRECTORY, so ignoring the directory would make the negation unreachable and silently drop the one file
// that genuinely IS source — the admin-owned authorization policy the doors read. Deny-every-child then
// re-admit is the only ordering that works, and the negation MUST come after the pattern it overrides.
//
// TOTAL. Every failure — unreadable file, unwritable directory, a path that is not a directory — resolves to
// a REPORTED outcome, never a throw and never a silent success. `atlas init` must not become a command that
// can crash on a read-only checkout.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** The exact pattern that denies every child of `.atlas/`, and the exact negation that re-admits the
 *  admin-owned policy. Both are matched VERBATIM when deciding whether the rule is already present, so a
 *  user who wrote `.atlas/` (the broken variant that swallows `policy.json`) is still told about it. */
export const ATLAS_IGNORE_PATTERN = ".atlas/*"
export const ATLAS_POLICY_NEGATION = "!.atlas/policy.json"

/** The block `atlas init` appends, comments included — the comments are the reason a later reader does not
 *  delete the two lines. Newline-terminated so an append can never join the previous line. */
export const ATLAS_IGNORE_BLOCK = [
  "",
  "# ── the Atlas durable store is DATA, never source (written by `atlas init`) ──────────────────────",
  "# `.atlas/projection.json` IS the governed knowledge and `.atlas/cas/**` are its bytes; committing them",
  "# would publish rows past every governed door, because no door is involved in a `git add`. Atlas detects",
  "# a committed store and REFUSES to serve or write it, so without this rule the first `git add -A` after",
  "# an emit turns Atlas off. `.atlas/staging.json` is worse in kind: unratified candidates.",
  "# Deny every child, then re-admit the one file that is genuinely source. `.atlas/*` (not `.atlas/`) is",
  "# load-bearing: git cannot re-include a path under an excluded DIRECTORY, so the negation below would be",
  "# unreachable and `policy.json` would be silently dropped. The negation must come AFTER the pattern.",
  ATLAS_IGNORE_PATTERN,
  ATLAS_POLICY_NEGATION,
  "",
].join("\n")

/** What `ensureAtlasIgnored` did. `outcome` is a DISCRIMINANT — a closed union asserted on by equality, not
 *  a prose message parsed by a test (the vacuous-assertion class this repo has already been bitten by). */
export type IgnoreOutcome = "installed" | "already-present" | "partial-repaired" | "failed"

export interface IgnoreResult {
  readonly outcome: IgnoreOutcome
  /** The `.gitignore` path considered — always reported, so the user knows WHERE to look. */
  readonly path: string
  /** One line, rendered on `atlas init`'s stdout. Never empty. */
  readonly note: string
}

/** Does `content` already deny the durable store? Matched line-wise on the EXACT pattern (leading/trailing
 *  whitespace trimmed), never `includes()`: `.atlas/*` is a substring of a comment mentioning it, and a
 *  commented-out rule denies nothing. */
function hasLine(content: string, line: string): boolean {
  return content.split(/\r?\n/).some((l) => l.trim() === line)
}

/**
 * Ensure `<repoPath>/.gitignore` denies the durable Atlas store. TOTAL — never throws.
 *
 * Four outcomes, all reported:
 *   · `already-present`   — both lines are there; nothing written (idempotent: re-running `init` is free).
 *   · `partial-repaired`  — the deny pattern was there but the policy negation was NOT, so `policy.json`
 *                           was being ignored too. Appends the missing negation only.
 *   · `installed`         — neither line was there; the whole commented block is APPENDED (never rewritten:
 *                           an existing `.gitignore` is the user's file, and this is additive).
 *   · `failed`            — the filesystem refused. Reported with the path so the user can add it by hand.
 */
export function ensureAtlasIgnored(repoPath: string): IgnoreResult {
  const path = join(repoPath, ".gitignore")
  let content: string
  try {
    content = readFileSync(path, "utf8")
  } catch {
    // No `.gitignore` at all (the common case for a fresh repo) — create it with just the Atlas block.
    try {
      writeFileSync(path, ATLAS_IGNORE_BLOCK.replace(/^\n/, ""), "utf8")
      return {
        outcome: "installed",
        path,
        note: `gitignore: created ${path} denying .atlas/* (Atlas's durable store is DATA, never source)`,
      }
    } catch {
      return {
        outcome: "failed",
        path,
        note: `gitignore: could NOT write ${path} — add '${ATLAS_IGNORE_PATTERN}' and '${ATLAS_POLICY_NEGATION}' by hand, or a 'git add -A' will turn Atlas off`,
      }
    }
  }

  const denies = hasLine(content, ATLAS_IGNORE_PATTERN)
  const readmits = hasLine(content, ATLAS_POLICY_NEGATION)
  if (denies && readmits) {
    return {
      outcome: "already-present",
      path,
      note: `gitignore: ${ATLAS_IGNORE_PATTERN} already denied in ${path} — nothing to do`,
    }
  }
  // A `.gitignore` ending without a newline would otherwise glue the first appended line onto the last
  // existing one, producing a pattern that matches nothing and looks correct in a diff.
  const lead = content.length > 0 && !content.endsWith("\n") ? "\n" : ""
  const block = denies ? `${lead}${ATLAS_POLICY_NEGATION}\n` : `${lead}${ATLAS_IGNORE_BLOCK}`
  try {
    appendFileSync(path, block, "utf8")
  } catch {
    return {
      outcome: "failed",
      path,
      note: `gitignore: could NOT append to ${path} — add '${ATLAS_IGNORE_PATTERN}' and '${ATLAS_POLICY_NEGATION}' by hand, or a 'git add -A' will turn Atlas off`,
    }
  }
  return denies
    ? {
        outcome: "partial-repaired",
        path,
        note: `gitignore: added the missing '${ATLAS_POLICY_NEGATION}' to ${path} — the admin policy is source and must stay in git`,
      }
    : {
        outcome: "installed",
        path,
        note: `gitignore: added '${ATLAS_IGNORE_PATTERN}' (+ the policy.json exception) to ${path} — Atlas refuses a COMMITTED store, so this rule is what keeps it on`,
      }
}
