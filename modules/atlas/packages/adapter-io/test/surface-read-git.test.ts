// @atlas/adapter-io — test/surface-read-git.test.ts  (the Atlas UI surface: the git half of the snapshot)
//
// A real two-commit git repository: `src/a.ts` changes between R1 and R2, `src/b.ts` does not. The drift, the
// tracked-store flags, the language counts and the children tree are read back through `read-git.ts`.

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { childrenOf, headShort, langCounts, trackedFiles, trackedStore, withDrift } from "../src/surface/read-git.js"
import type { PendingFact } from "../src/surface/read-store.js"
import type { AtlasFact } from "../src/surface/types.js"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-surface-git-"))
  dirs.push(dir)
  return dir
}

/** R1: src/a.ts, src/b.ts, README.md and three store files. R2: src/a.ts changed, committed as "change a". */
function twoCommits(): { dir: string; r1: string; r2: string; short2: string } {
  const dir = tempDir()
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  const write = (rel: string, content: string): void => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  write("src/a.ts", "export const a = 1\n")
  write("src/b.ts", "export const b = 1\n")
  write("README.md", "# fixture\n")
  write(".atlas/projection.json", "{}\n")
  write(".atlas/policy.json", "{}\n")
  write(".atlas/cas/aa/aaaa", "{}\n")
  git("add", "-A")
  git("commit", "-q", "-m", "R1")
  const r1 = git("rev-parse", "HEAD")
  write("src/a.ts", "export const a = 2\n")
  git("commit", "-q", "-am", "change a")
  return { dir, r1, r2: git("rev-parse", "HEAD"), short2: git("log", "-1", "--format=%h") }
}

function pending(file: string, rev: string): PendingFact {
  const fact: AtlasFact = {
    key: `k-${file}-${rev}`,
    hash: "a".repeat(64),
    claim: "a claim",
    file,
    family: "advisory",
    tier: "T2",
    scope: "atlas:mined",
    derivedAt: rev.slice(0, 8),
    subtree: "",
    obvious: null,
    promoted: true,
    why: null,
    kind: null,
    authoring: null,
    storedFreshness: null,
    obviousBy: null,
    anchor: null,
    slot: null,
    seal: null,
    supersededBy: null,
    sameAs: null,
    provenance: null,
  }
  return { fact, rev }
}

describe("surface read-git — the git half of the snapshot", () => {
  it("adds drift only to a fact whose file changed since its rev, with extract.py's hunks, stat and commits", () => {
    const { dir, r1, r2, short2 } = twoCommits()
    const rows = [pending("src/a.ts", r1), pending("src/b.ts", r1), pending("src/a.ts", r2), pending("src/a.ts", "")]
    const out = withDrift(dir, rows)
    expect(out[0]?.drift).toEqual({
      hunks: [{ at: "-1 +1", lines: ["-export const a = 1", "+export const a = 2"] }],
      stat: "1 file changed, 1 insertion(+), 1 deletion(-)",
      commits: [[short2, "change a"]],
    })
    expect(out.slice(1).map((fact) => "drift" in fact)).toEqual([false, false, false])
    expect(out.map((fact) => fact.key)).toEqual(rows.map((row) => row.fact.key))
  })

  it("never passes a rev that is not a hex object name to git", () => {
    const { dir } = twoCommits()
    const out = withDrift(dir, [pending("src/a.ts", "--output=pwned"), pending("src/a.ts", "HEAD~1")])
    expect(out.map((fact) => "drift" in fact)).toEqual([false, false])
  })

  it("reads HEAD, the tracked files, the tracked store files, the language counts and the children tree", () => {
    const { dir, r2 } = twoCommits()
    expect(headShort(dir)).toBe(r2.slice(0, 8))
    const tracked = trackedFiles(dir)
    expect(tracked).toEqual([".atlas/cas/aa/aaaa", ".atlas/policy.json", ".atlas/projection.json", "README.md", "src/a.ts", "src/b.ts"])
    expect(trackedStore(dir)).toEqual({ projection: true, cas: 1, staging: false, policy: true, memory: false })
    expect(langCounts(tracked)).toEqual({ ts: 2 })
    expect(childrenOf(tracked)).toEqual({
      ".": [".atlas", "README.md", "src"],
      ".atlas": ["cas", "policy.json", "projection.json"],
      ".atlas/cas": ["aa"],
      ".atlas/cas/aa": ["aaaa"],
      src: ["a.ts", "b.ts"],
    })
  })

  it("counts extensions and builds children from paths alone", () => {
    expect(langCounts(["a.ts", "b.tsx", "c.d.ts", "d.md", ".sh", "e.sh", "f.mjs"])).toEqual({ ts: 2, tsx: 1, sh: 1, mjs: 1 })
    expect(childrenOf(["x/y/z.ts", "x/w.ts", "v"])).toEqual({ ".": ["v", "x"], x: ["w.ts", "y"], "x/y": ["z.ts"] })
  })

  it("reads a directory outside git as empty, and leaves every fact without drift", () => {
    const dir = tempDir()
    expect(headShort(dir)).toBe("")
    expect(trackedFiles(dir)).toEqual([])
    expect(trackedStore(dir)).toEqual({ projection: false, cas: 0, staging: false, policy: false, memory: false })
    const rev = "0123456789abcdef0123456789abcdef01234567"
    expect(withDrift(dir, [pending("src/a.ts", rev)]).map((fact) => "drift" in fact)).toEqual([false])
  })
})
