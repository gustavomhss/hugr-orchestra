// @atlas/cli — test/init-gitignore.test.ts  (the branches of the ignore-rule installer)
//
// The end-to-end property — `atlas init` writes the rule, and a later `git add -A` therefore does not turn
// Atlas off — is proved through the REAL CLI binary in `e2e-blackbox/test/s19-init-gitignore.blackbox.test.ts`.
// This suite covers the branches that story cannot reach cheaply: a PARTIAL rule (the shape that silently
// drops the admin policy from version control), a file with no trailing newline (where a naive append
// produces a pattern that matches nothing and reads correctly in a diff), and a filesystem that refuses.
//
// Assertions are on the `IgnoreOutcome` DISCRIMINANT, not on the advisory prose.

import { describe, it, expect, afterEach } from "vitest"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ATLAS_IGNORE_PATTERN, ATLAS_POLICY_NEGATION, ensureAtlasIgnored } from "../src/gitignore.js"

let dir: string | undefined
afterEach(() => {
  if (dir !== undefined) {
    try {
      chmodSync(dir, 0o755)
    } catch {
      /* best effort — the dir may already be writable */
    }
    rmSync(dir, { recursive: true, force: true })
  }
  dir = undefined
})

function fresh(gitignore?: string): string {
  dir = mkdtempSync(join(tmpdir(), "atlas-ignore-"))
  if (gitignore !== undefined) writeFileSync(join(dir, ".gitignore"), gitignore)
  return dir
}

const lines = (p: string): string[] =>
  readFileSync(join(p, ".gitignore"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())

describe("ensureAtlasIgnored — total, idempotent, and honest about what it did", () => {
  it("creates a `.gitignore` when the repo has none", () => {
    const p = fresh()
    expect(ensureAtlasIgnored(p).outcome).toBe("installed")
    expect(lines(p)).toContain(ATLAS_IGNORE_PATTERN)
    expect(lines(p)).toContain(ATLAS_POLICY_NEGATION)
  })

  it("APPENDS to an existing file — a user's own rules are never rewritten", () => {
    const p = fresh("dist/\nnode_modules/\n")
    expect(ensureAtlasIgnored(p).outcome).toBe("installed")
    expect(lines(p)).toContain("dist/")
    expect(lines(p)).toContain("node_modules/")
    expect(lines(p)).toContain(ATLAS_IGNORE_PATTERN)
  })

  it("a file with NO trailing newline is not corrupted by the append", () => {
    const p = fresh("dist/") // no '\n'
    ensureAtlasIgnored(p)
    expect(lines(p)).toContain("dist/") // still its own line, not `dist/#…`
    expect(lines(p)).toContain(ATLAS_IGNORE_PATTERN)
  })

  it("PARTIAL: the deny pattern without the negation is repaired — the admin policy stays source", () => {
    const p = fresh(`${ATLAS_IGNORE_PATTERN}\n`)
    expect(ensureAtlasIgnored(p).outcome).toBe("partial-repaired")
    expect(lines(p).filter((l) => l === ATLAS_IGNORE_PATTERN)).toHaveLength(1) // not duplicated
    expect(lines(p)).toContain(ATLAS_POLICY_NEGATION)
  })

  it("IDEMPOTENT: a complete rule is left byte-identical and reported as already present", () => {
    const p = fresh(`${ATLAS_IGNORE_PATTERN}\n${ATLAS_POLICY_NEGATION}\n`)
    const before = readFileSync(join(p, ".gitignore"), "utf8")
    expect(ensureAtlasIgnored(p).outcome).toBe("already-present")
    expect(readFileSync(join(p, ".gitignore"), "utf8")).toBe(before)
  })

  it("a COMMENTED-OUT rule denies nothing, and is not mistaken for the rule", () => {
    // `includes()` would match here. The rule is matched line-wise, on the exact trimmed text.
    const p = fresh(`# ${ATLAS_IGNORE_PATTERN}\n# ${ATLAS_POLICY_NEGATION}\n`)
    expect(ensureAtlasIgnored(p).outcome).toBe("installed")
    expect(lines(p)).toContain(ATLAS_IGNORE_PATTERN)
  })

  it("TOTAL: an unwritable directory REPORTS the failure with the path — never a throw", () => {
    const p = fresh()
    chmodSync(p, 0o555) // read+execute only: the create below cannot succeed
    const r = ensureAtlasIgnored(p)
    // Running as root would defeat the permission bit; accept either, but never a throw and never a lie.
    expect(["failed", "installed"]).toContain(r.outcome)
    expect(r.path).toBe(join(p, ".gitignore"))
    expect(r.note.length).toBeGreaterThan(0)
  })
})
